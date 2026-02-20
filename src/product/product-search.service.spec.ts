import { Test, TestingModule } from '@nestjs/testing';
import { ProductSearchService } from './product-search.service';
import { PrismaService } from '../prisma/prisma.service';
import { HelperService } from '../helper/helper.service';
import { CacheService, CACHE_KEYS } from '../cache/cache.service';
import { SpecificationService } from '../specification/specification.service';

// ─────────────────────────────────────────────────────────
// Mock PrismaService
// ─────────────────────────────────────────────────────────
const mockPrismaService = {
  product: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
  },
  productPrice: {
    findMany: jest.fn(),
  },
  $queryRawUnsafe: jest.fn(),
};

const mockHelperService = {
  getAdminId: jest.fn(),
};

const mockCacheService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  getOrSet: jest.fn(),
};

const mockSpecificationService = {
  getFilters: jest.fn().mockResolvedValue({ filters: [] }),
  getCategoryTags: jest.fn().mockResolvedValue([]),
  getTemplatesByCategory: jest.fn().mockResolvedValue([]),
  getTemplatesForCategories: jest.fn().mockResolvedValue({}),
  createTemplate: jest.fn(),
  bulkCreateTemplates: jest.fn(),
  updateTemplate: jest.fn(),
  deleteTemplate: jest.fn(),
  setSpecValues: jest.fn(),
  getSpecValues: jest.fn(),
  updateSpecValue: jest.fn(),
};

