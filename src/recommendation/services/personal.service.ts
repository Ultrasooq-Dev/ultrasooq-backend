// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import pLimit from 'p-limit';
import { PrismaService } from '../../prisma/prisma.service';
import { RecommendationRedisService } from './recommendation-redis.service';
import {
  BATCH_SIZE,
  BATCH_PAUSE_MS,
  MAX_CONCURRENCY,
  COLD_START_TRENDING_BLEND,
} from '../constants/defaults';

/** 25 hours TTL — slightly longer than the 24h cron cycle to avoid gaps */
const PERSONAL_TTL = 25 * 60 * 60;

/** Lock TTL: 45 minutes max for the entire job */
const JOB_LOCK_TTL = 45 * 60;

const JOB_NAME = 'personal-recommendations';

/** Max candidates to pull from DB per user before scoring */
const CANDIDATE_LIMIT = 200;

/** Final top N personal recs to store */
const PERSONAL_TOP_N = 30;

/** Top K categories/brands from profile to use for candidate query */
const TOP_K = 5;

/** Fraction of final list filled with segment trending for diversity */
const TRENDING_BLEND = 1 - COLD_START_TRENDING_BLEND; // 0.2

/** Price proximity bounds */
const PRICE_LOWER = 0.5;
const PRICE_UPPER = 2.0;

/** Recency bonuses */
const RECENCY_14_DAYS = 1.0;
const RECENCY_30_DAYS = 0.5;

/** Already-viewed score multiplier */
const VIEWED_PENALTY = 0.5;

interface BehaviorProfile {
  categories: Record<string, number>;
  brands: Record<string, number>;
  priceRange: { min: number; max: number; avg: number };
  topProducts: number[];
  locale: string;
  tradeRole: string;
  vendorBusinessTypes?: Record<string, number>;
  preferredSellTypes?: Record<string, number>;
}

interface ScoredProduct {
  id: number;
  score: number;
}

@Injectable()
export class PersonalRecommendationService {
  private readonly logger = new Logger(PersonalRecommendationService.name);

  constructor(
    private prisma: PrismaService,
    private recRedis: RecommendationRedisService,
  ) {}

  /**
   * Runs daily at 03:30 AM — computes personalized product recommendations
   * for all users who have behavior profiles stored in Redis.
   */
  @Cron('0 30 3 * * *')
  async buildPersonalRecommendations(): Promise<void> {
    const start = Date.now();
    this.logger.log('Personal recommendations cron started');

    const locked = await this.recRedis.acquireLock(JOB_NAME, JOB_LOCK_TTL);
    if (!locked) {
      this.logger.warn(
        'Personal recommendations skipped — another instance holds the lock',
      );
      return;
    }

    try {
      const userIds = await this.getActiveUserIds();
      this.logger.log(`Found ${userIds.length} users with behavior activity`);

      const limit = pLimit(MAX_CONCURRENCY);
      let processed = 0;

      for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
        const batch = userIds.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map((userId) =>
            limit(() => this.buildAndStorePersonalRecs(userId)),
          ),
        );

        processed += batch.length;
        this.logger.log(`Processed ${processed}/${userIds.length} users`);

        // Pause between batches to reduce DB pressure
        if (i + BATCH_SIZE < userIds.length) {
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
        this.recRedis.keys.metaUserCount,
        String(userIds.length),
      );

      this.logger.log(
        `Personal recommendations completed: ${userIds.length} users in ${duration}ms`,
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(
        `Personal recommendations failed: ${err.message}`,
        err.stack,
      );
    } finally {
      await this.recRedis.releaseLock(JOB_NAME);
    }
  }

