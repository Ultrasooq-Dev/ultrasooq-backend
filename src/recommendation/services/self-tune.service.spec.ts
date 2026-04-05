import { Test, TestingModule } from '@nestjs/testing';
import { SelfTuneService } from './self-tune.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RecommendationRedisService } from './recommendation-redis.service';

const mockPrisma = {
  recommendationMetric: { findMany: jest.fn() },
};

const mockRedis = {
  setJson: jest.fn(),
  acquireLock: jest.fn().mockResolvedValue(true),
  releaseLock: jest.fn(),
  keys: { lock: (j: string) => `rec:lock:${j}` },
};

describe('SelfTuneService', () => {
  let service: SelfTuneService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SelfTuneService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RecommendationRedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<SelfTuneService>(SelfTuneService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('autoTuneWeights', () => {
    it('should skip if lock not acquired', async () => {
      mockRedis.acquireLock.mockResolvedValueOnce(false);
      await service.autoTuneWeights();
      expect(mockPrisma.recommendationMetric.findMany).not.toHaveBeenCalled();
    });

    it('should compute weight suggestions from metrics', async () => {
      mockPrisma.recommendationMetric.findMany.mockResolvedValueOnce([
        { algorithm: 'personal', impressions: 1000, clicks: 80, purchases: 15, revenue: '1500' },
        { algorithm: 'cobought', impressions: 500, clicks: 60, purchases: 20, revenue: '2000' },
        { algorithm: 'trending', impressions: 2000, clicks: 40, purchases: 5, revenue: '300' },
      ]);

      await service.autoTuneWeights();

      expect(mockRedis.setJson).toHaveBeenCalledWith(
        'rec:config:suggested_weights',
        expect.objectContaining({
          weights: expect.any(Object),
          suggestedAt: expect.any(String),
          basedOn: expect.any(Object),
          conversionRates: expect.any(Object),
        }),
      );
    });

    it('should store suggested weights proportional to conversion rates', async () => {
      // personal: 10/100 = 0.1, cobought: 20/100 = 0.2 → cobought gets higher weight
      mockPrisma.recommendationMetric.findMany.mockResolvedValueOnce([
        { algorithm: 'personal', impressions: 100, clicks: 10, purchases: 10, revenue: '100' },
        { algorithm: 'cobought', impressions: 100, clicks: 20, purchases: 20, revenue: '200' },
      ]);

      await service.autoTuneWeights();

      const storedPayload = mockRedis.setJson.mock.calls[0][1];
      expect(storedPayload.weights['cobought']).toBeGreaterThan(storedPayload.weights['personal']);
    });

    it('should handle empty metrics gracefully and still store suggestions', async () => {
      mockPrisma.recommendationMetric.findMany.mockResolvedValueOnce([]);

      await service.autoTuneWeights();

      expect(mockRedis.setJson).toHaveBeenCalledWith(
        'rec:config:suggested_weights',
        expect.objectContaining({ weights: {}, suggestedAt: expect.any(String) }),
      );
    });

    it('should always release lock after processing', async () => {
      mockPrisma.recommendationMetric.findMany.mockResolvedValueOnce([]);

      await service.autoTuneWeights();

      expect(mockRedis.releaseLock).toHaveBeenCalledWith('self-tune');
    });

    it('should release lock even if setJson throws', async () => {
      mockPrisma.recommendationMetric.findMany.mockResolvedValueOnce([
        { algorithm: 'personal', impressions: 100, clicks: 5, purchases: 2, revenue: '50' },
      ]);
      mockRedis.setJson.mockRejectedValueOnce(new Error('Redis error'));

      await expect(service.autoTuneWeights()).rejects.toThrow('Redis error');

      expect(mockRedis.releaseLock).toHaveBeenCalledWith('self-tune');
    });
  });
});
