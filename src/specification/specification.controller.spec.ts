import { Test, TestingModule } from '@nestjs/testing';
import { SpecificationController } from './specification.controller';
import { SpecificationService } from './specification.service';
import { AuthGuard } from 'src/guards/AuthGuard';
import { AuthService } from 'src/auth/auth.service';
import { PrismaService } from 'src/prisma/prisma.service';

// ─────────────────────────────────────────────────────────
// Mock SpecificationService — stub every public method
// ─────────────────────────────────────────────────────────
const mockSpecService = {
  // Templates
  createTemplate: jest.fn(),
  bulkCreateTemplates: jest.fn(),
  getTemplatesByCategory: jest.fn(),
  getTemplatesForCategories: jest.fn(),
  updateTemplate: jest.fn(),
  deleteTemplate: jest.fn(),

  // Spec Values
  setSpecValues: jest.fn(),
  getSpecValues: jest.fn(),
  updateSpecValue: jest.fn(),

  // Filters
  getFilters: jest.fn(),

  // Category Keywords
  addCategoryKeywords: jest.fn(),
  getCategoryKeywords: jest.fn(),
  matchCategories: jest.fn(),

  // Product Categories
  setProductCategories: jest.fn(),
  getProductCategories: jest.fn(),
  autoCategorize: jest.fn(),

  // Category Tags
  addCategoryTags: jest.fn(),
  getCategoryTags: jest.fn(),
  removeCategoryTag: jest.fn(),
  setCategoryTags: jest.fn(),

  // Tag CRUD
  listTags: jest.fn(),
  searchTags: jest.fn(),
  getTagById: jest.fn(),
  updateTag: jest.fn(),
  deleteTag: jest.fn(),

  // Tag-Based Matching
  matchCategoriesByTags: jest.fn(),

  // Service Categories
  setServiceCategories: jest.fn(),
  getServiceCategories: jest.fn(),
  autoCategorizeService: jest.fn(),
};

