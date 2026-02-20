/**
 * @module HealthModule
 * @description System health check endpoints for Docker healthcheck and monitoring.
 *   Provides /health (overall), /health/ready (readiness), /health/live (liveness),
 *   /health/system (comprehensive system info).
 *   Uses @nestjs/terminus for standardized health check indicators.
 * @routes GET /health, GET /health/ready, GET /health/live, GET /health/system
 * @depends @nestjs/terminus, PrismaService, CACHE_MANAGER
 */
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './prisma.health';
import { RedisHealthIndicator } from './redis.health';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [PrismaHealthIndicator, RedisHealthIndicator],
})
export class HealthModule {}
