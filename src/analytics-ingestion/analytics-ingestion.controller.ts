/**
 * @file analytics-ingestion.controller.ts — Public Analytics Ingestion Endpoints
 *
 * @intent
 *   Receives tracking data from the frontend tracker. These are PUBLIC endpoints
 *   (no auth guard) because anonymous users also send tracking data.
 *
 * @endpoints
 *   POST /analytics/events  — batch of page views / click events
 *   POST /analytics/errors  — frontend error reports
 *
 * @notes
 *   - Rate-limited per IP: events 10 req/s, errors 5 req/s
 *   - All processing is fire-and-forget: endpoint returns 204 immediately
 */

import {
  Controller,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  AnalyticsIngestionService,
  TrackingEvent,
  ErrorReport,
} from './analytics-ingestion.service';

interface EventsBatchDto {
  events: TrackingEvent[];
}

interface ErrorReportDto {
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

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsIngestionController {
  private readonly logger = new Logger(AnalyticsIngestionController.name);

  constructor(
    private readonly analyticsIngestionService: AnalyticsIngestionService,
  ) {}

  /**
   * POST /analytics/events
   * Accepts a batch of tracking events from the frontend.
   */
  @Post('events')
  @Throttle({ default: { limit: 10, ttl: 1000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Ingest batch of tracking events' })
  @ApiResponse({ status: 204, description: 'Events accepted' })
  async ingestEvents(
    @Body() body: EventsBatchDto,
    @Req() req: Request,
  ): Promise<void> {
    const events = body?.events;
    if (!Array.isArray(events) || events.length === 0) {
      return;
    }

    // Cap batch size to prevent abuse
    const batch = events.slice(0, 100);

    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      '';
    const userAgent = req.headers['user-agent'] || '';

    // Fire-and-forget — never block the response
    this.analyticsIngestionService
      .processEvents(batch, ip, userAgent)
      .catch((err) => {
        this.logger.warn(`Event ingestion failed: ${err}`);
      });
  }

  /**
   * POST /analytics/errors
   * Accepts a frontend error report.
   */
  @Post('errors')
  @Throttle({ default: { limit: 5, ttl: 1000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Ingest frontend error report' })
  @ApiResponse({ status: 204, description: 'Error report accepted' })
  async ingestError(
    @Body() body: ErrorReportDto,
    @Req() req: Request,
  ): Promise<void> {
    if (!body?.message) {
      return;
    }

    const report: ErrorReport = {
      message: body.message,
      stack: body.stack,
      source: body.source || 'frontend',
      level: body.level || 'error',
      sessionId: body.sessionId,
      userId: body.userId,
      pageUrl: body.pageUrl,
      endpoint: body.endpoint,
      statusCode: body.statusCode,
      metadata: body.metadata,
    };

    // Fire-and-forget
    this.analyticsIngestionService.processError(report).catch((err) => {
      this.logger.warn(`Error ingestion failed: ${err}`);
    });
  }
}
