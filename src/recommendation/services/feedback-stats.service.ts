import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { RecommendationRedisService } from './recommendation-redis.service';

@Injectable()
export class FeedbackStatsService {
  private readonly logger = new Logger(FeedbackStatsService.name);

  constructor(
    private prisma: PrismaService,
    private recRedis: RecommendationRedisService,
  ) {}

  @Cron('0 0 4 * * *') // 04:00 daily
  async computeFeedbackStats(): Promise<void> {
    const lockAcquired = await this.recRedis.acquireLock('feedback-stats', 600);
    if (!lockAcquired) return;

    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date(yesterday);
      today.setDate(today.getDate() + 1);

      // Get yesterday's feedback grouped by algorithm + placement
      const feedback = await this.prisma.recommendationFeedback.groupBy({
        by: ['algorithm', 'placement', 'action'],
        where: {
          createdAt: { gte: yesterday, lt: today },
        },
        _count: { id: true },
      });

      // Pivot into metrics by algorithm+placement
      const metricMap = new Map<string, {
        algorithm: string; placement: string;
        impressions: number; clicks: number; cartAdds: number; purchases: number;
      }>();

      for (const f of feedback) {
        const key = `${f.algorithm}:${f.placement}`;
        if (!metricMap.has(key)) {
          metricMap.set(key, {
            algorithm: f.algorithm,
            placement: f.placement,
            impressions: 0, clicks: 0, cartAdds: 0, purchases: 0,
          });
        }
        const m = metricMap.get(key)!;
        const count = f._count.id;
        switch (f.action) {
          case 'impression': m.impressions += count; break;
          case 'click': m.clicks += count; break;
          case 'cart': m.cartAdds += count; break;
          case 'purchase': m.purchases += count; break;
        }
      }

      // Upsert into RecommendationMetric table
      for (const m of metricMap.values()) {
        await this.prisma.recommendationMetric.upsert({
          where: {
            date_algorithm_placement_segment_experiment: {
              date: yesterday,
              algorithm: m.algorithm,
              placement: m.placement,
              segment: 'all', // simplified for now
              experiment: null as any,
            },
          },
          update: {
            impressions: m.impressions,
            clicks: m.clicks,
            cartAdds: m.cartAdds,
            purchases: m.purchases,
          },
          create: {
            date: yesterday,
            algorithm: m.algorithm,
            placement: m.placement,
            segment: 'all',
            impressions: m.impressions,
            clicks: m.clicks,
            cartAdds: m.cartAdds,
            purchases: m.purchases,
          },
        });
      }

      this.logger.log(`Feedback stats computed for ${metricMap.size} algorithm-placement combinations`);
    } finally {
      await this.recRedis.releaseLock('feedback-stats');
    }
  }
}
