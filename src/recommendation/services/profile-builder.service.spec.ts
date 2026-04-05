import { Test, TestingModule } from '@nestjs/testing';
import { ProfileBuilderService } from './profile-builder.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RecommendationRedisService } from './recommendation-redis.service';
import { applyTimeDecay } from '../constants/event-weights';

// p-limit is ESM-only — provide a CJS-compatible mock for Jest
jest.mock('p-limit', () => ({
  __esModule: true,
  default: () => <T>(fn: () => T) => fn(),
}));

const mockPrisma = {
  productView: { findMany: jest.fn() },
  productClick: { findMany: jest.fn() },
  productSearch: { findMany: jest.fn() },
  orderProducts: { findMany: jest.fn() },
  user: { findUnique: jest.fn() },
};

const mockRedis = {
  setJson: jest.fn().mockResolvedValue(undefined),
  setMeta: jest.fn().mockResolvedValue(undefined),
  acquireLock: jest.fn().mockResolvedValue(true),
  releaseLock: jest.fn().mockResolvedValue(undefined),
  keys: {
    profile: (id: number) => `rec:profile:${id}`,
    metaLastRun: 'rec:meta:lastRun',
    metaLastDuration: 'rec:meta:lastDuration',
    metaUserCount: 'rec:meta:userCount',
    lock: (j: string) => `rec:lock:${j}`,
  },
};

