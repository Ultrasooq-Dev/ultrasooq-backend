import { Test, TestingModule } from '@nestjs/testing';
import { RecommendationService } from './recommendation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RecommendationRedisService } from './recommendation-redis.service';
import { SimilarityService } from './similarity.service';

const mockPrisma = {
  product: { findMany: jest.fn() },
  productPrice: { findMany: jest.fn() },
  cart: { findMany: jest.fn() },
  orderProducts: { findMany: jest.fn() },
};

const mockRedis = {
  getIdList: jest.fn(),
  getJson: jest.fn(),
  keys: {
    personal: (id: number) => `rec:personal:${id}`,
    similar: (id: number) => `rec:similar:${id}`,
    cobought: (id: number) => `rec:cobought:${id}`,
    crosssell: (id: number) => `rec:crosssell:${id}`,
    segTrending: (l: string, r: string) => `rec:seg:${l}:${r}:trending`,
    segTrendingCat: (l: string, r: string, c: number) => `rec:seg:${l}:${r}:trending:${c}`,
    editorialPicks: 'rec:editorial:picks',
    profile: (id: number) => `rec:profile:${id}`,
  },
};

const mockSimilarity = {
  findSimilarRealtime: jest.fn().mockResolvedValue([10, 11, 12]),
};

/** Helper: mock hydration to return empty results (default for most tests) */
const mockEmptyHydration = () => {
  mockPrisma.product.findMany.mockResolvedValue([]);
  mockPrisma.productPrice.findMany.mockResolvedValue([]);
};

