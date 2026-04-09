/**
 * @file analytics-ingestion.module.ts — Analytics Ingestion Module
 *
 * @intent
 *   Registers the public analytics ingestion controller and service.
 *   Exports AnalyticsIngestionService so the LoggingInterceptor can use it
 *   to process X-Track headers on every request.
 *
 * @notes
 *   - SystemLogModule is imported for writing analytics events to system_log.
 *   - PrismaModule is global, so PrismaService is available automatically.
 */

import { Module } from '@nestjs/common';
import { AnalyticsIngestionController } from './analytics-ingestion.controller';
import { AnalyticsIngestionService } from './analytics-ingestion.service';
import { SystemLogModule } from '../system-log/system-log.module';

@Module({
  imports: [SystemLogModule],
  controllers: [AnalyticsIngestionController],
  providers: [AnalyticsIngestionService],
  exports: [AnalyticsIngestionService],
})
export class AnalyticsIngestionModule {}