  /**
   * Discover all users who have any behavior activity (views, clicks, orders).
   * Mirrors the profile-builder query so we only process users with profiles.
   */
  private async getActiveUserIds(): Promise<number[]> {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const [viewUsers, clickUsers, orderUsers] = await Promise.all([
      this.prisma.productView.findMany({
        where: { userId: { not: null }, lastViewedAt: { gte: ninetyDaysAgo } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.productClick.findMany({
        where: { userId: { not: null }, createdAt: { gte: ninetyDaysAgo } },
        select: { userId: true },
        distinct: ['userId'],
      }),
      this.prisma.orderProducts.findMany({
        where: { userId: { not: null }, createdAt: { gte: ninetyDaysAgo } },
        select: { userId: true },
        distinct: ['userId'],
      }),
    ]);

    const uniqueIds = new Set<string>();
    for (const r of [...viewUsers, ...clickUsers, ...orderUsers]) {
      if (r.userId) uniqueIds.add(r.userId);
    }
    return Array.from(uniqueIds);
  }

  /**
   * Build and store personalized recommendations for a single user.
   */
  private async buildAndStorePersonalRecs(userId: number): Promise<void> {
    try {
      // Step 1: Read behavior profile from Redis
      const profile = await this.recRedis.getJson<BehaviorProfile>(
        this.recRedis.keys.profile(userId),
      );

      // No profile means the profile-builder hasn't run yet for this user — skip
      if (!profile) return;

      // Step 2: Get top 5 categories and brands by score
      const topCategoryIds = this.topKKeys(profile.categories, TOP_K).map(Number);
      const topBrandIds = this.topKKeys(profile.brands, TOP_K).map(Number);

      if (topCategoryIds.length === 0 && topBrandIds.length === 0) return;

      // Step 3: Fetch already-purchased and in-cart product IDs to exclude
      const [purchasedIds, cartIds, viewedIds] = await Promise.all([
        this.getPurchasedProductIds(userId),
        this.getCartProductIds(userId),
        this.getViewedProductIds(userId),
      ]);

      const excludeIds = new Set<number>([...purchasedIds, ...cartIds]);

      // Step 4: Query candidate products matching top categories OR brands
      const candidateFilter: {
        OR: Array<{ categoryId?: { in: number[] }; brandId?: { in: number[] } }>;
        id?: { notIn: number[] };
      } = {
        OR: [],
      };

      if (topCategoryIds.length > 0) {
        candidateFilter.OR.push({ categoryId: { in: topCategoryIds } });
      }
      if (topBrandIds.length > 0) {
        candidateFilter.OR.push({ brandId: { in: topBrandIds } });
      }

      if (excludeIds.size > 0) {
        candidateFilter.id = { notIn: Array.from(excludeIds) };
      }

      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const candidates = await this.prisma.product.findMany({
        where: {
          ...candidateFilter,
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: {
          id: true,
          categoryId: true,
          brandId: true,
          productPrice: true,
          createdAt: true,
          userId: true,
          product_productPrice: {
            where: { status: 'ACTIVE', deletedAt: null },
            select: { sellType: true, adminId: true },
            take: 5,
          },
        },
        take: CANDIDATE_LIMIT,
      });

      // Step 5: Batch-fetch seller business types for vendor-aware scoring
      const allSellerIds = new Set<string>();
      for (const c of candidates) {
        if (c.userId) allSellerIds.add(c.userId);
        for (const pp of c.product_productPrice) {
          if (pp.adminId) allSellerIds.add(pp.adminId);
        }
      }

      const sellerBTypeMap = new Map<number, number[]>();
      if (allSellerIds.size > 0) {
        const rows = await this.prisma.userProfileBusinessType.findMany({
          where: {
            userId: { in: Array.from(allSellerIds) },
            status: 'ACTIVE',
            deletedAt: null,
          },
          select: { userId: true, businessTypeId: true },
        });
        for (const r of rows) {
          const arr = sellerBTypeMap.get(r.userId) ?? [];
          arr.push(r.businessTypeId);
          sellerBTypeMap.set(r.userId, arr);
        }
      }

      // Precompute user's preferred vendor business types and sell types
      const userVendorBTypes = profile.vendorBusinessTypes ?? {};
      const userSellTypes = profile.preferredSellTypes ?? {};
      const hasVendorPrefs = Object.keys(userVendorBTypes).length > 0;
      const hasSellTypePrefs = Object.keys(userSellTypes).length > 0;

      // Step 6: Score each candidate
      const viewedSet = new Set(viewedIds);
      const avgPrice = profile.priceRange.avg;

      const scored: ScoredProduct[] = candidates.map((product) => {
        let score = 0;

        // Category affinity
        if (product.categoryId) {
          const catScore = profile.categories[String(product.categoryId)] ?? 0;
          score += catScore * 1.5;
        }

        // Brand affinity
        if (product.brandId) {
          const brandScore = profile.brands[String(product.brandId)] ?? 0;
          score += brandScore * 1.0;
        }

        // Price proximity bonus: within 0.5x-2.0x of avg price
        if (avgPrice > 0 && product.productPrice) {
          const price = Number(product.productPrice);
          if (price > 0) {
            const ratio = price / avgPrice;
            if (ratio >= PRICE_LOWER && ratio <= PRICE_UPPER) {
              score += 1.0;
            }
          }
        }

        // Recency bonus
        if (product.createdAt >= fourteenDaysAgo) {
          score += RECENCY_14_DAYS;
        } else if (product.createdAt >= thirtyDaysAgo) {
          score += RECENCY_30_DAYS;
        }

        // Vendor business type match: +1.0 if seller's business type overlaps
        if (hasVendorPrefs) {
          const productBTypes = new Set<string>();
          if (product.userId) {
            for (const bt of sellerBTypeMap.get(product.userId) ?? []) {
              productBTypes.add(bt);
            }
          }
          for (const pp of product.product_productPrice) {
            if (pp.adminId) {
              for (const bt of sellerBTypeMap.get(pp.adminId) ?? []) {
                productBTypes.add(bt);
              }
            }
          }
          for (const btId of productBTypes) {
            if (userVendorBTypes[String(btId)]) {
              score += 1.0;
              break;
            }
          }
        }

        // Sell type match: +1.0 if product has a sell type the user prefers
        if (hasSellTypePrefs) {
          for (const pp of product.product_productPrice) {
            if (pp.sellType && userSellTypes[pp.sellType]) {
              score += 1.0;
              break;
            }
          }
        }

        // Already-viewed penalty
        if (viewedSet.has(product.id)) {
          score *= VIEWED_PENALTY;
        }

        return { id: product.id, score };
      });

      // Step 7: Sort and take top 30
      scored.sort((a, b) => b.score - a.score);
      const personalTop = scored.slice(0, PERSONAL_TOP_N).map((s) => s.id);

      // Step 8: Blend in 20% segment trending for diversity
      const trendingCount = Math.ceil(PERSONAL_TOP_N * TRENDING_BLEND);
      const personalCount = PERSONAL_TOP_N - trendingCount;

      const trendingIds = await this.getSegmentTrending(
        profile.locale,
        profile.tradeRole,
        excludeIds,
        trendingCount,
      );

      // Merge: personal recs first, then trending fill (deduplicated)
      const personalSlice = personalTop.slice(0, personalCount);
      const personalSet = new Set(personalSlice);
      const trendingFill = trendingIds
        .filter((id) => !personalSet.has(id))
        .slice(0, trendingCount);

      const finalIds = [...personalSlice, ...trendingFill];

      if (finalIds.length > 0) {
        await this.recRedis.setIdList(
          this.recRedis.keys.personal(userId),
          finalIds,
          PERSONAL_TTL,
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to build personal recs for user ${userId}: ${msg}`,
      );
    }
  }

  /**
   * Get product IDs the user has purchased (excluding cancelled orders).
   */
  private async getPurchasedProductIds(userId: number): Promise<number[]> {
    const orders = await this.prisma.orderProducts.findMany({
      where: {
        userId,
        productId: { not: null },
        orderProductStatus: { not: 'CANCELLED' },
      },
      select: { productId: true },
      distinct: ['productId'],
    });
    return orders.map((o) => o.productId).filter((id): id is string => id !== null);
  }

  /**
   * Get product IDs currently in the user's active cart.
   */
  private async getCartProductIds(userId: number): Promise<number[]> {
    const cartItems = await this.prisma.cart.findMany({
      where: {
        userId,
        productId: { not: null },
        deletedAt: null,
        status: { not: 'DELETE' },
      },
      select: { productId: true },
      distinct: ['productId'],
    });
    return cartItems
      .map((c) => c.productId)
      .filter((id): id is string => id !== null);
  }

  /**
   * Get product IDs the user has previously viewed.
   */
  private async getViewedProductIds(userId: number): Promise<number[]> {
    const views = await this.prisma.productView.findMany({
      where: { userId },
      select: { productId: true },
    });
    return views.map((v) => v.productId);
  }

  /**
   * Fetch segment trending IDs from Redis, excluding already-excluded products.
   */
  private async getSegmentTrending(
    locale: string,
    tradeRole: string,
    excludeIds: Set<number>,
    limit: number,
  ): Promise<number[]> {
    const trendingKey = this.recRedis.keys.segTrending(locale, tradeRole);
    const trending = await this.recRedis.getIdList(trendingKey);
    if (!trending) return [];

    return trending.filter((id) => !excludeIds.has(id)).slice(0, limit);
  }

  /**
   * Return the top K keys from a score map, sorted descending by score.
   */
  private topKKeys(map: Record<string, number>, k: number): string[] {
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([key]) => key);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}