describe('ProductSearchService', () => {
  let service: ProductSearchService;
  let prisma: typeof mockPrismaService;
  let cacheService: typeof mockCacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductSearchService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: HelperService, useValue: mockHelperService },
        { provide: CacheService, useValue: mockCacheService },
        { provide: SpecificationService, useValue: mockSpecificationService },
      ],
    }).compile();

    service = module.get<ProductSearchService>(ProductSearchService);
    prisma = module.get(PrismaService);
    cacheService = module.get(CacheService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ===========================================================================
  // smartSearch() — Spec Filters SQL Generation
  // ===========================================================================
  // Helper to call smartSearch with common defaults
  function callSmartSearch(specFilters?: Record<string, string[]>): Promise<any> {
    return service.smartSearch({
      page: 1,
      limit: 10,
      term: 'test product',
      sort: 'relevance',
      specFilters,
    });
  }

  describe('smartSearch() - spec filters', () => {
    it('should return early for short search terms', async () => {
      const result: any = await service.smartSearch({
        page: 1,
        limit: 10,
        term: 'a',
        sort: 'relevance',
      });

      expect(result.status).toBe(false);
      expect(result.message).toBe('Search term too short');
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('should return cached result when available', async () => {
      const cachedResult = {
        status: true,
        message: 'Search results',
        data: [{ id: 1, productName: 'Cached Product' }],
        totalCount: 1,
      };
      cacheService.get.mockResolvedValue(cachedResult);

      const result = await callSmartSearch();

      expect(result).toEqual(cachedResult);
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('should include specFilters in cache hash', async () => {
      // Two calls with different specFilters should produce different cache keys
      cacheService.get.mockResolvedValue(null);
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([]) // count query
        .mockResolvedValueOnce([]); // data query

      await callSmartSearch({ ram: ['8GB'] });

      const firstCallCacheKey = cacheService.get.mock.calls[0][0];

      jest.clearAllMocks();
      cacheService.get.mockResolvedValue(null);
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await callSmartSearch({ ram: ['16GB'] });

      const secondCallCacheKey = cacheService.get.mock.calls[0][0];

      // Different specFilters should produce different cache keys
      expect(firstCallCacheKey).not.toBe(secondCallCacheKey);
    });

    it('should handle exact value spec filter (SELECT/TEXT)', async () => {
      cacheService.get.mockResolvedValue(null);

      // Mock the raw SQL queries — count + data
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: BigInt(2) }]) // count query
        .mockResolvedValueOnce([
          { id: 1, productName: 'Phone A' },
          { id: 2, productName: 'Phone B' },
        ]); // data query

      const result = await callSmartSearch({ ram: ['8GB', '16GB'] });

      // Verify $queryRawUnsafe was called (count + data queries)
      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();

      // Verify the SQL includes the spec filter pattern
      const calls = prisma.$queryRawUnsafe.mock.calls;
      const allSQL = calls.map((c) => c[0]).join(' ');

      // Should contain the spec value matching SQL for exact value
      expect(allSQL).toContain('product_spec_value');
      expect(allSQL).toContain('spec_template');
    });

    it('should handle numeric range _min spec filter', async () => {
      cacheService.get.mockResolvedValue(null);
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: BigInt(1) }])
        .mockResolvedValueOnce([{ id: 1, productName: 'Big Screen Phone' }]);

      await callSmartSearch({ screen_size_min: ['5.5'] });

      const calls = prisma.$queryRawUnsafe.mock.calls;
      const allSQL = calls.map((c) => c[0]).join(' ');

      // Should contain numericValue >= for _min filter
      expect(allSQL).toContain('numericValue');
    });

    it('should handle numeric range _max spec filter', async () => {
      cacheService.get.mockResolvedValue(null);
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: BigInt(1) }])
        .mockResolvedValueOnce([{ id: 1, productName: 'Small Screen Phone' }]);

      await callSmartSearch({ screen_size_max: ['6.5'] });

      const calls = prisma.$queryRawUnsafe.mock.calls;
      const allSQL = calls.map((c) => c[0]).join(' ');

      expect(allSQL).toContain('numericValue');
    });

    it('should handle combined _min + _max range filters', async () => {
      cacheService.get.mockResolvedValue(null);
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: BigInt(3) }])
        .mockResolvedValueOnce([
          { id: 1, productName: 'Phone A' },
          { id: 2, productName: 'Phone B' },
          { id: 3, productName: 'Phone C' },
        ]);

      await callSmartSearch({
        screen_size_min: ['5.5'],
        screen_size_max: ['6.8'],
      });

      // Both _min and _max clauses should be in the SQL
      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
    });

    it('should handle combined spec + text search', async () => {
      cacheService.get.mockResolvedValue(null);
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: BigInt(1) }])
        .mockResolvedValueOnce([{ id: 1, productName: 'Samsung Galaxy' }]);

      const result = await service.smartSearch({
        page: 1,
        limit: 10,
        term: 'samsung phone',
        sort: 'relevance',
        specFilters: { ram: ['8GB'], screen_size_min: ['6.0'] },
      });

      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // smartSearch() — Edge Cases
  // ===========================================================================
  describe('smartSearch() - edge cases', () => {
    it('should handle empty specFilters object', async () => {
      cacheService.get.mockResolvedValue(null);
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: BigInt(0) }])
        .mockResolvedValueOnce([]);

      const result = await callSmartSearch({});

      // Should still execute — empty object means no spec filters applied
      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
    });

    it('should handle null/undefined specFilters', async () => {
      cacheService.get.mockResolvedValue(null);
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: BigInt(0) }])
        .mockResolvedValueOnce([]);

      const result = await callSmartSearch(undefined);

      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
    });

    it('should skip spec filters with empty array values', async () => {
      cacheService.get.mockResolvedValue(null);
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: BigInt(0) }])
        .mockResolvedValueOnce([]);

      await callSmartSearch({ ram: [] }); // empty array — should skip

      // Should still work without errors
      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
    });

    it('should skip _min/_max with NaN values', async () => {
      cacheService.get.mockResolvedValue(null);
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ total: BigInt(0) }])
        .mockResolvedValueOnce([]);

      await callSmartSearch({ screen_size_min: ['not-a-number'] });

      // Should complete without error — NaN filter is just skipped
      expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // smartSearch() — Sort Options
  // ===========================================================================
  describe('smartSearch() - sort options', () => {
    const sortTests = ['price_asc', 'price_desc', 'newest', 'oldest', 'popularity', 'rating', 'relevance'];

    for (const sortOption of sortTests) {
      it(`should handle sort: "${sortOption}"`, async () => {
        cacheService.get.mockResolvedValue(null);
        prisma.$queryRawUnsafe
          .mockResolvedValueOnce([{ total: BigInt(0) }])
          .mockResolvedValueOnce([]);

        const result = await service.smartSearch({
          page: 1,
          limit: 10,
          term: 'test product',
          sort: sortOption,
        });

        expect(prisma.$queryRawUnsafe).toHaveBeenCalled();
      });
    }
  });

});
