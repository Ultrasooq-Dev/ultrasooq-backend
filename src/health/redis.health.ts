/**
 * @module RedisHealthIndicator
 * @description Custom health indicator that checks Redis connectivity via cache manager.
 *   Executes a lightweight PING-style operation to verify the Redis connection.
 * @depends CACHE_MANAGER
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {
    super();
  }

  /**
   * Checks if Redis is reachable via a set/get/del operation.
   * @param key - The key to use in the health check result (e.g., 'redis')
   * @returns HealthIndicatorResult with status 'up' or throws HealthCheckError
   */
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const start = Date.now();
      const testKey = '__health_check__';
      await this.cacheManager.set(testKey, 'ok', 5000);
      const val = await this.cacheManager.get(testKey);
      await this.cacheManager.del(testKey);
      const responseMs = Date.now() - start;

      if (val !== 'ok') {
        throw new Error('Redis read/write verification failed');
      }

      return this.getStatus(key, true, { responseMs });
    } catch (error) {
      throw new HealthCheckError(
        `${key} health check failed`,
        this.getStatus(key, false, { message: error.message }),
      );
    }
  }
}
