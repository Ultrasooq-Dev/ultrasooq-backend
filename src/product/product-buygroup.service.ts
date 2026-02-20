/**
 * @file product-buygroup.service.ts
 * @description Extracted BuyGroup product logic from the monolithic ProductService.
 *   Handles buy-group product listing and business-category-based recommendations.
 *
 * @module ProductBuyGroupService
 * @phase B14 - Product Service Decomposition Part 2
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HelperService } from 'src/helper/helper.service';
import { getErrorMessage } from 'src/common/utils/get-error-message';

@Injectable()
export class ProductBuyGroupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly helperService: HelperService,
  ) {}

  /**
   * @method getAllBuyGroupProduct
   * @description Retrieves a paginated list of buy-group products (sellType='BUYGROUP',
   *   menuId=9) with full storefront filtering.
   */
  async getAllBuyGroupProduct(
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

      const skip = (Page - 1) * pageSize; // Calculate the offset

      let searchTerm = term?.length > 2 ? term : '';

      const sortType = sort ? sort : 'desc';

      const userID = parseInt(userId);

      let myProduct;

      if (req.query.isOwner == 'me') {
        myProduct = userID;
      } else {
        myProduct = undefined;
      }

      const currentDateTime = new Date();

      let whereCondition: any = {
        productType: {
          in: ['P'],
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
            sellType: 'BUYGROUP',

            status: 'ACTIVE',

            dateClose: {
              gt: currentDateTime,
            },
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

      let getAllBuyGroupProduct = await this.prisma.product.findMany({
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
          },

          product_sellCountry: { where: { status: 'ACTIVE' } },

          product_sellState: { where: { status: 'ACTIVE' } },

          product_sellCity: { where: { status: 'ACTIVE' } },

          orderProducts: true,
        },

        orderBy: { createdAt: sortType },

        skip, // Offset

        take: pageSize, // Limit
      });

      let getAllBuyGroupProductCount = await this.prisma.product.count({
        where: whereCondition,
      });

      if (!getAllBuyGroupProduct) {
        return {
          status: false,

          message: 'Not Found',

          data: [],

          totalCount: 0,
        };
      }

      return {
        status: true,

        message: 'Fetch Successfully',

        data: getAllBuyGroupProduct,

        totalCount: getAllBuyGroupProductCount,
      };
    } catch (error) {

      return {
        status: false,

        message: 'error in getAllBuyGroupProduct',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAllBuyGroupProductByUserBusinessCategory
   * @description Retrieves buy-group products matching the user's business category tags.
   */
  async getAllBuyGroupProductByUserBusinessCategory(req: any) {
    try {
      let userId = req?.user?.id;

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

      // actual code

      let Page = parseInt(req.query.page) || 1;

      let pageSize = parseInt(req.query.limit) || 10;

      const skip = (Page - 1) * pageSize; // Calculate the offset

      let searchTerm = req.query.term?.length > 2 ? req.query.term : '';

      const sortType = req.query.sort ? req.query.sort : 'desc';

      const userID = parseInt(userId);

      let myProduct;

      if (req.query.isOwner == 'me') {
        myProduct = userID;
      } else {
        myProduct = undefined;
      }

      const currentDateTime = new Date();

      let whereCondition: any = {
        productType: {
          in: ['P'],
        },

        status: 'ACTIVE',

        productName: {
          contains: searchTerm,

          mode: 'insensitive',
        },

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
            sellType: 'BUYGROUP',

            status: 'ACTIVE',

            dateClose: {
              gt: currentDateTime,
            },
          },
        },

        adminId: myProduct,
      };

      if (req.query.priceMin && req.query.priceMax) {
        whereCondition.offerPrice = {
          gte: parseFloat(req.query.priceMin),

          lte: parseFloat(req.query.priceMax),
        };
      }

      let getAllBuyGroupProduct = await this.prisma.product.findMany({
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
          },

          product_sellCountry: { where: { status: 'ACTIVE' } },

          product_sellState: { where: { status: 'ACTIVE' } },

          product_sellCity: { where: { status: 'ACTIVE' } },

          orderProducts: true,
        },

        orderBy: { createdAt: sortType },

        skip, // Offset

        take: pageSize, // Limit
      });

      let getAllBuyGroupProductCount = await this.prisma.product.count({
        where: whereCondition,
      });

      if (!getAllBuyGroupProduct) {
        return {
          status: false,

          message: 'Not Found',

          data: [],

          totalCount: 0,
        };
      }

      return {
        status: true,

        message: 'Fetch Successfully',

        categoryIdsFromConnectTo: categoryIdsFromConnectTo,

        categoryIdsFromCategory: categoryIdsFromCategory,

        businessCategoryIds: businessCategoryIds,

        productCategoryIds: productCategoryIds,

        data: getAllBuyGroupProduct,

        totalCount: getAllBuyGroupProductCount,
      };
    } catch (error) {

      return {
        status: false,

        message: 'error in getAllProductByUserBusinessCategory',

        error: getErrorMessage(error),
      };
    }
  }
}
