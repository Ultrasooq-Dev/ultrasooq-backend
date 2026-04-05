import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { RecommendationController } from '../src/recommendation/recommendation.controller';
import { RecommendationAdminController } from '../src/recommendation/recommendation-admin.controller';
import { RecommendationService } from '../src/recommendation/services/recommendation.service';
import { FeedbackService } from '../src/recommendation/services/feedback.service';
import { SearchBoostService } from '../src/recommendation/services/search-boost.service';
import { FlowNudgeService } from '../src/recommendation/services/flow-nudge.service';
import { RecommendationRedisService } from '../src/recommendation/services/recommendation-redis.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthGuard } from '../src/guards/AuthGuard';
import { SuperAdminAuthGuard } from '../src/guards/SuperAdminAuthGuard';

// ─── Mock responses ───────────────────────────────────────────────────────────

const mockRecommendationResponse = {
  items: [
    {
      productId: 1,
      productName: 'Test Product',
      image: 'test.jpg',
      price: 99.99,
      sellerId: 10,
      sellerName: 'Test Seller',
      category: 'Electronics',
      score: 5,
      reason: 'Recommended for you',
      recId: 'rec_abc123_personal_2026-04-05',
    },
  ],
  algorithm: 'personal',
  segment: 'en:BUYER',
  cached: true,
};

const mockRecommendationService = {
  getPersonal: jest.fn().mockResolvedValue(mockRecommendationResponse),
  getProductRecs: jest
    .fn()
    .mockResolvedValue({ ...mockRecommendationResponse, algorithm: 'similar' }),
  getTrending: jest
    .fn()
    .mockResolvedValue({ ...mockRecommendationResponse, algorithm: 'trending' }),
  getCartRecs: jest
    .fn()
    .mockResolvedValue({ ...mockRecommendationResponse, algorithm: 'crosssell' }),
  getPostPurchaseRecs: jest
    .fn()
    .mockResolvedValue({ ...mockRecommendationResponse, algorithm: 'cobought' }),
  getFlowRecs: jest
    .fn()
    .mockResolvedValue({ ...mockRecommendationResponse, algorithm: 'dropship_recs' }),
};

const mockFeedbackService = {
  trackFeedback: jest.fn().mockResolvedValue(undefined),
};

const mockSearchBoostService = {
  getBoosts: jest.fn().mockResolvedValue([]),
};

const mockFlowNudgeService = {
  getNudges: jest.fn().mockResolvedValue([
    { type: 'rfq', message: 'Try RFQ', ctaText: 'Go', ctaUrl: '/rfq', confidence: 0.8 },
  ]),
};

const mockRedisService = {
  getMeta: jest.fn().mockResolvedValue('2026-04-05T01:00:00Z'),
  keys: {
    metaLastRun: 'rec:meta:lastRun',
    metaLastDuration: 'rec:meta:lastDuration',
    metaProductCount: 'rec:meta:productCount',
    metaUserCount: 'rec:meta:userCount',
  },
};

const mockCrossSellRules = [
  {
    id: 1,
    sourceCategoryId: 1,
    targetCategoryId: 2,
    priority: 10,
    createdBy: 1,
    sourceCategory: { id: 1, name: 'Electronics' },
    targetCategory: { id: 2, name: 'Accessories' },
  },
];

const mockPrisma = {
  recommendationMetric: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  recommendationConfig: {
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue({ key: 'test_key', value: { enabled: true } }),
  },
  crossSellRule: {
    findMany: jest.fn().mockResolvedValue(mockCrossSellRules),
    create: jest.fn().mockResolvedValue({ id: 2 }),
  },
};

// Mock auth guards — always pass and attach a fake user to req
const mockAuthGuard = {
  canActivate: jest.fn().mockImplementation((context) => {
    const req = context.switchToHttp().getRequest();
    req.user = { sub: 42, tradeRole: 'BUYER' };
    return true;
  }),
};

