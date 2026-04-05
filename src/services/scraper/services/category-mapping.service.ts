import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class CategoryMappingService {
  private readonly logger = new Logger(CategoryMappingService.name);
  private readonly redis: Redis;
  private ultrasooqCategories: Array<{ id: number; name: string; parentId: number | null; path: string }> = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    this.redis = new Redis({ host, port, lazyConnect: true });
  }

  /**
   * Load Ultrasooq category tree into memory for fast mapping
   */
  async loadUltrasooqCategories(): Promise<void> {
    const categories = await this.prisma.category.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      select: { id: true, name: true, parentId: true },
    });

    // Build paths
    const buildPath = (cat: typeof categories[0]): string => {
      const parts: string[] = [cat.name];
      let current = cat;
      while (current.parentId) {
        const parent = categories.find(c => c.id === current.parentId);
        if (!parent) break;
        parts.unshift(parent.name);
        current = parent;
      }
      return parts.join(' > ');
    };

    this.ultrasooqCategories = categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      parentId: cat.parentId,
      path: buildPath(cat),
    }));

    this.logger.log(`Loaded ${this.ultrasooqCategories.length} Ultrasooq categories`);
  }

  /**
   * Map a source platform category to an Ultrasooq category using AI
   */
  async mapCategory(sourcePlatform: string, sourcePath: string): Promise<{
    categoryId: number | null;
    confidence: number;
    reasoning: string;
    isNew: boolean;
  }> {
    // Check cache first
    const cached = await this.redis.get(`catmap:${sourcePlatform}:${sourcePath}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      return { ...parsed, isNew: false };
    }

    // Check DB
    const existing = await this.prisma.categoryMapping.findUnique({
      where: { sourcePlatform_sourcePath: { sourcePlatform, sourcePath } },
    });
    if (existing && existing.isVerified) {
      const result = {
        categoryId: existing.ultrasooqCategoryId,
        confidence: existing.confidence,
        reasoning: existing.aiReasoning || 'Verified mapping',
        isNew: false,
      };
      await this.redis.set(`catmap:${sourcePlatform}:${sourcePath}`, JSON.stringify(result), 'EX', 604800);
      return result;
    }

    // Load categories if not loaded
    if (this.ultrasooqCategories.length === 0) {
      await this.loadUltrasooqCategories();
    }

    // Use AI to map
    const aiResult = await this.callAICategoryMapping(sourcePlatform, sourcePath);

    // Save to DB
    await this.prisma.categoryMapping.upsert({
      where: { sourcePlatform_sourcePath: { sourcePlatform, sourcePath } },
      create: {
        sourcePlatform,
        sourcePath,
        ultrasooqCategoryId: aiResult.categoryId,
        confidence: aiResult.confidence,
        aiReasoning: aiResult.reasoning,
        isVerified: aiResult.confidence > 0.85,
      },
      update: {
        ultrasooqCategoryId: aiResult.categoryId,
        confidence: aiResult.confidence,
        aiReasoning: aiResult.reasoning,
      },
    });

    // Cache
    await this.redis.set(
      `catmap:${sourcePlatform}:${sourcePath}`,
      JSON.stringify(aiResult),
      'EX', 604800 // 7 days
    );

    return { ...aiResult, isNew: true };
  }

  /**
   * Batch map multiple categories
   */
  async mapCategoriesBatch(entries: Array<{ platform: string; path: string }>): Promise<Array<{
    platform: string;
    path: string;
    categoryId: number | null;
    confidence: number;
  }>> {
    const results = [];
    for (const entry of entries) {
      const result = await this.mapCategory(entry.platform, entry.path);
      results.push({
        platform: entry.platform,
        path: entry.path,
        categoryId: result.categoryId,
        confidence: result.confidence,
      });
    }
    return results;
  }

  /**
   * Get unverified mappings for human review
   */
  async getUnverifiedMappings(limit: number = 50): Promise<any[]> {
    return this.prisma.categoryMapping.findMany({
      where: { isVerified: false, ultrasooqCategoryId: { not: null } },
      orderBy: { productCount: 'desc' },
      take: limit,
      include: { category: { select: { id: true, name: true } } },
    });
  }

  /**
   * Verify a mapping (human review)
   */
  async verifyMapping(id: number, ultrasooqCategoryId: number): Promise<void> {
    await this.prisma.categoryMapping.update({
      where: { id },
      data: { ultrasooqCategoryId, isVerified: true },
    });

    // Invalidate cache
    const mapping = await this.prisma.categoryMapping.findUnique({ where: { id } });
    if (mapping) {
      await this.redis.del(`catmap:${mapping.sourcePlatform}:${mapping.sourcePath}`);
    }
  }

  private async callAICategoryMapping(sourcePlatform: string, sourcePath: string): Promise<{
    categoryId: number | null;
    confidence: number;
    reasoning: string;
  }> {
    const categoryList = this.ultrasooqCategories
      .map(c => `${c.id}: ${c.path}`)
      .join('\n');

    const prompt = `Map this ${sourcePlatform} category to the closest Ultrasooq category.

Source category: "${sourcePath}"

Available Ultrasooq categories:
${categoryList}

Return JSON: { "categoryId": <number or null>, "confidence": <0.0 to 1.0>, "reasoning": "<why>" }
If no good match exists, return categoryId: null with low confidence.`;

    try {
      const response = await fetch(this.configService.get('AI_TRANSLATION_URL', 'http://localhost:3000/api/v1/scraper/ai-translate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, type: 'category_mapping' }),
      });

      if (!response.ok) throw new Error(`AI API returned ${response.status}`);
      return await response.json();
    } catch (err) {
      this.logger.error(`AI category mapping failed for "${sourcePath}": ${err.message}`);
      return { categoryId: null, confidence: 0, reasoning: `AI error: ${err.message}` };
    }
  }
}
