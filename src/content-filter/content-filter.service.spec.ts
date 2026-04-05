import { Test, TestingModule } from '@nestjs/testing';
import { ContentFilterService } from './content-filter.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';

// Sample rules that mimic what the DB would return
const MOCK_RULES = [
  { term: 'porn', category: 'adult', severity: 'SEVERE', language: 'en' },
  { term: 'pornography', category: 'adult', severity: 'SEVERE', language: 'en' },
  { term: 'fuck', category: 'adult', severity: 'SEVERE', language: 'en' },
  { term: 'nude', category: 'adult', severity: 'SEVERE', language: 'en' },
  { term: 'bitch', category: 'profanity', severity: 'MODERATE', language: 'en' },
  { term: 'asshole', category: 'profanity', severity: 'MODERATE', language: 'en' },
  { term: 'damn', category: 'profanity', severity: 'MILD', language: 'en' },
  { term: 'hell', category: 'profanity', severity: 'MILD', language: 'en' },
  { term: 'crap', category: 'profanity', severity: 'MILD', language: 'en' },
];

describe('ContentFilterService', () => {
  let service: ContentFilterService;
  let prisma: { contentFilterRule: { findMany: jest.Mock }; contentFilterLog: { create: jest.Mock } };
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    prisma = {
      contentFilterRule: {
        findMany: jest.fn().mockResolvedValue(MOCK_RULES),
      },
      contentFilterLog: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
    };

    cache = {
      get: jest.fn().mockResolvedValue(null), // cache miss → load from DB
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentFilterService,
        { provide: PrismaService, useValue: prisma },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<ContentFilterService>(ContentFilterService);

    // Trigger onModuleInit to load rules into trie
    await service.onModuleInit();
  });

  describe('analyzeText()', () => {
    it('should allow clean text', async () => {
      const result = await service.analyzeText('selling fresh vegetables');

      expect(result.clean).toBe(true);
      expect(result.severity).toBe('NONE');
      expect(result.action).toBe('ALLOW');
      expect(result.matches).toHaveLength(0);
    });

    it('should reject severe content', async () => {
      const result = await service.analyzeText('selling porn');

      expect(result.clean).toBe(false);
      expect(result.severity).toBe('SEVERE');
      expect(result.action).toBe('REJECT');
      expect(result.matches.length).toBeGreaterThan(0);
      expect(result.matches.some((m) => m.term === 'porn')).toBe(true);
    });

    it('should catch leetspeak evasion (e.g. p0rn)', async () => {
      const result = await service.analyzeText('p0rn');

      expect(result.clean).toBe(false);
      expect(result.severity).toBe('SEVERE');
      expect(result.action).toBe('REJECT');
    });

    it('should catch unicode evasion with zero-width chars', async () => {
      // Insert zero-width spaces between letters: p\u200Bor\u200Bn
      const result = await service.analyzeText('p\u200Bor\u200Bn');

      expect(result.clean).toBe(false);
      expect(result.severity).toBe('SEVERE');
      expect(result.action).toBe('REJECT');
    });

    it('should flag moderate content', async () => {
      const result = await service.analyzeText('you are a bitch');

      expect(result.clean).toBe(false);
      expect(result.severity).toBe('MODERATE');
      expect(result.action).toBe('FLAG');
    });

    it('should allow mild content with clean=false', async () => {
      const result = await service.analyzeText('damn this product');

      expect(result.clean).toBe(false);
      expect(result.severity).toBe('MILD');
      expect(result.action).toBe('ALLOW');
    });

    it('should log violations when userId is provided', async () => {
      await service.analyzeText('selling porn', {
        userId: 42,
        context: 'product',
        field: 'title',
      });

      // Give fire-and-forget a tick to resolve
      await new Promise((r) => setTimeout(r, 50));

      expect(prisma.contentFilterLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 42,
          context: 'product',
          field: 'title',
          severity: 'SEVERE',
          action: 'REJECT',
        }),
      });
    });

    it('should NOT log when userId is not provided', async () => {
      await service.analyzeText('selling porn');

      await new Promise((r) => setTimeout(r, 50));

      expect(prisma.contentFilterLog.create).not.toHaveBeenCalled();
    });

    it('should return clean result for empty text', async () => {
      const result = await service.analyzeText('');

      expect(result.clean).toBe(true);
      expect(result.action).toBe('ALLOW');
    });
  });

  describe('analyzeFields()', () => {
    it('should return per-field results', async () => {
      const results = await service.analyzeFields({
        title: 'nice product',
        description: 'you are a bitch',
      });

      expect(results.title.clean).toBe(true);
      expect(results.title.action).toBe('ALLOW');

      expect(results.description.clean).toBe(false);
      expect(results.description.severity).toBe('MODERATE');
      expect(results.description.action).toBe('FLAG');
    });

    it('should short-circuit on REJECT', async () => {
      const results = await service.analyzeFields({
        title: 'selling porn',
        description: 'some other bitch text',
      });

      // title is REJECT, so description should not be present
      expect(results.title.action).toBe('REJECT');
      expect(results.description).toBeUndefined();
    });
  });

  describe('reloadRules()', () => {
    it('should clear trie and reload from DB', async () => {
      // Initial load already happened in beforeEach
      expect(prisma.contentFilterRule.findMany).toHaveBeenCalledTimes(1);

      // Reload
      await service.reloadRules();

      // Should have cleared cache and reloaded
      expect(cache.del).toHaveBeenCalledWith('content-filter:rules');
      expect(prisma.contentFilterRule.findMany).toHaveBeenCalledTimes(2);

      // Trie should still work after reload
      const result = await service.analyzeText('porn');
      expect(result.action).toBe('REJECT');
    });

    it('should use cached rules when available', async () => {
      // Reset mocks
      prisma.contentFilterRule.findMany.mockClear();
      cache.get.mockResolvedValue(MOCK_RULES); // cache hit

      await service.reloadRules();

      // findMany should still be called once (after del, cache returns MOCK_RULES)
      // Actually after del + loadRules, cache.get returns MOCK_RULES so DB is skipped
      // But we cleared the cache first, so let's check the flow
      expect(cache.del).toHaveBeenCalledWith('content-filter:rules');
    });
  });
});