describe('SpecificationController', () => {
  let controller: SpecificationController;
  let specService: typeof mockSpecService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SpecificationController],
      providers: [
        { provide: SpecificationService, useValue: mockSpecService },
        { provide: AuthService, useValue: {} },
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();

    controller = module.get<SpecificationController>(SpecificationController);
    specService = module.get(SpecificationService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ===========================================================================
  // SPEC TEMPLATES
  // ===========================================================================
  describe('createTemplate()', () => {
    it('should delegate to specService.createTemplate', async () => {
      const dto = {
        categoryId: 1,
        name: 'Screen Size',
        key: 'screen_size',
        dataType: 'NUMBER',
        unit: 'inches',
      };
      const expected = { id: 10, ...dto };
      specService.createTemplate.mockResolvedValue(expected);

      const result = await controller.createTemplate(dto as any);

      expect(result).toEqual(expected);
      expect(specService.createTemplate).toHaveBeenCalledWith(dto);
    });
  });

  describe('bulkCreateTemplates()', () => {
    it('should delegate to specService.bulkCreateTemplates', async () => {
      const dto = {
        categoryId: 1,
        templates: [
          { name: 'RAM', key: 'ram', dataType: 'SELECT' },
          { name: 'Storage', key: 'storage', dataType: 'SELECT' },
        ],
      };
      const expected = [
        { id: 11, name: 'RAM', key: 'ram' },
        { id: 12, name: 'Storage', key: 'storage' },
      ];
      specService.bulkCreateTemplates.mockResolvedValue(expected);

      const result = await controller.bulkCreateTemplates(dto as any);

      expect(result).toEqual(expected);
      expect(specService.bulkCreateTemplates).toHaveBeenCalledWith(dto);
    });
  });

  describe('getTemplates()', () => {
    it('should call getTemplatesByCategory with parsed categoryId', async () => {
      const mockTemplates = [
        { id: 1, name: 'Screen Size', key: 'screen_size', categoryId: 5 },
      ];
      specService.getTemplatesByCategory.mockResolvedValue(mockTemplates);

      const result = await controller.getTemplates(5);

      expect(result).toEqual(mockTemplates);
      expect(specService.getTemplatesByCategory).toHaveBeenCalledWith(5);
    });
  });

  describe('getTemplatesForCategories()', () => {
    it('should split comma-separated ids and call service', async () => {
      const grouped = {
        10: [{ id: 1, name: 'Screen Size' }],
        20: [{ id: 3, name: 'Type' }],
      };
      specService.getTemplatesForCategories.mockResolvedValue(grouped);

      const result = await controller.getTemplatesForCategories('10,20');

      expect(result).toEqual(grouped);
      expect(specService.getTemplatesForCategories).toHaveBeenCalledWith([10, 20]);
    });

    it('should filter out NaN values from ids', async () => {
      specService.getTemplatesForCategories.mockResolvedValue({});

      await controller.getTemplatesForCategories('10,,abc,20');

      expect(specService.getTemplatesForCategories).toHaveBeenCalledWith([10, 20]);
    });
  });

  describe('updateTemplate()', () => {
    it('should delegate to specService.updateTemplate', async () => {
      const dto = { name: 'Updated Name' };
      const expected = { id: 10, name: 'Updated Name' };
      specService.updateTemplate.mockResolvedValue(expected);

      const result = await controller.updateTemplate(10, dto as any);

      expect(result).toEqual(expected);
      expect(specService.updateTemplate).toHaveBeenCalledWith(10, dto);
    });
  });

  describe('deleteTemplate()', () => {
    it('should delegate to specService.deleteTemplate', async () => {
      const expected = { message: 'Template deleted successfully' };
      specService.deleteTemplate.mockResolvedValue(expected);

      const result = await controller.deleteTemplate(10);

      expect(result).toEqual(expected);
      expect(specService.deleteTemplate).toHaveBeenCalledWith(10);
    });
  });

  // ===========================================================================
  // SPEC VALUES
  // ===========================================================================
  describe('setSpecValues()', () => {
    it('should delegate to specService.setSpecValues', async () => {
      const dto = {
        productId: 1,
        values: [
          { specTemplateId: 10, value: '6.7', numericValue: 6.7 },
          { specTemplateId: 11, value: '8GB' },
        ],
      };
      const expected = [
        { id: 100, productId: 1, specTemplateId: 10, value: '6.7' },
        { id: 101, productId: 1, specTemplateId: 11, value: '8GB' },
      ];
      specService.setSpecValues.mockResolvedValue(expected);

      const result = await controller.setSpecValues(dto as any);

      expect(result).toEqual(expected);
      expect(specService.setSpecValues).toHaveBeenCalledWith(dto);
    });
  });

  describe('getSpecValues()', () => {
    it('should call getSpecValues with parsed productId', async () => {
      const mockValues = [{ id: 100, productId: 1, value: '6.7' }];
      specService.getSpecValues.mockResolvedValue(mockValues);

      const result = await controller.getSpecValues(1);

      expect(result).toEqual(mockValues);
      expect(specService.getSpecValues).toHaveBeenCalledWith(1);
    });
  });

  describe('updateSpecValue()', () => {
    it('should delegate to specService.updateSpecValue', async () => {
      const dto = { value: 'new-val', numericValue: 7.0 };
      const expected = { id: 100, value: 'new-val', numericValue: 7.0 };
      specService.updateSpecValue.mockResolvedValue(expected);

      const result = await controller.updateSpecValue(100, dto as any);

      expect(result).toEqual(expected);
      expect(specService.updateSpecValue).toHaveBeenCalledWith(100, dto);
    });
  });

  // ===========================================================================
  // FILTERS
  // ===========================================================================
  describe('getFilters()', () => {
    it('should call getFilters with parsed categoryId', async () => {
      const mockFilters = {
        filters: [
          { key: 'screen_size', name: 'Screen Size', dataType: 'NUMBER', range: { min: 5.5, max: 7.2 } },
          { key: 'ram', name: 'RAM', dataType: 'SELECT', options: ['8GB', '16GB'] },
        ],
      };
      specService.getFilters.mockResolvedValue(mockFilters);

      const result = await controller.getFilters(1);

      expect(result).toEqual(mockFilters);
      expect(specService.getFilters).toHaveBeenCalledWith(1);
    });
  });

  // ===========================================================================
  // CATEGORY KEYWORDS
  // ===========================================================================
  describe('addKeywords()', () => {
    it('should extract keywords from body and delegate', async () => {
      const body = { keywords: ['smartphone', '5g', 'mobile'] };
      const expected = [
        { id: 1, categoryId: 1, keyword: 'smartphone' },
        { id: 2, categoryId: 1, keyword: '5g' },
        { id: 3, categoryId: 1, keyword: 'mobile' },
      ];
      specService.addCategoryKeywords.mockResolvedValue(expected);

      const result = await controller.addKeywords(1, body);

      expect(result).toEqual(expected);
      expect(specService.addCategoryKeywords).toHaveBeenCalledWith(1, body.keywords);
    });
  });

  describe('getKeywords()', () => {
    it('should call getCategoryKeywords with categoryId', async () => {
      const expected = [
        { id: 1, categoryId: 1, keyword: 'smartphone' },
      ];
      specService.getCategoryKeywords.mockResolvedValue(expected);

      const result = await controller.getKeywords(1);

      expect(result).toEqual(expected);
      expect(specService.getCategoryKeywords).toHaveBeenCalledWith(1);
    });
  });

  describe('matchCategories()', () => {
    it('should extract text from body and delegate', async () => {
      const body = { text: 'samsung galaxy smartphone 5g' };
      const expected = [
        { categoryId: 1, categoryName: 'Smartphones', matchedKeywords: ['smartphone', '5g', 'samsung'] },
      ];
      specService.matchCategories.mockResolvedValue(expected);

      const result = await controller.matchCategories(body);

      expect(result).toEqual(expected);
      expect(specService.matchCategories).toHaveBeenCalledWith(body.text);
    });
  });

  // ===========================================================================
  // PRODUCT CATEGORIES (Multi-Category)
  // ===========================================================================
  describe('setProductCategories()', () => {
    it('should extract categoryIds and primaryCategoryId from body', async () => {
      const body = { categoryIds: [10, 20, 30], primaryCategoryId: 10 };
      const expected = [
        { productId: 1, categoryId: 10, isPrimary: true },
        { productId: 1, categoryId: 20, isPrimary: false },
        { productId: 1, categoryId: 30, isPrimary: false },
      ];
      specService.setProductCategories.mockResolvedValue(expected);

      const result = await controller.setProductCategories(1, body);

      expect(result).toEqual(expected);
      expect(specService.setProductCategories).toHaveBeenCalledWith(1, [10, 20, 30], 10);
    });

    it('should handle missing primaryCategoryId', async () => {
      const body = { categoryIds: [10, 20] };
      specService.setProductCategories.mockResolvedValue([]);

      await controller.setProductCategories(1, body);

      expect(specService.setProductCategories).toHaveBeenCalledWith(1, [10, 20], undefined);
    });
  });

  describe('getProductCategories()', () => {
    it('should call getProductCategories with productId', async () => {
      const expected = [
        { productId: 1, categoryId: 10, isPrimary: true, category: { id: 10, name: 'Smartphones' } },
      ];
      specService.getProductCategories.mockResolvedValue(expected);

      const result = await controller.getProductCategories(1);

      expect(result).toEqual(expected);
      expect(specService.getProductCategories).toHaveBeenCalledWith(1);
    });
  });

  describe('autoCategorize()', () => {
    it('should call autoCategorize with productId', async () => {
      const expected = [
        { categoryId: 1, categoryName: 'Smartphones', matchedTagIds: [10, 11], matchCount: 2 },
      ];
      specService.autoCategorize.mockResolvedValue(expected);

      const result = await controller.autoCategorize(1);

      expect(result).toEqual(expected);
      expect(specService.autoCategorize).toHaveBeenCalledWith(1);
    });
  });

  // ===========================================================================
  // CATEGORY TAGS
  // ===========================================================================
  describe('addCategoryTags()', () => {
    it('should extract tagIds from body and delegate', async () => {
      const body = { tagIds: [10, 11, 12] };
      const expected = [
        { id: 1, categoryId: 1, tagId: 10, tag: { id: 10, tagName: 'smartphone' } },
        { id: 2, categoryId: 1, tagId: 11, tag: { id: 11, tagName: '5g' } },
        { id: 3, categoryId: 1, tagId: 12, tag: { id: 12, tagName: 'touchscreen' } },
      ];
      specService.addCategoryTags.mockResolvedValue(expected);

      const result = await controller.addCategoryTags(1, body);

      expect(result).toEqual(expected);
      expect(specService.addCategoryTags).toHaveBeenCalledWith(1, [10, 11, 12]);
    });
  });

  describe('getCategoryTags()', () => {
    it('should call getCategoryTags with categoryId', async () => {
      const expected = [
        { id: 1, categoryId: 1, tagId: 10, tag: { id: 10, tagName: 'smartphone' } },
      ];
      specService.getCategoryTags.mockResolvedValue(expected);

      const result = await controller.getCategoryTags(1);

      expect(result).toEqual(expected);
      expect(specService.getCategoryTags).toHaveBeenCalledWith(1);
    });
  });

  describe('removeCategoryTag()', () => {
    it('should call removeCategoryTag with both params', async () => {
      const expected = { message: 'Tag removed from category' };
      specService.removeCategoryTag.mockResolvedValue(expected);

      const result = await controller.removeCategoryTag(1, 10);

      expect(result).toEqual(expected);
      expect(specService.removeCategoryTag).toHaveBeenCalledWith(1, 10);
    });
  });

  describe('setCategoryTags()', () => {
    it('should extract tagIds from body and delegate', async () => {
      const body = { tagIds: [10, 11] };
      const expected = [
        { id: 1, categoryId: 1, tagId: 10 },
        { id: 2, categoryId: 1, tagId: 11 },
      ];
      specService.setCategoryTags.mockResolvedValue(expected);

      const result = await controller.setCategoryTags(1, body);

      expect(result).toEqual(expected);
      expect(specService.setCategoryTags).toHaveBeenCalledWith(1, [10, 11]);
    });
  });

  // ===========================================================================
  // TAG MANAGEMENT (Enhanced CRUD)
  // ===========================================================================
  describe('listTags()', () => {
    it('should parse page and limit query params', async () => {
      const expected = {
        data: [{ id: 1, tagName: '5g' }],
        pagination: { page: 2, limit: 10, total: 50, totalPages: 5 },
      };
      specService.listTags.mockResolvedValue(expected);

      const result = await controller.listTags('2', '10');

      expect(result).toEqual(expected);
      expect(specService.listTags).toHaveBeenCalledWith(2, 10);
    });

    it('should use defaults when no query params', async () => {
      specService.listTags.mockResolvedValue({ data: [], pagination: {} });

      await controller.listTags(undefined, undefined);

      expect(specService.listTags).toHaveBeenCalledWith(1, 20);
    });
  });

  describe('searchTags()', () => {
    it('should parse query and limit params', async () => {
      const expected = [{ id: 1, tagName: 'bluetooth' }];
      specService.searchTags.mockResolvedValue(expected);

      const result = await controller.searchTags('blue', '10');

      expect(result).toEqual(expected);
      expect(specService.searchTags).toHaveBeenCalledWith('blue', 10);
    });

    it('should use empty string and default limit when params missing', async () => {
      specService.searchTags.mockResolvedValue([]);

      await controller.searchTags(undefined as any, undefined);

      expect(specService.searchTags).toHaveBeenCalledWith('', 20);
    });
  });

  describe('getTagById()', () => {
    it('should call getTagById with parsed tagId', async () => {
      const expected = {
        id: 10,
        tagName: 'smartphone',
        categoryTags: [],
        tagProductTags: [],
      };
      specService.getTagById.mockResolvedValue(expected);

      const result = await controller.getTagById(10);

      expect(result).toEqual(expected);
      expect(specService.getTagById).toHaveBeenCalledWith(10);
    });
  });

  describe('updateTag()', () => {
    it('should extract tagName from body and delegate', async () => {
      const body = { tagName: 'updated-tag' };
      const expected = { id: 10, tagName: 'updated-tag' };
      specService.updateTag.mockResolvedValue(expected);

      const result = await controller.updateTag(10, body);

      expect(result).toEqual(expected);
      expect(specService.updateTag).toHaveBeenCalledWith(10, body);
    });
  });

  describe('deleteTag()', () => {
    it('should call deleteTag with parsed tagId', async () => {
      const expected = { message: 'Tag deleted successfully' };
      specService.deleteTag.mockResolvedValue(expected);

      const result = await controller.deleteTag(10);

      expect(result).toEqual(expected);
      expect(specService.deleteTag).toHaveBeenCalledWith(10);
    });
  });

  // ===========================================================================
  // TAG-BASED MATCHING
  // ===========================================================================
  describe('matchCategoriesByTags()', () => {
    it('should extract tagIds from body and delegate', async () => {
      const body = { tagIds: [10, 11, 12] };
      const expected = [
        { categoryId: 1, categoryName: 'Smartphones', matchedTagIds: [10, 11, 12], matchCount: 3 },
        { categoryId: 2, categoryName: 'Phone Cases', matchedTagIds: [10], matchCount: 1 },
      ];
      specService.matchCategoriesByTags.mockResolvedValue(expected);

      const result = await controller.matchCategoriesByTags(body);

      expect(result).toEqual(expected);
      expect(specService.matchCategoriesByTags).toHaveBeenCalledWith([10, 11, 12]);
    });
  });

  // ===========================================================================
  // SERVICE CATEGORIES (Multi-Category)
  // ===========================================================================
  describe('setServiceCategories()', () => {
    it('should extract categoryIds and primaryCategoryId from body', async () => {
      const body = { categoryIds: [10, 20], primaryCategoryId: 10 };
      const expected = [
        { serviceId: 5, categoryId: 10, isPrimary: true },
        { serviceId: 5, categoryId: 20, isPrimary: false },
      ];
      specService.setServiceCategories.mockResolvedValue(expected);

      const result = await controller.setServiceCategories(5, body);

      expect(result).toEqual(expected);
      expect(specService.setServiceCategories).toHaveBeenCalledWith(5, [10, 20], 10);
    });
  });

  describe('getServiceCategories()', () => {
    it('should call getServiceCategories with serviceId', async () => {
      const expected = [
        { serviceId: 5, categoryId: 10, isPrimary: true, category: { id: 10, name: 'Repair' } },
      ];
      specService.getServiceCategories.mockResolvedValue(expected);

      const result = await controller.getServiceCategories(5);

      expect(result).toEqual(expected);
      expect(specService.getServiceCategories).toHaveBeenCalledWith(5);
    });
  });

  describe('autoCategorizeService()', () => {
    it('should call autoCategorizeService with serviceId', async () => {
      const expected = [
        { categoryId: 10, categoryName: 'Repair', matchedTagIds: [5], matchCount: 1 },
      ];
      specService.autoCategorizeService.mockResolvedValue(expected);

      const result = await controller.autoCategorizeService(5);

      expect(result).toEqual(expected);
      expect(specService.autoCategorizeService).toHaveBeenCalledWith(5);
    });
  });
});
