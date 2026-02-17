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
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }) {
    const {
      level,
      userId,
      context,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = params;

    const skip = (page - 1) * limit;

    const where: any = {};

    if (level) {
      where.level = level;
    }
    if (userId) {
      where.userId = userId;
    }
    if (context) {
      where.context = context;
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = startDate;
      }
      if (endDate) {
        where.createdAt.lte = endDate;
      }
    }

    const [logs, total] = await Promise.all([
      this.prisma.systemLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
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
      }),
      this.prisma.systemLog.count({ where }),
    ]);

    return {
      data: logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
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

