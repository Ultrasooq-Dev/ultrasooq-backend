import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from '../auth/auth.service';
import { SuperAdminAuthGuard } from '../guards/SuperAdminAuthGuard';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsAdminController } from './analytics-admin.controller';
import { AnalyticsGateway } from './analytics.gateway';
import { EventCollectorService } from './services/event-collector.service';
import { ProductTrackingService } from './services/product-tracking.service';
import { ErrorTrackingService } from './services/error-tracking.service';
import { PerformanceService } from './services/performance.service';
import { VisitorService } from './services/visitor.service';
import { HealthCronService } from './services/health-cron.service';
import { RedisBufferService } from './services/redis-buffer.service';
import { SlackAlertService } from './services/slack-alert.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: config.get('JWT_EXPIRY', '1h') },
      }),
    }),
  ],
  controllers: [AnalyticsController, AnalyticsAdminController],
  providers: [
    AuthService,
    SuperAdminAuthGuard,
    SlackAlertService,
    RedisBufferService,
    EventCollectorService,
    ProductTrackingService,
    ErrorTrackingService,
    PerformanceService,
    VisitorService,
    HealthCronService,
    AnalyticsGateway,
  ],
  exports: [
    EventCollectorService,
    ErrorTrackingService,
    PerformanceService,
    VisitorService,
    RedisBufferService,
    ProductTrackingService,
    HealthCronService,
  ],
})
export class AnalyticsModule {}
