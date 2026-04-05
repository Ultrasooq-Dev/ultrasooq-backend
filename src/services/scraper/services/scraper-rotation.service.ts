import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';

// ---------------------------------------------------------------------------
// Realistic user-agent pool (desktop browsers, 2024-2025 era)
// ---------------------------------------------------------------------------
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0',
];

// ---------------------------------------------------------------------------
// Common desktop viewports
// ---------------------------------------------------------------------------
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1680, height: 1050 },
  { width: 2560, height: 1440 },
  { width: 1280, height: 720 },
];

// ---------------------------------------------------------------------------
// Exponential back-off tiers (5 min → 24 hr)
// ---------------------------------------------------------------------------
const BACKOFF_TIERS_MS = [
  5 * 60 * 1_000,   //  5 min
  30 * 60 * 1_000,   // 30 min
  2 * 60 * 60 * 1_000, //  2 hr
  8 * 60 * 60 * 1_000, //  8 hr
  24 * 60 * 60 * 1_000, // 24 hr
];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Anti-blocking rotation service.
 *
 * Responsibilities:
 *  - Per-platform cooldowns backed by Redis TTL keys
 *  - Exponential back-off when block events are recorded
 *  - Session rotation tracking (products-per-session counter)
 *  - Adaptive rate adjustment (decrease on block, increase on success)
 *  - User-agent / viewport / locale rotation
 *  - Block-detection heuristics for HTTP responses
 */
