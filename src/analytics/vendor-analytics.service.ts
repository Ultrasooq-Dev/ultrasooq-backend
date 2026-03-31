import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';

const CACHE_TTL = 60;

@Injectable()
export class VendorAnalyticsService {
  private readonly logger = new Logger(VendorAnalyticsService.name);

  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  /**
   * Overview: KPIs + daily sales trend for a seller
   */
  async getOverview(sellerId: number, days: number) {
    const cacheKey = `vendor:analytics:overview:${sellerId}:${days}`;
    return this.cache.getOrSet(cacheKey, async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      // Get seller's productPrice IDs and product IDs
      const sellerPrices = await this.prisma.productPrice.findMany({
        where: { adminId: sellerId, status: 'ACTIVE', deletedAt: null },
        select: { id: true, productId: true },
      });
      const priceIds = sellerPrices.map((p) => p.id);
      const productIds = [...new Set(sellerPrices.map((p) => p.productId).filter(Boolean))] as number[];

      if (priceIds.length === 0) {
        return {
          kpis: { views: 0, clicks: 0, cartAdds: 0, orders: 0, delivered: 0, cancelled: 0, revenue: 0, conversionRate: 0, avgOrderValue: 0, totalProducts: 0 },
          salesTrend: [],
          period: { since, days },
        };
      }

      const [views, clicks, cartAdds, orders, delivered, cancelled, revenueAgg] =
        await this.prisma.$transaction([
          this.prisma.productView.count({
            where: { productId: { in: productIds }, createdAt: { gte: since } },
          }),
          this.prisma.productClick.count({
            where: { productId: { in: productIds }, createdAt: { gte: since } },
          }),
          this.prisma.cart.count({
            where: { productPriceId: { in: priceIds }, status: 'ACTIVE', deletedAt: null },
          }),
          this.prisma.orderProducts.count({
            where: { sellerId, createdAt: { gte: since } },
          }),
          this.prisma.orderProducts.count({
            where: { sellerId, orderProductStatus: 'DELIVERED', createdAt: { gte: since } },
          }),
          this.prisma.orderProducts.count({
            where: { sellerId, orderProductStatus: 'CANCELLED', createdAt: { gte: since } },
          }),
          this.prisma.orderProducts.aggregate({
            where: { sellerId, orderProductStatus: 'DELIVERED', createdAt: { gte: since } },
            _sum: { sellerReceives: true },
          }),
        ]);

      const revenue = Number(revenueAgg._sum.sellerReceives ?? 0);
      const conversionRate = views > 0 ? Math.round((orders / views) * 10000) / 100 : 0;
      const avgOrderValue = delivered > 0 ? Math.round((revenue / delivered) * 100) / 100 : 0;

      // Sales trend (daily)
      const salesTrend = await this.prisma.$queryRaw<
        Array<{ date: string; orders: bigint; revenue: any }>
      >`
        SELECT TO_CHAR("createdAt", 'YYYY-MM-DD') AS date,
          COUNT(*) AS orders,
          COALESCE(SUM("sellerReceives"), 0) AS revenue
        FROM "OrderProducts"
        WHERE "sellerId" = ${sellerId} AND "createdAt" >= ${since}
        GROUP BY TO_CHAR("createdAt", 'YYYY-MM-DD')
        ORDER BY date ASC
      `;

      return {
        kpis: {
          views,
          clicks,
          cartAdds,
          orders,
          delivered,
          cancelled,
          revenue,
          conversionRate,
          avgOrderValue,
          totalProducts: priceIds.length,
        },
        salesTrend: salesTrend.map((r) => ({
          date: r.date,
          orders: Number(r.orders),
          revenue: Number(r.revenue),
        })),
        period: { since, days },
      };
    }, CACHE_TTL);
  }

  /**
   * Top products: per-product performance metrics for a seller
   */
  async getProducts(sellerId: number, days: number, page: number, limit: number) {
    const cacheKey = `vendor:analytics:products:${sellerId}:${days}:${page}:${limit}`;
    return this.cache.getOrSet(cacheKey, async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const offset = (page - 1) * limit;

      const products = await this.prisma.$queryRaw<any[]>`
        SELECT
          pp.id AS "priceId",
          p.id AS "productId",
          p."productName",
          pp."productPrice",
          pp."offerPrice",
          pp.stock,
          (SELECT COUNT(*) FROM "ProductView" WHERE "productId" = p.id AND "createdAt" >= ${since}) AS views,
          (SELECT COUNT(*) FROM "ProductClick" WHERE "productId" = p.id AND "createdAt" >= ${since}) AS clicks,
          (SELECT COUNT(*) FROM "Cart" WHERE "productPriceId" = pp.id AND status = 'ACTIVE' AND "deletedAt" IS NULL) AS "cartAdds",
          (SELECT COUNT(*) FROM "OrderProducts" WHERE "productPriceId" = pp.id AND "createdAt" >= ${since}) AS orders,
          (SELECT COALESCE(SUM("sellerReceives"), 0) FROM "OrderProducts" WHERE "productPriceId" = pp.id AND "orderProductStatus" = 'DELIVERED') AS revenue,
          (SELECT COALESCE(AVG(rating), 0) FROM "ProductPriceReview" WHERE "productPriceId" = pp.id AND status = 'ACTIVE') AS "avgRating",
          (SELECT COUNT(*) FROM "ProductPriceReview" WHERE "productPriceId" = pp.id AND status = 'ACTIVE') AS "reviewCount"
        FROM "ProductPrice" pp
        JOIN "Product" p ON p.id = pp."productId"
        WHERE pp."adminId" = ${sellerId}
          AND pp.status = 'ACTIVE'
          AND pp."deletedAt" IS NULL
        ORDER BY views DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      const total = await this.prisma.productPrice.count({
        where: { adminId: sellerId, status: 'ACTIVE', deletedAt: null },
      });

      return {
        products: products.map((p) => ({
          ...p,
          views: Number(p.views),
          clicks: Number(p.clicks),
          cartAdds: Number(p.cartAdds),
          orders: Number(p.orders),
          revenue: Number(p.revenue),
          avgRating: Math.round(Number(p.avgRating) * 10) / 10,
          reviewCount: Number(p.reviewCount),
          productPrice: Number(p.productPrice),
          offerPrice: Number(p.offerPrice),
        })),
        total,
        page,
        pages: Math.ceil(total / limit),
        period: { since, days },
      };
    }, CACHE_TTL);
  }

  /**
   * Conversion funnel: Views → Clicks → Cart → Orders → Delivered
   */
  async getFunnel(sellerId: number, days: number) {
    const cacheKey = `vendor:analytics:funnel:${sellerId}:${days}`;
    return this.cache.getOrSet(cacheKey, async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const sellerPrices = await this.prisma.productPrice.findMany({
        where: { adminId: sellerId, status: 'ACTIVE', deletedAt: null },
        select: { id: true, productId: true },
      });
      const priceIds = sellerPrices.map((p) => p.id);
      const productIds = [...new Set(sellerPrices.map((p) => p.productId).filter(Boolean))] as number[];

      if (priceIds.length === 0) {
        return { funnel: [], period: { since, days } };
      }

      const [views, clicks, cartAdds, orders, delivered] = await this.prisma.$transaction([
        this.prisma.productView.count({ where: { productId: { in: productIds }, createdAt: { gte: since } } }),
        this.prisma.productClick.count({ where: { productId: { in: productIds }, createdAt: { gte: since } } }),
        this.prisma.cart.count({ where: { productPriceId: { in: priceIds }, status: 'ACTIVE', deletedAt: null } }),
        this.prisma.orderProducts.count({ where: { sellerId, createdAt: { gte: since } } }),
        this.prisma.orderProducts.count({ where: { sellerId, orderProductStatus: 'DELIVERED', createdAt: { gte: since } } }),
      ]);

      const steps = [
        { step: 'Product Views', count: views },
        { step: 'Product Clicks', count: clicks },
        { step: 'Added to Cart', count: cartAdds },
        { step: 'Orders Placed', count: orders },
        { step: 'Delivered', count: delivered },
      ];

      // Calculate conversion rates
      const funnel = steps.map((s, i) => ({
        ...s,
        conversionRate: i === 0 ? 100 : steps[0].count > 0 ? Math.round((s.count / steps[0].count) * 10000) / 100 : 0,
        dropOff: i === 0 ? 0 : steps[i - 1].count > 0 ? Math.round(((steps[i - 1].count - s.count) / steps[i - 1].count) * 10000) / 100 : 0,
      }));

      return { funnel, period: { since, days } };
    }, CACHE_TTL);
  }

  /**
   * Reviews: summary + paginated list for a seller
   */
  async getReviews(sellerId: number, page: number, limit: number) {
    const cacheKey = `vendor:analytics:reviews:${sellerId}:${page}:${limit}`;
    return this.cache.getOrSet(cacheKey, async () => {
      const where = { adminId: sellerId, status: 'ACTIVE' as const, deletedAt: null };

      const [reviews, total, avgAgg] = await this.prisma.$transaction([
        this.prisma.productPriceReview.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: (page - 1) * limit,
          select: {
            id: true,
            title: true,
            description: true,
            rating: true,
            createdAt: true,
            productPriceReview_user: { select: { firstName: true, lastName: true } },
            productPriceReview_productPrice: {
              select: { productPrice_product: { select: { productName: true } } },
            },
          },
        }),
        this.prisma.productPriceReview.count({ where }),
        this.prisma.productPriceReview.aggregate({ where, _avg: { rating: true } }),
      ]);

      // Rating distribution
      const distribution = await this.prisma.$queryRaw<Array<{ rating: number; count: bigint }>>`
        SELECT rating, COUNT(*) AS count
        FROM "ProductPriceReview"
        WHERE "adminId" = ${sellerId} AND status = 'ACTIVE' AND "deletedAt" IS NULL AND rating IS NOT NULL
        GROUP BY rating ORDER BY rating DESC
      `;

      return {
        avgRating: Math.round((avgAgg._avg.rating ?? 0) * 10) / 10,
        totalReviews: total,
        distribution: distribution.map((d) => ({ rating: d.rating, count: Number(d.count) })),
        reviews: reviews.map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          rating: r.rating,
          createdAt: r.createdAt,
          buyerName: [r.productPriceReview_user?.firstName, r.productPriceReview_user?.lastName].filter(Boolean).join(' ') || 'Anonymous',
          productName: r.productPriceReview_productPrice?.productPrice_product?.productName ?? '—',
        })),
        page,
        pages: Math.ceil(total / limit),
      };
    }, CACHE_TTL);
  }
}
