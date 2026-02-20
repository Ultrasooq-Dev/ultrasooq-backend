/**
 * @module AppCacheModule
 * @description Global Redis caching module using cache-manager with ioredis store.
 *   Connects to the Redis instance defined in docker-compose.yml (port 6379).
 *   Provides CACHE_MANAGER for injection and a typed CacheService wrapper.
 * @exports CacheModule, CacheService
 * @depends @nestjs/cache-manager, cache-manager-ioredis-yet, @nestjs/config
 */
import { Global, Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-ioredis-yet';
import { CacheService } from './cache.service';

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        store: redisStore,
        host: configService.get<string>('REDIS_HOST', 'localhost'),
        port: configService.get<number>('REDIS_PORT', 6379),
        ttl: 300, // 5 minutes default
        max: 1000, // maximum number of items in cache
      }),
    }),
  ],
  providers: [CacheService],
  exports: [CacheModule, CacheService],
})
export class AppCacheModule {}
