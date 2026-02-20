import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { SystemLogService } from '../../system-log/system-log.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  constructor(private readonly systemLogService: SystemLogService) {}

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
              // Don't let logging errors break the application
            }
          }
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
            }
          }
        },
      }),
    );
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

