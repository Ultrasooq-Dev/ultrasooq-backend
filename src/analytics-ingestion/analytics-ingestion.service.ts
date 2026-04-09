/**
 * @file analytics-ingestion.service.ts — Analytics Data Ingestion Service
 *
 * @intent
 *   Processes tracking data from the frontend: page views, events, errors,
 *   web vitals, and session heartbeats. Writes to raw SQL tables
 *   (VisitorSession, ErrorLog, PerformanceMetric) via $queryRawUnsafe
 *   since these tables are not in the Prisma schema.
 *
 * @notes
 *   - All methods are fire-and-forget safe — errors are caught and logged silently.
 *   - Tables are created on first use via CREATE TABLE IF NOT EXISTS.
 *   - Session upserts use ON CONFLICT to handle concurrent writes.
 */

import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SystemLogService } from '../system-log/system-log.service';

export interface TrackingEvent {
  sessionId?: string;
  userId?: number | null;
  deviceId?: string;
  eventName?: string;
  eventType?: string;
  pageUrl?: string;
  metadata?: Record<string, any>;
  clockOffset?: number;
}

export interface ErrorReport {
  message: string;
  stack?: string;
  source?: string;
  level?: string;
  sessionId?: string;
  userId?: number | null;
  pageUrl?: string;
  endpoint?: string;
  statusCode?: number;
  metadata?: Record<string, any>;
}

export interface WebVitals {
  LCP?: number;
  FID?: number;
  CLS?: number;
  FCP?: number;
  TTFB?: number;
  INP?: number;
  [key: string]: any;
}

export interface PerformanceMetricInput {
  metricName: string;
  metricValue: number;
  source: string;
  pageUrl?: string;
  endpoint?: string;
  method?: string;
  userId?: number | null;
  sessionId?: string;
  requestId?: string;
}