const mockSuperAdminGuard = {
  canActivate: jest.fn().mockReturnValue(true),
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Recommendation System (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [RecommendationController, RecommendationAdminController],
      providers: [
        { provide: RecommendationService, useValue: mockRecommendationService },
        { provide: FeedbackService, useValue: mockFeedbackService },
        { provide: SearchBoostService, useValue: mockSearchBoostService },
        { provide: FlowNudgeService, useValue: mockFlowNudgeService },
        { provide: RecommendationRedisService, useValue: mockRedisService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue(mockAuthGuard)
      .overrideGuard(SuperAdminAuthGuard)
      .useValue(mockSuperAdminGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Re-apply mocks after clearAllMocks
    mockAuthGuard.canActivate.mockImplementation((context) => {
      const req = context.switchToHttp().getRequest();
      req.user = { sub: 42, tradeRole: 'BUYER' };
      return true;
    });
    mockSuperAdminGuard.canActivate.mockReturnValue(true);
    mockRecommendationService.getPersonal.mockResolvedValue(mockRecommendationResponse);
    mockRecommendationService.getProductRecs.mockResolvedValue({ ...mockRecommendationResponse, algorithm: 'similar' });
    mockRecommendationService.getTrending.mockResolvedValue({ ...mockRecommendationResponse, algorithm: 'trending' });
    mockRecommendationService.getCartRecs.mockResolvedValue({ ...mockRecommendationResponse, algorithm: 'crosssell' });
    mockRecommendationService.getPostPurchaseRecs.mockResolvedValue({ ...mockRecommendationResponse, algorithm: 'cobought' });
    mockRecommendationService.getFlowRecs.mockResolvedValue({ ...mockRecommendationResponse, algorithm: 'dropship_recs' });
    mockFeedbackService.trackFeedback.mockResolvedValue(undefined);
    mockRedisService.getMeta.mockResolvedValue('2026-04-05T01:00:00Z');
    mockPrisma.recommendationMetric.findMany.mockResolvedValue([]);
    mockPrisma.recommendationConfig.findMany.mockResolvedValue([]);
    mockPrisma.recommendationConfig.upsert.mockResolvedValue({ key: 'test_key', value: { enabled: true } });
    mockPrisma.crossSellRule.findMany.mockResolvedValue(mockCrossSellRules);
    mockPrisma.crossSellRule.create.mockResolvedValue({ id: 2 });
  });

  // ─── GET /recommendations/personal ──────────────────────────────────────────

  describe('GET /api/v1/recommendations/personal', () => {
    it('should return 200 with recommendation response shape', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/personal')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('items');
          expect(res.body).toHaveProperty('algorithm');
          expect(res.body).toHaveProperty('segment');
          expect(res.body).toHaveProperty('cached');
          expect(Array.isArray(res.body.items)).toBe(true);
        });
    });

    it('should pass limit=5 to the service', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/personal?limit=5')
        .expect(200)
        .expect(() => {
          expect(mockRecommendationService.getPersonal).toHaveBeenCalledWith(
            null,
            expect.any(String),
            expect.any(String),
            5,
          );
        });
    });

    it('should return 400 for limit=0 (below Min(1))', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/personal?limit=0')
        .expect(400);
    });

    it('should return 400 for limit=100 (above Max(50))', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/personal?limit=100')
        .expect(400);
    });
  });

  // ─── GET /recommendations/product/:productId ────────────────────────────────

  describe('GET /api/v1/recommendations/product/:productId', () => {
    it('should return similar products for a valid productId', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/product/1?type=similar&limit=10')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('algorithm', 'similar');
        });
    });

    it('should return 400 for a non-numeric productId', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/product/abc')
        .expect(400);
    });

    it('should default type to similar when omitted', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/product/1')
        .expect(200)
        .expect(() => {
          expect(mockRecommendationService.getProductRecs).toHaveBeenCalledWith(
            1,
            'similar',
            expect.any(String),
            expect.any(String),
            expect.any(Number),
          );
        });
    });

    it('should accept cobought type', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/product/5?type=cobought')
        .expect(200);
    });

    it('should accept crosssell type', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/product/5?type=crosssell')
        .expect(200);
    });

    it('should return 400 for an invalid type', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/product/5?type=invalid')
        .expect(400);
    });
  });

  // ─── GET /recommendations/trending ──────────────────────────────────────────

  describe('GET /api/v1/recommendations/trending', () => {
    it('should return trending products', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/trending')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('algorithm', 'trending');
        });
    });

    it('should accept categoryId filter', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/trending?categoryId=5&limit=10')
        .expect(200)
        .expect(() => {
          expect(mockRecommendationService.getTrending).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(String),
            5,
            10,
          );
        });
    });

    it('should accept limit within valid range', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/trending?limit=50')
        .expect(200);
    });
  });

  // ─── GET /recommendations/flow/:flow ────────────────────────────────────────

  describe('GET /api/v1/recommendations/flow/:flow', () => {
    it('should return flow recs for dropship', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/flow/dropship')
        .expect(200)
        .expect(() => {
          expect(mockRecommendationService.getFlowRecs).toHaveBeenCalledWith(
            'dropship',
            null,
            expect.any(String),
            expect.any(String),
            expect.any(Number),
          );
        });
    });

    it('should return flow recs for services', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/flow/services')
        .expect(200);
    });

    it('should return flow recs for rfq', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/flow/rfq')
        .expect(200);
    });

    it('should return flow recs for wholesale', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/flow/wholesale')
        .expect(200);
    });

    it('should default to services for an invalid flow name', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/flow/invalid')
        .expect(200)
        .expect(() => {
          expect(mockRecommendationService.getFlowRecs).toHaveBeenCalledWith(
            'services',
            null,
            expect.any(String),
            expect.any(String),
            expect.any(Number),
          );
        });
    });
  });

  // ─── GET /recommendations/cart (auth-required) ──────────────────────────────

  describe('GET /api/v1/recommendations/cart', () => {
    it('should return cart recommendations when authenticated', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/cart')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('algorithm', 'crosssell');
        });
    });

    it('should call getCartRecs with the user id from the guard', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/cart')
        .expect(200)
        .expect(() => {
          expect(mockRecommendationService.getCartRecs).toHaveBeenCalledWith(
            42,
            expect.any(String),
            expect.any(String),
            expect.any(Number),
          );
        });
    });
  });

  // ─── GET /recommendations/post-purchase/:orderId (auth-required) ─────────────

  describe('GET /api/v1/recommendations/post-purchase/:orderId', () => {
    it('should return post-purchase recommendations for a valid orderId', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/post-purchase/123')
        .expect(200);
    });

    it('should return 400 for a non-numeric orderId', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/post-purchase/abc')
        .expect(400);
    });

    it('should call getPostPurchaseRecs with correct params', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/post-purchase/99')
        .expect(200)
        .expect(() => {
          expect(mockRecommendationService.getPostPurchaseRecs).toHaveBeenCalledWith(
            99,
            42,
            expect.any(String),
            expect.any(String),
            expect.any(Number),
          );
        });
    });
  });

  // ─── GET /recommendations/flow-nudge (auth-required) ────────────────────────

  describe('GET /api/v1/recommendations/flow-nudge', () => {
    it('should return an array of flow nudges', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/flow-nudge')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          if (res.body.length > 0) {
            expect(res.body[0]).toHaveProperty('type');
            expect(res.body[0]).toHaveProperty('message');
            expect(res.body[0]).toHaveProperty('ctaUrl');
          }
        });
    });

    it('should call getNudges with the authenticated user id', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/flow-nudge')
        .expect(200)
        .expect(() => {
          expect(mockFlowNudgeService.getNudges).toHaveBeenCalledWith(42);
        });
    });
  });

  // ─── GET /recommendations/search-boost ──────────────────────────────────────

  describe('GET /api/v1/recommendations/search-boost', () => {
    it('should return boosts array and query field', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/search-boost?query=laptop')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('boosts');
          expect(Array.isArray(res.body.boosts)).toBe(true);
          expect(res.body).toHaveProperty('query', 'laptop');
        });
    });

    it('should return 200 with no query param', () => {
      return request(app.getHttpServer())
        .get('/api/v1/recommendations/search-boost')
        .expect(200);
    });
  });

  // ─── POST /recommendations/feedback ──────────────────────────────────────────

  describe('POST /api/v1/recommendations/feedback', () => {
    it('should accept a valid feedback payload and return { received: true }', () => {
      return request(app.getHttpServer())
        .post('/api/v1/recommendations/feedback')
        .send({
          recId: 'rec_abc_personal_2026-04-05',
          productId: 1,
          action: 'click',
          placement: 'homepage',
          position: 3,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual({ received: true });
        });
    });

    it('should return 400 when recId is missing', () => {
      return request(app.getHttpServer())
        .post('/api/v1/recommendations/feedback')
        .send({ productId: 1, action: 'click' })
        .expect(400);
    });

    it('should return 400 when action is invalid', () => {
      return request(app.getHttpServer())
        .post('/api/v1/recommendations/feedback')
        .send({ recId: 'test', productId: 1, action: 'invalid_action' })
        .expect(400);
    });

    it('should return 400 when productId is missing', () => {
      return request(app.getHttpServer())
        .post('/api/v1/recommendations/feedback')
        .send({ recId: 'test', action: 'click' })
        .expect(400);
    });

    it('should accept all five valid action types', async () => {
      const actions = ['impression', 'click', 'cart', 'purchase', 'dismiss'];
      for (const action of actions) {
        await request(app.getHttpServer())
          .post('/api/v1/recommendations/feedback')
          .send({ recId: 'rec_test_algo_2026-04-05', productId: 1, action })
          .expect(200);
      }
    });

    it('should accept optional fields (placement, position, algorithm)', () => {
      return request(app.getHttpServer())
        .post('/api/v1/recommendations/feedback')
        .send({
          recId: 'rec_xyz_trending_2026-04-05',
          productId: 10,
          action: 'impression',
          placement: 'category-page',
          position: 1,
          algorithm: 'trending',
        })
        .expect(200);
    });

    it('should call trackFeedback with dto, userId and deviceId', () => {
      return request(app.getHttpServer())
        .post('/api/v1/recommendations/feedback')
        .set('x-device-id', 'device-abc')
        .send({ recId: 'rec_test_personal_2026-04-05', productId: 5, action: 'click' })
        .expect(200)
        .expect(() => {
          expect(mockFeedbackService.trackFeedback).toHaveBeenCalledWith(
            expect.objectContaining({ recId: 'rec_test_personal_2026-04-05', productId: 5, action: 'click' }),
            null, // userId from req.user?.sub (guard attaches .sub but feedback route has no @UseGuards)
            'device-abc',
          );
        });
    });
  });

  // ─── Admin: GET /admin/recommendations/stats ────────────────────────────────

  describe('GET /api/v1/admin/recommendations/stats', () => {
    it('should return stats with period and algorithms fields', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/recommendations/stats')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('period');
          expect(res.body).toHaveProperty('algorithms');
          expect(Array.isArray(res.body.algorithms)).toBe(true);
        });
    });

    it('should accept days=30 parameter', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/recommendations/stats?days=30')
        .expect(200)
        .expect((res) => {
          expect(res.body.period).toBe('30d');
        });
    });

    it('should default to 7d when days is not provided', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/recommendations/stats')
        .expect(200)
        .expect((res) => {
          expect(res.body.period).toBe('7d');
        });
    });
  });

  // ─── Admin: GET /admin/recommendations/health ────────────────────────────────

  describe('GET /api/v1/admin/recommendations/health', () => {
    it('should return health with status field', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/recommendations/health')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('status');
          expect(['HEALTHY', 'STALE']).toContain(res.body.status);
        });
    });

    it('should return STALE when getMeta returns null (never ran)', () => {
      mockRedisService.getMeta.mockResolvedValue(null);
      return request(app.getHttpServer())
        .get('/api/v1/admin/recommendations/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('STALE');
        });
    });

    it('should include lastRun, productsComputed and usersComputed fields', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/recommendations/health')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('lastRun');
          expect(res.body).toHaveProperty('productsComputed');
          expect(res.body).toHaveProperty('usersComputed');
        });
    });
  });

  // ─── Admin: GET /admin/recommendations/config ────────────────────────────────

  describe('GET /api/v1/admin/recommendations/config', () => {
    it('should return an object (config map)', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/recommendations/config')
        .expect(200)
        .expect((res) => {
          expect(typeof res.body).toBe('object');
          expect(Array.isArray(res.body)).toBe(false);
        });
    });

    it('should merge db config rows into a key-value map', () => {
      mockPrisma.recommendationConfig.findMany.mockResolvedValue([
        { key: 'weights', value: { personal: 0.8 } },
        { key: 'toggles', value: { trending: true } },
      ]);
      return request(app.getHttpServer())
        .get('/api/v1/admin/recommendations/config')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('weights');
          expect(res.body).toHaveProperty('toggles');
        });
    });
  });

  // ─── Admin: PUT /admin/recommendations/config ────────────────────────────────

  describe('PUT /api/v1/admin/recommendations/config', () => {
    it('should call prisma upsert and return the updated config row', () => {
      return request(app.getHttpServer())
        .put('/api/v1/admin/recommendations/config')
        .send({ key: 'test_key', value: { enabled: true } })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('key', 'test_key');
        });
    });

    it('should pass the body to the prisma upsert call', () => {
      return request(app.getHttpServer())
        .put('/api/v1/admin/recommendations/config')
        .send({ key: 'decay', value: 0.95 })
        .expect(200)
        .expect(() => {
          expect(mockPrisma.recommendationConfig.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
              where: { key: 'decay' },
              create: expect.objectContaining({ key: 'decay', value: 0.95 }),
              update: expect.objectContaining({ value: 0.95 }),
            }),
          );
        });
    });
  });

  // ─── Admin: GET /admin/recommendations/crosssell-rules ──────────────────────

  describe('GET /api/v1/admin/recommendations/crosssell-rules', () => {
    it('should return an array of cross-sell rules', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/recommendations/crosssell-rules')
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should include sourceCategory and targetCategory in each rule', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/recommendations/crosssell-rules')
        .expect(200)
        .expect((res) => {
          if (res.body.length > 0) {
            expect(res.body[0]).toHaveProperty('sourceCategory');
            expect(res.body[0]).toHaveProperty('targetCategory');
          }
        });
    });
  });

  // ─── Admin: POST /admin/recommendations/crosssell-rules ─────────────────────

  describe('POST /api/v1/admin/recommendations/crosssell-rules', () => {
    it('should create a new cross-sell rule and return 201', () => {
      return request(app.getHttpServer())
        .post('/api/v1/admin/recommendations/crosssell-rules')
        .send({ sourceCategoryId: 1, targetCategoryId: 3, priority: 5 })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
        });
    });

    it('should call prisma.crossSellRule.create with the body data', () => {
      return request(app.getHttpServer())
        .post('/api/v1/admin/recommendations/crosssell-rules')
        .send({ sourceCategoryId: 2, targetCategoryId: 4 })
        .expect(201)
        .expect(() => {
          expect(mockPrisma.crossSellRule.create).toHaveBeenCalledWith(
            expect.objectContaining({
              data: expect.objectContaining({
                sourceCategoryId: 2,
                targetCategoryId: 4,
              }),
            }),
          );
        });
    });
  });

  // ─── Admin: POST /admin/recommendations/recompute ────────────────────────────

  describe('POST /api/v1/admin/recommendations/recompute', () => {
    it('should return 201 with a QUEUED status', () => {
      return request(app.getHttpServer())
        .post('/api/v1/admin/recommendations/recompute')
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('status', 'QUEUED');
          expect(res.body).toHaveProperty('message');
          expect(res.body).toHaveProperty('timestamp');
        });
    });
  });
});