describe('ProfileBuilderService', () => {
  let service: ProfileBuilderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileBuilderService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RecommendationRedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<ProfileBuilderService>(ProfileBuilderService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('applyTimeDecay', () => {
    it('should return full weight for day 0', () => {
      expect(applyTimeDecay(5.0, 0)).toBeCloseTo(5.0);
    });

    it('should reduce weight over time', () => {
      const day1 = applyTimeDecay(5.0, 1);
      const day30 = applyTimeDecay(5.0, 30);
      expect(day1).toBeGreaterThan(day30);
      expect(day30).toBeGreaterThan(0);
    });

    it('should halve weight at ~23 days', () => {
      const halfLife = applyTimeDecay(1.0, 23);
      expect(halfLife).toBeCloseTo(0.5, 1);
    });

    it('should handle negative weights (remove_from_cart)', () => {
      const result = applyTimeDecay(-1.5, 5);
      expect(result).toBeLessThan(0);
    });
  });

  describe('buildProfiles (cron job)', () => {
    it('should skip if lock cannot be acquired', async () => {
      mockRedis.acquireLock.mockResolvedValueOnce(false);
      // No user queries should happen when locked
      await service.buildProfiles();
      expect(mockPrisma.productView.findMany).not.toHaveBeenCalled();
    });

    it('should build profiles for active users', async () => {
      // Active users query
      mockPrisma.productView.findMany
        // First call: getActiveUserIds (for views)
        .mockResolvedValueOnce([{ userId: 1 }])
        // Second call: buildAndStoreProfile for user 1
        .mockResolvedValueOnce([
          {
            productId: 1,
            viewCount: 5,
            lastViewedAt: new Date(),
            product: { categoryId: 10, brandId: 20 },
          },
        ]);
      mockPrisma.productClick.findMany
        // First call: getActiveUserIds (for clicks)
        .mockResolvedValueOnce([])
        // Second call: buildAndStoreProfile for user 1
        .mockResolvedValueOnce([]);
      mockPrisma.orderProducts.findMany
        // First call: getActiveUserIds (for orders)
        .mockResolvedValueOnce([])
        // Second call: buildAndStoreProfile for user 1
        .mockResolvedValueOnce([]);
      mockPrisma.productSearch.findMany.mockResolvedValue([]);
      mockPrisma.user.findUnique.mockResolvedValue({ tradeRole: 'BUYER' });

      await service.buildProfiles();

      expect(mockRedis.setJson).toHaveBeenCalledWith(
        'rec:profile:1',
        expect.objectContaining({
          categories: expect.any(Object),
          brands: expect.any(Object),
          topProducts: expect.any(Array),
          tradeRole: 'BUYER',
        }),
        expect.any(Number),
      );
      expect(mockRedis.releaseLock).toHaveBeenCalledWith('profile-builder');
    });

    it('should release lock even on error', async () => {
      mockPrisma.productView.findMany.mockRejectedValue(new Error('DB error'));
      mockPrisma.productClick.findMany.mockRejectedValue(new Error('DB error'));
      mockPrisma.orderProducts.findMany.mockRejectedValue(new Error('DB error'));

      await service.buildProfiles();

      expect(mockRedis.releaseLock).toHaveBeenCalledWith('profile-builder');
    });
  });

  describe('profile data accuracy', () => {
    const setupMocks = (overrides: Partial<{
      views: any[];
      clicks: any[];
      searches: any[];
      orders: any[];
      user: any;
    }> = {}) => {
      const defaults = {
        views: [],
        clicks: [],
        searches: [],
        orders: [],
        user: { tradeRole: 'BUYER' },
      };
      const config = { ...defaults, ...overrides };

      // getActiveUserIds calls
      mockPrisma.productView.findMany
        .mockResolvedValueOnce([{ userId: 1 }])
        .mockResolvedValueOnce(config.views);
      mockPrisma.productClick.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(config.clicks);
      mockPrisma.orderProducts.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(config.orders);
      mockPrisma.productSearch.findMany.mockResolvedValue(config.searches);
      mockPrisma.user.findUnique.mockResolvedValue(config.user);
    };

    it('should build profile with categories from product views', async () => {
      setupMocks({
        views: [
          { productId: 1, viewCount: 5, lastViewedAt: new Date(), product: { categoryId: 10, brandId: 20 } },
          { productId: 2, viewCount: 1, lastViewedAt: new Date(), product: { categoryId: 10, brandId: 30 } },
        ],
      });

      await service.buildProfiles();

      const storedProfile = mockRedis.setJson.mock.calls[0][1];
      expect(storedProfile.categories['10']).toBeGreaterThan(0);
      expect(storedProfile.brands['20']).toBeGreaterThan(0);
      expect(storedProfile.topProducts).toContain(1);
      expect(storedProfile.tradeRole).toBe('BUYER');
    });

    it('should give repeat views higher weight than single views', async () => {
      setupMocks({
        views: [
          // viewCount >= 3 (REPEAT_VIEW_THRESHOLD) => product_view_repeat weight 2.0
          { productId: 1, viewCount: 10, lastViewedAt: new Date(), product: { categoryId: 10, brandId: 20 } },
          // viewCount < 3 => product_view weight 1.0
          { productId: 2, viewCount: 1, lastViewedAt: new Date(), product: { categoryId: 10, brandId: 20 } },
        ],
      });

      await service.buildProfiles();

      const storedProfile = mockRedis.setJson.mock.calls[0][1];
      // Product 1 (repeat view) should rank higher than product 2
      const idx1 = storedProfile.topProducts.indexOf(1);
      const idx2 = storedProfile.topProducts.indexOf(2);
      expect(idx1).toBeLessThan(idx2);
    });

    it('should weight orders highest (order_complete = 5.0)', async () => {
      setupMocks({
        views: [
          { productId: 1, viewCount: 1, lastViewedAt: new Date(), product: { categoryId: 10, brandId: 20 } },
        ],
        orders: [
          {
            productId: 2,
            createdAt: new Date(),
            salePrice: '99.99',
            orderProduct_product: { categoryId: 10, brandId: 20, productType: 'P' },
          },
        ],
      });

      await service.buildProfiles();

      const storedProfile = mockRedis.setJson.mock.calls[0][1];
      // Product 2 (ordered, weight 5.0) should outrank product 1 (viewed, weight 1.0)
      expect(storedProfile.topProducts[0]).toBe(2);
    });

    it('should compute shopping flow percentages from order productTypes', async () => {
      setupMocks({
        orders: [
          {
            productId: 1,
            createdAt: new Date(),
            salePrice: '50.00',
            orderProduct_product: { categoryId: 1, brandId: null, productType: 'P' },
          },
          {
            productId: 2,
            createdAt: new Date(),
            salePrice: '100.00',
            orderProduct_product: { categoryId: 1, brandId: null, productType: 'R' },
          },
        ],
      });

      await service.buildProfiles();

      const storedProfile = mockRedis.setJson.mock.calls[0][1];
      expect(storedProfile.shoppingFlows).toBeDefined();
      expect(storedProfile.shoppingFlows['regular']).toBeDefined();
      expect(storedProfile.shoppingFlows['rfq']).toBeDefined();
    });

    it('should compute price range from order sale prices', async () => {
      setupMocks({
        orders: [
          {
            productId: 1,
            createdAt: new Date(),
            salePrice: '50.00',
            orderProduct_product: { categoryId: 1, brandId: null, productType: 'P' },
          },
          {
            productId: 2,
            createdAt: new Date(),
            salePrice: '150.00',
            orderProduct_product: { categoryId: 1, brandId: null, productType: 'P' },
          },
        ],
      });

      await service.buildProfiles();

      const storedProfile = mockRedis.setJson.mock.calls[0][1];
      expect(storedProfile.priceRange.min).toBe(50);
      expect(storedProfile.priceRange.max).toBe(150);
      expect(storedProfile.priceRange.avg).toBe(100);
    });
  });
});
