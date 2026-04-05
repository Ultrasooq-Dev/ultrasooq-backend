import { Test, TestingModule } from '@nestjs/testing';
import { FeedbackStatsService } from './feedback-stats.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RecommendationRedisService } from './recommendation-redis.service';

const mockPrisma = {
  recommendationFeedback: { groupBy: jest.fn() },
  recommendationMetric: { upsert: jest.fn() },
};

const mockRedis = {
  acquireLock: jest.fn().mockResolvedValue(true),
  releaseLock: jest.fn(),
  keys: { lock: (j: string) => `rec:lock:${j}` },
};

describe('FeedbackStatsService', () => {
  let service: FeedbackStatsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackStatsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RecommendationRedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<FeedbackStatsService>(FeedbackStatsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('computeFeedbackStats', () => {
    it('should skip if lock not acquired', async () => {
      mockRedis.acquireLock.mockResolvedValueOnce(false);
      await service.computeFeedbackStats();
      expect(mockPrisma.recommendationFeedback.groupBy).not.toHaveBeenCalled();
    });

    it('should aggregate feedback into metrics and upsert', async () => {
      mockPrisma.recommendationFeedback.groupBy.mockResolvedValueOnce([
        { algorithm: 'personal', placement: 'homepage', action: 'impression', _count: { id: 100 } },
        { algorithm: 'personal', placement: 'homepage', action: 'click', _count: { id: 15 } },
        { algorithm: 'personal', placement: 'homepage', action: 'purchase', _count: { id: 3 } },
        { algorithm: 'cobought', placement: 'product_page', action: 'impression', _count: { id: 50 } },
      ]);
      mockPrisma.recommendationMetric.upsert.mockResolvedValue({});

      await service.computeFeedbackStats();

      // 2 unique algorithm:placement combos → 2 upserts
      expect(mockPrisma.recommendationMetric.upsert).toHaveBeenCalledTimes(2);
    });

    it('should correctly aggregate impressions, clicks and purchases', async () => {
      mockPrisma.recommendationFeedback.groupBy.mockResolvedValueOnce([
        { algorithm: 'trending', placement: 'sidebar', action: 'impression', _count: { id: 200 } },
        { algorithm: 'trending', placement: 'sidebar', action: 'click', _count: { id: 20 } },
        { algorithm: 'trending', placement: 'sidebar', action: 'cart', _count: { id: 10 } },
        { algorithm: 'trending', placement: 'sidebar', action: 'purchase', _count: { id: 5 } },
      ]);
      mockPrisma.recommendationMetric.upsert.mockResolvedValue({});

      await service.computeFeedbackStats();

      expect(mockPrisma.recommendationMetric.upsert).toHaveBeenCalledTimes(1);
      const upsertCall = mockPrisma.recommendationMetric.upsert.mock.calls[0][0];
      expect(upsertCall.update).toMatchObject({
        impressions: 200,
        clicks: 20,
        cartAdds: 10,
        purchases: 5,
      });
    });

    it('should handle empty feedback gracefully and not upsert', async () => {
      mockPrisma.recommendationFeedback.groupBy.mockResolvedValueOnce([]);

      await service.computeFeedbackStats();

      expect(mockPrisma.recommendationMetric.upsert).not.toHaveBeenCalled();
    });

    it('should always release lock after processing', async () => {
      mockPrisma.recommendationFeedback.groupBy.mockResolvedValueOnce([]);

      await service.computeFeedbackStats();

      expect(mockRedis.releaseLock).toHaveBeenCalledWith('feedback-stats');
    });

    it('should release lock even if upsert throws', async () => {
      mockPrisma.recommendationFeedback.groupBy.mockResolvedValueOnce([
        { algorithm: 'personal', placement: 'homepage', action: 'impression', _count: { id: 10 } },
      ]);
      mockPrisma.recommendationMetric.upsert.mockRejectedValueOnce(new Error('DB error'));

      await expect(service.computeFeedbackStats()).rejects.toThrow('DB error');

      expect(mockRedis.releaseLock).toHaveBeenCalledWith('feedback-stats');
    });
  });
});
