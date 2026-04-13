import { Injectable, Logger } from '@nestjs/common';
import { KnowledgeGraphService, DisambiguationResult } from './knowledge-graph.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface DisambiguationOutput {
  meanings: Array<{ categoryId: number; meaning: string; priority: number }>;
  bestGuess: number | null;
}

@Injectable()
export class DisambiguationService {
  private readonly logger = new Logger(DisambiguationService.name);

  constructor(
    private readonly knowledgeGraph: KnowledgeGraphService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Disambiguate a term using the knowledge graph, boosted by user browsing history.
   *
   * @example
   *   disambiguate("mouse")        → meanings: [{ categoryId: 5, meaning: "computer mouse" }, ...]
   *   disambiguate("mouse", 123)   → boosts "computer mouse" if user recently browsed electronics
   *
   * @param term - The ambiguous search term
   * @param userId - Optional logged-in user ID for personalization
   * @returns Ranked meanings with a bestGuess categoryId
   */
  async disambiguate(term: string, userId?: number): Promise<DisambiguationOutput> {
    if (!term || term.trim().length === 0) {
      return { meanings: [], bestGuess: null };
    }

    // 1. Get all meanings from knowledge graph
    const meanings: DisambiguationResult[] =
      await this.knowledgeGraph.disambiguate(term);

    if (meanings.length <= 1) {
      return {
        meanings,
        bestGuess: meanings[0]?.categoryId ?? null,
      };
    }

    // 2. If user is logged in, check their recent category browsing
    let userCategories: number[] = [];
    if (userId) {
      try {
        const recent = await this.prisma.productView.findMany({
          where: { userId },
          select: { product: { select: { categoryId: true } } },
          orderBy: { lastViewedAt: 'desc' },
          take: 20,
        });
        userCategories = recent
          .map((r) => r.product?.categoryId)
          .filter((id): id is number => id != null);
      } catch (err) {
        this.logger.warn(
          `Failed to fetch user browsing history for userId=${userId}: ${err}`,
        );
        // Continue without user context — non-fatal
      }
    }

    // 3. Boost meanings matching user's browsing history
    const userCategorySet = new Set(userCategories);
    const boosted = meanings
      .map((m) => ({
        ...m,
        priority: m.priority + (userCategorySet.has(m.categoryId) ? 10 : 0),
      }))
      .sort((a, b) => b.priority - a.priority);

    this.logger.debug(
      `Disambiguated "${term}": ${boosted.length} meanings, bestGuess=${boosted[0]?.categoryId}` +
        (userCategories.length > 0
          ? ` (boosted by ${userCategories.length} user categories)`
          : ''),
    );

    return {
      meanings: boosted,
      bestGuess: boosted[0]?.categoryId ?? null,
    };
  }
}
