import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../guards/AuthGuard';
import { EventCollectorService } from './services/event-collector.service';
import { ErrorTrackingService } from './services/error-tracking.service';
import { PerformanceService } from './services/performance.service';
import { VisitorService } from './services/visitor.service';
import { BatchTrackEventsDto } from './dto/track-event.dto';
import { TrackErrorDto } from './dto/track-error.dto';
import { TrackPerformanceDto } from './dto/track-performance.dto';
import { IdentifyDto } from './dto/identify.dto';

@ApiTags('analytics')
@Controller('analytics')
@SkipThrottle()
export class AnalyticsController {
  constructor(
    private eventCollector: EventCollectorService,
    private errorTracking: ErrorTrackingService,
    private performanceService: PerformanceService,
    private visitorService: VisitorService,
  ) {}

  @Post('events')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 1000 } })
  @ApiOperation({ summary: 'Batch ingest analytics events (max 50)' })
  async ingestEvents(@Body() dto: BatchTrackEventsDto, @Req() req: any) {
    const ip = req.ip || req.headers['x-forwarded-for'] || '';
    const userAgent = req.headers['user-agent'] || '';
    const received = await this.eventCollector.ingestEvents(
      dto.events,
      ip,
      userAgent,
    );

    // Upsert visitor session from first event
    if (dto.events.length > 0) {
      const first = dto.events[0];
      this.visitorService
        .upsertSession({
          sessionId: first.sessionId,
          deviceId: first.deviceId,
          userId: first.userId,
          ipAddress: ip,
          userAgent,
          locale: first.locale,
          currency: first.currency,
          tradeRole: first.tradeRole,
        })
        .catch(() => {});
    }

    return { received };
  }

  @Post('errors')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 1000 } })
  @ApiOperation({ summary: 'Report a frontend/API error' })
  async trackError(@Body() dto: TrackErrorDto) {
    const fingerprint = await this.errorTracking.trackError(dto);
    return { fingerprint };
  }

  @Post('performance')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 1000 } })
  @ApiOperation({ summary: 'Report a performance metric (Web Vitals / API latency)' })
  async trackPerformance(@Body() dto: TrackPerformanceDto) {
    await this.performanceService.trackMetric(dto);
    return { received: true };
  }

  @Post('identify')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(200)
  @ApiOperation({ summary: 'Link anonymous device/session to authenticated user' })
  async identify(@Body() dto: IdentifyDto, @Req() req: any) {
    const userId = req.user?.id;
    if (userId) {
      await this.visitorService.identify(dto.sessionId, dto.deviceId, userId);
    }
    return { linked: true };
  }

  @Get('time')
  @ApiOperation({ summary: 'Get server time for clock sync' })
  getTime() {
    return { serverTime: Date.now() };
  }
}
