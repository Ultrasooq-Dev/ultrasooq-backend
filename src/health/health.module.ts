/**
 * @module HealthModule
 * @description System health check endpoints for Docker healthcheck and monitoring.
 *   Provides /health (overall), /health/ready (readiness), /health/live (liveness).
 *   Uses @nestjs/terminus for standardized health check indicators.
 * @routes GET /health, GET /health/ready, GET /health/live
 * @depends @nestjs/terminus, PrismaService
 */
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { PrismaHealthIndicator } from './prisma.health';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [PrismaHealthIndicator],
})
export class HealthModule {}
