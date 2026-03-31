import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisBufferService } from './redis-buffer.service';
import { ProductTrackingService } from './product-tracking.service';
import { VisitorService } from './visitor.service';
import { TrackEventDto } from '../dto/track-event.dto';
import { AnalyticsGateway } from '../analytics.gateway';
import * as geoip from 'geoip-lite';

@Injectable()
export class EventCollectorService {
  private readonly logger = new Logger(EventCollectorService.name);
  private lastFlushAt: Date = new Date();
  private eventsToday = 0;
  private dbWritesToday = 0;

  constructor(
    private prisma: PrismaService,
    private redisBuffer: RedisBufferService,
    private productTracking: ProductTrackingService,
    private visitorService: VisitorService,
    @Optional() private gateway?: AnalyticsGateway,
  ) {}

  /**
   * Ingest events into Redis buffer. Never touches PostgreSQL on the request path.
   * Returns immediately (<1ms per event).
   */
  async ingestEvents(
    events: TrackEventDto[],
    ipAddress?: string,
    userAgent?: string,
  ): Promise<number> {
    const paused = await this.redisBuffer.isPaused();
    if (paused) return 0;

    const country = this.resolveCountry(ipAddress);
    const serialized = events.map((event) =>
      JSON.stringify({
        ...event,
        ipAddress: this.anonymizeIp(ipAddress),
        country,
        userAgent,
        source: 'frontend',
        createdAt: new Date().toISOString(),
      }),
    );

    await this.redisBuffer.pushMany(this.redisBuffer.keys.BUFFER_KEY, serialized);
    return events.length;
  }

  /**
   * Ingest a single backend event (from enhanced LoggingInterceptor).
   */
  async ingestBackendEvent(event: Record<string, any>): Promise<void> {
    const paused = await this.redisBuffer.isPaused();
    if (paused) return;

    await this.redisBuffer.push(
      this.redisBuffer.keys.BUFFER_KEY,
      JSON.stringify({ ...event, source: 'backend', createdAt: new Date().toISOString() }),
    );
  }

