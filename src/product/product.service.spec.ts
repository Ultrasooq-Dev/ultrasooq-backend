import { Test, TestingModule } from '@nestjs/testing';
import { ProductService } from './product.service';
import { AuthService } from '../auth/auth.service';
import { NotificationService } from '../notification/notification.service';
import { S3service } from '../user/s3.service';
import { HelperService } from '../helper/helper.service';
import { OpenRouterService } from './openrouter.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { ProductSearchService } from './product-search.service';
import { ProductPricingService } from './product-pricing.service';
import { ProductMediaService } from './product-media.service';
import { ProductRfqService } from './product-rfq.service';
import { ProductBuyGroupService } from './product-buygroup.service';
import { ProductFactoryService } from './product-factory.service';

/**
 * Mock PrismaService — stubs for all Prisma models used by ProductService.
 */
const mockPrismaService = {
  product: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  productTags: {
    create: jest.fn(),
  },
  productCategoryMap: {
    create: jest.fn(),
  },
  productPrice: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  productImages: {
    create: jest.fn(),
  },
};

const mockAuthService = {};

const mockNotificationService = {
  sendNotification: jest.fn(),
};

const mockS3service = {
  uploadFile: jest.fn(),
};

const mockHelperService = {
  getAdminId: jest.fn(),
};

const mockOpenRouterService = {
  generateDescription: jest.fn(),
};

const mockCacheService = {
  get: jest.fn(),
  set: jest.fn(),
  invalidateProduct: jest.fn(),
  invalidateProductListings: jest.fn(),
};

const mockProductSearchService = {};
const mockProductPricingService = {};
const mockProductMediaService = {};
const mockProductRfqService = {};
const mockProductBuyGroupService = {};
const mockProductFactoryService = {};

