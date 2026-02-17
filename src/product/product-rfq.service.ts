/**
 * @file product-rfq.service.ts
 * @description Extracted RFQ (Request for Quote) logic from the monolithic
 *   ProductService. Handles all RFQ product CRUD, quote management, vendor
 *   location matching, and buyer/seller quote dashboards.
 *
 * @module ProductRfqService
 * @phase B14 - Product Service Decomposition Part 2
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { getErrorMessage } from 'src/common/utils/get-error-message';
import { HelperService } from 'src/helper/helper.service';
import { NotificationService } from 'src/notification/notification.service';

@Injectable()
export class ProductRfqService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly helperService: HelperService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * @method addRfqProduct
   * @description Creates a new RFQ product listing with associated images.
   */
  async addRfqProduct(payload: any, req: any) {
    try {
      const userId = req?.user?.id;

      const adminId = payload?.adminId || undefined;

      let addRfqProduct = await this.prisma.rFQProduct.create({
        data: {
          adminId: userId,

          userId: userId,

          type: 'R',

          productNote: payload?.productNote,

          rfqProductName: payload?.rfqProductName,
        },
      });

      if (
        payload.rfqProductImagesList &&
        payload.rfqProductImagesList.length > 0
      ) {
        for (let j = 0; j < payload.rfqProductImagesList.length; j++) {
          let rFQProductImages = await this.prisma.rFQProductImages.create({
            data: {
              rfqProductId: addRfqProduct.id,

              imageName: payload?.rfqProductImagesList[j]?.imageName,

              image: payload?.rfqProductImagesList[j]?.image,
            },
          });
        }
      }

      return {
        status: true,

        message: 'Created Successfully',

        data: addRfqProduct,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error, in addRfqProduct',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method editRfqProduct
   * @description Updates an existing RFQ product listing including tags and images.
   */
  async editRfqProduct(payload: any, req: any) {
    try {
      const rFqProductId = payload?.rFqProductId;

      let existRfqProduct = await this.prisma.rFQProduct.findUnique({
        where: { id: rFqProductId },
      });

      if (!existRfqProduct) {
        return {
          status: false,

          message: 'Not Found',

          data: [],
        };
      }

      let editRfqProduct = await this.prisma.rFQProduct.update({
        where: { id: rFqProductId },

        data: {
          productNote: payload?.productNote || existRfqProduct.productNote,

          rfqProductName:
            payload?.rfqProductName || existRfqProduct.rfqProductName,
        },
      });

      if (
        payload.rfqProductImagesList &&
        payload.rfqProductImagesList.length > 0
      ) {
        await this.prisma.rFQProductImages.deleteMany({
          where: { rfqProductId: rFqProductId },
        });

        for (let j = 0; j < payload.rfqProductImagesList.length; j++) {
          let addProductImages = await this.prisma.rFQProductImages.create({
            data: {
              rfqProductId: rFqProductId,

              imageName: payload?.rfqProductImagesList[j]?.imageName,

              image: payload?.rfqProductImagesList[j]?.image,
            },
          });
        }
      }

      return {
        status: true,

        message: 'Updated Successfully',

        data: [],
      };
    } catch (error) {
      return {
        status: false,

        message: 'error, in editRfqProduct',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getOneRfqProduct
   * @description Retrieves a single RFQ product by primary key with full includes.
   */
  async getOneRfqProduct(rfqProductId: any) {
    try {
      const rfqProductID = parseInt(rfqProductId);

      let getOneRfqProduct = await this.prisma.rFQProduct.findUnique({
        where: { id: rfqProductID },

        include: {
          rfqProductImage: true,

          rfqProduct_product: {
            include: {
              productImages: true,
            },
          },
        },
      });

      if (!getOneRfqProduct) {
        return {
          status: false,

          message: 'Not Found',

          data: [],
        };
      }

      return {
        status: true,

        message: 'Fetch Successfully',

        data: getOneRfqProduct,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error, in getOneRfqProduct',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAllRfqProduct
   * @description Retrieves a paginated list of RFQ products with search, brand, admin,
   *   and sort filtering.
   */
  async getAllRfqProduct(
    page: any,

    limit: any,

    term: any,

    adminId: any,

    sortType: any,

    req: any,

    brandIds: any,
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

      let productDuplicateRfq = await this.prisma.productDuplicateRfq.findMany({
        where: { userId: adminID },

        select: { productId: true },
      });

      let myProduct;

      if (req.query.isOwner == 'me') {
        myProduct = userID;
      } else {
        myProduct = undefined;
      }

      let where: Prisma.ProductWhereInput = {
        status: 'ACTIVE',

        typeOfProduct: 'BRAND',

        AND: [
          {
            OR: [
              { productType: 'P' },

              {
                AND: [{ productType: 'R' }, { userId: adminID }],
              },
            ],
          },

          {
            id: {
              notIn: productDuplicateRfq.map((entry) => entry.productId),
            },
          },
        ],

        productName: {
          contains: searchTerm,

          mode: 'insensitive',
        },

        brandId: brandIds
          ? {
              in: brandIds.split(',').map((id) => parseInt(id.trim())),
            }
          : undefined,

        adminId: myProduct,

        product_productPrice: {
          some: {
            sellType: 'NORMALSELL',

            status: 'ACTIVE',

            isCustomProduct: 'false',
          },
        },
      };

      let getAllRfqProduct = await this.prisma.product.findMany({
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

          product_rfqCart: {
            where: { userId: adminID },

            select: {
              userId: true,

              quantity: true,
            },
          },

          product_productPrice: {
            where: { status: 'ACTIVE' },
          },

          product_wishlist: {
            where: { userId: userID },

            select: {
              userId: true,

              productId: true,
            },
          },
        },

        orderBy: sort,

        skip,

        take: pageSize,
      });

      if (!getAllRfqProduct) {
        return {
          status: false,

          message: 'Not Found',

          data: [],

          totalCount: 0,
        };
      }

      let getAllRfqProductCount = await this.prisma.product.count({
        where: where,
      });

      return {
        status: true,

        message: 'Fetch Successfully',

        data: getAllRfqProduct,

        totalCount: getAllRfqProductCount,

        productDuplicateRfq: productDuplicateRfq,
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
   * @method rfqFindOne
   * @description Retrieves a single RFQ-type product with seller, wishlist, and review info.
   */
  async rfqFindOne(productId: any, req: any, userId: any) {
    try {
      const productID = parseInt(productId);

      if (!productID) {
        return {
          status: false,

          message: 'productId is missing',

          data: [],

          totalCount: 0,
        };
      }

      let productDetail = await this.prisma.product.findUnique({
        where: { id: productID },

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
            where: { status: 'ACTIVE' },

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

            take: 1, // Limit the result to only 1 row
          },
        },
      });

      if (!productDetail) {
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

        data: productDetail,

        totalCount: 1,
      };
    } catch (error) {

      return {
        status: false,

        message: 'error in findOne product',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method addProductDuplicateRfq
   * @description Duplicates an existing product into the RFQ system.
   */
  async addProductDuplicateRfq(payload: any, req: any) {
    try {
      const userId = payload?.userId || req?.user?.id;

      let addProductDuplicateRfq = await this.prisma.productDuplicateRfq.create({
        data: {
          adminId: userId,

          userId: userId,

          productId: payload?.productId,
        },
      });

      return {
        status: true,

        message: 'Created Successfully',

        data: addProductDuplicateRfq,
      };
    } catch (error) {
      return {
        status: false,

        message: 'error, in addProductDuplicateRfq',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method allCompanyFreelancer
   * @description Retrieves all company and freelancer users matching specific criteria
   *   for RFQ quote distribution.
   */
  async allCompanyFreelancer(payload: any, req: any) {
    try {
      const userId = req?.user?.id;

      let allUserList = await this.prisma.user.findMany({
        where: {
          id: {
            not: userId,
          },

          userType: 'USER',

          status: 'ACTIVE',

          tradeRole: { in: ['COMPANY', 'FREELANCER'] },
        },

        select: {
          id: true,
        },

        orderBy: { id: 'asc' },
        take: 1000, // Safety cap for vendor lists
      });

      if (!allUserList) {
        return {
          status: false,

          message: 'Not Found',

          data: [],
        };
      }

      return {
        status: false,

        message: 'Fetch Successfully',

        data: {
          allUser: allUserList,

          allUserCount: allUserList.length,
        },
      };
    } catch (error) {
      return {
        status: false,

        message: 'error, in allCompanyFreelancer',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getVendorsByLocation
   * @description Get vendors matching location criteria.
   *   Priority: UserBranch > UserAddress (main) > UserAddress (subaccounts)
   */
  async getVendorsByLocation(
    countryId?: number,
    stateId?: number,
    cityId?: number,
    excludeUserId?: number,
  ): Promise<number[]> {
    try {
      // If no location is selected, return all active vendors
      if (!countryId) {
        const allVendors = await this.prisma.user.findMany({
          where: {
            status: 'ACTIVE',
            tradeRole: { in: ['COMPANY', 'FREELANCER'] },
            id: excludeUserId ? { not: excludeUserId } : undefined,
          },
          select: {
            id: true,
          },
        });
        return allVendors.map((v) => v.id);
      }

      const vendorIds = new Set<number>();

      // Get country name if countryId is provided (for matching string-based country fields)
      let countryName: string | null = null;
      if (countryId) {
        const country = await this.prisma.countries.findUnique({
          where: { id: countryId },
          select: { name: true },
        });
        countryName = country?.name || null;
      }

      // Build location conditions based on what's selected
      const locationCondition: any = {};

      if (countryId && !stateId && !cityId) {
        locationCondition.OR = [
          { countryId: countryId },
          ...(countryName ? [{ country: countryName }] : []),
        ];
      } else {
        if (countryId) {
          locationCondition.AND = [
            {
              OR: [
                { countryId: countryId },
                ...(countryName ? [{ country: countryName }] : []),
              ],
            },
          ];
        }
        if (stateId) {
          if (!locationCondition.AND) locationCondition.AND = [];
          locationCondition.AND.push({ stateId: stateId });
        }
        if (cityId) {
          if (!locationCondition.AND) locationCondition.AND = [];
          locationCondition.AND.push({ cityId: cityId });
        }
      }

      // 1. Find vendors through UserBranch
      const branches = await this.prisma.userBranch.findMany({
        where: {
          ...locationCondition,
          status: 'ACTIVE',
          user: {
            status: 'ACTIVE',
            tradeRole: { in: ['COMPANY', 'FREELANCER', 'MEMBER'] },
            id: excludeUserId ? { not: excludeUserId } : undefined,
          },
        },
        select: {
          userId: true,
          user: {
            select: {
              id: true,
              tradeRole: true,
              isSubAccount: true,
              addedBy: true,
            },
          },
        },
      });

      // Add vendor IDs from branches
      for (const branch of branches) {
        const user = branch.user;
        if (user.tradeRole === 'MEMBER' && user.addedBy) {
          vendorIds.add(user.addedBy);
        } else if (user.tradeRole === 'COMPANY' || user.tradeRole === 'FREELANCER') {
          vendorIds.add(user.id);
        }
      }

      // 2. Find vendors through UserAddress
      const addressLocationCondition: any = {};

      if (countryId && !stateId && !cityId) {
        addressLocationCondition.OR = [
          { countryId: countryId },
          ...(countryName ? [{ country: countryName }] : []),
        ];
      } else {
        if (countryId) {
          addressLocationCondition.AND = [
            {
              OR: [
                { countryId: countryId },
                ...(countryName ? [{ country: countryName }] : []),
              ],
            },
          ];
        }
        if (stateId) {
          if (!addressLocationCondition.AND) addressLocationCondition.AND = [];
          addressLocationCondition.AND.push({ stateId: stateId });
        }
        if (cityId) {
          if (!addressLocationCondition.AND) addressLocationCondition.AND = [];
          addressLocationCondition.AND.push({ cityId: cityId });
        }
      }

      const addresses = await this.prisma.userAddress.findMany({
        where: {
          ...addressLocationCondition,
          userDetail: {
            status: 'ACTIVE',
            tradeRole: { in: ['COMPANY', 'FREELANCER', 'MEMBER'] },
            id: excludeUserId ? { not: excludeUserId } : undefined,
          },
        },
        include: {
          userDetail: {
            select: {
              id: true,
              tradeRole: true,
              isSubAccount: true,
              addedBy: true,
            },
          },
        },
      });

      // Add vendor IDs from addresses
      for (const address of addresses) {
        const user = address.userDetail;
        if (!user) continue;

        if (user.tradeRole === 'MEMBER' && user.addedBy) {
          vendorIds.add(user.addedBy);
        } else if (user.tradeRole === 'COMPANY' || user.tradeRole === 'FREELANCER') {
          vendorIds.add(user.id);
        }
      }

      // Convert Set to Array
      const finalVendorIds = Array.from(vendorIds);

      return finalVendorIds;
    } catch (error) {
      // On error, return empty array to be safe
      return [];
    }
  }

  /**
   * @method addRfqQuotes
   * @description Creates RFQ quote requests targeting specific sellers for a product,
   *   and dispatches notifications to each targeted seller.
   */
  async addRfqQuotes(payload: any, req: any) {
    try {
      const userId = req?.user?.id;

      // Extract location from payload
      const countryId = payload?.countryId
        ? parseInt(payload.countryId)
        : undefined;
      const stateId = payload?.stateId ? parseInt(payload.stateId) : undefined;
      const cityId = payload?.cityId ? parseInt(payload.cityId) : undefined;

      // Get vendors based on location
      const vendorIds = await this.getVendorsByLocation(
        countryId,
        stateId,
        cityId,
        userId,
      );

      if (vendorIds.length === 0) {
        return {
          status: false,
          message: 'No vendors found for the selected location. Please try a different location or contact support.',
          data: null,
        };
      }

      let totalPrice = 0;

      let rfqProductList = [];

      let allUserList = vendorIds.map((id) => ({ id }));

      for (let i = 0; i < payload.rfqCartIds.length; i++) {
        let rfqCartDetail = await this.prisma.rFQCart.findUnique({
          where: { id: payload.rfqCartIds[i] },

          select: {
            productId: true,

            quantity: true,

            offerPrice: true,

            note: true,

            offerPriceFrom: true,

            offerPriceTo: true,

            productType: true,
          },
        });

        let rfqProductDetails = await this.prisma.product.findUnique({
          where: { id: rfqCartDetail.productId },

          select: { id: true, offerPrice: true, userId: true },
        });

        let tempProductDetails = {
          productId: rfqProductDetails.id,

          quantity: rfqCartDetail?.quantity,

          offerPrice: rfqCartDetail?.offerPrice, // now not in use

          note: rfqCartDetail?.note,

          offerPriceFrom: rfqCartDetail?.offerPriceFrom,

          offerPriceTo: rfqCartDetail?.offerPriceTo,

          productType: rfqCartDetail?.productType,
        };

        rfqProductList.push(tempProductDetails);

        // calculate cart total

        const totalPriceForProduct =
          rfqCartDetail.quantity *
            parseFloat(rfqCartDetail.offerPriceTo?.toString()) || 0;

        totalPrice += totalPriceForProduct; // we are calculating offerPriceTo
      }

      // create rfq Quote Address

      let rfqQuotesAddress = await this.prisma.rfqQuoteAddress.create({
        data: {
          userId: userId,

          firstName: payload?.firstName,

          lastName: payload?.lastName,

          phoneNumber: payload?.phoneNumber,

          cc: payload?.cc,

          address: payload?.address,

          city: payload?.city,

          province: payload?.province,

          country: payload?.country,

          postCode: payload?.postCode,

          rfqDate: payload?.rfqDate ? new Date(payload.rfqDate) : null,

          countryId: countryId || null,

          stateId: stateId || null,

          cityId: cityId || null,
        },
      });

      // create rfq Quote

      let rfqQuotes = await this.prisma.rfqQuotes.create({
        data: {
          buyerID: userId,

          rfqQuoteAddressId: rfqQuotesAddress.id,
        },
      });

      // create rfq Quotes Product

      for (let i = 0; i < rfqProductList.length; i++) {
        let rfqQuotesProducts = await this.prisma.rfqQuotesProducts.create({
          data: {
            rfqQuotesId: rfqQuotes.id,

            rfqProductId: rfqProductList[i].productId,

            offerPrice: rfqProductList[i]?.offerPrice,

            note: rfqProductList[i]?.note,

            quantity: rfqProductList[i]?.quantity,

            productType: rfqProductList[i]?.productType || 'SAME',

            offerPriceFrom: rfqProductList[i]?.offerPriceFrom,

            offerPriceTo: rfqProductList[i]?.offerPriceTo,
          },
        });
      }

      for (let j = 0; j < allUserList.length; j++) {
        let rfqQuotesUsers = await this.prisma.rfqQuotesUsers.create({
          data: {
            rfqQuotesId: rfqQuotes.id,

            buyerID: userId,

            sellerID: allUserList[j].id,

            offerPrice: payload?.offerPrice || totalPrice || undefined,
          },
        });

        // Notify vendor about new RFQ
        try {
          await this.notificationService.createNotification({
            userId: allUserList[j].id,
            type: 'RFQ',
            title: 'New RFQ Request',
            message: 'You have received a new RFQ request. Check it out!',
            data: {
              rfqId: rfqQuotes.id,
            },
            link: `/seller-rfq-request`,
            icon: '📝',
          });
        } catch (notificationError) {
        }
      }

      // Notify buyer that RFQ quote was submitted
      try {
        await this.notificationService.createNotification({
          userId: userId,
          type: 'RFQ',
          title: 'RFQ Quote Submitted',
          message: 'Your RFQ quote has been submitted successfully',
          data: {
            rfqId: rfqQuotes.id,
          },
          link: `/rfq-quotes`,
          icon: '📝',
        });
      } catch (notificationError) {
      }

      let deleteCart = await this.prisma.rFQCart.deleteMany({
        where: {
          id: { in: payload.rfqCartIds },
        },
      });

      return {
        status: true,

        message: 'Created Successfully',

        data: [],
      };
    } catch (error) {

      return {
        status: false,

        message: 'error, in addRfqQuotes',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAllRfqQuotesByBuyerID
   * @description Retrieves all RFQ quotes created by the authenticated buyer, paginated.
   */
  async getAllRfqQuotesByBuyerID(page: any, limit: any, req: any) {
    try {
      let Page = parseInt(page) || 1;

      let pageSize = parseInt(limit) || 10;

      const skip = (Page - 1) * pageSize; // Calculate the offset

      let buyerID = req?.user?.id;

      let adminDetail = await this.prisma.user.findUnique({
        where: { id: buyerID },

        select: {
          id: true,

          tradeRole: true,

          addedBy: true,
        },
      });

      if (adminDetail && adminDetail.tradeRole === 'MEMBER') {
        buyerID = adminDetail.addedBy;
      }


      let getAllRfqQuotes = await this.prisma.rfqQuotes.findMany({
        where: {
          status: 'ACTIVE',

          buyerID: buyerID,
        },

        include: {
          rfqQuotes_rfqQuoteAddress: true,

          rfqQuotesProducts: {
            include: {
              rfqProductDetails: {
                include: {
                  productImages: true,
                },
              },
            },
          },
        },

        skip,

        take: pageSize,
      });

      if (!getAllRfqQuotes) {
        return {
          status: false,

          message: 'Not Found',

          data: [],
        };
      }

      let getAllRfqQuotesCount = await this.prisma.rfqQuotes.count({
        where: {
          status: 'ACTIVE',

          buyerID: buyerID,
        },
      });

      return {
        status: true,

        message: 'Not Found',

        data: getAllRfqQuotes,

        totalCount: getAllRfqQuotesCount,
      };
    } catch (error) {

      return {
        status: false,

        message: 'error, in getAllRfqQuotes',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method deleteOneRfqQuote
   * @description Soft-deletes a single RFQ quote (status='DELETE', deletedAt=now).
   */
  async deleteOneRfqQuote(rfqQuotesId: any, req: any) {
    try {
      const rfqQuotesID = parseInt(rfqQuotesId);

      let existRfqQuote = await this.prisma.rfqQuotes.findUnique({
        where: { id: rfqQuotesID },
      });

      if (!existRfqQuote) {
        return {
          status: false,

          message: 'Not Found',

          data: [],
        };
      }

      let deleteRfqQuote = await this.prisma.rfqQuotes.update({
        where: { id: rfqQuotesID },

        data: {
          status: 'DELETE',

          deletedAt: new Date(),
        },
      });

      return {
        status: true,

        message: 'Deleted Successfully',

        data: deleteRfqQuote,
      };
    } catch (error) {

      return {
        status: false,

        message: 'error, in deleteOneRfqQuote',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAllRfqQuotesUsersByBuyerID
   * @description Retrieves all sellers who received a specific RFQ quote from the buyer.
   */
  async getAllRfqQuotesUsersByBuyerID(
    page: any,

    limit: any,

    req: any,

    rfqQuotesId: any,
  ) {
    try {
      let Page = parseInt(page) || 1;

      let pageSize = parseInt(limit) || 10;

      const skip = (Page - 1) * pageSize; // Calculate the offset

      const buyerID = req?.user?.id;

      const rfqQuotesID = parseInt(rfqQuotesId);

      let getAllRfqQuotesUsersByBuyerID = await this.prisma.rfqQuotesUsers.findMany({
        where: {
          status: 'ACTIVE',

          buyerID: buyerID,

          rfqQuotesId: rfqQuotesID,
        },

        include: {
          sellerIDDetail: {
            select: {
              id: true,

              email: true,

              firstName: true,

              lastName: true,

              accountName: true,

              cc: true,

              phoneNumber: true,

              profilePicture: true,
            },
          },

          rfqQuotesUser_rfqQuotes: {
            include: {
              rfqQuotesProducts: {
                include: {
                  rfqProductDetails: {
                    include: {
                      productImages: true,
                    },
                  },
                },
              },
            },
          },
        },
        skip, // Offset
        take: pageSize, // Limit
      });

      if (!getAllRfqQuotesUsersByBuyerID) {
        return {
          status: false,

          message: 'Not Found',

          data: [],
        };
      }

      const usersWithUnreadMessages = await Promise.all(
        getAllRfqQuotesUsersByBuyerID.map(async (user) => {
          const unreadMessagesCount = await this.prisma.message.count({
            where: {
              rfqQuotesUserId: user.id,
              userId: user.sellerID,
              status: 'UNREAD',
            },
          });

          const lastUnreadMessage = await this.prisma.message.findFirst({
            where: {
              rfqQuotesUserId: user.id,
              userId: user.sellerID,
            },
            orderBy: {
              createdAt: 'desc',
            },
            select: {
              id: true,
              content: true,
              status: true,
              createdAt: true,
              roomId: true,
              userId: true,
            },
          });

          const rfqProductPriceRequests =
            await this.prisma.rfqQuoteProductPriceRequest.findMany({
              where: {
                rfqQuoteId: user.rfqQuotesId,

                rfqQuotesUserId: user.id,

                status: 'APPROVED',
              },

              orderBy: {
                id: 'desc',
              },

              select: {
                id: true,

                requestedPrice: true,

                rfqQuoteProductId: true,

                status: true,

                requestedBy: {
                  select: {
                    id: true,

                    firstName: true,

                    lastName: true,
                  },
                },

                requestedById: true,

                updatedAt: true,
              },
            });

          return {
            ...user,

            rfqProductPriceRequests,

            unreadMsgCount: unreadMessagesCount || 0,

            lastUnreadMessage: lastUnreadMessage || null,
          };
        }),
      );

      usersWithUnreadMessages.sort((a, b) => {
        const dateA = a.lastUnreadMessage?.createdAt
          ? new Date(a.lastUnreadMessage.createdAt).getTime()
          : 0;

        const dateB = b.lastUnreadMessage?.createdAt
          ? new Date(b.lastUnreadMessage.createdAt).getTime()
          : 0;

        return dateB - dateA;
      });

      return {
        status: true,

        message: 'Fetch Successfully',

        data: usersWithUnreadMessages,
      };
    } catch (error) {

      return {
        status: false,

        message: 'error, in getAllRfqQuotes',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getOneRfqQuotesUsersByBuyerID
   * @description Retrieves a single RFQ quote user record (seller response) for a buyer.
   */
  async getOneRfqQuotesUsersByBuyerID(req: any, rfqQuotesId: any) {
    try {
      const buyerID = req?.user?.id;

      const rfqQuotesID = parseInt(rfqQuotesId);

      let getOneRfqQuotes = await this.prisma.rfqQuotes.findUnique({
        where: {
          id: rfqQuotesID,

          buyerID: buyerID,
        },

        include: {
          rfqQuotes_rfqQuoteAddress: true,

          rfqQuotesProducts: {
            include: {
              rfqProductDetails: {
                include: {
                  productImages: true,
                },
              },
            },
          },
        },
      });

      if (!getOneRfqQuotes) {
        return {
          status: false,

          message: 'Not Found',

          data: [],
        };
      }

      return {
        status: true,

        message: 'Fetch Successfully',

        data: getOneRfqQuotes,
      };
    } catch (error) {

      return {
        status: false,

        message: 'error, in getOneRfqQuotesUsersByBuyerID',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAllRfqQuotesUsersBySellerID
   * @description Retrieves all RFQ quote requests received by the authenticated seller.
   */
  async getAllRfqQuotesUsersBySellerID(page: any, limit: any, req: any, showHidden: boolean = false) {
    try {
      let Page = parseInt(page) || 1;

      let pageSize = parseInt(limit) || 10;

      const skip = (Page - 1) * pageSize; // Calculate the offset

      let sellerID = req?.user?.id;

      let adminDetail = await this.prisma.user.findUnique({
        where: { id: sellerID },

        select: { id: true, tradeRole: true, addedBy: true },
      });

      if (adminDetail && adminDetail.tradeRole === 'MEMBER') {
        sellerID = adminDetail.addedBy;
      }

      // Build where clause based on showHidden parameter
      const whereClause: any = {
        status: 'ACTIVE',
        sellerID: sellerID,
        rfqQuotesId: {
          not: null,
        },
      };

      if (showHidden) {
        whereClause.isHidden = true;
      } else {
        whereClause.isHidden = false;
      }

      let getAllRfqQuotesUsersBySellerID = await this.prisma.rfqQuotesUsers.findMany(
        {
          where: whereClause,

          include: {
            buyerIDDetail: {
              select: {
                id: true,

                email: true,

                firstName: true,

                lastName: true,

                accountName: true,

                cc: true,

                phoneNumber: true,

                profilePicture: true,
              },
            },

            rfqQuotesUser_rfqQuotes: {
              include: {
                rfqQuotes_rfqQuoteAddress: true,

                rfqQuotesProducts: {
                  include: {
                    rfqProductDetails: {
                      select: {
                        id: true,
                        productName: true,
                        productImages: {
                          select: {
                            id: true,
                            image: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          skip, // Offset
          take: pageSize, // Limit
        },
      );

      if (!getAllRfqQuotesUsersBySellerID) {
        return {
          status: false,

          message: 'Not Found',

          data: [],
        };
      }

      const usersWithUnreadMessages = await Promise.all(
        getAllRfqQuotesUsersBySellerID.map(async (user) => {
          const rooms = await this.prisma.roomParticipants.findMany({
            where: {
              userId: user.buyerID,
            },

            select: {
              roomId: true,
            },
          });

          const unreadMessagesCount = await this.prisma.message.count({
            where: {
              userId: user.buyerID,
              status: 'UNREAD',
              rfqQuotesUserId: user.id,
              roomId: {
                in: rooms.map((room) => room.roomId),
              },
            },
          });

          const lastUnreadMessage = await this.prisma.message.findFirst({
            where: {
              rfqQuotesUserId: user.id,

              roomId: {
                in: rooms.map((room) => room.roomId),
              },
            },

            orderBy: {
              createdAt: 'desc',
            },

            select: {
              id: true,

              content: true,

              status: true,

              createdAt: true,

              roomId: true,

              userId: true,
            },
          });

          let rfqProductPriceRequests = [];

          if (user?.rfqQuotesId) {
            rfqProductPriceRequests =
              await this.prisma.rfqQuoteProductPriceRequest.findMany({
                where: {
                  rfqQuoteId: user.rfqQuotesId,

                  rfqQuotesUserId: user.id,

                  status: 'APPROVED',
                },

                orderBy: {
                  id: 'desc',
                },

                select: {
                  id: true,

                  requestedPrice: true,

                  rfqQuoteProductId: true,

                  status: true,

                  requestedBy: {
                    select: {
                      id: true,

                      firstName: true,

                      lastName: true,
                    },
                  },

                  requestedById: true,

                  updatedAt: true,
                },
              });
          }

          return {
            ...user,

            rfqProductPriceRequests,

            unreadMsgCount: unreadMessagesCount || 0,

            lastUnreadMessage: lastUnreadMessage || null,
          };
        }),
      );

      usersWithUnreadMessages.sort((a, b) => {
        const dateA = a.lastUnreadMessage?.createdAt
          ? new Date(a.lastUnreadMessage.createdAt).getTime()
          : 0;

        const dateB = b.lastUnreadMessage?.createdAt
          ? new Date(b.lastUnreadMessage.createdAt).getTime()
          : 0;

        return dateB - dateA;
      });

      return {
        status: true,

        message: 'Fetch Successfully',

        data: usersWithUnreadMessages,

        selectedAdminId: sellerID,
      };
    } catch (error) {

      return {
        status: false,

        message: 'error, in getAllRfqQuotes',

        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method hideRfqRequest
   * @description Toggles the hidden status of an RFQ request for a seller.
   */
  async hideRfqRequest(rfqQuotesUserId: number, isHidden: boolean, req: any) {
    try {
      let sellerID = req?.user?.id;

      let adminDetail = await this.prisma.user.findUnique({
        where: { id: sellerID },
        select: { id: true, tradeRole: true, addedBy: true },
      });

      if (adminDetail && adminDetail.tradeRole === 'MEMBER') {
        sellerID = adminDetail.addedBy;
      }

      // Verify that the request belongs to the seller
      const rfqQuoteUser = await this.prisma.rfqQuotesUsers.findFirst({
        where: {
          id: rfqQuotesUserId,
          sellerID: sellerID,
        },
      });

      if (!rfqQuoteUser) {
        return {
          status: false,
          message: 'RFQ request not found or you do not have permission to hide it',
        };
      }

      // Update the isHidden status
      const updatedRfqQuoteUser = await this.prisma.rfqQuotesUsers.update({
        where: {
          id: rfqQuotesUserId,
        },
        data: {
          isHidden: isHidden,
        },
      });

      return {
        status: true,
        message: isHidden ? 'Request hidden successfully' : 'Request unhidden successfully',
        data: updatedRfqQuoteUser,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error, in hideRfqRequest',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method createCustomFieldValue
   * @description Creates or updates custom field values for a product-price entry.
   */
  async createCustomFieldValue(payload: any, req: any) {
    try {
      const userId = req?.user?.id;

      let addCustomField = await this.prisma.customField.create({
        data: {
          formData: payload.form,

          formName: payload.formName,

          adminId: userId,

          userId: userId,

          productId: payload.productId,
        },
      });

      if (
        payload?.customFieldValueList &&
        payload?.customFieldValueList.length > 0
      ) {
        for (let i = 0; i < payload?.customFieldValueList.length; i++) {
          let addCustomFieldValue = await this.prisma.customFieldValue.create({
            data: {
              adminId: userId,

              userId: userId,

              formId: addCustomField.id,

              keyName: payload?.customFieldValueList[i].keyName,

              value: payload?.customFieldValueList[i].value,
            },
          });
        }
      }

      return {
        status: true,

        message: 'Created Successfully',

        data: addCustomField,
      };
    } catch (error) {

      return {
        status: false,

        message: 'error, in createCustomFieldValue',

        error: getErrorMessage(error),
      };
    }
  }
}
