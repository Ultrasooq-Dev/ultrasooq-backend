import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REC_KEYS } from '../constants/redis-keys';
import { REC_TTL } from '../constants/defaults';

@Injectable()
export class RecommendationRedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecommendationRedisService.name);
  private redis: Redis;
  public readonly keys = REC_KEYS;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    this.redis = new Redis({
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    try {
      await this.redis.connect();
      this.logger.log('Recommendation Redis connected');
    } catch (error) {
      this.logger.warn(`Recommendation Redis connection failed: ${error.message}`);
    }
  }

  async onModuleDestroy() {
    await this.redis?.quit();
  }

  async setJson(key: string, value: unknown, ttl = REC_TTL): Promise<void> {
    try {
      await this.redis.setex(key, ttl, JSON.stringify(value));
    } catch (error) {
      this.logger.warn(`Redis SET failed for ${key}: ${error.message}`);
    }
  }

  async getJson<T = unknown>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      this.logger.warn(`Redis GET failed for ${key}: ${error.message}`);
      return null;
    }
  }

  async setIdList(key: string, ids: number[], ttl = REC_TTL): Promise<void> {
    try {
      await this.redis.setex(key, ttl, JSON.stringify(ids));
    } catch (error) {
      this.logger.warn(`Redis SET list failed for ${key}: ${error.message}`);
    }
  }

  async getIdList(key: string): Promise<number[] | null> {
    return this.getJson<number[]>(key);
  }

  async mgetJson<T = unknown>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    try {
      const results = await this.redis.mget(...keys);
      return results.map((r) => (r ? JSON.parse(r) : null));
    } catch (error) {
      this.logger.warn(`Redis MGET failed: ${error.message}`);
      return keys.map(() => null);
    }
  }

  async acquireLock(jobName: string, ttlSeconds: number): Promise<boolean> {
    try {
      const key = this.keys.lock(jobName);
      const result = await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch {
      return false;
    }
  }

  async releaseLock(jobName: string): Promise<void> {
    try {
      await this.redis.del(this.keys.lock(jobName));
    } catch {
      // Silent fail
    }
  }

  async pfadd(key: string, value: string): Promise<void> {
    try {
      await this.redis.pfadd(key, value);
    } catch {
      // Silent fail
    }
  }

  async incr(key: string): Promise<void> {
    try {
      await this.redis.incr(key);
    } catch {
      // Silent fail
    }
  }

  async setMeta(key: string, value: string): Promise<void> {
    try {
      await this.redis.set(key, value);
    } catch {
      // Silent fail
    }
  }

  async getMeta(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch {
      return null;
    }
  }
}
