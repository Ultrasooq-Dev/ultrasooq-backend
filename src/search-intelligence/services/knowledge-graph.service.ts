// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface DisambiguationResult {
  categoryId: number;
  meaning: string;
  priority: number;
}

@Injectable()
export class KnowledgeGraphService {
  private readonly logger = new Logger(KnowledgeGraphService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Term disambiguation ───────────────────────────────────────────────────
  // Disambiguate a term like "mouse" → [{categoryId: electronics, meaning: "computer mouse"},
  // {categoryId: pets, meaning: "pet mouse"}], optionally boosted by user's category history.

  async disambiguate(
    term: string,
    userCategoryHistory?: number[],
  ): Promise<DisambiguationResult[]> {
    if (!term) return [];

    const rows = await this.prisma.termDisambiguation.findMany({
      where: {
        term: { equals: term, mode: 'insensitive' },
        status: { not: 'DELETE' },
        deletedAt: null,
      },
      orderBy: { priority: 'desc' },
    });

    if (!rows.length) return [];

    let results: DisambiguationResult[] = rows.map((r) => ({
      categoryId: r.categoryId,
      meaning: r.resolvedMeaning,
      priority: r.priority,
    }));

    // Boost categories that appear in user's browsing history
    if (userCategoryHistory?.length) {
      const historySet = new Set(userCategoryHistory);

      results = results.map((r) => ({
        ...r,
        priority: historySet.has(r.categoryId) ? r.priority + 100 : r.priority,
      }));

      results.sort((a, b) => b.priority - a.priority);
    }

    return results;
  }
}
