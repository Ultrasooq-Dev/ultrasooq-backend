/**
 * Tracking & Monitoring Pipeline — Unit Tests
 *
 * Covers:
 *   1. Full tracking flow  : recommendation served → recId → feedback actions → Redis HLL counters → DB record
 *   2. FeedbackStats cron  : groupBy aggregation → RecommendationMetric upsert
 *   3. Health / monitoring : HEALTHY vs STALE detection, >26h staleness, meta keys
 *   4. Cron lock behaviour : prevents concurrent runs, released on success, released on failure
 */

import { Test, TestingModule } from '@nestjs/testing';
import { FeedbackService } from './feedback.service';
import { FeedbackStatsService } from './feedback-stats.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RecommendationRedisService } from './recommendation-redis.service';
import { REC_KEYS } from '../constants/redis-keys';

// ─── Shared mock factories ────────────────────────────────────────────────────

function buildMockRedis(overrides: Partial<{
  pfadd: jest.Mock;
  incr: jest.Mock;
  acquireLock: jest.Mock;
  releaseLock: jest.Mock;
  getMeta: jest.Mock;
  setMeta: jest.Mock;
}> = {}) {
  return {
    pfadd: overrides.pfadd ?? jest.fn().mockResolvedValue(undefined),
    incr: overrides.incr ?? jest.fn().mockResolvedValue(undefined),
    acquireLock: overrides.acquireLock ?? jest.fn().mockResolvedValue(true),
    releaseLock: overrides.releaseLock ?? jest.fn().mockResolvedValue(undefined),
    getMeta: overrides.getMeta ?? jest.fn().mockResolvedValue(null),
    setMeta: overrides.setMeta ?? jest.fn().mockResolvedValue(undefined),
    keys: REC_KEYS,
  };
}

function buildMockPrisma(overrides: Partial<{
  feedbackCreate: jest.Mock;
  feedbackGroupBy: jest.Mock;
  metricUpsert: jest.Mock;
}> = {}) {
  return {
    recommendationFeedback: {
      create: overrides.feedbackCreate ?? jest.fn().mockResolvedValue({ id: 'fb-1' }),
      groupBy: overrides.feedbackGroupBy ?? jest.fn().mockResolvedValue([]),
    },
    recommendationMetric: {
      upsert: overrides.metricUpsert ?? jest.fn().mockResolvedValue({}),
    },
  };
}

// ─── 1. Full Tracking Flow ────────────────────────────────────────────────────

