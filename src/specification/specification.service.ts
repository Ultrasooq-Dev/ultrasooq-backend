/**
 * @module SpecificationService
 * @description Business logic for specification templates and product spec values.
 *   Manages the lifecycle of spec templates per category, product spec values,
 *   and generates filterable facets for the frontend filter sidebar.
 * @dependencies PrismaService, CacheService
 * @routes Used by SpecificationController
 */
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService, CACHE_KEYS, CACHE_TTL } from '../cache/cache.service';
import { CreateSpecTemplateDto, UpdateSpecTemplateDto, BulkCreateSpecTemplateDto } from './dto/create-spec-template.dto';
import { CreateSpecValuesDto, UpdateSpecValueDto } from './dto/create-spec-value.dto';
import { Prisma } from '../generated/prisma/client';

@Injectable()
export class SpecificationService {
  private readonly logger = new Logger(SpecificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  // ══════════════════════════════════════════════
  // SPEC TEMPLATES — CRUD
  // ══════════════════════════════════════════════

  /**
   * Create a new spec template for a category.
   * @param dto - Template data including categoryId, name, key, dataType, etc.
   * @returns Created template
   */
  async createTemplate(dto: CreateSpecTemplateDto) {
    // Verify category exists
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) throw new NotFoundException(`Category ${dto.categoryId} not found`);

    const template = await this.prisma.specTemplate.create({
      data: {
        categoryId: dto.categoryId,
        name: dto.name,
        key: dto.key,
        dataType: dto.dataType as any || 'TEXT',
        unit: dto.unit,
        options: dto.options ? dto.options.join(',') : undefined,
        isRequired: dto.isRequired ?? false,
        isFilterable: dto.isFilterable ?? true,
        sortOrder: dto.sortOrder ?? 0,
        groupName: dto.groupName,
      },
    });

    // Invalidate cache
    await this.cacheService.del(CACHE_KEYS.CATEGORY_SPECS(dto.categoryId));
    await this.cacheService.del(CACHE_KEYS.FILTER_VALUES(dto.categoryId));

    return { ...template, options: template.options ? template.options.split(',') : null };
  }

  /**
   * Bulk create spec templates for a category.
   */
  async bulkCreateTemplates(dto: BulkCreateSpecTemplateDto) {
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) throw new NotFoundException(`Category ${dto.categoryId} not found`);

    const results = [];
    for (const tmpl of dto.templates) {
      try {
        const template = await this.prisma.specTemplate.create({
          data: {
            categoryId: dto.categoryId,
            name: tmpl.name,
            key: tmpl.key,
            dataType: (tmpl.dataType as any) || 'TEXT',
            unit: tmpl.unit,
            options: tmpl.options ? tmpl.options.join(',') : undefined,
            isRequired: tmpl.isRequired ?? false,
            isFilterable: tmpl.isFilterable ?? true,
            sortOrder: tmpl.sortOrder ?? 0,
            groupName: tmpl.groupName,
          },
        });
        results.push({ ...template, options: template.options ? template.options.split(',') : null });
      } catch (error) {
        this.logger.warn(`Skipping duplicate template ${tmpl.key} for category ${dto.categoryId}`);
      }
    }

    await this.cacheService.del(CACHE_KEYS.CATEGORY_SPECS(dto.categoryId));
    await this.cacheService.del(CACHE_KEYS.FILTER_VALUES(dto.categoryId));

