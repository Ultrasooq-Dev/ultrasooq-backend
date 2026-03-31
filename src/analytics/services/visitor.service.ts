import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import * as geoip from 'geoip-lite';

@Injectable()
export class VisitorService {
  private readonly logger = new Logger(VisitorService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Create or update a visitor session.
   */
  async upsertSession(data: {
    sessionId: string;
    deviceId?: string;
    userId?: number;
    ipAddress?: string;
    userAgent?: string;
    locale?: string;
    currency?: string;
    tradeRole?: string;
  }): Promise<void> {
    const country = this.resolveCountry(data.ipAddress);
    try {
      await this.prisma.visitorSession.upsert({
        where: { sessionId: data.sessionId },
        update: {
          lastActiveAt: new Date(),
          pageCount: { increment: 1 },
          eventCount: { increment: 1 },
          isActive: true,
          userId: data.userId || undefined,
          locale: data.locale || undefined,
          currency: data.currency || undefined,
          tradeRole: data.tradeRole || undefined,
        },
        create: {
          sessionId: data.sessionId,
          deviceId: data.deviceId || null,
          userId: data.userId || null,
          ipAddress: data.ipAddress || null,
          country: country || null,
          userAgent: data.userAgent || null,
          locale: data.locale || null,
          currency: data.currency || null,
          tradeRole: data.tradeRole || null,
          pageCount: 1,
          eventCount: 1,
          isActive: true,
        },
      });
    } catch (error) {
      this.logger.warn(`upsertSession failed: ${error.message}`);
    }
  }

  /**
   * Update session heartbeat (called from event flush on session_heartbeat events).
   */
  async heartbeat(sessionId: string, pageUrl?: string): Promise<void> {
    try {
      await this.prisma.visitorSession.updateMany({
        where: { sessionId },
        data: { lastActiveAt: new Date(), isActive: true },
      });
    } catch {
      // Silent fail
    }
  }

  /**
   * Link a device/session to a user on login.
   */
  async identify(
    sessionId: string,
    deviceId: string,
    userId: number,
  ): Promise<void> {
    try {
      // Update current session
      await this.prisma.visitorSession.updateMany({
        where: { sessionId },
        data: { userId, deviceId },
      });

      // Also link any previous anonymous sessions from this device
      await this.prisma.visitorSession.updateMany({
        where: { deviceId, userId: null },
        data: { userId },
      });
    } catch (error) {
      this.logger.warn(`identify failed: ${error.message}`);
    }
  }

  /**
   * Mark sessions as inactive if no heartbeat in 5 minutes.
   * Runs every minute.
   */
  @Cron('0 * * * * *')
  async expireInactiveSessions(): Promise<void> {
    const cutoff = new Date(Date.now() - 5 * 60 * 1000);
    try {
      await this.prisma.visitorSession.updateMany({
        where: { isActive: true, lastActiveAt: { lt: cutoff } },
        data: { isActive: false },
      });
    } catch {
      // Silent fail
    }
  }

  /**
   * Get count of currently active visitors.
   */
  async getActiveCount(): Promise<number> {
    return this.prisma.visitorSession.count({ where: { isActive: true } });
  }

  /**
   * Get active sessions with details.
   */
  async getActiveSessions(limit: number = 50) {
    return this.prisma.visitorSession.findMany({
      where: { isActive: true },
      orderBy: { lastActiveAt: 'desc' },
      take: limit,
      select: {
        sessionId: true,
        userId: true,
        locale: true,
        currency: true,
        tradeRole: true,
        startedAt: true,
        lastActiveAt: true,
        pageCount: true,
      },
    });
  }

  /**
   * Get visitor stats for a given period.
   */
  async getVisitorStats(days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [total, today, yesterdayCount] = await this.prisma.$transaction([
      this.prisma.visitorSession.count({
        where: { startedAt: { gte: since } },
      }),
      this.prisma.visitorSession.count({
        where: { startedAt: { gte: todayStart } },
      }),
      this.prisma.visitorSession.count({
        where: {
          startedAt: { gte: yesterday, lt: todayStart },
        },
      }),
    ]);

    const change =
      yesterdayCount > 0
        ? Math.round(((today - yesterdayCount) / yesterdayCount) * 100)
        : today > 0
          ? 100
          : 0;

    return { total, today, yesterday: yesterdayCount, change };
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

  /**
   * GDPR: Delete all analytics data for a user.
   */
  async deleteUserData(userId: number) {
    const [events, errors, metrics, sessions, views, searches, clicks] =
      await this.prisma.$transaction([
        this.prisma.analyticsEvent.deleteMany({ where: { userId } }),
        this.prisma.errorLog.deleteMany({ where: { userId } }),
        this.prisma.performanceMetric.deleteMany({ where: { userId } }),
        this.prisma.visitorSession.deleteMany({ where: { userId } }),
        this.prisma.productView.deleteMany({ where: { userId } }),
        this.prisma.productSearch.deleteMany({ where: { userId } }),
        this.prisma.productClick.deleteMany({ where: { userId } }),
      ]);

    return {
      events: events.count,
      errors: errors.count,
      metrics: metrics.count,
      sessions: sessions.count,
      views: views.count,
      searches: searches.count,
      clicks: clicks.count,
    };
  }
}
