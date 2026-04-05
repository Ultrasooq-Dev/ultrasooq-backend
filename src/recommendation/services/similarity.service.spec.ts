import { Test, TestingModule } from '@nestjs/testing';
import { SimilarityService } from './similarity.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RecommendationRedisService } from './recommendation-redis.service';

// p-limit is ESM-only — provide a CJS-compatible mock for Jest
jest.mock('p-limit', () => ({
  __esModule: true,
  default: () => <T>(fn: () => T) => fn(),
}));

const mockPrisma = {
  product: { findMany: jest.fn(), findUnique: jest.fn() },
};

const mockRedis = {
  setIdList: jest.fn().mockResolvedValue(undefined),
  setMeta: jest.fn().mockResolvedValue(undefined),
  acquireLock: jest.fn().mockResolvedValue(true),
  releaseLock: jest.fn().mockResolvedValue(undefined),
  keys: {
    similar: (id: number) => `rec:similar:${id}`,
    lock: (j: string) => `rec:lock:${j}`,
    metaLastRun: 'rec:meta:lastRun',
    metaLastDuration: 'rec:meta:lastDuration',
    metaProductCount: 'rec:meta:productCount',
  },
};

describe('SimilarityService', () => {
  let service: SimilarityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimilarityService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RecommendationRedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<SimilarityService>(SimilarityService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('computeSimilarityScore', () => {
    it('should score same category higher than different category', () => {
      const base = { categoryId: 1, brandId: 2, productPrice: 100 };
      const sameCategory = { categoryId: 1, brandId: 5, productPrice: 80 };
      const diffCategory = { categoryId: 9, brandId: 5, productPrice: 80 };

      const scoreSame = service.computeSimilarityScore(base, sameCategory);
      const scoreDiff = service.computeSimilarityScore(base, diffCategory);

      expect(scoreSame).toBeGreaterThan(scoreDiff);
      expect(scoreSame).toBeGreaterThanOrEqual(3.0); // category bonus is 3.0
    });

    it('should give brand bonus when both have same brand', () => {
      const base = { categoryId: 1, brandId: 2, productPrice: 100 };
      const sameBrand = { categoryId: 1, brandId: 2, productPrice: 100 };
      const diffBrand = { categoryId: 1, brandId: 9, productPrice: 100 };

      const scoreSame = service.computeSimilarityScore(base, sameBrand);
      const scoreDiff = service.computeSimilarityScore(base, diffBrand);

      expect(scoreSame).toBeGreaterThan(scoreDiff);
    });

    it('should give price proximity bonus when within 20% range', () => {
      const base = { categoryId: 1, brandId: null, productPrice: 100 };
      const closePriced = { categoryId: 1, brandId: null, productPrice: 110 }; // 10% diff — within 20%
      const farPriced = { categoryId: 1, brandId: null, productPrice: 200 };   // 100% diff — outside 20%

      const scoreClose = service.computeSimilarityScore(base, closePriced);
      const scoreFar = service.computeSimilarityScore(base, farPriced);

      expect(scoreClose).toBeGreaterThan(scoreFar);
    });

    it('should return 0 for null categoryId on base', () => {
      const base = { categoryId: null, brandId: null, productPrice: 0 };
      const candidate = { categoryId: null, brandId: null, productPrice: 0 };

      const score = service.computeSimilarityScore(base, candidate);
      expect(score).toBe(0);
    });

    it('should max at 7.0 for same category + same brand + close price', () => {
      const base = { categoryId: 1, brandId: 2, productPrice: 100 };
      const perfect = { categoryId: 1, brandId: 2, productPrice: 100 };

      const score = service.computeSimilarityScore(base, perfect);
      expect(score).toBe(7.0); // 3.0 + 2.0 + 2.0
    });

    it('should not give category bonus when categories differ', () => {
      const base = { categoryId: 1, brandId: null, productPrice: 100 };
      const candidate = { categoryId: 2, brandId: null, productPrice: 100 };

      const score = service.computeSimilarityScore(base, candidate);
      expect(score).toBeLessThan(3.0);
    });
  });

  describe('findSimilarRealtime', () => {
    it('should return empty array for non-existent product', async () => {
      mockPrisma.product.findUnique.mockResolvedValue(null);
      const result = await service.findSimilarRealtime(999);
      expect(result).toEqual([]);
    });

    it('should return empty array for product with no categoryId', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 1, categoryId: null });
      const result = await service.findSimilarRealtime(1);
      expect(result).toEqual([]);
    });

    it('should return similar product IDs from same category', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 1, categoryId: 10 });
      mockPrisma.product.findMany.mockResolvedValue([{ id: 2 }, { id: 3 }, { id: 4 }]);

      const result = await service.findSimilarRealtime(1, 3);

      expect(result).toEqual([2, 3, 4]);
      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            categoryId: 10,
            id: { not: 1 },
            status: 'ACTIVE',
            deletedAt: null,
          }),
          take: 3,
        }),
      );
    });

    it('should default limit to 15', async () => {
      mockPrisma.product.findUnique.mockResolvedValue({ id: 1, categoryId: 10 });
      mockPrisma.product.findMany.mockResolvedValue([]);

      await service.findSimilarRealtime(1);

      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 15 }),
      );
    });
  });

  describe('buildSimilarity (cron job)', () => {
    it('should skip if lock cannot be acquired', async () => {
      mockRedis.acquireLock.mockResolvedValueOnce(false);
      await service.buildSimilarity();
      expect(mockPrisma.product.findMany).not.toHaveBeenCalled();
    });

    it('should release lock even on error', async () => {
      mockPrisma.product.findMany.mockRejectedValue(new Error('DB error'));
      await service.buildSimilarity();
      expect(mockRedis.releaseLock).toHaveBeenCalledWith('similarity-builder');
    });

    it('should store similar IDs in Redis per product', async () => {
      // getTopViewedProducts
      mockPrisma.product.findMany
        .mockResolvedValueOnce([
          { id: 1, categoryId: 10, brandId: 1, productPrice: 100 },
        ])
        // findSimilar for product 1 — candidates
        .mockResolvedValueOnce([
          { id: 2, categoryId: 10, brandId: 1, productPrice: 105 },
          { id: 3, categoryId: 10, brandId: 2, productPrice: 200 },
        ]);

      await service.buildSimilarity();

      expect(mockRedis.setIdList).toHaveBeenCalledWith(
        'rec:similar:1',
        expect.arrayContaining([2]),
        expect.any(Number),
      );
    });
  });
});
