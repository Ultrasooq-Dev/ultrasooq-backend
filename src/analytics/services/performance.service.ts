import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisBufferService } from './redis-buffer.service';
import { TrackPerformanceDto } from '../dto/track-performance.dto';

const SLOW_QUERY_THRESHOLD_MS = 100;

@Injectable()
export class PerformanceService implements OnModuleInit {
  private readonly logger = new Logger(PerformanceService.name);

  constructor(
    private prisma: PrismaService,
    private redisBuffer: RedisBufferService,
  ) {}

  /**
   * Register Prisma query event listener for slow query detection.
   * Queries over SLOW_QUERY_THRESHOLD_MS are written to PerformanceMetric via the Redis buffer.
   * Skip performance_metric writes to avoid recursion.
   */
  onModuleInit() {
    (this.prisma as any).$on('query', (e: { duration: number; target?: string; query?: string }) => {
      if (e.duration < SLOW_QUERY_THRESHOLD_MS) return;
      const target = e.target ?? 'unknown';
      if (target.includes('performance_metric')) return; // prevent recursion
      this.redisBuffer.push(
        this.redisBuffer.keys.PERF_KEY,
        JSON.stringify({
          metricName: 'prisma_slow_query',
          metricValue: e.duration,
          source: 'backend',
          endpoint: target,
        }),
      ).catch(() => {});
    });
  }

  /**
   * Buffer a performance metric. Written to DB by EventCollectorService flush cron.
   */
  async trackMetric(dto: TrackPerformanceDto): Promise<void> {
    await this.redisBuffer.push(
      this.redisBuffer.keys.PERF_KEY,
      JSON.stringify(dto),
    );
  }

  /**
   * Buffer a backend API latency metric (called from LoggingInterceptor).
   */
  async trackApiLatency(
    endpoint: string,
    method: string,
    durationMs: number,
    requestId?: string,
    userId?: number,
  ): Promise<void> {
    await this.redisBuffer.push(
      this.redisBuffer.keys.PERF_KEY,
      JSON.stringify({
        metricName: 'api_latency',
        metricValue: durationMs,
        source: 'backend',
        endpoint,
        method,
        requestId,
        userId,
      }),
    );
  }

  /**
   * Track a batch of Web Vitals from the X-Track-Vitals header (Channel A piggyback).
   * Called by LoggingInterceptor on every API request that includes vitals.
   */
  async trackVitalsBatch(
    vitals: Record<string, number>,
    sessionId?: string,
    pageUrl?: string,
  ): Promise<void> {
    const validVitals = ['LCP', 'FID', 'CLS', 'TTFB', 'INP'];
    for (const [name, value] of Object.entries(vitals)) {
      if (!validVitals.includes(name) || typeof value !== 'number') continue;
      await this.redisBuffer.push(
        this.redisBuffer.keys.PERF_KEY,
        JSON.stringify({
          metricName: name,
          metricValue: value,
          source: 'frontend',
          sessionId,
          pageUrl,
        }),
      );
    }
  }

  /**
   * Get Web Vitals summary with percentiles.
   */
  async getWebVitals(days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const vitals = ['LCP', 'FID', 'CLS', 'TTFB', 'INP'];
    const result: Record<string, any> = {};

    for (const metric of vitals) {
      const data = await this.prisma.performanceMetric.findMany({
        where: { metricName: metric, createdAt: { gte: since } },
        select: { metricValue: true },
        orderBy: { metricValue: 'asc' },
      });

      if (data.length === 0) {
        result[metric] = { p50: null, p75: null, p95: null };
        continue;
      }

      const values = data.map((d) => d.metricValue);
      result[metric] = {
        p50: this.percentile(values, 50),
        p75: this.percentile(values, 75),
        p95: this.percentile(values, 95),
      };
    }

    return result;
  }

  /**
   * Get Web Vitals trend over time.
   */
  async getWebVitalsTrend(days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const results = await this.prisma.$queryRaw<
      Array<{ date: string; metric_name: string; p75: number }>
    >`
      SELECT DATE("createdAt") as date, "metricName" as metric_name,
             PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY "metricValue") as p75
      FROM performance_metric
      WHERE "createdAt" >= ${since}
        AND source = 'frontend'
        AND "metricName" IN ('LCP', 'FID', 'CLS', 'TTFB', 'INP')
      GROUP BY DATE("createdAt"), "metricName"
      ORDER BY date
    `;
    return results;
  }

  /**
   * Get API latency summary.
   */
  async getApiLatency(days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const allLatencies = await this.prisma.performanceMetric.findMany({
      where: {
        metricName: 'api_latency',
        source: 'backend',
        createdAt: { gte: since },
      },
      select: { metricValue: true },
      orderBy: { metricValue: 'asc' },
    });

    const values = allLatencies.map((d) => d.metricValue);
    const overall = {
      p50: this.percentile(values, 50),
      p75: this.percentile(values, 75),
      p95: this.percentile(values, 95),
    };

    // Slowest endpoints
    const slowest = await this.prisma.$queryRaw<
      Array<{ endpoint: string; method: string; p95: number; count: bigint }>
    >`
      SELECT endpoint, method,
             PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "metricValue") as p95,
             COUNT(*) as count
      FROM performance_metric
      WHERE "metricName" = 'api_latency'
        AND source = 'backend'
        AND "createdAt" >= ${since}
        AND endpoint IS NOT NULL
      GROUP BY endpoint, method
      ORDER BY p95 DESC
      LIMIT 10
    `;

    return {
      overall,
      slowest: slowest.map((s) => ({
        endpoint: s.endpoint,
        method: s.method,
        p95: Math.round(Number(s.p95)),
        count: Number(s.count),
      })),
    };
  }

  private percentile(sorted: number[], pct: number): number | null {
    if (sorted.length === 0) return null;
    const index = Math.ceil((pct / 100) * sorted.length) - 1;
    return Math.round(sorted[Math.max(0, index)] * 100) / 100;
  }
}
