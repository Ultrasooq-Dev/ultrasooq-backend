import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import pLimit from 'p-limit';
import { PrismaService } from '../../prisma/prisma.service';
import { RecommendationRedisService } from './recommendation-redis.service';
import {
  SIMILAR_TOP_PRODUCTS,
  BATCH_SIZE,
  BATCH_PAUSE_MS,
  MAX_CONCURRENCY,
} from '../constants/defaults';

/** 25 hours TTL — slightly longer than the 24h cron cycle to avoid gaps */
const SIMILAR_TTL = 25 * 60 * 60;

/** Lock TTL: 30 minutes max for the entire job */
const JOB_LOCK_TTL = 30 * 60;

const JOB_NAME = 'similarity-builder';

const SIMILAR_LIMIT = 15;

@Injectable()
export class SimilarityService {
  private readonly logger = new Logger(SimilarityService.name);

  constructor(
    private prisma: PrismaService,
    private recRedis: RecommendationRedisService,
  ) {}

  /**
   * Runs daily at 02:45 AM — computes similar products for the top 2000 most-viewed products
   * and stores top-15 similar product IDs per product in Redis.
   */
  @Cron('0 45 2 * * *')
  async buildSimilarity(): Promise<void> {
    const start = Date.now();
    this.logger.log('Similarity builder cron started');

    const locked = await this.recRedis.acquireLock(JOB_NAME, JOB_LOCK_TTL);
    if (!locked) {
      this.logger.warn('Similarity builder skipped — another instance holds the lock');
      return;
    }

    try {
      const topProducts = await this.getTopViewedProducts(SIMILAR_TOP_PRODUCTS);
      this.logger.log(`Found ${topProducts.length} products to compute similarity for`);

      const limit = pLimit(MAX_CONCURRENCY);
      let processed = 0;

      for (let i = 0; i < topProducts.length; i += BATCH_SIZE) {
        const batch = topProducts.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map((product) =>
            limit(async () => {
              const similarIds = await this.findSimilar(product);
              if (similarIds.length > 0) {
                await this.recRedis.setIdList(
                  this.recRedis.keys.similar(product.id),
                  similarIds,
                  SIMILAR_TTL,
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
        `Similarity builder completed: ${topProducts.length} products in ${duration}ms`,
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Similarity builder failed: ${err.message}`, err.stack);
    } finally {
      await this.recRedis.releaseLock(JOB_NAME);
    }
  }

  /**
   * Compute a similarity score between a base product and a candidate.
   * Score components:
   *   - Same category: +3.0
   *   - Same brand:    +2.0
   *   - Price within 20% range: +2.0
   */
  computeSimilarityScore(
    base: { categoryId: number | null; brandId: number | null; productPrice: number },
    candidate: { categoryId: number | null; brandId: number | null; productPrice: number },
  ): number {
    let score = 0;
    if (base.categoryId && candidate.categoryId === base.categoryId) score += 3.0;
    if (base.brandId && candidate.brandId === base.brandId) score += 2.0;
    if (base.productPrice && candidate.productPrice) {
      const ratio = candidate.productPrice / base.productPrice;
      if (ratio >= 0.8 && ratio <= 1.2) score += 2.0;
    }
    return score;
  }

  /**
   * Real-time fallback for long-tail products not in the precomputed cache.
   * Queries DB directly, ordered by view count.
   */
  async findSimilarRealtime(productId: number, limit = SIMILAR_LIMIT): Promise<number[]> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, categoryId: true },
    });
    if (!product?.categoryId) return [];

    const similar = await this.prisma.product.findMany({
      where: {
        id: { not: productId },
        categoryId: product.categoryId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true },
      orderBy: { productViewCount: 'desc' },
      take: limit,
    });
    return similar.map((p) => p.id);
  }

  /**
   * Get the top N most-viewed active products.
   */
  private async getTopViewedProducts(limit: number) {
    return this.prisma.product.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      select: {
        id: true,
        categoryId: true,
        brandId: true,
        productPrice: true,
      },
      orderBy: { productViewCount: 'desc' },
      take: limit,
    });
  }

  /**
   * Find the top 15 most similar products to the given product using attribute scoring.
   * Returns an empty array if the product has no categoryId.
   */
  private async findSimilar(product: {
    id: number;
    categoryId: number | null;
    brandId: number | null;
    productPrice: any;
  }): Promise<number[]> {
    if (!product.categoryId) return [];

    const candidates = await this.prisma.product.findMany({
      where: {
        id: { not: product.id },
        categoryId: product.categoryId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true, categoryId: true, brandId: true, productPrice: true },
      take: 100,
    });

    const basePrice = Number(product.productPrice) || 0;
    const scored = candidates.map((c) => ({
      id: c.id,
      score: this.computeSimilarityScore(
        { categoryId: product.categoryId, brandId: product.brandId, productPrice: basePrice },
        { categoryId: c.categoryId, brandId: c.brandId, productPrice: Number(c.productPrice) || 0 },
      ),
    }));

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, SIMILAR_LIMIT)
      .map((s) => s.id);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
