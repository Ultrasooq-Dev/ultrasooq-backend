import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class SearchTokensBuilderService {
  private readonly logger = new Logger(SearchTokensBuilderService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build the searchTokens string for a single product by concatenating:
   *  1. Product name
   *  2. SKU number
   *  3. Short description (first 200 chars)
   *  4. Brand canonical name + all aliases from Brand.aliases (Json?)
   *  5. Category name + all aliases from Category.aliases (Json?)
   *
   * Brand.aliases and Category.aliases are Json? columns added in Task 1.
   * Both are handled gracefully when null/absent.
   */
  buildTokens(product: {
    productName: string;
    skuNo: string;
    shortDescription?: string | null;
    brand?: { brandName?: string | null; aliases?: unknown } | null;
    category?: { name?: string | null; aliases?: unknown } | null;
    productTags?: Array<{ productTagsTag?: { tagName?: string | null } | null }> | null;
  }): string {
    const parts: string[] = [];

    // 1. Product name (highest weight — appears first in tsvector)
    if (product.productName) parts.push(product.productName.trim());

    // 2. SKU
    if (product.skuNo) parts.push(product.skuNo.trim());

    // 3. Short description — first 200 chars
    if (product.shortDescription) {
      parts.push(product.shortDescription.slice(0, 200).trim());
    }

    // 4. Brand name + aliases
    if (product.brand) {
      if (product.brand.brandName) {
        parts.push(product.brand.brandName.trim());
      }
      const brandAliases = this.parseJsonArray(product.brand.aliases);
      for (const alias of brandAliases) {
        if (alias) parts.push(String(alias).trim());
      }
    }

    // 5. Category name + aliases
    if (product.category) {
      if (product.category.name) {
        parts.push(product.category.name.trim());
      }
      const categoryAliases = this.parseJsonArray(product.category.aliases);
      for (const alias of categoryAliases) {
        if (alias) parts.push(String(alias).trim());
      }
    }

    // 6. Product tags — improves search discoverability
    if (product.productTags?.length) {
      for (const pt of product.productTags) {
        const tagName = pt.productTagsTag?.tagName;
        if (tagName) parts.push(tagName.trim());
      }
    }

    return parts.filter(Boolean).join(' ');
  }

  /**
   * Build and persist searchTokens + search_vector for a single product.
   */
  async buildAndSave(productId: number): Promise<void> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        productName: true,
        skuNo: true,
        shortDescription: true,
        brand: {
          select: {
            brandName: true,
            aliases: true,
          },
        },
        category: {
          select: {
            name: true,
            aliases: true,
          },
        },
        productTags: {
          where: { status: 'ACTIVE', deletedAt: null },
          select: { productTagsTag: { select: { tagName: true } } },
        },
      },
    });

    if (!product) {
      this.logger.warn(`Product ${productId} not found`);
      return;
    }

    const tokens = this.buildTokens(product as Parameters<typeof this.buildTokens>[0]);

    if (!tokens) return;

    // Update searchTokens field (if it exists) and search_vector tsvector
    await this.prisma.$executeRawUnsafe(
      `UPDATE "Product" SET search_vector = to_tsvector('simple', $1) WHERE id = $2`,
      tokens,
      product.id,
    );
  }

  /**
   * Nightly cron at 03:00 — rebuild searchTokens + search_vector for ALL active products.
   */
  @Cron('0 0 3 * * *')
  async buildAll(): Promise<void> {
    this.logger.log('Starting nightly search tokens rebuild...');
    const start = Date.now();

    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        status: { not: 'DELETE' },
      },
      select: {
        id: true,
        productName: true,
        skuNo: true,
        shortDescription: true,
        brand: {
          select: {
            brandName: true,
            aliases: true,
          },
        },
        category: {
          select: {
            name: true,
            aliases: true,
          },
        },
        productTags: {
          where: { status: 'ACTIVE', deletedAt: null },
          select: { productTagsTag: { select: { tagName: true } } },
        },
      },
    });

    let updated = 0;
    let errors = 0;

    for (const product of products) {
      try {
        const tokens = this.buildTokens(product as Parameters<typeof this.buildTokens>[0]);
        if (!tokens) continue;

        await this.prisma.$executeRawUnsafe(
          `UPDATE "Product" SET search_vector = to_tsvector('simple', $1) WHERE id = $2`,
          tokens,
          product.id,
        );

        updated++;
      } catch (err) {
        errors++;
        this.logger.error(`Failed to update search tokens for productId=${product.id}`, err);
      }
    }

    this.logger.log(
      `Search tokens rebuild complete in ${Date.now() - start}ms — ` +
        `updated=${updated}, errors=${errors}`,
    );
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Safely parse a Json? column that is expected to be a string array.
   * Returns an empty array for null, non-array, or malformed values.
   */
  private parseJsonArray(value: unknown): string[] {
    if (value === null || value === undefined) return [];
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {
        // not valid JSON — ignore
      }
    }
    return [];
  }
}
