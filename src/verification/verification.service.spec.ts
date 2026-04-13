/**
 * VERIFICATION SERVICE TESTS
 * Covers: CR extraction, auto-fill profile, branch creation,
 * category matching, category assignment, product suggestions, full pipeline
 */
import { Test, TestingModule } from '@nestjs/testing';
import { VerificationService } from './verification.service';
import { PrismaService } from '../prisma/prisma.service';
import { HelperService } from '../helper/helper.service';

// Mock axios
jest.mock('axios');
const axios = require('axios');

const mockPrisma = {
  userProfile: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  user: {
    update: jest.fn(),
  },
  userBranch: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  category: {
    findMany: jest.fn(),
  },
  userBusinessCategory: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  product: {
    findMany: jest.fn(),
  },
};

const mockHelper = {
  getAdminId: jest.fn().mockResolvedValue(1),
};

const MOCK_CR_EXTRACTED = {
  companyName: 'Ultrasooq Trading LLC',
  companyNameAr: 'الترا سوق للتجارة ش.م.م',
  crNumber: 'CR-2024-12345',
  expiryDate: '2028-12-31',
  issueDate: '2024-01-15',
  address: '123 Business Park, Muscat',
  city: 'Muscat',
  country: 'Oman',
  businessActivities: ['General Trading', 'Electronics', 'IT Services', 'Import/Export'],
  branches: [
    { name: 'Main Office', address: '123 Business Park, Muscat', city: 'Muscat' },
    { name: 'Warehouse', address: '456 Industrial Zone, Sohar', city: 'Sohar' },
  ],
  taxId: 'VAT-OM-987654',
  capitalAmount: 'OMR 50,000',
  legalForm: 'LLC',
  ownerName: 'Ahmed Al-Said',
  phoneNumber: '+968-9912-3456',
  email: 'info@ultrasooq.com',
  website: 'www.ultrasooq.com',
  confidence: 92,
};

