import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const BUFFER_KEY = 'analytics:events:buffer';
const PERF_KEY = 'analytics:perf:buffer';
const PAUSED_KEY = 'analytics:paused';
const DLQ_KEY = 'analytics:events:dlq';
const MAX_FLUSH_RETRIES = 3;

@Injectable()
export class RedisBufferService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisBufferService.name);
  private redis: Redis;

  // Lua script for atomic read-and-trim: prevents data loss under concurrent flush
  private readonly LUA_ATOMIC_FLUSH = `
    local items = redis.call('LRANGE', KEYS[1], 0, ARGV[1] - 1)
    if #items > 0 then
      redis.call('LTRIM', KEYS[1], #items, -1)
    end
    return items
  `;

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
      this.logger.log('Analytics Redis buffer connected');
    } catch (error) {
      this.logger.warn(`Analytics Redis buffer connection failed: ${error.message}`);
    }
  }

  async onModuleDestroy() {
    await this.redis?.quit();
  }

  private flushFailCount = 0;

  get keys() {
    return { BUFFER_KEY, PERF_KEY, PAUSED_KEY, DLQ_KEY };
  }

  async push(key: string, data: string): Promise<void> {
    try {
      await this.redis.lpush(key, data);
    } catch {
      // Silent fail — analytics should never break the app
    }
  }

  async pushMany(key: string, items: string[]): Promise<void> {
    if (items.length === 0) return;
    try {
      await this.redis.lpush(key, ...items);
    } catch {
      // Silent fail
    }
  }

  /**
   * Atomically reads up to maxItems from a Redis list and removes them.
   * Uses a Lua script so no events are lost between LRANGE and LTRIM.
   * This is the ioredis eval() method for Redis server-side Lua execution — not JS eval.
   */
  async atomicFlush(key: string, maxItems: number = 500): Promise<string[]> {
    try {
      // ioredis .call() method executes Redis commands including EVAL for Lua scripts
      const result = await this.redis.call(
        'EVAL',
        this.LUA_ATOMIC_FLUSH,
        '1',
        key,
        maxItems.toString(),
      );
      return (result as string[]) || [];
    } catch (error) {
      this.logger.warn(`Atomic flush failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Two-phase flush: PEEK → (caller writes to DB) → CONFIRM.
   * Events stay in Redis until the DB write succeeds.
   * If DB write fails 3 times, events move to dead-letter queue.
   */
  async peek(key: string, maxItems: number = 500): Promise<string[]> {
    try {
      const result = await this.redis.lrange(key, 0, maxItems - 1);
      return result || [];
    } catch (error) {
      this.logger.warn(`Peek failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Confirm successful DB write — remove the peeked items from Redis.
   * Uses Lua to atomically trim only the count we consumed.
   */
  async confirmFlush(key: string, count: number): Promise<void> {
    try {
      await this.redis.call(
        'EVAL',
        `if redis.call('LLEN', KEYS[1]) >= tonumber(ARGV[1]) then redis.call('LTRIM', KEYS[1], ARGV[1], -1) end return 1`,
        '1',
        key,
        count.toString(),
      );
      this.flushFailCount = 0;
    } catch (error) {
      this.logger.warn(`Confirm flush failed: ${error.message}`);
    }
  }

  /**
   * Mark a flush failure. After MAX_FLUSH_RETRIES consecutive failures,
   * move the batch to a dead-letter queue so the buffer doesn't grow forever.
   */
  async markFlushFailure(key: string, count: number): Promise<void> {
    this.flushFailCount++;
    if (this.flushFailCount >= MAX_FLUSH_RETRIES) {
      this.logger.error(
        `Flush failed ${MAX_FLUSH_RETRIES} times — moving ${count} items to DLQ`,
      );
      try {
        // Move failed items to DLQ
        const items = await this.redis.lrange(key, 0, count - 1);
        if (items.length > 0) {
          await this.redis.lpush(DLQ_KEY, ...items);
          await this.redis.call(
            'EVAL',
            `redis.call('LTRIM', KEYS[1], ARGV[1], -1) return 1`,
            '1',
            key,
            count.toString(),
          );
          // Expire DLQ after 7 days to avoid unbounded growth
          await this.redis.expire(DLQ_KEY, 7 * 24 * 60 * 60);
        }
        this.flushFailCount = 0;
      } catch (error) {
        this.logger.error(`DLQ move failed: ${error.message}`);
      }
    }
  }

  /** Get dead-letter queue size for monitoring */
  async getDlqSize(): Promise<number> {
    try {
      return await this.redis.llen(DLQ_KEY);
    } catch {
      return 0;
    }
  }

  /** Check if Redis connection is alive */
  async isHealthy(): Promise<boolean> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  async getListLength(key: string): Promise<number> {
    try {
      return await this.redis.llen(key);
    } catch {
      return 0;
    }
  }

  async isPaused(): Promise<boolean> {
    try {
      const val = await this.redis.get(PAUSED_KEY);
      return val === 'true';
    } catch {
      return false;
    }
  }

  async setPaused(paused: boolean): Promise<void> {
    try {
      if (paused) {
        await this.redis.set(PAUSED_KEY, 'true');
      } else {
        await this.redis.del(PAUSED_KEY);
      }
    } catch {
      // Silent fail
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      if (ttlSeconds) {
        await this.redis.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.redis.set(key, value);
      }
    } catch {
      // Silent fail
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch {
      // Silent fail
    }
  }

  async getBufferSize(): Promise<number> {
    try {
      return await this.redis.llen(BUFFER_KEY);
    } catch {
      return 0;
    }
  }
}
