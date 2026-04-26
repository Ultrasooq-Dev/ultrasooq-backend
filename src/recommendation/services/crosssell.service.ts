// @ts-nocheck
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import pLimit from 'p-limit';
import { PrismaService } from '../../prisma/prisma.service';
import { RecommendationRedisService } from './recommendation-redis.service';
import {
  COBUY_TOP_PRODUCTS,
  BATCH_SIZE,
  BATCH_PAUSE_MS,
  MAX_CONCURRENCY,
} from '../constants/defaults';

/** 25 hours TTL — slightly longer than the 24h cron cycle to avoid gaps */
const CROSSSELL_TTL = 25 * 60 * 60;

/** Lock TTL: 30 minutes max for the entire job */
const JOB_LOCK_TTL = 30 * 60;

const JOB_NAME = 'crosssell-builder';

/** Top-N rule-based products per target category */
const RULE_PRODUCTS_PER_CATEGORY = 5;

/** Max co-cart candidates to consider */
const CO_CART_CANDIDATES = 50;

/** Top N co-cart products to include in merge */
const CO_CART_TOP = 5;

/** Final merged top-N to store */
const CROSSSELL_LIMIT = 10;

interface CrossSellRuleEntry {
  sourceCategoryId: number;
  targetCategoryId: number;
  priority: number;
}

@Injectable()
export class CrossSellService {
  private readonly logger = new Logger(CrossSellService.name);

  constructor(
    private prisma: PrismaService,
    private recRedis: RecommendationRedisService,
  ) {}

