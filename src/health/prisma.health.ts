/**
 * @module PrismaHealthIndicator
 * @description Custom health indicator that checks PostgreSQL connectivity via Prisma.
 *   Executes a lightweight `SELECT 1` query to verify the database connection.
 * @depends PrismaService
 */
import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Checks if the database is reachable via a simple query.
   * @param key - The key to use in the health check result (e.g., 'database')
   * @returns HealthIndicatorResult with status 'up' or throws HealthCheckError
   */
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      const responseMs = Date.now() - start;

      return this.getStatus(key, true, { responseMs });
    } catch (error) {
      throw new HealthCheckError(
        `${key} health check failed`,
        this.getStatus(key, false, { message: error.message }),
      );
    }
  }
}
