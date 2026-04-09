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
  Delete,
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
 * Normalize endDate: if date-only (YYYY-MM-DD), append T23:59:59.999Z
 * so queries include the entire end day, not just midnight.
 */
function normalizeEndDate(endDate: string): string {
  if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return `${endDate}T23:59:59.999Z`;
  }
  return endDate;
}

/**
 * Convert Prisma Decimal / BigInt strings to JS numbers in raw query results.
 * Prisma serializes PostgreSQL `numeric` (from ROUND, AVG, PERCENTILE_CONT)
 * as Decimal strings (e.g. "35225.5") and `bigint` as string. This helper
 * recursively converts all such values to plain JS numbers in any object/array,
 * while leaving Date objects and non-numeric strings untouched.
 */
function numericize<T>(val: T): T {
  if (val === null || val === undefined) return val;
  if (typeof val === 'bigint') return Number(val) as unknown as T;
  if (val instanceof Date) return val;
  if (Array.isArray(val)) return val.map(numericize) as unknown as T;
  if (typeof val === 'object') {
    // Prisma 7 Decimal objects have a toNumber() method — convert directly
    if (typeof (val as any).toNumber === 'function') {
      return (val as any).toNumber() as unknown as T;
    }
    const out: any = {};
    for (const [k, v] of Object.entries(val as any)) {
      if (v !== null && typeof v === 'object' && typeof (v as any).toNumber === 'function') {
        out[k] = (v as any).toNumber();
      } else if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && v.length < 16) {
        out[k] = Number(v);
      } else {
        out[k] = numericize(v);
      }
    }
    return out as T;
  }
  return val;
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
    return numericize(result) as T;
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

  /** Wrapper: run raw SQL and auto-convert Prisma Decimal/BigInt strings to numbers */
  private async rawQuery<T = any[]>(sql: string, ...params: any[]): Promise<T> {
    const result = await this.prisma.$queryRawUnsafe(sql, ...params);
    return numericize(result) as T;
  }

  // ────────────────────────────────────────────────────────────────
  // GET /admin/analytics/overview
  // ────────────────────────────────────────────────────────────────
  @Get('overview')
  async getOverview(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const from = startDate || defaultStartDate();
    const to = normalizeEndDate(endDate || defaultEndDate());

    try {
      // Core metrics from system_log (always exists)
      const coreRows: any[] = await this.rawQuery(
        `SELECT
           (SELECT COUNT(*)::int FROM system_log WHERE "createdAt" >= $1 AND "createdAt" <= $2) AS "totalRequests",
           (SELECT COUNT(*)::int FROM system_log WHERE "createdAt" >= $1 AND "createdAt" <= $2 AND "statusCode" >= 500) AS "serverErrors",
           (SELECT COUNT(*)::int FROM system_log WHERE "createdAt" >= $1 AND "createdAt" <= $2 AND "statusCode" >= 400 AND "statusCode" < 500) AS "clientErrors"`,
        from, to,
      );

      // Product engagement metrics
      const productRows: any[] = await this.rawQuery(
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

      const totalErrors = (core.serverErrors || 0) + (core.clientErrors || 0);

      // Daily events breakdown (hourly buckets for the period)
      const dailyEventsRows: any[] = await safeQuery(
        this.prisma,
        `SELECT DATE_TRUNC('day', "createdAt")::date AS "date",
                COUNT(*)::int AS "count"
         FROM system_log
         WHERE "createdAt" >= $1 AND "createdAt" <= $2
         GROUP BY DATE_TRUNC('day', "createdAt")
         ORDER BY "date" ASC`,
        [from, to],
        [],
        this.logger,
        'overview:dailyEvents',
      );

      // Top event types (by HTTP method + status pattern)
      const topEventsRows: any[] = await safeQuery(
        this.prisma,
        `SELECT method AS "name", COUNT(*)::int AS "count"
         FROM system_log
         WHERE "createdAt" >= $1 AND "createdAt" <= $2
           AND method IS NOT NULL
         GROUP BY method
         ORDER BY "count" DESC
         LIMIT 10`,
        [from, to],
        [],
        this.logger,
        'overview:topEvents',
      );

      // Top pages (most visited paths) — frontend reads .url
      const topPagesRows: any[] = await safeQuery(
        this.prisma,
        `SELECT path AS "url", COUNT(*)::int AS "count"
         FROM system_log
         WHERE "createdAt" >= $1 AND "createdAt" <= $2
           AND path IS NOT NULL
         GROUP BY path
         ORDER BY "count" DESC
         LIMIT 10`,
        [from, to],
        [],
        this.logger,
        'overview:topPages',
      );

      // Avg API latency from system_log metadata.delay
      let avgApiLatencyMs = 0;
      try {
        const latencyRow: any[] = await this.rawQuery(
          `SELECT ROUND(AVG(NULLIF(REGEXP_REPLACE(metadata->>'delay','[^0-9.]','','g'),'')::numeric),0) AS "avg"
           FROM system_log
           WHERE "createdAt" >= $1::timestamp AND "createdAt" <= $2::timestamp
             AND metadata->>'delay' IS NOT NULL`,
          from, to,
        );
        avgApiLatencyMs = Number(latencyRow[0]?.avg) || 0;
      } catch {}

      return {
        status: true,
        data: {
          kpis: {
            totalEvents: core.totalRequests || 0,
            totalSessions: sessions.totalSessions || 0,
            bounceRate: 0,
            unresolvedErrors: errors.unresolvedErrors || (core.serverErrors || 0),
            totalErrors,
            avgApiLatencyMs,
          },
          dailyEvents: dailyEventsRows,
          topEvents: topEventsRows,
          topPages: topPagesRows,
          topCountries: [],
        },
      };
    } catch (error: any) {
      this.logger.error(`[overview] ${error.message}`);
      return {
        status: true,
        data: {
          kpis: {
            totalEvents: 0, totalSessions: 0, bounceRate: 0,
            unresolvedErrors: 0, totalErrors: 0, avgApiLatencyMs: 0,
          },
          dailyEvents: [],
          topEvents: [],
          topPages: [],
          topCountries: [],
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
    const to = normalizeEndDate(endDate || defaultEndDate());
    const offset = ((page || 1) - 1) * (limit || 20);

    try {
      // Top viewed products
      const topViewed: any[] = await this.rawQuery(
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
      const topClicked: any[] = await this.rawQuery(
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
      const topSearched: any[] = await this.rawQuery(
        `SELECT ps."searchTerm", COUNT(*)::int AS "searchCount",
                SUM(CASE WHEN ps.clicked THEN 1 ELSE 0 END)::int AS "clickCount"
         FROM "ProductSearch" ps
         WHERE ps."createdAt" >= $1 AND ps."createdAt" <= $2
         GROUP BY ps."searchTerm"
         ORDER BY "searchCount" DESC
         LIMIT 20`,
        from, to,
      );

      // Aggregate KPI totals
      const kpiRows: any[] = await this.rawQuery(
        `SELECT
           (SELECT COALESCE(SUM("viewCount"), 0)::int FROM "ProductView" WHERE "lastViewedAt" >= $1 AND "lastViewedAt" <= $2) AS "totalViews",
           (SELECT COUNT(*)::int FROM "ProductClick" WHERE "createdAt" >= $1 AND "createdAt" <= $2) AS "totalClicks",
           (SELECT COUNT(*)::int FROM "ProductSearch" WHERE "createdAt" >= $1 AND "createdAt" <= $2) AS "totalSearches"`,
        from, to,
      );
      const kpi = kpiRows[0] || { totalViews: 0, totalClicks: 0, totalSearches: 0 };

      // Total count for pagination
      const countRows: any[] = await this.rawQuery(
        `SELECT COUNT(DISTINCT "productId")::int AS total
         FROM "ProductView"
         WHERE "lastViewedAt" >= $1 AND "lastViewedAt" <= $2`,
        from, to,
      );
      const total = countRows[0]?.total || 0;
      const currentLimit = limit || 20;
      const pages = Math.max(1, Math.ceil(total / currentLimit));

      // Merge — frontend reads: productId, productName, viewCount, clickCount, uniqueViewers
      const products = topViewed.map((v: any) => ({
        productId: v.productId,
        productName: v.name_en || v.name_ar || `Product #${v.productId}`,
        viewCount: v.totalViews || 0,
        clickCount: topClicked.find((c: any) => c.productId === v.productId)?.totalClicks || 0,
        uniqueViewers: 0,
      }));

      return {
        status: true,
        data: {
          kpis: {
            totalViews: kpi.totalViews || 0,
            totalClicks: kpi.totalClicks || 0,
            uniqueProducts: total,
          },
          products,
          total,
          pages,
        },
      };
    } catch (error: any) {
      this.logger.error(`[products] ${error.message}`);
      return { status: true, data: { kpis: { totalViews: 0, totalClicks: 0, uniqueProducts: 0 }, products: [], total: 0, pages: 1 } };
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
    const to = normalizeEndDate(endDate || defaultEndDate());

    try {
      // Stage 1: Product views
      const viewRows: any[] = await this.rawQuery(
        `SELECT COUNT(*)::int AS count FROM "ProductView" WHERE "lastViewedAt" >= $1 AND "lastViewedAt" <= $2`,
        from, to,
      );

      // Stage 2: Added to cart (active carts)
      const cartRows: any[] = await this.rawQuery(
        `SELECT COUNT(*)::int AS count FROM "Cart" WHERE status = 'ACTIVE' AND "createdAt" >= $1 AND "createdAt" <= $2 AND "deletedAt" IS NULL`,
        from, to,
      );

      // Stage 3: Orders placed (not cancelled)
      const orderRows: any[] = await this.rawQuery(
        `SELECT COUNT(*)::int AS count FROM "OrderProducts" WHERE "orderProductStatus" != 'CANCELLED' AND "createdAt" >= $1 AND "createdAt" <= $2 AND "deletedAt" IS NULL`,
        from, to,
      );

      // Stage 4: Delivered
      const deliveredRows: any[] = await this.rawQuery(
        `SELECT COUNT(*)::int AS count FROM "OrderProducts" WHERE "orderProductStatus" = 'DELIVERED' AND "createdAt" >= $1 AND "createdAt" <= $2 AND "deletedAt" IS NULL`,
        from, to,
      );

      const steps = [
        { name: 'View', count: viewRows[0]?.count || 0 },
        { name: 'Add to Cart', count: cartRows[0]?.count || 0 },
        { name: 'Checkout', count: orderRows[0]?.count || 0 },
        { name: 'Delivered', count: deliveredRows[0]?.count || 0 },
      ];

      const viewCount = steps[0].count;
      const deliveredCount = steps[3].count;
      const conversionRate = viewCount > 0
        ? Math.round((deliveredCount / viewCount) * 10000) / 100
        : 0;

      return { status: true, data: { steps, conversionRate } };
    } catch (error: any) {
      this.logger.error(`[funnel] ${error.message}`);
      return { status: true, data: { steps: [], conversionRate: 0 } };
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
    const to = normalizeEndDate(endDate || defaultEndDate());
    const limit = 20;
    const offset = ((page || 1) - 1) * limit;

    try {
      // Top search terms with click-through rate
      const topQueries: any[] = await this.rawQuery(
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
      const noResults: any[] = await this.rawQuery(
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
      const statsRows: any[] = await this.rawQuery(
        `SELECT
           COUNT(*)::int AS "totalSearches",
           SUM(CASE WHEN clicked THEN 1 ELSE 0 END)::int AS "totalClicked",
           COUNT(DISTINCT "searchTerm")::int AS "uniqueTerms"
         FROM "ProductSearch"
         WHERE "createdAt" >= $1 AND "createdAt" <= $2`,
        from, to,
      );

      const stats = statsRows[0] || { totalSearches: 0, totalClicked: 0, uniqueTerms: 0 };

      const overallCtr = stats.totalSearches > 0
        ? Math.round((stats.totalClicked / stats.totalSearches) * 1000) / 10
        : 0;

      // Reshape topQueries → terms — frontend reads .query, .count, .clickedCount
      const terms = topQueries.map((q: any) => ({
        query: q.searchTerm,
        count: q.totalSearches || 0,
        clickedCount: q.clickedCount || 0,
        ctr: q.ctr ? Number(q.ctr) : 0,
      }));

      // Reshape noResults → zeroResults — frontend reads .query, .count
      const zeroResults = noResults.map((q: any) => ({
        query: q.searchTerm,
        count: q.searchCount || 0,
      }));

      // Total count for pagination
      const totalCountRows: any[] = await this.rawQuery(
        `SELECT COUNT(DISTINCT "searchTerm")::int AS total
         FROM "ProductSearch"
         WHERE "createdAt" >= $1 AND "createdAt" <= $2`,
        from, to,
      );
      const totalTerms = totalCountRows[0]?.total || 0;
      const pages = Math.max(1, Math.ceil(totalTerms / limit));

      return {
        status: true,
        data: {
          kpis: {
            totalSearches: stats.totalSearches || 0,
            uniqueTerms: stats.uniqueTerms || 0,
            zeroResultCount: zeroResults.length,
            overallCtr,
          },
          terms,
          zeroResults,
          pages,
        },
      };
    } catch (error: any) {
      this.logger.error(`[search] ${error.message}`);
      return {
        status: true,
        data: { kpis: { totalSearches: 0, uniqueTerms: 0, zeroResultCount: 0, overallCtr: 0 }, terms: [], zeroResults: [], pages: 1 },
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
    const to = normalizeEndDate(endDate || defaultEndDate());
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
      let finalErrors = errors;
      if (errors.length === 0) {
        const sysErrors: any[] = await this.rawQuery(
          `SELECT id, message, context AS source, level, path AS "pageUrl",
                  "statusCode", "createdAt" AS "lastSeenAt", "createdAt" AS "firstSeenAt",
                  "errorStack" AS stack, metadata, 1 AS count
           FROM system_log
           WHERE "createdAt" >= $1 AND "createdAt" <= $2
             AND level = 'ERROR'
           ORDER BY "createdAt" DESC
           LIMIT $3 OFFSET $4`,
          from, to, limit, offset,
        );
        // Add fingerprint for frontend key/display
        finalErrors = sysErrors.map((e: any) => ({
          ...e,
          fingerprint: e.message ? e.message.slice(0, 40) : `err-${e.id}`,
        }));
      }

      // Total error count for pagination
      const totalRows: any[] = await safeQuery(
        this.prisma,
        `SELECT COUNT(*)::int AS total FROM "ErrorLog" ${conditions}`,
        params,
        [{ total: 0 }],
        this.logger,
        'errors:total',
      );
      let total = totalRows[0]?.total || 0;

      // If ErrorLog didn't have data, count from system_log
      if (total === 0) {
        const sysCountRows: any[] = await this.rawQuery(
          `SELECT COUNT(*)::int AS total FROM system_log
           WHERE "createdAt" >= $1 AND "createdAt" <= $2 AND level = 'ERROR'`,
          from, to,
        );
        total = sysCountRows[0]?.total || 0;
      }

      const pages = Math.max(1, Math.ceil(total / limit));

      // Error trend (daily counts)
      const trend: any[] = await safeQuery(
        this.prisma,
        `SELECT DATE_TRUNC('day', "lastSeenAt")::date AS "date",
                COUNT(*)::int AS "count"
         FROM "ErrorLog"
         WHERE "lastSeenAt" >= $1 AND "lastSeenAt" <= $2
         GROUP BY DATE_TRUNC('day', "lastSeenAt")
         ORDER BY "date" ASC`,
        [from, to],
        [],
        this.logger,
        'errors:trend',
      );

      return { status: true, data: { errors: finalErrors, total, pages, trend, release: null } };
    } catch (error: any) {
      this.logger.error(`[errors] ${error.message}`);
      return { status: true, data: { errors: [], total: 0, pages: 1, trend: [], release: null } };
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
    const to = normalizeEndDate(endDate || defaultEndDate());

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

      // API latency — use direct $queryRawUnsafe with try/catch for each query
      let apiLatency: any[] = [];
      let overallLatency: any[] = [{ avgMs: 0, p95Ms: 0 }];
      let slowEndpoints: any[] = [];

      // Exclude scraper endpoints from latency KPIs — they're 10-40s Puppeteer calls that distort metrics
      const LATENCY_EXCLUDE = `AND path NOT LIKE '/api/v1/scraper/%'`;

      try {
        apiLatency = await this.rawQuery(
          `SELECT
             CASE WHEN "statusCode" BETWEEN 200 AND 299 THEN '2xx'
                  WHEN "statusCode" BETWEEN 300 AND 399 THEN '3xx'
                  WHEN "statusCode" BETWEEN 400 AND 499 THEN '4xx'
                  WHEN "statusCode" >= 500 THEN '5xx' ELSE 'other' END AS "statusGroup",
             COUNT(*)::int AS "requestCount",
             ROUND(AVG(NULLIF(REGEXP_REPLACE(metadata->>'delay', '[^0-9.]', '', 'g'), '')::numeric), 1) AS "avgDuration"
           FROM system_log
           WHERE "createdAt" >= $1::timestamp AND "createdAt" <= $2::timestamp
             AND metadata->>'delay' IS NOT NULL ${LATENCY_EXCLUDE}
           GROUP BY "statusGroup" ORDER BY "statusGroup"`,
          from, to,
        );
      } catch (e: any) { this.logger.warn(`[performance:apiLatency] ${e.message}`); }

      try {
        overallLatency = await this.rawQuery(
          `SELECT
             ROUND(AVG(NULLIF(REGEXP_REPLACE(metadata->>'delay', '[^0-9.]', '', 'g'), '')::numeric), 1) AS "avgMs",
             ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY NULLIF(REGEXP_REPLACE(metadata->>'delay', '[^0-9.]', '', 'g'), '')::numeric)::numeric, 1) AS "p95Ms"
           FROM system_log
           WHERE "createdAt" >= $1::timestamp AND "createdAt" <= $2::timestamp
             AND metadata->>'delay' IS NOT NULL ${LATENCY_EXCLUDE}`,
          from, to,
        );
      } catch (e: any) { this.logger.warn(`[performance:overallLatency] ${e.message}`); }

      try {
        slowEndpoints = await this.rawQuery(
          `SELECT path, method, COUNT(*)::int AS "requestCount",
                  ROUND(AVG(NULLIF(REGEXP_REPLACE(metadata->>'delay', '[^0-9.]', '', 'g'), '')::numeric), 1) AS "avgMs",
                  ROUND(MAX(NULLIF(REGEXP_REPLACE(metadata->>'delay', '[^0-9.]', '', 'g'), '')::numeric), 1) AS "maxMs"
           FROM system_log
           WHERE "createdAt" >= $1::timestamp AND "createdAt" <= $2::timestamp
             AND path IS NOT NULL AND metadata->>'delay' IS NOT NULL
           GROUP BY path, method ORDER BY "avgMs" DESC NULLS LAST LIMIT 20`,
          from, to,
        );
      } catch (e: any) { this.logger.warn(`[performance:slowEndpoints] ${e.message}`); }

      // Latency trend (hourly buckets, excludes scraper)
      const latencyTrend: any[] = await safeQuery(
        this.prisma,
        `SELECT DATE_TRUNC('hour', "createdAt") AS "hour",
                COUNT(*)::int AS "requests",
                ROUND(AVG(NULLIF(REGEXP_REPLACE(metadata->>'delay', '[^0-9.]', '', 'g'), '')::numeric), 1) AS "avgMs"
         FROM system_log
         WHERE "createdAt" >= $1 AND "createdAt" <= $2
           AND metadata->>'delay' IS NOT NULL
           AND path NOT LIKE '/api/v1/scraper/%'
         GROUP BY DATE_TRUNC('hour', "createdAt")
         ORDER BY "hour" ASC
         LIMIT 168`,
        [from, to],
        [],
        this.logger,
        'performance:latencyTrend',
      );

      // Build metrics array — frontend expects { name, avg, percentiles: { p50, p95 } }
      const avgMs = Number(overallLatency[0]?.avgMs) || 0;
      const p95Ms = Number(overallLatency[0]?.p95Ms) || 0;
      const vitalMetrics = vitals.map((v: any) => ({
        name: v.metricName || v.name,
        avg: Number(v.avgValue) || 0,
        percentiles: { p50: Number(v.avgValue) || 0, p95: Number(v.maxValue) || 0 },
        min: Number(v.minValue) || 0,
        max: Number(v.maxValue) || 0,
        sampleCount: Number(v.sampleCount) || 0,
      }));
      // Only add system_log-based api_latency if PerformanceMetric doesn't already have one
      const hasApiLatency = vitalMetrics.some((m: any) => m.name === 'api_latency');
      const metricsArray = hasApiLatency
        ? vitalMetrics
        : [...vitalMetrics, { name: 'api_latency', avg: avgMs, percentiles: { p50: avgMs, p95: p95Ms } }];

      // Convert all Decimal strings to numbers; rename fields to match frontend expectations
      return {
        status: true,
        data: {
          metrics: metricsArray,
          slowestEndpoints: slowEndpoints.map((ep: any) => ({
            endpoint: ep.path,
            method: ep.method,
            avgMs: Number(ep.avgMs) || 0,
            p95Ms: Number(ep.maxMs) || 0,
            count: Number(ep.requestCount) || 0,
          })),
          slowPrismaQueries: [],
          latencyTrend: (latencyTrend as any[]).map((t: any) => ({
            date: t.hour ? new Date(t.hour).toISOString().slice(0, 10) : '',
            avgMs: Number(t.avgMs) || 0,
            requests: Number(t.requests) || 0,
          })),
        },
      };
    } catch (error: any) {
      this.logger.error(`[performance] ${error.message}`);
      return { status: true, data: { metrics: [], slowestEndpoints: [], slowPrismaQueries: [], latencyTrend: [] } };
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
    const to = normalizeEndDate(endDate || defaultEndDate());

    try {
      // Check database connectivity
      const dbCheck = await this.rawQuery(`SELECT 1 AS ok`);
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
      const apiTrend: any[] = await this.rawQuery(
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

      const healthyCount = [dbHealthy, redisHealthy, true].filter(Boolean).length;
      const totalComponents = 3;
      const uptimePercent = Math.round((healthyCount / totalComponents) * 1000) / 10;

      // Compute rough response times from recent system_log
      let dbAvgMs = 0;
      try {
        const dbLatency: any[] = await this.rawQuery(
          `SELECT ROUND(AVG(NULLIF(REGEXP_REPLACE(metadata->>'delay','[^0-9.]','','g'),'')::numeric),1) AS "avgMs"
           FROM system_log
           WHERE "createdAt" > NOW() - INTERVAL '1 hour' AND metadata->>'delay' IS NOT NULL`,
        );
        dbAvgMs = Number(dbLatency[0]?.avgMs) || 0;
      } catch {}

      // Frontend expects: { name, currentStatus, avgResponseMs, uptimePercent }
      return {
        status: true,
        data: {
          summary: [
            { name: 'database', currentStatus: dbHealthy ? 'healthy' : 'down', avgResponseMs: dbAvgMs, uptimePercent },
            { name: 'redis', currentStatus: redisHealthy ? 'healthy' : 'down', avgResponseMs: null, uptimePercent },
            { name: 'api', currentStatus: 'healthy', avgResponseMs: dbAvgMs, uptimePercent },
          ],
          // Frontend expects: { checkedAt, component, status, responseMs, details }
          history: apiTrend.map((row: any) => ({
            checkedAt: row.hour ? new Date(row.hour).toISOString() : null,
            component: 'api',
            status: Number(row.errors) > 0 ? 'degraded' : 'healthy',
            responseMs: dbAvgMs,
            details: { requests: Number(row.requests), errors: Number(row.errors) },
          })),
        },
      };
    } catch (error: any) {
      this.logger.error(`[health-history] ${error.message}`);
      return {
        status: true,
        data: {
          summary: [
            { name: 'database', currentStatus: 'unknown', avgResponseMs: null, uptimePercent: 0 },
            { name: 'redis', currentStatus: 'unknown', avgResponseMs: null, uptimePercent: 0 },
            { name: 'api', currentStatus: 'healthy', avgResponseMs: null, uptimePercent: 0 },
          ],
          history: [],
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
      const eventsRows: any[] = await this.rawQuery(
        `SELECT COUNT(*)::int AS "totalEvents"
         FROM system_log
         WHERE "createdAt" > NOW() - INTERVAL '5 minutes'`,
      );

      // Requests per minute (last 5 min average)
      const totalEvents = eventsRows[0]?.totalEvents || 0;
      const eventsPerMinute = Math.round(totalEvents / 5);

      // Current error rate
      const errorRows: any[] = await this.rawQuery(
        `SELECT COUNT(*)::int AS "recentErrors"
         FROM system_log
         WHERE "createdAt" > NOW() - INTERVAL '5 minutes'
           AND "statusCode" >= 500`,
      );

      const activeVisitors = sessionRows[0]?.activeSessions || 0;

      // Recent active sessions list
      const activeSessionsList: any[] = await safeQuery(
        this.prisma,
        `SELECT "sessionId", "userId", "lastActiveAt", "startedAt", "pageUrl"
         FROM "VisitorSession"
         WHERE "lastActiveAt" > NOW() - INTERVAL '5 minutes'
           AND "isActive" = true
         ORDER BY "lastActiveAt" DESC
         LIMIT 20`,
        [],
        [],
        this.logger,
        'realtime:activeSessionsList',
      );

      // Recent events from system_log
      const recentEvents: any[] = await this.rawQuery(
        `SELECT id, path, method, "statusCode", "createdAt"
         FROM system_log
         WHERE "createdAt" > NOW() - INTERVAL '5 minutes'
         ORDER BY "createdAt" DESC
         LIMIT 20`,
      );

      // Avg latency for KPI card
      let avgLatencyMs = 0;
      try {
        const lat: any[] = await this.rawQuery(
          `SELECT ROUND(AVG(NULLIF(REGEXP_REPLACE(metadata->>'delay','[^0-9.]','','g'),'')::numeric),0) AS "avg"
           FROM system_log WHERE "createdAt" > NOW() - INTERVAL '5 minutes' AND metadata->>'delay' IS NOT NULL`,
        );
        avgLatencyMs = Number(lat[0]?.avg) || 0;
      } catch {}

      // Map fields to match frontend expectations
      return {
        status: true,
        data: {
          activeVisitors,
          eventsPerMinute,
          kpis: {
            activeVisitors,
            eventsPerMinute,
            eventsLast5m: totalEvents,
            avgLatencyMs,
          },
          activeSessions: activeSessionsList.map((s: any) => ({
            sessionId: s.sessionId,
            userId: s.userId,
            currentPage: s.pageUrl ?? '/',
            lastSeenAt: s.lastActiveAt,
            pageCount: 0,
          })),
          recentEvents: recentEvents.map((e: any) => ({
            eventName: `${e.method} ${e.statusCode}`,
            pageUrl: e.path,
            createdAt: e.createdAt,
          })),
        },
      };
    } catch (error: any) {
      this.logger.error(`[realtime] ${error.message}`);
      return {
        status: true,
        data: {
          activeVisitors: 0,
          eventsPerMinute: 0,
          kpis: { activeVisitors: 0, eventsPerMinute: 0, eventsLast5m: 0, avgLatencyMs: 0 },
          activeSessions: [],
          recentEvents: [],
        },
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
    const to = normalizeEndDate(endDate || defaultEndDate());

    try {
      let journeyData: any[];

      if (userId) {
        // Specific user journey from system_log
        journeyData = await this.rawQuery(
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
        journeyData = await this.rawQuery(
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

      // Fetch recent sessions list
      const sessions: any[] = await safeQuery(
        this.prisma,
        `SELECT "sessionId", "userId", "startedAt", "lastActiveAt", "pageUrl", "isActive"
         FROM "VisitorSession"
         WHERE "startedAt" >= $1 AND "startedAt" <= $2
         ORDER BY "startedAt" DESC
         LIMIT 50`,
        [from, to],
        [],
        this.logger,
        'user-journey:sessions',
      );

      return { status: true, data: { sessions, events: journeyData } };
    } catch (error: any) {
      this.logger.error(`[user-journey] ${error.message}`);
      return { status: true, data: { sessions: [], events: [] } };
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
  // GET /admin/analytics/export   (P2-8)
  // Must be BEFORE any parameterized routes to avoid NestJS routing conflicts
  // ────────────────────────────────────────────────────────────────
  @Get('export')
  async exportAnalytics(
    @Query('type') type: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const from = startDate || defaultStartDate();
    const to = normalizeEndDate(endDate || defaultEndDate());

    let data: any[] = [];
    let filename = 'analytics';

    if (type === 'events') {
      data = await this.rawQuery(
        `SELECT id, level, method, path, "statusCode", metadata->>'delay' as delay, "ipAddress", "createdAt"
         FROM system_log WHERE "createdAt" >= $1 AND "createdAt" <= $2 ORDER BY "createdAt" DESC LIMIT 10000`,
        from, to,
      );
      filename = 'events';
    } else if (type === 'errors') {
      data = await this.rawQuery(
        `SELECT id, level, method, path, "statusCode", message, "createdAt"
         FROM system_log WHERE level = 'ERROR' AND "createdAt" >= $1 AND "createdAt" <= $2 ORDER BY "createdAt" DESC LIMIT 5000`,
        from, to,
      );
      filename = 'errors';
    } else if (type === 'sessions') {
      data = await safeQuery(
        this.prisma,
        `SELECT * FROM "VisitorSession" WHERE "createdAt" >= $1 AND "createdAt" <= $2 ORDER BY "createdAt" DESC LIMIT 5000`,
        [from, to],
        [],
        this.logger,
        'export:sessions',
      );
      filename = 'sessions';
    }

    return { status: true, data, filename: `${filename}_${from}_${to}` };
  }

  // ────────────────────────────────────────────────────────────────
  // DELETE /admin/analytics/user/:userId/data   (P2-11)
  // Must be BEFORE any parameterized routes to avoid NestJS routing conflicts
  // ────────────────────────────────────────────────────────────────
  @Delete('user/:userId/data')
  async deleteUserData(@Param('userId') userId: string) {
    const uid = parseInt(userId, 10);
    if (!uid) return { status: false, message: 'Invalid userId' };

    try {
      const deleted: Record<string, number> = {};

      deleted.productViews = (await this.prisma.$executeRawUnsafe(
        `DELETE FROM "ProductView" WHERE "userId" = $1`, uid,
      )) as number;

      deleted.productClicks = (await this.prisma.$executeRawUnsafe(
        `DELETE FROM "ProductClick" WHERE "userId" = $1`, uid,
      )) as number;

      deleted.productSearches = (await this.prisma.$executeRawUnsafe(
        `DELETE FROM "ProductSearch" WHERE "userId" = $1`, uid,
      )) as number;

      deleted.visitorSessions = (await safeQuery(
        this.prisma,
        `DELETE FROM "VisitorSession" WHERE "userId" = $1`,
        [uid],
        0 as any,
        this.logger,
        'deleteUserData:visitorSessions',
      )) as number;

      deleted.systemLogs = (await this.prisma.$executeRawUnsafe(
        `DELETE FROM system_log WHERE "userId" = $1`, uid,
      )) as number;

      return { status: true, data: deleted };
    } catch (error: any) {
      return { status: false, message: error.message };
    }
  }

  // ────────────────────────────────────────────────────────────────
  // GET /admin/analytics/timeline/:requestId
  // ────────────────────────────────────────────────────────────────
  @Get('timeline/:requestId')
  async getTimeline(@Param('requestId') requestId: string) {
    try {
      const events: any[] = await this.rawQuery(
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
