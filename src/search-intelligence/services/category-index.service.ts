import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

export interface CategoryMatch {
  categoryId: number;
  parentId: number | null;
  score: number;
}

@Injectable()
export class CategoryIndexService implements OnModuleInit {
  private readonly logger = new Logger(CategoryIndexService.name);

  /** term (lowercase) → list of category IDs */
  termToCategories: Map<string, number[]> = new Map();

  /** brand name (lowercase) → brand ID */
  brandNameToId: Map<string, number> = new Map();

  /** known multi-word product phrases e.g. "olive oil", "usb cable" */
  compoundProducts: Set<string> = new Set();

  /** known brand+product combos e.g. "apple macbook" */
  brandProductPatterns: Set<string> = new Set();

  /** internal: categoryId → parentId */
  private categoryParent: Map<number, number | null> = new Map();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.rebuild();
  }

  @Cron('0 */30 * * * *')
  async rebuild(): Promise<void> {
    this.logger.log('Rebuilding category index...');
    const start = Date.now();

    try {
      const [categories, brands, products] = await Promise.all([
        this.prisma.category.findMany({
          where: { status: 'ACTIVE', deletedAt: null },
          select: { id: true, name: true, parentId: true },
        }),
        this.prisma.brand.findMany({
          where: { status: 'ACTIVE', deletedAt: null },
          select: { id: true, brandName: true },
        }),
        this.prisma.product.findMany({
          where: { status: 'ACTIVE', deletedAt: null },
          select: { productName: true, brandId: true },
          orderBy: { productViewCount: 'desc' },
          take: 1000,
        }),
      ]);

      // --- Build termToCategories ---
      const newTermToCategories: Map<string, number[]> = new Map();
      const newCategoryParent: Map<number, number | null> = new Map();

      for (const cat of categories) {
        newCategoryParent.set(cat.id, cat.parentId ?? null);

        if (!cat.name) continue;

        // Index each significant word
        const words = cat.name
          .toLowerCase()
          .split(/[\s\-_/,]+/)
          .filter((w) => w.length > 2);

        for (const word of words) {
          const existing = newTermToCategories.get(word) ?? [];
          if (!existing.includes(cat.id)) {
            existing.push(cat.id);
          }
          newTermToCategories.set(word, existing);
        }

        // Also index the full name (lowercased)
        const fullName = cat.name.toLowerCase().trim();
        if (fullName) {
          const existing = newTermToCategories.get(fullName) ?? [];
          if (!existing.includes(cat.id)) {
            existing.push(cat.id);
          }
          newTermToCategories.set(fullName, existing);
        }
      }

      // --- Build brandNameToId ---
      const newBrandNameToId: Map<string, number> = new Map();
      const brandIdToName: Map<number, string> = new Map();

      for (const brand of brands) {
        if (!brand.brandName) continue;
        const key = brand.brandName.toLowerCase().trim();
        newBrandNameToId.set(key, brand.id);
        brandIdToName.set(brand.id, key);
      }

      // --- Build compound products + brand-product patterns ---
      const newCompoundProducts: Set<string> = new Set();
      const newBrandProductPatterns: Set<string> = new Set();

      for (const product of products) {
        if (!product.productName) continue;

        const nameLower = product.productName.toLowerCase().trim();
        const words = nameLower.split(/\s+/).filter((w) => w.length > 1);

        // Any product with 2–4 words is a potential compound product
        if (words.length >= 2 && words.length <= 4) {
          // Store the full phrase
          newCompoundProducts.add(nameLower);

          // Store bigrams
          for (let i = 0; i < words.length - 1; i++) {
            newCompoundProducts.add(`${words[i]} ${words[i + 1]}`);
          }
        }

        // If we know the brand, store brand+remaining pattern
        if (product.brandId) {
          const brandName = brandIdToName.get(product.brandId);
          if (brandName) {
            newBrandProductPatterns.add(`${brandName} ${nameLower}`);
            // Also store brand + first non-brand word combo
            const withoutBrand = nameLower.replace(brandName, '').trim();
            const firstWords = withoutBrand.split(/\s+/).slice(0, 2).join(' ').trim();
            if (firstWords) {
              newBrandProductPatterns.add(`${brandName} ${firstWords}`);
            }
          }
        }
      }

      // Atomically swap
      this.termToCategories = newTermToCategories;
      this.brandNameToId = newBrandNameToId;
      this.compoundProducts = newCompoundProducts;
      this.brandProductPatterns = newBrandProductPatterns;
      this.categoryParent = newCategoryParent;

      this.logger.log(
        `Category index rebuilt in ${Date.now() - start}ms — ` +
          `${newTermToCategories.size} terms, ` +
          `${newBrandNameToId.size} brands, ` +
          `${newCompoundProducts.size} compound products, ` +
          `${newBrandProductPatterns.size} brand patterns`,
      );
    } catch (err) {
      this.logger.error('Failed to rebuild category index', err);
    }
  }

  /**
   * Returns categories matching the given term (exact match first, then word match).
   */
  resolveCategory(term: string): CategoryMatch[] {
    const key = term.toLowerCase().trim();
    const ids = this.termToCategories.get(key) ?? [];
    return ids.map((id) => ({
      categoryId: id,
      parentId: this.categoryParent.get(id) ?? null,
      score: 1.0,
    }));
  }

  /**
   * Returns the brand ID for a given term, or null if not found.
   */
  resolveBrand(term: string): number | null {
    return this.brandNameToId.get(term.toLowerCase().trim()) ?? null;
  }

  /**
   * Returns true if the two-word string is a known compound product.
   */
  isCompoundProduct(twoWords: string): boolean {
    return this.compoundProducts.has(twoWords.toLowerCase().trim());
  }

  /**
   * Returns true if the given word sequence starts with a known brand
   * followed by a known product pattern.
   */
  isBrandProductPattern(words: string[]): boolean {
    if (words.length < 2) return false;

    const full = words.join(' ').toLowerCase();
    if (this.brandProductPatterns.has(full)) return true;

    // Check if first word is a brand and rest is a known compound / category
    const firstWord = words[0].toLowerCase();
    if (this.brandNameToId.has(firstWord)) {
      const rest = words.slice(1).join(' ').toLowerCase();
      if (this.compoundProducts.has(rest)) return true;
      if (this.termToCategories.has(rest)) return true;
    }

    return false;
  }
}
