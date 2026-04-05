import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SPEC_PATTERNS } from '../constants/spec-patterns';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExtractionResult {
  key: string;
  value: string;
  numericValue: number | null;
  confidence: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AttributeExtractorService {
  private readonly logger = new Logger(AttributeExtractorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run all SPEC_PATTERNS against text, return structured ExtractionResult[].
   * Each pattern is run against the original text (not consumed), so overlapping
   * patterns are all captured independently.
   */
  extractFromText(text: string): ExtractionResult[] {
    const results: ExtractionResult[] = [];

    for (const sp of SPEC_PATTERNS) {
      const match = text.match(sp.pattern);
      if (!match) continue;

      // match[1] is the capture group (the numeric/value part), match[0] is full match
      const rawValue = match[0].trim();
      const captureGroup = match[1]?.trim() ?? rawValue;

      // Try to parse a numeric value from the capture group
      const parsed = parseFloat(captureGroup);
      const numericValue = isNaN(parsed) ? null : parsed;

      // Confidence: if a unit is expected and present → 0.9, otherwise 0.7
      const confidence = sp.unit !== null ? 0.9 : 0.7;

      results.push({
        key: sp.key,
        value: rawValue,
        numericValue,
        confidence,
      });
    }

    return results;
  }

  /**
   * Load product, extract specs from its text fields, match against the
   * SpecTemplate for its primary category, then upsert into ProductSpecValue.
   *
   * Returns the number of spec values upserted.
   */
  async extractAndSave(productId: number): Promise<number> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        productName: true,
        description: true,
        shortDescription: true,
        specification: true,
        categoryId: true,
      },
    });

    if (!product) {
      this.logger.warn(`Product ${productId} not found`);
      return 0;
    }

    // Combine all text fields for extraction
    const combinedText = [
      product.productName ?? '',
      product.description ?? '',
      product.shortDescription ?? '',
      product.specification ?? '',
    ]
      .join(' ')
      .trim();

    if (!combinedText) return 0;

    const extracted = this.extractFromText(combinedText);
    if (extracted.length === 0) return 0;

    // Load SpecTemplates for this product's primary category
    if (!product.categoryId) return 0;

    const templates = await this.prisma.specTemplate.findMany({
      where: { categoryId: product.categoryId, status: 'ACTIVE' },
      select: { id: true, key: true, unit: true },
    });

    if (templates.length === 0) return 0;

    // Build a map: key → templateId
    const keyToTemplate = new Map(templates.map((t) => [t.key, t]));

    let upsertCount = 0;

    for (const ext of extracted) {
      const template = keyToTemplate.get(ext.key);
      if (!template) continue; // No matching template for this category

      await this.prisma.productSpecValue.upsert({
        where: {
          productId_specTemplateId: {
            productId: product.id,
            specTemplateId: template.id,
          },
        },
        update: {
          value: ext.value,
          numericValue: ext.numericValue ?? undefined,
          status: 'ACTIVE',
          deletedAt: null,
        },
        create: {
          productId: product.id,
          specTemplateId: template.id,
          value: ext.value,
          numericValue: ext.numericValue ?? undefined,
          status: 'ACTIVE',
        },
      });

      upsertCount++;
    }

    return upsertCount;
  }

  /**
   * Batch-process all products in a category.
   * Returns a summary of how many products were processed and how many
   * spec values were extracted/upserted across all of them.
   *
   * TODO: AI fallback via MCP/OpenRouter for products where regex extraction
   *       yields zero results (e.g. unstructured Arabic descriptions). The AI
   *       call would send the combined text to the configured vision/text model
   *       and parse a JSON spec map from the response.
   */
  async batchExtract(
    categoryId: number,
    limit = 500,
  ): Promise<{ processed: number; extracted: number }> {
    this.logger.log(`Batch extracting specs for categoryId=${categoryId}, limit=${limit}`);

    const products = await this.prisma.product.findMany({
      where: {
        categoryId,
        deletedAt: null,
        status: { not: 'DELETE' },
      },
      select: { id: true },
      take: limit,
    });

    let processed = 0;
    let extracted = 0;

    for (const product of products) {
      try {
        const count = await this.extractAndSave(product.id);
        processed++;
        extracted += count;
      } catch (err) {
        this.logger.error(`Failed to extract specs for productId=${product.id}`, err);
      }
    }

    this.logger.log(
      `Batch done — processed=${processed}, extracted=${extracted} spec values`,
    );

    return { processed, extracted };
  }
}
