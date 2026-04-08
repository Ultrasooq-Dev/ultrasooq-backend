import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SearchMiningService {
  private readonly logger = new Logger(SearchMiningService.name);

  constructor(private prisma: PrismaService) {}

  @Cron('0 0 6 * * *') // 06:00 daily
  async mineSearchLogs(): Promise<void> {
    this.logger.log('Mining search logs...');

    // 1. Find zero-click queries (searched but never clicked)
    const zeroClicks = await this.findZeroClickQueries();
    this.logger.log(`Zero-click queries: ${zeroClicks.length}`);

    // 2. Find top converting queries (high click rate)
    const topConverting = await this.findTopConvertingQueries();
    this.logger.log(`Top converting: ${topConverting.length}`);

    // 3. Refresh popular_searches materialized view
    await this.refreshPopularSearches();
    this.logger.log('Popular searches refreshed');
  }

  async findZeroClickQueries(days = 7): Promise<Array<{ term: string; searchCount: number }>> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    try {
      return await this.prisma.$queryRawUnsafe(`
        SELECT "searchTerm" as term, COUNT(*)::int as "searchCount"
        FROM "ProductSearch"
        WHERE "createdAt" >= $1
          AND clicked = false
          AND "searchTerm" IS NOT NULL
          AND "searchTerm" != ''
        GROUP BY "searchTerm"
        HAVING COUNT(*) >= 3
        ORDER BY COUNT(*) DESC
        LIMIT 50
      `, since);
    } catch { return []; }
  }

  async findTopConvertingQueries(days = 30): Promise<Array<{ term: string; clicks: number; searches: number; ctr: number }>> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    try {
      return await this.prisma.$queryRawUnsafe(`
        SELECT "searchTerm" as term,
          SUM(CASE WHEN clicked = true THEN 1 ELSE 0 END)::int as clicks,
          COUNT(*)::int as searches,
          ROUND(SUM(CASE WHEN clicked = true THEN 1 ELSE 0 END)::decimal / NULLIF(COUNT(*), 0) * 100, 1) as ctr
        FROM "ProductSearch"
        WHERE "createdAt" >= $1
          AND "searchTerm" IS NOT NULL
          AND "searchTerm" != ''
        GROUP BY "searchTerm"
        HAVING COUNT(*) >= 5
        ORDER BY ctr DESC
        LIMIT 50
      `, since);
    } catch { return []; }
  }

  async refreshPopularSearches(): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY popular_searches`);
    } catch {
      // View might not support CONCURRENTLY, try without
      try {
        await this.prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW popular_searches`);
      } catch {} // View might not exist
    }
  }
}
