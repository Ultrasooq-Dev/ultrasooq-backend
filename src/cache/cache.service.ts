/**
 * @module CacheService
 * @description Typed caching service wrapping cache-manager for common operations.
 *   Provides typed get/set/del methods plus domain-specific cache helpers for
 *   categories, products, spec templates, and filters.
 * @depends CACHE_MANAGER from @nestjs/cache-manager
 */
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

/** Cache key prefixes for organized key management */
export const CACHE_KEYS = {
  CATEGORY_TREE: 'categories:tree',
  CATEGORY_ALL: (page: number, limit: number) => `categories:all:p${page}:l${limit}`,
  CATEGORY_MENU: (categoryId: number) => `categories:menu:${categoryId}`,
  CATEGORY_LEVEL_ONE: 'categories:levelone',
  CATEGORY_SPECS: (catId: number) => `categories:${catId}:specs`,
  PRODUCT_DETAIL: (productId: number) => `product:${productId}`,
  PRODUCT_LIST_CATEGORY: (categoryId: string, page: number) => `products:cat:${categoryId}:page:${page}`,
  FILTER_VALUES: (catId: number) => `filters:${catId}`,
  FEES: (countryId: number) => `fees:${countryId}`,
  SEARCH_RESULTS: (hash: string) => `search:${hash}`,
} as const;

/** Cache TTL values in seconds */
export const CACHE_TTL = {
  CATEGORY_TREE: 3600,      // 1 hour
  CATEGORY_ALL: 3600,       // 1 hour
  CATEGORY_MENU: 3600,      // 1 hour
  CATEGORY_LEVEL_ONE: 3600, // 1 hour
  CATEGORY_SPECS: 1800,     // 30 minutes
  PRODUCT_DETAIL: 300,      // 5 minutes
  PRODUCT_LIST: 300,        // 5 minutes
  FILTER_VALUES: 900,       // 15 minutes
  FEES: 3600,               // 1 hour
  SEARCH_RESULTS: 600,      // 10 minutes
} as const;

@Injectable()
export class CacheService implements OnModuleInit {
  private readonly logger = new Logger(CacheService.name);

  /** Tracks keys currently being refreshed by stale-while-revalidate */
  private readonly refreshingKeys = new Map<string, Promise<unknown>>();

  /** Tracks in-flight fetches for request deduplication */
  private readonly inflightFetches = new Map<string, Promise<unknown>>();

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  // ── Lifecycle ──

  async onModuleInit(): Promise<void> {
    await this.warmCache();
  }

