import { Test, TestingModule } from '@nestjs/testing';
import { TrendingService } from './trending.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RecommendationRedisService } from './recommendation-redis.service';

const mockPrisma = {
  user: { findMany: jest.fn() },
  productView: { groupBy: jest.fn() },
  productClick: { groupBy: jest.fn() },
  orderProducts: { groupBy: jest.fn() },
  product: { findMany: jest.fn() },
};

const mockRedis = {
  setIdList: jest.fn(),
  acquireLock: jest.fn().mockResolvedValue(true),
  releaseLock: jest.fn(),
  keys: {
    segTrending: (l: string, r: string) => `rec:seg:${l}:${r}:trending`,
    segTrendingCat: (l: string, r: string, c: number) => `rec:seg:${l}:${r}:trending:${c}`,
    lock: (j: string) => `rec:lock:${j}`,
  },
};

describe('TrendingService', () => {
  let service: TrendingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrendingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RecommendationRedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<TrendingService>(TrendingService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getActiveSegments', () => {
    it('should return unique role × locale pairs (6 locales per role)', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([
        { tradeRole: 'BUYER' },
        { tradeRole: 'COMPANY' },
      ]);

      const segments = await service.getActiveSegments();

      // 2 roles × 6 locales = 12 segments
      expect(segments.length).toBe(12);
      expect(segments).toContainEqual({ locale: 'en', tradeRole: 'BUYER' });
      expect(segments).toContainEqual({ locale: 'ar', tradeRole: 'BUYER' });
      expect(segments).toContainEqual({ locale: 'zh', tradeRole: 'COMPANY' });
    });

    it('should return empty array when no users with tradeRole exist', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([]);
      const segments = await service.getActiveSegments();
      expect(segments).toEqual([]);
    });

    it('should cover all 6 known locales', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([{ tradeRole: 'BUYER' }]);
      const segments = await service.getActiveSegments();
      const locales = segments.map((s) => s.locale).sort();
      expect(locales).toEqual(['ar', 'de', 'en', 'es', 'fr', 'zh']);
    });
  });

  describe('computeTrendingDaily', () => {
    it('should skip if lock not acquired', async () => {
      mockRedis.acquireLock.mockResolvedValueOnce(false);
      await service.computeTrendingDaily();
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });

    it('should process all segments and release the lock', async () => {
      mockRedis.acquireLock.mockResolvedValueOnce(true);

      // getActiveSegments
      mockPrisma.user.findMany.mockResolvedValueOnce([{ tradeRole: 'BUYER' }]);

      // For each of the 6 BUYER segments:
      //   computeForSegment → user.findMany (segment users)
      //   then productView.groupBy, productClick.groupBy, orderProducts.groupBy, product.findMany
      for (let i = 0; i < 6; i++) {
        mockPrisma.user.findMany.mockResolvedValueOnce([{ id: i + 1 }]);
        mockPrisma.productView.groupBy.mockResolvedValueOnce([]);
        mockPrisma.productClick.groupBy.mockResolvedValueOnce([]);
        mockPrisma.orderProducts.groupBy.mockResolvedValueOnce([]);
        // product.findMany never called when scoreMap is empty
      }

      await service.computeTrendingDaily();

      expect(mockRedis.releaseLock).toHaveBeenCalledWith('trending-service');
    });

    it('should store trending per segment when signals exist', async () => {
      mockRedis.acquireLock.mockResolvedValueOnce(true);

      // getActiveSegments — only 1 role → 6 segments
      mockPrisma.user.findMany.mockResolvedValueOnce([{ tradeRole: 'BUYER' }]);

      // Process 6 segments; only the first has data
      for (let i = 0; i < 6; i++) {
        if (i === 0) {
          // Segment users
          mockPrisma.user.findMany.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
          mockPrisma.productView.groupBy.mockResolvedValueOnce([
            { productId: 10, _count: { productId: 5 } },
          ]);
          mockPrisma.productClick.groupBy.mockResolvedValueOnce([
            { productId: 10, _count: { productId: 2 } },
          ]);
          mockPrisma.orderProducts.groupBy.mockResolvedValueOnce([]);
          mockPrisma.product.findMany.mockResolvedValueOnce([
            { id: 10, categoryId: 5 },
          ]);
        } else {
          mockPrisma.user.findMany.mockResolvedValueOnce([{ id: i + 10 }]);
          mockPrisma.productView.groupBy.mockResolvedValueOnce([]);
          mockPrisma.productClick.groupBy.mockResolvedValueOnce([]);
          mockPrisma.orderProducts.groupBy.mockResolvedValueOnce([]);
        }
      }

      await service.computeTrendingDaily();

      // Should have stored at least one trending list
      expect(mockRedis.setIdList).toHaveBeenCalledWith(
        expect.stringMatching(/^rec:seg:en:BUYER:trending$/),
        expect.arrayContaining([10]),
      );
      // Should have stored category-level trending too
      expect(mockRedis.setIdList).toHaveBeenCalledWith(
        expect.stringMatching(/^rec:seg:en:BUYER:trending:5$/),
        expect.arrayContaining([10]),
      );
    });

    it('should release lock even if an error occurs', async () => {
      mockRedis.acquireLock.mockResolvedValueOnce(true);
      // getActiveSegments throws
      mockPrisma.user.findMany.mockRejectedValueOnce(new Error('DB failure'));

      await service.computeTrendingDaily();

      expect(mockRedis.releaseLock).toHaveBeenCalledWith('trending-service');
    });
  });

  describe('computeTrendingEvery6Hours', () => {
    it('should skip if lock not acquired', async () => {
      mockRedis.acquireLock.mockResolvedValueOnce(false);
      await service.computeTrendingEvery6Hours();
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });

    it('should complete successfully when no segments exist', async () => {
      mockRedis.acquireLock.mockResolvedValueOnce(true);
      mockPrisma.user.findMany.mockResolvedValueOnce([]);

      await service.computeTrendingEvery6Hours();

      expect(mockRedis.releaseLock).toHaveBeenCalledWith('trending-service');
    });
  });
});
