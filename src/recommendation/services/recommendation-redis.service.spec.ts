import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RecommendationRedisService } from './recommendation-redis.service';

const mockConfigService = {
  get: jest.fn((key: string, def?: any) => {
    const map: Record<string, any> = { REDIS_HOST: 'localhost', REDIS_PORT: 6379 };
    return map[key] ?? def;
  }),
};

// Prevent actual Redis connections during tests
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    setex: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    mget: jest.fn().mockResolvedValue([]),
    pfadd: jest.fn().mockResolvedValue(1),
    incr: jest.fn().mockResolvedValue(1),
  }));
});

describe('RecommendationRedisService', () => {
  let service: RecommendationRedisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendationRedisService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<RecommendationRedisService>(RecommendationRedisService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have keys property with correct templates', () => {
    expect(service.keys.profile(1)).toBe('rec:profile:1');
    expect(service.keys.personal(42)).toBe('rec:personal:42');
    expect(service.keys.cobought(100)).toBe('rec:cobought:100');
    expect(service.keys.similar(200)).toBe('rec:similar:200');
    expect(service.keys.crosssell(300)).toBe('rec:crosssell:300');
    expect(service.keys.segTrending('ar', 'COMPANY')).toBe('rec:seg:ar:COMPANY:trending');
    expect(service.keys.segTrendingCat('en', 'BUYER', 5)).toBe('rec:seg:en:BUYER:trending:5');
    expect(service.keys.lock('test')).toBe('rec:lock:test');
    expect(service.keys.feedbackImpressions('2026-04-05', 'personal')).toBe(
      'rec:feedback:2026-04-05:personal:impressions',
    );
  });

  it('should have feedback keys for clicks and conversions', () => {
    expect(service.keys.feedbackClicks('2026-04-05', 'trending')).toBe(
      'rec:feedback:2026-04-05:trending:clicks',
    );
    expect(service.keys.feedbackConversions('2026-04-05')).toBe(
      'rec:feedback:2026-04-05:total:conversions',
    );
  });

  it('should have meta keys as static strings', () => {
    expect(service.keys.metaLastRun).toBe('rec:meta:lastRun');
    expect(service.keys.metaLastDuration).toBe('rec:meta:lastDuration');
    expect(service.keys.metaUserCount).toBe('rec:meta:userCount');
    expect(service.keys.metaProductCount).toBe('rec:meta:productCount');
    expect(service.keys.editorialPicks).toBe('rec:editorial:picks');
  });
});
