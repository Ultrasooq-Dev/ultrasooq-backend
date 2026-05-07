// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { RecommendationRedisService } from './recommendation-redis.service';
import { BATCH_PAUSE_MS } from '../constants/defaults';

/** Lock TTL: 45 minutes max for the entire trending job */
const TRENDING_LOCK_TTL = 45 * 60;

const JOB_NAME = 'trending-service';

const KNOWN_LOCALES = ['en', 'ar', 'de', 'fr', 'es', 'zh'];

@Injectable()
export class TrendingService {
  private readonly logger = new Logger(TrendingService.name);

  constructor(
    private prisma: PrismaService,
    private recRedis: RecommendationRedisService,
  ) {}

  /**
   * Runs daily at 01:30 AM — computes trending products per locale+tradeRole segment.
   */
  @Cron('0 30 1 * * *')
  async computeTrendingDaily(): Promise<void> {
    this.logger.log('Trending service daily cron started');
    await this.runTrendingJob();
  }

  /**
   * Refreshes trending every 6 hours for freshness.
   */
  @Cron('0 0 */6 * * *')
  async computeTrendingEvery6Hours(): Promise<void> {
    this.logger.log('Trending service 6-hour refresh started');
    await this.runTrendingJob();
  }

  private async runTrendingJob(): Promise<void> {
    const start = Date.now();

    const locked = await this.recRedis.acquireLock(JOB_NAME, TRENDING_LOCK_TTL);
    if (!locked) {
      this.logger.warn('Trending service skipped — another instance holds the lock');
      return;
    }

    // Auto-extend lock every 10 minutes if job is still running
    const lockExtender = setInterval(async () => {
      const extended = await this.recRedis.extendLock(JOB_NAME, TRENDING_LOCK_TTL);
      if (extended) this.logger.log('Trending lock extended — job still running');
    }, 10 * 60 * 1000);

    try {
      const segments = await this.getActiveSegments();
      this.logger.log(`Found ${segments.length} segments to process`);

      let processed = 0;
      for (const segment of segments) {
        await this.computeForSegment(segment);
        processed++;

        if (processed % 10 === 0) {
          this.logger.log(`Processed ${processed}/${segments.length} segments`);
        }

        // Pause between segments to reduce DB pressure
        if (processed < segments.length) {
          await this.sleep(BATCH_PAUSE_MS);
        }
      }

      const duration = Date.now() - start;
      this.logger.log(
        `Trending service completed: ${segments.length} segments in ${duration}ms`,
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Trending service failed: ${err.message}`, err.stack);
    } finally {
      clearInterval(lockExtender);
      await this.recRedis.releaseLock(JOB_NAME);
    }
  }

  /**
   * Discover active segments from User.tradeRole × known locales.
   * Since locale preference is resolved at API time (not stored per user),
   * we cross-product each distinct tradeRole with all supported locales.
   */
  async getActiveSegments(): Promise<{ locale: string; tradeRole: string }[]> {
    const roles = await this.prisma.user.findMany({
      where: { tradeRole: { not: null }, deletedAt: null },
      select: { tradeRole: true },
      distinct: ['tradeRole'],
    });

    return roles.flatMap((r) =>
      KNOWN_LOCALES.map((l) => ({ locale: l, tradeRole: r.tradeRole! })),
    );
  }

  /**
   * Compute trending products for a single locale+tradeRole segment.
   * Merges signals: views × 1 + clicks × 2 + orders × 5
   * Stores top 100 globally and top 20 per category in Redis.
   */
  private async computeForSegment(segment: {
    locale: string;
    tradeRole: string;
  }): Promise<void> {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Get users in this segment (tradeRole only — locale is resolved at API time)
      const segmentUsers = await this.prisma.user.findMany({
        where: { tradeRole: segment.tradeRole as any, deletedAt: null },
        select: { id: true },
      });
      const userIds = segmentUsers.map((u) => u.id);
      if (userIds.length === 0) return;

      // Fetch view, click, and order counts for segment users in last 7 days
      const [views, clicks, orders] = await Promise.all([
        this.prisma.productView.groupBy({
          by: ['productId'],
          where: {
            userId: { in: userIds },
            lastViewedAt: { gte: sevenDaysAgo },
          },
          _count: { productId: true },
          orderBy: { _count: { productId: 'desc' } },
          take: 200,
        }),
        this.prisma.productClick.groupBy({
          by: ['productId'],
          where: {
            userId: { in: userIds },
            createdAt: { gte: sevenDaysAgo },
          },
          _count: { productId: true },
        }),
        this.prisma.orderProducts.groupBy({
          by: ['productId'],
          where: {
            userId: { in: userIds },
            createdAt: { gte: sevenDaysAgo },
            orderProductStatus: { notIn: ['CANCELLED'] as any },
            productId: { not: null },
          },
          _count: { productId: true },
        }),
      ]);

      // Merge scores: views×1 + clicks×2 + orders×5
      const scoreMap = new Map<number, number>();

      for (const v of views) {
        scoreMap.set(v.productId, (scoreMap.get(v.productId) ?? 0) + (v._count.productId || 0) * 1.0);
      }
      for (const c of clicks) {
        scoreMap.set(c.productId, (scoreMap.get(c.productId) ?? 0) + (c._count.productId || 0) * 2.0);
      }
      for (const o of orders) {
        if (!o.productId) continue;
        scoreMap.set(o.productId, (scoreMap.get(o.productId) ?? 0) + (o._count.productId || 0) * 5.0);
      }

      if (scoreMap.size === 0) return;

      // Filter to only ACTIVE, non-deleted products and fetch categoryId
      const productIds = Array.from(scoreMap.keys());
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds }, status: 'ACTIVE', deletedAt: null },
        select: { id: true, categoryId: true },
      });

      // Sort by score descending
      const activeProducts = products
        .map((p) => ({
          productId: p.id,
          categoryId: p.categoryId,
          score: scoreMap.get(p.id) ?? 0,
        }))
        .sort((a, b) => b.score - a.score);

      // Store top 100 globally for this segment
      const top100Ids = activeProducts.slice(0, 100).map((p) => p.productId);
      await this.recRedis.setIdList(
        this.recRedis.keys.segTrending(segment.locale, segment.tradeRole),
        top100Ids,
      );

      // Store top 20 per category for this segment
      const byCategory = new Map<number, number[]>();
      for (const p of activeProducts) {
        if (!p.categoryId) continue;
        const list = byCategory.get(p.categoryId) ?? [];
        if (list.length < 20) {
          list.push(p.productId);
          byCategory.set(p.categoryId, list);
        }
      }
      for (const [catId, ids] of byCategory) {
        await this.recRedis.setIdList(
          this.recRedis.keys.segTrendingCat(segment.locale, segment.tradeRole, catId),
          ids,
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to compute trending for segment ${segment.locale}:${segment.tradeRole} — ${msg}`,
      );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}