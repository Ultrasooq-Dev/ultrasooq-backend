/**
 * @module HealthController
 * @description Exposes health check endpoints consumed by Docker healthcheck,
 *   load balancers, and monitoring dashboards.
 * @routes
 *   GET /health       — Full health check (DB + memory). Used by Docker healthcheck.
 *   GET /health/ready — Readiness probe: is the app ready to serve traffic?
 *   GET /health/live  — Liveness probe: is the process alive?
 */
import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { PrismaHealthIndicator } from './prisma.health';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly prismaHealth: PrismaHealthIndicator,
  ) {}

  /**
   * Full health check — consumed by Docker healthcheck.
   * Checks: database connectivity, heap memory usage.
   */
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaHealth.isHealthy('database'),
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024), // 300MB
    ]);
  }

  /**
   * Readiness probe — is the application ready to serve traffic?
   * Only checks database connectivity (critical dependency).
   */
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.prismaHealth.isHealthy('database'),
    ]);
  }

  /**
   * Liveness probe — is the process alive?
   * Lightweight check, no external dependencies.
   */
  @Get('live')
  live() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
