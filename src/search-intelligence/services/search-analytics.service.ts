import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface SearchLogData {
  query: string;
  parsedType: string; // 'single' | 'multi' | 'shopping_list' | 'browse'
  language: string;
  resultCount: number;
  userId?: number;
  deviceId?: string;
  resolvedBrandId?: number;
  resolvedCategoryIds?: number[];
  intent?: string;
  didYouMean?: string;
  responseTimeMs: number;
}

@Injectable()
export class SearchAnalyticsService {
  private readonly logger = new Logger(SearchAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log a search event. Fire-and-forget — errors are caught and logged, never thrown.
   */
  async logSearch(data: SearchLogData): Promise<void> {
    try {
      await this.prisma.productSearch.create({
        data: {
          searchTerm: data.query,
          userId: data.userId ?? null,
          deviceId: data.deviceId ?? null,
          clicked: false,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to log search: ${err}`);
      // Fire and forget — search logging must never break the search response
    }
  }

  /**
   * Get the most popular search terms over a time window.
   *
   * @param days - Look-back window in days (default 30)
   * @param limit - Max results to return (default 50)
   */
  async getTopSearches(
    days = 30,
    limit = 50,
  ): Promise<Array<{ term: string; count: number }>> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await this.prisma.$queryRawUnsafe<
      Array<{ term: string; count: bigint }>
    >(
      `SELECT "searchTerm" as term, COUNT(*)::bigint as count
       FROM "ProductSearch"
       WHERE "createdAt" >= $1
         AND "searchTerm" IS NOT NULL
         AND "searchTerm" != ''
       GROUP BY "searchTerm"
       ORDER BY count DESC
       LIMIT $2`,
      since,
      limit,
    );

    return result.map((r) => ({ term: r.term, count: Number(r.count) }));
  }

  /**
   * Get queries that were searched multiple times but never resulted in a click.
   * These represent potential catalog gaps or poor search relevance.
   *
   * @param days - Look-back window in days (default 7)
   * @param limit - Max results to return (default 20)
   */
  async getZeroResultQueries(
    days = 7,
    limit = 20,
  ): Promise<string[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await this.prisma.$queryRawUnsafe<Array<{ term: string }>>(
      `SELECT "searchTerm" as term
       FROM "ProductSearch"
       WHERE "createdAt" >= $1 AND clicked = false
       GROUP BY "searchTerm"
       HAVING COUNT(*) >= 3
       ORDER BY COUNT(*) DESC
       LIMIT $2`,
      since,
      limit,
    );

    return result.map((r) => r.term);
  }
}