  /**
   * Runs daily at 03:15 AM — computes cross-sell recommendations for the top
   * 5000 most-viewed products, combining admin-defined category rules with
   * data-driven co-cart co-occurrence analysis.
   */
  @Cron('0 15 3 * * *')
  async buildCrossSell(): Promise<void> {
    const start = Date.now();
    this.logger.log('Cross-sell builder cron started');

    const locked = await this.recRedis.acquireLock(JOB_NAME, JOB_LOCK_TTL);
    if (!locked) {
      this.logger.warn('Cross-sell builder skipped — another instance holds the lock');
      return;
    }

    try {
      // Step 1: Load all active rules and cache them for API fallback
      const rules = await this.loadAndCacheRules();
      this.logger.log(`Loaded ${rules.length} active cross-sell rules`);

      // Build a lookup map: sourceCategoryId → sorted target category IDs (by priority desc)
      const ruleMap = this.buildRuleMap(rules);

      // Step 2: Get top 5000 products by view count
      const topProducts = await this.getTopViewedProducts(COBUY_TOP_PRODUCTS);
      this.logger.log(`Found ${topProducts.length} products to compute cross-sell for`);

      const limit = pLimit(MAX_CONCURRENCY);
      let processed = 0;

      for (let i = 0; i < topProducts.length; i += BATCH_SIZE) {
        const batch = topProducts.slice(i, i + BATCH_SIZE);

        await Promise.all(
          batch.map((product) =>
            limit(async () => {
              const crossSellIds = await this.computeCrossSell(product, ruleMap);
              if (crossSellIds.length > 0) {
                await this.recRedis.setIdList(
                  this.recRedis.keys.crosssell(product.id),
                  crossSellIds,
                  CROSSSELL_TTL,
                );
              }
            }),
          ),
        );

        processed += batch.length;
        this.logger.log(`Processed ${processed}/${topProducts.length} products`);

        // Pause between batches to reduce DB pressure
        if (i + BATCH_SIZE < topProducts.length) {
          await this.sleep(BATCH_PAUSE_MS);
        }
      }

      const duration = Date.now() - start;
      this.logger.log(
        `Cross-sell builder completed: ${topProducts.length} products in ${duration}ms`,
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Cross-sell builder failed: ${err.message}`, err.stack);
    } finally {
      await this.recRedis.releaseLock(JOB_NAME);
    }
  }

  /**
   * Real-time fallback for products not in the precomputed cache.
   * Uses cached rules only (no co-cart query at request time).
   */
  async findCrossSellRealtime(productId: string, limit = CROSSSELL_LIMIT): Promise<number[]> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, categoryId: true },
    });
    if (!product?.categoryId) return [];

    // Try cached rules first
    const cachedRules = await this.recRedis.getJson<CrossSellRuleEntry[]>(
      this.recRedis.keys.crosssellRules,
    );
    if (!cachedRules || cachedRules.length === 0) return [];

    const targetCategoryIds = cachedRules
      .filter((r) => r.sourceCategoryId === product.categoryId)
      .sort((a, b) => b.priority - a.priority)
      .map((r) => r.targetCategoryId);

    if (targetCategoryIds.length === 0) return [];

    const products = await this.prisma.product.findMany({
      where: {
        id: { not: productId },
        categoryId: { in: targetCategoryIds },
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true },
      orderBy: { productViewCount: 'desc' },
      take: limit,
    });

    return products.map((p) => p.id);
  }

  /**
   * Load active cross-sell rules from DB and cache them in Redis for API fallback.
   */
  private async loadAndCacheRules(): Promise<CrossSellRuleEntry[]> {
    const dbRules = await this.prisma.crossSellRule.findMany({
      where: { isActive: true },
      select: {
        sourceCategoryId: true,
        targetCategoryId: true,
        priority: true,
      },
      orderBy: { priority: 'desc' },
    });

    await this.recRedis.setJson(
      this.recRedis.keys.crosssellRules,
      dbRules,
      CROSSSELL_TTL,
    );

    return dbRules;
  }

  /**
   * Build a map from sourceCategoryId → target category IDs sorted by priority desc.
   */
  private buildRuleMap(rules: CrossSellRuleEntry[]): Map<number, number[]> {
    const map = new Map<number, number[]>();
    for (const rule of rules) {
      const existing = map.get(rule.sourceCategoryId) ?? [];
      existing.push(rule.targetCategoryId);
      map.set(rule.sourceCategoryId, existing);
    }
    return map;
  }

  /**
   * Compute the final cross-sell list for a single product.
   * Merges rule-based and co-cart results, deduplicates, returns top CROSSSELL_LIMIT IDs.
   */
  private async computeCrossSell(
    product: { id: number; categoryId: number | null },
    ruleMap: Map<number, number[]>,
  ): Promise<number[]> {
    const ruleBased = await this.getRuleBasedProducts(product, ruleMap);
    const coCart = await this.getCoCartProducts(product.id, CO_CART_CANDIDATES);

    // Merge: rule-based first (admin priority), then co-cart, deduplicate, exclude self
    const seen = new Set<number>([product.id]);
    const merged: number[] = [];

    for (const id of [...ruleBased, ...coCart]) {
      if (!seen.has(id)) {
        seen.add(id);
        merged.push(id);
        if (merged.length >= CROSSSELL_LIMIT) break;
      }
    }

    return merged;
  }

  /**
   * Rule-based: find target categories for this product's category,
   * return top RULE_PRODUCTS_PER_CATEGORY most-viewed products per target category.
   */
  private async getRuleBasedProducts(
    product: { id: number; categoryId: number | null },
    ruleMap: Map<number, number[]>,
  ): Promise<number[]> {
    if (!product.categoryId) return [];

    const targetCategoryIds = ruleMap.get(product.categoryId);
    if (!targetCategoryIds || targetCategoryIds.length === 0) return [];

    const results = await this.prisma.product.findMany({
      where: {
        id: { not: product.id },
        categoryId: { in: targetCategoryIds },
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true, categoryId: true },
      orderBy: { productViewCount: 'desc' },
      take: RULE_PRODUCTS_PER_CATEGORY * targetCategoryIds.length,
    });

    // Take top RULE_PRODUCTS_PER_CATEGORY per category, preserving priority order
    const perCategory = new Map<number, number[]>();
    for (const p of results) {
      if (!p.categoryId) continue;
      const bucket = perCategory.get(p.categoryId) ?? [];
      if (bucket.length < RULE_PRODUCTS_PER_CATEGORY) {
        bucket.push(p.id);
        perCategory.set(p.categoryId, bucket);
      }
    }

    // Return in target category priority order (ruleMap order = sorted by priority desc)
    const ids: number[] = [];
    for (const catId of targetCategoryIds) {
      const bucket = perCategory.get(catId) ?? [];
      ids.push(...bucket);
    }
    return ids;
  }

  /**
   * Co-cart analysis: find products frequently co-added to carts alongside this product.
   * Returns top CO_CART_TOP product IDs by co-occurrence count.
   *
   * Steps:
   *   1. Find carts containing productId → get userIds
   *   2. Find other products in those users' carts (groupBy productId, count)
   *   3. Filter null productIds in JS (not in where clause)
   */
  private async getCoCartProducts(productId: string, candidateLimit: number): Promise<number[]> {
    // Step 1: find user IDs who had this product in their cart
    const cartsWithProduct = await this.prisma.cart.findMany({
      where: {
        productId,
        deletedAt: null,
        status: { not: 'DELETE' },
        userId: { not: null },
      },
      select: { userId: true },
      distinct: ['userId'],
    });

    const userIds = cartsWithProduct
      .map((c) => c.userId)
      .filter((id): id is string => id !== null);

    if (userIds.length === 0) return [];

    // Step 2: find other products in those users' carts, grouped by productId
    const coOccurrences = await this.prisma.cart.groupBy({
      by: ['productId'],
      where: {
        userId: { in: userIds },
        deletedAt: null,
        status: { not: 'DELETE' },
      },
      _count: { productId: true },
      orderBy: { _count: { productId: 'desc' } },
      take: candidateLimit + 1, // +1 to account for self
    });

    // Step 3: filter null productIds in JavaScript, exclude self, take top CO_CART_TOP
    return coOccurrences
      .filter((row) => row.productId !== null && row.productId !== productId)
      .slice(0, CO_CART_TOP)
      .map((row) => row.productId as string);
  }

  /**
   * Get the top N most-viewed active products.
   */
  private async getTopViewedProducts(limit: number) {
    return this.prisma.product.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      select: {
        id: true,
        categoryId: true,
      },
      orderBy: { productViewCount: 'desc' },
      take: limit,
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}