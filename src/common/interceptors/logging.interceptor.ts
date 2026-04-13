import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { SystemLogService } from '../../system-log/system-log.service';
import { AnalyticsIngestionService } from '../../analytics-ingestion/analytics-ingestion.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  constructor(
    private readonly systemLogService: SystemLogService,
    @Optional()
    @Inject(AnalyticsIngestionService)
    private readonly analyticsService?: AnalyticsIngestionService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, ip, body, query, params } = request;
    const userAgent = request.headers['user-agent'] || '';
    const now = Date.now();

    // Generate request ID if not exists
    if (!(request as any).requestId) {
      (request as any).requestId = this.generateRequestId();
    }

    const requestId = (request as any).requestId;
    // Extract user ID - AuthGuard now sets the active subaccount in req.user
    const reqUser = (request as any).user;
    const userId = reqUser?.id || reqUser?.userId || null;

    // Skip logging health check endpoints, static files, and NextAuth routes
    // NextAuth routes should be handled by frontend, but if they hit backend, don't log as errors
    const skipPaths = ['/health', '/api-docs', '/favicon.ico', '/api/auth'];
    const shouldSkip = skipPaths.some(path => url.startsWith(path));

    this.logger.log(
      `→ ${method} ${url} - Request ID: ${requestId} - IP: ${ip}`,
    );

    return next.handle().pipe(
      tap({
        next: async (data) => {
          const response = context.switchToHttp().getResponse();
          const delay = Date.now() - now;
          const statusCode = response.statusCode;

          this.logger.log(
            `← ${method} ${url} ${statusCode} - ${delay}ms - Request ID: ${requestId}`,
          );

          // Save all requests to database (skip health checks and static files)
          if (!shouldSkip) {
            try {
              // Determine log level based on status code
              let level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' = 'INFO';
              if (statusCode >= 500) {
                level = 'ERROR';
              } else if (statusCode >= 400) {
                level = 'WARN';
              } else if (statusCode >= 200 && statusCode < 300) {
                level = 'INFO';
              } else {
                level = 'DEBUG';
              }

              // Sanitize sensitive data
              const sanitizedBody = this.sanitizeRequest(body);

              await this.systemLogService.createLog({
                level,
                message: `HTTP ${statusCode} - ${method} ${url}`,
                context: `HTTP ${method}`,
                userId,
                requestId,
                method,
                path: url,
                statusCode,
                metadata: {
                  query: Object.keys(query).length > 0 ? query : undefined,
                  params: Object.keys(params).length > 0 ? params : undefined,
                  body: sanitizedBody,
                  delay: `${delay}ms`,
                  responseSize: JSON.stringify(data || {}).length,
                },
                ipAddress: ip || request.headers['x-forwarded-for'] as string || undefined,
                userAgent,
              });
            } catch (logError) {
              this.logger.warn(`Failed to write system log: ${logError}`);
            }
          }

          // ── X-Track header processing (fire-and-forget, never blocks response) ──
          this.processTrackingHeaders(request, {
            delay,
            method,
            url,
            userId,
            requestId,
            ip: ip || (request.headers['x-forwarded-for'] as string) || '',
            userAgent,
          }).catch(() => {});
        },
        error: async (error) => {
          const delay = Date.now() - now;
          this.logger.error(
            `✗ ${method} ${url} - ${delay}ms - Request ID: ${requestId}`,
            error.stack || error.message,
          );

          // Save all errors to database
          if (!shouldSkip) {
            try {
              const response = context.switchToHttp().getResponse();
              const sanitizedBody = this.sanitizeRequest(body);

              await this.systemLogService.createLog({
                level: 'ERROR',
                message: error.message || `Error in ${method} ${url}`,
                context: `HTTP ${method}`,
                userId,
                requestId,
                method,
                path: url,
                statusCode: response.statusCode || 500,
                errorStack: error.stack,
                metadata: {
                  query: Object.keys(query).length > 0 ? query : undefined,
                  params: Object.keys(params).length > 0 ? params : undefined,
                  body: sanitizedBody,
                  delay: `${delay}ms`,
                },
                ipAddress: ip || request.headers['x-forwarded-for'] as string || undefined,
                userAgent,
              });
            } catch (logError) {
              this.logger.warn(`Failed to write error log: ${logError}`);
            }
          }

          // Process tracking headers even on error responses
          this.processTrackingHeaders(request, {
            delay,
            method,
            url,
            userId,
            requestId,
            ip: ip || (request.headers['x-forwarded-for'] as string) || '',
            userAgent,
          }).catch(() => {});
        },
      }),
    );
  }

  /**
   * Process X-Track-* headers from every request.
   * Runs asynchronously AFTER the response — never blocks.
   */
  private async processTrackingHeaders(
    request: Request,
    ctx: {
      delay: number;
      method: string;
      url: string;
      userId: number | null;
      requestId: string;
      ip: string;
      userAgent: string;
    },
  ): Promise<void> {
    if (!this.analyticsService) return;

    // 1. Write API latency for every request as a PerformanceMetric
    try {
      await this.analyticsService.writePerformanceMetric({
        metricName: 'api_latency',
        metricValue: ctx.delay,
        source: 'backend',
        endpoint: ctx.url,
        method: ctx.method,
        userId: ctx.userId,
        sessionId: request.headers['x-session-id'] as string,
        requestId: ctx.requestId,
      });
    } catch {
      // silent
    }

    // 2. X-Session-Id — heartbeat: upsert VisitorSession
    const sessionId = request.headers['x-session-id'] as string;
    if (sessionId) {
      try {
        const pageUrl = request.headers['x-track-page'] as string;
        await this.analyticsService.upsertSession(sessionId, {
          userId: ctx.userId ?? undefined,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          incrementPage: !!pageUrl,
        });
      } catch {
        // silent
      }
    }

    // 3. X-Track-Events — JSON array of events
    const eventsHeader = request.headers['x-track-events'] as string;
    if (eventsHeader) {
      try {
        const events = JSON.parse(eventsHeader);
        if (Array.isArray(events) && events.length > 0) {
          await this.analyticsService.processEvents(
            events.slice(0, 50),
            ctx.ip,
            ctx.userAgent,
          );
        }
      } catch {
        // silent — malformed JSON is expected occasionally
      }
    }

    // 4. X-Track-Vitals — JSON with web vitals data
    const vitalsHeader = request.headers['x-track-vitals'] as string;
    if (vitalsHeader) {
      try {
        const vitals = JSON.parse(vitalsHeader);
        if (vitals && typeof vitals === 'object') {
          const pageUrl =
            (request.headers['x-track-page'] as string) || ctx.url;
          await this.analyticsService.processWebVitals(vitals, {
            pageUrl,
            sessionId: sessionId || undefined,
            userId: ctx.userId ?? undefined,
          });
        }
      } catch {
        // silent — malformed JSON
      }
    }
  }

  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Remove sensitive information from request body before logging
   */
  private sanitizeRequest(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }

    const sensitiveFields = ['password', 'token', 'accessToken', 'refreshToken', 'authorization', 'secret', 'apiKey'];
    const sanitized = { ...body };

    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}
