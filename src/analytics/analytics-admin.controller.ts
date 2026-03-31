import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  HttpCode,
  ParseIntPipe,
  Res,
  Header,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { SuperAdminAuthGuard } from '../guards/SuperAdminAuthGuard';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { RedisBufferService } from './services/redis-buffer.service';
import { HealthCronService } from './services/health-cron.service';
import { VisitorService } from './services/visitor.service';

const ADMIN_CACHE_TTL = 60; // seconds

/** Resolve since/until from either explicit ISO dates or a days-back integer. */
function resolveDateRange(
  days: string,
  startDate?: string,
  endDate?: string,
): { since: Date; until: Date; cacheKey: string } {
  if (startDate && endDate) {
    const since = new Date(startDate);
    const until = new Date(endDate);
    until.setHours(23, 59, 59, 999);
    return { since, until, cacheKey: `${startDate}_${endDate}` };
  }
  const d = Math.min(Math.max(parseInt(days) || 7, 1), 90);
  const until = new Date();
  const since = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
  return { since, until, cacheKey: `days:${d}` };
}

@ApiTags('admin-analytics')
@ApiBearerAuth('JWT-auth')
@UseGuards(SuperAdminAuthGuard)
@Controller('admin/analytics')
export class AnalyticsAdminController {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
    private redisBuffer: RedisBufferService,
    private healthCron: HealthCronService,
    private visitorService: VisitorService,
  ) {}

  // ────────────────────────────────────────────
  // Overview — KPIs + trends
  // ────────────────────────────────────────────

  @Get('overview')
  @ApiOperation({ summary: 'Dashboard overview: KPIs and daily trends' })
  @ApiQuery({ name: 'days', required: false, example: 7 })
  @ApiQuery({ name: 'startDate', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'endDate', required: false, example: '2026-01-31' })
  async getOverview(
    @Query('days') days = '7',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const { since, cacheKey: rangeCk } = resolveDateRange(days, startDate, endDate);
    const cacheKey = `analytics:admin:overview:${rangeCk}`;

    return this.cache.getOrSet(cacheKey, async () => {

      const [totalEvents, totalSessions, bouncedSessions, totalErrors, unresolvedErrors, avgPerformance] =
        await this.prisma.$transaction([
          this.prisma.analyticsEvent.count({ where: { createdAt: { gte: since } } }),
          this.prisma.visitorSession.count({ where: { startedAt: { gte: since } } }),
          this.prisma.visitorSession.count({ where: { startedAt: { gte: since }, pageCount: { lte: 1 } } }),
          this.prisma.errorLog.count({ where: { lastSeenAt: { gte: since } } }),
          this.prisma.errorLog.count({ where: { resolvedAt: null, lastSeenAt: { gte: since } } }),
          this.prisma.performanceMetric.aggregate({
            where: { metricName: 'api_latency', createdAt: { gte: since } },
            _avg: { metricValue: true },
          }),
        ]);

      // Raw SQL for groupBy queries to avoid Prisma TypeScript circular reference issue
      const [dailyEvents, topEvents, topPages, topCountries] = await Promise.all([
        this.prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
          SELECT TO_CHAR("createdAt", 'YYYY-MM-DD') AS date, COUNT(*) AS count
          FROM analytics_event
          WHERE "createdAt" >= ${since}
          GROUP BY TO_CHAR("createdAt", 'YYYY-MM-DD')
          ORDER BY date ASC
        `,
        this.prisma.$queryRaw<Array<{ "eventName": string; count: bigint }>>`
          SELECT "eventName", COUNT(*) AS count
          FROM analytics_event
          WHERE "createdAt" >= ${since}
          GROUP BY "eventName"
          ORDER BY count DESC
          LIMIT 10
        `,
        this.prisma.$queryRaw<Array<{ "pageUrl": string; count: bigint }>>`
          SELECT "pageUrl", COUNT(*) AS count
          FROM analytics_event
          WHERE "createdAt" >= ${since}
            AND "pageUrl" IS NOT NULL
          GROUP BY "pageUrl"
          ORDER BY count DESC
          LIMIT 10
        `,
        this.prisma.$queryRaw<Array<{ country: string; count: bigint }>>`
          SELECT country, COUNT(*) AS count
          FROM visitor_session
          WHERE "startedAt" >= ${since}
            AND country IS NOT NULL
          GROUP BY country
          ORDER BY count DESC
          LIMIT 15
        `,
      ]);

      return {
        kpis: {
          totalEvents,
          totalSessions,
          bounceRate: totalSessions > 0 ? Math.round((bouncedSessions / totalSessions) * 100) : 0,
          totalErrors,
          unresolvedErrors,
          avgApiLatencyMs: Math.round(avgPerformance._avg.metricValue ?? 0),
        },
        dailyEvents: dailyEvents.map(r => ({ date: r.date, count: Number(r.count) })),
        topEvents: topEvents.map(r => ({ name: r.eventName, count: Number(r.count) })),
        topPages: topPages.map(r => ({ url: r.pageUrl, count: Number(r.count) })),
        topCountries: topCountries.map(r => ({ country: r.country, count: Number(r.count) })),
        period: { since },
      };
    }, ADMIN_CACHE_TTL);
  }

  // ────────────────────────────────────────────
  // Products — product analytics table
  // ────────────────────────────────────────────

  @Get('products')
  @ApiOperation({ summary: 'Product analytics: views, clicks, searches per product' })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  @ApiQuery({ name: 'startDate', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'endDate', required: false, example: '2026-01-31' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  async getProducts(
    @Query('days') days = '30',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const { since, cacheKey: rangeCk } = resolveDateRange(days, startDate, endDate);
    const p = Math.max(parseInt(page) || 1, 1);
    const l = Math.min(parseInt(limit) || 20, 100);
    const cacheKey = `analytics:admin:products:${rangeCk}:${p}:${l}`;

    return this.cache.getOrSet(cacheKey, async () => {

      // Group product events by productId from metadata
      const productViews = await this.prisma.$queryRaw<Array<{ "eventName": string; count: bigint }>>`
        SELECT "eventName", COUNT(*) AS count
        FROM analytics_event
        WHERE "eventName" IN ('product_view', 'product_click', 'product_search', 'add_to_cart')
          AND "createdAt" >= ${since}
        GROUP BY "eventName"
      `;

      // Top viewed products (metadata.productId)
      const rawViews = await this.prisma.$queryRaw<Array<{ product_id: string; count: bigint }>>`
        SELECT (metadata->>'productId')::text AS product_id, COUNT(*) AS count
        FROM analytics_event
        WHERE "eventName" = 'product_view'
          AND "createdAt" >= ${since}
          AND metadata->>'productId' IS NOT NULL
        GROUP BY (metadata->>'productId')
        ORDER BY count DESC
        LIMIT ${l} OFFSET ${(p - 1) * l}
      `;

      const productIds = rawViews
        .map(r => parseInt(r.product_id))
        .filter(id => !isNaN(id));

      let products: any[] = [];
      if (productIds.length > 0) {
        products = await this.prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, productName: true },
        });
      }

      const productMap = new Map(products.map(p => [p.id, p]));

      const rows = rawViews.map(r => {
        const productId = parseInt(r.product_id);
        const product = productMap.get(productId);
        return {
          productId,
          name: product?.productName ?? 'Unknown',
          views: Number(r.count),
        };
      });

      return {
        data: rows,
        summary: productViews.reduce<Record<string, number>>((acc, row) => {
          acc[row.eventName] = Number(row.count);
          return acc;
        }, {}),
        page: p,
        limit: l,
        period: { since },
      };
    }, ADMIN_CACHE_TTL);
  }

  // ────────────────────────────────────────────
  // Funnel — shopping conversion funnel
  // ────────────────────────────────────────────

  @Get('funnel')
  @ApiOperation({ summary: 'Shopping funnel: conversion rates by flow type' })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  @ApiQuery({ name: 'startDate', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'endDate', required: false, example: '2026-01-31' })
  @ApiQuery({ name: 'flow', required: false, enum: ['regular', 'rfq', 'wholesale', 'services', 'dropship'] })
  async getFunnel(
    @Query('days') days = '30',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('flow') flow = 'regular',
  ) {
    const { since, cacheKey: rangeCk } = resolveDateRange(days, startDate, endDate);
    const cacheKey = `analytics:admin:funnel:${rangeCk}:${flow}`;

    return this.cache.getOrSet(cacheKey, async () => {

      const funnelSteps: Record<string, string[]> = {
        regular:   ['product_view', 'product_click', 'add_to_cart', 'checkout_start', 'order_complete'],
        rfq:       ['product_view', 'rfq_submitted', 'checkout_start', 'order_complete'],
        wholesale: ['product_view', 'product_click', 'add_to_cart', 'checkout_start', 'order_complete'],
        services:  ['product_view', 'add_to_cart', 'checkout_start', 'order_complete'],
        dropship:  ['product_view', 'product_click', 'add_to_cart', 'checkout_start', 'order_complete'],
      };

      const steps = funnelSteps[flow] ?? funnelSteps.regular;

      const counts = await this.prisma.analyticsEvent.groupBy({
        by: ['eventName'],
        where: {
          eventName: { in: steps },
          createdAt: { gte: since },
        },
        _count: { id: true },
      });

      const countMap = counts.reduce<Record<string, number>>((acc, r) => {
        acc[r.eventName] = r._count.id;
        return acc;
      }, {});

      const funnel = steps.map((step, i) => {
        const count = countMap[step] ?? 0;
        const prevCount = i === 0 ? count : (countMap[steps[i - 1]] ?? 0);
        return {
          step,
          count,
          conversionRate: prevCount > 0 ? Math.round((count / prevCount) * 1000) / 10 : 0,
        };
      });

      return { flow, funnel, period: { since } };
    }, ADMIN_CACHE_TTL);
  }

  // ────────────────────────────────────────────
  // Search — search trends + zero-results
  // ────────────────────────────────────────────

  @Get('search')
  @ApiOperation({ summary: 'Search analytics: top queries, zero-result queries' })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  @ApiQuery({ name: 'startDate', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'endDate', required: false, example: '2026-01-31' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  async getSearch(
    @Query('days') days = '30',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page = '1',
  ) {
    const { since, cacheKey: rangeCk } = resolveDateRange(days, startDate, endDate);
    const p = Math.max(parseInt(page) || 1, 1);
    const cacheKey = `analytics:admin:search:${rangeCk}:${p}`;

    return this.cache.getOrSet(cacheKey, async () => {

      const [topQueries, zeroResults, totalSearches] = await Promise.all([
        this.prisma.$queryRaw<Array<{ query: string; count: bigint }>>`
          SELECT (metadata->>'query')::text AS query, COUNT(*) AS count
          FROM analytics_event
          WHERE "eventName" = 'product_search'
            AND "createdAt" >= ${since}
            AND metadata->>'query' IS NOT NULL
          GROUP BY (metadata->>'query')
          ORDER BY count DESC
          LIMIT 20 OFFSET ${(p - 1) * 20}
        `,
        this.prisma.$queryRaw<Array<{ query: string; count: bigint }>>`
          SELECT (metadata->>'query')::text AS query, COUNT(*) AS count
          FROM analytics_event
          WHERE "eventName" = 'product_search'
            AND "createdAt" >= ${since}
            AND metadata->>'resultsCount' = '0'
          GROUP BY (metadata->>'query')
          ORDER BY count DESC
          LIMIT 20
        `,
        this.prisma.analyticsEvent.count({
          where: { eventName: 'product_search', createdAt: { gte: since } },
        }),
      ]);

      return {
        topQueries: topQueries.map(r => ({ query: r.query, count: Number(r.count) })),
        zeroResultQueries: zeroResults.map(r => ({ query: r.query, count: Number(r.count) })),
        totalSearches,
        page: p,
        period: { since },
      };
    }, ADMIN_CACHE_TTL);
  }

  // ────────────────────────────────────────────
  // Errors — error dashboard
  // ────────────────────────────────────────────

  @Get('errors')
  @ApiOperation({ summary: 'Error dashboard: grouped errors by fingerprint' })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  @ApiQuery({ name: 'startDate', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'endDate', required: false, example: '2026-01-31' })
  @ApiQuery({ name: 'source', required: false, example: 'all' })
  @ApiQuery({ name: 'level', required: false, example: 'all' })
  @ApiQuery({ name: 'resolved', required: false, example: 'false' })
  @ApiQuery({ name: 'search', required: false, description: 'Full-text search in error message' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  async getErrors(
    @Query('days') days = '30',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('source') source = 'all',
    @Query('level') level = 'all',
    @Query('resolved') resolved = 'false',
    @Query('search') search?: string,
    @Query('page') page = '1',
  ) {
    const { since, cacheKey: rangeCk } = resolveDateRange(days, startDate, endDate);
    const p = Math.max(parseInt(page) || 1, 1);
    const limit = 20;
    const searchKey = search ? `:s${search.slice(0, 20)}` : '';
    const cacheKey = `analytics:admin:errors:${rangeCk}:${source}:${level}:${resolved}${searchKey}:${p}`;

    return this.cache.getOrSet(cacheKey, async () => {

      const where: any = { lastSeenAt: { gte: since } };
      if (source !== 'all') where.source = source;
      if (level !== 'all') where.level = level;
      if (resolved === 'true') where.resolvedAt = { not: null };
      if (resolved === 'false') where.resolvedAt = null;
      if (search?.trim()) where.message = { contains: search.trim(), mode: 'insensitive' };

      const [errors, total] = await this.prisma.$transaction([
        this.prisma.errorLog.findMany({
          where,
          orderBy: { count: 'desc' },
          take: limit,
          skip: (p - 1) * limit,
        }),
        this.prisma.errorLog.count({ where }),
      ]);

      const [bySource, byLevel] = await Promise.all([
        this.prisma.$queryRaw<Array<{ source: string; error_groups: bigint; total_occurrences: bigint }>>`
          SELECT source, COUNT(*) AS error_groups, SUM(count) AS total_occurrences
          FROM error_log
          WHERE "lastSeenAt" >= ${since}
          GROUP BY source
        `,
        this.prisma.$queryRaw<Array<{ level: string; cnt: bigint }>>`
          SELECT level, COUNT(*) AS cnt
          FROM error_log
          WHERE "lastSeenAt" >= ${since}
          GROUP BY level
        `,
      ]);

      return {
        errors,
        total,
        page: p,
        pages: Math.ceil(total / limit),
        bySource: bySource.map(r => ({ source: r.source, errorGroups: Number(r.error_groups), totalOccurrences: Number(r.total_occurrences) })),
        byLevel: byLevel.map(r => ({ level: r.level, count: Number(r.cnt) })),
        period: { since },
      };
    }, ADMIN_CACHE_TTL);
  }

  // ────────────────────────────────────────────
  // Performance — Web Vitals + API latency
  // ────────────────────────────────────────────

  @Get('performance')
  @ApiOperation({ summary: 'Performance: Web Vitals and API latency percentiles' })
  @ApiQuery({ name: 'days', required: false, example: 7 })
  @ApiQuery({ name: 'startDate', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'endDate', required: false, example: '2026-01-31' })
  async getPerformance(
    @Query('days') days = '7',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const { since, cacheKey: rangeCk } = resolveDateRange(days, startDate, endDate);
    const cacheKey = `analytics:admin:performance:${rangeCk}`;

    return this.cache.getOrSet(cacheKey, async () => {

      const metrics = await this.prisma.performanceMetric.groupBy({
        by: ['metricName', 'source'],
        where: { createdAt: { gte: since } },
        _avg: { metricValue: true },
        _min: { metricValue: true },
        _max: { metricValue: true },
        _count: { id: true },
      });

      // P75 and P95 via raw query for better percentile accuracy
      const percentiles = await this.prisma.$queryRaw<
        Array<{ "metricName": string; p50: number; p75: number; p95: number }>
      >`
        SELECT
          "metricName",
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY "metricValue") AS p50,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY "metricValue") AS p75,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "metricValue") AS p95
        FROM performance_metric
        WHERE "createdAt" >= ${since}
        GROUP BY "metricName"
      `;

      const percentileMap = percentiles.reduce<Record<string, any>>((acc, r) => {
        acc[r.metricName] = { p50: Math.round(r.p50), p75: Math.round(r.p75), p95: Math.round(r.p95) };
        return acc;
      }, {});

      // Slowest API endpoints
      const slowEndpoints = await this.prisma.$queryRaw<
        Array<{ endpoint: string; avg_ms: number; p95_ms: number; count: bigint }>
      >`
        SELECT endpoint,
          ROUND(AVG("metricValue")::numeric, 1) AS avg_ms,
          ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "metricValue")::numeric, 1) AS p95_ms,
          COUNT(*) AS count
        FROM performance_metric
        WHERE "metricName" = 'api_latency'
          AND "createdAt" >= ${since}
          AND endpoint IS NOT NULL
        GROUP BY endpoint
        ORDER BY avg_ms DESC
        LIMIT 10
      `;

      // Slow Prisma queries (>100ms, detected by Prisma query event listener)
      const slowPrismaQueries = await this.prisma.$queryRaw<
        Array<{ endpoint: string; avg_ms: number; max_ms: number; count: bigint }>
      >`
        SELECT endpoint,
          ROUND(AVG("metricValue")::numeric, 1) AS avg_ms,
          ROUND(MAX("metricValue")::numeric, 1) AS max_ms,
          COUNT(*) AS count
        FROM performance_metric
        WHERE "metricName" = 'prisma_slow_query'
          AND "createdAt" >= ${since}
          AND endpoint IS NOT NULL
        GROUP BY endpoint
        ORDER BY avg_ms DESC
        LIMIT 10
      `;

      return {
        metrics: metrics.map(m => ({
          name: m.metricName,
          source: m.source,
          avg: Math.round(m._avg.metricValue ?? 0),
          min: Math.round(m._min.metricValue ?? 0),
          max: Math.round(m._max.metricValue ?? 0),
          count: m._count.id,
          percentiles: percentileMap[m.metricName] ?? null,
        })),
        slowestEndpoints: slowEndpoints.map(r => ({
          endpoint: r.endpoint,
          avgMs: Number(r.avg_ms),
          p95Ms: Number(r.p95_ms),
          count: Number(r.count),
        })),
        slowPrismaQueries: slowPrismaQueries.map(r => ({
          model: r.endpoint,
          avgMs: Number(r.avg_ms),
          maxMs: Number(r.max_ms),
          count: Number(r.count),
        })),
        period: { since },
      };
    }, ADMIN_CACHE_TTL);
  }

  // ────────────────────────────────────────────
  // Health History — historical system health
  // ────────────────────────────────────────────

  @Get('health-history')
  @ApiOperation({ summary: 'System health history per component' })
  @ApiQuery({ name: 'days', required: false, example: 7 })
  @ApiQuery({ name: 'startDate', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'endDate', required: false, example: '2026-01-31' })
  @ApiQuery({ name: 'component', required: false, example: 'all' })
  async getHealthHistory(
    @Query('days') days = '7',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('component') component = 'all',
  ) {
    const { cacheKey: rangeCk } = resolveDateRange(days, startDate, endDate);
    const d = startDate && endDate
      ? Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / (24 * 60 * 60 * 1000)) + 1
      : Math.min(parseInt(days) || 7, 30);
    const cacheKey = `analytics:admin:health:${rangeCk}:${component}`;

    return this.cache.getOrSet(cacheKey, async () => {
      const [history, summary] = await Promise.all([
        this.healthCron.getHealthHistory(d, component),
        this.healthCron.getComponentSummary(d),
      ]);
      return { history, summary, period: { days: d } };
    }, ADMIN_CACHE_TTL);
  }

  // ────────────────────────────────────────────
  // Realtime — active visitors + live events
  // ────────────────────────────────────────────

  @Get('realtime')
  @ApiOperation({ summary: 'Real-time: active visitors and recent events (last 5 minutes)' })
  async getRealtime() {
    // No caching — real-time endpoint
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const [activeSessions, recentEvents, bufferSize] = await Promise.all([
      this.prisma.visitorSession.findMany({
        where: { lastActiveAt: { gte: fiveMinutesAgo }, isActive: true },
        select: {
          sessionId: true,
          deviceId: true,
          userId: true,
          locale: true,
          currency: true,
          tradeRole: true,
          lastActiveAt: true,
          pageCount: true,
          eventCount: true,
        },
        orderBy: { lastActiveAt: 'desc' },
        take: 50,
      }),
      this.prisma.analyticsEvent.findMany({
        where: { createdAt: { gte: fiveMinutesAgo } },
        select: { eventName: true, eventType: true, pageUrl: true, sessionId: true, createdAt: true, source: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.redisBuffer.getBufferSize(),
    ]);

    return {
      activeVisitors: activeSessions.length,
      sessions: activeSessions,
      recentEvents,
      bufferSize,
      serverTime: Date.now(),
    };
  }

  // ────────────────────────────────────────────
  // Status — circuit breaker + buffer stats
  // ────────────────────────────────────────────

  @Get('status')
  @ApiOperation({ summary: 'Analytics system status: paused state, buffer size, totals' })
  async getStatus() {
    const [isPaused, bufferSize, totalEvents, totalErrors, totalSessions] = await Promise.all([
      this.redisBuffer.isPaused(),
      this.redisBuffer.getBufferSize(),
      this.prisma.analyticsEvent.count(),
      this.prisma.errorLog.count(),
      this.prisma.visitorSession.count(),
    ]);

    return {
      isPaused,
      bufferSize,
      totals: { events: totalEvents, errors: totalErrors, sessions: totalSessions },
      serverTime: Date.now(),
    };
  }

  // ────────────────────────────────────────────
  // Timeline — correlated FE+BE view by requestId
  // ────────────────────────────────────────────

  @Get('timeline/:requestId')
  @ApiOperation({ summary: 'Correlated timeline: join frontend + backend events by requestId' })
  @ApiParam({ name: 'requestId', description: 'UUID v7 requestId shared across FE and BE' })
  async getTimeline(@Param('requestId') requestId: string) {
    const cacheKey = `analytics:admin:timeline:${requestId}`;

    return this.cache.getOrSet(cacheKey, async () => {
      const events = await this.prisma.analyticsEvent.findMany({
        where: { requestId },
        orderBy: { createdAt: 'asc' },
        select: {
          eventName: true,
          eventType: true,
          source: true,
          createdAt: true,
          sessionId: true,
          userId: true,
          metadata: true,
          pageUrl: true,
          clockOffset: true,
        },
      });

      if (events.length === 0) return { requestId, events: [], summary: null };

      const baseTime = new Date(events[0].createdAt).getTime();
      const timeline = events.map(e => ({
        source: e.source,
        time: new Date(e.createdAt).getTime() - baseTime,
        name: e.eventName,
        type: e.eventType,
        page: e.pageUrl,
        meta: e.metadata,
        clockOffset: e.clockOffset,
      }));

      const feEvents = timeline.filter(e => e.source === 'frontend');
      const beEvents = timeline.filter(e => e.source === 'backend');

      const clientMs = feEvents.length >= 2
        ? feEvents[feEvents.length - 1].time - feEvents[0].time
        : null;

      const serverMs = beEvents.length >= 2
        ? beEvents[beEvents.length - 1].time - beEvents[0].time
        : null;

      return {
        requestId,
        sessionId: events[0].sessionId,
        events: timeline,
        summary: {
          totalEvents: events.length,
          frontendEvents: feEvents.length,
          backendEvents: beEvents.length,
          clientMs,
          serverMs,
          networkMs: clientMs != null && serverMs != null ? clientMs - serverMs : null,
        },
      };
    }, ADMIN_CACHE_TTL);
  }

  // ────────────────────────────────────────────
  // User Journey — per-user session + event timeline
  // ────────────────────────────────────────────

  @Get('user-journey')
  @ApiOperation({ summary: 'Per-user journey: sessions and event timeline for a given user or session' })
  @ApiQuery({ name: 'userId', required: false, type: 'number' })
  @ApiQuery({ name: 'sessionId', required: false })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getUserJourney(
    @Query('userId') userId?: string,
    @Query('sessionId') sessionId?: string,
    @Query('days') days = '30',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const { since, until } = resolveDateRange(days, startDate, endDate);
    const uid = userId ? parseInt(userId) : undefined;

    const sessionWhere: any = { startedAt: { gte: since, lte: until } };
    if (uid) sessionWhere.userId = uid;
    if (sessionId) sessionWhere.sessionId = sessionId;

    const sessions = await this.prisma.visitorSession.findMany({
      where: sessionWhere,
      orderBy: { startedAt: 'desc' },
      take: 20,
      select: {
        sessionId: true,
        userId: true,
        deviceId: true,
        locale: true,
        currency: true,
        tradeRole: true,
        pageCount: true,
        eventCount: true,
        startedAt: true,
        lastActiveAt: true,
        isActive: true,
      },
    });

    if (sessions.length === 0) return { sessions: [], events: [], userId: uid ?? null, sessionId: sessionId ?? null };

    const sessionIds = sessions.map(s => s.sessionId).filter(Boolean) as string[];

    const events = await this.prisma.analyticsEvent.findMany({
      where: {
        sessionId: { in: sessionIds },
        createdAt: { gte: since, lte: until },
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: {
        id: true,
        sessionId: true,
        eventName: true,
        eventType: true,
        source: true,
        pageUrl: true,
        createdAt: true,
        metadata: true,
        requestId: true,
      },
    });

    return { sessions, events, userId: uid ?? null, sessionId: sessionId ?? null, period: { since, until } };
  }

  // ────────────────────────────────────────────
  // Export — CSV download
  // ────────────────────────────────────────────

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Export analytics data as CSV: events | errors | sessions' })
  @ApiQuery({ name: 'type', required: false, enum: ['events', 'errors', 'sessions'], example: 'events' })
  @ApiQuery({ name: 'days', required: false, example: 7 })
  @ApiQuery({ name: 'startDate', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'endDate', required: false, example: '2026-01-31' })
  async exportCsv(
    @Res() res: Response,
    @Query('type') type = 'events',
    @Query('days') days = '7',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const { since, until } = resolveDateRange(days, startDate, endDate);
    const filename = `analytics-${type}-${since.toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    try {
    const escape = (v: unknown): string => {
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
    };
    const row = (...cols: unknown[]) => cols.map(escape).join(',') + '\n';

    if (type === 'errors') {
      res.write(row('id', 'fingerprint', 'message', 'source', 'level', 'count', 'firstSeenAt', 'lastSeenAt', 'resolvedAt'));
      let cursor = 0;
      const pageSize = 500;
      while (true) {
        const batch = await this.prisma.errorLog.findMany({
          where: { lastSeenAt: { gte: since, lte: until } },
          orderBy: { lastSeenAt: 'desc' },
          take: pageSize,
          skip: cursor,
          select: { id: true, fingerprint: true, message: true, source: true, level: true, count: true, firstSeenAt: true, lastSeenAt: true, resolvedAt: true },
        });
        if (batch.length === 0) break;
        for (const r of batch) res.write(row(r.id, r.fingerprint, r.message, r.source, r.level, r.count, r.firstSeenAt, r.lastSeenAt, r.resolvedAt ?? ''));
        cursor += batch.length;
        if (batch.length < pageSize) break;
      }
    } else if (type === 'sessions') {
      res.write(row('sessionId', 'userId', 'deviceId', 'locale', 'currency', 'tradeRole', 'pageCount', 'eventCount', 'startedAt', 'lastActiveAt'));
      let cursor = 0;
      const pageSize = 500;
      while (true) {
        const batch = await this.prisma.visitorSession.findMany({
          where: { startedAt: { gte: since, lte: until } },
          orderBy: { startedAt: 'desc' },
          take: pageSize,
          skip: cursor,
          select: { sessionId: true, userId: true, deviceId: true, locale: true, currency: true, tradeRole: true, pageCount: true, eventCount: true, startedAt: true, lastActiveAt: true },
        });
        if (batch.length === 0) break;
        for (const r of batch) res.write(row(r.sessionId, r.userId ?? '', r.deviceId ?? '', r.locale ?? '', r.currency ?? '', r.tradeRole ?? '', r.pageCount, r.eventCount, r.startedAt, r.lastActiveAt));
        cursor += batch.length;
        if (batch.length < pageSize) break;
      }
    } else {
      // default: events
      res.write(row('id', 'eventName', 'eventType', 'source', 'sessionId', 'userId', 'pageUrl', 'createdAt'));
      let cursor = 0;
      const pageSize = 500;
      while (true) {
        const batch = await this.prisma.analyticsEvent.findMany({
          where: { createdAt: { gte: since, lte: until } },
          orderBy: { createdAt: 'desc' },
          take: pageSize,
          skip: cursor,
          select: { id: true, eventName: true, eventType: true, source: true, sessionId: true, userId: true, pageUrl: true, createdAt: true },
        });
        if (batch.length === 0) break;
        for (const r of batch) res.write(row(r.id, r.eventName, r.eventType ?? '', r.source ?? '', r.sessionId ?? '', r.userId ?? '', r.pageUrl ?? '', r.createdAt));
        cursor += batch.length;
        if (batch.length < pageSize) break;
      }
    }

    res.end();
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({ message: error.message });
      } else {
        res.end();
      }
    }
  }

  // ────────────────────────────────────────────
  // Circuit Breaker — pause / resume
  // ────────────────────────────────────────────

  @Post('pause')
  @HttpCode(200)
  @ApiOperation({ summary: 'Circuit breaker ON: pause analytics event processing' })
  async pause() {
    await this.redisBuffer.setPaused(true);
    return { paused: true, message: 'Analytics processing paused' };
  }

  @Post('resume')
  @HttpCode(200)
  @ApiOperation({ summary: 'Circuit breaker OFF: resume analytics event processing' })
  async resume() {
    await this.redisBuffer.setPaused(false);
    return { paused: false, message: 'Analytics processing resumed' };
  }

  // ────────────────────────────────────────────
  // Error Management — resolve / unresolve
  // ────────────────────────────────────────────

  @Patch('errors/:id/resolve')
  @ApiOperation({ summary: 'Mark an error as resolved' })
  @ApiParam({ name: 'id', type: 'number' })
  async resolveError(@Param('id', ParseIntPipe) id: number) {
    const error = await this.prisma.errorLog.update({
      where: { id },
      data: { resolvedAt: new Date() },
    });
    await this.cache.del(`analytics:admin:errors:*`);
    return { resolved: true, id: error.id, resolvedAt: error.resolvedAt };
  }

  @Patch('errors/:id/unresolve')
  @ApiOperation({ summary: 'Mark an error as unresolved (reopen)' })
  @ApiParam({ name: 'id', type: 'number' })
  async unresolveError(@Param('id', ParseIntPipe) id: number) {
    const error = await this.prisma.errorLog.update({
      where: { id },
      data: { resolvedAt: null },
    });
    return { resolved: false, id: error.id };
  }

  // ────────────────────────────────────────────
  // GDPR — delete user analytics data
  // ────────────────────────────────────────────

  @Delete('user/:userId/data')
  @ApiOperation({ summary: 'GDPR: delete all analytics data for a specific user' })
  @ApiParam({ name: 'userId', type: 'number' })
  async deleteUserData(@Param('userId', ParseIntPipe) userId: number) {
    const result = await this.visitorService.deleteUserData(userId);
    return { deleted: true, userId, ...result };
  }
}
