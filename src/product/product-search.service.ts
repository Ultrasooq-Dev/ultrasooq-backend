/**
 * @file product-search.service.ts
 * @description Extracted search, filtering, and listing logic from the monolithic
 *   ProductService. Handles all product search/browse operations including global
 *   product listing, category-based recommendations, related products, same-brand
 *   products, and existing-product search.
 *
 * @module ProductSearchService
 * @phase B13 - Product Service Decomposition Part 1
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HelperService } from 'src/helper/helper.service';
import { getErrorMessage } from 'src/common/utils/get-error-message';
import { CacheService, CACHE_KEYS, CACHE_TTL } from '../cache/cache.service';
import * as crypto from 'crypto';

@Injectable()
export class ProductSearchService {
  private readonly logger = new Logger(ProductSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly helperService: HelperService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * @method getAllProduct
   * @description Retrieves a paginated list of active products for the global storefront
   *   with full-text search across name, brand, category, SKU, description, tags,
   *   and short descriptions. Supports price-range, brand, category, sort, and
   *   ownership filters.
   */
  async getAllProduct(
    page: any,
    limit: any,
    req: any,
    term: any,
    sort: any,
    brandIds: any,
    priceMin: any,
    priceMax: any,
    userId: any,
    categoryIds: any,
    userType: any,
  ) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize;
      let searchTerm = term?.length > 2 ? term : '';
      const sortType = sort ? sort : 'desc';
      const userID = parseInt(userId);

      // Cache simple category-based browsing (no search term, no brand filter, no price range, no ownership filter)
      const isCacheable = categoryIds && !searchTerm && !brandIds && !priceMin && !priceMax && req?.query?.isOwner !== 'me';
      if (isCacheable) {
        const cacheKey = CACHE_KEYS.PRODUCT_LIST_CATEGORY(categoryIds, Page);
        const cached = await this.cacheService.get(cacheKey);
        if (cached) return cached;
      }

      let myProduct;
      if (req.query.isOwner == 'me') {
        myProduct = userID;
      } else {
        myProduct = undefined;
      }

      let whereCondition: any = {
        productType: {
          in: ['P', 'F'],
        },
        status: 'ACTIVE',
        categoryId: categoryIds
          ? {
              in: categoryIds.split(',').map((id) => parseInt(id.trim())),
            }
          : undefined,
        brandId: brandIds
          ? {
              in: brandIds.split(',').map((id) => parseInt(id.trim())),
            }
          : undefined,
        product_productPrice: {
          some: {
            askForPrice: 'false',
            isCustomProduct: 'false',
            sellType: 'NORMALSELL',
            status: 'ACTIVE',
          },
        },
        adminId: myProduct,
        OR: searchTerm
          ? [
              {
                productName: {
                  contains: searchTerm,
                  mode: 'insensitive',
                },
              },
              {
                brand: {
                  brandName: {
                    contains: searchTerm,
                    mode: 'insensitive',
                  },
                },
              },
              {
                category: {
                  name: {
                    contains: searchTerm,
                    mode: 'insensitive',
                  },
                },
              },
              {
                skuNo: {
                  contains: searchTerm,
                  mode: 'insensitive',
                },
              },
              {
                description: {
                  contains: searchTerm,
                  mode: 'insensitive',
                },
              },
              {
                shortDescription: {
                  contains: searchTerm,
                  mode: 'insensitive',
                },
              },
              {
                productTags: {
                  some: {
                    productTagsTag: {
                      tagName: {
                        contains: searchTerm,
                        mode: 'insensitive',
                      },
                    },
                  },
                },
              },
              {
                product_productShortDescription: {
                  some: {
                    shortDescription: {
                      contains: searchTerm,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            ]
          : undefined,
      };

      if (priceMin && priceMax) {
        whereCondition.offerPrice = {
          gte: parseFloat(priceMin),
          lte: parseFloat(priceMax),
        };
      }

      let productDetailList = await this.prisma.product.findMany({
        where: whereCondition,
        include: {
          category: { where: { status: 'ACTIVE' } },
          brand: { where: { status: 'ACTIVE' } },
          product_productShortDescription: { where: { status: 'ACTIVE' } },
          productImages: { where: { status: 'ACTIVE' } },
          productReview: {
            where: { status: 'ACTIVE' },
            select: {
              rating: true,
            },
          },
          product_wishlist: {
            where: { userId: userID },
            select: {
              userId: true,
              productId: true,
            },
          },
          product_productPrice: {
            where: {
              status: 'ACTIVE',
            },
            include: {
              productPrice_productSellerImage: true,
              adminDetail: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  accountName: true,
                  profilePicture: true,
                  tradeRole: true,
                  userProfile: {
                    select: {
                      profileType: true,
                      logo: true,
                      companyName: true,
                    },
                  },
                },
              },
            },
            orderBy: {
              offerPrice: 'asc',
            },
            take: 1,
          },
        },
        orderBy: { createdAt: sortType },
        skip,
        take: pageSize,
      });

      let productDetailListCount = await this.prisma.product.count({
        where: whereCondition,
      });

      if (!productDetailList) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
          totalCount: 0,
        };
      }

      productDetailList.forEach((product) => {
        if (product.productReview.length > 0) {
          const totalRating = product.productReview.reduce(
            (acc, review) => acc + (review.rating || 0),
            0,
          );
          (product as any).averageRating = Math.floor(
            totalRating / product.productReview.length,
          );
        } else {
          (product as any).averageRating = 0;
        }
      });

      const result = {
        status: true,
        message: 'Fetch Successfully',
        data: productDetailList,
        totalCount: productDetailListCount,
      };

      // Cache simple category-based browsing results for 5 minutes
      if (isCacheable) {
        const cacheKey = CACHE_KEYS.PRODUCT_LIST_CATEGORY(categoryIds, Page);
        await this.cacheService.set(cacheKey, result, CACHE_TTL.PRODUCT_LIST);
      }

      return result;
    } catch (error) {
      return {
        status: false,
        message: 'error in getAllProduct',
        error: getErrorMessage(error),
      };
    }
  }

  // ══════════════════════════════════════════════
  // Smart Search: FTS + Relevance + Sorting + Caching
  // ══════════════════════════════════════════════

  /**
   * @method smartSearch
   * @description Full-text search with relevance ranking, multiple sort options,
   *   fuzzy matching via pg_trgm, popularity/rating signals, and Redis caching.
   *   Uses a two-query approach: raw SQL for scored IDs, then Prisma for full data.
   */
  async smartSearch(params: {
    page: number;
    limit: number;
    term: string;
    sort?: string;
    brandIds?: string;
    priceMin?: number;
    priceMax?: number;
    categoryIds?: string;
    ratingMin?: number;
    hasDiscount?: boolean;
    userId?: number;
    userType?: string;
    isOwner?: string;
  }) {
    try {
      const {
        page = 1,
        limit = 10,
        term,
        sort = 'relevance',
        brandIds,
        priceMin,
        priceMax,
        categoryIds,
        ratingMin,
        hasDiscount,
        userId,
        isOwner,
      } = params;

      const pageNum = parseInt(String(page)) || 1;
      const pageSize = parseInt(String(limit)) || 10;
      const offset = (pageNum - 1) * pageSize;
      const searchTerm = term?.trim() || '';

      if (!searchTerm || searchTerm.length < 2) {
        return { status: false, message: 'Search term too short', data: [], totalCount: 0 };
      }

      // ── Cache check ──
      const cacheHash = crypto.createHash('md5')
        .update(JSON.stringify({ searchTerm, sort, brandIds, priceMin, priceMax, categoryIds, ratingMin, hasDiscount, pageNum, pageSize }))
        .digest('hex');
      const cacheKey = CACHE_KEYS.SEARCH_RESULTS(cacheHash);
      const cached = await this.cacheService.get(cacheKey);
      if (cached) return cached;

      // ── Build WHERE clauses for raw SQL ──
      const whereClauses: string[] = [
        `p.status = 'ACTIVE'`,
        `p."productType" IN ('P', 'F')`,
        `p."deletedAt" IS NULL`,
      ];
      const sqlParams: any[] = [];
      let paramIndex = 1;

      // Full-text search + 5-channel fuzzy matching
      sqlParams.push(searchTerm);
      whereClauses.push(`(
        p."search_vector" @@ plainto_tsquery('english', $${paramIndex})
        OR similarity(p."productName", $${paramIndex}) > 0.15
        OR word_similarity($${paramIndex}, COALESCE(p."productName", '')) > 0.5
        OR EXISTS (
          SELECT 1 FROM unnest(string_to_array(regexp_replace(LOWER($${paramIndex}), '[^a-z0-9\\s]', ' ', 'g'), ' ')) w
          WHERE LENGTH(w) >= 3
          AND metaphone(w, 5) = ANY(
            SELECT metaphone(unnest(string_to_array(
              regexp_replace(LOWER(p."productName"), '[^a-z0-9\\s]', ' ', 'g'), ' '
            )), 5)
          )
        )
        OR similarity(COALESCE(b."brandName", ''), $${paramIndex}) > 0.3
      )`);
      const termParamIdx = paramIndex;
      paramIndex++;

      // Category filter
      if (categoryIds) {
        const catIds = categoryIds.split(',').map((id) => parseInt(id.trim())).filter(Boolean);
        if (catIds.length > 0) {
          sqlParams.push(catIds);
          whereClauses.push(`p."categoryId" = ANY($${paramIndex}::int[])`);
          paramIndex++;
        }
      }

      // Brand filter
      if (brandIds) {
        const bIds = brandIds.split(',').map((id) => parseInt(id.trim())).filter(Boolean);
        if (bIds.length > 0) {
          sqlParams.push(bIds);
          whereClauses.push(`p."brandId" = ANY($${paramIndex}::int[])`);
          paramIndex++;
        }
      }

      // Price range filter
      if (priceMin !== undefined && priceMin !== null) {
        sqlParams.push(parseFloat(String(priceMin)));
        whereClauses.push(`p."offerPrice" >= $${paramIndex}`);
        paramIndex++;
      }
      if (priceMax !== undefined && priceMax !== null) {
        sqlParams.push(parseFloat(String(priceMax)));
        whereClauses.push(`p."offerPrice" <= $${paramIndex}`);
        paramIndex++;
      }

      // Owner filter
      if (isOwner === 'me' && userId) {
        sqlParams.push(userId);
        whereClauses.push(`p."adminId" = $${paramIndex}`);
        paramIndex++;
      }

      // Must have active pricing
      whereClauses.push(`EXISTS (
        SELECT 1 FROM "ProductPrice" pp
        WHERE pp."productId" = p.id
        AND pp.status = 'ACTIVE'
        AND pp."askForPrice" = 'false'
        AND pp."isCustomProduct" = 'false'
        AND pp."sellType" = 'NORMALSELL'
      )`);

      const whereSQL = whereClauses.join(' AND ');

      // ── Build ORDER BY ──
      let orderSQL: string;
      switch (sort) {
        case 'price_asc':
          orderSQL = `p."offerPrice" ASC`;
          break;
        case 'price_desc':
          orderSQL = `p."offerPrice" DESC`;
          break;
        case 'newest':
          orderSQL = `p."createdAt" DESC`;
          break;
        case 'oldest':
          orderSQL = `p."createdAt" ASC`;
          break;
        case 'popularity':
          orderSQL = `COALESCE(pc.click_count, 0) DESC, relevance_score DESC`;
          break;
        case 'rating':
          orderSQL = `COALESCE(pr.avg_rating, 0) DESC, COALESCE(pr.review_count, 0) DESC`;
          break;
        case 'relevance':
        default:
          orderSQL = `relevance_score DESC`;
          break;
      }

      // ── Rating filter (as HAVING on subquery) ──
      let ratingJoinFilter = '';
      if (ratingMin && ratingMin > 0) {
        sqlParams.push(ratingMin);
        ratingJoinFilter = `AND COALESCE(pr.avg_rating, 0) >= $${paramIndex}`;
        paramIndex++;
      }

      // ── Discount filter ──
      let discountFilter = '';
      if (hasDiscount) {
        discountFilter = `AND EXISTS (
          SELECT 1 FROM "ProductPrice" ppd
          WHERE ppd."productId" = p.id
          AND ppd.status = 'ACTIVE'
          AND ppd."consumerDiscount" > 0
        )`;
      }

      // ── Main scored query ──
      sqlParams.push(pageSize);
      const limitIdx = paramIndex;
      paramIndex++;

      sqlParams.push(offset);
      const offsetIdx = paramIndex;
      paramIndex++;

      const scoredQuery = `
        SELECT
          p.id,
          (
            ts_rank_cd(COALESCE(p."search_vector", to_tsvector('')), plainto_tsquery('english', $${termParamIdx})) * 10 +
            similarity(COALESCE(p."productName", ''), $${termParamIdx}) * 5 +
            word_similarity($${termParamIdx}, COALESCE(p."productName", '')) * 3 +
            CASE WHEN EXISTS (
              SELECT 1 FROM unnest(string_to_array(regexp_replace(LOWER($${termParamIdx}), '[^a-z0-9\\s]', ' ', 'g'), ' ')) w
              WHERE LENGTH(w) >= 3
              AND metaphone(w, 5) = ANY(
                SELECT metaphone(unnest(string_to_array(
                  regexp_replace(LOWER(p."productName"), '[^a-z0-9\\s]', ' ', 'g'), ' '
                )), 5)
              )
            ) THEN 2 ELSE 0 END +
            similarity(COALESCE(b."brandName", ''), $${termParamIdx}) * 2 +
            COALESCE(pc.click_count, 0) * 0.01 +
            COALESCE(pv.view_count, 0) * 0.005 +
            COALESCE(pr.avg_rating, 0) * COALESCE(LN(pr.review_count + 1), 0) * 0.5
          ) as relevance_score
        FROM "Product" p
        LEFT JOIN "Brand" b ON p."brandId" = b.id
        LEFT JOIN (
          SELECT "productId", COUNT(*) as click_count
          FROM "ProductClick"
          WHERE "createdAt" > NOW() - INTERVAL '30 days'
          AND "deletedAt" IS NULL
          GROUP BY "productId"
        ) pc ON p.id = pc."productId"
        LEFT JOIN (
          SELECT "productId", SUM("viewCount") as view_count
          FROM "ProductView"
          WHERE "lastViewedAt" > NOW() - INTERVAL '30 days'
          AND "deletedAt" IS NULL
          GROUP BY "productId"
        ) pv ON p.id = pv."productId"
        LEFT JOIN (
          SELECT "productId", AVG(rating) as avg_rating, COUNT(*) as review_count
          FROM "ProductReview"
          WHERE status = 'ACTIVE'
          GROUP BY "productId"
        ) pr ON p.id = pr."productId"
        WHERE ${whereSQL}
        ${ratingJoinFilter}
        ${discountFilter}
        ORDER BY ${orderSQL}
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;

      // ── Count query ──
      const countQuery = `
        SELECT COUNT(*) as total
        FROM "Product" p
        LEFT JOIN "Brand" b ON p."brandId" = b.id
        LEFT JOIN (
          SELECT "productId", AVG(rating) as avg_rating
          FROM "ProductReview"
          WHERE status = 'ACTIVE'
          GROUP BY "productId"
        ) pr ON p.id = pr."productId"
        WHERE ${whereSQL}
        ${ratingJoinFilter}
        ${discountFilter}
      `;

      // Execute both queries
      const countParams = sqlParams.slice(0, -2); // exclude limit/offset
      const [scoredResults, countResults] = await Promise.all([
        this.prisma.$queryRawUnsafe(scoredQuery, ...sqlParams) as Promise<{ id: number; relevance_score: number }[]>,
        this.prisma.$queryRawUnsafe(countQuery, ...countParams) as Promise<{ total: bigint }[]>,
      ]);

      const totalCount = Number(countResults[0]?.total || 0);

      if (scoredResults.length === 0) {
        // Auto-retry: get best correction and search again automatically
        const correctedTerm = await this.getSpellSuggestion(searchTerm);

        if (correctedTerm && correctedTerm.toLowerCase() !== searchTerm.toLowerCase()) {
          // Re-run the query with the corrected term
          const correctedParams = [...sqlParams];
          correctedParams[0] = correctedTerm; // replace search term (first param)

          const [retryScoredResults, retryCountResults] = await Promise.all([
            this.prisma.$queryRawUnsafe(scoredQuery, ...correctedParams) as Promise<{ id: number; relevance_score: number }[]>,
            this.prisma.$queryRawUnsafe(countQuery, ...correctedParams.slice(0, -2)) as Promise<{ total: bigint }[]>,
          ]);

          if (retryScoredResults.length > 0) {
            const retryTotalCount = Number(retryCountResults[0]?.total || 0);
            const retryIds = retryScoredResults.map((r) => r.id);
            const userID = userId ? parseInt(String(userId)) : undefined;

            const retryProducts = await this.prisma.product.findMany({
              where: { id: { in: retryIds } },
              include: {
                category: { where: { status: 'ACTIVE' } },
                brand: { where: { status: 'ACTIVE' } },
                product_productShortDescription: { where: { status: 'ACTIVE' } },
                productImages: { where: { status: 'ACTIVE' } },
                productReview: {
                  where: { status: 'ACTIVE' },
                  select: { rating: true },
                },
                product_wishlist: {
                  where: { userId: userID || 0 },
                  select: { userId: true, productId: true },
                },
                product_productPrice: {
                  where: { status: 'ACTIVE' },
                  include: {
                    productPrice_productSellerImage: true,
                    adminDetail: {
                      select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        accountName: true,
                        profilePicture: true,
                        tradeRole: true,
                        userProfile: {
                          select: {
                            profileType: true,
                            logo: true,
                            companyName: true,
                          },
                        },
                      },
                    },
                  },
                  orderBy: { offerPrice: 'asc' },
                  take: 1,
                },
              },
            });

            const retryScoreMap = new Map(retryScoredResults.map((r) => [r.id, r.relevance_score]));
            retryProducts.sort((a, b) => (Number(retryScoreMap.get(b.id)) || 0) - (Number(retryScoreMap.get(a.id)) || 0));

            retryProducts.forEach((product) => {
              if (product.productReview.length > 0) {
                const totalRating = product.productReview.reduce(
                  (acc, review) => acc + (review.rating || 0),
                  0,
                );
                (product as any).averageRating = Math.floor(
                  totalRating / product.productReview.length,
                );
              } else {
                (product as any).averageRating = 0;
              }
            });

            const result = {
              status: true,
              message: 'Fetch Successfully',
              data: retryProducts,
              totalCount: retryTotalCount,
              autoCorrection: { from: searchTerm, to: correctedTerm },
            };

            await this.cacheService.set(cacheKey, result, CACHE_TTL.SEARCH_RESULTS);
            return result;
          }
        }

        // No correction found or correction also returned 0 results
        const result = {
          status: true,
          message: 'No results found',
          data: [],
          totalCount: 0,
          didYouMean: correctedTerm,
        };
        await this.cacheService.set(cacheKey, result, CACHE_TTL.SEARCH_RESULTS);
        return result;
      }

      // ── Fetch full product data via Prisma ──
      const scoredIds = scoredResults.map((r) => r.id);
      const userID = userId ? parseInt(String(userId)) : undefined;

      const products = await this.prisma.product.findMany({
        where: { id: { in: scoredIds } },
        include: {
          category: { where: { status: 'ACTIVE' } },
          brand: { where: { status: 'ACTIVE' } },
          product_productShortDescription: { where: { status: 'ACTIVE' } },
          productImages: { where: { status: 'ACTIVE' } },
          productReview: {
            where: { status: 'ACTIVE' },
            select: { rating: true },
          },
          product_wishlist: {
            where: { userId: userID || 0 },
            select: { userId: true, productId: true },
          },
          product_productPrice: {
            where: { status: 'ACTIVE' },
            include: {
              productPrice_productSellerImage: true,
              adminDetail: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  accountName: true,
                  profilePicture: true,
                  tradeRole: true,
                  userProfile: {
                    select: {
                      profileType: true,
                      logo: true,
                      companyName: true,
                    },
                  },
                },
              },
            },
            orderBy: { offerPrice: 'asc' },
            take: 1,
          },
        },
      });

      // Preserve the relevance order from raw SQL
      const scoreMap = new Map(scoredResults.map((r) => [r.id, r.relevance_score]));
      products.sort((a, b) => (Number(scoreMap.get(b.id)) || 0) - (Number(scoreMap.get(a.id)) || 0));

      // Calculate average rating (same as getAllProduct)
      products.forEach((product) => {
        if (product.productReview.length > 0) {
          const totalRating = product.productReview.reduce(
            (acc, review) => acc + (review.rating || 0),
            0,
          );
          (product as any).averageRating = Math.floor(
            totalRating / product.productReview.length,
          );
        } else {
          (product as any).averageRating = 0;
        }
      });

      const result = {
        status: true,
        message: 'Fetch Successfully',
        data: products,
        totalCount,
      };

      // Cache search results
      await this.cacheService.set(cacheKey, result, CACHE_TTL.SEARCH_RESULTS);

      return result;
    } catch (error) {
      this.logger.error('smartSearch error:', getErrorMessage(error));
      return {
        status: false,
        message: 'Error in smart search',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getSpellSuggestion
   * @description Uses pg_trgm similarity to find a "did you mean" correction
   *   when FTS returns zero results.
   */
  async getSpellSuggestion(term: string): Promise<string | null> {
    try {
      const results = await this.prisma.$queryRawUnsafe(`
        SELECT DISTINCT "productName",
          similarity("productName", $1) as sim
        FROM "Product"
        WHERE status = 'ACTIVE'
          AND "deletedAt" IS NULL
          AND similarity("productName", $1) > 0.15
        ORDER BY sim DESC
        LIMIT 1
      `, term) as { productName: string; sim: number }[];

      if (results.length > 0) {
        return results[0].productName;
      }
      return null;
    } catch (error) {
      this.logger.warn('getSpellSuggestion error:', getErrorMessage(error));
      return null;
    }
  }

  /**
   * @method getSearchSuggestions
   * @description Returns autocomplete suggestions: product names, categories,
   *   popular searches, and user's recent searches.
   */
  async getSearchSuggestions(term: string, userId?: number, deviceId?: string) {
    try {
      if (!term || term.length < 2) {
        return { status: true, data: { products: [], categories: [], popularSearches: [], recentSearches: [] } };
      }

      const likeTerm = `${term}%`;
      const containsTerm = `%${term}%`;

      // Run all 4 suggestion queries in parallel
      const [productResults, categoryResults, popularResults, recentResults] = await Promise.all([
        // 1. Product name matches
        this.prisma.$queryRawUnsafe(`
          SELECT "productName" as name, id, "offerPrice" as price
          FROM "Product"
          WHERE "productName" ILIKE $1
            AND status = 'ACTIVE'
            AND "deletedAt" IS NULL
          ORDER BY similarity("productName", $2) DESC
          LIMIT 5
        `, likeTerm, term) as Promise<{ name: string; id: number; price: number }[]>,

        // 2. Category matches
        this.prisma.$queryRawUnsafe(`
          SELECT name, id
          FROM "Category"
          WHERE name ILIKE $1
            AND status = 'ACTIVE'
            AND "deletedAt" IS NULL
          LIMIT 3
        `, containsTerm) as Promise<{ name: string; id: number }[]>,

        // 3. Popular searches (from materialized view)
        this.prisma.$queryRawUnsafe(`
          SELECT term, search_count
          FROM popular_searches
          WHERE term ILIKE $1
          ORDER BY search_count DESC
          LIMIT 5
        `, likeTerm).catch(() => []) as Promise<{ term: string; search_count: number }[]>,

        // 4. User's recent searches
        (userId || deviceId)
          ? this.prisma.$queryRawUnsafe(`
              SELECT "searchTerm" as term, MAX("createdAt") as last_searched
              FROM "ProductSearch"
              WHERE ("userId" = $1 OR "deviceId" = $2)
                AND "deletedAt" IS NULL
                AND "searchTerm" ILIKE $3
              GROUP BY "searchTerm"
              ORDER BY MAX("createdAt") DESC
              LIMIT 5
            `, userId || 0, deviceId || '', likeTerm) as Promise<{ term: string; last_searched: Date }[]>
          : Promise.resolve([]),
      ]);

      return {
        status: true,
        data: {
          products: productResults || [],
          categories: categoryResults || [],
          popularSearches: popularResults || [],
          recentSearches: recentResults || [],
        },
      };
    } catch (error) {
      this.logger.warn('getSearchSuggestions error:', getErrorMessage(error));
      return {
        status: true,
        data: { products: [], categories: [], popularSearches: [], recentSearches: [] },
      };
    }
  }

  /**
   * @method getTagExpansion
   * @description Expands a search term using Tags + CategoryTag relationships for
   *   semantic broadening. E.g., "coffee warmer" → finds "coffee" tag → linked category
   *   "Kitchen Appliances" → sibling tags like "thermos", "insulated mug".
   */
  async getTagExpansion(searchTerm: string): Promise<string[]> {
    try {
      if (!searchTerm || searchTerm.length < 2) return [];

      // Find tags matching any word in the search term
      const words = searchTerm.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
      if (words.length === 0) return [];

      const matchingTags = await this.prisma.tags.findMany({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
          OR: words.map((word) => ({
            tagName: { contains: word, mode: 'insensitive' as const },
          })),
        },
        select: { id: true, tagName: true },
        take: 5,
      });

      if (matchingTags.length === 0) return [];

      // Find categories linked to these tags via CategoryTag
      const categoryTags = await this.prisma.categoryTag.findMany({
        where: {
          tagId: { in: matchingTags.map((t) => t.id) },
          deletedAt: null,
        },
        select: { categoryId: true },
      });

      if (categoryTags.length === 0) return [];

      const categoryIds = [...new Set(categoryTags.map((ct) => ct.categoryId))];

      // Find sibling tags in the same categories (semantic expansion)
      const siblingTags = await this.prisma.categoryTag.findMany({
        where: {
          categoryId: { in: categoryIds },
          tagId: { notIn: matchingTags.map((t) => t.id) },
          deletedAt: null,
        },
        include: {
          tag: { select: { tagName: true } },
        },
        take: 8,
      });

      // Return unique sibling tag names (excluding original search words)
      const expandedTerms = siblingTags
        .map((st) => st.tag?.tagName)
        .filter((name): name is string =>
          !!name && !words.includes(name.toLowerCase()),
        );

      return [...new Set(expandedTerms)].slice(0, 5);
    } catch (error) {
      this.logger.warn('getTagExpansion error:', getErrorMessage(error));
      return [];
    }
  }

  /**
   * @method applyPersonalizationBoost
   * @description Light-weight personalization that re-orders results based on
   *   user's recently viewed categories and clicked brands.
   *   Mutates the products array in place (re-sorts).
   */
  async applyPersonalizationBoost(products: any[], userId: number): Promise<void> {
    try {
      // Get user's recently viewed categories (last 30 days)
      const recentViews = await this.prisma.$queryRawUnsafe(`
        SELECT DISTINCT p."categoryId"
        FROM "ProductView" pv
        JOIN "Product" p ON p.id = pv."productId"
        WHERE pv."userId" = $1
          AND pv."createdAt" > NOW() - INTERVAL '30 days'
        LIMIT 10
      `, userId) as { categoryId: number }[];

      // Get user's recently clicked brands (last 30 days)
      const recentClicks = await this.prisma.$queryRawUnsafe(`
        SELECT DISTINCT p."brandId"
        FROM "ProductClick" pc
        JOIN "Product" p ON p.id = pc."productId"
        WHERE pc."userId" = $1
          AND pc."createdAt" > NOW() - INTERVAL '30 days'
          AND p."brandId" IS NOT NULL
        LIMIT 10
      `, userId) as { brandId: number }[];

      if (recentViews.length === 0 && recentClicks.length === 0) return;

      const preferredCategories = new Set(recentViews.map((v) => v.categoryId));
      const preferredBrands = new Set(recentClicks.map((c) => c.brandId));

      // Apply small boost — moves preferred items slightly up without destroying relevance
      products.forEach((product) => {
        let boost = 0;
        if (product.categoryId && preferredCategories.has(product.categoryId)) {
          boost += 0.5;
        }
        if (product.brandId && preferredBrands.has(product.brandId)) {
          boost += 0.3;
        }
        (product as any).__personalizationBoost = boost;
      });

      // Stable sort: within same relevance tier, prefer personalized items
      products.sort((a, b) => {
        const boostDiff = ((b as any).__personalizationBoost || 0) - ((a as any).__personalizationBoost || 0);
        // Only re-order if boost difference is significant — preserve relevance order mostly
        return boostDiff * 0.3;
      });

      // Clean up temporary property
      products.forEach((p) => delete (p as any).__personalizationBoost);
    } catch (error) {
      this.logger.warn('applyPersonalizationBoost error:', getErrorMessage(error));
      // Non-fatal: just skip personalization
    }
  }

  /**
   * @method getAllProductByUserBusinessCategory
   * @description Retrieves products matching the authenticated user's business category tags.
   */
  async getAllProductByUserBusinessCategory(req: any) {
    try {
      let userId = req.user.id || req.user.userId;
      let admin_id = userId;
      admin_id = await this.helperService.getAdminId(admin_id);

      userId = parseInt(admin_id);

      const userBusinesCategoryDetail =
        await this.prisma.userBusinessCategory.findMany({
          where: {
            userId: userId,
            status: 'ACTIVE',
          },
        });

      const businessCategoryIds = [
        ...new Set(
          userBusinesCategoryDetail.map((category) => category.categoryId),
        ),
      ];

      let category = await this.prisma.categoryConnectTo.findMany({
        where: { connectTo: { in: businessCategoryIds } },
      });

      const categoryIdsFromConnectTo = category.map((item) => item.categoryId);

      let connectTo = await this.prisma.categoryConnectTo.findMany({
        where: { categoryId: { in: businessCategoryIds } },
      });

      const categoryIdsFromCategory = connectTo.map((item) => item.connectTo);

      const productCategoryIds = [
        ...new Set([
          ...categoryIdsFromConnectTo.filter(Boolean),
          ...categoryIdsFromCategory.filter(Boolean),
        ]),
      ];

      let Page = parseInt(req.query.page) || 1;
      let pageSize = parseInt(req.query.limit) || 10;
      const skip = (Page - 1) * pageSize;
      let searchTerm = req.query.term?.length > 2 ? req.query.term : '';
      const sortType = req.query.sort ? req.query.sort : 'desc';
      const userID = parseInt(userId);

      let myProduct;
      if (req.query.isOwner == 'me') {
        myProduct = userID;
      } else {
        myProduct = undefined;
      }

      let whereCondition: any = {
        productType: {
          in: ['P', 'F'],
        },
        status: 'ACTIVE',
        categoryId: productCategoryIds
          ? {
              in: productCategoryIds,
            }
          : undefined,
        brandId: req.query.brandIds
          ? {
              in: req.query.brandIds
                .split(',')
                .map((id) => parseInt(id.trim())),
            }
          : undefined,
        product_productPrice: {
          some: {
            askForPrice: 'false',
            isCustomProduct: 'false',
            sellType: 'NORMALSELL',
            status: 'ACTIVE',
          },
        },
        adminId: myProduct,
        OR: searchTerm
          ? [
              {
                productName: {
                  contains: searchTerm,
                  mode: 'insensitive',
                },
              },
              {
                brand: {
                  brandName: {
                    contains: searchTerm,
                    mode: 'insensitive',
                  },
                },
              },
            ]
          : undefined,
      };

      if (req.query.priceMin && req.query.priceMax) {
        whereCondition.offerPrice = {
          gte: parseFloat(req.query.priceMin),
          lte: parseFloat(req.query.priceMax),
        };
      }

      let productDetailList = await this.prisma.product.findMany({
        where: whereCondition,
        include: {
          category: { where: { status: 'ACTIVE' } },
          brand: { where: { status: 'ACTIVE' } },
          product_productShortDescription: { where: { status: 'ACTIVE' } },
          productImages: { where: { status: 'ACTIVE' } },
          productReview: {
            where: { status: 'ACTIVE' },
            select: {
              rating: true,
            },
          },
          product_wishlist: {
            where: { userId: userID },
            select: {
              userId: true,
              productId: true,
            },
          },
          product_productPrice: {
            where: {
              status: 'ACTIVE',
            },
            include: {
              productPrice_productSellerImage: true,
              adminDetail: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  accountName: true,
                  profilePicture: true,
                  tradeRole: true,
                  userProfile: {
                    select: {
                      profileType: true,
                      logo: true,
                      companyName: true,
                    },
                  },
                },
              },
            },
            orderBy: {
              offerPrice: 'asc',
            },
            take: 1,
          },
        },
        orderBy: { createdAt: sortType },
        skip,
        take: pageSize,
      });

      let productDetailListCount = await this.prisma.product.count({
        where: whereCondition,
      });

      if (!productDetailList) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
          totalCount: 0,
        };
      }

      productDetailList.forEach((product) => {
        if (product.productReview.length > 0) {
          const totalRating = product.productReview.reduce(
            (acc, review) => acc + (review.rating || 0),
            0,
          );
          (product as any).averageRating = Math.floor(
            totalRating / product.productReview.length,
          );
        } else {
          (product as any).averageRating = 0;
        }
      });

      return {
        status: true,
        message: 'Fetch Successfully',
        categoryIdsFromConnectTo: categoryIdsFromConnectTo,
        categoryIdsFromCategory: categoryIdsFromCategory,
        businessCategoryIds: businessCategoryIds,
        productCategoryIds: productCategoryIds,
        data: productDetailList,
        totalCount: productDetailListCount,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in getAllProductByUserBusinessCategory',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method existingAllProduct
   * @description Retrieves a paginated list of existing catalogue products with advanced
   *   filters, scoped by the brand's original creator.
   */
  async existingAllProduct(
    page: any,
    limit: any,
    req: any,
    term: any,
    sort: any,
    brandIds: any,
    priceMin: any,
    priceMax: any,
    userId: any,
    categoryIds: any,
    brandAddedBy: any,
  ) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize;
      let searchTerm = term?.length > 2 ? term : '';
      const sortType = sort ? sort : 'desc';
      const userID = parseInt(userId);
      const brandAddedBY = parseInt(brandAddedBy);

      let whereCondition: any = {
        productType: 'P',
        status: 'ACTIVE',
        productName: {
          contains: searchTerm,
          mode: 'insensitive',
        },
        categoryId: categoryIds
          ? {
              in: categoryIds.split(',').map((id) => parseInt(id.trim())),
            }
          : undefined,
        brandId: brandIds
          ? {
              in: brandIds.split(',').map((id) => parseInt(id.trim())),
            }
          : undefined,
        brand: {
          brandType: 'ADMIN',
        },
      };

      if (priceMin && priceMax) {
        whereCondition.offerPrice = {
          gte: parseFloat(priceMin),
          lte: parseFloat(priceMax),
        };
      }

      let productDetailList = await this.prisma.product.findMany({
        where: whereCondition,
        include: {
          category: { where: { status: 'ACTIVE' } },
          brand: { where: { status: 'ACTIVE' } },
          product_productShortDescription: { where: { status: 'ACTIVE' } },
          productImages: { where: { status: 'ACTIVE' } },
          productReview: {
            where: { status: 'ACTIVE' },
            select: {
              rating: true,
            },
          },
          product_wishlist: {
            where: { userId: userID },
            select: {
              userId: true,
              productId: true,
            },
          },
          product_productPrice: {
            where: {
              status: 'ACTIVE',
            },
            include: {
              productPrice_productSellerImage: true,
              adminDetail: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  accountName: true,
                  profilePicture: true,
                  tradeRole: true,
                  userProfile: {
                    select: {
                      profileType: true,
                      logo: true,
                      companyName: true,
                    },
                  },
                },
              },
            },
            orderBy: {
              offerPrice: 'asc',
            },
            take: 1,
          },
        },
        orderBy: { createdAt: sortType },
        skip,
        take: pageSize,
      });

      let productDetailListCount = await this.prisma.product.count({
        where: whereCondition,
      });

      if (!productDetailList) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
          totalCount: 0,
        };
      }

      productDetailList.forEach((product) => {
        if (product.productReview.length > 0) {
          const totalRating = product.productReview.reduce(
            (acc, review) => acc + (review.rating || 0),
            0,
          );
          (product as any).averageRating = Math.floor(
            totalRating / product.productReview.length,
          );
        } else {
          (product as any).averageRating = 0;
        }
      });

      return {
        status: true,
        message: 'Fetch Successfully',
        data: productDetailList,
        totalCount: productDetailListCount,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in getAllProduct',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method relatedAllProduct
   * @description Retrieves products related by shared tags, excluding the current product.
   */
  async relatedAllProduct(
    page: any,
    limit: any,
    tagIds: any,
    userId: any,
    productId: any,
  ) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize;
      const sortType = 'desc';
      const userID = parseInt(userId);
      const productID = parseInt(productId);

      if (!productID) {
        return {
          status: false,
          message: 'productId is required!',
          data: [],
          totalCount: 0,
        };
      }

      const tagIdsArray = tagIds
        .split(',')
        .map((id: string) => parseInt(id.trim()));

      let whereCondition: any = {
        id: {
          not: productID,
        },
        productType: 'P',
        status: 'ACTIVE',
        productTags: {
          some: {
            tagId: {
              in: tagIdsArray,
            },
          },
        },
      };

      let productDetailList = await this.prisma.product.findMany({
        where: whereCondition,
        include: {
          product_productShortDescription: { where: { status: 'ACTIVE' } },
          productImages: { where: { status: 'ACTIVE' } },
          productReview: {
            where: { status: 'ACTIVE' },
            select: {
              rating: true,
            },
          },
          product_wishlist: {
            where: { userId: userID },
            select: {
              userId: true,
              productId: true,
            },
          },
          product_productPrice: {
            where: {
              status: 'ACTIVE',
            },
            include: {
              productPrice_productSellerImage: true,
              adminDetail: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  accountName: true,
                  profilePicture: true,
                  tradeRole: true,
                  userProfile: {
                    select: {
                      profileType: true,
                      logo: true,
                      companyName: true,
                    },
                  },
                },
              },
            },
            orderBy: {
              offerPrice: 'asc',
            },
            take: 1,
          },
        },
        orderBy: { createdAt: sortType },
        skip,
        take: pageSize,
      });

      let productDetailListCount = await this.prisma.product.count({
        where: whereCondition,
      });

      if (!productDetailList) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
          totalCount: 0,
        };
      }

      productDetailList.forEach((product) => {
        if (product.productReview.length > 0) {
          const totalRating = product.productReview.reduce(
            (acc, review) => acc + (review.rating || 0),
            0,
          );
          (product as any).averageRating = Math.floor(
            totalRating / product.productReview.length,
          );
        } else {
          (product as any).averageRating = 0;
        }
      });

      return {
        status: true,
        message: 'Fetch Successfully',
        data: productDetailList,
        totalCount: productDetailListCount,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in relatedAllProduct',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method sameBrandAllProduct
   * @description Retrieves products sharing the same brand, excluding the current product.
   */
  async sameBrandAllProduct(
    page: any,
    limit: any,
    req: any,
    brandIds: any,
    userId: any,
    productId: any,
  ) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize;
      const sortType = 'desc';
      const userID = parseInt(userId);
      const productID = parseInt(productId);

      if (!productID) {
        return {
          status: false,
          message: 'productId is required!',
          data: [],
          totalCount: 0,
        };
      }

      let whereCondition: any = {
        id: {
          not: productID,
        },
        productType: 'P',
        status: 'ACTIVE',
        brandId: brandIds
          ? {
              in: brandIds.split(',').map((id) => parseInt(id.trim())),
            }
          : undefined,
      };

      let productDetailList = await this.prisma.product.findMany({
        where: whereCondition,
        include: {
          product_productShortDescription: { where: { status: 'ACTIVE' } },
          productImages: { where: { status: 'ACTIVE' } },
          productReview: {
            where: { status: 'ACTIVE' },
            select: {
              rating: true,
            },
          },
          product_wishlist: {
            where: { userId: userID },
            select: {
              userId: true,
              productId: true,
            },
          },
          product_productPrice: {
            where: {
              status: 'ACTIVE',
            },
            include: {
              productPrice_productSellerImage: true,
              adminDetail: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  accountName: true,
                  profilePicture: true,
                  tradeRole: true,
                  userProfile: {
                    select: {
                      profileType: true,
                      logo: true,
                      companyName: true,
                    },
                  },
                },
              },
            },
            orderBy: {
              offerPrice: 'asc',
            },
            take: 1,
          },
        },
        orderBy: { createdAt: sortType },
        skip,
        take: pageSize,
      });

      let productDetailListCount = await this.prisma.product.count({
        where: whereCondition,
      });

      if (!productDetailList) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
          totalCount: 0,
        };
      }

      productDetailList.forEach((product) => {
        if (product.productReview.length > 0) {
          const totalRating = product.productReview.reduce(
            (acc, review) => acc + (review.rating || 0),
            0,
          );
          (product as any).averageRating = Math.floor(
            totalRating / product.productReview.length,
          );
        } else {
          (product as any).averageRating = 0;
        }
      });

      return {
        status: true,
        message: 'Fetch Successfully',
        data: productDetailList,
        totalCount: productDetailListCount,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in sameBrandAllProduct',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method searchExistingProducts
   * @description Searches existing products with filters for text, category, brand, and price range.
   */
  async searchExistingProducts(
    page: number,
    limit: number,
    req: any,
    term?: string,
    sort?: string,
    brandIds?: string,
    priceMin?: number,
    priceMax?: number,
    categoryIds?: string,
  ) {
    try {
      let Page = parseInt(page.toString()) || 1;
      let pageSize = parseInt(limit.toString()) || 10;
      const skip = (Page - 1) * pageSize;
      let searchTerm = term?.length > 0 ? term : '';
      const sortType = sort ? sort : 'desc';
      const userId = req?.user?.id;
      const adminId = await this.helperService.getAdminId(userId);

      if (!adminId) {
        return {
          status: false,
          message: 'Admin ID not found',
          data: [],
          totalCount: 0,
        };
      }

      let whereCondition: any = {
        deletedAt: null,
        status: 'ACTIVE',
      };

      if (searchTerm) {
        whereCondition.OR = [
          {
            productName: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
          {
            skuNo: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
        ];
      }

      if (categoryIds) {
        whereCondition.categoryId = {
          in: categoryIds.split(',').map((id) => parseInt(id.trim())),
        };
      }

      if (brandIds) {
        whereCondition.brandId = {
          in: brandIds.split(',').map((id) => parseInt(id.trim())),
        };
      }

      if (priceMin && priceMax) {
        whereCondition.offerPrice = {
          gte: parseFloat(priceMin.toString()),
          lte: parseFloat(priceMax.toString()),
        };
      }

      const existingProducts = await this.prisma.existingProduct.findMany({
        where: whereCondition,
        include: {
          existingProductImages: true,
          existingProductTags: {
            include: {
              existingProductTag: true,
            },
          },
          category: true,
          brand: true,
          placeOfOrigin: true,
        },
        orderBy: {
          createdAt: sortType === 'desc' ? 'desc' : 'asc',
        },
        skip,
        take: pageSize,
      });

      const totalCount = await this.prisma.existingProduct.count({
        where: whereCondition,
      });

      return {
        status: true,
        message: 'Existing products fetched successfully',
        data: existingProducts,
        totalCount,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Server Error',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method searchExistingProductsForCopy
   * @description Searches existing products owned by the user for the copy workflow.
   */
  async searchExistingProductsForCopy(
    page: number,
    limit: number,
    req: any,
    term?: string,
    sort?: string,
    brandIds?: string,
    priceMin?: string,
    priceMax?: string,
    categoryIds?: string,
  ) {
    try {
      let Page = parseInt(page.toString()) || 1;
      let pageSize = parseInt(limit.toString()) || 10;
      const skip = (Page - 1) * pageSize;
      let searchTerm = term?.length > 0 ? term : '';
      const sortType = sort ? sort : 'desc';

      const userId = req?.user?.id;
      const adminId = await this.helperService.getAdminId(userId);

      if (!adminId) {
        return {
          status: false,
          message: 'Admin ID not found',
          data: [],
          totalCount: 0,
        };
      }

      let whereCondition: any = {
        deletedAt: null,
        status: 'ACTIVE',
        OR: [{ adminId: adminId }, { userId: adminId }, { addedBy: adminId }],
      };

      if (searchTerm) {
        whereCondition.OR = [
          ...whereCondition.OR,
          {
            productName: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
          {
            skuNo: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
        ];
      }

      if (brandIds) {
        whereCondition.brandId = {
          in: brandIds.split(',').map((id) => parseInt(id.trim())),
        };
      }

      if (priceMin && priceMax) {
        whereCondition.offerPrice = {
          gte: parseFloat(priceMin.toString()),
          lte: parseFloat(priceMax.toString()),
        };
      }

      if (categoryIds) {
        whereCondition.categoryId = {
          in: categoryIds.split(',').map((id) => parseInt(id.trim())),
        };
      }

      const existingProducts = await this.prisma.existingProduct.findMany({
        where: whereCondition,
        include: {
          existingProductImages: true,
          existingProductTags: {
            include: {
              existingProductTag: true,
            },
          },
          category: true,
          brand: true,
          placeOfOrigin: true,
        },
        orderBy: {
          createdAt: sortType === 'desc' ? 'desc' : 'asc',
        },
        skip,
        take: pageSize,
      });

      const totalCount = await this.prisma.existingProduct.count({
        where: whereCondition,
      });

      return {
        status: true,
        message: 'Existing products fetched successfully for copy',
        data: existingProducts,
        totalCount,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Server Error',
        error: getErrorMessage(error),
      };
    }
  }
}
