import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DidYouMeanService {
  constructor(private prisma: PrismaService) {}

  /**
   * Suggests an alternative search term when results are sparse.
   * Uses PostgreSQL pg_trgm similarity() against ProductSearch entries that received clicks.
   *
   * @param query The user's original search query
   * @param resultCount How many results the original query returned
   * @returns A suggested search term, or null if no good suggestion exists
   */
  /**
   * Suggests an alternative search term when results are sparse.
   * If similarity > 0.7, auto-corrects transparently.
   */
  async suggest(
    query: string,
    resultCount: number,
  ): Promise<string | null> {
    if (resultCount > 3) return null;

    try {
      const suggestion = await this.prisma.$queryRawUnsafe<
        Array<{ searchTerm: string; sim: number }>
      >(
        `SELECT DISTINCT "searchTerm", similarity("searchTerm", $1) as sim
         FROM "ProductSearch"
         WHERE clicked = true AND similarity("searchTerm", $1) > 0.3 AND "searchTerm" != $1
         ORDER BY sim DESC LIMIT 1`,
        query,
      );

      return suggestion[0]?.searchTerm || null;
    } catch {
      return null;
    }
  }

  /**
   * Auto-correct: returns corrected term if similarity > 0.7 (high confidence).
   * Used to transparently rewrite queries before search execution.
   */
  async autoCorrect(query: string): Promise<{ corrected: string | null; original: string }> {
    try {
      const suggestion = await this.prisma.$queryRawUnsafe<
        Array<{ searchTerm: string; sim: number }>
      >(
        `SELECT DISTINCT "searchTerm", similarity("searchTerm", $1) as sim
         FROM "ProductSearch"
         WHERE clicked = true AND similarity("searchTerm", $1) > 0.7 AND "searchTerm" != $1
         ORDER BY sim DESC LIMIT 1`,
        query,
      );

      const corrected = suggestion[0]?.searchTerm || null;
      return { corrected, original: query };
    } catch {
      return { corrected: null, original: query };
    }
  }
}