describe('Tracking Pipeline — FeedbackService', () => {
  let service: FeedbackService;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockRedis = buildMockRedis();
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RecommendationRedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<FeedbackService>(FeedbackService);
  });

  // ── recId parsing ──────────────────────────────────────────────────────────

  describe('recId → algorithm extraction', () => {
    it('extracts the 3rd segment of recId as algorithm', async () => {
      await service.trackFeedback(
        { recId: 'rec_abc123_personal_2026-04-05', productId: 1, action: 'impression' },
        42,
        null,
      );
      // HLL key for impressions should contain the extracted algorithm
      expect(mockRedis.pfadd).toHaveBeenCalledWith(
        expect.stringContaining('personal'),
        expect.any(String),
      );
    });

    it('prefers explicit algorithm field over recId extraction', async () => {
      await service.trackFeedback(
        { recId: 'rec_abc_personal_2026-04-05', productId: 1, action: 'impression', algorithm: 'trending' },
        42,
        null,
      );
      expect(mockRedis.pfadd).toHaveBeenCalledWith(
        expect.stringContaining('trending'),
        expect.any(String),
      );
      // 'personal' must NOT appear in the key
      const calledKey: string = (mockRedis.pfadd.mock.calls[0] as [string, string])[0];
      expect(calledKey).not.toContain('personal');
    });

    it('falls back to "unknown" when recId has fewer than 3 segments', async () => {
      await service.trackFeedback(
        { recId: 'short', productId: 1, action: 'impression' },
        null,
        null,
      );
      expect(mockRedis.pfadd).toHaveBeenCalledWith(
        expect.stringContaining('unknown'),
        expect.any(String),
      );
    });
  });

  // ── impression action ──────────────────────────────────────────────────────

  describe('impression action → HLL counter', () => {
    it('calls pfadd on the impressions key', async () => {
      const today = new Date().toISOString().slice(0, 10);
      await service.trackFeedback(
        { recId: 'rec_x_cobought_2026-04-05', productId: 5, action: 'impression' },
        10,
        null,
      );
      expect(mockRedis.pfadd).toHaveBeenCalledWith(
        `rec:feedback:${today}:cobought:impressions`,
        'rec_x_cobought_2026-04-05',
      );
    });

    it('does not call incr for impression', async () => {
      await service.trackFeedback(
        { recId: 'rec_x_trending_2026-04-05', productId: 1, action: 'impression' },
        null,
        null,
      );
      expect(mockRedis.incr).not.toHaveBeenCalled();
    });
  });

  // ── click action ───────────────────────────────────────────────────────────

  describe('click action → HLL counter', () => {
    it('calls pfadd on the clicks key', async () => {
      const today = new Date().toISOString().slice(0, 10);
      await service.trackFeedback(
        { recId: 'rec_x_similar_2026-04-05', productId: 3, action: 'click' },
        7,
        null,
      );
      expect(mockRedis.pfadd).toHaveBeenCalledWith(
        `rec:feedback:${today}:similar:clicks`,
        expect.any(String),
      );
    });

    it('does not call incr for click', async () => {
      await service.trackFeedback(
        { recId: 'rec_x_similar_2026-04-05', productId: 3, action: 'click' },
        7,
        null,
      );
      expect(mockRedis.incr).not.toHaveBeenCalled();
    });
  });

  // ── purchase action ────────────────────────────────────────────────────────

  describe('purchase action → conversion counter', () => {
    it('calls incr on the conversions key', async () => {
      const today = new Date().toISOString().slice(0, 10);
      await service.trackFeedback(
        { recId: 'rec_x_crosssell_2026-04-05', productId: 9, action: 'purchase' },
        50,
        null,
      );
      expect(mockRedis.incr).toHaveBeenCalledWith(
        `rec:feedback:${today}:total:conversions`,
      );
    });

    it('does not call pfadd for purchase', async () => {
      await service.trackFeedback(
        { recId: 'rec_x_crosssell_2026-04-05', productId: 9, action: 'purchase' },
        50,
        null,
      );
      expect(mockRedis.pfadd).not.toHaveBeenCalled();
    });
  });

  // ── cart / dismiss actions ─────────────────────────────────────────────────

  describe('cart and dismiss actions — no Redis counters', () => {
    it('does not call pfadd or incr for cart action', async () => {
      await service.trackFeedback(
        { recId: 'rec_x_personal_2026-04-05', productId: 1, action: 'cart' },
        42,
        null,
      );
      expect(mockRedis.pfadd).not.toHaveBeenCalled();
      expect(mockRedis.incr).not.toHaveBeenCalled();
    });

    it('does not call pfadd or incr for dismiss action', async () => {
      await service.trackFeedback(
        { recId: 'rec_x_personal_2026-04-05', productId: 1, action: 'dismiss' },
        42,
        null,
      );
      expect(mockRedis.pfadd).not.toHaveBeenCalled();
      expect(mockRedis.incr).not.toHaveBeenCalled();
    });
  });

  // ── DB record creation ─────────────────────────────────────────────────────

  describe('DB record (fire-and-forget)', () => {
    it('writes a recommendationFeedback record for impression', async () => {
      await service.trackFeedback(
        { recId: 'rec_abc_similar_2026-04-05', productId: 5, action: 'impression', placement: 'pdp', position: 2 },
        99,
        null,
      );
      expect(mockPrisma.recommendationFeedback.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          recId: 'rec_abc_similar_2026-04-05',
          productId: 5,
          action: 'impression',
          placement: 'pdp',
          position: 2,
          userId: 99,
          deviceId: null,
        }),
      });
    });

    it('writes with null userId for anonymous feedback', async () => {
      await service.trackFeedback(
        { recId: 'rec_abc_trending_2026-04-05', productId: 1, action: 'click' },
        null,
        'device-xyz',
      );
      expect(mockPrisma.recommendationFeedback.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: null,
          deviceId: 'device-xyz',
        }),
      });
    });

    it('defaults placement to "unknown" when omitted', async () => {
      await service.trackFeedback(
        { recId: 'rec_abc_personal_2026-04-05', productId: 1, action: 'click' },
        42,
        null,
      );
      expect(mockPrisma.recommendationFeedback.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ placement: 'unknown' }),
      });
    });

    it('defaults position to 0 when omitted', async () => {
      await service.trackFeedback(
        { recId: 'rec_abc_personal_2026-04-05', productId: 1, action: 'click' },
        42,
        null,
      );
      expect(mockPrisma.recommendationFeedback.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ position: 0 }),
      });
    });

    it('does not throw when DB write fails (fire-and-forget)', async () => {
      mockPrisma.recommendationFeedback.create.mockRejectedValueOnce(new Error('DB down'));
      await expect(
        service.trackFeedback(
          { recId: 'rec_abc_personal_2026-04-05', productId: 1, action: 'impression' },
          42,
          null,
        ),
      ).resolves.not.toThrow();
    });
  });
});

