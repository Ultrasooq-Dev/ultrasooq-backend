/**
 * @file product-factory.service.ts
 * @description Extracted Factory/Custom product logic from the monolithic ProductService.
 *   Handles factory product listings, business-category recommendations, product
 *   duplication for factory sales, customisation requests, and factory order requests.
 *
 * @module ProductFactoryService
 * @phase B14 - Product Service Decomposition Part 2
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { getErrorMessage } from 'src/common/utils/get-error-message';
import { HelperService } from 'src/helper/helper.service';
import { ProductMediaService } from './product-media.service';

@Injectable()
export class ProductFactoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly helperService: HelperService,
    private readonly productMediaService: ProductMediaService,
  ) {}

  /**
   * @method getAllFactoriesProduct
   * @description Retrieves a paginated list of factories-type products (isCustomProduct='true')
   *   with search, brand, admin, sort, and userType filtering.
   */
  async getAllFactoriesProduct(
    page: any,

    limit: any,

    term: any,

    adminId: any,

    sortType: any,

    req: any,

    brandIds: any,

    userType: any,
  ) {
    try {
      let Page = parseInt(page) || 1;

      let pageSize = parseInt(limit) || 10;

      const skip = (Page - 1) * pageSize; // Calculate the offset

      let searchTerm = term?.length > 2 ? term : '';

      const adminID = parseInt(adminId);

      const userID = adminID;


      let sort = {};

      if (sortType == 'oldest') {
        sort = { createdAt: 'asc' };
      } else {
        sort = { createdAt: 'desc' };
      }

      let myProduct;

      if (req.query.isOwner == 'me') {
        myProduct = userID;
      } else {
        myProduct = undefined;
      }

      let where: Prisma.ProductWhereInput = {
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

        brandId: brandIds
          ? {
              in: brandIds.split(',').map((id) => parseInt(id.trim())),
            }
          : undefined,

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

      let getAllFactoriesProduct = await this.prisma.product.findMany({
        where: where,

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

        orderBy: sort,

        skip,

        take: pageSize,
      });

      if (!getAllFactoriesProduct) {
        return {
          status: false,

          message: 'Not Found',

          data: [],

          totalCount: 0,
        };
      }

      let getAllFactoriesProductCount = await this.prisma.product.count({
        where: where,
      });

      return {
        status: true,

        message: 'Fetch Successfully',

        data: getAllFactoriesProduct,

        totalCount: getAllFactoriesProductCount,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error, in getAllRfqProduct',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAllFactoriesProductByUserBusinessCategory
   * @description Retrieves factories products matching the user's business category tags.
   */
  async getAllFactoriesProductByUserBusinessCategory(req: any) {
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

      const adminID = parseInt(req.query.adminId);

      const userID = adminID;


      let sort = {};

      if (req.query.sortType == 'oldest') {
        sort = { createdAt: 'asc' };
      } else {
        sort = { createdAt: 'desc' };
      }

      let myProduct;

      if (req.query.isOwner == 'me') {
        myProduct = userID;
      } else {
        myProduct = undefined;
      }

      let where: Prisma.ProductWhereInput = {
        productType: {
          in: ['P'],
        },

        status: 'ACTIVE',

        productName: {
          contains: searchTerm,

          mode: 'insensitive',
        },

        product_productPrice: {
          some: {
            isCustomProduct: 'true',

            status: 'ACTIVE',
          },
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

        adminId: myProduct,
      };

      let getAllFactoriesProduct = await this.prisma.product.findMany({
        where: where,

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

        orderBy: sort,

        skip,

        take: pageSize,
      });

      if (!getAllFactoriesProduct) {
        return {
          status: false,

          message: 'Not Found',

          data: [],

          totalCount: 0,
        };
      }

      let getAllFactoriesProductCount = await this.prisma.product.count({
        where: where,
      });

      return {
        status: true,

        message: 'Fetch Successfully',

        categoryIdsFromConnectTo: categoryIdsFromConnectTo,

        categoryIdsFromCategory: categoryIdsFromCategory,

        businessCategoryIds: businessCategoryIds,

        productCategoryIds: productCategoryIds,

        data: getAllFactoriesProduct,

        totalCount: getAllFactoriesProductCount,
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
   * @method addProductDuplicateFactories
   * @description Duplicates an existing product into the factories system, creating
   *   a factory-specific productPrice (isCustomProduct='true', menuId=10) with
   *   full child-record cloning (images, tags, descriptions, specifications).
   */
  async addProductDuplicateFactories(payload: any, req: any) {
    try {
      const adminId = req?.user?.id;

      const userId = payload?.userId || req?.user?.id;

      const ID = parseInt(payload?.productId);

      let findProduct = await this.prisma.product.findUnique({
        where: {
          id: ID,
        },

        include: {
          category: {
            where: { status: 'ACTIVE' },

            include: {
              category_dynamicFormCategory: {
                include: {
                  formIdDetail: {
                    include: {
                      elements: true,
                    },
                  },
                },
              },
            },
          },

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

          product_productShortDescription: { where: { status: 'ACTIVE' } },

          product_productSpecification: { where: { status: 'ACTIVE' } },

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
        },
      });

      if (!findProduct) {
        return {
          status: false,

          message: 'Product not found',
        };
      }

      // Construct new lists

      let productTagList = findProduct.productTags.map((tag) => ({
        tagId: tag.tagId,
      }));

      let productImagesList = findProduct.productImages.map((img) => ({
        imageName: img?.image,

        image: img?.image,

        videoName: img?.videoName,

        video: img?.video,
      }));

      let productShortDescriptionList =
        findProduct.product_productShortDescription.map((desc) => ({
          shortDescription: desc.shortDescription || '',
        }));

      let productPriceList = findProduct.product_productPrice.map((price) => ({
        productPrice: price.productPrice,

        offerPrice: price.offerPrice,

        status: 'ACTIVE',

        stock: price.stock || undefined,

        deliveryAfter: price.deliveryAfter || undefined,

        timeOpen: price.timeOpen || undefined,

        timeClose: price.timeClose || undefined,

        consumerType: price.consumerType || undefined,

        sellType: price.sellType || undefined,

        vendorDiscount: price.vendorDiscount || undefined,

        consumerDiscount: price.consumerDiscount || undefined,

        minQuantity: price.minQuantity || undefined,

        maxQuantity: price.maxQuantity || undefined,

        productCondition: price.productCondition || undefined,

        minCustomer: price.minCustomer || undefined,

        maxCustomer: price.maxCustomer || undefined,

        minQuantityPerCustomer: price.minQuantityPerCustomer || undefined,

        maxQuantityPerCustomer: price.maxQuantityPerCustomer || undefined,

        askForStock: price.askForStock || undefined,

        askForPrice: price.askForPrice || undefined,
      }));

      let productSpecificationList =
        findProduct.product_productSpecification.map((spec) => ({
          label: spec.label || '',

          specification: spec.specification || '',
        }));

      // Create a new product in the database

      let newProduct = await this.prisma.product.create({
        data: {
          adminId: userId,

          userId: userId,

          productName: findProduct.productName,

          productType: 'F',

          typeOfProduct: findProduct.typeOfProduct,

          categoryId: findProduct.categoryId,

          categoryLocation: findProduct.categoryLocation,

          brandId: findProduct.brandId,

          placeOfOriginId: findProduct.placeOfOriginId,

          skuNo: new Date().toISOString(),

          description: findProduct.description,

          status: 'ACTIVE',

          productPrice: 0,

          offerPrice: 0,
        },
      });

      if (productTagList && productTagList.length > 0) {

        for (let i = 0; i < productTagList.length; i++) {

          let addProductTags = await this.prisma.productTags.create({
            data: {
              productId: newProduct.id,

              tagId: productTagList[i].tagId,
            },
          });
        }
      }

      if (productImagesList && productImagesList.length > 0) {

        for (let j = 0; j < productImagesList.length; j++) {
          let addProductImages = await this.prisma.productImages.create({
            data: {
              productId: newProduct.id,

              imageName: productImagesList[j]?.imageName,

              image: productImagesList[j]?.image,

              videoName: productImagesList[j]?.videoName,

              video: productImagesList[j]?.video,
            },
          });
        }
      }

      if (productPriceList && productPriceList.length > 0) {
        for (let k = 0; k < productPriceList.length; k++) {
          let addProductPrice = await this.prisma.productPrice.create({
            data: {
              productId: newProduct.id,

              adminId: userId,

              status: 'ACTIVE',

              productPrice: productPriceList[k].productPrice || 0,

              offerPrice: productPriceList[k].offerPrice || 0,

              stock: productPriceList[k].stock || undefined,

              deliveryAfter: productPriceList[k].deliveryAfter || undefined,

              timeOpen: productPriceList[k].timeOpen || undefined,

              timeClose: productPriceList[k].timeClose || undefined,

              consumerType: productPriceList[k].consumerType || undefined,

              sellType: productPriceList[k].sellType || undefined,

              vendorDiscount: productPriceList[k].vendorDiscount || undefined,

              consumerDiscount:
                productPriceList[k].consumerDiscount || undefined,

              minQuantity: productPriceList[k].minQuantity || undefined,

              maxQuantity: productPriceList[k].maxQuantity || undefined,

              productCondition:
                productPriceList[k].productCondition || undefined,

              minCustomer: productPriceList[k].minCustomer || undefined,

              maxCustomer: productPriceList[k].maxCustomer || undefined,

              minQuantityPerCustomer:
                productPriceList[k].minQuantityPerCustomer || undefined,

              maxQuantityPerCustomer:
                productPriceList[k].maxQuantityPerCustomer || undefined,

              askForStock: productPriceList[k]?.askForStock || 'false',

              askForPrice: productPriceList[k]?.askForPrice || 'false',
            },
          });

          try {
            const barcodeImageProductPrice =
              await this.productMediaService.generateBarcodeForProductPrice(
                addProductPrice.id.toString(),

                newProduct.id.toString(),

                adminId.toString(),
              );

            await this.prisma.productPrice.update({
              where: { id: addProductPrice.id },

              data: { productPriceBarcode: barcodeImageProductPrice },
            });
          } catch (error) {
          }
        }
      }

      if (
        productShortDescriptionList &&
        productShortDescriptionList.length > 0
      ) {
        for (let s = 0; s < productShortDescriptionList.length; s++) {
          let addProductImages = await this.prisma.productShortDescription.create({
            data: {
              productId: newProduct.id,

              adminId: userId,

              shortDescription:
                productShortDescriptionList[s]?.shortDescription,
            },
          });
        }
      }

      if (productSpecificationList && productSpecificationList.length > 0) {
        for (let i = 0; i < productSpecificationList.length; i++) {
          let addProductSpecifications =
            await this.prisma.productSpecification.create({
              data: {
                productId: newProduct.id,

                adminId: userId,

                label: productSpecificationList[i]?.label,

                specification: productSpecificationList[i]?.specification,
              },
            });
        }
      }

      // Generate the barcode for the product

      const barcodeImage = await this.productMediaService.generateBarcode(
        newProduct.id.toString(),

        newProduct.productName,

        newProduct?.skuNo || '',
      );

      // Save the barcode image URL or data to the product in the database

      await this.prisma.product.update({
        where: { id: newProduct.id },

        data: { barcode: barcodeImage },
      });

      let addProductDuplicateFactories =
        await this.prisma.productDuplicateFactories.create({
          data: {
            adminId: userId,

            userId: userId,

            productId: payload?.productId,
          },
        });

      return {
        status: true,

        message: 'Created Successfully',

        data: addProductDuplicateFactories,

        newProduct: newProduct,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error, in addProductDuplicateFactories',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method addCustomizeProduct
   * @description Creates a customised product variant from a factory product.
   */
  async addCustomizeProduct(payload: any, req: any) {
    try {
      // Handle both user object structures (from User model or custom object)

      const adminId = req.user.id || req.user.userId;

      const quantity = payload.quantity;

      if (!payload.productId) {
        return {
          status: false,

          message: 'productId is required',
        };
      }

      const productId = parseInt(payload?.productId);

      let productDetail = await this.prisma.product.findUnique({
        where: {
          id: productId,
        },
      });

      let newCustomizeProduct = await this.prisma.customizeProduct.create({
        data: {
          sellerId: productDetail.adminId,

          buyerId: adminId,

          productId: productId,

          note: payload.note,

          fromPrice: payload?.fromPrice,

          toPrice: payload?.toPrice,
        },
      });

      let customizeProductImages = [];

      if (payload.customizeproductImageList?.length > 0) {
        customizeProductImages = await Promise.all(
          payload.customizeproductImageList.map((img) =>
            this.prisma.customizeProductImage.create({
              data: {
                productId: productId,

                customizeProductId: newCustomizeProduct.id,

                link: img.link,

                linkType: img.linkType,
              },
            }),
          ),
        );
      }

      return {
        status: true,

        message: 'Created Successfully',

        data: {
          ...newCustomizeProduct,

          customizeProductImages,
        },
      };
    } catch (error) {
      return {
        status: false,

        message: 'error, in addCustomizeProduct',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method createFactoriesRequest
   * @description Creates a request to a factory for product manufacturing.
   */
  async createFactoriesRequest(payload, req) {
    try {
      const {
        address,

        city,

        province,

        postCode,

        country,

        firstName,

        lastName,

        phoneNumber,

        cc,

        factoriesCartIds,

        factoriesDate,
      } = payload;

      if (
        !factoriesCartIds ||
        !Array.isArray(factoriesCartIds) ||
        factoriesCartIds.length === 0
      ) {
        return {
          status: false,

          message: 'Invalid factoriesCartIds. It must be a non-empty array.',
        };
      }

      // Fetch all factoriesCart details in one query

      const factoriesCartDetails = await this.prisma.factoriesCart.findMany({
        where: { id: { in: factoriesCartIds } },
      });

      if (factoriesCartDetails.length !== factoriesCartIds.length) {
        return {
          status: false,

          message: 'One or more factoriesCartIds are invalid.',
        };
      }

      const userId = req.user?.id; // Assuming user ID is stored in req.user

      if (!userId) {
        return {
          status: false,

          message: 'User authentication required.',
        };
      }

      const createdRequests = await Promise.all(
        factoriesCartIds.map(async (factoriesCartId) => {
          let factoriesCartDetail = await this.prisma.factoriesCart.findUnique({
            where: {
              id: factoriesCartId,
            },
          });

          let customizeProductDetail = await this.prisma.customizeProduct.findUnique(
            {
              where: {
                id: factoriesCartDetail.customizeProductId,
              },
            },
          );

          return await this.prisma.factoriesRequest.create({
            data: {
              buyerId: userId,

              sellerId: customizeProductDetail.sellerId,

              productId: factoriesCartDetail.productId,

              customizeProductId: factoriesCartDetail.customizeProductId,

              quantity: factoriesCartDetail.quantity,

              fromPrice: customizeProductDetail?.fromPrice,

              toPrice: customizeProductDetail?.toPrice,

              address,

              city,

              province,

              postCode,

              country,

              firstName,

              lastName,

              phoneNumber,

              cc,

              factoriesDate: new Date(factoriesDate),

              status: 'ACTIVE',
            },
          });
        }),
      );

      await Promise.all(
        factoriesCartIds.map((cartId) =>
          this.prisma.factoriesCart.delete({ where: { id: cartId } }),
        ),
      );

      return {
        status: true,

        message: 'Factories requests created successfully.',

        data: createdRequests,
      };
    } catch (error) {

      return {
        status: false,

        message: 'Error in createFactoriesRequest API',

        error: getErrorMessage(error),
      };
    }
  }
}
