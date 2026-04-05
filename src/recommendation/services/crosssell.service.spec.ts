import { Test, TestingModule } from '@nestjs/testing';
import { CrossSellService } from './crosssell.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RecommendationRedisService } from './recommendation-redis.service';

// p-limit is ESM-only — provide a CJS-compatible mock for Jest
jest.mock('p-limit', () => ({
  __esModule: true,
  default: () => <T>(fn: () => T) => fn(),
}));

const mockPrisma = {
  crossSellRule: { findMany: jest.fn() },
  product: { findMany: jest.fn(), findUnique: jest.fn() },
  cart: { findMany: jest.fn(), groupBy: jest.fn() },
};

const mockRedis = {
  setIdList: jest.fn(),
  setJson: jest.fn(),
  getJson: jest.fn(),
  acquireLock: jest.fn().mockResolvedValue(true),
  releaseLock: jest.fn(),
  keys: {
    crosssell: (id: number) => `rec:crosssell:${id}`,
    crosssellRules: 'rec:rules:crosssell',
    lock: (j: string) => `rec:lock:${j}`,
  },
};

describe('CrossSellService', () => {
  let service: CrossSellService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrossSellService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RecommendationRedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<CrossSellService>(CrossSellService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('buildCrossSell', () => {
    it('should skip if lock not acquired', async () => {
      mockRedis.acquireLock.mockResolvedValueOnce(false);
      await service.buildCrossSell();
      expect(mockPrisma.crossSellRule.findMany).not.toHaveBeenCalled();
    });

    it('should load cross-sell rules from DB and cache them', async () => {
      mockRedis.acquireLock.mockResolvedValueOnce(true);

      mockPrisma.crossSellRule.findMany.mockResolvedValueOnce([
        { sourceCategoryId: 1, targetCategoryId: 10, priority: 1 },
        { sourceCategoryId: 1, targetCategoryId: 20, priority: 2 },
        { sourceCategoryId: 2, targetCategoryId: 30, priority: 1 },
      ]);

      // getTopViewedProducts
      mockPrisma.product.findMany.mockResolvedValueOnce([]);

      await service.buildCrossSell();

      expect(mockPrisma.crossSellRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
      expect(mockRedis.setJson).toHaveBeenCalledWith(
        'rec:rules:crosssell',
        expect.any(Array),
        expect.any(Number),
      );
      expect(mockRedis.releaseLock).toHaveBeenCalledWith('crosssell-builder');
    });

    it('should process products and store cross-sell lists', async () => {
      mockRedis.acquireLock.mockResolvedValueOnce(true);

      // loadAndCacheRules
      mockPrisma.crossSellRule.findMany.mockResolvedValueOnce([
        { sourceCategoryId: 5, targetCategoryId: 10, priority: 1 },
      ]);

      // getTopViewedProducts
      mockPrisma.product.findMany.mockResolvedValueOnce([
        { id: 1, categoryId: 5 },
      ]);

      // getRuleBasedProducts: findMany for target categories
      mockPrisma.product.findMany.mockResolvedValueOnce([
        { id: 20, categoryId: 10 },
        { id: 21, categoryId: 10 },
      ]);

      // getCoCartProducts: cart findMany for users who had product in cart
      mockPrisma.cart.findMany.mockResolvedValueOnce([{ userId: 100 }]);
      // cart groupBy co-occurrence
      mockPrisma.cart.groupBy.mockResolvedValueOnce([
        { productId: 30, _count: { productId: 3 } },
      ]);

      await service.buildCrossSell();

      expect(mockRedis.setIdList).toHaveBeenCalledWith(
        'rec:crosssell:1',
        expect.any(Array),
        expect.any(Number),
      );
    });

    it('should release lock even if an error occurs', async () => {
      mockRedis.acquireLock.mockResolvedValueOnce(true);
      mockPrisma.crossSellRule.findMany.mockRejectedValueOnce(new Error('DB error'));

      await service.buildCrossSell();

      expect(mockRedis.releaseLock).toHaveBeenCalledWith('crosssell-builder');
    });
  });

  describe('findCrossSellRealtime', () => {
    it('should return empty array if product not found', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce(null);
      const result = await service.findCrossSellRealtime(999);
      expect(result).toEqual([]);
    });

    it('should return empty array if product has no categoryId', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({ id: 1, categoryId: null });
      const result = await service.findCrossSellRealtime(1);
      expect(result).toEqual([]);
    });

    it('should return empty array if no cached rules', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({ id: 1, categoryId: 5 });
      mockRedis.getJson.mockResolvedValueOnce(null);
      const result = await service.findCrossSellRealtime(1);
      expect(result).toEqual([]);
    });

    it('should return cross-sell products using cached rules', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({ id: 1, categoryId: 5 });
      mockRedis.getJson.mockResolvedValueOnce([
        { sourceCategoryId: 5, targetCategoryId: 10, priority: 1 },
      ]);
      mockPrisma.product.findMany.mockResolvedValueOnce([
        { id: 20 },
        { id: 21 },
      ]);

      const result = await service.findCrossSellRealtime(1);
      expect(result).toEqual([20, 21]);
    });
  });
});
