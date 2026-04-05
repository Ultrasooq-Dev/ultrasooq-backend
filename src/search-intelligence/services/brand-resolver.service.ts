import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

export interface BrandEntry {
  id: number;
  canonicalName: string;
}

@Injectable()
export class BrandResolverService implements OnModuleInit {
  private readonly logger = new Logger(BrandResolverService.name);

  /** lowercase alias/name → BrandEntry */
  private aliasMap = new Map<string, BrandEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.buildAliasMap();
  }

  // ── Rebuild every 30 minutes ──────────────────────────────────────────────

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handleCron() {
    await this.buildAliasMap();
  }

  // ── Build the alias map ───────────────────────────────────────────────────

  async buildAliasMap(): Promise<void> {
    const start = Date.now();

    const brands = await this.prisma.brand.findMany({
      where: { deletedAt: null, status: { not: 'DELETE' } },
      select: { id: true, brandName: true, aliases: true },
    });

    const newMap = new Map<string, BrandEntry>();

    for (const brand of brands) {
      if (!brand.brandName) continue;

      const entry: BrandEntry = {
        id: brand.id,
        canonicalName: brand.brandName,
      };

      // Index the canonical brand name (lowercase)
      newMap.set(brand.brandName.toLowerCase().trim(), entry);

      // Index all aliases from the JSON array
      if (brand.aliases && Array.isArray(brand.aliases)) {
        for (const alias of brand.aliases) {
          if (typeof alias === 'string' && alias.trim()) {
            newMap.set(alias.toLowerCase().trim(), entry);
          }
        }
      }
    }

    this.aliasMap = newMap;

    this.logger.log(
      `Brand alias map rebuilt: ${brands.length} brands, ${newMap.size} entries in ${Date.now() - start}ms`,
    );
  }

  // ── Resolve a single term ─────────────────────────────────────────────────

  resolve(term: string): BrandEntry | null {
    if (!term) return null;
    return this.aliasMap.get(term.toLowerCase().trim()) ?? null;
  }

  // ── Resolve brand from a tokenised query ──────────────────────────────────
  // Tries multi-word phrases first (4 → 3 → 2 → 1) to catch brands like
  // "Al Marai", "De'Longhi", "LG Electronics" etc.

  resolveFromQuery(
    words: string[],
  ): { brand: BrandEntry; matchedTokens: string[] } | null {
    if (!words.length) return null;

    const maxWindow = Math.min(4, words.length);

    for (let windowSize = maxWindow; windowSize >= 1; windowSize--) {
      for (let i = 0; i <= words.length - windowSize; i++) {
        const phrase = words
          .slice(i, i + windowSize)
          .join(' ')
          .toLowerCase()
          .trim();

        const entry = this.aliasMap.get(phrase);
        if (entry) {
          return {
            brand: entry,
            matchedTokens: words.slice(i, i + windowSize),
          };
        }
      }
    }

    return null;
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  getMapSize(): number {
    return this.aliasMap.size;
  }
}
