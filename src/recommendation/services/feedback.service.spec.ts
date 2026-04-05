import { Test, TestingModule } from '@nestjs/testing';
import { FeedbackService } from './feedback.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RecommendationRedisService } from './recommendation-redis.service';

const mockPrisma = {
  recommendationFeedback: {
    create: jest.fn().mockResolvedValue({ id: 'test' }),
  },
};

const mockRedis = {
  pfadd: jest.fn().mockResolvedValue(undefined),
  incr: jest.fn().mockResolvedValue(undefined),
  keys: {
    feedbackImpressions: (d: string, a: string) => `rec:feedback:${d}:${a}:impressions`,
    feedbackClicks: (d: string, a: string) => `rec:feedback:${d}:${a}:clicks`,
    feedbackConversions: (date: string) => `rec:feedback:${date}:total:conversions`,
  },
};

describe('FeedbackService', () => {
  let service: FeedbackService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RecommendationRedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<FeedbackService>(FeedbackService);
    jest.clearAllMocks();
    // Reset the DB mock to be non-blocking
    mockPrisma.recommendationFeedback.create.mockResolvedValue({ id: 'test' });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('trackFeedback', () => {
    it('should add impression to HyperLogLog on impression action', async () => {
      await service.trackFeedback(
        { recId: 'rec_abc123_personal_2026-04-05', productId: 1, action: 'impression', placement: 'homepage', position: 1 },
        42,
        null,
      );

      expect(mockRedis.pfadd).toHaveBeenCalledWith(
        expect.stringContaining('impressions'),
        'rec_abc123_personal_2026-04-05',
      );
    });

    it('should add click to HyperLogLog on click action', async () => {
      await service.trackFeedback(
        { recId: 'rec_abc123_personal_2026-04-05', productId: 1, action: 'click' },
        42,
        null,
      );

      expect(mockRedis.pfadd).toHaveBeenCalledWith(
        expect.stringContaining('clicks'),
        expect.any(String),
      );
    });

    it('should increment purchase counter on purchase action', async () => {
      await service.trackFeedback(
        { recId: 'rec_abc123_cobought_2026-04-05', productId: 1, action: 'purchase' },
        42,
        null,
      );

      expect(mockRedis.incr).toHaveBeenCalledWith(
        expect.stringContaining('conversions'),
      );
    });

    it('should extract algorithm from recId (3rd segment)', async () => {
      // recId format: rec_{hash}_{algorithm}_{date}
      // split('_') => ['rec', 'abc123', 'trending', '2026-04-05']
      // parts[2] = 'trending'
      await service.trackFeedback(
        { recId: 'rec_abc_trending_2026-04-05', productId: 1, action: 'click' },
        null,
        'device-123',
      );

      // pfadd key should contain 'trending'
      expect(mockRedis.pfadd).toHaveBeenCalledWith(
        expect.stringContaining('trending'),
        expect.any(String),
      );
    });

    it('should use explicit algorithm from data when provided', async () => {
      await service.trackFeedback(
        { recId: 'rec_abc_personal_2026-04-05', productId: 1, action: 'impression', algorithm: 'cobought' },
        42,
        null,
      );

      // Key should use 'cobought' (explicit) not 'personal' (from recId)
      expect(mockRedis.pfadd).toHaveBeenCalledWith(
        expect.stringContaining('cobought'),
        expect.any(String),
      );
    });

    it('should persist feedback to DB (fire-and-forget)', async () => {
      await service.trackFeedback(
        { recId: 'rec_abc_similar_2026-04-05', productId: 5, action: 'click', placement: 'pdp', position: 2 },
        99,
        null,
      );

      // DB write is fire-and-forget (.catch()), so we just verify it was called
      expect(mockPrisma.recommendationFeedback.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          recId: 'rec_abc_similar_2026-04-05',
          productId: 5,
          action: 'click',
          placement: 'pdp',
          position: 2,
          userId: 99,
          deviceId: null,
        }),
      });
    });

    it('should handle anonymous user (null userId)', async () => {
      await service.trackFeedback(
        { recId: 'rec_abc_trending_2026-04-05', productId: 1, action: 'impression' },
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

    it('should not call pfadd or incr for unknown action types', async () => {
      await service.trackFeedback(
        { recId: 'rec_abc_personal_2026-04-05', productId: 1, action: 'hover' },
        42,
        null,
      );

      expect(mockRedis.pfadd).not.toHaveBeenCalled();
      expect(mockRedis.incr).not.toHaveBeenCalled();
    });
  });
});
