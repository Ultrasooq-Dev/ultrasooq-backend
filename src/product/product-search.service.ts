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