describe('RecommendationService', () => {
  let service: RecommendationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RecommendationRedisService, useValue: mockRedis },
        { provide: SimilarityService, useValue: mockSimilarity },
      ],
    }).compile();

    service = module.get<RecommendationService>(RecommendationService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPersonal', () => {
    it('should return personal recs from Redis when available', async () => {
      mockRedis.getIdList.mockResolvedValue([1, 2, 3]);
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 1,
          productName: 'Test A',
          categoryId: 1,
          category: { name: 'Electronics' },
          productImages: [{ image: 'img1.jpg' }],
        },
        {
          id: 2,
          productName: 'Test B',
          categoryId: 1,
          category: { name: 'Electronics' },
          productImages: [],
        },
      ]);
      mockPrisma.productPrice.findMany.mockResolvedValue([
        {
          productId: 1,
          productPrice: '99.99',
          offerPrice: '89.99',
          adminId: 10,
          adminDetail: { firstName: 'John', lastName: 'Doe', companyName: null },
        },
      ]);

      const result = await service.getPersonal(42, 'en', 'BUYER', 10);

      expect(result.algorithm).toBe('personal');
      expect(result.segment).toBe('en:BUYER');
      expect(result.cached).toBe(true);
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0]).toHaveProperty('productId');
      expect(result.items[0]).toHaveProperty('recId');
      expect(result.items[0]).toHaveProperty('reason');
    });

    it('should fallback to trending when personal recs are missing', async () => {
      mockRedis.getIdList
        .mockResolvedValueOnce(null)       // personal = miss
        .mockResolvedValueOnce([5, 6, 7]); // segTrending = hit
      mockEmptyHydration();

      const result = await service.getPersonal(42, 'en', 'BUYER', 10);

      expect(result.algorithm).toBe('trending');
    });

    it('should fallback to editorial picks when trending also missing', async () => {
      mockRedis.getIdList
        .mockResolvedValueOnce(null)    // personal = miss
        .mockResolvedValueOnce(null)    // segTrending = miss
        .mockResolvedValueOnce([8, 9]); // editorialPicks = hit
      mockEmptyHydration();

      const result = await service.getPersonal(42, 'en', 'BUYER', 10);

      expect(mockRedis.getIdList).toHaveBeenCalledTimes(3);
      expect(result.algorithm).toBe('editorial');
    });

    it('should include image, price, seller in hydrated items', async () => {
      mockRedis.getIdList.mockResolvedValue([1]);
      mockPrisma.product.findMany.mockResolvedValue([
        {
          id: 1,
          productName: 'Widget',
          categoryId: 5,
          category: { name: 'Gadgets' },
          productImages: [{ image: 'img.jpg' }],
        },
      ]);
      mockPrisma.productPrice.findMany.mockResolvedValue([
        {
          productId: 1,
          productPrice: '50.00',
          offerPrice: null,
          adminId: 99,
          adminDetail: { firstName: 'Acme', lastName: 'Corp', companyName: 'Acme Corp' },
        },
      ]);

      const result = await service.getPersonal(1, 'en', 'BUYER', 5);

      expect(result.items[0].image).toBe('img.jpg');
      expect(result.items[0].price).toBe(50);
      expect(result.items[0].sellerName).toBe('Acme Corp');
      expect(result.items[0].category).toBe('Gadgets');
    });

    it('should generate a recId for each item', async () => {
      mockRedis.getIdList.mockResolvedValue([1]);
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 1, productName: 'Widget', categoryId: 1, category: { name: 'Cat' }, productImages: [] },
      ]);
      mockPrisma.productPrice.findMany.mockResolvedValue([]);

      const result = await service.getPersonal(1, 'en', 'BUYER', 5);

      expect(result.items[0].recId).toMatch(/^rec_[a-f0-9]+_personal_\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('getProductRecs', () => {
    it('should return similar products from Redis cache', async () => {
      mockRedis.getIdList.mockResolvedValue([10, 20, 30]);
      mockEmptyHydration();

      const result = await service.getProductRecs(1, 'similar', 'en', 'BUYER', 10);

      expect(result.algorithm).toBe('similar');
      expect(result.cached).toBe(true);
    });

    it('should fallback to realtime for similar when Redis misses', async () => {
      mockRedis.getIdList.mockResolvedValue(null);
      mockSimilarity.findSimilarRealtime.mockResolvedValue([10, 11]);
      mockEmptyHydration();

      const result = await service.getProductRecs(1, 'similar', 'en', 'BUYER', 10);

      expect(result.algorithm).toBe('similar_realtime');
      expect(result.cached).toBe(false);
      expect(mockSimilarity.findSimilarRealtime).toHaveBeenCalledWith(1, 10);
    });

    it('should fallback cobought to similar when cobought misses', async () => {
      mockRedis.getIdList
        .mockResolvedValueOnce(null)    // cobought = miss
        .mockResolvedValueOnce([5, 6]); // similar = hit
      mockEmptyHydration();

      const result = await service.getProductRecs(1, 'cobought', 'en', 'BUYER', 10);

      expect(result.algorithm).toBe('similar');
    });

    it('should fallback cobought to realtime when both cobought and similar miss', async () => {
      mockRedis.getIdList
        .mockResolvedValueOnce(null) // cobought = miss
        .mockResolvedValueOnce(null); // similar = miss
      mockSimilarity.findSimilarRealtime.mockResolvedValue([20, 21]);
      mockEmptyHydration();

      const result = await service.getProductRecs(1, 'cobought', 'en', 'BUYER', 10);

      expect(result.algorithm).toBe('similar_realtime');
    });

    it('should return crosssell products from Redis', async () => {
      mockRedis.getIdList.mockResolvedValue([30, 31]);
      mockEmptyHydration();

      const result = await service.getProductRecs(1, 'crosssell', 'en', 'BUYER', 10);

      expect(result.algorithm).toBe('crosssell');
    });

    it('should include correct segment in response', async () => {
      mockRedis.getIdList.mockResolvedValue([1]);
      mockEmptyHydration();

      const result = await service.getProductRecs(1, 'similar', 'ar', 'COMPANY', 10);

      expect(result.segment).toBe('ar:COMPANY');
    });
  });

  describe('getCartRecs', () => {
    it('should aggregate cross-sell and co-bought across cart items', async () => {
      mockPrisma.cart.findMany.mockResolvedValue([
        { productId: 1 },
        { productId: 2 },
      ]);
      mockRedis.getIdList
        .mockResolvedValueOnce([10, 11])  // crosssell for product 1
        .mockResolvedValueOnce([20])      // cobought for product 1
        .mockResolvedValueOnce([11, 12])  // crosssell for product 2
        .mockResolvedValueOnce([21]);     // cobought for product 2
      mockEmptyHydration();

      const result = await service.getCartRecs(42, 'en', 'BUYER', 10);

      expect(result.algorithm).toBe('crosssell');
    });

    it('should deduplicate IDs across cart items', async () => {
      mockPrisma.cart.findMany.mockResolvedValue([{ productId: 1 }, { productId: 2 }]);
      mockRedis.getIdList
        .mockResolvedValueOnce([10, 11]) // crosssell for product 1
        .mockResolvedValueOnce([10])     // cobought for product 1 — duplicate of 10
        .mockResolvedValueOnce([11])     // crosssell for product 2 — duplicate of 11
        .mockResolvedValueOnce([12]);    // cobought for product 2
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.productPrice.findMany.mockResolvedValue([]);

      await service.getCartRecs(42, 'en', 'BUYER', 20);

      // Product.findMany should be called with deduplicated IDs
      const findCall = mockPrisma.product.findMany.mock.calls[0][0];
      const ids = findCall.where.id.in;
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });

    it('should fallback to personal when cart is empty', async () => {
      mockPrisma.cart.findMany.mockResolvedValue([]);
      mockRedis.getIdList.mockResolvedValue([1, 2, 3]); // personal/trending
      mockEmptyHydration();

      const result = await service.getCartRecs(42, 'en', 'BUYER', 10);

      // Delegates to getPersonal — should have some algorithm set
      expect(result).toBeDefined();
      expect(result.algorithm).toBeDefined();
    });

    it('should exclude cart items from recommendations', async () => {
      mockPrisma.cart.findMany.mockResolvedValue([{ productId: 5 }]);
      mockRedis.getIdList
        .mockResolvedValueOnce([5, 6, 7]) // crosssell includes cart item 5
        .mockResolvedValueOnce([8]);       // cobought
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.productPrice.findMany.mockResolvedValue([]);

      await service.getCartRecs(42, 'en', 'BUYER', 10);

      // Product 5 is in cart — should be excluded from hydration
      const findCall = mockPrisma.product.findMany.mock.calls[0][0];
      expect(findCall.where.id.in).not.toContain(5);
    });
  });

  describe('getTrending', () => {
    it('should return category-specific trending when categoryId provided', async () => {
      mockRedis.getIdList.mockResolvedValue([1, 2, 3]);
      mockEmptyHydration();

      const result = await service.getTrending('ar', 'COMPANY', 5, 10);

      expect(result.algorithm).toBe('trending');
      expect(result.segment).toBe('ar:COMPANY');
      // Should call segTrendingCat first
      expect(mockRedis.getIdList).toHaveBeenCalledWith('rec:seg:ar:COMPANY:trending:5');
    });

    it('should fallback to general trending when category-specific misses', async () => {
      mockRedis.getIdList
        .mockResolvedValueOnce(null)     // segTrendingCat = miss
        .mockResolvedValueOnce([1, 2]);  // segTrending = hit
      mockEmptyHydration();

      const result = await service.getTrending('ar', 'COMPANY', 5, 10);

      expect(result.algorithm).toBe('trending');
      expect(mockRedis.getIdList).toHaveBeenCalledWith('rec:seg:ar:COMPANY:trending');
    });

    it('should fallback to global trending (DEFAULT_LOCALE/ROLE) when all miss', async () => {
      mockRedis.getIdList
        .mockResolvedValueOnce(null)    // segTrendingCat = miss
        .mockResolvedValueOnce(null)    // segTrending specific = miss
        .mockResolvedValueOnce([1, 2]); // en:BUYER global = hit
      mockEmptyHydration();

      const result = await service.getTrending('de', 'FREELANCER', undefined, 10);

      expect(result.algorithm).toBe('trending');
      expect(mockRedis.getIdList).toHaveBeenCalledWith('rec:seg:en:BUYER:trending');
    });

    it('should return empty items when no trending data exists', async () => {
      mockRedis.getIdList.mockResolvedValue(null);
      mockEmptyHydration();

      const result = await service.getTrending('en', 'BUYER', undefined, 10);

      expect(result.items).toEqual([]);
    });
  });

  describe('getPostPurchaseRecs', () => {
    it('should aggregate co-bought and cross-sell from ordered products', async () => {
      mockPrisma.orderProducts.findMany.mockResolvedValue([
        { productId: 1 },
        { productId: 2 },
      ]);
      mockRedis.getIdList
        .mockResolvedValueOnce([10])  // cobought for product 1
        .mockResolvedValueOnce([20])  // crosssell for product 1
        .mockResolvedValueOnce([11])  // cobought for product 2
        .mockResolvedValueOnce([21]); // crosssell for product 2
      mockEmptyHydration();

      const result = await service.getPostPurchaseRecs(999, 42, 'en', 'BUYER', 10);

      expect(result.algorithm).toBe('cobought');
    });

    it('should exclude ordered products from recommendations', async () => {
      mockPrisma.orderProducts.findMany.mockResolvedValue([{ productId: 3 }]);
      mockRedis.getIdList
        .mockResolvedValueOnce([3, 10]) // cobought includes ordered product 3
        .mockResolvedValueOnce([11]);    // crosssell
      mockPrisma.product.findMany.mockResolvedValue([]);
      mockPrisma.productPrice.findMany.mockResolvedValue([]);

      await service.getPostPurchaseRecs(999, 42, 'en', 'BUYER', 10);

      const findCall = mockPrisma.product.findMany.mock.calls[0][0];
      expect(findCall.where.id.in).not.toContain(3);
    });
  });
});
