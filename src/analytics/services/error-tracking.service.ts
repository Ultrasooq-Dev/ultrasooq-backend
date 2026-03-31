import { Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TrackErrorDto } from '../dto/track-error.dto';
import { AnalyticsGateway } from '../analytics.gateway';
import { SlackAlertService } from './slack-alert.service';

@Injectable()
export class ErrorTrackingService {
  private readonly logger = new Logger(ErrorTrackingService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() private gateway?: AnalyticsGateway,
    @Optional() private slack?: SlackAlertService,
  ) {}

  /**
   * Track an error with fingerprint deduplication.
   * Same error = increment count, not new row.
   * Prisma upsert uses SQL ON CONFLICT — safe under concurrency.
   */
  async trackError(dto: TrackErrorDto): Promise<string> {
    const fingerprint = this.generateFingerprint(dto.message, dto.source, dto.stack);

    try {
      const result = await this.prisma.errorLog.upsert({
        where: { fingerprint },
        update: {
          count: { increment: 1 },
          lastSeenAt: new Date(),
          userId: dto.userId || undefined,
          pageUrl: dto.pageUrl || undefined,
          endpoint: dto.endpoint || undefined,
          statusCode: dto.statusCode || undefined,
          metadata: dto.metadata || undefined,
        },
        create: {
          fingerprint,
          message: dto.message,
          stack: dto.stack || null,
          source: dto.source,
          level: dto.level || 'error',
          count: 1,
          userId: dto.userId || null,
          pageUrl: dto.pageUrl || null,
          endpoint: dto.endpoint || null,
          statusCode: dto.statusCode || null,
          metadata: dto.metadata || null,
        },
        select: { count: true },
      });

      // Emit real-time alert + Slack only for brand-new errors (first occurrence)
      if (result.count === 1) {
        this.gateway?.emitNewError({ fingerprint, message: dto.message, source: dto.source });
        this.slack?.notifyNewError({
          message: dto.message,
          source: dto.source,
          level: dto.level || 'error',
          fingerprint,
          pageUrl: dto.pageUrl,
          endpoint: dto.endpoint,
        }).catch(() => {});
      }

      return fingerprint;
    } catch (error) {
      this.logger.error(`trackError failed: ${error.message}`);
      return fingerprint;
    }
  }

  /**
   * Get errors with filtering and pagination.
   */
  async getErrors(filters: {
    days?: number;
    page?: number;
    limit?: number;
    source?: string;
    level?: string;
    resolved?: boolean;
  }) {
    const { days = 30, page = 1, limit = 20, source, level, resolved } = filters;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const where: any = { lastSeenAt: { gte: since } };
    if (source && source !== 'all') where.source = source;
    if (level && level !== 'all') where.level = level;
    if (resolved === true) where.resolvedAt = { not: null };
    if (resolved === false) where.resolvedAt = null;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.errorLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { lastSeenAt: 'desc' },
      }),
      this.prisma.errorLog.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Get error trend over time.
   */
  async getErrorTrend(days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const results = await this.prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT DATE(last_seen_at) as date, SUM(count) as count
      FROM error_log
      WHERE last_seen_at >= ${since}
      GROUP BY DATE(last_seen_at)
      ORDER BY date
    `;
    return results.map((r) => ({ date: r.date, count: Number(r.count) }));
  }

  /**
   * Get error summary counts.
   */
  async getErrorSummary(days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const where = { lastSeenAt: { gte: since } };

    const [total, frontend, backend, api, resolved, unresolved] =
      await this.prisma.$transaction([
        this.prisma.errorLog.count({ where }),
        this.prisma.errorLog.count({ where: { ...where, source: 'frontend' } }),
        this.prisma.errorLog.count({ where: { ...where, source: 'backend' } }),
        this.prisma.errorLog.count({ where: { ...where, source: 'api' } }),
        this.prisma.errorLog.count({
          where: { ...where, resolvedAt: { not: null } },
        }),
        this.prisma.errorLog.count({ where: { ...where, resolvedAt: null } }),
      ]);

    return { total, frontend, backend, api, resolved, unresolved };
  }

  async resolveError(id: number): Promise<void> {
    await this.prisma.errorLog.update({
      where: { id },
      data: { resolvedAt: new Date() },
    });
  }

  async unresolveError(id: number): Promise<void> {
    await this.prisma.errorLog.update({
      where: { id },
      data: { resolvedAt: null },
    });
  }

  /**
   * Generate SHA-256 fingerprint from error message + source + first stack line.
   */
  private generateFingerprint(
    message: string,
    source: string,
    stack?: string,
  ): string {
    const firstStackLine = stack?.split('\n')[1]?.trim() || '';
    const input = `${source}:${message}:${firstStackLine}`;
    return createHash('sha256').update(input).digest('hex').substring(0, 40);
  }
}
