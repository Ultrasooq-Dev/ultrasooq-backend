import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * RequestTrackingMiddleware
 *
 * Extracts or generates X-Request-Id for every request.
 * Logs request start + response finish with duration.
 * Alerts on slow requests (>5s).
 *
 * Flow: Frontend sends X-Request-Id → this middleware extracts it
 * → attaches to req.requestId → passes to response header
 * → all downstream services can use req.requestId for correlated logging
 */
@Injectable()
export class RequestTrackingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('RequestTracker');

  use(req: Request, res: Response, next: NextFunction) {
    const requestId =
      (req.headers['x-request-id'] as string) ||
      `srv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    (req as any).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    const startTime = Date.now();
    const { method, originalUrl } = req;
    const userId = (req as any).user?.sub || (req as any).user?.id || 'anon';

    this.logger.log(`[${requestId}] → ${method} ${originalUrl}`);

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const { statusCode } = res;
      const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'log';

      this.logger[level](
        `[${requestId}] ← ${statusCode} ${method} ${originalUrl} (${duration}ms)`,
      );

      if (duration > 5000) {
        this.logger.warn(
          `[${requestId}] SLOW REQUEST: ${duration}ms for ${method} ${originalUrl}`,
        );
      }
    });

    next();
  }
}