describe('ProductService', () => {
  let service: ProductService;
  let prisma: typeof mockPrismaService;
  let helperService: typeof mockHelperService;
  let cacheService: typeof mockCacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: AuthService, useValue: mockAuthService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: S3service, useValue: mockS3service },
        { provide: HelperService, useValue: mockHelperService },
        { provide: OpenRouterService, useValue: mockOpenRouterService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CacheService, useValue: mockCacheService },
        { provide: ProductSearchService, useValue: mockProductSearchService },
        { provide: ProductPricingService, useValue: mockProductPricingService },
        { provide: ProductMediaService, useValue: mockProductMediaService },
        { provide: ProductRfqService, useValue: mockProductRfqService },
        { provide: ProductBuyGroupService, useValue: mockProductBuyGroupService },
        { provide: ProductFactoryService, useValue: mockProductFactoryService },
      ],
    }).compile();

    service = module.get<ProductService>(ProductService);
    prisma = module.get(PrismaService);
    helperService = module.get(HelperService);
    cacheService = module.get(CacheService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ===========================================================================
  // create()
  // ===========================================================================
  describe('create()', () => {
    it('should call prisma.product.create with correct data', async () => {
      const payload = {
        productName: 'Test Widget',
        productType: 'P',
        categoryId: 5,
        typeOfProduct: 'BRAND',
        brandId: 10,
        placeOfOriginId: 3,
        skuNo: 'SKU-001',
        productPrice: 99.99,
        offerPrice: 79.99,
        shortDescription: 'A test product',
        description: 'Full description of test product',
        specification: 'Spec details',
        categoryLocation: 'Electronics',
        status: 'ACTIVE',
      };
      const req = { user: { id: 7 } };

      // Mock SKU uniqueness check — no existing product
      prisma.product.findFirst.mockResolvedValue(null);

      // Mock admin ID resolution
      helperService.getAdminId.mockResolvedValue(7);

      // Mock the product creation itself
      const createdProduct = { id: 100, ...payload, userId: 7, adminId: 7 };
      prisma.product.create.mockResolvedValue(createdProduct);

      // Mock cache invalidation
      cacheService.invalidateProductListings.mockResolvedValue(undefined);

      const result = await service.create(payload, req);

      expect(prisma.product.create).toHaveBeenCalledTimes(1);

      // Verify the data object passed to create
      const createCall = prisma.product.create.mock.calls[0][0];
      expect(createCall.data.productName).toBe('Test Widget');
      expect(createCall.data.productType).toBe('P');
      expect(createCall.data.categoryId).toBe(5);
      expect(createCall.data.skuNo).toBe('SKU-001');
      expect(createCall.data.userId).toBe(7);

      expect(result.status).toBe(true);
      expect(result.message).toBe('Created Successfully');
      expect(result.data).toEqual(createdProduct);
    });

    it('should return error if SKU already exists', async () => {
      const payload = { skuNo: 'EXISTING-SKU', productName: 'Dupe' };
      const req = { user: { id: 1 } };

      // SKU already exists
      prisma.product.findFirst.mockResolvedValue({ id: 50, skuNo: 'EXISTING-SKU' });

      const result = await service.create(payload, req);

      expect(result.status).toBe(false);
      expect(result.message).toBe('This SKU No. Already Exist');
      expect(prisma.product.create).not.toHaveBeenCalled();
    });

    it('should return error envelope on unexpected exceptions', async () => {
      const payload = { productName: 'Crash Product' };
      const req = { user: { id: 1 } };

      prisma.product.findFirst.mockResolvedValue(null);
      helperService.getAdminId.mockResolvedValue(1);
      prisma.product.create.mockRejectedValue(new Error('DB constraint violation'));

      const result = await service.create(payload, req);

      expect(result.status).toBe(false);
      expect(result.message).toBe('error in create product');
      expect(result.error).toBeDefined();
    });
  });

  // ===========================================================================
  // findAll()
  // ===========================================================================
  describe('findAll()', () => {
    it('should test basic product listing with pagination', async () => {
      const mockProducts = [
        { id: 1, productName: 'Product A' },
        { id: 2, productName: 'Product B' },
      ];

      helperService.getAdminId.mockResolvedValue(7);
      prisma.product.findMany.mockResolvedValue(mockProducts);
      prisma.product.count.mockResolvedValue(25);

      const userId = '7';
      const page = '2';
      const limit = '10';
      const req = { query: {} };
      const term = '';
      const brandIds = undefined;

      const result = await service.findAll(userId, page, limit, req, term, brandIds);

      expect(result.status).toBe(true);
      expect(result.message).toBe('Fetch Successfully');
      expect(result.data).toEqual(mockProducts);
      expect(result.totalCount).toBe(25);

      // Verify pagination: page 2 with limit 10 means skip=10, take=10
      const findManyCall = prisma.product.findMany.mock.calls[0][0];
      expect(findManyCall.skip).toBe(10);
      expect(findManyCall.take).toBe(10);
      expect(findManyCall.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('should return not found when no products exist', async () => {
      helperService.getAdminId.mockResolvedValue(7);
      prisma.product.findMany.mockResolvedValue(null);
      prisma.product.count.mockResolvedValue(0);

      const result = await service.findAll('7', '1', '10', { query: {} }, '', undefined);

      expect(result.status).toBe(false);
      expect(result.message).toBe('Not Found');
      expect(result.data).toEqual([]);
      expect(result.totalCount).toBe(0);
    });

    it('should return error envelope on exception', async () => {
      helperService.getAdminId.mockRejectedValue(new Error('DB down'));

      const result = await service.findAll('7', '1', '10', { query: {} }, '', undefined);

      expect(result.status).toBe(false);
      expect(result.message).toBe('error in findAll product');
    });
  });

  // ===========================================================================
  // findOne()
  // ===========================================================================
  describe('findOne()', () => {
    it('should test single product fetch', async () => {
      const mockProduct = {
        id: 42,
        productName: 'Widget X',
        category: { id: 5, name: 'Electronics' },
        productImages: [],
        productTags: [],
        product_productPrice: [],
        product_productShortDescription: [],
        product_productSpecification: [],
        productReview: [],
        product_wishlist: [],
      };

      cacheService.get.mockResolvedValue(null); // No cache hit
      prisma.product.findUnique.mockResolvedValue(mockProduct);

      // Mock the cheapest seller query (productPrice findMany sorted by offerPrice)
      prisma.productPrice.findMany.mockResolvedValue([]);

      const req = { query: {} };
      const result = await service.findOne('42', req, null);

      expect(prisma.product.findUnique).toHaveBeenCalledTimes(1);
      const findCall = prisma.product.findUnique.mock.calls[0][0];
      expect(findCall.where.id).toBe(42);

      expect((result as any).status).toBe(true);
    });

    it('should return cached result for anonymous views', async () => {
      const cachedResult = {
        status: true,
        message: 'Fetch Successfully',
        data: { id: 42, productName: 'Cached Widget' },
      };
      cacheService.get.mockResolvedValue(cachedResult);

      const req = { query: {} };
      const result = await service.findOne('42', req, null);

      // Should return cached result directly without querying DB
      expect(result).toEqual(cachedResult);
      expect(prisma.product.findUnique).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // update()
  // ===========================================================================
  describe('update()', () => {
    it('should test product update flow', async () => {
      const existingProduct = {
        id: 42,
        productName: 'Old Name',
        productType: 'P',
        typeOfProduct: 'BRAND',
        categoryId: 5,
        brandId: 10,
        placeOfOriginId: 3,
        skuNo: 'SKU-001',
        productPrice: 100,
        offerPrice: 80,
        shortDescription: 'Old desc',
        description: 'Old full desc',
        specification: 'Old spec',
        categoryLocation: 'Electronics',
        isDropshipable: false,
        adminId: 7,
        userId: 7,
      };

      helperService.getAdminId.mockResolvedValue(7);
      prisma.product.findUnique.mockResolvedValue(existingProduct);

      const updatedProduct = { ...existingProduct, productName: 'New Name' };
      prisma.product.update.mockResolvedValue(updatedProduct);

      // Mock cache invalidation
      cacheService.invalidateProduct.mockResolvedValue(undefined);
      cacheService.invalidateProductListings.mockResolvedValue(undefined);

      const payload = {
        productId: 42,
        productName: 'New Name',
      };
      const req = { user: { id: 7 } };

      const result = await service.update(payload, req);

      // Should look up the existing product
      expect(prisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: 42 },
      });

      // Should call update with merged data (may be called more than once for related updates)
      expect(prisma.product.update).toHaveBeenCalled();
      const updateCall = prisma.product.update.mock.calls[0][0];
      expect(updateCall.where.id).toBe(42);
      expect(updateCall.data.productName).toBe('New Name');
      // Fields not in payload should fall back to existing product values
      expect(updateCall.data.categoryId).toBe(5);
      expect(updateCall.data.brandId).toBe(10);

      expect(result.status).toBe(true);
    });

    it('should return error envelope on update failure', async () => {
      helperService.getAdminId.mockResolvedValue(7);
      prisma.product.findUnique.mockRejectedValue(new Error('Connection lost'));

      const result = await service.update({ productId: 42 }, { user: { id: 7 } });

      expect(result.status).toBe(false);
      expect(result.message).toBe('error in update product');
      expect(result.error).toBeDefined();
    });
  });
});
