import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SupportTrackingService {
  private readonly logger = new Logger(SupportTrackingService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Fire-and-forget event tracking. Never blocks the caller.
   */
  async track(
    eventType: string,
    conversationId: number,
    metadata?: Record<string, any>,
    userId?: number,
  ): Promise<void> {
    this.prisma.supportEvent
      .create({ data: { eventType, conversationId, metadata, userId } })
      .catch((e) => this.logger.warn(`Track failed: ${e.message}`));
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
}
