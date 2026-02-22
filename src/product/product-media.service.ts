/**
 * @file product-media.service.ts
 * @description Extracted media, barcode generation, and analytics tracking logic
 *   from the monolithic ProductService. Handles barcode generation, product view
 *   tracking, click tracking, search tracking, and most-sold/most-viewed analytics.
 *
 * @module ProductMediaService
 * @phase B13 - Product Service Decomposition Part 1
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from 'src/auth/auth.service';
import { getErrorMessage } from 'src/common/utils/get-error-message';
import { Prisma } from '../generated/prisma/client';
import * as bwipjs from 'bwip-js';

@Injectable()
export class ProductMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  /**
   * @method generateBarcode
   * @description Generates a Code128 barcode image encoding productId-productName-sku.
   */
  async generateBarcode(
    productId: string,
    productName: string,
    sku: string,
  ): Promise<string> {
    const barcodeData = `${productId}-${productName}-${sku}`;

    const barcodeOptions = {
      bcid: 'code128',
      text: barcodeData,
      scale: 3,
      height: 10,
      includetext: true,
    };

    return new Promise((resolve, reject) => {
      bwipjs.toBuffer(barcodeOptions, (err, png) => {
        if (err) {
          reject(err);
        } else {
          const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
          resolve(dataUrl);
        }
      });
    });
  }

  /**
   * @method generateBarcodeForProductPrice
   * @description Generates a Code128 barcode for a product-price entry.
   */
  async generateBarcodeForProductPrice(
    productId: string,
    productPriceId: string,
    adminId: string,
  ) {
    const barcodeData = `${productId}-${productPriceId}-${adminId}`;

    const barcodeOptions = {
      bcid: 'code128',
      text: barcodeData,
      scale: 3,
      height: 10,
      includetext: true,
    };

    return new Promise((resolve, reject) => {
      bwipjs.toBuffer(barcodeOptions, (err, png) => {
        if (err) {
          reject(err);
        } else {
          const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
          resolve(dataUrl);
        }
      });
    });
  }

  /**
   * @method productViewCount
   * @description Increments the global view count and tracks individual user/device views.
   */
  async productViewCount(req: any) {
    try {
      const productId = req?.query?.productId;
      let userId = req?.user?.id;
      const deviceId = req?.query?.deviceId || req?.body?.deviceId;

      if (!userId && req?.headers?.authorization) {
        try {
          const authHeader = req.headers.authorization;
          if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const validationResult = await this.authService.validateToken(token);
            if (!validationResult.error && validationResult.user) {
              userId = validationResult.user.id;
            }
          }
        } catch (error) {
          // If token validation fails, continue without userId
        }
      }

      if (!productId) {
        return {
          status: false,
          message: 'productId is required',
          data: [],
        };
      }

      const productIdInt = parseInt(productId);

      await this.prisma.product.update({
        where: { id: productIdInt },
        data: {
          productViewCount: {
            increment: 1,
          },
        },
      });

      const finalDeviceId = deviceId || (userId ? undefined : 'anonymous');

      if (userId || finalDeviceId) {
        const whereClause: any = {
          productId: productIdInt,
          deletedAt: null,
        };

        if (userId) {
          whereClause.userId = userId;
        } else if (finalDeviceId) {
          whereClause.deviceId = finalDeviceId;
        }

        const existingView = await this.prisma.productView.findFirst({
          where: whereClause,
        });

        if (existingView) {
          await this.prisma.productView.update({
            where: { id: existingView.id },
            data: {
              viewCount: { increment: 1 },
              lastViewedAt: new Date(),
            },
          });
        } else {
          await this.prisma.productView.create({
            data: {
              userId: userId || undefined,
              deviceId: finalDeviceId || undefined,
              productId: productIdInt,
              viewCount: 1,
              lastViewedAt: new Date(),
            },
          });
        }
      }

      return {
        status: true,
        message: 'Product view count updated successfully',
        data: [],
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in productViewCount',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method trackProductClick
   * @description Records a product click event.
   */
  async trackProductClick(req: any, payload: { productId: number; clickSource?: string }) {
    try {
      const userId = req?.user?.id;
      const deviceId = req?.query?.deviceId || req?.body?.deviceId;

      if (!payload?.productId) {
        return {
          status: false,
          message: 'productId is required',
        };
      }

      await this.prisma.productClick.create({
        data: {
          userId: userId || undefined,
          deviceId: deviceId || undefined,
          productId: payload.productId,
          clickSource: payload.clickSource || 'unknown',
        },
      });

      return {
        status: true,
        message: 'Product click tracked successfully',
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in trackProductClick',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method trackProductSearch
   * @description Records a product search event.
   */
  async trackProductSearch(req: any, payload: { searchTerm: string; productId?: number; clicked?: boolean }) {
    try {
      const userId = req?.user?.id;
      const deviceId = req?.query?.deviceId || req?.body?.deviceId;

      if (!payload?.searchTerm) {
        return {
          status: false,
          message: 'searchTerm is required',
        };
      }

      await this.prisma.productSearch.create({
        data: {
          userId: userId || undefined,
          deviceId: deviceId || undefined,
          searchTerm: payload.searchTerm,
          productId: payload.productId || undefined,
          clicked: payload.clicked || false,
        },
      });

      return {
        status: true,
        message: 'Product search tracked successfully',
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in trackProductSearch',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getMostSoldProducts
   * @description Retrieves products sorted by total order quantity (most sold first).
   */
  async getMostSoldProducts(req: any) {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 100000;
      const skip = (page - 1) * limit;

      const mostSoldProducts = await this.prisma.orderProducts.groupBy({
        by: ['productId'],
        _sum: {
          orderQuantity: true,
        },
        where: {
          deletedAt: null,
          productId: {
            not: null,
          },
        },
        orderBy: {
          _sum: {
            orderQuantity: 'desc',
          },
        },
        skip,
        take: limit,
      });

      const productIds = mostSoldProducts.map((p) => p.productId);

      const products = await this.prisma.product.findMany({
        where: {
          id: { in: productIds },
          deletedAt: null,
        },
        include: {
          brand: true,
          category: true,
          productImages: true,
          product_productShortDescription: { where: { status: 'ACTIVE' } },
          product_productPrice: {
            where: {
              status: 'ACTIVE',
            },
            include: {
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
          },
        },
      });

      const productMap = new Map<number, any>();
      products.forEach((p) => productMap.set(p.id, p));

      const finalResult = mostSoldProducts
        .map((item) => {
          const product = productMap.get(item.productId);
          if (!product) return null;
          return {
            ...product,
            totalSold: item._sum.orderQuantity || 0,
          };
        })
        .filter(Boolean);

      const totalCount = await this.prisma.orderProducts.groupBy({
        by: ['productId'],
        where: {
          deletedAt: null,
          productId: {
            not: null,
          },
        },
      });

      return {
        status: true,
        message: 'Most sold products fetched successfully',
        data: finalResult,
        mostSoldProducts,
        productIds,
        totalproducts: finalResult.length,
        pagination: {
          total: totalCount.length,
          page,
          limit,
          totalPages: Math.ceil(totalCount.length / limit),
        },
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
   * @method getProductMostViewCount
   * @description Retrieves products sorted by view count across three categories:
   *   standard store, buy-group, and factories products.
   */
  async getProductMostViewCount(req: any) {
    try {
      let Page = parseInt(req?.query?.page) || 1;
      let pageSize = parseInt(req?.query?.limit) || 4;
      const skip = (Page - 1) * pageSize;
      const currentDateTime = new Date();
      const sortType = 'desc';

      // Standard store products
      let productWhereCondition: any = {
        productType: {
          in: ['P', 'F'],
        },
        status: 'ACTIVE',
        product_productPrice: {
          some: {
            askForPrice: 'false',
            isCustomProduct: 'false',
            sellType: 'NORMALSELL',
            status: 'ACTIVE',
          },
        },
      };

      let productDetailList = await this.prisma.product.findMany({
        where: productWhereCondition,
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
          product_productPrice: {
            where: {
              status: 'ACTIVE',
            },
            include: {
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
        orderBy: { productViewCount: sortType },
        skip,
        take: pageSize,
      });

      let productDetailListCount = await this.prisma.product.count({
        where: productWhereCondition,
      });

      // Buy Group Product
      let buyGroupwhereCondition: any = {
        productType: {
          in: ['P'],
        },
        status: 'ACTIVE',
        product_productPrice: {
          some: {
            sellType: 'BUYGROUP',
            status: 'ACTIVE',
            dateClose: {
              gt: currentDateTime,
            },
          },
        },
      };

      let getAllBuyGroupProduct = await this.prisma.product.findMany({
        where: buyGroupwhereCondition,
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
          product_productPrice: {
            where: {
              status: 'ACTIVE',
            },
            include: {
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
          },
          product_sellCountry: { where: { status: 'ACTIVE' } },
          product_sellState: { where: { status: 'ACTIVE' } },
          product_sellCity: { where: { status: 'ACTIVE' } },
          orderProducts: true,
        },
        orderBy: { productViewCount: sortType },
        skip,
        take: pageSize,
      });

      let getAllBuyGroupProductCount = await this.prisma.product.count({
        where: buyGroupwhereCondition,
      });

      // Factories Product
      let factoriesWhereCondition: Prisma.ProductWhereInput = {
        productType: {
          in: ['P'],
        },
        status: 'ACTIVE',
        product_productPrice: {
          some: {
            isCustomProduct: 'true',
            status: 'ACTIVE',
          },
        },
      };

      let getAllFactoriesProduct = await this.prisma.product.findMany({
        where: factoriesWhereCondition,
        include: {
          category: { where: { status: 'ACTIVE' } },
          brand: { where: { status: 'ACTIVE' } },
          placeOfOrigin: { where: { status: 'ACTIVE' } },
          productTags: {
            where: {
              status: 'ACTIVE',
            },
            include: {
              productTagsTag: true,
            },
          },
          productImages: { where: { status: 'ACTIVE' } },
          productReview: {
            where: { status: 'ACTIVE' },
            select: {
              rating: true,
            },
          },
          product_sellCountry: { where: { status: 'ACTIVE' } },
          product_sellState: { where: { status: 'ACTIVE' } },
          product_sellCity: { where: { status: 'ACTIVE' } },
          product_productPrice: {
            where: {
              status: 'ACTIVE',
            },
            include: {
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
          },
        },
        orderBy: { productViewCount: sortType },
        skip,
        take: pageSize,
      });

      let getAllFactoriesProductCount = await this.prisma.product.count({
        where: factoriesWhereCondition,
      });

      return {
        status: true,
        message: 'Fetch Successfully',
        product: {
          productDetailList: productDetailList,
          productTotalCount: productDetailListCount,
        },
        buyGroupProduct: {
          getAllBuyGroupProduct: getAllBuyGroupProduct,
          getAllBuyGroupProductCount: getAllBuyGroupProductCount,
        },
        factoriesProduct: {
          getAllFactoriesProduct: getAllFactoriesProduct,
          getAllFactoriesProductCount: getAllFactoriesProductCount,
        },
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