@Injectable()
export class ScraperRotationService implements OnModuleDestroy {
  private readonly logger = new Logger(ScraperRotationService.name);
  private readonly redis: Redis;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    this.redis = new Redis({ host, port, lazyConnect: true });
    this.redis.connect().catch((err) => {
      this.logger.error(`Redis connection failed: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  // -----------------------------------------------------------------------
  // Cooldown management
  // -----------------------------------------------------------------------

  /** Build a Redis key scoped to platform (+ optional region). */
  private scopeKey(prefix: string, platform: string, region?: string): string {
    return `${prefix}:${platform}${region ? ':' + region : ''}`;
  }

  /** Check whether a platform is currently in cooldown. */
  async isInCooldown(platform: string, region?: string): Promise<boolean> {
    const key = this.scopeKey('cooldown', platform, region);
    const cooldownUntil = await this.redis.get(key);
    if (!cooldownUntil) return false;
    return Date.now() < parseInt(cooldownUntil, 10);
  }

  /** Set a cooldown for a platform (with PX-based TTL). */
  async setCooldown(
    platform: string,
    durationMs: number,
    region?: string,
  ): Promise<void> {
    const key = this.scopeKey('cooldown', platform, region);
    const until = Date.now() + durationMs;
    await this.redis.set(key, until.toString(), 'PX', durationMs);
    this.logger.warn(
      `Set cooldown for ${platform}${region ? ':' + region : ''}: ${Math.round(durationMs / 1_000)}s`,
    );
  }

  /** Get remaining cooldown time in milliseconds (0 = no cooldown). */
  async getCooldownRemaining(
    platform: string,
    region?: string,
  ): Promise<number> {
    const key = this.scopeKey('cooldown', platform, region);
    const cooldownUntil = await this.redis.get(key);
    if (!cooldownUntil) return 0;
    return Math.max(0, parseInt(cooldownUntil, 10) - Date.now());
  }

  // -----------------------------------------------------------------------
  // Block event tracking
  // -----------------------------------------------------------------------

  /**
   * Record a block event and apply exponential back-off cooldown.
   * Returns the cooldown duration applied (ms).
   */
  async recordBlock(platform: string, region?: string): Promise<number> {
    const countKey = this.scopeKey('block_count', platform, region);
    const count = await this.redis.incr(countKey);
    await this.redis.expire(countKey, 86_400); // 24 h window

    const cooldownMs =
      BACKOFF_TIERS_MS[Math.min(count - 1, BACKOFF_TIERS_MS.length - 1)];

    await this.setCooldown(platform, cooldownMs, region);
    this.logger.warn(
      `Block #${count} for ${platform}${region ? ':' + region : ''}. Cooldown: ${Math.round(cooldownMs / 60_000)}min`,
    );

    return cooldownMs;
  }

  /** Reset block count after a successful scraping streak. */
  async resetBlockCount(platform: string, region?: string): Promise<void> {
    const key = this.scopeKey('block_count', platform, region);
    await this.redis.del(key);
  }

  // -----------------------------------------------------------------------
  // Session rotation
  // -----------------------------------------------------------------------

  /** Increment and return the session product counter. */
  async incrementSessionCount(
    platform: string,
    sessionId: string,
  ): Promise<number> {
    const key = `session:${platform}:${sessionId}`;
    const count = await this.redis.incr(key);
    await this.redis.expire(key, 7_200); // 2 h TTL
    return count;
  }

  /** Check if a session has hit its per-session product limit. */
  async shouldRotateSession(
    platform: string,
    sessionId: string,
    maxPerSession: number,
  ): Promise<boolean> {
    const key = `session:${platform}:${sessionId}`;
    const count = await this.redis.get(key);
    return count ? parseInt(count, 10) >= maxPerSession : false;
  }

  // -----------------------------------------------------------------------
  // Adaptive rate limiting
  // -----------------------------------------------------------------------

  /** Default per-platform rates (products / hour). */
  private static readonly DEFAULT_RATES: Record<string, number> = {
    amazon: 300,
    taobao: 200,
    alibaba: 400,
    aliexpress: 350,
  };

  /** Get the current adaptive rate for a platform (products / hour). */
  async getAdaptiveRate(platform: string): Promise<number> {
    const rateStr = await this.redis.get(`rate:${platform}`);
    if (rateStr) return parseInt(rateStr, 10);
    return ScraperRotationService.DEFAULT_RATES[platform] ?? 200;
  }

  /**
   * Adjust the adaptive rate after a scrape attempt.
   *  - On block:   decrease by 30 % (floor 10)
   *  - On success: increase by 10 % (cap 150 % of default)
   * Returns the new rate.
   */
  async adjustRate(platform: string, blocked: boolean): Promise<number> {
    const currentRate = await this.getAdaptiveRate(platform);
    const defaultRate =
      ScraperRotationService.DEFAULT_RATES[platform] ?? 200;

    let newRate: number;
    if (blocked) {
      newRate = Math.max(10, Math.floor(currentRate * 0.7));
    } else {
      newRate = Math.min(
        Math.floor(defaultRate * 1.5),
        Math.floor(currentRate * 1.1),
      );
    }

    await this.redis.set(`rate:${platform}`, newRate.toString(), 'EX', 86_400);
    this.logger.log(
      `Adjusted ${platform} rate: ${currentRate} -> ${newRate} products/hr (${blocked ? 'block' : 'success'})`,
    );
    return newRate;
  }

  // -----------------------------------------------------------------------
  // Fingerprint rotation helpers
  // -----------------------------------------------------------------------

  /** Pick a random user-agent string. */
  getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  /** Pick a random desktop viewport. */
  getRandomViewport(): { width: number; height: number } {
    return VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
  }

  /** Return a random delay between `min` and `max` ms. */
  getRequestJitter(min: number = 1_000, max: number = 4_000): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /** Generate a full browser session configuration for a platform. */
  async getSessionConfig(platform: string): Promise<{
    userAgent: string;
    viewport: { width: number; height: number };
    language: string;
    timezone: string;
  }> {
    const regionLanguageMap: Record<
      string,
      { language: string; timezone: string }
    > = {
      amazon: { language: 'en-US,en;q=0.9', timezone: 'America/New_York' },
      taobao: {
        language: 'zh-CN,zh;q=0.9,en;q=0.8',
        timezone: 'Asia/Shanghai',
      },
      alibaba: {
        language: 'en-US,en;q=0.9,zh-CN;q=0.8',
        timezone: 'Asia/Shanghai',
      },
      aliexpress: {
        language: 'en-US,en;q=0.9',
        timezone: 'America/New_York',
      },
    };

    const config = regionLanguageMap[platform] ?? regionLanguageMap.amazon;
    return {
      userAgent: this.getRandomUserAgent(),
      viewport: this.getRandomViewport(),
      ...config,
    };
  }

  // -----------------------------------------------------------------------
  // Block detection
  // -----------------------------------------------------------------------

  /** Analyse an HTTP response and determine whether the target is blocking us. */
  detectBlock(response: {
    status: number;
    body: string;
    url: string;
  }): { blocked: boolean; reason?: string } {
    // HTTP-level detection
    if (response.status === 429) {
      return { blocked: true, reason: 'HTTP 429 Too Many Requests' };
    }
    if (response.status === 503) {
      return { blocked: true, reason: 'HTTP 503 Service Unavailable' };
    }

    // Content-level detection
    const bodyLower = response.body.toLowerCase();
    const blockIndicators = [
      'captcha',
      'robot',
      'verify you are human',
      'automated access',
      '验证',
      '请输入验证码',
      'unusual traffic',
      'access denied',
      'please verify',
      'security check',
      'are you a robot',
    ];

    for (const indicator of blockIndicators) {
      if (bodyLower.includes(indicator)) {
        return { blocked: true, reason: `Content block: "${indicator}"` };
      }
    }

    // Empty body detection (blocked but HTTP 200)
    if (response.status === 200 && response.body.trim().length < 500) {
      return { blocked: true, reason: 'Suspiciously empty response body' };
    }

    // Login-wall redirect detection
    const loginPatterns = [
      '/ap/signin',
      'login.taobao',
      'login.aliexpress',
      'passport.alibaba',
    ];
    for (const pattern of loginPatterns) {
      if (response.url.includes(pattern)) {
        return { blocked: true, reason: `Login wall redirect: ${pattern}` };
      }
    }

    return { blocked: false };
  }
}
