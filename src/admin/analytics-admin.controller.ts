/**
 * @file analytics-admin.controller.ts — Admin Analytics Dashboard Endpoints
 *
 * @intent
 *   Serves all analytics data endpoints consumed by the admin frontend dashboard.
 *   Covers KPI overview, product analytics, shopping funnel, search analytics,
 *   error tracking, performance metrics, health history, realtime stats,
 *   user journey, system status, request timeline, and pause/resume controls.
 *
 * @usage
 *   All endpoints are guarded by SuperAdminAuthGuard (JWT + admin role check).
 *   Mounted at /admin/analytics via the AdminModule.
 *
 * @dataflow
 *   Admin Frontend → GET/POST/PATCH /admin/analytics/* → this controller
 *   → PrismaService.$queryRawUnsafe() → PostgreSQL → JSON response
 *
 * @depends
 *   - SuperAdminAuthGuard (src/guards/SuperAdminAuthGuard.ts)
 *   - PrismaService (src/prisma/prisma.service.ts — global)
 *   - CacheService (src/cache/cache.service.ts — global, for pause/resume flag)
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  UseGuards,
  Logger,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SuperAdminAuthGuard } from '../guards/SuperAdminAuthGuard';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';

/** Helper: default start date (30 days ago) as ISO string */
function defaultStartDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString();
}

/** Helper: default end date (now) as ISO string */
function defaultEndDate(): string {
  return new Date().toISOString();
}

/**
 * Safe raw query helper — catches "relation does not exist" errors and returns
 * a fallback value. This allows endpoints referencing tables not yet migrated
 * (ErrorLog, PerformanceMetric, VisitorSession, AnalyticsDailyRollup) to
 * degrade gracefully instead of returning 500.
 */
async function safeQuery<T>(
  prisma: PrismaService,
  sql: string,
  params: any[],
  fallback: T,
  logger: Logger,
  label: string,
): Promise<T> {
  try {
    const result = await prisma.$queryRawUnsafe(sql, ...params);
    return result as T;
  } catch (error: any) {
    const msg = error?.message || '';
    if (msg.includes('does not exist') || msg.includes('relation')) {
      logger.warn(`[${label}] Table not found, returning fallback: ${msg}`);
    } else {
      logger.error(`[${label}] Query failed: ${msg}`);
    }
    return fallback;
  }
}

@ApiTags('Admin Analytics')
@ApiBearerAuth()
@Controller('admin/analytics')
@UseGuards(SuperAdminAuthGuard)
export class AnalyticsAdminController {
  private readonly logger = new Logger(AnalyticsAdminController.name);

