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
    findMany: jest.fn().mockResolvedValue([]), // No children by default (leaf category)
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
    update: jest.fn(),
  },
  serviceCategoryMap: {
    create: jest.fn(),
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
    it('should use cache getOrSet and mark own templates as not inherited', async () => {
      const mockTemplates = [
        { id: 1, name: 'Screen Size', key: 'screen_size', dataType: 'NUMBER', categoryId: 1, category: { id: 1, name: 'Smartphones' } },
        { id: 2, name: 'RAM', key: 'ram', dataType: 'SELECT', categoryId: 1, category: { id: 1, name: 'Smartphones' } },
      ];

      cacheService.getOrSet.mockImplementation(async (_key, factory) => factory());
      prisma.category.findMany.mockResolvedValue([]); // leaf, no children
      prisma.specTemplate.findMany.mockResolvedValue(mockTemplates);

      const result = await service.getTemplatesByCategory(1);

      expect(cacheService.getOrSet).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ inherited: false, sourceCategory: { id: 1, name: 'Smartphones' } });
      expect(result[1]).toMatchObject({ inherited: false });
    });

    it('should mark child-category templates as inherited for parent categories', async () => {
      const mockTemplates = [
        { id: 1, name: 'Screen Size', key: 'screen_size', dataType: 'NUMBER', categoryId: 10, category: { id: 10, name: 'Smartphones' } },
        { id: 2, name: 'Material', key: 'material', dataType: 'SELECT', categoryId: 11, category: { id: 11, name: 'Phone Cases' } },
      ];

      cacheService.getOrSet.mockImplementation(async (_key, factory) => factory());
      // Parent category 5 has children 10 and 11
      prisma.category.findMany
        .mockResolvedValueOnce([{ id: 10 }, { id: 11 }])  // children of 5
        .mockResolvedValueOnce([])  // children of 10 (leaf)
        .mockResolvedValueOnce([]); // children of 11 (leaf)
      prisma.specTemplate.findMany.mockResolvedValue(mockTemplates);

      const result = await service.getTemplatesByCategory(5);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ inherited: true, sourceCategory: { id: 10, name: 'Smartphones' } });
      expect(result[1]).toMatchObject({ inherited: true, sourceCategory: { id: 11, name: 'Phone Cases' } });
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

  // ===========================================================================
  // CATEGORY KEYWORDS
  // ===========================================================================
  describe('addCategoryKeywords()', () => {
    it('should add keywords to a category', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: 1, name: 'Smartphones' });
      prisma.categoryKeyword.create
        .mockResolvedValueOnce({ id: 1, categoryId: 1, keyword: 'smartphone' })
        .mockResolvedValueOnce({ id: 2, categoryId: 1, keyword: 'mobile' });

      const result = await service.addCategoryKeywords(1, ['Smartphone', 'Mobile']);

      expect(result).toHaveLength(2);
      expect(prisma.categoryKeyword.create).toHaveBeenCalledTimes(2);
      // Verify keywords are lowercased + trimmed
      expect(prisma.categoryKeyword.create).toHaveBeenCalledWith({
        data: { categoryId: 1, keyword: 'smartphone' },
      });
    });

    it('should skip duplicate keywords gracefully', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: 1, name: 'Smartphones' });
      prisma.categoryKeyword.create
        .mockResolvedValueOnce({ id: 1, categoryId: 1, keyword: 'phone' })
        .mockRejectedValueOnce(new Error('Unique constraint'));

      const result = await service.addCategoryKeywords(1, ['phone', 'phone-dupe']);

      expect(result).toHaveLength(1);
      expect(result[0].keyword).toBe('phone');
    });

    it('should throw NotFoundException if category not found', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(
        service.addCategoryKeywords(999, ['keyword']),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getCategoryKeywords()', () => {
    it('should return keywords ordered alphabetically', async () => {
      const mockKeywords = [
        { id: 1, categoryId: 1, keyword: 'android' },
        { id: 2, categoryId: 1, keyword: 'mobile' },
        { id: 3, categoryId: 1, keyword: 'smartphone' },
      ];
      prisma.categoryKeyword.findMany.mockResolvedValue(mockKeywords);

      const result = await service.getCategoryKeywords(1);

      expect(result).toEqual(mockKeywords);
      expect(prisma.categoryKeyword.findMany).toHaveBeenCalledWith({
        where: { categoryId: 1, status: 'ACTIVE', deletedAt: null },
        orderBy: { keyword: 'asc' },
      });
    });
  });

  // ===========================================================================
  // MATCH CATEGORIES (Keyword-Based)
  // ===========================================================================
  describe('matchCategories()', () => {
    it('should split text into words and match against keywords', async () => {
      prisma.categoryKeyword.findMany.mockResolvedValue([
        { categoryId: 1, keyword: 'samsung', category: { id: 1, name: 'Smartphones' } },
        { categoryId: 1, keyword: 'phone', category: { id: 1, name: 'Smartphones' } },
        { categoryId: 2, keyword: 'samsung', category: { id: 2, name: 'Tablets' } },
      ]);

      const result = await service.matchCategories('Samsung Galaxy Phone 5G');

      expect(result).toHaveLength(2);
      // Smartphones should be first (2 matches: samsung, phone)
      expect(result[0].categoryId).toBe(1);
      expect(result[0].matchedKeywords).toHaveLength(2);
      expect(result[0].matchedKeywords).toContain('samsung');
      expect(result[0].matchedKeywords).toContain('phone');
      // Tablets should be second (1 match: samsung)
      expect(result[1].categoryId).toBe(2);
      expect(result[1].matchedKeywords).toHaveLength(1);
    });

    it('should return empty array for short words (<=2 chars)', async () => {
      const result = await service.matchCategories('a b');

      expect(result).toEqual([]);
      expect(prisma.categoryKeyword.findMany).not.toHaveBeenCalled();
    });

    it('should split on various delimiters', async () => {
      prisma.categoryKeyword.findMany.mockResolvedValue([
        { categoryId: 1, keyword: 'laptop', category: { id: 1, name: 'Laptops' } },
      ]);

      await service.matchCategories('gaming-laptop/ultrabook.pro');

      // Should have searched with words: gaming, laptop, ultrabook, pro
      expect(prisma.categoryKeyword.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            keyword: { in: expect.arrayContaining(['gaming', 'laptop', 'ultrabook', 'pro']) },
          }),
        }),
      );
    });

    it('should return empty for empty string', async () => {
      const result = await service.matchCategories('');

      expect(result).toEqual([]);
    });
  });

  // ===========================================================================
  // PRODUCT CATEGORIES (Multi-Category)
  // ===========================================================================
  describe('setProductCategories()', () => {
    it('should replace all product categories and update primary', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 1, productName: 'Test' });
      prisma.productCategoryMap.deleteMany.mockResolvedValue({ count: 2 });
      prisma.productCategoryMap.createMany.mockResolvedValue({ count: 3 });
      prisma.product.update.mockResolvedValue({ id: 1, categoryId: 10 });
      prisma.productCategoryMap.findMany.mockResolvedValue([
        { productId: 1, categoryId: 10, isPrimary: true },
        { productId: 1, categoryId: 20, isPrimary: false },
        { productId: 1, categoryId: 30, isPrimary: false },
      ]);
      cacheService.invalidateProduct.mockResolvedValue(undefined);
      cacheService.del.mockResolvedValue(undefined);

      const result = await service.setProductCategories(1, [10, 20, 30], 10);

      expect(prisma.productCategoryMap.deleteMany).toHaveBeenCalledWith({
        where: { productId: 1 },
      });
      expect(prisma.productCategoryMap.createMany).toHaveBeenCalledWith({
        data: [
          { productId: 1, categoryId: 10, isPrimary: true, source: 'manual' },
          { productId: 1, categoryId: 20, isPrimary: false, source: 'manual' },
          { productId: 1, categoryId: 30, isPrimary: false, source: 'manual' },
        ],
      });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { categoryId: 10 },
      });
      expect(cacheService.invalidateProduct).toHaveBeenCalledWith(1);
    });

    it('should use first categoryId as primary when not specified', async () => {
      prisma.product.findUnique.mockResolvedValue({ id: 1, productName: 'Test' });
      prisma.productCategoryMap.deleteMany.mockResolvedValue({ count: 0 });
      prisma.productCategoryMap.createMany.mockResolvedValue({ count: 2 });
      prisma.product.update.mockResolvedValue({ id: 1, categoryId: 10 });
      prisma.productCategoryMap.findMany.mockResolvedValue([]);
      cacheService.invalidateProduct.mockResolvedValue(undefined);
      cacheService.del.mockResolvedValue(undefined);

      await service.setProductCategories(1, [10, 20]);

      // First category (10) should be primary
      expect(prisma.productCategoryMap.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ categoryId: 10, isPrimary: true }),
          expect.objectContaining({ categoryId: 20, isPrimary: false }),
        ]),
      });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { categoryId: 10 },
      });
    });

    it('should throw NotFoundException when product not found', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.setProductCategories(999, [10]),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getProductCategories()', () => {
    it('should return categories for a product with category details', async () => {
      const mockMaps = [
        { productId: 1, categoryId: 10, isPrimary: true, category: { id: 10, name: 'Smartphones', parentId: 5, icon: null } },
        { productId: 1, categoryId: 20, isPrimary: false, category: { id: 20, name: 'Phone Cases', parentId: 5, icon: null } },
      ];
      prisma.productCategoryMap.findMany.mockResolvedValue(mockMaps);

      const result = await service.getProductCategories(1);

      expect(result).toEqual(mockMaps);
      expect(prisma.productCategoryMap.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { productId: 1, status: 'ACTIVE', deletedAt: null },
          include: expect.objectContaining({
            category: expect.any(Object),
          }),
          orderBy: { isPrimary: 'desc' },
        }),
      );
    });
  });

  // ===========================================================================
  // AUTO-CATEGORIZE (Product)
  // ===========================================================================
  describe('autoCategorize()', () => {
    it('should use tag-based matching as primary strategy', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 1,
        productName: 'Samsung Galaxy S24',
        description: 'A smartphone',
        shortDescription: '',
        productTags: [
          { productTagsTag: { id: 10, tagName: 'smartphone' } },
          { productTagsTag: { id: 11, tagName: '5g' } },
        ],
      });

      // Mock matchCategoriesByTags result (called internally)
      prisma.categoryTag.findMany.mockResolvedValue([
        { categoryId: 1, tagId: 10, category: { id: 1, name: 'Smartphones' } },
        { categoryId: 1, tagId: 11, category: { id: 1, name: 'Smartphones' } },
      ]);

      prisma.productCategoryMap.create.mockResolvedValue({});

      const result = await service.autoCategorize(1);

      expect(result).toHaveLength(1);
      expect(result[0].categoryId).toBe(1);
      expect((result[0] as any).matchCount).toBe(2);
    });

    it('should fall back to keyword matching when no tags', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 1,
        productName: 'Samsung Galaxy Phone',
        description: 'A mobile phone',
        shortDescription: '',
        productTags: [], // No tags
      });

      // Mock keyword matching
      prisma.categoryKeyword.findMany.mockResolvedValue([
        { categoryId: 1, keyword: 'samsung', category: { id: 1, name: 'Smartphones' } },
        { categoryId: 1, keyword: 'phone', category: { id: 1, name: 'Smartphones' } },
      ]);

      prisma.productCategoryMap.create.mockResolvedValue({});

      const result = await service.autoCategorize(1);

      expect(result).toHaveLength(1);
      expect(result[0].categoryId).toBe(1);
      expect((result[0] as any).matchedKeywords).toContain('samsung');
    });

    it('should fall back to keywords when tags match zero categories', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: 1,
        productName: 'Special Widget',
        description: 'A widget gadget',
        shortDescription: '',
        productTags: [
          { productTagsTag: { id: 99, tagName: 'unmatched-tag' } },
        ],
      });

      // Tags match no categories
      prisma.categoryTag.findMany.mockResolvedValue([]);

      // Keyword matching finds something
      prisma.categoryKeyword.findMany.mockResolvedValue([
        { categoryId: 5, keyword: 'widget', category: { id: 5, name: 'Widgets' } },
      ]);
      prisma.productCategoryMap.create.mockResolvedValue({});

      const result = await service.autoCategorize(1);

      expect(result).toHaveLength(1);
      expect(result[0].categoryName).toBe('Widgets');
    });

    it('should throw NotFoundException when product not found', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.autoCategorize(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================================================
  // SERVICE CATEGORIES (Multi-Category)
  // ===========================================================================
  describe('setServiceCategories()', () => {
    it('should replace all service categories and update primary', async () => {
      prisma.service.findUnique.mockResolvedValue({ id: 5, serviceName: 'Repair' });
      prisma.serviceCategoryMap.deleteMany.mockResolvedValue({ count: 1 });
      prisma.serviceCategoryMap.createMany.mockResolvedValue({ count: 2 });
      prisma.service.update.mockResolvedValue({ id: 5, categoryId: 10 });
      prisma.serviceCategoryMap.findMany.mockResolvedValue([
        { serviceId: 5, categoryId: 10, isPrimary: true },
        { serviceId: 5, categoryId: 20, isPrimary: false },
      ]);

      const result = await service.setServiceCategories(5, [10, 20], 10);

      expect(prisma.serviceCategoryMap.deleteMany).toHaveBeenCalledWith({
        where: { serviceId: 5 },
      });
      expect(prisma.serviceCategoryMap.createMany).toHaveBeenCalledWith({
        data: [
          { serviceId: 5, categoryId: 10, isPrimary: true, source: 'manual' },
          { serviceId: 5, categoryId: 20, isPrimary: false, source: 'manual' },
        ],
      });
      expect(prisma.service.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { categoryId: 10 },
      });
    });

    it('should handle empty categoryIds', async () => {
      prisma.service.findUnique.mockResolvedValue({ id: 5, serviceName: 'Repair' });
      prisma.serviceCategoryMap.deleteMany.mockResolvedValue({ count: 0 });
      prisma.serviceCategoryMap.findMany.mockResolvedValue([]);

      const result = await service.setServiceCategories(5, []);

      expect(prisma.serviceCategoryMap.deleteMany).toHaveBeenCalled();
      expect(prisma.serviceCategoryMap.createMany).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when service not found', async () => {
      prisma.service.findUnique.mockResolvedValue(null);

      await expect(
        service.setServiceCategories(999, [10]),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getServiceCategories()', () => {
    it('should return categories for a service with details', async () => {
      const mockMaps = [
        { serviceId: 5, categoryId: 10, isPrimary: true, category: { id: 10, name: 'Repair', parentId: 1, icon: null } },
      ];
      prisma.serviceCategoryMap.findMany.mockResolvedValue(mockMaps);

      const result = await service.getServiceCategories(5);

      expect(result).toEqual(mockMaps);
      expect(prisma.serviceCategoryMap.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { serviceId: 5, status: 'ACTIVE', deletedAt: null },
          include: expect.objectContaining({
            category: expect.any(Object),
          }),
          orderBy: { isPrimary: 'desc' },
        }),
      );
    });
  });

  // ===========================================================================
  // AUTO-CATEGORIZE SERVICE
  // ===========================================================================
  describe('autoCategorizeService()', () => {
    it('should use tag-based matching for service', async () => {
      prisma.service.findUnique.mockResolvedValue({
        id: 5,
        serviceName: 'Phone Repair',
        serviceTags: [
          { tag: { id: 10, tagName: 'smartphone' } },
          { tag: { id: 11, tagName: 'repair' } },
        ],
      });

      prisma.categoryTag.findMany.mockResolvedValue([
        { categoryId: 1, tagId: 10, category: { id: 1, name: 'Phone Services' } },
        { categoryId: 1, tagId: 11, category: { id: 1, name: 'Phone Services' } },
      ]);

      prisma.serviceCategoryMap.create.mockResolvedValue({});

      const result = await service.autoCategorizeService(5);

      expect(result).toHaveLength(1);
      expect(result[0].categoryId).toBe(1);
      expect(result[0].matchCount).toBe(2);
    });

    it('should return empty when service has no tags', async () => {
      prisma.service.findUnique.mockResolvedValue({
        id: 5,
        serviceName: 'Basic Service',
        serviceTags: [],
      });

      const result = await service.autoCategorizeService(5);

      expect(result).toEqual([]);
      expect(prisma.categoryTag.findMany).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when service not found', async () => {
      prisma.service.findUnique.mockResolvedValue(null);

      await expect(service.autoCategorizeService(999)).rejects.toThrow(NotFoundException);
    });
  });
});