describe('VerificationService', () => {
  let service: VerificationService;

  beforeEach(async () => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.OPENROUTER_MODEL = 'qwen/qwen-2.5-72b-instruct';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VerificationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: HelperService, useValue: mockHelper },
      ],
    }).compile();

    service = module.get<VerificationService>(VerificationService);
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════════════════════
  // STEP 1: CR EXTRACTION
  // ═══════════════════════════════════════════════════════════

  describe('extractCRData', () => {
    it('extracts structured data from CR document via AI', async () => {
      axios.post.mockResolvedValue({
        data: {
          choices: [{ message: { content: JSON.stringify(MOCK_CR_EXTRACTED) } }],
        },
      });

      const result = await service.extractCRData('https://s3.example.com/cr.pdf');

      expect(result.companyName).toBe('Ultrasooq Trading LLC');
      expect(result.crNumber).toBe('CR-2024-12345');
      expect(result.businessActivities).toHaveLength(4);
      expect(result.branches).toHaveLength(2);
      expect(result.confidence).toBe(92);
    });

    it('handles markdown-wrapped JSON response', async () => {
      axios.post.mockResolvedValue({
        data: {
          choices: [{ message: { content: '```json\n' + JSON.stringify(MOCK_CR_EXTRACTED) + '\n```' } }],
        },
      });

      const result = await service.extractCRData('https://s3.example.com/cr.pdf');
      expect(result.companyName).toBe('Ultrasooq Trading LLC');
    });

    it('throws when API key is not configured', async () => {
      process.env.OPENROUTER_API_KEY = '';
      const svc = new VerificationService(mockPrisma as any, mockHelper as any);

      await expect(svc.extractCRData('https://s3.example.com/cr.pdf')).rejects.toThrow();
    });

    it('throws when AI returns invalid JSON', async () => {
      axios.post.mockResolvedValue({
        data: { choices: [{ message: { content: 'not valid json at all' } }] },
      });

      await expect(service.extractCRData('https://s3.example.com/cr.pdf')).rejects.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════
  // STEP 2: AUTO-FILL PROFILE
  // ═══════════════════════════════════════════════════════════

  describe('autoFillProfile', () => {
    it('updates user profile with extracted data', async () => {
      mockPrisma.userProfile.findFirst.mockResolvedValue({ id: 1, userId: 7 });
      mockPrisma.userProfile.update.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.autoFillProfile(7, MOCK_CR_EXTRACTED);

      expect(result.status).toBe(true);
      expect(mockPrisma.userProfile.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            companyName: 'Ultrasooq Trading LLC',
            address: '123 Business Park, Muscat',
            city: 'Muscat',
          }),
        }),
      );
    });

    it('updates user table with taxId and website', async () => {
      mockPrisma.userProfile.findFirst.mockResolvedValue({ id: 1, userId: 7 });
      mockPrisma.userProfile.update.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({});

      await service.autoFillProfile(7, MOCK_CR_EXTRACTED);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 7 },
          data: expect.objectContaining({
            companyTaxId: 'VAT-OM-987654',
            companyWebsite: 'www.ultrasooq.com',
          }),
        }),
      );
    });

    it('handles missing profile gracefully', async () => {
      mockPrisma.userProfile.findFirst.mockResolvedValue(null);
      mockPrisma.user.update.mockResolvedValue({});

      const result = await service.autoFillProfile(7, MOCK_CR_EXTRACTED);
      expect(result.status).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // STEP 3: CREATE BRANCHES
  // ═══════════════════════════════════════════════════════════

  describe('createBranchesFromCR', () => {
    it('creates branches from CR data', async () => {
      mockPrisma.userBranch.findFirst.mockResolvedValue(null);
      mockPrisma.userBranch.create.mockResolvedValue({ id: 1 });

      const result = await service.createBranchesFromCR(7, MOCK_CR_EXTRACTED);

      expect(result.status).toBe(true);
      expect(result.branchesCreated).toBe(2);
      expect(mockPrisma.userBranch.create).toHaveBeenCalledTimes(2);
    });

    it('first branch is set as main office', async () => {
      mockPrisma.userBranch.findFirst.mockResolvedValue(null);
      mockPrisma.userBranch.create.mockResolvedValue({ id: 1 });

      await service.createBranchesFromCR(7, MOCK_CR_EXTRACTED);

      expect(mockPrisma.userBranch.create).toHaveBeenNthCalledWith(1,
        expect.objectContaining({
          data: expect.objectContaining({ mainOffice: 1 }),
        }),
      );
    });

    it('skips duplicate branches', async () => {
      mockPrisma.userBranch.findFirst.mockResolvedValue({ id: 99 }); // already exists
      mockPrisma.userBranch.create.mockResolvedValue({ id: 1 });

      const result = await service.createBranchesFromCR(7, MOCK_CR_EXTRACTED);
      expect(result.branchesCreated).toBe(0);
    });

    it('creates main office from address when no branches in CR', async () => {
      mockPrisma.userBranch.findFirst.mockResolvedValue(null);
      mockPrisma.userBranch.create.mockResolvedValue({ id: 1 });

      const noBranches = { ...MOCK_CR_EXTRACTED, branches: [] };
      const result = await service.createBranchesFromCR(7, noBranches);

      expect(result.branchesCreated).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // STEP 4: MATCH CATEGORIES
  // ═══════════════════════════════════════════════════════════

  describe('matchCategories', () => {
    it('matches business activities to platform categories via AI', async () => {
      mockPrisma.category.findMany.mockResolvedValue([
        { id: 1, name: 'Electronics', parentId: null },
        { id: 2, name: 'IT Services', parentId: null },
        { id: 3, name: 'Food & Beverage', parentId: null },
      ]);

      const mockMatches = [
        { categoryId: 1, categoryName: 'Electronics', matchScore: 90, matchedActivity: 'Electronics' },
        { categoryId: 2, categoryName: 'IT Services', matchScore: 85, matchedActivity: 'IT Services' },
      ];

      axios.post.mockResolvedValue({
        data: { choices: [{ message: { content: JSON.stringify(mockMatches) } }] },
      });

      const result = await service.matchCategories(['General Trading', 'Electronics', 'IT Services']);

      expect(result).toHaveLength(2);
      expect(result[0].matchScore).toBe(90);
    });

    it('returns empty array when no activities provided', async () => {
      const result = await service.matchCategories([]);
      expect(result).toEqual([]);
    });

    it('returns empty array when no categories in platform', async () => {
      mockPrisma.category.findMany.mockResolvedValue([]);
      const result = await service.matchCategories(['Trading']);
      expect(result).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // STEP 5: ASSIGN CATEGORIES
  // ═══════════════════════════════════════════════════════════

  describe('assignCategories', () => {
    it('assigns matched categories to user', async () => {
      mockPrisma.userBusinessCategory.findFirst.mockResolvedValue(null);
      mockPrisma.userBusinessCategory.create.mockResolvedValue({});

      const matches = [
        { categoryId: 1, categoryName: 'Electronics', matchScore: 90, matchedActivity: 'Electronics' },
        { categoryId: 2, categoryName: 'IT', matchScore: 85, matchedActivity: 'IT Services' },
      ];

      const result = await service.assignCategories(7, matches);

      expect(result.status).toBe(true);
      expect(result.categoriesAssigned).toBe(2);
    });

    it('skips already-assigned categories', async () => {
      mockPrisma.userBusinessCategory.findFirst.mockResolvedValue({ id: 1 });

      const result = await service.assignCategories(7, [
        { categoryId: 1, categoryName: 'X', matchScore: 90, matchedActivity: 'X' },
      ]);

      expect(result.categoriesAssigned).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // STEP 6: SUGGEST PRODUCTS
  // ═══════════════════════════════════════════════════════════

  describe('suggestProducts', () => {
    it('returns products from matched categories', async () => {
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 1, productName: 'Laptop', categoryId: 1, productPrice: 500, offerPrice: 450 },
        { id: 2, productName: 'Router', categoryId: 2, productPrice: 80, offerPrice: 65 },
      ]);

      const result = await service.suggestProducts([1, 2]);

      expect(result).toHaveLength(2);
      expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            categoryId: { in: [1, 2] },
            status: 'ACTIVE',
            deletedAt: null,
          }),
        }),
      );
    });

    it('returns empty array for empty category IDs', async () => {
      const result = await service.suggestProducts([]);
      expect(result).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // FULL PIPELINE
  // ═══════════════════════════════════════════════════════════

  describe('runFullPipeline', () => {
    it('runs all 6 steps and returns results', async () => {
      // Step 1: Extract
      axios.post.mockResolvedValueOnce({
        data: { choices: [{ message: { content: JSON.stringify(MOCK_CR_EXTRACTED) } }] },
      });

      // Step 2: Auto-fill
      mockPrisma.userProfile.findFirst.mockResolvedValue({ id: 1, userId: 7 });
      mockPrisma.userProfile.update.mockResolvedValue({});
      mockPrisma.user.update.mockResolvedValue({});

      // Step 3: Branches
      mockPrisma.userBranch.findFirst.mockResolvedValue(null);
      mockPrisma.userBranch.create.mockResolvedValue({ id: 1 });

      // Step 4: Match categories
      mockPrisma.category.findMany.mockResolvedValue([
        { id: 10, name: 'Electronics', parentId: null },
      ]);
      axios.post.mockResolvedValueOnce({
        data: {
          choices: [{ message: { content: JSON.stringify([
            { categoryId: 10, categoryName: 'Electronics', matchScore: 90, matchedActivity: 'Electronics' },
          ]) } }],
        },
      });

      // Step 5: Assign
      mockPrisma.userBusinessCategory.findFirst.mockResolvedValue(null);
      mockPrisma.userBusinessCategory.create.mockResolvedValue({});

      // Step 6: Products
      mockPrisma.product.findMany.mockResolvedValue([
        { id: 100, productName: 'Test Product', categoryId: 10 },
      ]);

      const result = await service.runFullPipeline(7, 'https://s3.example.com/cr.pdf');

      expect(result.status).toBe(true);
      expect(result.data.extraction.companyName).toBe('Ultrasooq Trading LLC');
      expect(result.data.profileFill.status).toBe(true);
      expect(result.data.branches.branchesCreated).toBe(2);
      expect(result.data.categoryMatches).toHaveLength(1);
      expect(result.data.categoryAssignment.categoriesAssigned).toBe(1);
      expect(result.data.suggestedProducts).toHaveLength(1);
    });

    it('returns partial results if later steps fail', async () => {
      // Step 1 succeeds
      axios.post.mockResolvedValueOnce({
        data: { choices: [{ message: { content: JSON.stringify(MOCK_CR_EXTRACTED) } }] },
      });

      // Step 2 fails
      mockPrisma.userProfile.findFirst.mockRejectedValue(new Error('DB error'));

      const result = await service.runFullPipeline(7, 'https://s3.example.com/cr.pdf');

      // Pipeline continues even when individual steps fail internally
      // autoFillProfile catches errors and returns { status: false }
      expect(result.data.extraction).toBeDefined();
      expect(result.data.extraction.companyName).toBe('Ultrasooq Trading LLC');
    });
  });
});
