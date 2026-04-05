import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import pLimit from 'p-limit';
import { PrismaService } from '../../prisma/prisma.service';
import { RecommendationRedisService } from './recommendation-redis.service';
import { EVENT_WEIGHTS, applyTimeDecay } from '../constants/event-weights';
import {
  BATCH_SIZE,
  BATCH_PAUSE_MS,
  MAX_CONCURRENCY,
  DEFAULT_LOCALE,
  REPEAT_VIEW_THRESHOLD,
} from '../constants/defaults';

/** 25 hours TTL — slightly longer than the 24h cron cycle to avoid gaps */
const PROFILE_TTL = 25 * 60 * 60;

/** Lock TTL: 30 minutes max for the entire job */
const JOB_LOCK_TTL = 30 * 60;

const JOB_NAME = 'profile-builder';

const TOP_PRODUCTS_LIMIT = 50;

/**
 * Shopping flow names derived from Product.productType:
 * P = regular, R = RFQ, F = factory/wholesale, D = dropship
 */
const PRODUCT_TYPE_FLOW: Record<string, string> = {
  P: 'regular',
  R: 'rfq',
  F: 'wholesale',
  D: 'dropship',
};

interface BehaviorProfile {
  categories: Record<string, number>;
  brands: Record<string, number>;
  priceRange: { min: number; max: number; avg: number };
  shoppingFlows: Record<string, number>;
  topProducts: number[];
  locale: string;
  tradeRole: string;
  lastComputed: string;
}

@Injectable()
export class ProfileBuilderService {
  private readonly logger = new Logger(ProfileBuilderService.name);

  constructor(
    private prisma: PrismaService,
    private recRedis: RecommendationRedisService,
  ) {}

