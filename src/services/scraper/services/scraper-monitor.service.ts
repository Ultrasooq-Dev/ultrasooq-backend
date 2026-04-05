import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ScraperQueueService } from './scraper-queue.service';
import { ScraperRotationService } from './scraper-rotation.service';

// Target distribution
const PLATFORM_TARGETS: Record<string, number> = {
  amazon: 2_000_000,
  taobao: 3_000_000,
  alibaba: 2_500_000,
  aliexpress: 2_500_000,
};

@Injectable()
export class ScraperMonitorService {
  private readonly logger = new Logger(ScraperMonitorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: ScraperQueueService,
    private readonly rotationService: ScraperRotationService,
  ) {}

  /**
   * Generate a full health report
   */
  async getHealthReport(): Promise<any> {
    const [platformStats, queueStats, errorStats] = await Promise.all([
      this.getPlatformStats(),
      this.queueService.getQueueStats(),
      this.getErrorStats(),
    ]);

    const totalScraped = Object.values(platformStats).reduce((sum: number, p: any) => sum + p.scraped, 0);
    const totalTranslated = Object.values(platformStats).reduce((sum: number, p: any) => sum + p.translated, 0);
    const totalImported = Object.values(platformStats).reduce((sum: number, p: any) => sum + p.imported, 0);
    const totalTarget = Object.values(PLATFORM_TARGETS).reduce((sum, t) => sum + t, 0);

    // Estimate completion based on current rates
    const totalRate = Object.values(platformStats).reduce((sum: number, p: any) => sum + p.currentRate, 0);
    const remaining = totalTarget - totalScraped;
    const hoursRemaining = totalRate > 0 ? remaining / totalRate : Infinity;
    const estimatedCompletion = new Date(Date.now() + hoursRemaining * 3600000).toISOString();

    return {
      overall: {
        totalTarget,
        totalScraped,
        totalTranslated,
        totalImported,
        percentComplete: totalTarget > 0 ? Math.round((totalScraped / totalTarget) * 10000) / 100 : 0,
        estimatedCompletionDate: hoursRemaining < Infinity ? estimatedCompletion : 'unknown',
        ratePerHour: totalRate,
      },
      platforms: platformStats,
      queues: queueStats,
      errors: errorStats,
    };
  }

  private async getPlatformStats(): Promise<Record<string, any>> {
    const platforms = ['amazon', 'taobao', 'alibaba', 'aliexpress'];
    const stats: Record<string, any> = {};

    for (const platform of platforms) {
      const [scraped, translated, imported, blocked, rate] = await Promise.all([
        this.prisma.scrapedProductRaw.count({ where: { sourcePlatform: platform } }),
        this.prisma.scrapedProductRaw.count({ where: { sourcePlatform: platform, status: { in: ['TRANSLATED', 'MAPPED', 'READY', 'IMPORTED'] } } }),
        this.prisma.scrapedProductRaw.count({ where: { sourcePlatform: platform, status: 'IMPORTED' } }),
        this.rotationService.isInCooldown(platform),
        this.rotationService.getAdaptiveRate(platform),
      ]);

      stats[platform] = {
        target: PLATFORM_TARGETS[platform] || 0,
        scraped,
        translated,
        imported,
        blocked,
        currentRate: rate,
        percentComplete: PLATFORM_TARGETS[platform] ? Math.round((scraped / PLATFORM_TARGETS[platform]) * 10000) / 100 : 0,
      };
    }

    return stats;
  }

  private async getErrorStats(): Promise<any> {
    const since24h = new Date(Date.now() - 86400000);

    const [blocks, failures] = await Promise.all([
      this.prisma.scrapingJob.count({
        where: { status: 'BLOCKED', updatedAt: { gte: since24h } },
      }),
      this.prisma.scrapingJob.count({
        where: { status: 'FAILED', updatedAt: { gte: since24h } },
      }),
    ]);

    // Get top errors
    const failedJobs = await this.prisma.scrapingJob.findMany({
      where: { status: { in: ['FAILED', 'BLOCKED'] }, updatedAt: { gte: since24h }, lastError: { not: null } },
      select: { lastError: true, platform: true },
      take: 100,
    });

    const errorCounts: Record<string, { count: number; platform: string }> = {};
    for (const job of failedJobs) {
      const key = job.lastError || 'Unknown error';
      if (!errorCounts[key]) errorCounts[key] = { count: 0, platform: job.platform };
      errorCounts[key].count++;
    }

    const topErrors = Object.entries(errorCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([message, data]) => ({ message, count: data.count, platform: data.platform }));

    return {
      last24h: { blocks, failures, retries: blocks + failures },
      topErrors,
    };
  }

  /**
   * Get progress for a specific job
   */
  async getJobProgress(jobId: number): Promise<any> {
    return this.prisma.scrapingJob.findUnique({
      where: { id: jobId },
      include: {
        _count: {
          select: { scrapedProducts: true },
        },
      },
    });
  }

  /**
   * Get all active jobs
   */
  async getActiveJobs(): Promise<any[]> {
    return this.prisma.scrapingJob.findMany({
      where: { status: { in: ['QUEUED', 'RUNNING', 'PAUSED'] } },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      take: 100,
    });
  }
}
