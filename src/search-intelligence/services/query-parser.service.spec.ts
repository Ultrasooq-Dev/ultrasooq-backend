import { Test, TestingModule } from '@nestjs/testing';
import { QueryParserService } from './query-parser.service';
import { CategoryIndexService } from './category-index.service';

// ─── Mock CategoryIndexService ────────────────────────────────────────────────

const mockCategoryIndex = {
  resolveCategory: jest.fn().mockReturnValue([]),
  resolveBrand: jest.fn().mockReturnValue(null),
  isCompoundProduct: jest.fn().mockReturnValue(false),
  isBrandProductPattern: jest.fn().mockReturnValue(false),
};

// ─── Helper ───────────────────────────────────────────────────────────────────

async function buildService(overrides: Partial<typeof mockCategoryIndex> = {}) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      QueryParserService,
      { provide: CategoryIndexService, useValue: { ...mockCategoryIndex, ...overrides } },
    ],
  }).compile();

  return module.get<QueryParserService>(QueryParserService);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('QueryParserService', () => {
  let service: QueryParserService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = await buildService();
  });

  // 1. Single product
  describe('single product query', () => {
    it('returns type=single with 1 subQuery for "wireless headphones"', () => {
      const result = service.parse('wireless headphones');

      expect(result.type).toBe('single');
      expect(result.subQueries).toHaveLength(1);
      expect(result.subQueries[0].term).toBe('wireless headphones');
      expect(result.language).toBe('en');
      expect(result.originalQuery).toBe('wireless headphones');
    });

    it('sets intent to direct_match for a plain product name', () => {
      const result = service.parse('laptop bag');
      expect(result.subQueries[0].intent).toBe('direct_match');
    });
  });

  // 2. Comma-separated → multi
  describe('comma-separated query', () => {
    it('returns type=multi with 3 subQueries for "filter, oil, apple"', () => {
      const result = service.parse('filter, oil, apple');

      expect(result.type).toBe('multi');
      expect(result.subQueries).toHaveLength(3);
      expect(result.subQueries[0].term).toBe('filter');
      expect(result.subQueries[1].term).toBe('oil');
      expect(result.subQueries[2].term).toBe('apple');
    });

    it('preserves the original query string', () => {
      const result = service.parse('monitor, keyboard, mouse');
      expect(result.originalQuery).toBe('monitor, keyboard, mouse');
    });
  });

  // 3. Shopping list with quantities
  describe('shopping list', () => {
    it('returns type=shopping_list with quantities for "10 USB cables, 5 keyboards"', () => {
      const result = service.parse('10 USB cables, 5 keyboards');

      expect(result.type).toBe('shopping_list');
      expect(result.subQueries).toHaveLength(2);

      const usbQuery = result.subQueries[0];
      expect(usbQuery.quantity).toBe(10);
      expect(usbQuery.term).toMatch(/usb cables/i);

      const keyboardQuery = result.subQueries[1];
      expect(keyboardQuery.quantity).toBe(5);
      expect(keyboardQuery.term).toMatch(/keyboards/i);
    });

    it('extracts "x10" trailing quantity', () => {
      const result = service.parse('USB cable x10, HDMI cable x3');

      // Trailing x-quantity style is comma-separated; type is 'multi'
      // (shopping_list requires leading-number style like "10 USB cables")
      expect(result.type).toBe('multi');
      expect(result.subQueries[0].quantity).toBe(10);
      expect(result.subQueries[1].quantity).toBe(3);
    });
  });

  // 4. Price extraction
  describe('price extraction', () => {
    it('extracts priceMax for "headphones under $200"', () => {
      const result = service.parse('headphones under $200');

      expect(result.type).toBe('single');
      expect(result.subQueries[0].priceMax).toBe(200);
      expect(result.subQueries[0].priceMin).toBeNull();
    });

    it('extracts priceMin for "laptop over $500"', () => {
      const result = service.parse('laptop over $500');
      expect(result.subQueries[0].priceMin).toBe(500);
      expect(result.subQueries[0].priceMax).toBeNull();
    });

    it('extracts price range for "$100-$300 headphones"', () => {
      const result = service.parse('$100-$300 headphones');
      expect(result.subQueries[0].priceMin).toBe(100);
      expect(result.subQueries[0].priceMax).toBe(300);
    });
  });

  // 5. Spec extraction
  describe('spec extraction', () => {
    it('extracts storage and display_type specs for "phone 256GB AMOLED"', () => {
      const result = service.parse('phone 256GB AMOLED');

      expect(result.subQueries[0].specs).toHaveProperty('storage');
      expect(result.subQueries[0].specs).toHaveProperty('display_type');
    });

    it('sets intent to spec_filter when specs are found', () => {
      const result = service.parse('monitor 144Hz 4K');
      expect(result.subQueries[0].intent).toBe('spec_filter');
    });

    it('removes spec tokens from term', () => {
      const result = service.parse('phone 256GB AMOLED');
      expect(result.subQueries[0].term).not.toMatch(/256GB/i);
      expect(result.subQueries[0].term).not.toMatch(/AMOLED/i);
    });
  });

  // 6. Brand-product pattern → single
  describe('brand-product pattern', () => {
    it('returns type=single for "apple macbook air" when isBrandProductPattern=true', async () => {
      service = await buildService({
        isBrandProductPattern: jest.fn().mockReturnValue(true),
        isCompoundProduct: jest.fn().mockReturnValue(false),
      });

      // Without the brand-pattern guard the "and"-splitter would not apply here,
      // but the important thing is: "apple macbook air" has no comma / "and",
      // so it falls straight through to single.
      const result = service.parse('apple macbook air');

      expect(result.type).toBe('single');
      expect(result.subQueries).toHaveLength(1);
    });

    it('does NOT split "bread and butter" when isCompoundProduct returns true', async () => {
      service = await buildService({
        isCompoundProduct: jest.fn().mockReturnValue(true),
        isBrandProductPattern: jest.fn().mockReturnValue(false),
      });

      const result = service.parse('bread and butter');
      // Should stay as single because compound product check prevents splitting
      expect(result.type).toBe('single');
      expect(result.subQueries).toHaveLength(1);
    });
  });

  // 7. Arabic language detection
  describe('language detection', () => {
    it('detects Arabic for "سماعات لاسلكية"', () => {
      const result = service.parse('سماعات لاسلكية');

      expect(result.language).toBe('ar');
      expect(result.type).toBe('single');
      expect(result.subQueries).toHaveLength(1);
    });

    it('detects Chinese for Chinese characters', () => {
      const result = service.parse('无线耳机');
      expect(result.language).toBe('zh');
    });

    it('treats non-Latin scripts as single query without splitting', () => {
      // Arabic text that has comma in it should still be treated as single
      const result = service.parse('سماعات, لاسلكية');
      expect(result.language).toBe('ar');
      expect(result.type).toBe('single');
    });
  });

  // 8. "and" separator
  describe('"and" separator splitting', () => {
    it('splits "cables and keyboards and monitors" into 3 subQueries', async () => {
      service = await buildService({
        isBrandProductPattern: jest.fn().mockReturnValue(false),
        isCompoundProduct: jest.fn().mockReturnValue(false),
      });

      const result = service.parse('cables and keyboards and monitors');

      expect(result.type).toBe('multi');
      expect(result.subQueries).toHaveLength(3);
      expect(result.subQueries[0].term).toBe('cables');
      expect(result.subQueries[1].term).toBe('keyboards');
      expect(result.subQueries[2].term).toBe('monitors');
    });

    it('does not split a single "and" phrase that is a brand-product pattern', async () => {
      service = await buildService({
        isBrandProductPattern: jest.fn().mockReturnValue(true),
        isCompoundProduct: jest.fn().mockReturnValue(false),
      });

      const result = service.parse('bread and butter');
      expect(result.type).toBe('single');
    });
  });

  // 9. Numbered list
  describe('numbered list', () => {
    it('splits "1. apples 2. bananas 3. oranges" into 3 subQueries', () => {
      const result = service.parse('1. apples 2. bananas 3. oranges');

      expect(result.type).toBe('multi');
      expect(result.subQueries).toHaveLength(3);
      expect(result.subQueries[0].term).toBe('apples');
      expect(result.subQueries[1].term).toBe('bananas');
      expect(result.subQueries[2].term).toBe('oranges');
    });
  });

  // 10. General structure
  describe('output structure', () => {
    it('always includes all required ParsedQuery fields', () => {
      const result = service.parse('test query');

      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('subQueries');
      expect(result).toHaveProperty('originalQuery');
      expect(result).toHaveProperty('language');
    });

    it('always includes all required ParsedSubQuery fields', () => {
      const result = service.parse('test query');
      const sub = result.subQueries[0];

      expect(sub).toHaveProperty('raw');
      expect(sub).toHaveProperty('term');
      expect(sub).toHaveProperty('quantity');
      expect(sub).toHaveProperty('priceMin');
      expect(sub).toHaveProperty('priceMax');
      expect(sub).toHaveProperty('specs');
      expect(sub).toHaveProperty('intent');
      expect(sub).toHaveProperty('confidence');
    });

    it('confidence is between 0 and 1', () => {
      const cases = [
        'laptop',
        'laptop 256GB under $1000',
        'phone 128GB AMOLED 5G',
        'gaming headphones for competitive play',
      ];
      for (const c of cases) {
        const result = service.parse(c);
        for (const sub of result.subQueries) {
          expect(sub.confidence).toBeGreaterThanOrEqual(0);
          expect(sub.confidence).toBeLessThanOrEqual(1);
        }
      }
    });
  });
});
