import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisBufferService } from '../../analytics/services/redis-buffer.service';

const BUFFER_KEY = 'support:events:buffer';

/**
 * SupportTrackingService — Buffered event tracking.
 *
 * Uses the same Redis buffer pattern as the analytics system:
 * - track() pushes to Redis (< 0.1ms, non-blocking)
 * - flushBuffer() runs every 10s, bulk-inserts to PostgreSQL
 * - Zero extra DB writes on the request path
 * - Also bridges events to AnalyticsEvent table (source: 'support')
 */
@Injectable()
export class SupportTrackingService {
  private readonly logger = new Logger(SupportTrackingService.name);

  constructor(
    private prisma: PrismaService,
    private redisBuffer: RedisBufferService,
  ) {}

  /**
   * Buffer a support event. Never touches DB on the request path.
   * Returns immediately (< 0.1ms).
   */
  track(
    eventType: string,
    conversationId: number,
    metadata?: Record<string, any>,
    userId?: number,
  ): void {
    this.redisBuffer
      .push(
        BUFFER_KEY,
        JSON.stringify({
          eventType,
          conversationId,
          metadata: metadata ?? null,
          userId: userId ?? null,
          createdAt: new Date().toISOString(),
        }),
      )
      .catch(() => {}); // Silent fail — tracking should never break the app
  }

  /**
   * Flush support events buffer to DB every 10 seconds.
   * Two-phase: peek → write → confirm (same as analytics).
   * Also bridges events to AnalyticsEvent table for unified dashboard.
   */
  @Cron('*/10 * * * * *')
  async flushBuffer(): Promise<void> {
    try {
      const rawItems = await this.redisBuffer.peek(BUFFER_KEY, 200);
      if (rawItems.length === 0) return;

      const events = rawItems.map((item) => {
        const parsed = JSON.parse(item);
        return {
          eventType: parsed.eventType,
          conversationId: parsed.conversationId,
          metadata: parsed.metadata,
          userId: parsed.userId,
        };
      });

      // Bulk insert to SupportEvent table
      await this.prisma.supportEvent.createMany({ data: events });

      // Bridge to AnalyticsEvent table (unified dashboard)
      const analyticsEvents = events.map((e) => ({
        eventName: `support_${e.eventType}`,
        eventType: 'support',
        source: 'support',
        metadata: { ...e.metadata, conversationId: e.conversationId },
        userId: e.userId,
        sessionId: null,
      }));
      await this.prisma.analyticsEvent.createMany({ data: analyticsEvents });

      // Confirm flush — remove from Redis
      await this.redisBuffer.confirmFlush(BUFFER_KEY, rawItems.length);

      if (events.length > 0) {
        this.logger.debug(`Flushed ${events.length} support events`);
      }
    } catch (error) {
      this.logger.warn(`Support event flush failed: ${error.message}`);
    }
  }

  /**
   * Get event counts by type for a date range (dashboard KPIs).
   */
  async getEventCounts(since: Date) {
    return this.prisma.$queryRaw<Array<{ eventType: string; count: bigint }>>`
      SELECT "eventType", COUNT(*) AS count
      FROM support_event
      WHERE "createdAt" >= ${since}
      GROUP BY "eventType"
      ORDER BY count DESC
    `;
  }

  /**
   * Get hourly volume for charts.
   */
  async getHourlyVolume(since: Date) {
    return this.prisma.$queryRaw<Array<{ hour: number; count: bigint }>>`
      SELECT EXTRACT(HOUR FROM "createdAt")::int AS hour, COUNT(*) AS count
      FROM support_event
      WHERE "eventType" = 'conversation_started' AND "createdAt" >= ${since}
      GROUP BY hour ORDER BY hour
    `;
  }

  /**
   * Get support metrics for admin dashboard (cached query).
   */
  async getSupportMetrics(since: Date) {
    const [totalConversations, escalated, resolved, avgCsat, botResolutions] =
      await this.prisma.$transaction([
        this.prisma.supportConversation.count({ where: { createdAt: { gte: since }, deletedAt: null } }),
        this.prisma.supportConversation.count({ where: { escalatedAt: { not: null }, createdAt: { gte: since } } }),
        this.prisma.supportConversation.count({ where: { status: 'resolved', createdAt: { gte: since } } }),
        this.prisma.supportConversation.aggregate({ where: { csatRating: { not: null }, createdAt: { gte: since } }, _avg: { csatRating: true } }),
        this.prisma.supportConversation.count({ where: { status: 'resolved', escalatedAt: null, createdAt: { gte: since } } }),
      ]);

    return {
      totalConversations,
      escalated,
      resolved,
      botResolutions,
      escalationRate: totalConversations > 0 ? Math.round((escalated / totalConversations) * 100) : 0,
      botResolutionRate: totalConversations > 0 ? Math.round((botResolutions / totalConversations) * 100) : 0,
      avgCsat: Math.round((avgCsat._avg.csatRating ?? 0) * 10) / 10,
    };
  }
}