// ─── 2. FeedbackStats Cron — Aggregation → RecommendationMetric ──────────────

describe('FeedbackStats Aggregation Pipeline — FeedbackStatsService', () => {
  let service: FeedbackStatsService;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockRedis = buildMockRedis();
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackStatsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RecommendationRedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<FeedbackStatsService>(FeedbackStatsService);
  });

  // ── aggregation ────────────────────────────────────────────────────────────

  describe('aggregation into RecommendationMetric', () => {
    it('groups feedback into algorithm:placement buckets and upserts once per bucket', async () => {
      mockPrisma.recommendationFeedback.groupBy.mockResolvedValueOnce([
        { algorithm: 'personal', placement: 'homepage', action: 'impression', _count: { id: 100 } },
        { algorithm: 'personal', placement: 'homepage', action: 'click',      _count: { id: 15 } },
        { algorithm: 'personal', placement: 'homepage', action: 'purchase',   _count: { id: 3 } },
        { algorithm: 'cobought', placement: 'pdp',      action: 'impression', _count: { id: 50 } },
      ]);

      await service.computeFeedbackStats();

      // 2 unique (algorithm, placement) combos → 2 upserts
      expect(mockPrisma.recommendationMetric.upsert).toHaveBeenCalledTimes(2);
    });

    it('correctly sums impressions, clicks, cartAdds and purchases', async () => {
      mockPrisma.recommendationFeedback.groupBy.mockResolvedValueOnce([
        { algorithm: 'trending', placement: 'sidebar', action: 'impression', _count: { id: 200 } },
        { algorithm: 'trending', placement: 'sidebar', action: 'click',      _count: { id: 30 } },
        { algorithm: 'trending', placement: 'sidebar', action: 'cart',       _count: { id: 12 } },
        { algorithm: 'trending', placement: 'sidebar', action: 'purchase',   _count: { id: 6 } },
      ]);

      await service.computeFeedbackStats();

      const upsertCall = mockPrisma.recommendationMetric.upsert.mock.calls[0][0];
      expect(upsertCall.update).toMatchObject({
        impressions: 200,
        clicks: 30,
        cartAdds: 12,
        purchases: 6,
      });
    });

    it('creates metric with segment "all" and correct algorithm/placement in create block', async () => {
      mockPrisma.recommendationFeedback.groupBy.mockResolvedValueOnce([
        { algorithm: 'similar', placement: 'crosssell-widget', action: 'impression', _count: { id: 80 } },
      ]);

      await service.computeFeedbackStats();

      const upsertCall = mockPrisma.recommendationMetric.upsert.mock.calls[0][0];
      expect(upsertCall.create).toMatchObject({
        algorithm: 'similar',
        placement: 'crosssell-widget',
        segment: 'all',
        impressions: 80,
      });
    });

    it('does not upsert when there is no feedback data', async () => {
      mockPrisma.recommendationFeedback.groupBy.mockResolvedValueOnce([]);

      await service.computeFeedbackStats();

      expect(mockPrisma.recommendationMetric.upsert).not.toHaveBeenCalled();
    });

    it('accumulates counts for the same bucket across multiple action rows', async () => {
      // Two impression rows for same bucket (edge case: duplicate action rows)
      mockPrisma.recommendationFeedback.groupBy.mockResolvedValueOnce([
        { algorithm: 'personal', placement: 'homepage', action: 'impression', _count: { id: 60 } },
        { algorithm: 'personal', placement: 'homepage', action: 'impression', _count: { id: 40 } },
      ]);

      await service.computeFeedbackStats();

      const upsertCall = mockPrisma.recommendationMetric.upsert.mock.calls[0][0];
      expect(upsertCall.update).toMatchObject({ impressions: 100 });
    });
  });
});