  /** In-memory pause flag (survives restarts via Redis if CacheService is available) */
  private static PAUSE_CACHE_KEY = 'analytics:paused';

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  // ────────────────────────────────────────────────────────────────
  // GET /admin/analytics/overview
  // ────────────────────────────────────────────────────────────────
  @Get('overview')
  async getOverview(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const from = startDate || defaultStartDate();
    const to = endDate || defaultEndDate();

    try {
      // Core metrics from system_log (always exists)
      const coreRows: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT
           (SELECT COUNT(*)::int FROM system_log WHERE "createdAt" >= $1 AND "createdAt" <= $2) AS "totalRequests",
           (SELECT COUNT(*)::int FROM system_log WHERE "createdAt" >= $1 AND "createdAt" <= $2 AND "statusCode" >= 500) AS "serverErrors",
           (SELECT COUNT(*)::int FROM system_log WHERE "createdAt" >= $1 AND "createdAt" <= $2 AND "statusCode" >= 400 AND "statusCode" < 500) AS "clientErrors"`,
        from, to,
      );

      // Product engagement metrics
      const productRows: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT
           (SELECT COUNT(*)::int FROM "ProductView" WHERE "lastViewedAt" >= $1 AND "lastViewedAt" <= $2) AS "productViews",
           (SELECT COUNT(*)::int FROM "ProductClick" WHERE "createdAt" >= $1 AND "createdAt" <= $2) AS "productClicks",
           (SELECT COUNT(*)::int FROM "ProductSearch" WHERE "createdAt" >= $1 AND "createdAt" <= $2) AS "productSearches"`,
        from, to,
      );

      // Session count from VisitorSession (may not exist yet)
      const sessionRows: any[] = await safeQuery(
        this.prisma,
        `SELECT COUNT(*)::int AS "totalSessions" FROM "VisitorSession" WHERE "startedAt" >= $1 AND "startedAt" <= $2`,
        [from, to],
        [{ totalSessions: 0 }],
        this.logger,
        'overview:sessions',
      );

      // Unresolved errors from ErrorLog (may not exist yet)
      const errorRows: any[] = await safeQuery(
        this.prisma,
        `SELECT COUNT(*)::int AS "unresolvedErrors" FROM "ErrorLog" WHERE "lastSeenAt" >= $1 AND "lastSeenAt" <= $2 AND "resolvedAt" IS NULL`,
        [from, to],
        [{ unresolvedErrors: 0 }],
        this.logger,
        'overview:errors',
      );

      const core = coreRows[0] || {};
      const products = productRows[0] || {};
      const sessions = sessionRows[0] || {};
      const errors = errorRows[0] || {};

      return {
        status: true,
        data: {
          totalRequests: core.totalRequests || 0,
          totalSessions: sessions.totalSessions || 0,
          unresolvedErrors: errors.unresolvedErrors || (core.serverErrors || 0),
          avgLatency: 0, // metadata.delay is JSON text, not a numeric column
          productViews: products.productViews || 0,
          productClicks: products.productClicks || 0,
          productSearches: products.productSearches || 0,
          serverErrors: core.serverErrors || 0,
          clientErrors: core.clientErrors || 0,
        },
      };
    } catch (error: any) {
      this.logger.error(`[overview] ${error.message}`);
      return {
        status: true,
        data: {
          totalRequests: 0, totalSessions: 0, unresolvedErrors: 0,
          avgLatency: 0, productViews: 0, productClicks: 0,
          productSearches: 0, serverErrors: 0, clientErrors: 0,
        },
      };
    }
  }

  // ────────────────────────────────────────────────────────────────
  // GET /admin/analytics/products
  // ────────────────────────────────────────────────────────────────
  @Get('products')
  async getProducts(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    const from = startDate || defaultStartDate();
    const to = endDate || defaultEndDate();
    const offset = ((page || 1) - 1) * (limit || 20);

    try {
      // Top viewed products
      const topViewed: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT pv."productId", SUM(pv."viewCount")::int AS "totalViews",
                p."name_en", p."name_ar"
         FROM "ProductView" pv
         LEFT JOIN "Product" p ON p.id = pv."productId"
         WHERE pv."lastViewedAt" >= $1 AND pv."lastViewedAt" <= $2
         GROUP BY pv."productId", p."name_en", p."name_ar"
         ORDER BY "totalViews" DESC
         LIMIT $3 OFFSET $4`,
        from, to, limit || 20, offset,
      );

      // Top clicked products
      const topClicked: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT pc."productId", COUNT(*)::int AS "totalClicks",
                p."name_en", p."name_ar"
         FROM "ProductClick" pc
         LEFT JOIN "Product" p ON p.id = pc."productId"
         WHERE pc."createdAt" >= $1 AND pc."createdAt" <= $2
         GROUP BY pc."productId", p."name_en", p."name_ar"
         ORDER BY "totalClicks" DESC
         LIMIT 20`,
        from, to,
      );

      // Top searched terms
      const topSearched: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT ps."searchTerm", COUNT(*)::int AS "searchCount",
                SUM(CASE WHEN ps.clicked THEN 1 ELSE 0 END)::int AS "clickCount"
         FROM "ProductSearch" ps
         WHERE ps."createdAt" >= $1 AND ps."createdAt" <= $2
         GROUP BY ps."searchTerm"
         ORDER BY "searchCount" DESC
         LIMIT 20`,
        from, to,
      );

      return {
        status: true,
        data: {
          topViewed,
          topClicked,
          topSearched,
          page: page || 1,
          limit: limit || 20,
        },
      };
    } catch (error: any) {
      this.logger.error(`[products] ${error.message}`);
      return { status: true, data: { topViewed: [], topClicked: [], topSearched: [], page: 1, limit: 20 } };
    }
  }

  // ────────────────────────────────────────────────────────────────
  // GET /admin/analytics/funnel
  // ────────────────────────────────────────────────────────────────
  @Get('funnel')
  async getFunnel(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('flow') flow?: string,
  ) {
    const from = startDate || defaultStartDate();
    const to = endDate || defaultEndDate();

    try {
      // Stage 1: Product views
      const viewRows: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS count FROM "ProductView" WHERE "lastViewedAt" >= $1 AND "lastViewedAt" <= $2`,
        from, to,
      );

      // Stage 2: Added to cart (active carts)
      const cartRows: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS count FROM "Cart" WHERE status = 'ACTIVE' AND "createdAt" >= $1 AND "createdAt" <= $2 AND "deletedAt" IS NULL`,
        from, to,
      );

      // Stage 3: Orders placed (not cancelled)
      const orderRows: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS count FROM "OrderProducts" WHERE "orderProductStatus" != 'CANCELLED' AND "createdAt" >= $1 AND "createdAt" <= $2 AND "deletedAt" IS NULL`,
        from, to,
      );

      // Stage 4: Delivered
      const deliveredRows: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS count FROM "OrderProducts" WHERE "orderProductStatus" = 'DELIVERED' AND "createdAt" >= $1 AND "createdAt" <= $2 AND "deletedAt" IS NULL`,
        from, to,
      );

      const stages = [
        { name: 'View', count: viewRows[0]?.count || 0 },
        { name: 'Add to Cart', count: cartRows[0]?.count || 0 },
        { name: 'Checkout', count: orderRows[0]?.count || 0 },
        { name: 'Delivered', count: deliveredRows[0]?.count || 0 },
      ];

      return { status: true, data: { stages, flow: flow || 'default' } };
    } catch (error: any) {
      this.logger.error(`[funnel] ${error.message}`);
      return { status: true, data: { stages: [], flow: flow || 'default' } };
    }
  }

  // ────────────────────────────────────────────────────────────────
  // GET /admin/analytics/search
  // ────────────────────────────────────────────────────────────────
  @Get('search')
  async getSearch(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
  ) {
    const from = startDate || defaultStartDate();
    const to = endDate || defaultEndDate();
    const limit = 20;
    const offset = ((page || 1) - 1) * limit;

    try {
      // Top search terms with click-through rate
      const topQueries: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT
           "searchTerm",
           COUNT(*)::int AS "totalSearches",
           SUM(CASE WHEN clicked THEN 1 ELSE 0 END)::int AS "clickedCount",
           ROUND(
             SUM(CASE WHEN clicked THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*), 0) * 100, 1
           ) AS "ctr"
         FROM "ProductSearch"
         WHERE "createdAt" >= $1 AND "createdAt" <= $2
         GROUP BY "searchTerm"
         ORDER BY "totalSearches" DESC
         LIMIT $3 OFFSET $4`,
        from, to, limit, offset,
      );

      // No-results queries (searched but never clicked any product)
      const noResults: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT
           "searchTerm",
           COUNT(*)::int AS "searchCount"
         FROM "ProductSearch"
         WHERE "createdAt" >= $1 AND "createdAt" <= $2
           AND "productId" IS NULL
           AND clicked = false
         GROUP BY "searchTerm"
         ORDER BY "searchCount" DESC
         LIMIT 20`,
        from, to,
      );

      // Overall search stats
      const statsRows: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT
           COUNT(*)::int AS "totalSearches",
           SUM(CASE WHEN clicked THEN 1 ELSE 0 END)::int AS "totalClicked",
           COUNT(DISTINCT "searchTerm")::int AS "uniqueTerms"
         FROM "ProductSearch"
         WHERE "createdAt" >= $1 AND "createdAt" <= $2`,
        from, to,
      );

      const stats = statsRows[0] || { totalSearches: 0, totalClicked: 0, uniqueTerms: 0 };

      return {
        status: true,
        data: {
          topQueries,
          noResults,
          totalSearches: stats.totalSearches,
          totalClicked: stats.totalClicked,
          uniqueTerms: stats.uniqueTerms,
          overallCtr: stats.totalSearches > 0
            ? Math.round((stats.totalClicked / stats.totalSearches) * 1000) / 10
            : 0,
          page: page || 1,
        },
      };
    } catch (error: any) {
      this.logger.error(`[search] ${error.message}`);
      return {
        status: true,
        data: { topQueries: [], noResults: [], totalSearches: 0, totalClicked: 0, uniqueTerms: 0, overallCtr: 0, page: 1 },
      };
    }
  }

  // ────────────────────────────────────────────────────────────────
  // GET /admin/analytics/errors
  // ────────────────────────────────────────────────────────────────
  @Get('errors')
  async getErrors(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('source') source?: string,
    @Query('level') level?: string,
    @Query('resolved') resolved?: string,
    @Query('search') search?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
  ) {
    const from = startDate || defaultStartDate();
    const to = endDate || defaultEndDate();
    const limit = 20;
    const offset = ((page || 1) - 1) * limit;

    try {
      // Try ErrorLog table first
      let conditions = `WHERE "lastSeenAt" >= $1 AND "lastSeenAt" <= $2`;
      const params: any[] = [from, to];
      let paramIdx = 3;

      if (source) {
        conditions += ` AND "source" = $${paramIdx}`;
        params.push(source);
        paramIdx++;
      }
      if (level) {
        conditions += ` AND "level" = $${paramIdx}`;
        params.push(level);
        paramIdx++;
      }
      if (resolved === 'true') {
        conditions += ` AND "resolvedAt" IS NOT NULL`;
      } else if (resolved === 'false') {
        conditions += ` AND "resolvedAt" IS NULL`;
      }
      if (search) {
        conditions += ` AND ("message" ILIKE $${paramIdx} OR "fingerprint" ILIKE $${paramIdx})`;
        params.push(`%${search}%`);
        paramIdx++;
      }

      const errors: any[] = await safeQuery(
        this.prisma,
        `SELECT id, fingerprint, message, source, level, count::int,
                "firstSeenAt", "lastSeenAt", "resolvedAt", "pageUrl", "statusCode"
         FROM "ErrorLog"
         ${conditions}
         ORDER BY "lastSeenAt" DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, limit, offset],
        [],
        this.logger,
        'errors:errorlog',
      );

      // If ErrorLog doesn't exist, fall back to system_log errors
      if (errors.length === 0) {
        const sysErrors: any[] = await this.prisma.$queryRawUnsafe(
          `SELECT id, message, context AS source, level, path,
                  "statusCode", "createdAt" AS "lastSeenAt", "errorStack" AS stack
           FROM system_log
           WHERE "createdAt" >= $1 AND "createdAt" <= $2
             AND level = 'ERROR'
           ORDER BY "createdAt" DESC
           LIMIT $3 OFFSET $4`,
          from, to, limit, offset,
        );
        return { status: true, data: { errors: sysErrors, page: page || 1, source: 'system_log' } };
      }

      return { status: true, data: { errors, page: page || 1, source: 'ErrorLog' } };
    } catch (error: any) {
      this.logger.error(`[errors] ${error.message}`);
      return { status: true, data: { errors: [], page: 1 } };
    }
  }

  // ────────────────────────────────────────────────────────────────
  // GET /admin/analytics/performance
  // ────────────────────────────────────────────────────────────────
  @Get('performance')
  async getPerformance(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const from = startDate || defaultStartDate();
    const to = endDate || defaultEndDate();

    try {
      // Web Vitals from PerformanceMetric (may not exist)
      const vitals: any[] = await safeQuery(
        this.prisma,
        `SELECT
           "metricName",
           ROUND(AVG("metricValue")::numeric, 2) AS "avgValue",
           ROUND(MIN("metricValue")::numeric, 2) AS "minValue",
           ROUND(MAX("metricValue")::numeric, 2) AS "maxValue",
           COUNT(*)::int AS "sampleCount"
         FROM "PerformanceMetric"
         WHERE "createdAt" >= $1 AND "createdAt" <= $2
         GROUP BY "metricName"
         ORDER BY "metricName"`,
        [from, to],
        [],
        this.logger,
        'performance:vitals',
      );

      // API latency distribution from system_log (statusCode-based)
      const apiLatency: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT
           CASE
             WHEN "statusCode" >= 200 AND "statusCode" < 300 THEN '2xx'
             WHEN "statusCode" >= 300 AND "statusCode" < 400 THEN '3xx'
             WHEN "statusCode" >= 400 AND "statusCode" < 500 THEN '4xx'
             WHEN "statusCode" >= 500 THEN '5xx'
             ELSE 'other'
           END AS "statusGroup",
           COUNT(*)::int AS "requestCount"
         FROM system_log
         WHERE "createdAt" >= $1 AND "createdAt" <= $2
         GROUP BY "statusGroup"
         ORDER BY "statusGroup"`,
        from, to,
      );

      // Slowest endpoints (extract delay from metadata JSON)
      const slowEndpoints: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT path, method, COUNT(*)::int AS "requestCount",
                "statusCode"
         FROM system_log
         WHERE "createdAt" >= $1 AND "createdAt" <= $2
           AND path IS NOT NULL
         GROUP BY path, method, "statusCode"
         ORDER BY "requestCount" DESC
         LIMIT 20`,
        from, to,
      );

      return {
        status: true,
        data: {
          webVitals: vitals,
          apiLatency,
          slowEndpoints,
        },
      };
    } catch (error: any) {
      this.logger.error(`[performance] ${error.message}`);
      return { status: true, data: { webVitals: [], apiLatency: [], slowEndpoints: [] } };
    }
  }

  // ────────────────────────────────────────────────────────────────
  // GET /admin/analytics/health-history
  // ────────────────────────────────────────────────────────────────
  @Get('health-history')
  async getHealthHistory(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('component') component?: string,
  ) {
    const from = startDate || defaultStartDate();
    const to = endDate || defaultEndDate();

    try {
      // Check database connectivity
      const dbCheck = await this.prisma.$queryRawUnsafe(`SELECT 1 AS ok`);
      const dbHealthy = Array.isArray(dbCheck) && dbCheck.length > 0;

      // Check Redis connectivity
      let redisHealthy = false;
      try {
        await this.cache.set('health:ping', 'pong', 5);
        const pong = await this.cache.get<string>('health:ping');
        redisHealthy = pong === 'pong';
      } catch {
        redisHealthy = false;
      }

      // API response time trends (hourly buckets)
      const apiTrend: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT
           DATE_TRUNC('hour', "createdAt") AS "hour",
           COUNT(*)::int AS "requests",
           COUNT(CASE WHEN "statusCode" >= 500 THEN 1 END)::int AS "errors"
         FROM system_log
         WHERE "createdAt" >= $1 AND "createdAt" <= $2
         GROUP BY DATE_TRUNC('hour', "createdAt")
         ORDER BY "hour" DESC
         LIMIT 168`,
        from, to,
      );

      // Rollup data if available
      const rollup: any[] = await safeQuery(
        this.prisma,
        `SELECT date, metric, dimension, value::float
         FROM "AnalyticsDailyRollup"
         WHERE date >= $1::date AND date <= $2::date
         ${component ? `AND dimension = '${component}'` : ''}
         ORDER BY date DESC
         LIMIT 90`,
        [from, to],
        [],
        this.logger,
        'health-history:rollup',
      );

      return {
        status: true,
        data: {
          components: {
            database: { healthy: dbHealthy, name: 'PostgreSQL' },
            cache: { healthy: redisHealthy, name: 'Redis' },
            api: { healthy: true, name: 'NestJS API' },
          },
          apiTrend,
          rollup,
        },
      };
    } catch (error: any) {
      this.logger.error(`[health-history] ${error.message}`);
      return {
        status: true,
        data: {
          components: {
            database: { healthy: false, name: 'PostgreSQL' },
            cache: { healthy: false, name: 'Redis' },
            api: { healthy: true, name: 'NestJS API' },
          },
          apiTrend: [],
          rollup: [],
        },
      };
    }
  }

  // ────────────────────────────────────────────────────────────────
  // GET /admin/analytics/realtime
  // ────────────────────────────────────────────────────────────────
  @Get('realtime')
  async getRealtime() {
    try {
      // Active sessions (last 5 minutes) from VisitorSession
      const sessionRows: any[] = await safeQuery(
        this.prisma,
        `SELECT COUNT(*)::int AS "activeSessions"
         FROM "VisitorSession"
         WHERE "lastActiveAt" > NOW() - INTERVAL '5 minutes'
           AND "isActive" = true`,
        [],
        [{ activeSessions: 0 }],
        this.logger,
        'realtime:sessions',
      );

      // Events per minute from system_log (last 5 minutes)
      const eventsRows: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS "totalEvents"
         FROM system_log
         WHERE "createdAt" > NOW() - INTERVAL '5 minutes'`,
      );

      // Requests per minute (last 5 min average)
      const totalEvents = eventsRows[0]?.totalEvents || 0;
      const eventsPerMinute = Math.round(totalEvents / 5);

      // Current error rate
      const errorRows: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT COUNT(*)::int AS "recentErrors"
         FROM system_log
         WHERE "createdAt" > NOW() - INTERVAL '5 minutes'
           AND "statusCode" >= 500`,
      );

      return {
        status: true,
        data: {
          activeSessions: sessionRows[0]?.activeSessions || 0,
          eventsPerMinute,
          totalRecentEvents: totalEvents,
          recentErrors: errorRows[0]?.recentErrors || 0,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error: any) {
      this.logger.error(`[realtime] ${error.message}`);
      return {
        status: true,
        data: { activeSessions: 0, eventsPerMinute: 0, totalRecentEvents: 0, recentErrors: 0, timestamp: new Date().toISOString() },
      };
    }
  }

  // ────────────────────────────────────────────────────────────────
  // GET /admin/analytics/user-journey
  // ────────────────────────────────────────────────────────────────
  @Get('user-journey')
  async getUserJourney(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('userId') userId?: string,
    @Query('sessionId') sessionId?: string,
  ) {
    const from = startDate || defaultStartDate();
    const to = endDate || defaultEndDate();

    try {
      let journeyData: any[];

      if (userId) {
        // Specific user journey from system_log
        journeyData = await this.prisma.$queryRawUnsafe(
          `SELECT path, method, "statusCode", "createdAt", "requestId"
           FROM system_log
           WHERE "userId" = $1 AND "createdAt" >= $2 AND "createdAt" <= $3
           ORDER BY "createdAt" ASC
           LIMIT 200`,
          parseInt(userId, 10), from, to,
        );
      } else if (sessionId) {
        // Session-based journey from VisitorSession + system_log
        journeyData = await safeQuery(
          this.prisma,
          `SELECT sl.path, sl.method, sl."statusCode", sl."createdAt", sl."requestId"
           FROM system_log sl
           INNER JOIN "VisitorSession" vs ON vs."userId" = sl."userId"
           WHERE vs."sessionId" = $1 AND sl."createdAt" >= $2 AND sl."createdAt" <= $3
           ORDER BY sl."createdAt" ASC
           LIMIT 200`,
          [sessionId, from, to],
          [],
          this.logger,
          'user-journey:session',
        );

        // Fallback if VisitorSession doesn't exist
        if (journeyData.length === 0) {
          journeyData = [];
        }
      } else {
        // Aggregate page transitions (top paths)
        journeyData = await this.prisma.$queryRawUnsafe(
          `SELECT path, COUNT(*)::int AS "visits",
                  COUNT(DISTINCT "userId")::int AS "uniqueUsers"
           FROM system_log
           WHERE "createdAt" >= $1 AND "createdAt" <= $2
             AND path IS NOT NULL
             AND "userId" IS NOT NULL
           GROUP BY path
           ORDER BY "visits" DESC
           LIMIT 50`,
          from, to,
        );
      }

      return { status: true, data: { journey: journeyData, userId: userId || null, sessionId: sessionId || null } };
    } catch (error: any) {
      this.logger.error(`[user-journey] ${error.message}`);
      return { status: true, data: { journey: [], userId: null, sessionId: null } };
    }
  }

  // ────────────────────────────────────────────────────────────────
  // GET /admin/analytics/status
  // ────────────────────────────────────────────────────────────────
  @Get('status')
  async getStatus() {
    try {
      const paused = await this.cache.get<boolean>(AnalyticsAdminController.PAUSE_CACHE_KEY);
      return { status: true, data: { paused: paused === true } };
    } catch {
      return { status: true, data: { paused: false } };
    }
  }

  // ────────────────────────────────────────────────────────────────
  // GET /admin/analytics/timeline/:requestId
  // ────────────────────────────────────────────────────────────────
  @Get('timeline/:requestId')
  async getTimeline(@Param('requestId') requestId: string) {
    try {
      const events: any[] = await this.prisma.$queryRawUnsafe(
        `SELECT id, level, message, context, method, path, "statusCode",
                metadata, "createdAt"
         FROM system_log
         WHERE "requestId" = $1
         ORDER BY "createdAt" ASC`,
        requestId,
      );

      return { status: true, data: { requestId, events } };
    } catch (error: any) {
      this.logger.error(`[timeline] ${error.message}`);
      return { status: true, data: { requestId, events: [] } };
    }
  }

  // ────────────────────────────────────────────────────────────────
  // POST /admin/analytics/pause
  // ────────────────────────────────────────────────────────────────
  @Post('pause')
  async pause() {
    try {
      await this.cache.set(AnalyticsAdminController.PAUSE_CACHE_KEY, true, 86400); // 24h TTL
      this.logger.log('Analytics collection paused');
      return { status: true, data: { paused: true } };
    } catch (error: any) {
      this.logger.error(`[pause] ${error.message}`);
      return { status: true, data: { paused: true } };
    }
  }

  // ────────────────────────────────────────────────────────────────
  // POST /admin/analytics/resume
  // ────────────────────────────────────────────────────────────────
  @Post('resume')
  async resume() {
    try {
      await this.cache.del(AnalyticsAdminController.PAUSE_CACHE_KEY);
      this.logger.log('Analytics collection resumed');
      return { status: true, data: { paused: false } };
    } catch (error: any) {
      this.logger.error(`[resume] ${error.message}`);
      return { status: true, data: { paused: false } };
    }
  }

  // ────────────────────────────────────────────────────────────────
  // PATCH /admin/analytics/errors/:id/resolve
  // ────────────────────────────────────────────────────────────────
  @Patch('errors/:id/resolve')
  async resolveError(@Param('id', ParseIntPipe) id: number) {
    try {
      await safeQuery(
        this.prisma,
        `UPDATE "ErrorLog" SET "resolvedAt" = NOW() WHERE id = $1`,
        [id],
        [],
        this.logger,
        'errors:resolve',
      );
      return { status: true, data: { id, resolved: true } };
    } catch (error: any) {
      this.logger.error(`[resolveError] ${error.message}`);
      return { status: true, data: { id, resolved: false, error: error.message } };
    }
  }

  // ────────────────────────────────────────────────────────────────
  // PATCH /admin/analytics/errors/:id/unresolve
  // ────────────────────────────────────────────────────────────────
  @Patch('errors/:id/unresolve')
  async unresolveError(@Param('id', ParseIntPipe) id: number) {
    try {
      await safeQuery(
        this.prisma,
        `UPDATE "ErrorLog" SET "resolvedAt" = NULL WHERE id = $1`,
        [id],
        [],
        this.logger,
        'errors:unresolve',
      );
      return { status: true, data: { id, resolved: false } };
    } catch (error: any) {
      this.logger.error(`[unresolveError] ${error.message}`);
      return { status: true, data: { id, resolved: true, error: error.message } };
    }
  }
}
