import { SearchAnalyticsService } from './search-analytics.service';

describe('SearchAnalyticsService', () => {
  let service: SearchAnalyticsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      productSearch: {
        create: jest.fn(),
      },
      $queryRawUnsafe: jest.fn(),
    };

    service = new SearchAnalyticsService(mockPrisma);
  });

  describe('logSearch', () => {
    it('creates a ProductSearch record with correct data', async () => {
      mockPrisma.productSearch.create.mockResolvedValue({ id: 1 });

      await service.logSearch({
        query: 'wireless headphones',
        parsedType: 'single',
        language: 'en',
        resultCount: 42,
        userId: 123,
        deviceId: 'dev-abc',
        responseTimeMs: 150,
      });

      expect(mockPrisma.productSearch.create).toHaveBeenCalledWith({
        data: {
          searchTerm: 'wireless headphones',
          userId: 123,
          deviceId: 'dev-abc',
          clicked: false,
        },
      });
    });

    it('handles null userId and deviceId', async () => {
      mockPrisma.productSearch.create.mockResolvedValue({ id: 2 });

      await service.logSearch({
        query: 'laptop',
        parsedType: 'single',
        language: 'en',
        resultCount: 10,
        responseTimeMs: 100,
      });

      expect(mockPrisma.productSearch.create).toHaveBeenCalledWith({
        data: {
          searchTerm: 'laptop',
          userId: null,
          deviceId: null,
          clicked: false,
        },
      });
    });

    it('does not throw on database error (fire-and-forget)', async () => {
      mockPrisma.productSearch.create.mockRejectedValue(new Error('DB error'));

      // Should NOT throw
      await expect(
        service.logSearch({
          query: 'test',
          parsedType: 'single',
          language: 'en',
          resultCount: 0,
          responseTimeMs: 50,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('getTopSearches', () => {
    it('returns top search terms with counts', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        { term: 'iphone', count: BigInt(150) },
        { term: 'laptop', count: BigInt(100) },
        { term: 'headphones', count: BigInt(75) },
      ]);

      const result = await service.getTopSearches(30, 50);

      expect(result).toEqual([
        { term: 'iphone', count: 150 },
        { term: 'laptop', count: 100 },
        { term: 'headphones', count: 75 },
      ]);
    });

    it('uses correct time window', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
      const before = Date.now();

      await service.getTopSearches(7, 10);

      const [query, sinceDate, limitArg] = mockPrisma.$queryRawUnsafe.mock.calls[0];
      expect(query).toContain('ProductSearch');
      expect(sinceDate).toBeInstanceOf(Date);
      // The since date should be roughly 7 days ago
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      expect(before - sinceDate.getTime()).toBeGreaterThanOrEqual(sevenDaysMs - 1000);
      expect(before - sinceDate.getTime()).toBeLessThanOrEqual(sevenDaysMs + 1000);
      expect(limitArg).toBe(10);
    });

    it('returns empty array when no data', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const result = await service.getTopSearches();

      expect(result).toEqual([]);
    });
  });

  describe('getZeroResultQueries', () => {
    it('returns terms with 3+ unclicked searches', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([
        { term: 'unicorn lamp' },
        { term: 'holographic keyboard' },
      ]);

      const result = await service.getZeroResultQueries(7, 20);

      expect(result).toEqual(['unicorn lamp', 'holographic keyboard']);
    });

    it('passes correct parameters to raw query', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      await service.getZeroResultQueries(14, 5);

      const [query, sinceDate, limitArg] = mockPrisma.$queryRawUnsafe.mock.calls[0];
      expect(query).toContain('clicked = false');
      expect(query).toContain('HAVING COUNT(*) >= 3');
      expect(sinceDate).toBeInstanceOf(Date);
      expect(limitArg).toBe(5);
    });

    it('returns empty array when no zero-result queries', async () => {
      mockPrisma.$queryRawUnsafe.mockResolvedValue([]);

      const result = await service.getZeroResultQueries();

      expect(result).toEqual([]);
    });
  });
});
