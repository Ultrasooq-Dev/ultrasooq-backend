import { Test, TestingModule } from '@nestjs/testing';
import { CollaborativeService } from './collaborative.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RecommendationRedisService } from './recommendation-redis.service';

// p-limit is ESM-only — provide a CJS-compatible mock for Jest
jest.mock('p-limit', () => ({
  __esModule: true,
  default: () => <T>(fn: () => T) => fn(),
}));

const mockPrisma = {
  orderProducts: {
    findMany: jest.fn(),
    groupBy: jest.fn(),
  },
  product: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
};

const mockRedis = {
  setIdList: jest.fn(),
  setMeta: jest.fn(),
  acquireLock: jest.fn().mockResolvedValue(true),
  releaseLock: jest.fn(),
  keys: {
    cobought: (id: number) => `rec:cobought:${id}`,
    lock: (j: string) => `rec:lock:${j}`,
    metaLastRun: 'rec:meta:lastRun',
    metaLastDuration: 'rec:meta:lastDuration',
    metaProductCount: 'rec:meta:productCount',
  },
};

describe('CollaborativeService', () => {
  let service: CollaborativeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollaborativeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RecommendationRedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<CollaborativeService>(CollaborativeService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('buildCoBought', () => {
    it('should skip if lock not acquired', async () => {
      mockRedis.acquireLock.mockResolvedValueOnce(false);
      await service.buildCoBought();
      expect(mockPrisma.orderProducts.groupBy).not.toHaveBeenCalled();
      expect(mockRedis.setIdList).not.toHaveBeenCalled();
    });

    it('should process top ordered products and release lock', async () => {
      mockRedis.acquireLock.mockResolvedValueOnce(true);

      // getTopOrderedProducts: step 1 groupBy
      mockPrisma.orderProducts.groupBy.mockResolvedValueOnce([
        { productId: 1, _count: { productId: 10 } },
        { productId: 2, _count: { productId: 5 } },
      ]);
      // getTopOrderedProducts: step 2 findMany for active products
      mockPrisma.product.findMany.mockResolvedValueOnce([
        { id: 1 },
        { id: 2 },
      ]);

      // findCoBought for product 1:
      //   step 1 - findMany orderIds
      mockPrisma.orderProducts.findMany.mockResolvedValueOnce([{ orderId: 100 }]);
      //   step 2 - groupBy co-products
      mockPrisma.orderProducts.groupBy.mockResolvedValueOnce([
        { productId: 3, _count: { productId: 2 } },
      ]);
      //   step 3 - findMany active check
      mockPrisma.product.findMany.mockResolvedValueOnce([{ id: 3 }]);

      // findCoBought for product 2:
      mockPrisma.orderProducts.findMany.mockResolvedValueOnce([]);
      // (short-circuits — no groupBy needed since orderIds is empty)

      // setMeta calls
      mockRedis.setMeta.mockResolvedValue(undefined);

      await service.buildCoBought();

      expect(mockRedis.acquireLock).toHaveBeenCalledWith('cobuy-builder', expect.any(Number));
      expect(mockRedis.releaseLock).toHaveBeenCalledWith('cobuy-builder');
      expect(mockRedis.setIdList).toHaveBeenCalledWith(
        'rec:cobought:1',
        [3],
        expect.any(Number),
      );
    });

    it('should release lock even if an error occurs', async () => {
      mockRedis.acquireLock.mockResolvedValueOnce(true);
      mockPrisma.orderProducts.groupBy.mockRejectedValueOnce(new Error('DB error'));

      await service.buildCoBought();

      expect(mockRedis.releaseLock).toHaveBeenCalledWith('cobuy-builder');
    });

    it('should not call setIdList when no products are found', async () => {
      mockRedis.acquireLock.mockResolvedValueOnce(true);
      // groupBy returns empty => getTopOrderedProducts returns early without calling product.findMany
      mockPrisma.orderProducts.groupBy.mockResolvedValueOnce([]);
      mockRedis.setMeta.mockResolvedValue(undefined);

      await service.buildCoBought();

      expect(mockRedis.setIdList).not.toHaveBeenCalled();
    });
  });

  describe('findCoBoughtFallback', () => {
    it('should return empty array if product not found', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce(null);
      const result = await service.findCoBoughtFallback(999);
      expect(result).toEqual([]);
    });

    it('should return empty array if product has no categoryId', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({ id: 1, categoryId: null });
      const result = await service.findCoBoughtFallback(1);
      expect(result).toEqual([]);
    });

    it('should return ordered product IDs in same category', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({ id: 1, categoryId: 5 });
      mockPrisma.product.findMany.mockResolvedValueOnce([{ id: 2 }, { id: 3 }]);
      mockPrisma.orderProducts.groupBy.mockResolvedValueOnce([
        { productId: 2, _count: { productId: 5 } },
        { productId: 3, _count: { productId: 2 } },
      ]);

      const result = await service.findCoBoughtFallback(1);

      expect(result).toEqual([2, 3]);
    });

    it('should return empty array if no category products exist', async () => {
      mockPrisma.product.findUnique.mockResolvedValueOnce({ id: 1, categoryId: 5 });
      mockPrisma.product.findMany.mockResolvedValueOnce([]);

      const result = await service.findCoBoughtFallback(1);
      expect(result).toEqual([]);
    });
  });
});
