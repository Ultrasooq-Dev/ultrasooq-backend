import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LogMetadata {
  [key: string]: any;
}

export interface CreateLogDto {
  level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG';
  message: string;
  context?: string;
  userId?: number;
  requestId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  errorStack?: string;
  metadata?: LogMetadata;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class SystemLogService {
  private readonly logger = new Logger(SystemLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a log entry in the database
   */
  async createLog(logData: CreateLogDto): Promise<void> {
    try {
      await this.prisma.systemLog.create({
        data: {
          level: logData.level,
          message: logData.message,
          context: logData.context,
          userId: logData.userId,
          requestId: logData.requestId,
          method: logData.method,
          path: logData.path,
          statusCode: logData.statusCode,
          errorStack: logData.errorStack,
          metadata: logData.metadata ? JSON.parse(JSON.stringify(logData.metadata)) : null,
          ipAddress: logData.ipAddress,
          userAgent: logData.userAgent,
        },
      });
    } catch (error) {
      // Silently swallow logging errors to avoid circular logging issues
      // Don't throw - logging failures shouldn't break the application
    }
  }

  /**
   * Get logs with filtering and pagination
   */
  async getLogs(params: {
    level?: string;
    userId?: number;
    context?: string;
    requestId?: string;
    search?: string;
    statusCode?: number;
    method?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const {
      level, userId, context, requestId, search, statusCode, method,
      startDate, endDate, page = 1, limit = 50,
    } = params;

    const skip = (page - 1) * limit;
    const where: any = {};

    if (level) where.level = level;
    if (userId) where.userId = userId;
    if (context) where.context = { contains: context, mode: 'insensitive' };
    if (requestId) where.requestId = requestId;
    if (statusCode) where.statusCode = statusCode;
    if (method) where.method = method;
    if (search) {
      where.OR = [
        { message: { contains: search, mode: 'insensitive' } },
        { path: { contains: search, mode: 'insensitive' } },
        { requestId: { contains: search, mode: 'insensitive' } },
        { context: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const [logs, total] = await Promise.all([
      this.prisma.systemLog.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.systemLog.count({ where }),
    ]);

    return { data: logs, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Get all logs for a single requestId — the full pipeline trace
   */
  async getTrace(requestId: string) {
    const logs = await this.prisma.systemLog.findMany({
      where: { requestId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    if (logs.length === 0) {
      return { status: false, message: 'No logs found for this request ID' };
    }

    const first = logs[0];
    const last = logs[logs.length - 1];
    const totalDuration = new Date(last.createdAt).getTime() - new Date(first.createdAt).getTime();
    const hasError = logs.some((l) => l.level === 'ERROR');
    const errorLog = logs.find((l) => l.level === 'ERROR');

    return {
      status: true,
      data: {
        requestId,
        method: first.method,
        path: first.path,
        userId: first.userId,
        statusCode: last.statusCode,
        totalDuration,
        hasError,
        errorMessage: errorLog?.message,
        errorStack: errorLog?.errorStack,
        steps: logs.map((log, i) => ({
          step: i + 1,
          timestamp: log.createdAt,
          level: log.level,
          context: log.context,
          message: log.message,
          statusCode: log.statusCode,
          metadata: log.metadata,
          duration: i > 0
            ? new Date(log.createdAt).getTime() - new Date(logs[i - 1].createdAt).getTime()
            : 0,
        })),
        user: first.user,
        ipAddress: first.ipAddress,
        userAgent: first.userAgent,
      },
    };
  }

  /**
   * Get log stats — error counts, request counts, grouped by level/path
   */
  async getStats() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000);
    const oneDayAgo = new Date(now.getTime() - 86400000);

    const [
      totalLogs, errorCount1h, errorCount24h,
      byLevel, topErrors, slowRequests,
    ] = await Promise.all([
      this.prisma.systemLog.count(),
      this.prisma.systemLog.count({
        where: { level: 'ERROR', createdAt: { gte: oneHourAgo } },
      }),
      this.prisma.systemLog.count({
        where: { level: 'ERROR', createdAt: { gte: oneDayAgo } },
      }),
      this.prisma.systemLog.groupBy({
        by: ['level'],
        _count: { id: true },
        where: { createdAt: { gte: oneDayAgo } },
      }),
      this.prisma.systemLog.findMany({
        where: { level: 'ERROR', createdAt: { gte: oneDayAgo } },
        select: { message: true, path: true, statusCode: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.systemLog.findMany({
        where: {
          createdAt: { gte: oneDayAgo },
          metadata: { path: ['delay'] } as any,
        },
        select: { path: true, method: true, metadata: true, requestId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      status: true,
      data: {
        totalLogs,
        errors: { lastHour: errorCount1h, last24h: errorCount24h },
        byLevel: byLevel.map((g) => ({ level: g.level, count: g._count.id })),
        recentErrors: topErrors,
        slowRequests,
      },
    };
  }

  /**
   * Get a single log by ID
   */
  async getLogById(id: number) {
    return this.prisma.systemLog.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  /**
   * Delete old logs (for cleanup/retention policy)
   */
  async deleteOldLogs(olderThanDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.prisma.systemLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    return result.count;
  }
}

