import { Test, TestingModule } from '@nestjs/testing';
import { SearchBoostService } from './search-boost.service';
import { RecommendationRedisService } from './recommendation-redis.service';

const mockRedis = {
  getJson: jest.fn(),
  getIdList: jest.fn(),
  keys: {
    profile: (id: number) => `rec:profile:${id}`,
    segTrending: (l: string, r: string) => `rec:seg:${l}:${r}:trending`,
  },
};

describe('SearchBoostService', () => {
  let service: SearchBoostService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchBoostService,
        { provide: RecommendationRedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<SearchBoostService>(SearchBoostService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return empty array for empty products input', async () => {
    const result = await service.getBoosts(1, 'en', 'BUYER', []);
    expect(result).toEqual([]);
  });

  it('should boost products matching user category affinity', async () => {
    mockRedis.getJson.mockResolvedValue({
      categories: { '10': 50, '20': 10 },
      brands: {},
      priceRange: { min: 0, max: 0, avg: 0 },
    });
    mockRedis.getIdList.mockResolvedValue([]);

    const result = await service.getBoosts(1, 'en', 'BUYER', [
      { id: 1, categoryId: 10, brandId: null, price: 100 }, // top affinity
      { id: 2, categoryId: 20, brandId: null, price: 100 }, // lower affinity
      { id: 3, categoryId: 99, brandId: null, price: 100 }, // no affinity
    ]);

    expect(result[0].boost).toBeGreaterThan(result[1].boost);
    expect(result[1].boost).toBeGreaterThan(result[2].boost);
    expect(result[2].boost).toBe(0);
  });

  it('should boost brand affinity products', async () => {
    mockRedis.getJson.mockResolvedValue({
      categories: {},
      brands: { '5': 30 },
      priceRange: { min: 0, max: 0, avg: 0 },
    });
    mockRedis.getIdList.mockResolvedValue([]);

    const result = await service.getBoosts(1, 'en', 'BUYER', [
      { id: 1, categoryId: 1, brandId: 5, price: 100 },  // matching brand
      { id: 2, categoryId: 1, brandId: 99, price: 100 }, // no brand match
    ]);

    expect(result[0].boost).toBeGreaterThan(result[1].boost);
  });

  it('should boost trending products', async () => {
    mockRedis.getJson.mockResolvedValue(null); // no profile
    mockRedis.getIdList.mockResolvedValue([1, 2]); // product 1 and 2 are trending

    const result = await service.getBoosts(null, 'en', 'BUYER', [
      { id: 1, categoryId: 1, brandId: null, price: 100 }, // trending
      { id: 3, categoryId: 1, brandId: null, price: 100 }, // not trending
    ]);

    expect(result[0].boost).toBe(0.1);  // trending bonus
    expect(result[1].boost).toBe(0);    // not trending
  });

  it('should work for anonymous users (null userId) without profile', async () => {
    mockRedis.getJson.mockResolvedValue(null);
    mockRedis.getIdList.mockResolvedValue([]);

    const result = await service.getBoosts(null, 'en', 'BUYER', [
      { id: 1, categoryId: 1, brandId: null, price: 100 },
    ]);

    expect(result[0].boost).toBe(0);
  });

  it('should add price proximity boost when product price is near avg', async () => {
    mockRedis.getJson.mockResolvedValue({
      categories: {},
      brands: {},
      priceRange: { min: 80, max: 120, avg: 100 },
    });
    mockRedis.getIdList.mockResolvedValue([]);

    const result = await service.getBoosts(1, 'en', 'BUYER', [
      { id: 1, categoryId: 1, brandId: null, price: 100 }, // exact avg — max price boost
      { id: 2, categoryId: 1, brandId: null, price: 300 }, // far from avg — no price boost
    ]);

    expect(result[0].boost).toBeGreaterThan(result[1].boost);
  });

  it('should combine category, brand, and trending boosts', async () => {
    mockRedis.getJson.mockResolvedValue({
      categories: { '10': 100 },
      brands: { '5': 100 },
      priceRange: { min: 90, max: 110, avg: 100 },
    });
    mockRedis.getIdList.mockResolvedValue([1]); // product 1 is trending

    const result = await service.getBoosts(1, 'en', 'BUYER', [
      { id: 1, categoryId: 10, brandId: 5, price: 100 }, // category + brand + trending + price
      { id: 2, categoryId: 99, brandId: null, price: 999 }, // nothing matches
    ]);

    expect(result[0].boost).toBeGreaterThan(result[1].boost);
    // Max possible: 0.3 (category) + 0.2 (brand) + 0.1 (price at avg) + 0.1 (trending) = 0.7
    expect(result[0].boost).toBeLessThanOrEqual(0.7);
  });

  it('should not fetch profile when userId is null', async () => {
    mockRedis.getIdList.mockResolvedValue([]);

    await service.getBoosts(null, 'en', 'BUYER', [
      { id: 1, categoryId: 1, brandId: null, price: 100 },
    ]);

    expect(mockRedis.getJson).not.toHaveBeenCalled();
  });
});