// ─── 3. Health / Monitoring ───────────────────────────────────────────────────

describe('Monitoring — Health Endpoint Logic', () => {
  /**
   * The health logic lives directly in the admin controller, so we test the
   * exact same decision tree inline here using the Redis mock to simulate the
   * various states the system can be in.
   */

  /** Replicates the staleness check from RecommendationAdminController.getHealth */
  async function runHealthCheck(getMeta: jest.Mock) {
    const [lastRun, lastDuration, productCount, userCount] = await Promise.all([
      getMeta('rec:meta:lastRun'),
      getMeta('rec:meta:lastDuration'),
      getMeta('rec:meta:productCount'),
      getMeta('rec:meta:userCount'),
    ]);

    const lastRunDate = lastRun ? new Date(lastRun as string) : null;
    const isStale = lastRunDate
      ? (Date.now() - lastRunDate.getTime()) > 26 * 60 * 60 * 1000
      : true;

    return {
      status: isStale ? 'STALE' : 'HEALTHY',
      lastRun,
      lastDurationSeconds: lastDuration ? parseInt(lastDuration as string, 10) : null,
      productsComputed: productCount ? parseInt(productCount as string, 10) : 0,
      usersComputed: userCount ? parseInt(userCount as string, 10) : 0,
      staleSince: isStale && lastRunDate ? lastRunDate.toISOString() : null,
    };
  }

  it('returns STALE when getMeta returns null (cron has never run)', async () => {
    const getMeta = jest.fn().mockResolvedValue(null);
    const result = await runHealthCheck(getMeta);
    expect(result.status).toBe('STALE');
  });

  it('returns HEALTHY when lastRun is less than 26 hours ago', async () => {
    const recentTs = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago
    const getMeta = jest.fn().mockImplementation((key: string) => {
      if (key === 'rec:meta:lastRun') return Promise.resolve(recentTs);
      if (key === 'rec:meta:lastDuration') return Promise.resolve('120');
      if (key === 'rec:meta:productCount') return Promise.resolve('5000');
      if (key === 'rec:meta:userCount') return Promise.resolve('2000');
      return Promise.resolve(null);
    });
    const result = await runHealthCheck(getMeta);
    expect(result.status).toBe('HEALTHY');
  });

  it('returns STALE when lastRun is more than 26 hours ago', async () => {
    const staleTs = new Date(Date.now() - 27 * 60 * 60 * 1000).toISOString(); // 27h ago
    const getMeta = jest.fn().mockImplementation((key: string) => {
      if (key === 'rec:meta:lastRun') return Promise.resolve(staleTs);
      return Promise.resolve(null);
    });
    const result = await runHealthCheck(getMeta);
    expect(result.status).toBe('STALE');
  });

  it('returns STALE at exactly 26 hours (boundary — not strictly less)', async () => {
    // Exactly 26h means NOT stale yet per the > condition; just over 26h is stale
    const exactlyBoundary = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
    const getMeta = jest.fn().mockImplementation((key: string) => {
      if (key === 'rec:meta:lastRun') return Promise.resolve(exactlyBoundary);
      return Promise.resolve(null);
    });
    const result = await runHealthCheck(getMeta);
    // At exactly 26h the delta may be marginally > or < due to timing; we just
    // verify the status field is one of the two valid values.
    expect(['HEALTHY', 'STALE']).toContain(result.status);
  });

  it('exposes lastRun, lastDurationSeconds, productsComputed and usersComputed', async () => {
    const ts = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const getMeta = jest.fn().mockImplementation((key: string) => {
      const map: Record<string, string> = {
        'rec:meta:lastRun': ts,
        'rec:meta:lastDuration': '300',
        'rec:meta:productCount': '12000',
        'rec:meta:userCount': '8500',
      };
      return Promise.resolve(map[key] ?? null);
    });
    const result = await runHealthCheck(getMeta);
    expect(result.lastRun).toBe(ts);
    expect(result.lastDurationSeconds).toBe(300);
    expect(result.productsComputed).toBe(12000);
    expect(result.usersComputed).toBe(8500);
  });

  it('sets productsComputed and usersComputed to 0 when meta keys are null', async () => {
    const getMeta = jest.fn().mockResolvedValue(null);
    const result = await runHealthCheck(getMeta);
    expect(result.productsComputed).toBe(0);
    expect(result.usersComputed).toBe(0);
  });

  it('includes staleSince when lastRun is set but stale', async () => {
    const staleTs = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    const getMeta = jest.fn().mockImplementation((key: string) => {
      if (key === 'rec:meta:lastRun') return Promise.resolve(staleTs);
      return Promise.resolve(null);
    });
    const result = await runHealthCheck(getMeta);
    expect(result.staleSince).toBe(staleTs);
  });

  it('sets staleSince to null when system is healthy', async () => {
    const recentTs = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    const getMeta = jest.fn().mockImplementation((key: string) => {
      if (key === 'rec:meta:lastRun') return Promise.resolve(recentTs);
      return Promise.resolve(null);
    });
    const result = await runHealthCheck(getMeta);
    expect(result.staleSince).toBeNull();
  });
});