  /**
   * Flush Redis buffer to PostgreSQL every 10 seconds.
   * Two-phase: PEEK → DB write → CONFIRM. Events stay in Redis until DB succeeds.
   * After 3 consecutive failures, moves batch to dead-letter queue.
   */
  @Cron('*/10 * * * * *')
  async flushBuffer(): Promise<void> {
    const paused = await this.redisBuffer.isPaused();
    if (paused) return;

    const bufferKey = this.redisBuffer.keys.BUFFER_KEY;

    try {
      // Phase 1: PEEK — read without removing
      const rawItems = await this.redisBuffer.peek(bufferKey, 500);
      if (rawItems.length === 0) return;

      const events = rawItems.map((item) => JSON.parse(item));
      const analyticsEvents = [];
      const productEvents = [];
      const heartbeats = [];

      for (const event of events) {
        if (
          event.eventName === 'product_view' ||
          event.eventName === 'product_search' ||
          event.eventName === 'product_click'
        ) {
          productEvents.push(event);
        }

        if (event.eventName === 'session_heartbeat') {
          heartbeats.push(event);
        }

        analyticsEvents.push({
          sessionId: event.sessionId,
          requestId: event.requestId || null,
          userId: event.userId || null,
          deviceId: event.deviceId || null,
          eventName: event.eventName,
          eventType: event.eventType || 'interaction',
          pageUrl: event.pageUrl || null,
          referrer: event.referrer || null,
          locale: event.locale || null,
          currency: event.currency || null,
          tradeRole: event.tradeRole || null,
          metadata: event.metadata || null,
          source: event.source || 'frontend',
          ipAddress: event.ipAddress || null,
          country: event.country || null,
          userAgent: event.userAgent || null,
          clockOffset: event.clockOffset || null,
        });
      }

      // Phase 2: WRITE to DB
      if (analyticsEvents.length > 0) {
        await this.prisma.analyticsEvent.createMany({ data: analyticsEvents });
        this.dbWritesToday++;
        this.eventsToday += analyticsEvents.length;
      }

      // Phase 3: CONFIRM — remove from Redis only after DB success
      await this.redisBuffer.confirmFlush(bufferKey, rawItems.length);

      // Side-effects (non-critical, fire-and-forget)
      for (const pe of productEvents) {
        await this.productTracking.routeEvent(pe).catch(() => {});
      }
      for (const hb of heartbeats) {
        await this.visitorService
          .heartbeat(hb.sessionId, hb.pageUrl)
          .catch(() => {});
      }

      this.lastFlushAt = new Date();
      this.logger.debug(`Flushed ${analyticsEvents.length} events to DB`);

      // Emit real-time stats to admin dashboards
      if (this.gateway && analyticsEvents.length > 0) {
        const activeSessions = await this.prisma.visitorSession.count({
          where: { lastActiveAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } },
        }).catch(() => 0);
        this.gateway.emitStatsUpdate({
          activeVisitors: activeSessions,
          eventsPerMinute: analyticsEvents.length,
        });
        const latest = analyticsEvents[analyticsEvents.length - 1];
        if (latest) {
          this.gateway.emitNewEvent({
            eventName: latest.eventName,
            pageUrl: latest.pageUrl ?? undefined,
            createdAt: new Date().toISOString(),
          });
        }
      }
    } catch (error) {
      this.logger.error(`Buffer flush failed: ${error.message}`);
      // Track failure — after 3 consecutive failures, move to DLQ
      const len = await this.redisBuffer.getListLength(bufferKey);
      if (len > 0) {
        await this.redisBuffer.markFlushFailure(bufferKey, Math.min(len, 500));
      }
    }
  }

  /**
   * Also flush performance metrics buffer (two-phase).
   */
  @Cron('*/10 * * * * *')
  async flushPerfBuffer(): Promise<void> {
    const paused = await this.redisBuffer.isPaused();
    if (paused) return;

    const perfKey = this.redisBuffer.keys.PERF_KEY;

    try {
      const rawItems = await this.redisBuffer.peek(perfKey, 500);
      if (rawItems.length === 0) return;

      const metrics = rawItems.map((item) => {
        const parsed = JSON.parse(item);
        return {
          metricName: parsed.metricName,
          metricValue: parsed.metricValue,
          source: parsed.source || 'backend',
          pageUrl: parsed.pageUrl || null,
          endpoint: parsed.endpoint || null,
          method: parsed.method || null,
          userId: parsed.userId || null,
          sessionId: parsed.sessionId || null,
          requestId: parsed.requestId || null,
        };
      });

      if (metrics.length > 0) {
        await this.prisma.performanceMetric.createMany({ data: metrics });
        this.dbWritesToday++;
      }

      await this.redisBuffer.confirmFlush(perfKey, rawItems.length);
    } catch (error) {
      this.logger.error(`Perf buffer flush failed: ${error.message}`);
    }
  }

  /**
   * Daily cleanup: delete old analytics data.
   * Events/sessions: >90 days. Product tracking: >180 days.
   */
  @Cron('0 3 * * *')
  async cleanupOldData(): Promise<void> {
    const cutoff90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const cutoff180 = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

    try {
      const [events, perf, sessions, views, searches, clicks] =
        await this.prisma.$transaction([
          this.prisma.analyticsEvent.deleteMany({
            where: { createdAt: { lt: cutoff90 } },
          }),
          this.prisma.performanceMetric.deleteMany({
            where: { createdAt: { lt: cutoff90 } },
          }),
          this.prisma.visitorSession.deleteMany({
            where: { startedAt: { lt: cutoff90 } },
          }),
          this.prisma.productView.deleteMany({
            where: { createdAt: { lt: cutoff180 } },
          }),
          this.prisma.productSearch.deleteMany({
            where: { createdAt: { lt: cutoff180 } },
          }),
          this.prisma.productClick.deleteMany({
            where: { createdAt: { lt: cutoff180 } },
          }),
        ]);

      this.logger.log(
        `Cleanup: ${events.count} events, ${perf.count} metrics, ${sessions.count} sessions, ` +
          `${views.count} views, ${searches.count} searches, ${clicks.count} clicks deleted`,
      );
    } catch (error) {
      this.logger.error(`Cleanup failed: ${error.message}`);
    }
  }

  /** Reset daily counters at midnight */
  @Cron('0 0 * * *')
  resetDailyCounters() {
    this.eventsToday = 0;
    this.dbWritesToday = 0;
  }

  /**
   * Nightly rollup: aggregate yesterday's raw data into AnalyticsDailyRollup.
   * Runs at 02:00 — after midnight but before cleanup at 03:00.
   * Dashboard queries use rollups for historical data → fast even at millions of rows.
   */
  @Cron('0 2 * * *')
  async buildDailyRollup(): Promise<void> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const today = new Date(yesterday);
    today.setDate(today.getDate() + 1);

    try {
      // Total events
      const totalEvents = await this.prisma.analyticsEvent.count({
        where: { createdAt: { gte: yesterday, lt: today } },
      });

      // Total sessions + bounced
      const [totalSessions, bouncedSessions] = await this.prisma.$transaction([
        this.prisma.visitorSession.count({
          where: { startedAt: { gte: yesterday, lt: today } },
        }),
        this.prisma.visitorSession.count({
          where: { startedAt: { gte: yesterday, lt: today }, pageCount: { lte: 1 } },
        }),
      ]);

      // Total errors
      const totalErrors = await this.prisma.errorLog.count({
        where: { lastSeenAt: { gte: yesterday, lt: today } },
      });

      // Events by name (top 20)
      const eventsByName = await this.prisma.$queryRaw<Array<{ eventName: string; count: bigint }>>`
        SELECT "eventName", COUNT(*) AS count FROM analytics_event
        WHERE "createdAt" >= ${yesterday} AND "createdAt" < ${today}
        GROUP BY "eventName" ORDER BY count DESC LIMIT 20
      `;

      // Sessions by country (top 20)
      const sessionsByCountry = await this.prisma.$queryRaw<Array<{ country: string; count: bigint }>>`
        SELECT country, COUNT(*) AS count FROM visitor_session
        WHERE "startedAt" >= ${yesterday} AND "startedAt" < ${today} AND country IS NOT NULL
        GROUP BY country ORDER BY count DESC LIMIT 20
      `;

      // Build rollup rows
      const rows: Array<{ date: Date; metric: string; dimension: string | null; value: number }> = [
        { date: yesterday, metric: 'events', dimension: null, value: totalEvents },
        { date: yesterday, metric: 'sessions', dimension: null, value: totalSessions },
        { date: yesterday, metric: 'bounced', dimension: null, value: bouncedSessions },
        { date: yesterday, metric: 'errors', dimension: null, value: totalErrors },
        ...eventsByName.map((r) => ({
          date: yesterday,
          metric: 'events_by_name',
          dimension: r.eventName,
          value: Number(r.count),
        })),
        ...sessionsByCountry.map((r) => ({
          date: yesterday,
          metric: 'sessions_by_country',
          dimension: r.country,
          value: Number(r.count),
        })),
      ];

      // Upsert rows (idempotent — safe to re-run)
      for (const row of rows) {
        await this.prisma.analyticsDailyRollup.upsert({
          where: {
            date_metric_dimension: {
              date: row.date,
              metric: row.metric,
              dimension: row.dimension ?? '',
            },
          },
          update: { value: row.value },
          create: { ...row, dimension: row.dimension ?? '' },
        });
      }

      this.logger.log(
        `Daily rollup: ${rows.length} rows for ${yesterday.toISOString().slice(0, 10)}`,
      );
    } catch (error) {
      this.logger.error(`Daily rollup failed: ${error.message}`);
    }
  }

  async getStatus() {
    const [bufferSize, dlqSize, redisHealthy] = await Promise.all([
      this.redisBuffer.getBufferSize(),
      this.redisBuffer.getDlqSize(),
      this.redisBuffer.isHealthy(),
    ]);
    return {
      lastFlushAt: this.lastFlushAt,
      eventsToday: this.eventsToday,
      dbWritesToday: this.dbWritesToday,
      bufferSize,
      dlqSize,
      redisHealthy,
    };
  }

  /** Resolve ISO 3166-1 alpha-2 country from raw IP using geoip-lite */
  private resolveCountry(ip?: string): string | null {
    if (!ip) return null;
    try {
      const geo = geoip.lookup(ip);
      return geo?.country ?? null;
    } catch {
      return null;
    }
  }

  /** Anonymize IP: strip last octet (192.168.1.45 → 192.168.1.0) */
  private anonymizeIp(ip?: string): string | null {
    if (!ip) return null;
    const parts = ip.split('.');
    if (parts.length === 4) {
      parts[3] = '0';
      return parts.join('.');
    }
    // IPv6 or unknown format: truncate last segment
    const v6Parts = ip.split(':');
    if (v6Parts.length > 1) {
      v6Parts[v6Parts.length - 1] = '0';
      return v6Parts.join(':');
    }
    return ip;
  }
}