    return results;
  }

  /**
   * Get all spec templates for a category (cached).
   * Parent categories inherit specs from all descendant categories (bottom-up aggregation).
   * Each template includes `inherited: boolean` and `sourceCategory` info.
   */
  async getTemplatesByCategory(categoryId: number) {
    return this.cacheService.getOrSet(
      CACHE_KEYS.CATEGORY_SPECS(categoryId),
      async () => {
        // Get all descendant category IDs (parent inherits child specs)
        const allCategoryIds = await this.getAllDescendantCategoryIds(categoryId);

        const templates = await this.prisma.specTemplate.findMany({
          where: {
            categoryId: { in: allCategoryIds },
            status: 'ACTIVE',
            deletedAt: null,
          },
          include: {
            category: { select: { id: true, name: true } },
          },
          orderBy: [{ groupName: 'asc' }, { sortOrder: 'asc' }],
        });

        // Add inherited flag: true if the template belongs to a descendant, not this category
        return templates.map((t) => ({
          ...t,
          options: t.options ? t.options.split(',') : null,
          inherited: t.categoryId !== categoryId,
          sourceCategory: t.category,
        }));
      },
      CACHE_TTL.CATEGORY_SPECS,
    );
  }

  /**
   * Get templates for multiple categories (for multi-category products).
   */
  async getTemplatesForCategories(categoryIds: number[]) {
    const templates = await this.prisma.specTemplate.findMany({
      where: {
        categoryId: { in: categoryIds },
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: { category: { select: { id: true, name: true } } },
      orderBy: [{ categoryId: 'asc' }, { groupName: 'asc' }, { sortOrder: 'asc' }],
    });

    // Group by category
    const grouped: Record<number, any[]> = {};
    for (const t of templates) {
      if (!grouped[t.categoryId]) grouped[t.categoryId] = [];
      grouped[t.categoryId].push({ ...t, options: t.options ? t.options.split(',') : null });
    }
    return grouped;
  }

  /**
   * Update a spec template.
   */
  async updateTemplate(id: number, dto: UpdateSpecTemplateDto) {
    const template = await this.prisma.specTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException(`SpecTemplate ${id} not found`);

    const updated = await this.prisma.specTemplate.update({
      where: { id },
      data: {
        ...dto,
        options: dto.options ? dto.options.join(',') : undefined,
      },
    });

    await this.cacheService.del(CACHE_KEYS.CATEGORY_SPECS(template.categoryId));
    await this.cacheService.del(CACHE_KEYS.FILTER_VALUES(template.categoryId));

    return { ...updated, options: updated.options ? updated.options.split(',') : null };
  }

  /**
   * Soft-delete a spec template.
   */
  async deleteTemplate(id: number) {
    const template = await this.prisma.specTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException(`SpecTemplate ${id} not found`);

    await this.prisma.specTemplate.update({
      where: { id },
      data: { status: 'DELETE', deletedAt: new Date() },
    });

    await this.cacheService.del(CACHE_KEYS.CATEGORY_SPECS(template.categoryId));
    await this.cacheService.del(CACHE_KEYS.FILTER_VALUES(template.categoryId));

    return { message: 'Template deleted successfully' };
  }

  // ══════════════════════════════════════════════
  // SPEC VALUES — Product fills template fields
  // ══════════════════════════════════════════════

  /**
   * Set spec values for a product (upsert pattern).
   */
  async setSpecValues(dto: CreateSpecValuesDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) throw new NotFoundException(`Product ${dto.productId} not found`);

    const results = [];
    for (const val of dto.values) {
      const specValue = await this.prisma.productSpecValue.upsert({
        where: {
          productId_specTemplateId: {
            productId: dto.productId,
            specTemplateId: val.specTemplateId,
          },
        },
        update: {
          value: val.value,
          numericValue: val.numericValue !== undefined ? val.numericValue : undefined,
          status: 'ACTIVE',
          deletedAt: null,
        },
        create: {
          productId: dto.productId,
          specTemplateId: val.specTemplateId,
          value: val.value,
          numericValue: val.numericValue !== undefined ? val.numericValue : undefined,
        },
      });
      results.push(specValue);
    }

    // Invalidate product cache and filter caches
    await this.cacheService.invalidateProduct(dto.productId);

    return results;
  }

  /**
   * Get all spec values for a product (with template info).
   */
  async getSpecValues(productId: number) {
    return this.prisma.productSpecValue.findMany({
      where: {
        productId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: {
        specTemplate: {
          select: {
            id: true,
            name: true,
            key: true,
            dataType: true,
            unit: true,
            options: true,
            groupName: true,
            isFilterable: true,
          },
        },
      },
      orderBy: {
        specTemplate: { sortOrder: 'asc' },
      },
    });
  }

  /**
   * Update a single spec value.
   */
  async updateSpecValue(id: number, dto: UpdateSpecValueDto) {
    const specValue = await this.prisma.productSpecValue.findUnique({
      where: { id },
      include: { specTemplate: true },
    });
    if (!specValue) throw new NotFoundException(`ProductSpecValue ${id} not found`);

    return this.prisma.productSpecValue.update({
      where: { id },
      data: {
        value: dto.value,
        numericValue: dto.numericValue !== undefined ? dto.numericValue : undefined,
      },
    });
  }

  // ══════════════════════════════════════════════
  // FILTERS — Generate filterable facets for UI
  // ══════════════════════════════════════════════

  /**
   * Get filterable specs with distinct values/ranges for a category.
   * This powers the frontend filter sidebar.
   * Returns: { filters: [{ key, name, dataType, unit, range?, options?, counts? }] }
   */
  async getFilters(categoryId: number) {
    return this.cacheService.getOrSet(
      CACHE_KEYS.FILTER_VALUES(categoryId),
      async () => this.buildFilters(categoryId),
      CACHE_TTL.FILTER_VALUES,
    );
  }

  /**
   * Recursively collect all descendant category IDs (including the given one).
   * If the category has children, walk down the tree; otherwise return just this ID.
   */
  private async getAllDescendantCategoryIds(categoryId: number): Promise<number[]> {
    const ids: number[] = [categoryId];
    const children = await this.prisma.category.findMany({
      where: { parentId: categoryId, deletedAt: null },
      select: { id: true },
    });
    for (const child of children) {
      const descendantIds = await this.getAllDescendantCategoryIds(child.id);
      ids.push(...descendantIds);
    }
    return ids;
  }

  private async buildFilters(categoryId: number) {
    // Get all descendant category IDs (parent inherits child specs)
    const allCategoryIds = await this.getAllDescendantCategoryIds(categoryId);

    // Get all filterable templates for this category and all its descendants
    const templates = await this.prisma.specTemplate.findMany({
      where: {
        categoryId: { in: allCategoryIds },
        isFilterable: true,
        status: 'ACTIVE',
        deletedAt: null,
      },
      orderBy: [{ groupName: 'asc' }, { sortOrder: 'asc' }],
    });

    // Deduplicate templates by key — same spec key across child categories should be merged
    const templatesByKey = new Map<string, typeof templates>();
    for (const t of templates) {
      if (!templatesByKey.has(t.key)) {
        templatesByKey.set(t.key, []);
      }
      templatesByKey.get(t.key)!.push(t);
    }

    const filters = [];

    // Iterate deduplicated keys — each key may map to multiple template IDs across child categories
    for (const [key, keyTemplates] of templatesByKey) {
      // Use the first template for metadata (name, dataType, unit, groupName)
      const representative = keyTemplates[0];
      const templateIds = keyTemplates.map((t) => t.id);

      // Merge SELECT options from all templates with the same key
      const mergedOptions = new Set<string>();
      for (const t of keyTemplates) {
        if (t.options && typeof t.options === 'string') {
          for (const opt of t.options.split(',')) {
            if (opt.trim()) mergedOptions.add(opt.trim());
          }
        }
      }

      const filter: any = {
        key: representative.key,
        name: representative.name,
        dataType: representative.dataType,
        unit: representative.unit,
        groupName: representative.groupName,
      };

      if (representative.dataType === 'NUMBER') {
        // Get min/max range across all template IDs with this key
        const agg = await this.prisma.productSpecValue.aggregate({
          where: {
            specTemplateId: { in: templateIds },
            status: 'ACTIVE',
            numericValue: { not: null },
          },
          _min: { numericValue: true },
          _max: { numericValue: true },
          _count: true,
        });
        filter.range = {
          min: agg._min.numericValue ? Number(agg._min.numericValue) : 0,
          max: agg._max.numericValue ? Number(agg._max.numericValue) : 0,
        };
        filter.count = agg._count;
      } else if (representative.dataType === 'SELECT' || representative.dataType === 'MULTI_SELECT') {
        // Get distinct values with counts across all template IDs
        const values = await this.prisma.productSpecValue.groupBy({
          by: ['value'],
          where: {
            specTemplateId: { in: templateIds },
            status: 'ACTIVE',
            value: { not: null },
          },
          _count: true,
          orderBy: { _count: { value: 'desc' } },
          take: 50,
        });
        // Combine DB values with template-defined options
        const allOptions = new Set<string>(mergedOptions);
        for (const v of values) {
          if (v.value) allOptions.add(v.value);
        }
        filter.options = Array.from(allOptions);
        filter.counts = {};
        for (const v of values) {
          if (v.value) filter.counts[v.value] = v._count;
        }
      } else if (representative.dataType === 'BOOLEAN') {
        const values = await this.prisma.productSpecValue.groupBy({
          by: ['value'],
          where: {
            specTemplateId: { in: templateIds },
            status: 'ACTIVE',
          },
          _count: true,
        });
        filter.options = values.map((v) => v.value);
        filter.counts = {};
        for (const v of values) {
          if (v.value) filter.counts[v.value] = v._count;
        }
      } else {
        // TEXT — get top values across all template IDs
        const values = await this.prisma.productSpecValue.groupBy({
          by: ['value'],
          where: {
            specTemplateId: { in: templateIds },
            status: 'ACTIVE',
            value: { not: null },
          },
          _count: true,
          orderBy: { _count: { value: 'desc' } },
          take: 20,
        });
        filter.topValues = values.map((v) => v.value);
        filter.counts = {};
        for (const v of values) {
          if (v.value) filter.counts[v.value] = v._count;
        }
      }

      filters.push(filter);
    }

    return { filters };
  }

  // ══════════════════════════════════════════════
  // CATEGORY KEYWORDS — For auto-categorization
  // ══════════════════════════════════════════════

  /**
   * Add keywords to a category for auto-categorization.
   */
  async addCategoryKeywords(categoryId: number, keywords: string[]) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });
    if (!category) throw new NotFoundException(`Category ${categoryId} not found`);

    const results = [];
    for (const keyword of keywords) {
      try {
        const kw = await this.prisma.categoryKeyword.create({
          data: {
            categoryId,
            keyword: keyword.toLowerCase().trim(),
          },
        });
        results.push(kw);
      } catch (error) {
        // Skip duplicates
        this.logger.warn(`Skipping duplicate keyword "${keyword}" for category ${categoryId}`);
      }
    }
    return results;
  }

  /**
   * Get keywords for a category.
   */
  async getCategoryKeywords(categoryId: number) {
    return this.prisma.categoryKeyword.findMany({
      where: { categoryId, status: 'ACTIVE', deletedAt: null },
      orderBy: { keyword: 'asc' },
    });
  }

  /**
   * Match product text against category keywords to suggest categories.
   */
  async matchCategories(text: string): Promise<{ categoryId: number; categoryName: string; matchedKeywords: string[] }[]> {
    const words = text.toLowerCase().split(/[\s,.\-_\/]+/).filter(w => w.length > 2);

    if (words.length === 0) return [];

    // Find all matching keywords
    const matches = await this.prisma.categoryKeyword.findMany({
      where: {
        keyword: { in: words },
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: {
        category: { select: { id: true, name: true } },
      },
    });

    // Group by category
    const categoryMap = new Map<number, { categoryId: number; categoryName: string; matchedKeywords: string[] }>();
    for (const match of matches) {
      const existing = categoryMap.get(match.categoryId);
      if (existing) {
        existing.matchedKeywords.push(match.keyword);
      } else {
        categoryMap.set(match.categoryId, {
          categoryId: match.categoryId,
          categoryName: match.category.name,
          matchedKeywords: [match.keyword],
        });
      }
    }

    // Sort by number of matched keywords (most relevant first)
    return Array.from(categoryMap.values()).sort(
      (a, b) => b.matchedKeywords.length - a.matchedKeywords.length,
    );
  }

  // ══════════════════════════════════════════════
  // PRODUCT CATEGORY MAP — Multi-category support
  // ══════════════════════════════════════════════

  /**
   * Set categories for a product (replaces existing).
   */
  async setProductCategories(productId: number, categoryIds: number[], primaryCategoryId?: number) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException(`Product ${productId} not found`);

    // Remove existing mappings
    await this.prisma.productCategoryMap.deleteMany({
      where: { productId },
    });

    // Create new mappings
    const primary = primaryCategoryId || categoryIds[0];
    const maps = categoryIds.map((catId) => ({
      productId,
      categoryId: catId,
      isPrimary: catId === primary,
      source: 'manual',
    }));

    await this.prisma.productCategoryMap.createMany({
      data: maps,
    });

    // Update Product.categoryId to primary for backward compat
    await this.prisma.product.update({
      where: { id: productId },
      data: { categoryId: primary },
    });

    // Invalidate caches
    await this.cacheService.invalidateProduct(productId);
    for (const catId of categoryIds) {
      await this.cacheService.del(CACHE_KEYS.FILTER_VALUES(catId));
    }

    return this.getProductCategories(productId);
  }

  /**
   * Get all categories for a product.
   */
  async getProductCategories(productId: number) {
    return this.prisma.productCategoryMap.findMany({
      where: { productId, status: 'ACTIVE', deletedAt: null },
      include: {
        category: { select: { id: true, name: true, parentId: true, icon: true } },
      },
      orderBy: { isPrimary: 'desc' },
    });
  }

  /**
   * Auto-categorize a product based on its tags first, then fallback to keyword matching.
   */
  async autoCategorize(productId: number) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        productTags: { include: { productTagsTag: true } },
      },
    });
    if (!product) throw new NotFoundException(`Product ${productId} not found`);

    // 1. Try tag-based matching first (primary strategy)
    const tagIds = (product.productTags as any[])
      .map((pt: any) => pt.productTagsTag?.id)
      .filter(Boolean);

    if (tagIds.length > 0) {
      const tagMatches = await this.matchCategoriesByTags(tagIds);
      if (tagMatches.length > 0) {
        for (const match of tagMatches.slice(0, 5)) {
          try {
            await this.prisma.productCategoryMap.create({
              data: {
                productId,
                categoryId: match.categoryId,
                isPrimary: false,
                source: 'tag',
              },
            });
          } catch {
            // Skip if already mapped
          }
        }
        return tagMatches;
      }
    }

    // 2. Fallback to keyword-based matching
    const text = [
      product.productName,
      product.description,
      product.shortDescription,
      ...(product.productTags as any[]).map((pt: any) => pt.productTagsTag?.tagName).filter(Boolean),
    ].join(' ');

    const matches = await this.matchCategories(text);

    if (matches.length > 0) {
      for (const match of matches.slice(0, 5)) {
        try {
          await this.prisma.productCategoryMap.create({
            data: {
              productId,
              categoryId: match.categoryId,
              isPrimary: false,
              source: 'keyword',
            },
          });
        } catch {
          // Skip if already mapped
        }
      }
    }

    return matches;
  }

  // ══════════════════════════════════════════════
  // CATEGORY TAGS — Tags as universal connectors
  // ══════════════════════════════════════════════

  /**
   * Add tags to a category.
   */
  async addCategoryTags(categoryId: number, tagIds: number[]) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException(`Category ${categoryId} not found`);

    const results = [];
    for (const tagId of tagIds) {
      try {
        const ct = await this.prisma.categoryTag.create({
          data: { categoryId, tagId },
          include: { tag: { select: { id: true, tagName: true } } },
        });
        results.push(ct);
      } catch (error) {
        this.logger.warn(`Skipping duplicate tag ${tagId} for category ${categoryId}`);
      }
    }

    await this.cacheService.del(CACHE_KEYS.CATEGORY_TAGS(categoryId));
    return results;
  }

  /**
   * Get tags for a category (cached).
   */
  async getCategoryTags(categoryId: number) {
    return this.cacheService.getOrSet(
      CACHE_KEYS.CATEGORY_TAGS(categoryId),
      async () => {
        // Get tags from this category AND all descendant categories
        const allCategoryIds = await this.getAllDescendantCategoryIds(categoryId);
        const categoryTags = await this.prisma.categoryTag.findMany({
          where: { categoryId: { in: allCategoryIds }, status: 'ACTIVE', deletedAt: null },
          include: { tag: { select: { id: true, tagName: true } } },
          orderBy: { createdAt: 'asc' },
        });
        // Deduplicate by tag ID
        const seen = new Set<number>();
        return categoryTags.filter((ct) => {
          if (ct.tag && !seen.has(ct.tag.id)) {
            seen.add(ct.tag.id);
            return true;
          }
          return false;
        });
      },
      CACHE_TTL.CATEGORY_TAGS,
    );
  }

  /**
   * Remove a tag from a category.
   */
  async removeCategoryTag(categoryId: number, tagId: number) {
    await this.prisma.categoryTag.deleteMany({
      where: { categoryId, tagId },
    });
    await this.cacheService.del(CACHE_KEYS.CATEGORY_TAGS(categoryId));
    return { message: 'Tag removed from category' };
  }

  /**
   * Replace all tags for a category.
   */
  async setCategoryTags(categoryId: number, tagIds: number[]) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException(`Category ${categoryId} not found`);

    // Remove existing tags
    await this.prisma.categoryTag.deleteMany({ where: { categoryId } });

    // Create new tags
    if (tagIds.length > 0) {
      await this.prisma.categoryTag.createMany({
        data: tagIds.map((tagId) => ({ categoryId, tagId })),
        skipDuplicates: true,
      });
    }

    await this.cacheService.del(CACHE_KEYS.CATEGORY_TAGS(categoryId));

    return this.getCategoryTags(categoryId);
  }

  // ══════════════════════════════════════════════
  // TAG CRUD — Enhanced tag management
  // ══════════════════════════════════════════════

  /**
   * List tags with pagination.
   */
  async listTags(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [tags, total] = await Promise.all([
      this.prisma.tags.findMany({
        where: { status: 'ACTIVE', deletedAt: null },
        orderBy: { tagName: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.tags.count({
        where: { status: 'ACTIVE', deletedAt: null },
      }),
    ]);

    return {
      data: tags,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Search tags by name.
   */
  async searchTags(query: string, limit: number = 20) {
    return this.prisma.tags.findMany({
      where: {
        tagName: { contains: query, mode: 'insensitive' },
        status: 'ACTIVE',
        deletedAt: null,
      },
      orderBy: { tagName: 'asc' },
      take: limit,
    });
  }

  /**
   * Get a tag with usage info.
   */
  async getTagById(tagId: number) {
    const tag = await this.prisma.tags.findUnique({
      where: { id: tagId },
      include: {
        categoryTags: {
          where: { status: 'ACTIVE', deletedAt: null },
          include: { category: { select: { id: true, name: true, parentId: true } } },
        },
        tagProductTags: {
          where: { status: 'ACTIVE' },
          select: { id: true, productId: true },
          take: 10,
        },
        serviceTags: {
          select: { id: true, serviceId: true },
          take: 10,
        },
        userBranchBusinessType: {
          select: { id: true, userBranchId: true },
          take: 10,
        },
      },
    });
    if (!tag) throw new NotFoundException(`Tag ${tagId} not found`);
    return tag;
  }

  /**
   * Update a tag's name.
   */
  async updateTag(tagId: number, data: { tagName: string }) {
    const tag = await this.prisma.tags.findUnique({ where: { id: tagId } });
    if (!tag) throw new NotFoundException(`Tag ${tagId} not found`);

    return this.prisma.tags.update({
      where: { id: tagId },
      data: { tagName: data.tagName },
    });
  }

  /**
   * Soft-delete a tag.
   */
  async deleteTag(tagId: number) {
    const tag = await this.prisma.tags.findUnique({ where: { id: tagId } });
    if (!tag) throw new NotFoundException(`Tag ${tagId} not found`);

    await this.prisma.tags.update({
      where: { id: tagId },
      data: { status: 'DELETE', deletedAt: new Date() },
    });

    return { message: 'Tag deleted successfully' };
  }

  // ══════════════════════════════════════════════
  // TAG-BASED AUTO-CATEGORIZATION
  // ══════════════════════════════════════════════

  /**
   * Match tag IDs to categories via CategoryTag.
   * Returns categories sorted by number of shared tags (most relevant first).
   */
  async matchCategoriesByTags(tagIds: number[]): Promise<{ categoryId: number; categoryName: string; matchedTagIds: number[]; matchCount: number }[]> {
    if (tagIds.length === 0) return [];

    const matches = await this.prisma.categoryTag.findMany({
      where: {
        tagId: { in: tagIds },
        status: 'ACTIVE',
        deletedAt: null,
      },
      include: {
        category: { select: { id: true, name: true } },
      },
    });

    // Group by category
    const categoryMap = new Map<number, { categoryId: number; categoryName: string; matchedTagIds: number[]; matchCount: number }>();
    for (const match of matches) {
      const existing = categoryMap.get(match.categoryId);
      if (existing) {
        existing.matchedTagIds.push(match.tagId);
        existing.matchCount++;
      } else {
        categoryMap.set(match.categoryId, {
          categoryId: match.categoryId,
          categoryName: match.category.name,
          matchedTagIds: [match.tagId],
          matchCount: 1,
        });
      }
    }

    return Array.from(categoryMap.values()).sort((a, b) => b.matchCount - a.matchCount);
  }

  // ══════════════════════════════════════════════
  // SERVICE CATEGORIES — Multi-category for services
  // ══════════════════════════════════════════════

  /**
   * Set categories for a service (replaces existing).
   */
  async setServiceCategories(serviceId: number, categoryIds: number[], primaryCategoryId?: number) {
    const service = await this.prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) throw new NotFoundException(`Service ${serviceId} not found`);

    // Remove existing mappings
    await this.prisma.serviceCategoryMap.deleteMany({ where: { serviceId } });

    // Create new mappings
    const primary = primaryCategoryId || categoryIds[0];
    if (categoryIds.length > 0) {
      await this.prisma.serviceCategoryMap.createMany({
        data: categoryIds.map((catId) => ({
          serviceId,
          categoryId: catId,
          isPrimary: catId === primary,
          source: 'manual',
        })),
      });
    }

    // Update Service.categoryId to primary for backward compat
    if (primary) {
      await this.prisma.service.update({
        where: { id: serviceId },
        data: { categoryId: primary },
      });
    }

    return this.getServiceCategories(serviceId);
  }

  /**
   * Get all categories for a service.
   */
  async getServiceCategories(serviceId: number) {
    return this.prisma.serviceCategoryMap.findMany({
      where: { serviceId, status: 'ACTIVE', deletedAt: null },
      include: {
        category: { select: { id: true, name: true, parentId: true, icon: true } },
      },
      orderBy: { isPrimary: 'desc' },
    });
  }

  /**
   * Auto-categorize a service based on its tags.
   */
  async autoCategorizeService(serviceId: number) {
    const service = await this.prisma.service.findUnique({
      where: { id: serviceId },
      include: {
        serviceTags: { include: { tag: true } },
      },
    });
    if (!service) throw new NotFoundException(`Service ${serviceId} not found`);

    const tagIds = (service.serviceTags as any[])
      .map((st: any) => st.tag?.id)
      .filter(Boolean);

    if (tagIds.length === 0) return [];

    const tagMatches = await this.matchCategoriesByTags(tagIds);

    if (tagMatches.length > 0) {
      for (const match of tagMatches.slice(0, 5)) {
        try {
          await this.prisma.serviceCategoryMap.create({
            data: {
              serviceId,
              categoryId: match.categoryId,
              isPrimary: false,
              source: 'tag',
            },
          });
        } catch {
          // Skip if already mapped
        }
      }
    }

    return tagMatches;
  }

  /**
   * AI-powered product categorization from product name.
   *
   * Flow:
   * 1. Split product name into words
   * 2. Search Tags table for matching tags
   * 3. Use matched tags to find categories via categoryTag
   * 4. Fallback to keyword-based matching via categoryKeyword
   * 5. Build full category paths (categoryLocation)
   * 6. Return suggested tags + categories
   */
  async aiCategorizeFromName(productName: string) {
    const words = productName
      .toLowerCase()
      .split(/[\s,.\-_\/]+/)
      .filter((w) => w.length > 2);

    if (words.length === 0) {
      return { suggestedTags: [], suggestedCategories: [] };
    }

    // 1. Find matching tags by searching each word against tag names
    const tagResults = await this.prisma.tags.findMany({
      where: {
        OR: words.map((word) => ({
          tagName: { contains: word, mode: 'insensitive' as const },
        })),
        status: 'ACTIVE',
        deletedAt: null,
      },
      take: 20,
      orderBy: { tagName: 'asc' },
    });

    const suggestedTags = tagResults.map((tag) => ({
      id: tag.id,
      tagName: tag.tagName,
    }));

    // 2. Use tag IDs to find matching categories via categoryTag
    const tagIds = tagResults.map((t) => t.id);
    let categoryMatches: {
      categoryId: number;
      categoryName: string;
      matchedTagIds?: number[];
      matchedKeywords?: string[];
      matchCount?: number;
    }[] = [];

    if (tagIds.length > 0) {
      const tagBasedMatches = await this.matchCategoriesByTags(tagIds);
      categoryMatches = tagBasedMatches.map((m) => ({
        categoryId: m.categoryId,
        categoryName: m.categoryName,
        matchedTagIds: m.matchedTagIds,
        matchCount: m.matchCount,
      }));
    }

    // 3. Fallback: keyword-based matching if no tag-based matches found
    if (categoryMatches.length === 0) {
      const keywordMatches = await this.matchCategories(productName);
      categoryMatches = keywordMatches.map((m) => ({
        categoryId: m.categoryId,
        categoryName: m.categoryName,
        matchedKeywords: m.matchedKeywords,
      }));
    }

    // 4. Build full category paths for top 5 matches
    const suggestedCategories = await Promise.all(
      categoryMatches.slice(0, 5).map(async (match) => {
        // Build the path from root to this category
        const path = await this.buildCategoryPath(match.categoryId);
        const categoryLocation = path.join(',');
        return {
          id: match.categoryId,
          name: match.categoryName,
          path,
          categoryLocation,
        };
      }),
    );

    return { suggestedTags, suggestedCategories };
  }

  /**
   * Build full category path from root to the given category ID.
   * Returns array of category IDs: [root, ..., parent, categoryId]
   */
  private async buildCategoryPath(categoryId: number): Promise<number[]> {
    const path: number[] = [];
    let currentId: number | null = categoryId;
    const visited = new Set<number>();

    while (currentId !== null) {
      if (visited.has(currentId)) break; // prevent infinite loops
      visited.add(currentId);

      const category = await this.prisma.category.findUnique({
        where: { id: currentId },
        select: { id: true, parentId: true },
      });

      if (!category) break;

      path.unshift(category.id);

      if (
        category.parentId === null ||
        category.parentId === category.id
      ) {
        break;
      }
      currentId = category.parentId;
    }

    return path;
  }
}
