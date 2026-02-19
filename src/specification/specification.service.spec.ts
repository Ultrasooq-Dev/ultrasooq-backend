import { Test, TestingModule } from '@nestjs/testing';
import { SpecificationService } from './specification.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService, CACHE_KEYS, CACHE_TTL } from '../cache/cache.service';
import { NotFoundException } from '@nestjs/common';

// ─────────────────────────────────────────────────────────
// Mock PrismaService — stubs for all Prisma models used
// ─────────────────────────────────────────────────────────
const mockPrismaService = {
  category: {
    findUnique: jest.fn(),
  },
  specTemplate: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  productSpecValue: {
    upsert: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  },
  product: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  productCategoryMap: {
    create: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
  },
  categoryKeyword: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  categoryTag: {
    create: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
  },
  tags: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
  service: {
    findUnique: jest.fn(),
  },
  serviceCategoryMap: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockCacheService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  getOrSet: jest.fn(),
  invalidateProduct: jest.fn(),
};

describe('SpecificationService', () => {
  let service: SpecificationService;
  let prisma: typeof mockPrismaService;
  let cacheService: typeof mockCacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpecificationService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<SpecificationService>(SpecificationService);
    prisma = module.get(PrismaService);
    cacheService = module.get(CacheService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ===========================================================================
  // SPEC TEMPLATES — CRUD
  // ===========================================================================
  describe('createTemplate()', () => {
    it('should create a spec template when category exists', async () => {
      const dto = {
        categoryId: 1,
        name: 'Screen Size',
        key: 'screen_size',
        dataType: 'NUMBER',
        unit: 'inches',
        isRequired: true,
        isFilterable: true,
        sortOrder: 0,
      };

      prisma.category.findUnique.mockResolvedValue({ id: 1, name: 'Smartphones' });
      prisma.specTemplate.create.mockResolvedValue({ id: 10, ...dto });
      cacheService.del.mockResolvedValue(undefined);

      const result = await service.createTemplate(dto as any);

      expect(prisma.category.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(prisma.specTemplate.create).toHaveBeenCalledTimes(1);
      expect(result.id).toBe(10);
      expect(result.name).toBe('Screen Size');
      expect(cacheService.del).toHaveBeenCalledTimes(2); // CATEGORY_SPECS + FILTER_VALUES
    });

    it('should throw NotFoundException if category does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(
        service.createTemplate({ categoryId: 999, name: 'Test', key: 'test', dataType: 'TEXT' } as any),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.specTemplate.create).not.toHaveBeenCalled();
    });
  });

  describe('bulkCreateTemplates()', () => {
    it('should create multiple templates and skip duplicates', async () => {
      const dto = {
        categoryId: 1,
        templates: [
          { name: 'RAM', key: 'ram', dataType: 'SELECT' },
          { name: 'Storage', key: 'storage', dataType: 'SELECT' },
          { name: 'Battery', key: 'battery', dataType: 'NUMBER' },
        ],
      };

      prisma.category.findUnique.mockResolvedValue({ id: 1, name: 'Smartphones' });
      prisma.specTemplate.create
        .mockResolvedValueOnce({ id: 11, name: 'RAM', key: 'ram' })
        .mockRejectedValueOnce(new Error('Unique constraint')) // duplicate
        .mockResolvedValueOnce({ id: 13, name: 'Battery', key: 'battery' });
      cacheService.del.mockResolvedValue(undefined);

      const results = await service.bulkCreateTemplates(dto as any);

      expect(results).toHaveLength(2); // 3 attempted, 1 skipped
      expect(results[0].name).toBe('RAM');
      expect(results[1].name).toBe('Battery');
    });

    it('should throw NotFoundException if category does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(
        service.bulkCreateTemplates({ categoryId: 999, templates: [] } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getTemplatesByCategory()', () => {
    it('should use cache getOrSet for fetching templates', async () => {
      const mockTemplates = [
        { id: 1, name: 'Screen Size', key: 'screen_size', dataType: 'NUMBER' },
        { id: 2, name: 'RAM', key: 'ram', dataType: 'SELECT' },
      ];

      // The getOrSet mock should call the factory function and return its result
      cacheService.getOrSet.mockImplementation(async (_key, factory) => factory());
      prisma.specTemplate.findMany.mockResolvedValue(mockTemplates);

      const result = await service.getTemplatesByCategory(1);

      expect(cacheService.getOrSet).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockTemplates);
    });
  });

  describe('getTemplatesForCategories()', () => {
    it('should return templates grouped by category', async () => {
      const mockTemplates = [
        { id: 1, name: 'Screen Size', categoryId: 10, category: { id: 10, name: 'Smartphones' } },
        { id: 2, name: 'RAM', categoryId: 10, category: { id: 10, name: 'Smartphones' } },
        { id: 3, name: 'Type', categoryId: 20, category: { id: 20, name: 'Headphones' } },
      ];

      prisma.specTemplate.findMany.mockResolvedValue(mockTemplates);

      const result = await service.getTemplatesForCategories([10, 20]);

      expect(result[10]).toHaveLength(2);
      expect(result[20]).toHaveLength(1);
      expect(result[10][0].name).toBe('Screen Size');
      expect(result[20][0].name).toBe('Type');
    });
  });

  describe('updateTemplate()', () => {
    it('should update template when it exists', async () => {
      const existing = { id: 10, name: 'Old Name', key: 'old_name', categoryId: 1 };
      prisma.specTemplate.findUnique.mockResolvedValue(existing);
      prisma.specTemplate.update.mockResolvedValue({ ...existing, name: 'New Name' });
      cacheService.del.mockResolvedValue(undefined);

      const result = await service.updateTemplate(10, { name: 'New Name' } as any);

      expect(prisma.specTemplate.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: expect.objectContaining({ name: 'New Name' }),
      });
      expect(result.name).toBe('New Name');
      expect(cacheService.del).toHaveBeenCalledTimes(2);
    });

    it('should throw NotFoundException when template not found', async () => {
      prisma.specTemplate.findUnique.mockResolvedValue(null);

      await expect(service.updateTemplate(999, { name: 'X' } as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteTemplate()', () => {
    it('should soft-delete a template', async () => {
      const existing = { id: 10, categoryId: 1, name: 'Screen Size' };
      prisma.specTemplate.findUnique.mockResolvedValue(existing);
      prisma.specTemplate.update.mockResolvedValue({ ...existing, status: 'DELETE' });
      cacheService.del.mockResolvedValue(undefined);

      const result = await service.deleteTemplate(10);

      expect(prisma.specTemplate.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { status: 'DELETE', deletedAt: expect.any(Date) },
      });
      expect(result.message).toBe('Template deleted successfully');
    });

    it('should throw NotFoundException when template not found', async () => {
      prisma.specTemplate.findUnique.mockResolvedValue(null);

      await expect(service.deleteTemplate(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================================================
  // SPEC VALUES
  // ===========================================================================
  describe('setSpecValues()', () => {
    it('should upsert spec values for a product', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 1, productName: 'Test Product' });
      prisma.productSpecValue.upsert
        .mockResolvedValueOnce({ id: 100, productId: 1, specTemplateId: 10, value: '6.7' })
        .mockResolvedValueOnce({ id: 101, productId: 1, specTemplateId: 11, value: '8GB' });
      cacheService.invalidateProduct.mockResolvedValue(undefined);

      const dto = {
        productId: 1,
        values: [
          { specTemplateId: 10, value: '6.7', numericValue: 6.7 },
          { specTemplateId: 11, value: '8GB' },
        ],
      };

      const results = await service.setSpecValues(dto as any);

      expect(results).toHaveLength(2);
      expect(prisma.productSpecValue.upsert).toHaveBeenCalledTimes(2);
      expect(cacheService.invalidateProduct).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException when product not found', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.setSpecValues({ productId: 999, values: [] } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getSpecValues()', () => {
    it('should return spec values with template info', async () => {
      const mockValues = [
        {
          id: 100,
          productId: 1,
          value: '6.7',
          numericValue: 6.7,
          specTemplate: { id: 10, name: 'Screen Size', key: 'screen_size', dataType: 'NUMBER', unit: 'inches' },
        },
      ];
      prisma.productSpecValue.findMany.mockResolvedValue(mockValues);

      const result = await service.getSpecValues(1);

      expect(result).toEqual(mockValues);
      expect(prisma.productSpecValue.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId: 1, status: 'ACTIVE', deletedAt: null },
          include: expect.objectContaining({
            specTemplate: expect.any(Object),
          }),
        }),
      );
    });
  });

  describe('updateSpecValue()', () => {
    it('should update a single spec value', async () => {
      const existing = { id: 100, productId: 1, specTemplateId: 10, value: 'old', specTemplate: {} };
      prisma.productSpecValue.findUnique.mockResolvedValue(existing);
      prisma.productSpecValue.update.mockResolvedValue({ ...existing, value: 'new' });

      const result = await service.updateSpecValue(100, { value: 'new' } as any);

      expect(result.value).toBe('new');
      expect(prisma.productSpecValue.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: expect.objectContaining({ value: 'new' }),
      });
    });

    it('should throw NotFoundException when spec value not found', async () => {
      prisma.productSpecValue.findUnique.mockResolvedValue(null);

      await expect(service.updateSpecValue(999, { value: 'x' } as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================================================
  // FILTERS
  // ===========================================================================
  describe('getFilters()', () => {
    it('should use cache for fetching filters', async () => {
      const mockFilters = { filters: [{ key: 'screen_size', name: 'Screen Size' }] };
      cacheService.getOrSet.mockImplementation(async (_key, factory) => factory());

      // Mock buildFilters internals
      prisma.specTemplate.findMany.mockResolvedValue([
        { id: 10, key: 'screen_size', name: 'Screen Size', dataType: 'NUMBER', unit: 'inches', isFilterable: true, groupName: null },
      ]);
      prisma.productSpecValue.aggregate.mockResolvedValue({
        _min: { numericValue: 5.5 },
        _max: { numericValue: 7.2 },
        _count: 15,
      });

      const result = await service.getFilters(1);

      expect(cacheService.getOrSet).toHaveBeenCalledTimes(1);
      expect(result.filters[0].key).toBe('screen_size');
      expect(result.filters[0].range).toEqual({ min: 5.5, max: 7.2 });
      expect(result.filters[0].count).toBe(15);
    });

    it('should build SELECT filter with options and counts', async () => {
      cacheService.getOrSet.mockImplementation(async (_key, factory) => factory());

      prisma.specTemplate.findMany.mockResolvedValue([
        { id: 11, key: 'ram', name: 'RAM', dataType: 'SELECT', unit: null, isFilterable: true, groupName: null },
      ]);
      prisma.productSpecValue.groupBy.mockResolvedValue([
        { value: '8GB', _count: 10 },
        { value: '16GB', _count: 5 },
        { value: '4GB', _count: 2 },
      ]);

      const result = await service.getFilters(1);

      expect(result.filters[0].options).toEqual(['8GB', '16GB', '4GB']);
      expect(result.filters[0].counts).toEqual({ '8GB': 10, '16GB': 5, '4GB': 2 });
    });

    it('should build BOOLEAN filter with true/false counts', async () => {
      cacheService.getOrSet.mockImplementation(async (_key, factory) => factory());

      prisma.specTemplate.findMany.mockResolvedValue([
        { id: 12, key: 'noise_cancellation', name: 'Noise Cancellation', dataType: 'BOOLEAN', unit: null, isFilterable: true, groupName: null },
      ]);
      prisma.productSpecValue.groupBy.mockResolvedValue([
        { value: 'true', _count: 8 },
        { value: 'false', _count: 3 },
      ]);

      const result = await service.getFilters(1);

      expect(result.filters[0].options).toEqual(['true', 'false']);
      expect(result.filters[0].counts).toEqual({ 'true': 8, 'false': 3 });
    });

    it('should build TEXT filter with topValues', async () => {
      cacheService.getOrSet.mockImplementation(async (_key, factory) => factory());

      prisma.specTemplate.findMany.mockResolvedValue([
        { id: 13, key: 'camera', name: 'Camera', dataType: 'TEXT', unit: null, isFilterable: true, groupName: null },
      ]);
      prisma.productSpecValue.groupBy.mockResolvedValue([
        { value: '108MP', _count: 5 },
        { value: '50MP', _count: 3 },
      ]);

      const result = await service.getFilters(1);

      expect(result.filters[0].topValues).toEqual(['108MP', '50MP']);
      expect(result.filters[0].counts).toEqual({ '108MP': 5, '50MP': 3 });
    });
  });

  // ===========================================================================
  // CATEGORY TAGS
  // ===========================================================================
  describe('addCategoryTags()', () => {
    it('should add tags to a category', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: 1, name: 'Smartphones' });
      prisma.categoryTag.create
        .mockResolvedValueOnce({ id: 1, categoryId: 1, tagId: 10, tag: { id: 10, tagName: 'smartphone' } })
        .mockResolvedValueOnce({ id: 2, categoryId: 1, tagId: 11, tag: { id: 11, tagName: '5g' } });
      cacheService.del.mockResolvedValue(undefined);

      const result = await service.addCategoryTags(1, [10, 11]);

      expect(result).toHaveLength(2);
      expect(prisma.categoryTag.create).toHaveBeenCalledTimes(2);
      expect(cacheService.del).toHaveBeenCalledTimes(1);
    });

    it('should skip duplicate tags and still return successful ones', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: 1, name: 'Smartphones' });
      prisma.categoryTag.create
        .mockResolvedValueOnce({ id: 1, categoryId: 1, tagId: 10, tag: { id: 10, tagName: 'smartphone' } })
        .mockRejectedValueOnce(new Error('Unique constraint'));
      cacheService.del.mockResolvedValue(undefined);

      const result = await service.addCategoryTags(1, [10, 11]);

      expect(result).toHaveLength(1);
    });

    it('should throw NotFoundException if category not found', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(service.addCategoryTags(999, [10])).rejects.toThrow(NotFoundException);
    });
  });

  describe('getCategoryTags()', () => {
    it('should use cache for fetching category tags', async () => {
      const mockTags = [
        { id: 1, categoryId: 1, tagId: 10, tag: { id: 10, tagName: 'smartphone' } },
        { id: 2, categoryId: 1, tagId: 11, tag: { id: 11, tagName: '5g' } },
      ];
      cacheService.getOrSet.mockImplementation(async (_key, factory) => factory());
      prisma.categoryTag.findMany.mockResolvedValue(mockTags);

      const result = await service.getCategoryTags(1);

      expect(result).toEqual(mockTags);
      expect(cacheService.getOrSet).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeCategoryTag()', () => {
    it('should delete category-tag link and invalidate cache', async () => {
      prisma.categoryTag.deleteMany.mockResolvedValue({ count: 1 });
      cacheService.del.mockResolvedValue(undefined);

      const result = await service.removeCategoryTag(1, 10);

      expect(prisma.categoryTag.deleteMany).toHaveBeenCalledWith({
        where: { categoryId: 1, tagId: 10 },
      });
      expect(result.message).toBe('Tag removed from category');
      expect(cacheService.del).toHaveBeenCalledTimes(1);
    });
  });

  describe('setCategoryTags()', () => {
    it('should replace all tags for a category', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: 1, name: 'Smartphones' });
      prisma.categoryTag.deleteMany.mockResolvedValue({ count: 5 });
      prisma.categoryTag.createMany.mockResolvedValue({ count: 3 });
      cacheService.del.mockResolvedValue(undefined);
      cacheService.getOrSet.mockResolvedValue([]); // getCategoryTags return

      const result = await service.setCategoryTags(1, [10, 11, 12]);

      expect(prisma.categoryTag.deleteMany).toHaveBeenCalledWith({ where: { categoryId: 1 } });
      expect(prisma.categoryTag.createMany).toHaveBeenCalledWith({
        data: [
          { categoryId: 1, tagId: 10 },
          { categoryId: 1, tagId: 11 },
          { categoryId: 1, tagId: 12 },
        ],
        skipDuplicates: true,
      });
    });

    it('should handle empty tag array (clear all tags)', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: 1, name: 'Smartphones' });
      prisma.categoryTag.deleteMany.mockResolvedValue({ count: 5 });
      cacheService.del.mockResolvedValue(undefined);
      cacheService.getOrSet.mockResolvedValue([]);

      await service.setCategoryTags(1, []);

      expect(prisma.categoryTag.deleteMany).toHaveBeenCalled();
      expect(prisma.categoryTag.createMany).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if category not found', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(service.setCategoryTags(999, [10])).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================================================
  // TAG CRUD
  // ===========================================================================
  describe('listTags()', () => {
    it('should return paginated tags', async () => {
      const mockTags = [
        { id: 1, tagName: '5g', status: 'ACTIVE' },
        { id: 2, tagName: 'bluetooth', status: 'ACTIVE' },
      ];
      prisma.tags.findMany.mockResolvedValue(mockTags);
      prisma.tags.count.mockResolvedValue(50);

      const result = await service.listTags(2, 20);

      expect(result.data).toEqual(mockTags);
      expect(result.pagination).toEqual({
        page: 2,
        limit: 20,
        total: 50,
        totalPages: 3,
      });
      expect(prisma.tags.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 20 }),
      );
    });
  });

  describe('searchTags()', () => {
    it('should search tags by name using case-insensitive contains', async () => {
      const mockTags = [{ id: 1, tagName: 'bluetooth' }];
      prisma.tags.findMany.mockResolvedValue(mockTags);

      const result = await service.searchTags('blue');

      expect(result).toEqual(mockTags);
      expect(prisma.tags.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tagName: { contains: 'blue', mode: 'insensitive' },
          }),
        }),
      );
    });
  });

  describe('getTagById()', () => {
    it('should return tag with related category, product, and service data', async () => {
      const mockTag = {
        id: 10,
        tagName: 'smartphone',
        categoryTags: [{ id: 1, categoryId: 1, category: { id: 1, name: 'Smartphones' } }],
        tagProductTags: [{ id: 1, productId: 1 }],
        serviceTags: [],
        userBranchBusinessType: [],
      };
      prisma.tags.findUnique.mockResolvedValue(mockTag);

      const result = await service.getTagById(10);

      expect(result).toEqual(mockTag);
      expect(prisma.tags.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 10 },
          include: expect.objectContaining({
            categoryTags: expect.any(Object),
            tagProductTags: expect.any(Object),
          }),
        }),
      );
    });

    it('should throw NotFoundException when tag not found', async () => {
      prisma.tags.findUnique.mockResolvedValue(null);

      await expect(service.getTagById(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateTag()', () => {
    it('should update tag name', async () => {
      prisma.tags.findUnique.mockResolvedValue({ id: 10, tagName: 'old-name' });
      prisma.tags.update.mockResolvedValue({ id: 10, tagName: 'new-name' });

      const result = await service.updateTag(10, { tagName: 'new-name' });

      expect(result.tagName).toBe('new-name');
      expect(prisma.tags.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { tagName: 'new-name' },
      });
    });

    it('should throw NotFoundException when tag not found', async () => {
      prisma.tags.findUnique.mockResolvedValue(null);

      await expect(service.updateTag(999, { tagName: 'x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteTag()', () => {
    it('should soft-delete a tag', async () => {
      prisma.tags.findUnique.mockResolvedValue({ id: 10, tagName: 'old-tag' });
      prisma.tags.update.mockResolvedValue({ id: 10, status: 'DELETE' });

      const result = await service.deleteTag(10);

      expect(result.message).toBe('Tag deleted successfully');
      expect(prisma.tags.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { status: 'DELETE', deletedAt: expect.any(Date) },
      });
    });

    it('should throw NotFoundException when tag not found', async () => {
      prisma.tags.findUnique.mockResolvedValue(null);

      await expect(service.deleteTag(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================================================
  // TAG-BASED AUTO-CATEGORIZATION
  // ===========================================================================
  describe('matchCategoriesByTags()', () => {
    it('should match categories by tag IDs sorted by match count', async () => {
      prisma.categoryTag.findMany.mockResolvedValue([
        { categoryId: 1, tagId: 10, category: { id: 1, name: 'Smartphones' } },
        { categoryId: 1, tagId: 11, category: { id: 1, name: 'Smartphones' } },
        { categoryId: 1, tagId: 12, category: { id: 1, name: 'Smartphones' } },
        { categoryId: 2, tagId: 10, category: { id: 2, name: 'Phone Cases' } },
      ]);

      const result = await service.matchCategoriesByTags([10, 11, 12]);

      expect(result).toHaveLength(2);
      expect(result[0].categoryId).toBe(1); // 3 matches — first
      expect(result[0].matchCount).toBe(3);
      expect(result[1].categoryId).toBe(2); // 1 match — second
      expect(result[1].matchCount).toBe(1);
    });

    it('should return empty array for empty tag IDs', async () => {
      const result = await service.matchCategoriesByTags([]);

      expect(result).toEqual([]);
      expect(prisma.categoryTag.findMany).not.toHaveBeenCalled();
    });
  });
});
