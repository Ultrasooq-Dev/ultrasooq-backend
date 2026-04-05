import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import pLimit from 'p-limit';
import { PrismaService } from '../../prisma/prisma.service';
import { RecommendationRedisService } from './recommendation-redis.service';
import {
  COBUY_TOP_PRODUCTS,
  BATCH_SIZE,
  BATCH_PAUSE_MS,
  MAX_CONCURRENCY,
} from '../constants/defaults';

/** 25 hours TTL — slightly longer than the 24h cron cycle to avoid gaps */
const COBUY_TTL = 25 * 60 * 60;

/** Lock TTL: 45 minutes max for the entire job (larger dataset than similarity) */
const JOB_LOCK_TTL = 45 * 60;

const JOB_NAME = 'cobuy-builder';

/** Max co-purchased product IDs to store per product */
const COBUY_LIMIT = 20;

/** Look-back window for order data (90 days) */
const LOOKBACK_DAYS = 90;

@Injectable()
export class CollaborativeService {
  private readonly logger = new Logger(CollaborativeService.name);

  constructor(
    private prisma: PrismaService,
    private recRedis: RecommendationRedisService,
  ) {}

  /**
   * Runs daily at 02:15 AM — computes co-purchased products for the top 5000
   * most-ordered products using collaborative filtering on OrderProducts data.
   * Stores top-20 co-purchased product IDs per product in Redis.
   */
  @Cron('0 15 2 * * *')
  async buildCoBought(): Promise<void> {
    const start = Date.now();
    this.logger.log('Co-buy collaborative filtering cron started');

    const locked = await this.recRedis.acquireLock(JOB_NAME, JOB_LOCK_TTL);
    if (!locked) {
      this.logger.warn('Co-buy builder skipped — another instance holds the lock');
      return;
    }

    try {
      const topProducts = await this.getTopOrderedProducts(COBUY_TOP_PRODUCTS);
      this.logger.log(`Found ${topProducts.length} products to compute co-buy for`);

      const limit = pLimit(MAX_CONCURRENCY);
      let processed = 0;

      for (let i = 0; i < topProducts.length; i += BATCH_SIZE) {
        const batch = topProducts.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map((product) =>
            limit(async () => {
              const coBoughtIds = await this.findCoBought(product.id);
              if (coBoughtIds.length > 0) {
                await this.recRedis.setIdList(
                  this.recRedis.keys.cobought(product.id),
                  coBoughtIds,
                  COBUY_TTL,
                );
              }
            }),
          ),
        );

        processed += batch.length;
        this.logger.log(`Processed ${processed}/${topProducts.length} products`);

        // Pause between batches to reduce DB pressure
        if (i + BATCH_SIZE < topProducts.length) {
          await this.sleep(BATCH_PAUSE_MS);
        }
      }

      const duration = Date.now() - start;
      await this.recRedis.setMeta(
        this.recRedis.keys.metaLastRun,
        new Date().toISOString(),
      );
      await this.recRedis.setMeta(
        this.recRedis.keys.metaLastDuration,
        String(duration),
      );
      await this.recRedis.setMeta(
        this.recRedis.keys.metaProductCount,
        String(topProducts.length),
      );

      this.logger.log(
        `Co-buy builder completed: ${topProducts.length} products in ${duration}ms`,
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Co-buy builder failed: ${err.message}`, err.stack);
    } finally {
      await this.recRedis.releaseLock(JOB_NAME);
    }
  }

  /**
   * Real-time fallback for long-tail products not in the precomputed cache.
   * Returns the most-ordered products in the same category (two-step query —
   * groupBy does not support nested relation filters).
   */
  async findCoBoughtFallback(productId: number, limit = COBUY_LIMIT): Promise<number[]> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, categoryId: true },
    });
    if (!product?.categoryId) return [];

    // Step 1: get productIds in the same category
    const categoryProducts = await this.prisma.product.findMany({
      where: {
        categoryId: product.categoryId,
        id: { not: productId },
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true },
      take: 500,
    });

    if (categoryProducts.length === 0) return [];

    const categoryProductIds = categoryProducts.map((p) => p.id);

    // Step 2: find the most ordered among those products in the lookback window
    const since = new Date();
    since.setDate(since.getDate() - LOOKBACK_DAYS);

    const ordered = await this.prisma.orderProducts.groupBy({
      by: ['productId'],
      where: {
        productId: { in: categoryProductIds },
        orderProductStatus: { notIn: ['CANCELLED'] },
        createdAt: { gte: since },
      },
      _count: { productId: true },
      orderBy: { _count: { productId: 'desc' } },
      take: limit,
    });

    // Filter nulls (nullable productId) and return IDs
    return ordered
      .filter((row) => row.productId !== null)
      .map((row) => row.productId as number);
  }

  /**
   * Get the top N most-ordered active products in the last 90 days.
   */
  private async getTopOrderedProducts(topN: number): Promise<{ id: number }[]> {
    const since = new Date();
    since.setDate(since.getDate() - LOOKBACK_DAYS);

    // Step 1: get top productIds by order count via groupBy
    const topOrdered = await this.prisma.orderProducts.groupBy({
      by: ['productId'],
      where: {
        orderProductStatus: { notIn: ['CANCELLED'] },
        createdAt: { gte: since },
      },
      _count: { productId: true },
      orderBy: { _count: { productId: 'desc' } },
      take: topN * 2, // over-fetch to account for inactive/deleted products
    });

    const candidateIds = topOrdered
      .filter((row) => row.productId !== null)
      .map((row) => row.productId as number);

    if (candidateIds.length === 0) return [];

    // Step 2: filter to only ACTIVE, non-deleted products
    const activeProducts = await this.prisma.product.findMany({
      where: {
        id: { in: candidateIds },
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true },
      take: topN,
    });

    return activeProducts;
  }

  /**
   * Find the top co-purchased product IDs for a given product.
   * Looks up all orders containing this product, then finds other products
   * in those same orders, groups by frequency, and returns top COBUY_LIMIT IDs.
   */
  private async findCoBought(productId: number): Promise<number[]> {
    // Step 1: get all orderIds that contain this product (non-cancelled)
    const orderRows = await this.prisma.orderProducts.findMany({
      where: {
        productId,
        orderProductStatus: { notIn: ['CANCELLED'] },
        orderId: { not: null },
      },
      select: { orderId: true },
      distinct: ['orderId'],
    });

    const orderIds = orderRows
      .filter((r) => r.orderId !== null)
      .map((r) => r.orderId as number);

    if (orderIds.length === 0) return [];

    // Step 2: find other products in those same orders
    const coProducts = await this.prisma.orderProducts.groupBy({
      by: ['productId'],
      where: {
        orderId: { in: orderIds },
        orderProductStatus: { notIn: ['CANCELLED'] },
      },
      _count: { productId: true },
      orderBy: { _count: { productId: 'desc' } },
      take: COBUY_LIMIT + 5, // slight over-fetch to allow filtering
    });

    // Step 3: filter out null productIds and the source product in JavaScript
    const candidateIds = coProducts
      .filter((row) => row.productId !== null && row.productId !== productId)
      .map((row) => row.productId as number)
      .slice(0, COBUY_LIMIT);

    if (candidateIds.length === 0) return [];

    // Step 4: verify candidates are still ACTIVE
    const activeProducts = await this.prisma.product.findMany({
      where: {
        id: { in: candidateIds },
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true },
    });

    // Preserve the co-occurrence order
    const activeSet = new Set(activeProducts.map((p) => p.id));
    return candidateIds.filter((id) => activeSet.has(id));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
