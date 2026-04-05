import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface UseCaseExpansion {
  specFilters: Record<string, unknown>;
  tagBoosts: string[];
  weight: number;
}

export interface DisambiguationResult {
  categoryId: number;
  meaning: string;
  priority: number;
}

export interface AccessoryResult {
  categoryId: number;
  strength: number;
}

@Injectable()
export class KnowledgeGraphService {
  private readonly logger = new Logger(KnowledgeGraphService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Use-case expansion ────────────────────────────────────────────────────
  // Given category IDs and a use-case phrase (e.g. "gaming", "outdoor"),
  // returns implied spec filters, tag boosts, and a confidence weight.

  async expandUseCase(
    categoryIds: number[],
    useCase: string,
  ): Promise<UseCaseExpansion | null> {
    if (!categoryIds.length || !useCase) return null;

    const mappings = await this.prisma.useCaseMapping.findMany({
      where: {
        categoryId: { in: categoryIds },
        useCase: { equals: useCase, mode: 'insensitive' },
        status: { not: 'DELETE' },
        deletedAt: null,
      },
      orderBy: { weight: 'desc' },
    });

    if (!mappings.length) return null;

    // Merge specs from all matching mappings (higher-weight first)
    const mergedSpecs: Record<string, unknown> = {};
    const mergedTags: string[] = [];
    let bestWeight = 0;

    for (const m of mappings) {
      const specs =
        m.impliedSpecs && typeof m.impliedSpecs === 'object'
          ? (m.impliedSpecs as Record<string, unknown>)
          : {};

      for (const [key, value] of Object.entries(specs)) {
        if (!(key in mergedSpecs)) {
          mergedSpecs[key] = value;
        }
      }

      if (m.impliedTags && Array.isArray(m.impliedTags)) {
        for (const tag of m.impliedTags) {
          if (typeof tag === 'string' && !mergedTags.includes(tag)) {
            mergedTags.push(tag);
          }
        }
      }

      const w = Number(m.weight);
      if (w > bestWeight) bestWeight = w;
    }

    return {
      specFilters: mergedSpecs,
      tagBoosts: mergedTags,
      weight: bestWeight,
    };
  }

  // ── Compatibility lookup ──────────────────────────────────────────────────
  // Find products compatible with a vehicle or device.

  async findCompatible(
    make: string,
    model: string,
    year?: number,
  ): Promise<number[]> {
    if (!make && !model) return [];

    const where: Record<string, unknown> = {
      status: { not: 'DELETE' },
      deletedAt: null,
    };

    // Try vehicle fields first, fall back to device fields
    const isVehicle = /^(toyota|honda|bmw|ford|chevrolet|nissan|hyundai|kia|mercedes|audi|volkswagen|mazda|subaru|lexus|jeep)/i.test(
      make,
    );

    if (isVehicle) {
      where.vehicleMake = { equals: make, mode: 'insensitive' };
      if (model) {
        where.vehicleModel = { equals: model, mode: 'insensitive' };
      }
      if (year) {
        where.yearFrom = { lte: year };
        where.yearTo = { gte: year };
      }
    } else {
      where.deviceBrand = { equals: make, mode: 'insensitive' };
      if (model) {
        where.deviceModel = { equals: model, mode: 'insensitive' };
      }
    }

    const rules = await this.prisma.compatibilityRule.findMany({
      where,
      select: { productId: true },
      take: 200,
    });

    // Deduplicate product IDs
    return [...new Set(rules.map((r) => r.productId))];
  }

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

  // ── Accessory suggestions ─────────────────────────────────────────────────
  // Given a category, find related accessory categories
  // (e.g. phone → phone case, screen protector).

  async getAccessories(categoryId: number): Promise<AccessoryResult[]> {
    if (!categoryId) return [];

    // Forward links: this category → accessories
    const forwardLinks = await this.prisma.accessoryLink.findMany({
      where: {
        sourceCategoryId: categoryId,
        status: { not: 'DELETE' },
        deletedAt: null,
      },
      select: { accessoryCategoryId: true, strength: true },
    });

    // Bidirectional reverse links: accessories → this category (where bidirectional=true)
    const reverseLinks = await this.prisma.accessoryLink.findMany({
      where: {
        accessoryCategoryId: categoryId,
        bidirectional: true,
        status: { not: 'DELETE' },
        deletedAt: null,
      },
      select: { sourceCategoryId: true, strength: true },
    });

    const resultMap = new Map<number, number>();

    for (const link of forwardLinks) {
      const s = Number(link.strength);
      const existing = resultMap.get(link.accessoryCategoryId) ?? 0;
      if (s > existing) resultMap.set(link.accessoryCategoryId, s);
    }

    for (const link of reverseLinks) {
      const s = Number(link.strength);
      const existing = resultMap.get(link.sourceCategoryId) ?? 0;
      if (s > existing) resultMap.set(link.sourceCategoryId, s);
    }

    return Array.from(resultMap.entries())
      .map(([categoryId, strength]) => ({ categoryId, strength }))
      .sort((a, b) => b.strength - a.strength);
  }
}