@Injectable()
export class AnalyticsIngestionService {
  private readonly logger = new Logger(AnalyticsIngestionService.name);
  private tablesInitialized = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemLogService: SystemLogService,
  ) {}

  /**
   * Ensure raw SQL tables exist. Called once, then skipped.
   */
  private async ensureTables(): Promise<void> {
    if (this.tablesInitialized) return;

    try {
      await this.prisma.$queryRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "VisitorSession" (
          "id" SERIAL PRIMARY KEY,
          "sessionId" TEXT UNIQUE NOT NULL,
          "deviceId" TEXT,
          "userId" INTEGER,
          "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "pageCount" INTEGER NOT NULL DEFAULT 0,
          "eventCount" INTEGER NOT NULL DEFAULT 0,
          "ipAddress" TEXT,
          "country" TEXT,
          "userAgent" TEXT,
          "locale" TEXT,
          "currency" TEXT,
          "tradeRole" TEXT,
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await this.prisma.$queryRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ErrorLog" (
          "id" SERIAL PRIMARY KEY,
          "fingerprint" TEXT UNIQUE NOT NULL,
          "message" TEXT NOT NULL,
          "stack" TEXT,
          "source" TEXT,
          "level" TEXT NOT NULL DEFAULT 'error',
          "count" INTEGER NOT NULL DEFAULT 1,
          "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "resolvedAt" TIMESTAMP(3),
          "userId" INTEGER,
          "pageUrl" TEXT,
          "endpoint" TEXT,
          "statusCode" INTEGER,
          "metadata" JSONB,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await this.prisma.$queryRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "PerformanceMetric" (
          "id" SERIAL PRIMARY KEY,
          "metricName" TEXT NOT NULL,
          "metricValue" DOUBLE PRECISION NOT NULL,
          "source" TEXT,
          "pageUrl" TEXT,
          "endpoint" TEXT,
          "method" TEXT,
          "userId" INTEGER,
          "sessionId" TEXT,
          "requestId" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      this.tablesInitialized = true;
    } catch (error) {
      this.logger.warn(`Failed to ensure analytics tables: ${error}`);
    }
  }

  /**
   * Process a batch of tracking events from the frontend.
   * For each event: upsert VisitorSession + write to system_log.
   */
  async processEvents(
    events: TrackingEvent[],
    ip?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.ensureTables();

    for (const event of events) {
      try {
        // Upsert VisitorSession
        if (event.sessionId) {
          await this.upsertSession(event.sessionId, {
            deviceId: event.deviceId,
            userId: event.userId ?? undefined,
            ip,
            userAgent,
            incrementPage: event.eventType === 'pageView',
          });
        }

        // Write to system_log with analytics context
        await this.systemLogService.createLog({
          level: 'INFO',
          message: `[analytics] ${event.eventName || event.eventType || 'unknown_event'}`,
          context: 'analytics',
          userId: event.userId ?? undefined,
          path: event.pageUrl,
          metadata: {
            sessionId: event.sessionId,
            deviceId: event.deviceId,
            eventName: event.eventName,
            eventType: event.eventType,
            pageUrl: event.pageUrl,
            clockOffset: event.clockOffset,
            ...event.metadata,
          },
          ipAddress: ip,
          userAgent,
        });
      } catch (error) {
        this.logger.warn(`Failed to process event: ${error}`);
      }
    }
  }

  /**
   * Process a frontend error report.
   * Fingerprints the error and upserts into ErrorLog.
   */
  async processError(report: ErrorReport): Promise<void> {
    await this.ensureTables();

    try {
      // Generate fingerprint: SHA256 of (message + source + first line of stack)
      const firstStackLine = (report.stack || '').split('\n')[0] || '';
      const fingerprint = createHash('sha256')
        .update(`${report.message || ''}|${report.source || ''}|${firstStackLine}`)
        .digest('hex');

      const metadataJson = report.metadata
        ? JSON.stringify(report.metadata)
        : null;

      // Upsert ErrorLog: increment count + update lastSeenAt on conflict
      await this.prisma.$queryRawUnsafe(
        `INSERT INTO "ErrorLog" ("fingerprint", "message", "stack", "source", "level", "count", "firstSeenAt", "lastSeenAt", "userId", "pageUrl", "endpoint", "statusCode", "metadata")
         VALUES ($1, $2, $3, $4, $5, 1, NOW(), NOW(), $6, $7, $8, $9, $10::jsonb)
         ON CONFLICT ("fingerprint") DO UPDATE SET
           "count" = "ErrorLog"."count" + 1,
           "lastSeenAt" = NOW(),
           "userId" = COALESCE($6, "ErrorLog"."userId"),
           "pageUrl" = COALESCE($7, "ErrorLog"."pageUrl"),
           "endpoint" = COALESCE($8, "ErrorLog"."endpoint"),
           "statusCode" = COALESCE($9, "ErrorLog"."statusCode")`,
        fingerprint,
        report.message || 'Unknown error',
        report.stack || null,
        report.source || 'frontend',
        report.level || 'error',
        report.userId ?? null,
        report.pageUrl || null,
        report.endpoint || null,
        report.statusCode ?? null,
        metadataJson,
      );
    } catch (error) {
      this.logger.warn(`Failed to process error report: ${error}`);
    }
  }

  /**
   * Upsert a VisitorSession row.
   * On conflict (sessionId exists): increment counts, update lastActiveAt.
   */
  async upsertSession(
    sessionId: string,
    opts: {
      deviceId?: string;
      userId?: number;
      ip?: string;
      userAgent?: string;
      incrementPage?: boolean;
    } = {},
  ): Promise<void> {
    await this.ensureTables();

    try {
      const pageInc = opts.incrementPage ? 1 : 0;

      await this.prisma.$queryRawUnsafe(
        `INSERT INTO "VisitorSession" ("sessionId", "deviceId", "userId", "ipAddress", "userAgent", "pageCount", "eventCount", "startedAt", "lastActiveAt")
         VALUES ($1, $2, $3, $4, $5, $6, 1, NOW(), NOW())
         ON CONFLICT ("sessionId") DO UPDATE SET
           "eventCount" = "VisitorSession"."eventCount" + 1,
           "pageCount" = "VisitorSession"."pageCount" + $6,
           "lastActiveAt" = NOW(),
           "userId" = COALESCE($3, "VisitorSession"."userId"),
           "isActive" = true`,
        sessionId,
        opts.deviceId || null,
        opts.userId ?? null,
        opts.ip || null,
        opts.userAgent || null,
        pageInc,
      );
    } catch (error) {
      this.logger.warn(`Failed to upsert session: ${error}`);
    }
  }

  /**
   * Write web vitals from the frontend to PerformanceMetric.
   */
  async processWebVitals(
    vitals: WebVitals,
    opts: { pageUrl?: string; sessionId?: string; userId?: number },
  ): Promise<void> {
    await this.ensureTables();

    const vitalNames = ['LCP', 'FID', 'CLS', 'FCP', 'TTFB', 'INP'];

    for (const name of vitalNames) {
      if (vitals[name] != null && typeof vitals[name] === 'number') {
        try {
          await this.writePerformanceMetric({
            metricName: name,
            metricValue: vitals[name],
            source: 'frontend',
            pageUrl: opts.pageUrl,
            sessionId: opts.sessionId,
            userId: opts.userId ?? null,
          });
        } catch (error) {
          this.logger.warn(`Failed to write vital ${name}: ${error}`);
        }
      }
    }
  }

  /**
   * Write a single performance metric row.
   */
  async writePerformanceMetric(metric: PerformanceMetricInput): Promise<void> {
    await this.ensureTables();

    try {
      await this.prisma.$queryRawUnsafe(
        `INSERT INTO "PerformanceMetric" ("metricName", "metricValue", "source", "pageUrl", "endpoint", "method", "userId", "sessionId", "requestId")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        metric.metricName,
        metric.metricValue,
        metric.source || 'backend',
        metric.pageUrl || null,
        metric.endpoint || null,
        metric.method || null,
        metric.userId ?? null,
        metric.sessionId || null,
        metric.requestId || null,
      );
    } catch (error) {
      this.logger.warn(`Failed to write performance metric: ${error}`);
    }
  }
}