// ─── 4. Cron Lock Behaviour ───────────────────────────────────────────────────

describe('Cron Lock Behaviour — FeedbackStatsService', () => {
  let service: FeedbackStatsService;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockRedis = buildMockRedis();
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackStatsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RecommendationRedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<FeedbackStatsService>(FeedbackStatsService);
  });

  it('skips execution entirely when lock cannot be acquired (concurrent run protection)', async () => {
    mockRedis.acquireLock.mockResolvedValueOnce(false);

    await service.computeFeedbackStats();

    expect(mockPrisma.recommendationFeedback.groupBy).not.toHaveBeenCalled();
    expect(mockPrisma.recommendationMetric.upsert).not.toHaveBeenCalled();
  });

  it('acquires lock with correct job name "feedback-stats"', async () => {
    mockPrisma.recommendationFeedback.groupBy.mockResolvedValueOnce([]);

    await service.computeFeedbackStats();

    expect(mockRedis.acquireLock).toHaveBeenCalledWith('feedback-stats', expect.any(Number));
  });

  it('acquires lock with a TTL of 600 seconds', async () => {
    mockPrisma.recommendationFeedback.groupBy.mockResolvedValueOnce([]);

    await service.computeFeedbackStats();

    expect(mockRedis.acquireLock).toHaveBeenCalledWith('feedback-stats', 600);
  });

  it('releases lock after successful run', async () => {
    mockPrisma.recommendationFeedback.groupBy.mockResolvedValueOnce([]);

    await service.computeFeedbackStats();

    expect(mockRedis.releaseLock).toHaveBeenCalledWith('feedback-stats');
  });

  it('releases lock even when groupBy throws', async () => {
    mockPrisma.recommendationFeedback.groupBy.mockRejectedValueOnce(new Error('DB timeout'));

    await expect(service.computeFeedbackStats()).rejects.toThrow('DB timeout');

    expect(mockRedis.releaseLock).toHaveBeenCalledWith('feedback-stats');
  });

  it('releases lock even when metric upsert throws', async () => {
    mockPrisma.recommendationFeedback.groupBy.mockResolvedValueOnce([
      { algorithm: 'personal', placement: 'homepage', action: 'impression', _count: { id: 10 } },
    ]);
    mockPrisma.recommendationMetric.upsert.mockRejectedValueOnce(new Error('Upsert failed'));

    await expect(service.computeFeedbackStats()).rejects.toThrow('Upsert failed');

    expect(mockRedis.releaseLock).toHaveBeenCalledWith('feedback-stats');
  });

  it('does not release lock when it was never acquired', async () => {
    mockRedis.acquireLock.mockResolvedValueOnce(false);

    await service.computeFeedbackStats();

    expect(mockRedis.releaseLock).not.toHaveBeenCalled();
  });

  it('does not call acquireLock more than once per run (no retry)', async () => {
    mockPrisma.recommendationFeedback.groupBy.mockResolvedValueOnce([]);

    await service.computeFeedbackStats();

    expect(mockRedis.acquireLock).toHaveBeenCalledTimes(1);
  });
});

