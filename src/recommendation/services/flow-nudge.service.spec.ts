import { Test, TestingModule } from '@nestjs/testing';
import { FlowNudgeService } from './flow-nudge.service';
import { RecommendationRedisService } from './recommendation-redis.service';

const mockRedis = {
  getJson: jest.fn(),
  keys: {
    profile: (id: number) => `rec:profile:${id}`,
  },
};

describe('FlowNudgeService', () => {
  let service: FlowNudgeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FlowNudgeService,
        { provide: RecommendationRedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<FlowNudgeService>(FlowNudgeService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return empty array when no profile exists', async () => {
    mockRedis.getJson.mockResolvedValue(null);
    const result = await service.getNudges(1);
    expect(result).toEqual([]);
  });

  it('should suggest RFQ for high regular usage with sufficient avg price', async () => {
    mockRedis.getJson.mockResolvedValue({
      shoppingFlows: { regular: 0.8, rfq: 0 },
      priceRange: { min: 10, max: 500, avg: 100 },
      tradeRole: 'BUYER',
      categories: {},
      brands: {},
      topProducts: [],
      locale: 'en',
    });

    const result = await service.getNudges(1);

    const rfqNudge = result.find((n) => n.type === 'rfq');
    expect(rfqNudge).toBeDefined();
    expect(rfqNudge!.ctaUrl).toContain('rfq');
    expect(rfqNudge!.confidence).toBeGreaterThan(0);
  });

  it('should NOT suggest RFQ when rfq usage is already above threshold', async () => {
    mockRedis.getJson.mockResolvedValue({
      shoppingFlows: { regular: 0.8, rfq: 0.5 }, // rfq >= 0.1 → no nudge
      priceRange: { min: 10, max: 500, avg: 100 },
      tradeRole: 'BUYER',
      categories: {},
      brands: {},
      topProducts: [],
      locale: 'en',
    });

    const result = await service.getNudges(1);
    const rfqNudge = result.find((n) => n.type === 'rfq');
    expect(rfqNudge).toBeUndefined();
  });

  it('should suggest wholesale for COMPANY users with low wholesale usage', async () => {
    mockRedis.getJson.mockResolvedValue({
      shoppingFlows: { regular: 0.5, wholesale: 0 },
      priceRange: { min: 50, max: 1000, avg: 200 },
      tradeRole: 'COMPANY',
      categories: {},
      brands: {},
      topProducts: [],
      locale: 'en',
    });

    const result = await service.getNudges(1);

    const wholesaleNudge = result.find((n) => n.type === 'wholesale');
    expect(wholesaleNudge).toBeDefined();
    expect(wholesaleNudge!.ctaUrl).toContain('wholesale');
  });

  it('should NOT suggest wholesale for BUYER role', async () => {
    mockRedis.getJson.mockResolvedValue({
      shoppingFlows: { regular: 0.5, wholesale: 0 },
      priceRange: { min: 50, max: 1000, avg: 200 },
      tradeRole: 'BUYER', // BUYER, not COMPANY
      categories: {},
      brands: {},
      topProducts: [],
      locale: 'en',
    });

    const result = await service.getNudges(1);
    const wholesaleNudge = result.find((n) => n.type === 'wholesale');
    expect(wholesaleNudge).toBeUndefined();
  });

  it('should suggest services for FREELANCER role with low services usage', async () => {
    mockRedis.getJson.mockResolvedValue({
      shoppingFlows: { regular: 0.8, services: 0 },
      priceRange: { min: 10, max: 200, avg: 50 },
      tradeRole: 'FREELANCER',
      categories: {},
      brands: {},
      topProducts: [],
      locale: 'en',
    });

    const result = await service.getNudges(1);
    const servicesNudge = result.find((n) => n.type === 'services');
    expect(servicesNudge).toBeDefined();
    expect(servicesNudge!.ctaUrl).toContain('services');
  });

  it('should suggest dropship for COMPANY or MEMBER roles without dropship usage', async () => {
    mockRedis.getJson.mockResolvedValue({
      shoppingFlows: { regular: 0.5 }, // no dropship key
      priceRange: { min: 50, max: 1000, avg: 200 },
      tradeRole: 'MEMBER',
      categories: {},
      brands: {},
      topProducts: [],
      locale: 'en',
    });

    const result = await service.getNudges(1);
    const dropshipNudge = result.find((n) => n.type === 'dropship');
    expect(dropshipNudge).toBeDefined();
    expect(dropshipNudge!.ctaUrl).toContain('dropship');
  });

  it('should return at most 3 nudges sorted by confidence descending', async () => {
    mockRedis.getJson.mockResolvedValue({
      shoppingFlows: { regular: 0.8, rfq: 0, wholesale: 0, services: 0, dropship: 0 },
      priceRange: { min: 50, max: 1000, avg: 200 },
      tradeRole: 'COMPANY',
      categories: {},
      brands: {},
      topProducts: [],
      locale: 'en',
    });

    const result = await service.getNudges(1);

    expect(result.length).toBeLessThanOrEqual(3);
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].confidence).toBeGreaterThanOrEqual(result[i + 1].confidence);
    }
  });

  it('should return nudges with required fields', async () => {
    mockRedis.getJson.mockResolvedValue({
      shoppingFlows: { regular: 0.8, rfq: 0 },
      priceRange: { min: 10, max: 500, avg: 100 },
      tradeRole: 'BUYER',
      categories: {},
      brands: {},
      topProducts: [],
      locale: 'en',
    });

    const result = await service.getNudges(1);

    if (result.length > 0) {
      const nudge = result[0];
      expect(nudge).toHaveProperty('type');
      expect(nudge).toHaveProperty('message');
      expect(nudge).toHaveProperty('ctaText');
      expect(nudge).toHaveProperty('ctaUrl');
      expect(nudge).toHaveProperty('confidence');
      expect(nudge.confidence).toBeGreaterThan(0);
      expect(nudge.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('should call getJson with the correct profile key', async () => {
    mockRedis.getJson.mockResolvedValue(null);
    await service.getNudges(42);
    expect(mockRedis.getJson).toHaveBeenCalledWith('rec:profile:42');
  });
});
