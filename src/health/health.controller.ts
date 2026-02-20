/**
 * @module HealthController
 * @description Exposes health check endpoints consumed by Docker healthcheck,
 *   load balancers, and monitoring dashboards.
 * @routes
 *   GET /health        — Full health check (DB + Redis + memory). Used by Docker healthcheck.
 *   GET /health/ready  — Readiness probe: is the app ready to serve traffic?
 *   GET /health/live   — Liveness probe: is the process alive?
 *   GET /health/system — Comprehensive system info for admin dashboard.
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
import { RedisHealthIndicator } from './redis.health';
import * as os from 'os';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly redisHealth: RedisHealthIndicator,
  ) {}

  /**
   * Full health check — consumed by Docker healthcheck.
   * Checks: database connectivity, Redis connectivity, heap memory usage.
   */
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaHealth.isHealthy('database'),
      () => this.redisHealth.isHealthy('redis'),
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

  /**
   * Comprehensive system information for admin health dashboard.
   * Returns server, memory, CPU, database, and Redis status.
   */
  @Get('system')
  async system() {
    // Database health
    let dbStatus = { status: 'down' as string, responseMs: 0 };
    try {
      const result = await this.prismaHealth.isHealthy('database');
      dbStatus = {
        status: 'up',
        responseMs: result['database']?.responseMs || 0,
      };
    } catch {
      dbStatus = { status: 'down', responseMs: 0 };
    }

    // Redis health
    let redisStatus = { status: 'down' as string, responseMs: 0 };
    try {
      const result = await this.redisHealth.isHealthy('redis');
      redisStatus = {
        status: 'up',
        responseMs: result['redis']?.responseMs || 0,
      };
    } catch {
      redisStatus = { status: 'down', responseMs: 0 };
    }

    // Memory info
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    // CPU info
    const cpus = os.cpus();
    const loadAvg = os.loadavg();

    // Uptime formatting
    const uptimeSec = process.uptime();
    const days = Math.floor(uptimeSec / 86400);
    const hours = Math.floor((uptimeSec % 86400) / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    const seconds = Math.floor(uptimeSec % 60);

    return {
      status: dbStatus.status === 'up' && redisStatus.status === 'up' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      server: {
        uptime: uptimeSec,
        uptimeFormatted: `${days}d ${hours}h ${minutes}m ${seconds}s`,
        nodeVersion: process.version,
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        pid: process.pid,
      },
      database: dbStatus,
      redis: redisStatus,
      memory: {
        system: {
          total: totalMem,
          free: freeMem,
          used: totalMem - freeMem,
          usagePercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
        },
        process: {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external,
          heapUsagePercent: Math.round(
            (memUsage.heapUsed / memUsage.heapTotal) * 100,
          ),
        },
      },
      cpu: {
        model: cpus.length > 0 ? cpus[0].model : 'Unknown',
        cores: cpus.length,
        loadAverage: {
          '1m': Math.round(loadAvg[0] * 100) / 100,
          '5m': Math.round(loadAvg[1] * 100) / 100,
          '15m': Math.round(loadAvg[2] * 100) / 100,
        },
      },
    };
  }
}
