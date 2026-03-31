import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisBufferService } from './redis-buffer.service';
import { AnalyticsGateway } from '../analytics.gateway';

@Injectable()
export class HealthCronService {
  private readonly logger = new Logger(HealthCronService.name);

  constructor(
    private prisma: PrismaService,
    private redisBuffer: RedisBufferService,
    @Optional() private gateway?: AnalyticsGateway,
  ) {}

  /**
   * Check all system components every 5 minutes and record health snapshots.
   */
  @Cron('0 */5 * * * *')
  async checkAllComponents(): Promise<void> {
    await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkMemory(),
    ]);
  }

  private async checkDatabase(): Promise<void> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const responseMs = Date.now() - start;
      const status = responseMs < 100 ? 'healthy' : 'degraded';
      await this.prisma.systemHealthLog.create({
        data: { component: 'database', status, responseMs, details: { type: 'postgresql' } },
      });
      if (status !== 'healthy') {
        this.gateway?.emitHealthAlert({ component: 'database', status, responseMs });
      }
    } catch (error) {
      const responseMs = Date.now() - start;
      await this.prisma.systemHealthLog
        .create({ data: { component: 'database', status: 'down', responseMs, details: { error: error.message } } })
        .catch(() => {});
      this.gateway?.emitHealthAlert({ component: 'database', status: 'down', responseMs });
    }
  }

  private async checkRedis(): Promise<void> {
    const start = Date.now();
    try {
      await this.redisBuffer.set('health:ping', 'pong', 10);
      const val = await this.redisBuffer.get('health:ping');
      const responseMs = Date.now() - start;
      const status = val === 'pong' ? 'healthy' : 'degraded';
      await this.prisma.systemHealthLog.create({
        data: { component: 'redis', status, responseMs, details: { type: 'ioredis' } },
      });
      if (status !== 'healthy') {
        this.gateway?.emitHealthAlert({ component: 'redis', status, responseMs });
      }
    } catch (error) {
      const responseMs = Date.now() - start;
      await this.prisma.systemHealthLog
        .create({ data: { component: 'redis', status: 'down', responseMs, details: { error: error.message } } })
        .catch(() => {});
      this.gateway?.emitHealthAlert({ component: 'redis', status: 'down', responseMs });
    }
  }

  private async checkMemory(): Promise<void> {
    const mem = process.memoryUsage();
    const totalMem = require('os').totalmem();
    const freeMem = require('os').freemem();
    const usagePercent = Math.round(((totalMem - freeMem) / totalMem) * 100);

    const status = usagePercent > 90 ? 'degraded' : 'healthy';

    try {
      await this.prisma.systemHealthLog.create({
        data: {
          component: 'memory',
          status,
          responseMs: null,
          details: {
            heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
            heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
            rss: Math.round(mem.rss / 1024 / 1024),
            systemUsagePercent: usagePercent,
          },
        },
      });
    } catch (error) {
      this.logger.warn(`Memory health check failed: ${error.message}`);
    }
  }

  /**
   * Get health history for admin dashboard.
   */
  async getHealthHistory(days: number, component?: string) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const where: any = { checkedAt: { gte: since } };
    if (component && component !== 'all') where.component = component;

    return this.prisma.systemHealthLog.findMany({
      where,
      orderBy: { checkedAt: 'desc' },
      take: 1000,
    });
  }

  /**
   * Get current status and uptime percentage per component.
   */
  async getComponentSummary(days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const components = ['database', 'redis', 'memory'];
    const result = [];

    for (const comp of components) {
      const [total, healthy, latest] = await this.prisma.$transaction([
        this.prisma.systemHealthLog.count({
          where: { component: comp, checkedAt: { gte: since } },
        }),
        this.prisma.systemHealthLog.count({
          where: { component: comp, status: 'healthy', checkedAt: { gte: since } },
        }),
        this.prisma.systemHealthLog.findFirst({
          where: { component: comp },
          orderBy: { checkedAt: 'desc' },
        }),
      ]);

      result.push({
        name: comp,
        currentStatus: latest?.status || 'unknown',
        uptimePercent: total > 0 ? Math.round((healthy / total) * 1000) / 10 : 0,
        avgResponseMs: latest?.responseMs || null,
      });
    }

    return result;
  }
}
