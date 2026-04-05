/**
 * @file content-filter.controller.ts
 * @description Admin REST controller for managing content filter rules, reviewing
 *   violation logs, identifying risky users, and running dry-run text analysis.
 *
 * @module ContentFilterController
 *
 * @security All endpoints are protected by SuperAdminAuthGuard (ADMIN role only).
 *
 * @baseRoute /admin/content-filter
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody } from '@nestjs/swagger';
import { SuperAdminAuthGuard } from 'src/guards/SuperAdminAuthGuard';
import { ContentFilterService } from './content-filter.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFilterRuleDto } from './dto/create-filter-rule.dto';
import { UpdateFilterRuleDto } from './dto/update-filter-rule.dto';
import { FilterLogQueryDto } from './dto/filter-log-query.dto';

@ApiTags('Admin — Content Filter')
@ApiBearerAuth()
@UseGuards(SuperAdminAuthGuard)
@Controller('admin/content-filter')
export class ContentFilterController {
  constructor(
    private readonly filterService: ContentFilterService,
    private readonly prisma: PrismaService,
  ) {}

  // ──────────────────────────────────────────────
  // RULES
  // ──────────────────────────────────────────────

  /**
   * GET /admin/content-filter/rules
   * List all filter rules with pagination and optional filters.
   */
  @Get('rules')
  @ApiOperation({ summary: 'List content filter rules' })
  async listRules(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('category') category?: string,
    @Query('language') language?: string,
    @Query('severity') severity?: string,
    @Query('search') search?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (category) where.category = category;
    if (language) where.language = language;
    if (severity) where.severity = severity;
    if (search) {
      where.term = { contains: search, mode: 'insensitive' };
    }

    const [rules, total] = await Promise.all([
      this.prisma.contentFilterRule.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.contentFilterRule.count({ where }),
    ]);

    return {
      status: true,
      message: 'Rules fetched successfully',
      data: {
        rules,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    };
  }

  /**
   * POST /admin/content-filter/rules
   * Create a new filter rule and reload the in-memory trie.
   */
  @Post('rules')
  @ApiOperation({ summary: 'Create a content filter rule' })
  async createRule(@Body() dto: CreateFilterRuleDto) {
    const rule = await this.prisma.contentFilterRule.create({
      data: {
        term: dto.term,
        pattern: dto.pattern ?? null,
        category: dto.category,
        severity: dto.severity,
        language: dto.language ?? 'en',
        isActive: dto.isActive ?? true,
      },
    });

    await this.filterService.reloadRules();

    return {
      status: true,
      message: 'Rule created successfully',
      data: rule,
    };
  }

  /**
   * PATCH /admin/content-filter/rules/:id
   * Update an existing filter rule and reload the in-memory trie.
   */
  @Patch('rules/:id')
  @ApiOperation({ summary: 'Update a content filter rule' })
  async updateRule(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFilterRuleDto,
  ) {
    const rule = await this.prisma.contentFilterRule.update({
      where: { id },
      data: {
        ...(dto.term !== undefined && { term: dto.term }),
        ...(dto.pattern !== undefined && { pattern: dto.pattern }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.severity !== undefined && { severity: dto.severity }),
        ...(dto.language !== undefined && { language: dto.language }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    await this.filterService.reloadRules();

    return {
      status: true,
      message: 'Rule updated successfully',
      data: rule,
    };
  }

  /**
   * DELETE /admin/content-filter/rules/:id
   * Delete a filter rule and reload the in-memory trie.
   */
  @Delete('rules/:id')
  @ApiOperation({ summary: 'Delete a content filter rule' })
  async deleteRule(@Param('id', ParseIntPipe) id: number) {
    await this.prisma.contentFilterRule.delete({ where: { id } });
    await this.filterService.reloadRules();

    return {
      status: true,
      message: 'Rule deleted successfully',
      data: null,
    };
  }

  // ──────────────────────────────────────────────
  // DRY RUN TEST
  // ──────────────────────────────────────────────

  /**
   * POST /admin/content-filter/test
   * Analyze text without logging the result (dry run).
   */
  @Post('test')
  @ApiOperation({ summary: 'Dry-run text analysis (no logging)' })
  @ApiBody({ schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } })
  async testText(@Body('text') text: string) {
    // No userId → analyzeText will not log the violation
    const result = await this.filterService.analyzeText(text ?? '');

    return {
      status: true,
      message: 'Analysis complete (dry run — not logged)',
      data: result,
    };
  }

  // ──────────────────────────────────────────────
  // VIOLATIONS
  // ──────────────────────────────────────────────

  /**
   * GET /admin/content-filter/violations
   * Paginated list of all content filter violation logs with filters.
   */
  @Get('violations')
  @ApiOperation({ summary: 'List content filter violation logs' })
  async listViolations(@Query() query: FilterLogQueryDto) {
    const pageNum = Math.max(1, parseInt(query.page ?? '1', 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (query.userId) where.userId = parseInt(query.userId, 10);
    if (query.severity) where.severity = query.severity;
    if (query.context) where.context = { contains: query.context, mode: 'insensitive' };
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) where.createdAt.lte = new Date(query.endDate);
    }

    const [logs, total] = await Promise.all([
      this.prisma.contentFilterLog.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.contentFilterLog.count({ where }),
    ]);

    return {
      status: true,
      message: 'Violations fetched successfully',
      data: {
        logs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    };
  }

  // ──────────────────────────────────────────────
  // RISKY USERS
  // ──────────────────────────────────────────────

  /**
   * GET /admin/content-filter/users/risky
   * Users ranked by composite risk score (MILD×1 + MODERATE×3 + SEVERE×10).
   */
  @Get('users/risky')
  @ApiOperation({ summary: 'List users by risk score (highest first)' })
  async riskyUsers(
    @Query('limit') limit = '20',
    @Query('page') page = '1',
  ) {
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const offset = (pageNum - 1) * limitNum;

    const rows: any[] = await this.prisma.$queryRaw`
      SELECT
        l."userId",
        COUNT(*) AS "totalViolations",
        SUM(CASE WHEN l.severity = 'SEVERE'   THEN 1 ELSE 0 END) AS "severeCount",
        SUM(CASE WHEN l.severity = 'MODERATE' THEN 1 ELSE 0 END) AS "moderateCount",
        SUM(CASE WHEN l.severity = 'MILD'     THEN 1 ELSE 0 END) AS "mildCount",
        (
          SUM(CASE WHEN l.severity = 'MILD'     THEN 1 ELSE 0 END) * 1 +
          SUM(CASE WHEN l.severity = 'MODERATE' THEN 1 ELSE 0 END) * 3 +
          SUM(CASE WHEN l.severity = 'SEVERE'   THEN 1 ELSE 0 END) * 10
        ) AS "riskScore",
        u.email,
        u."firstName",
        u."lastName"
      FROM "ContentFilterLog" l
      LEFT JOIN "User" u ON u.id = l."userId"
      GROUP BY l."userId", u.email, u."firstName", u."lastName"
      ORDER BY "riskScore" DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `;

    // Convert BigInt fields to numbers for JSON serialization
    const data = rows.map((r) => ({
      userId: Number(r.userId),
      totalViolations: Number(r.totalViolations),
      severeCount: Number(r.severeCount),
      moderateCount: Number(r.moderateCount),
      mildCount: Number(r.mildCount),
      riskScore: Number(r.riskScore),
      email: r.email,
      firstName: r.firstName,
      lastName: r.lastName,
    }));

    return {
      status: true,
      message: 'Risky users fetched successfully',
      data: {
        users: data,
        pagination: { page: pageNum, limit: limitNum },
      },
    };
  }

  /**
   * GET /admin/content-filter/users/:userId/violations
   * All violation logs for a specific user.
   */
  @Get('users/:userId/violations')
  @ApiOperation({ summary: 'Get all violations for a specific user' })
  async userViolations(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      this.prisma.contentFilterLog.findMany({
        where: { userId },
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.contentFilterLog.count({ where: { userId } }),
    ]);

    return {
      status: true,
      message: `Violations for user ${userId} fetched successfully`,
      data: {
        logs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    };
  }

  // ──────────────────────────────────────────────
  // STATS / DASHBOARD
  // ──────────────────────────────────────────────

  /**
   * GET /admin/content-filter/stats
   * Dashboard summary: rule counts by category, violation counts (today / week),
   * and the top flagged categories.
   */
  @Get('stats')
  @ApiOperation({ summary: 'Content filter dashboard summary' })
  async stats() {
    const now = new Date();

    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const [
      rulesByCategory,
      totalRules,
      violationsToday,
      violationsThisWeek,
      topCategoriesRaw,
    ] = await Promise.all([
      // Rules grouped by category
      this.prisma.contentFilterRule.groupBy({
        by: ['category'],
        _count: { id: true },
        where: { isActive: true },
      }),
      // Total active rules
      this.prisma.contentFilterRule.count({ where: { isActive: true } }),
      // Violations today
      this.prisma.contentFilterLog.count({
        where: { createdAt: { gte: startOfToday } },
      }),
      // Violations this week
      this.prisma.contentFilterLog.count({
        where: { createdAt: { gte: startOfWeek } },
      }),
      // Top flagged categories (from logs — raw query for performance)
      // matchedTerms is a JSON array, so we unnest it with jsonb_array_elements_text
      this.prisma.$queryRaw<{ category: string; count: bigint }[]>`
        SELECT r.category, COUNT(*) AS count
        FROM "ContentFilterLog" l
        CROSS JOIN LATERAL jsonb_array_elements_text(l."matchedTerms"::jsonb) AS t(term)
        JOIN "ContentFilterRule" r ON r.term = t.term
        GROUP BY r.category
        ORDER BY count DESC
        LIMIT 10
      `,
    ]);

    const rulesByCategoryMap = rulesByCategory.reduce<Record<string, number>>(
      (acc, row) => {
        acc[row.category] = row._count.id;
        return acc;
      },
      {},
    );

    const topCategories = topCategoriesRaw.map((r) => ({
      category: r.category,
      count: Number(r.count),
    }));

    return {
      status: true,
      message: 'Stats fetched successfully',
      data: {
        rules: {
          total: totalRules,
          byCategory: rulesByCategoryMap,
        },
        violations: {
          today: violationsToday,
          thisWeek: violationsThisWeek,
        },
        topFlaggedCategories: topCategories,
      },
    };
  }
}
