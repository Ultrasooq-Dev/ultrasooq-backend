// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    this.redis = new Redis({ host, port, lazyConnect: true });
  }

  /**
   * Translate a batch of scraped products from Chinese to English.
   * Uses AI Gateway (Claude) for high-quality translation.
   * Falls back to cached translations for repeated terms.
   */
  async translateBatch(productIds: string[]): Promise<{ translated: number; failed: number }> {
    let translated = 0;
    let failed = 0;

    // Fetch raw products
    const products = await this.prisma.scrapedProductRaw.findMany({
      where: { id: { in: productIds }, status: 'RAW' },
    });

    if (products.length === 0) return { translated: 0, failed: 0 };

    // Mark as translating
    await this.prisma.scrapedProductRaw.updateMany({
      where: { id: { in: products.map(p => p.id) } },
      data: { status: 'TRANSLATING' },
    });

    // Build translation payload
    const toTranslate = products.map(p => {
      const raw = p.rawData as any;
      return {
        id: p.id,
        productName: raw.productName || p.productName,
        description: raw.description,
        specifications: raw.specifications,
        brand: raw.brandName,
        variants: raw.variants,
        seller: raw.seller,
        shipping: raw.shipping,
      };
    });

    try {
      // Call AI Gateway for translation (batch of up to 50)
      const translatedResults = await this.callAITranslation(toTranslate);

      for (const result of translatedResults) {
        try {
          const original = products.find(p => p.id === result.id);
          if (!original) continue;

          const rawData = original.rawData as any;
          const translatedData = {
            ...rawData,
            productName: result.productName || rawData.productName,
            description: result.description || rawData.description,
            specifications: result.specifications || rawData.specifications,
            brandName: result.brand || rawData.brandName,
            variants: result.variants || rawData.variants,
            seller: result.seller || rawData.seller,
            shipping: result.shipping || rawData.shipping,
          };

          await this.prisma.scrapedProductRaw.update({
            where: { id: result.id },
            data: {
              status: 'TRANSLATED',
              productNameEn: result.productName || (original.productName),
              translatedData,
              translatedAt: new Date(),
            },
          });

          // Cache translated product name for future lookups
          if (original.productName && result.productName) {
            await this.redis.set(
              `trans:${original.productName}`,
              result.productName,
              'EX', 2592000 // 30 days
            );
          }

          translated++;
        } catch (err) {
          this.logger.error(`Failed to save translation for product ${result.id}: ${err.message}`);
          await this.prisma.scrapedProductRaw.update({
            where: { id: result.id },
            data: { status: 'FAILED' },
          });
          failed++;
        }
      }
    } catch (err) {
      this.logger.error(`Batch translation failed: ${err.message}`);
      // Revert to RAW status
      await this.prisma.scrapedProductRaw.updateMany({
        where: { id: { in: products.map(p => p.id) } },
        data: { status: 'RAW' },
      });
      failed = products.length;
    }

    return { translated, failed };
  }

  /**
   * Call AI Gateway for batch translation.
   * Uses structured prompt for consistent JSON output.
   */
  private async callAITranslation(items: any[]): Promise<any[]> {
    // Use fetch to call our own backend API or external AI Gateway
    // This will be replaced with proper AI SDK integration when the module is wired
    const prompt = `You are a professional e-commerce product translator. Translate the following ${items.length} Chinese product entries to English.

Rules:
- Preserve brand names exactly (do NOT translate brand names)
- Convert sizes to international standards (cm, inches, etc.)
- Keep technical terminology accurate
- Translate specification keys AND values
- Return a JSON array with the same structure, each item having an "id" field matching the input

Products to translate:
${JSON.stringify(items, null, 2)}

Return ONLY a valid JSON array.`;

    try {
      const response = await fetch(this.configService.get('AI_TRANSLATION_URL', 'http://localhost:3000/api/v1/scraper/ai-translate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, items }),
      });

      if (!response.ok) {
        throw new Error(`AI translation API returned ${response.status}`);
      }

      const data = await response.json();
      return Array.isArray(data) ? data : data.translations || [];
    } catch (err) {
      this.logger.error(`AI translation call failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get cached translation for a term
   */
  async getCachedTranslation(term: string): Promise<string | null> {
    return this.redis.get(`trans:${term}`);
  }

  /**
   * Get translation stats
   */
  async getStats(): Promise<{ pending: number; translated: number; failed: number }> {
    const [pending, translated, failed] = await Promise.all([
      this.prisma.scrapedProductRaw.count({ where: { status: 'RAW' } }),
      this.prisma.scrapedProductRaw.count({ where: { status: 'TRANSLATED' } }),
      this.prisma.scrapedProductRaw.count({ where: { status: 'FAILED' } }),
    ]);
    return { pending, translated, failed };
  }
}