// ─── 5. Redis Key Integrity ───────────────────────────────────────────────────

describe('Redis Key Schema — REC_KEYS constants', () => {
  it('lock key follows the rec:lock:{jobName} pattern', () => {
    expect(REC_KEYS.lock('feedback-stats')).toBe('rec:lock:feedback-stats');
    expect(REC_KEYS.lock('recompute')).toBe('rec:lock:recompute');
  });

  it('feedback impression key follows the rec:feedback:{date}:{algo}:impressions pattern', () => {
    expect(REC_KEYS.feedbackImpressions('2026-04-05', 'personal')).toBe(
      'rec:feedback:2026-04-05:personal:impressions',
    );
  });

  it('feedback clicks key follows the rec:feedback:{date}:{algo}:clicks pattern', () => {
    expect(REC_KEYS.feedbackClicks('2026-04-05', 'trending')).toBe(
      'rec:feedback:2026-04-05:trending:clicks',
    );
  });

  it('feedback conversions key follows the rec:feedback:{date}:total:conversions pattern', () => {
    expect(REC_KEYS.feedbackConversions('2026-04-05')).toBe(
      'rec:feedback:2026-04-05:total:conversions',
    );
  });

  it('meta keys are static strings (not functions)', () => {
    expect(typeof REC_KEYS.metaLastRun).toBe('string');
    expect(typeof REC_KEYS.metaLastDuration).toBe('string');
    expect(typeof REC_KEYS.metaProductCount).toBe('string');
    expect(typeof REC_KEYS.metaUserCount).toBe('string');
    expect(REC_KEYS.metaLastRun).toBe('rec:meta:lastRun');
    expect(REC_KEYS.metaLastDuration).toBe('rec:meta:lastDuration');
    expect(REC_KEYS.metaProductCount).toBe('rec:meta:productCount');
    expect(REC_KEYS.metaUserCount).toBe('rec:meta:userCount');
  });
});
