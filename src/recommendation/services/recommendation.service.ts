import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RecommendationRedisService } from './recommendation-redis.service';
import { SimilarityService } from './similarity.service';
import { DEFAULT_LOCALE, DEFAULT_ROLE } from '../constants/defaults';

// ────────────────────────────────────────────────────────────
// Response interfaces
// ────────────────────────────────────────────────────────────

export interface RecommendedProduct {
  productId: number;
  productName: string;
  image: string;
  price: number;
  sellerId: number;
  sellerName: string;
  category: string;
  score: number;
  reason: string;
  recId: string;
}

export interface RecommendationResponse {
  items: RecommendedProduct[];
  algorithm: string;
  segment: string;
  cached: boolean;
}

// ────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recRedis: RecommendationRedisService,
    private readonly similarityService: SimilarityService,
  ) {}

  // ──────────── 1. Personal recommendations ────────────

  async getPersonal(
    userId: number,
    locale: string,
    tradeRole: string,
    limit = 20,
  ): Promise<RecommendationResponse> {
    // Step 1 — personalised list
    let ids = await this.recRedis.getIdList(
      this.recRedis.keys.personal(userId),
    );
    let algorithm = 'personal';
    let cached = true;

    // Step 2 — fallback to segment trending
    if (!ids || ids.length === 0) {
      ids = await this.recRedis.getIdList(
        this.recRedis.keys.segTrending(locale, tradeRole),
      );
      algorithm = 'trending';
    }

    // Step 3 — fallback to editorial picks
    if (!ids || ids.length === 0) {
      ids = await this.recRedis.getIdList(
        this.recRedis.keys.editorialPicks,
      );
      algorithm = 'editorial';
      cached = !!ids && ids.length > 0;
    }

    const productIds = (ids || []).slice(0, limit);
    const items = await this.hydrateProducts(productIds, algorithm, 'personal');

    return {
      items,
      algorithm,
      segment: `${locale}:${tradeRole}`,
      cached,
    };
  }

  // ──────────── 2. Product-level recommendations ────────────

  async getProductRecs(
    productId: number,
    type: 'similar' | 'cobought' | 'crosssell',
    locale: string,
    tradeRole: string,
    limit = 12,
  ): Promise<RecommendationResponse> {
    let ids: number[] | null = null;
    let algorithm: string = type;
    let cached = true;

    switch (type) {
      case 'similar': {
        ids = await this.recRedis.getIdList(
          this.recRedis.keys.similar(productId),
        );
        if (!ids || ids.length === 0) {
          ids = await this.similarityService.findSimilarRealtime(
            productId,
            limit,
          );
          algorithm = 'similar_realtime';
          cached = false;
        }
        break;
      }

      case 'cobought': {
        ids = await this.recRedis.getIdList(
          this.recRedis.keys.cobought(productId),
        );
        // Fallback to similar if no co-bought data
        if (!ids || ids.length === 0) {
          ids = await this.recRedis.getIdList(
            this.recRedis.keys.similar(productId),
          );
          algorithm = 'similar';
        }
        if (!ids || ids.length === 0) {
          ids = await this.similarityService.findSimilarRealtime(
            productId,
            limit,
          );
          algorithm = 'similar_realtime';
          cached = false;
        }
        break;
      }

      case 'crosssell': {
        ids = await this.recRedis.getIdList(
          this.recRedis.keys.crosssell(productId),
        );
        break;
      }
    }

    const productIds = (ids || []).slice(0, limit);
    const items = await this.hydrateProducts(productIds, algorithm, type);

    return {
      items,
      algorithm,
      segment: `${locale}:${tradeRole}`,
      cached,
    };
  }

  // ──────────── 3. Trending recommendations ────────────

  async getTrending(
    locale: string,
    tradeRole: string,
    categoryId?: number,
    limit = 20,
  ): Promise<RecommendationResponse> {
    let ids: number[] | null = null;
    const algorithm = 'trending';
    let cached = true;

    if (categoryId) {
      // Category-specific trending
      ids = await this.recRedis.getIdList(
        this.recRedis.keys.segTrendingCat(locale, tradeRole, categoryId),
      );
    }

    if (!ids || ids.length === 0) {
      // General trending for locale + role
      ids = await this.recRedis.getIdList(
        this.recRedis.keys.segTrending(locale, tradeRole),
      );
    }

    if (!ids || ids.length === 0) {
      // Global fallback: default locale + role
      ids = await this.recRedis.getIdList(
        this.recRedis.keys.segTrending(DEFAULT_LOCALE, DEFAULT_ROLE),
      );
      cached = !!ids && ids.length > 0;
    }

    const productIds = (ids || []).slice(0, limit);
    const items = await this.hydrateProducts(productIds, algorithm, 'trending');

    return {
      items,
      algorithm,
      segment: `${locale}:${tradeRole}`,
      cached,
    };
  }

  // ──────────── 4. Cart-based recommendations ────────────

  async getCartRecs(userId: number, locale: string, tradeRole: string, limit: number): Promise<RecommendationResponse> {
    // Get user's cart products
    const cartItems = await this.prisma.cart.findMany({
      where: { userId, status: 'ACTIVE', deletedAt: null },
      select: { productId: true },
    });
    const cartProductIds = (cartItems.map((c) => c.productId).filter(Boolean)) as number[];

    if (cartProductIds.length === 0) {
      return this.getPersonal(userId, locale, tradeRole, limit);
    }

    // Aggregate cross-sell + co-bought across all cart items
    const allRecIds: number[] = [];
    for (const productId of cartProductIds) {
      const crosssellIds = await this.recRedis.getIdList(this.recRedis.keys.crosssell(productId));
      if (crosssellIds) allRecIds.push(...crosssellIds);
      const coboughtIds = await this.recRedis.getIdList(this.recRedis.keys.cobought(productId));
      if (coboughtIds) allRecIds.push(...coboughtIds);
    }

    // Deduplicate, remove cart items
    const seen = new Set(cartProductIds);
    const uniqueIds: number[] = [];
    for (const id of allRecIds) {
      if (!seen.has(id)) {
        seen.add(id);
        uniqueIds.push(id);
      }
    }

    const sliced = uniqueIds.slice(0, limit);
    const items = await this.hydrateProducts(sliced, 'crosssell', 'cart');
    return { items, algorithm: 'crosssell', segment: `${locale}:${tradeRole}`, cached: true };
  }

  // ──────────── 5. Post-purchase recommendations ────────────

  async getPostPurchaseRecs(orderId: number, userId: number, locale: string, tradeRole: string, limit: number): Promise<RecommendationResponse> {
    const orderProducts = await this.prisma.orderProducts.findMany({
      where: { orderId, userId },
      select: { productId: true },
    });
    const orderedProductIds = (orderProducts.map((o) => o.productId).filter(Boolean)) as number[];

    const allRecIds: number[] = [];
    for (const productId of orderedProductIds) {
      const coboughtIds = await this.recRedis.getIdList(this.recRedis.keys.cobought(productId));
      if (coboughtIds) allRecIds.push(...coboughtIds);
      const crosssellIds = await this.recRedis.getIdList(this.recRedis.keys.crosssell(productId));
      if (crosssellIds) allRecIds.push(...crosssellIds);
    }

    const seen = new Set(orderedProductIds);
    const uniqueIds: number[] = [];
    for (const id of allRecIds) {
      if (!seen.has(id)) {
        seen.add(id);
        uniqueIds.push(id);
      }
    }

    const sliced = uniqueIds.slice(0, limit);
    const items = await this.hydrateProducts(sliced, 'cobought', 'post_purchase');
    return { items, algorithm: 'cobought', segment: `${locale}:${tradeRole}`, cached: true };
  }

  // ──────────── 6. Core hydration ────────────

  private async hydrateProducts(
    productIds: number[],
    algorithm: string,
    placement: string,
  ): Promise<RecommendedProduct[]> {
    if (productIds.length === 0) return [];

    const [products, prices] = await Promise.all([
      this.prisma.product.findMany({
        where: { id: { in: productIds }, status: 'ACTIVE', deletedAt: null },
        select: {
          id: true,
          productName: true,
          categoryId: true,
          category: { select: { name: true } },
          productImages: {
            select: { image: true },
            where: { status: 'ACTIVE' },
            take: 1,
          },
        },
      }),
      this.prisma.productPrice.findMany({
        where: { productId: { in: productIds }, status: 'ACTIVE' },
        select: {
          productId: true,
          productPrice: true,
          offerPrice: true,
          adminId: true,
          adminDetail: {
            select: { firstName: true, lastName: true, companyName: true },
          },
        },
        orderBy: { productPrice: 'asc' },
      }),
    ]);

    // Build best-price map (lowest price per product — first hit because ordered asc)
    const priceMap = new Map<
      number,
      { price: number; sellerId: number; sellerName: string }
    >();
    for (const p of prices) {
      if (p.productId && !priceMap.has(p.productId)) {
        const seller = p.adminDetail;
        priceMap.set(p.productId, {
          price: Number(p.offerPrice || p.productPrice),
          sellerId: p.adminId || 0,
          sellerName:
            seller?.companyName ||
            `${seller?.firstName || ''} ${seller?.lastName || ''}`.trim() ||
            'Seller',
        });
      }
    }

    const productMap = new Map(products.map((p) => [p.id, p]));
    const date = new Date().toISOString().slice(0, 10);

    // Preserve original ordering from recommendation algorithm
    return productIds
      .filter((id) => productMap.has(id))
      .map((id, index) => {
        const product = productMap.get(id)!;
        const priceInfo = priceMap.get(id);
        const hash = createHash('md5')
          .update(`${id}:${algorithm}:${date}`)
          .digest('hex')
          .slice(0, 6);

        return {
          productId: id,
          productName: product.productName || '',
          image: product.productImages?.[0]?.image || '',
          price: priceInfo?.price || 0,
          sellerId: priceInfo?.sellerId || 0,
          sellerName: priceInfo?.sellerName || '',
          category: product.category?.name || '',
          score: productIds.length - index,
          reason: this.getReasonText(algorithm),
          recId: `rec_${hash}_${algorithm}_${date}`,
        };
      });
  }

  // ──────────── Helpers ────────────

  private getReasonText(algorithm: string): string {
    const reasons: Record<string, string> = {
      personal: 'Recommended for you',
      cobought: 'Customers also bought',
      similar: 'Similar products',
      similar_realtime: 'Similar products',
      trending: 'Trending in your region',
      crosssell: 'Complete your order',
      editorial: 'Editor picks',
    };
    return reasons[algorithm] || 'You might like';
  }
}
