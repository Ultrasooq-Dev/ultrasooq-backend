// @ts-nocheck
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

/** Cache TTL for vendor business type lookups (1 hour) */
const VENDOR_BTYPE_TTL = 60 * 60;

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
   *   - Same category:            +3.0
   *   - Same brand:               +2.0
   *   - Price within 20% range:   +2.0
   *   - Overlapping vendor btype: +1.5
   *   - Matching sell type:       +1.0
   */
  computeSimilarityScore(
    base: {
      categoryId: number | null;
      brandId: number | null;
      productPrice: number;
      vendorBTypes?: number[];
      sellTypes?: string[];
    },
    candidate: {
      categoryId: number | null;
      brandId: number | null;
      productPrice: number;
      vendorBTypes?: number[];
      sellTypes?: string[];
    },
  ): number {
    let score = 0;
    if (base.categoryId && candidate.categoryId === base.categoryId) score += 3.0;
    if (base.brandId && candidate.brandId === base.brandId) score += 2.0;
    if (base.productPrice && candidate.productPrice) {
      const ratio = candidate.productPrice / base.productPrice;
      if (ratio >= 0.8 && ratio <= 1.2) score += 2.0;
    }

    // Vendor business type overlap
    if (base.vendorBTypes?.length && candidate.vendorBTypes?.length) {
      const baseSet = new Set(base.vendorBTypes);
      const hasOverlap = candidate.vendorBTypes.some((bt) => baseSet.has(bt));
      if (hasOverlap) score += 1.5;
    }

    // Sell type overlap
    if (base.sellTypes?.length && candidate.sellTypes?.length) {
      const baseSet = new Set(base.sellTypes);
      const hasOverlap = candidate.sellTypes.some((st) => baseSet.has(st));
      if (hasOverlap) score += 1.0;
    }

    return score;
  }

  /**
   * Real-time fallback for long-tail products not in the precomputed cache.
   * Queries DB directly, ordered by view count.
   */
  async findSimilarRealtime(productId: string, limit = SIMILAR_LIMIT): Promise<number[]> {
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
   * Get the top N most-viewed active products with seller and sell-type data.
   */
  private async getTopViewedProducts(limit: number) {
    return this.prisma.product.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      select: {
        id: true,
        categoryId: true,
        brandId: true,
        productPrice: true,
        userId: true,
        product_productPrice: {
          where: { status: 'ACTIVE', deletedAt: null },
          select: { sellType: true, adminId: true },
          take: 10,
        },
      },
      orderBy: { productViewCount: 'desc' },
      take: limit,
    });
  }

  /**
   * Find the top 15 most similar products to the given product using attribute + vendor scoring.
   * Returns an empty array if the product has no categoryId.
   */
  private async findSimilar(product: {
    id: number;
    categoryId: number | null;
    brandId: number | null;
    productPrice: any;
    userId?: number | null;
    product_productPrice?: Array<{ sellType: string | null; adminId: number | null }>;
  }): Promise<number[]> {
    if (!product.categoryId) return [];

    const candidates = await this.prisma.product.findMany({
      where: {
        id: { not: product.id },
        categoryId: product.categoryId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
        categoryId: true,
        brandId: true,
        productPrice: true,
        userId: true,
        product_productPrice: {
          where: { status: 'ACTIVE', deletedAt: null },
          select: { sellType: true, adminId: true },
          take: 10,
        },
      },
      take: 100,
    });

    // Collect all seller IDs to batch-fetch business types
    const allSellerIds = new Set<string>();
    if (product.userId) allSellerIds.add(product.userId);
    for (const c of candidates) {
      if (c.userId) allSellerIds.add(c.userId);
      for (const pp of c.product_productPrice) {
        if (pp.adminId) allSellerIds.add(pp.adminId);
      }
    }
    if (product.product_productPrice) {
      for (const pp of product.product_productPrice) {
        if (pp.adminId) allSellerIds.add(pp.adminId);
      }
    }

    // Batch-fetch vendor business types (check Redis cache first, then DB)
    const sellerBTypeMap = await this.getSellerBusinessTypeMap(
      Array.from(allSellerIds),
    );

    // Helper to get all business type IDs for a product's sellers
    const getProductVendorBTypes = (p: {
      userId?: number | null;
      product_productPrice?: Array<{ adminId: number | null }>;
    }): number[] => {
      const bTypes = new Set<string>();
      if (p.userId) {
        for (const bt of sellerBTypeMap.get(p.userId) ?? []) bTypes.add(bt);
      }
      if (p.product_productPrice) {
        for (const pp of p.product_productPrice) {
          if (pp.adminId) {
            for (const bt of sellerBTypeMap.get(pp.adminId) ?? []) bTypes.add(bt);
          }
        }
      }
      return Array.from(bTypes);
    };

    const getSellTypes = (
      pps?: Array<{ sellType: string | null }>,
    ): string[] => {
      if (!pps) return [];
      const types = new Set<string>();
      for (const pp of pps) {
        if (pp.sellType) types.add(pp.sellType);
      }
      return Array.from(types);
    };

    const basePrice = Number(product.productPrice) || 0;
    const baseVendorBTypes = getProductVendorBTypes(product);
    const baseSellTypes = getSellTypes(product.product_productPrice);

    const scored = candidates.map((c) => ({
      id: c.id,
      score: this.computeSimilarityScore(
        {
          categoryId: product.categoryId,
          brandId: product.brandId,
          productPrice: basePrice,
          vendorBTypes: baseVendorBTypes,
          sellTypes: baseSellTypes,
        },
        {
          categoryId: c.categoryId,
          brandId: c.brandId,
          productPrice: Number(c.productPrice) || 0,
          vendorBTypes: getProductVendorBTypes(c),
          sellTypes: getSellTypes(c.product_productPrice),
        },
      ),
    }));

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, SIMILAR_LIMIT)
      .map((s) => s.id);
  }

  /**
   * Batch-fetch business type tag IDs for a list of seller user IDs.
   * Caches each seller's business types in Redis for 1 hour.
   */
  private async getSellerBusinessTypeMap(
    sellerIds: number[],
  ): Promise<Map<number, number[]>> {
    const map = new Map<number, number[]>();
    if (sellerIds.length === 0) return map;

    // Try Redis cache first
    const cacheKeys = sellerIds.map((id) =>
      this.recRedis.keys.vendorBusinessTypes(id),
    );
    const cached = await this.recRedis.mgetJson<number[]>(cacheKeys);

    const missingIds: number[] = [];
    for (let i = 0; i < sellerIds.length; i++) {
      if (cached[i]) {
        map.set(sellerIds[i], cached[i]!);
      } else {
        missingIds.push(sellerIds[i]);
      }
    }

    // Fetch missing from DB
    if (missingIds.length > 0) {
      const rows = await this.prisma.userProfileBusinessType.findMany({
        where: {
          userId: { in: missingIds },
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: { userId: true, businessTypeId: true },
      });

      const dbMap = new Map<number, number[]>();
      for (const r of rows) {
        const arr = dbMap.get(r.userId) ?? [];
        arr.push(r.businessTypeId);
        dbMap.set(r.userId, arr);
      }

      // Cache results and fill map
      for (const sellerId of missingIds) {
        const bTypes = dbMap.get(sellerId) ?? [];
        map.set(sellerId, bTypes);
        await this.recRedis.setJson(
          this.recRedis.keys.vendorBusinessTypes(sellerId),
          bTypes,
          VENDOR_BTYPE_TTL,
        );
      }
    }

    return map;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}