  // ── Generic Operations ──

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.cache.get<T>(key);
      if (value) {
        this.logger.debug(`Cache HIT: ${key}`);
      } else {
        this.logger.debug(`Cache MISS: ${key}`);
      }
      return value ?? null;
    } catch (error) {
      this.logger.warn(`Cache GET error for key ${key}: ${error}`);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      await this.cache.set(key, value, ttl);
      this.logger.debug(`Cache SET: ${key} (TTL: ${ttl ?? 'default'}s)`);
    } catch (error) {
      this.logger.warn(`Cache SET error for key ${key}: ${error}`);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.cache.del(key);
      this.logger.debug(`Cache DEL: ${key}`);
    } catch (error) {
      this.logger.warn(`Cache DEL error for key ${key}: ${error}`);
    }
  }

  async reset(): Promise<void> {
    try {
      const store = (this.cache as any).store;
      if (store && typeof store.reset === 'function') {
        await store.reset();
      } else if (store && typeof store.keys === 'function') {
        const keys = await store.keys('*');
        if (keys.length > 0) await Promise.all(keys.map((k: string) => this.cache.del(k)));
      }
      this.logger.log('Cache RESET: all keys cleared');
    } catch (error) {
      this.logger.warn(`Cache RESET error: ${error}`);
    }
  }

  // ── Domain-Specific Cache Operations ──

  /** Get or set with automatic cache-aside pattern */
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  // ── Category Tree ──
  async getCategoryTree<T>(): Promise<T | null> {
    return this.get<T>(CACHE_KEYS.CATEGORY_TREE);
  }

  async setCategoryTree<T>(tree: T): Promise<void> {
    await this.set(CACHE_KEYS.CATEGORY_TREE, tree, CACHE_TTL.CATEGORY_TREE);
  }

  async invalidateCategoryTree(): Promise<void> {
    await this.del(CACHE_KEYS.CATEGORY_TREE);
  }

  // ── Category All (paginated listing) ──
  async invalidateAllCategories(): Promise<void> {
    await this.invalidateByPrefix('categories:');
  }

  // ── Product Listings ──
  async invalidateProductListings(): Promise<void> {
    await this.invalidateByPrefix('products:cat:');
  }

  // ── Spec Templates ──
  async getSpecTemplates<T>(categoryId: number): Promise<T | null> {
    return this.get<T>(CACHE_KEYS.CATEGORY_SPECS(categoryId));
  }

  async setSpecTemplates<T>(categoryId: number, templates: T): Promise<void> {
    await this.set(CACHE_KEYS.CATEGORY_SPECS(categoryId), templates, CACHE_TTL.CATEGORY_SPECS);
  }

  // ── Filter Values ──
  async getFilterValues<T>(categoryId: number): Promise<T | null> {
    return this.get<T>(CACHE_KEYS.FILTER_VALUES(categoryId));
  }

  async setFilterValues<T>(categoryId: number, filters: T): Promise<void> {
    await this.set(CACHE_KEYS.FILTER_VALUES(categoryId), filters, CACHE_TTL.FILTER_VALUES);
  }

  // ── Product Detail ──
  async getProductDetail<T>(productId: number): Promise<T | null> {
    return this.get<T>(CACHE_KEYS.PRODUCT_DETAIL(productId));
  }

  async setProductDetail<T>(productId: number, product: T): Promise<void> {
    await this.set(CACHE_KEYS.PRODUCT_DETAIL(productId), product, CACHE_TTL.PRODUCT_DETAIL);
  }

  async invalidateProduct(productId: number): Promise<void> {
    await this.del(CACHE_KEYS.PRODUCT_DETAIL(productId));
  }

  // ── Bulk Invalidation ──
  async invalidateProductAndFilters(productId: number, categoryIds: number[]): Promise<void> {
    await this.invalidateProduct(productId);
    for (const catId of categoryIds) {
      await this.del(CACHE_KEYS.FILTER_VALUES(catId));
      await this.del(CACHE_KEYS.CATEGORY_SPECS(catId));
    }
  }

  // ── Cache Warming ──

  /**
   * Pre-loads frequently accessed data into the cache on startup.
   * Each warm-up task is independent; a failure in one does not block the others.
   */
  async warmCache(): Promise<void> {
    this.logger.log('Cache warming: starting...');

    const warmupTasks: { name: string; task: () => Promise<void> }[] = [
      {
        name: CACHE_KEYS.CATEGORY_TREE,
        task: async () => {
          this.logger.log(`Cache warming: warming key "${CACHE_KEYS.CATEGORY_TREE}"`);
          // Intentional no-op: the actual data fetch is done by the consuming
          // service via getOrSet the first time. This placeholder ensures the
          // warm-up infrastructure is in place so domain services can register
          // their own warm-up callbacks in the future.
        },
      },
    ];

    for (const { name, task } of warmupTasks) {
      try {
        await task();
        this.logger.log(`Cache warming: "${name}" completed`);
      } catch (error) {
        this.logger.warn(`Cache warming: "${name}" failed — ${error}`);
      }
    }

    this.logger.log('Cache warming: finished');
  }

  /**
   * Register an external warm-up function that will be executed immediately.
   * Useful for domain services that want to push data into the cache at startup.
   */
  async warmKey(key: string, fetcher: () => Promise<unknown>, ttl?: number): Promise<void> {
    try {
      this.logger.log(`Cache warming: warming key "${key}"`);
      const value = await fetcher();
      await this.set(key, value, ttl);
      this.logger.log(`Cache warming: "${key}" completed`);
    } catch (error) {
      this.logger.warn(`Cache warming: "${key}" failed — ${error}`);
    }
  }

  // ── Stale-While-Revalidate ──

  /**
   * Returns cached data immediately (even if stale) while triggering a
   * background refresh when the data is past its primary TTL but within
   * the extended stale TTL.
   *
   * Cache layout for a given key:
   *   key          → the cached value  (stored with staleTtl)
   *   key:ts       → the timestamp (ms) when the value was written
   *
   * @param key      Cache key
   * @param fetcher  Async factory that produces a fresh value
   * @param ttl      Primary "fresh" TTL in **seconds**
   * @param staleTtl Maximum "stale" TTL in **seconds** (must be > ttl)
   */
  async getOrSetStale<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number,
    staleTtl: number,
  ): Promise<T> {
    const tsKey = `${key}:ts`;

    // Attempt to read existing cached value & its write-timestamp
    const [cached, writtenAtRaw] = await Promise.all([
      this.get<T>(key),
      this.get<number>(tsKey),
    ]);

    if (cached !== null) {
      const writtenAt = writtenAtRaw ?? 0;
      const ageSeconds = (Date.now() - writtenAt) / 1000;

      if (ageSeconds <= ttl) {
        // Data is fresh — return immediately
        return cached;
      }

      if (ageSeconds <= staleTtl) {
        // Data is stale but within the acceptable window — return it
        // immediately and trigger a background refresh (if not already running)
        if (!this.refreshingKeys.has(key)) {
          const refreshPromise = (async () => {
            try {
              this.logger.debug(`Stale-while-revalidate: refreshing "${key}"`);
              const freshValue = await fetcher();
              await this.set(key, freshValue, staleTtl);
              await this.set(tsKey, Date.now(), staleTtl);
            } catch (error) {
              this.logger.warn(`Stale-while-revalidate: refresh failed for "${key}" — ${error}`);
            } finally {
              this.refreshingKeys.delete(key);
            }
          })();
          this.refreshingKeys.set(key, refreshPromise);
        }
        return cached;
      }
      // Data is beyond the stale window — fall through to a full fetch
    }

    // No usable cached value — perform a synchronous fetch
    const value = await fetcher();
    await this.set(key, value, staleTtl);
    await this.set(tsKey, Date.now(), staleTtl);
    return value;
  }

  // ── Request Deduplication ──

  /**
   * Deduplicates concurrent requests for the same cache key.
   * If a fetch for `key` is already in flight, callers receive the same
   * Promise instead of triggering a duplicate DB/API call.
   *
   * @param key     Cache key
   * @param fetcher Async factory that produces the value
   * @param ttl     TTL in seconds
   */
  async dedupedGet<T>(key: string, fetcher: () => Promise<T>, ttl: number): Promise<T> {
    // 1. Fast path — cache hit
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    // 2. Check if an in-flight fetch already exists for this key
    const inflight = this.inflightFetches.get(key) as Promise<T> | undefined;
    if (inflight) {
      this.logger.debug(`Dedup HIT: reusing in-flight fetch for "${key}"`);
      return inflight;
    }

    // 3. Start a new fetch and register it
    const fetchPromise = (async (): Promise<T> => {
      try {
        const value = await fetcher();
        await this.set(key, value, ttl);
        return value;
      } finally {
        this.inflightFetches.delete(key);
      }
    })();

    this.inflightFetches.set(key, fetchPromise);
    return fetchPromise;
  }

  // ── Batch Invalidation by Prefix ──

  /**
   * Deletes all cache keys that start with the given prefix.
   * Uses the underlying Redis store's `keys()` method when available;
   * logs a warning otherwise.
   *
   * @param prefix Key prefix to match (e.g. "categories:", "product:")
   */
  async invalidateByPrefix(prefix: string): Promise<void> {
    try {
      const store = (this.cache as any).store;

      if (store && typeof store.keys === 'function') {
        const matchingKeys: string[] = await store.keys(`${prefix}*`);
        if (matchingKeys.length === 0) {
          this.logger.debug(`Cache INVALIDATE_PREFIX: no keys found for "${prefix}*"`);
          return;
        }
        await Promise.all(matchingKeys.map((k) => this.cache.del(k)));
        this.logger.log(
          `Cache INVALIDATE_PREFIX: deleted ${matchingKeys.length} key(s) matching "${prefix}*"`,
        );
      } else {
        this.logger.warn(
          `Cache INVALIDATE_PREFIX: underlying store does not support keys() — cannot invalidate by prefix "${prefix}"`,
        );
      }
    } catch (error) {
      this.logger.warn(`Cache INVALIDATE_PREFIX error for "${prefix}": ${error}`);
    }
  }
}