  /**
   * Runs daily at 01:00 AM — builds behavior profiles for all active users
   * and stores them in Redis for personalized recommendations.
   */
  @Cron('0 0 1 * * *')
  async buildProfiles(): Promise<void> {
    const start = Date.now();
    this.logger.log('Profile builder cron started');

    const locked = await this.recRedis.acquireLock(JOB_NAME, JOB_LOCK_TTL);
    if (!locked) {
      this.logger.warn('Profile builder skipped — another instance holds the lock');
      return;
    }

    try {
      const userIds = await this.getActiveUserIds();
      this.logger.log(`Found ${userIds.length} active users to process`);

      const limit = pLimit(MAX_CONCURRENCY);
      let processed = 0;

      for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
        const batch = userIds.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map((userId) =>
            limit(() => this.buildAndStoreProfile(userId)),
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
      await this.updateMetadata(userIds.length, duration);
      this.logger.log(
        `Profile builder completed: ${userIds.length} users in ${duration}ms`,
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Profile builder failed: ${err.message}`, err.stack);
    } finally {
      await this.recRedis.releaseLock(JOB_NAME);
    }
  }

  /**
   * Discover users with any activity (views, clicks, orders) in the last 90 days.
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

    const uniqueIds = new Set<number>();
    for (const r of [...viewUsers, ...clickUsers, ...orderUsers]) {
      if (r.userId) uniqueIds.add(r.userId);
    }
    return Array.from(uniqueIds);
  }

  /**
   * Build a full behavior profile for a single user and store it in Redis.
   */
  private async buildAndStoreProfile(userId: number): Promise<void> {
    try {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const now = Date.now();

      // Fetch all signals in parallel
      const [views, clicks, searches, orders, user] = await Promise.all([
        this.prisma.productView.findMany({
          where: { userId, lastViewedAt: { gte: ninetyDaysAgo } },
          select: {
            productId: true,
            viewCount: true,
            lastViewedAt: true,
            product: {
              select: { categoryId: true, brandId: true },
            },
          },
        }),
        this.prisma.productClick.findMany({
          where: { userId, createdAt: { gte: ninetyDaysAgo } },
          select: {
            productId: true,
            clickSource: true,
            createdAt: true,
            product: {
              select: { categoryId: true, brandId: true },
            },
          },
        }),
        this.prisma.productSearch.findMany({
          where: { userId, createdAt: { gte: ninetyDaysAgo } },
          select: {
            productId: true,
            clicked: true,
            createdAt: true,
            product: {
              select: { categoryId: true, brandId: true },
            },
          },
        }),
        this.prisma.orderProducts.findMany({
          where: { userId, createdAt: { gte: ninetyDaysAgo } },
          select: {
            productId: true,
            salePrice: true,
            createdAt: true,
            orderProduct_product: {
              select: {
                categoryId: true,
                brandId: true,
                productType: true,
              },
            },
          },
        }),
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { tradeRole: true },
        }),
      ]);

      const tradeRole = user?.tradeRole || 'BUYER';
      const locale = DEFAULT_LOCALE;

      const categoryScores: Record<string, number> = {};
      const brandScores: Record<string, number> = {};
      const productScores: Record<number, number> = {};
      const flowCounts: Record<string, number> = {};
      const prices: number[] = [];

      // --- Process views ---
      for (const v of views) {
        const days = this.daysSince(v.lastViewedAt, now);
        const isRepeat = v.viewCount >= REPEAT_VIEW_THRESHOLD;
        const baseWeight = isRepeat
          ? EVENT_WEIGHTS.product_view_repeat
          : EVENT_WEIGHTS.product_view;
        const score = applyTimeDecay(baseWeight, days);

        this.addScore(productScores, v.productId, score);
        if (v.product.categoryId) {
          this.addScore(categoryScores, String(v.product.categoryId), score);
        }
        if (v.product.brandId) {
          this.addScore(brandScores, String(v.product.brandId), score);
        }
      }

      // --- Process clicks ---
      for (const c of clicks) {
        const days = this.daysSince(c.createdAt, now);
        const weightKey =
          c.clickSource === 'recommendation'
            ? 'product_click_recommendation'
            : 'product_click_search';
        const score = applyTimeDecay(
          EVENT_WEIGHTS[weightKey] ?? EVENT_WEIGHTS.product_click_search,
          days,
        );

        this.addScore(productScores, c.productId, score);
        if (c.product.categoryId) {
          this.addScore(categoryScores, String(c.product.categoryId), score);
        }
        if (c.product.brandId) {
          this.addScore(brandScores, String(c.product.brandId), score);
        }
      }

      // --- Process searches (only those that led to a product interaction) ---
      for (const s of searches) {
        if (!s.productId || !s.product) continue;
        const days = this.daysSince(s.createdAt, now);
        const weight = s.clicked
          ? EVENT_WEIGHTS.product_click_search
          : EVENT_WEIGHTS.product_search;
        const score = applyTimeDecay(weight, days);

        this.addScore(productScores, s.productId, score);
        if (s.product.categoryId) {
          this.addScore(categoryScores, String(s.product.categoryId), score);
        }
        if (s.product.brandId) {
          this.addScore(brandScores, String(s.product.brandId), score);
        }
      }

      // --- Process orders ---
      for (const o of orders) {
        if (!o.productId) continue;
        const days = this.daysSince(o.createdAt, now);
        const score = applyTimeDecay(EVENT_WEIGHTS.order_complete, days);

        this.addScore(productScores, o.productId, score);

        const prod = o.orderProduct_product;
        if (prod?.categoryId) {
          this.addScore(categoryScores, String(prod.categoryId), score);
        }
        if (prod?.brandId) {
          this.addScore(brandScores, String(prod.brandId), score);
        }

        // Price range from sale prices
        if (o.salePrice) {
          prices.push(Number(o.salePrice));
        }

        // Shopping flow from product type
        if (prod?.productType) {
          const flow =
            PRODUCT_TYPE_FLOW[prod.productType] || 'regular';
          flowCounts[flow] = (flowCounts[flow] || 0) + 1;
        }
      }

      // --- Compute top products ---
      const topProducts = Object.entries(productScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_PRODUCTS_LIMIT)
        .map(([id]) => Number(id));

      // --- Compute price range ---
      const priceRange =
        prices.length > 0
          ? {
              min: Math.min(...prices),
              max: Math.max(...prices),
              avg:
                Math.round(
                  (prices.reduce((a, b) => a + b, 0) / prices.length) * 100,
                ) / 100,
            }
          : { min: 0, max: 0, avg: 0 };

      // --- Compute shopping flow percentages ---
      const totalFlows = Object.values(flowCounts).reduce(
        (a, b) => a + b,
        0,
      );
      const shoppingFlows: Record<string, number> = {};
      if (totalFlows > 0) {
        for (const [flow, count] of Object.entries(flowCounts)) {
          shoppingFlows[flow] =
            Math.round((count / totalFlows) * 10000) / 100;
        }
      }

      // --- Assemble and store profile ---
      const profile: BehaviorProfile = {
        categories: categoryScores,
        brands: brandScores,
        priceRange,
        shoppingFlows,
        topProducts,
        locale,
        tradeRole,
        lastComputed: new Date().toISOString(),
      };

      await this.recRedis.setJson(
        this.recRedis.keys.profile(userId),
        profile,
        PROFILE_TTL,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to build profile for user ${userId}: ${msg}`);
    }
  }

  // --- Helpers ---

  private daysSince(date: Date, nowMs: number): number {
    return (nowMs - date.getTime()) / (1000 * 60 * 60 * 24);
  }

  private addScore(
    map: Record<string | number, number>,
    key: string | number,
    score: number,
  ): void {
    map[key] = (map[key] || 0) + score;
  }

  private async updateMetadata(
    userCount: number,
    durationMs: number,
  ): Promise<void> {
    await Promise.all([
      this.recRedis.setMeta(
        this.recRedis.keys.metaLastRun,
        new Date().toISOString(),
      ),
      this.recRedis.setMeta(
        this.recRedis.keys.metaLastDuration,
        String(durationMs),
      ),
      this.recRedis.setMeta(
        this.recRedis.keys.metaUserCount,
        String(userCount),
      ),
    ]);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
