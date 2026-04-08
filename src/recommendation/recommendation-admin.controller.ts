import {
  Controller, Get, Put, Post, Body, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { SuperAdminAuthGuard } from '../guards/SuperAdminAuthGuard';
import { RecommendationRedisService } from './services/recommendation-redis.service';
import { FeedbackService } from './services/feedback.service';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('admin-recommendations')
@Controller('admin/recommendations')
@UseGuards(SuperAdminAuthGuard)
@SkipThrottle()
export class RecommendationAdminController {
  constructor(
    private recRedis: RecommendationRedisService,
    private feedback: FeedbackService,
    private prisma: PrismaService,
  ) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get recommendation performance stats' })
  async getStats(@Query('days') days?: string) {
    const daysBack = parseInt(days || '7', 10);
    const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

    const metrics = await this.prisma.recommendationMetric.findMany({
      where: { date: { gte: since } },
      orderBy: { date: 'desc' },
    });

    // Aggregate by algorithm
    const byAlgorithm: Record<string, { impressions: number; clicks: number; cartAdds: number; purchases: number; revenue: number }> = {};
    for (const m of metrics) {
      if (!byAlgorithm[m.algorithm]) {
        byAlgorithm[m.algorithm] = { impressions: 0, clicks: 0, cartAdds: 0, purchases: 0, revenue: 0 };
      }
      const agg = byAlgorithm[m.algorithm];
      agg.impressions += m.impressions;
      agg.clicks += m.clicks;
      agg.cartAdds += m.cartAdds;
      agg.purchases += m.purchases;
      agg.revenue += Number(m.revenue);
    }

    // Compute rates
    const algorithms = Object.entries(byAlgorithm).map(([algo, data]) => ({
      algorithm: algo,
      ...data,
      ctr: data.impressions > 0 ? Math.round((data.clicks / data.impressions) * 10000) / 100 : 0,
      conversionRate: data.impressions > 0 ? Math.round((data.purchases / data.impressions) * 10000) / 100 : 0,
    }));

    return { period: `${daysBack}d`, algorithms, raw: metrics };
  }

  @Get('config')
  @ApiOperation({ summary: 'Get recommendation configuration' })
  async getConfig() {
    const configs = await this.prisma.recommendationConfig.findMany();
    const configMap: Record<string, any> = {};
    for (const c of configs) {
      configMap[c.key] = c.value;
    }
    return configMap;
  }

  @Put('config')
  @ApiOperation({ summary: 'Update recommendation configuration' })
  async updateConfig(@Body() body: { key: string; value: any }, @Query('adminId') adminId?: string) {
    const result = await this.prisma.recommendationConfig.upsert({
      where: { key: body.key },
      update: { value: body.value, updatedBy: parseInt(adminId || '0', 10) },
      create: { key: body.key, value: body.value, updatedBy: parseInt(adminId || '0', 10) },
    });
    // Invalidate relevant Redis config cache
    if (body.key === 'weights') await this.recRedis.setJson(this.recRedis.keys.configWeights, null, 1);
    if (body.key === 'decay') await this.recRedis.setJson(this.recRedis.keys.configDecay, null, 1);
    if (body.key === 'toggles') await this.recRedis.setJson(this.recRedis.keys.configToggles, null, 1);
    return { ...result, cacheInvalidated: true };
  }

  @Get('health')
  @ApiOperation({ summary: 'Get recommendation system health' })
  async getHealth() {
    const [lastRun, lastDuration, productCount, userCount] = await Promise.all([
      this.recRedis.getMeta(this.recRedis.keys.metaLastRun),
      this.recRedis.getMeta(this.recRedis.keys.metaLastDuration),
      this.recRedis.getMeta(this.recRedis.keys.metaProductCount),
      this.recRedis.getMeta(this.recRedis.keys.metaUserCount),
    ]);

    const lastRunDate = lastRun ? new Date(lastRun) : null;
    const isStale = lastRunDate
      ? (Date.now() - lastRunDate.getTime()) > 26 * 60 * 60 * 1000 // >26h = stale
      : true;

    return {
      status: isStale ? 'STALE' : 'HEALTHY',
      lastRun,
      lastDurationSeconds: lastDuration ? parseInt(lastDuration, 10) : null,
      productsComputed: productCount ? parseInt(productCount, 10) : 0,
      usersComputed: userCount ? parseInt(userCount, 10) : 0,
      staleSince: isStale && lastRunDate ? lastRunDate.toISOString() : null,
    };
  }

  @Post('recompute')
  @ApiOperation({ summary: 'Trigger manual recomputation' })
  async recompute() {
    // This is a placeholder — in production, this would trigger the cron jobs
    // For now, return a status indicating the request was received
    return {
      status: 'QUEUED',
      message: 'Recomputation will be triggered on next cron cycle. For immediate recomputation, restart the backend service.',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('crosssell-rules')
  @ApiOperation({ summary: 'List cross-sell rules' })
  async getCrossSellRules() {
    return this.prisma.crossSellRule.findMany({
      include: {
        sourceCategory: { select: { id: true, name: true } },
        targetCategory: { select: { id: true, name: true } },
      },
      orderBy: { priority: 'desc' },
    });
  }

  @Post('crosssell-rules')
  @ApiOperation({ summary: 'Create cross-sell rule' })
  async createCrossSellRule(@Body() body: {
    sourceCategoryId: number;
    targetCategoryId: number;
    priority?: number;
  }, @Query('adminId') adminId?: string) {
    const rule = await this.prisma.crossSellRule.create({
      data: {
        sourceCategoryId: body.sourceCategoryId,
        targetCategoryId: body.targetCategoryId,
        priority: body.priority || 0,
        createdBy: parseInt(adminId || '0', 10),
      },
    });
    // Invalidate cross-sell cache for affected category
    await this.recRedis.setJson(this.recRedis.keys.crosssell(String(body.sourceCategoryId)), null, 1);
    return { ...rule, cacheInvalidated: true };
  }
}
