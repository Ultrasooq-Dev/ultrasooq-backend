import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { RecommendationRedisService } from './recommendation-redis.service';

@Injectable()
export class SelfTuneService {
  private readonly logger = new Logger(SelfTuneService.name);

  constructor(
    private prisma: PrismaService,
    private recRedis: RecommendationRedisService,
  ) {}

  @Cron('0 0 5 1 * *') // 1st of month at 05:00
  async autoTuneWeights(): Promise<void> {
    const lockAcquired = await this.recRedis.acquireLock('self-tune', 600);
    if (!lockAcquired) return;

    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const metrics = await this.prisma.recommendationMetric.findMany({
        where: { date: { gte: thirtyDaysAgo } },
      });

      // Aggregate by algorithm
      const algPerformance: Record<string, { impressions: number; clicks: number; purchases: number; revenue: number }> = {};
      for (const m of metrics) {
        if (!algPerformance[m.algorithm]) {
          algPerformance[m.algorithm] = { impressions: 0, clicks: 0, purchases: 0, revenue: 0 };
        }
        const a = algPerformance[m.algorithm];
        a.impressions += m.impressions;
        a.clicks += m.clicks;
        a.purchases += m.purchases;
        a.revenue += Number(m.revenue);
      }

      // Compute conversion rates
      const conversionRates: Record<string, number> = {};
      for (const [algo, data] of Object.entries(algPerformance)) {
        conversionRates[algo] = data.impressions > 0
          ? data.purchases / data.impressions
          : 0;
      }

      // Suggest blend weights proportional to conversion rate
      const totalConversion = Object.values(conversionRates).reduce((a, b) => a + b, 0) || 1;
      const suggestedWeights: Record<string, number> = {};
      for (const [algo, rate] of Object.entries(conversionRates)) {
        suggestedWeights[algo] = Math.round((rate / totalConversion) * 100) / 100;
      }

      // Store suggestion (NOT auto-applied)
      await this.recRedis.setJson('rec:config:suggested_weights', {
        weights: suggestedWeights,
        basedOn: algPerformance,
        conversionRates,
        suggestedAt: new Date().toISOString(),
      });

      this.logger.log(`Self-tune suggested weights: ${JSON.stringify(suggestedWeights)}`);
    } finally {
      await this.recRedis.releaseLock('self-tune');
    }
  }
}
