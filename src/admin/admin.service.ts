/**
 * @file admin.service.ts
 * @description Core business-logic service for all super-admin operations in the
 *   Ultrasooq B2B/B2C marketplace back-office.  Handles authentication, product
 *   management, user / master-account management (including status transitions and
 *   bulk updates), dynamic form CRUD, form-to-category assignment, RFQ quote listing,
 *   geography lookups (countries / states / cities), permission CRUD, help-center
 *   ticket management (including email replies), finance / transaction views, order
 *   views, service management, and CMS page-setting management.
 *
 * @module AdminService
 *
 * @dependencies
 *   - {@link PrismaClient}        -- module-scoped instance for all database access.
 *   - {@link AuthService}         -- JWT token generation during admin login.
 *   - {@link NotificationService} -- email dispatch for help-center replies.
 *   - bcrypt (`compareSync`)      -- password hash comparison during login.
 *   - {@link UpdateProductTypeDTO}-- typed DTO for updateProductType payloads.
 *
 * @notes
 *   - PrismaClient is instantiated at the file / module scope (`const prisma = new PrismaClient()`)
 *     rather than being injected via NestJS DI.  This is a project-wide pattern.
 *   - All public methods follow a standard response envelope:
 *     `{ status: boolean, message: string, data?: any, error?: string, totalCount?: number }`.
 *   - Every public method wraps its body in try/catch and returns an error envelope
 *     instead of throwing, so the controller never encounters unhandled exceptions.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from 'src/auth/auth.service';
import { compareSync } from 'bcrypt';
import { UpdateProductTypeDTO } from './dto/updateProductType.dto';
import { NotificationService } from 'src/notification/notification.service';
import { getErrorMessage } from 'src/common/utils/get-error-message';

/**
 * @class AdminService
 * @description Injectable NestJS service encapsulating every admin business operation.
 *
 * **Intent:** Centralise all admin back-office logic so controllers remain thin
 *   pass-through layers.
 *
 * **Idea:** Each method maps 1-to-1 with an admin controller endpoint, performs
 *   validation, queries the database via Prisma, and returns a standard envelope.
 *
 * **Usage:** Injected into {@link AdminController} via constructor DI.
 *
 * **Data Flow:**
 *   AdminController --> AdminService method --> PrismaClient (DB)
 *                                           \-> AuthService   (login only)
 *                                           \-> NotificationService (help-center reply)
 *
 * **Dependencies:** AuthService, NotificationService, PrismaClient (module-scoped).
 *
 * **Notes:**
 *   - Methods do NOT throw; all errors are caught and returned as envelopes.
 *   - Pagination uses 1-based page numbers internally.
 */
@Injectable()
export class AdminService {
  // Simple in-memory store for tracking admin view timestamps
  // Key format: "users_{adminUserId}" or "products_{adminUserId}"
  private static adminViewTracking: Map<string, Date> = new Map();

  /**
   * @constructor
   * @param {AuthService} authService - Service for generating JWT tokens during admin login.
   * @param {NotificationService} notificationService - Service for dispatching notification emails.
   */
  constructor(
    private readonly authService: AuthService,
    private readonly notificationService: NotificationService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * @method login
   * @async
   * @description Authenticates an admin user by email + bcrypt password comparison
   *   and returns a JWT access token on success.
   *
   * **Intent:** Provide the single entry point for admin panel authentication.
   *
   * **Idea:** Looks up the user by email, verifies `userType === 'ADMIN'`, compares
   *   the bcrypt hash, then delegates to AuthService for JWT generation.
   *
   * **Usage:** Called by `AdminController.login()`.
   *
   * **Data Flow:** payload.email --> Prisma findUnique --> bcrypt compare -->
   *   AuthService.login() --> JWT accessToken.
   *
   * **Dependencies:** PrismaClient, bcrypt.compareSync, AuthService.login.
   *
   * **Notes:**
   *   - Returns `status: false` (not an HTTP error) for "not found", "not admin",
   *     and "invalid credential" scenarios.
   *   - The full user object is included in the response `data` field.
   *
   * @param {any} payload - `{ email: string, password: string }`.
   * @returns {Promise<{status: boolean, message: string, accessToken?: string, data?: any, error?: string}>}
   */
  async login(payload: any) {
    try {
      const email = payload.email;
      let userEmail = await this.prisma.user.findUnique({
        where: { email },
      });
      let user = userEmail;
      if (!user) {
        return {
          status: false,
          message: 'Admin not found',
          data: [],
        };
      }

      // AdminId Checking
      if (user.userType != 'ADMIN') {
        return {
          status: false,
          message: 'Not An Admin',
          data: [],
        };
      }

      if (compareSync(payload.password, user.password)) {
        let userAuth = {
          id: user.id,
        };

        let authToken = await this.authService.login(userAuth);
        const restokenData = authToken;
        return {
          status: true,
          message: 'Login Successfully',
          accessToken: restokenData.accessToken,
          data: user,
        };
      } else {
        return {
          status: false,
          message: 'Invalid Credential',
          data: [],
        };
      }
    } catch (error) {
      return {
        status: false,
        message: 'error in login',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method findOne
   * @async
   * @description Retrieves a single admin user record by the authenticated user's ID.
   *
   * **Intent:** Return the current admin's profile for "me" / "findOne" endpoints.
   *
   * **Idea:** Extracts `userId` from `req.user.id` (set by the auth guard) and performs
   *   a Prisma `findUnique`.
   *
   * **Usage:** Called by `AdminController.findOne()` and `AdminController.me()`.
   *
   * **Data Flow:** req.user.id --> Prisma findUnique (user) --> response envelope.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** The `payload` parameter is accepted for interface consistency but is
   *   not used within this method.
   *
   * @param {any} payload - Request body (unused).
   * @param {any} req - Express request with `req.user.id`.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async findOne(payload: any, req: any) {
    try {
      const userId = req?.user?.id;
      let userDetail = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (!userDetail) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
        };
      }

      return {
        status: true,
        message: 'Fetch Successfully',
        data: userDetail,
      };
    } catch (error) {
      return {
        status: false,
        error: getErrorMessage(error),
        message: 'error in findOne',
      };
    }
  }

  /**
   * @method getPermission
   * @async
   * @description Retrieves the authenticated admin's profile with their full role
   *   and permission hierarchy.
   *
   * **Intent:** Provide the admin UI with the complete permission tree for access-control
   *   decisions on the client side.
   *
   * **Idea:** Uses a deeply nested Prisma `select` to pull user fields, adminRoleDetail,
   *   adminRolePermission, and adminPermissionDetail in a single round-trip.
   *
   * **Usage:** Called by `AdminController.getPermission()`.
   *
   * **Data Flow:** req.user.id --> Prisma findFirst (user with nested selects) --> response envelope.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:**
   *   - Returns almost all user columns via explicit `select: true` (password excluded
   *     by omission from the select list).
   *   - Nested relations: user --> adminRoleDetail --> adminRolePermission --> adminPermissionDetail.
   *   - The `payload` parameter is accepted for interface consistency but unused.
   *
   * @param {any} payload - Request body (unused).
   * @param {any} req - Express request with `req.user.id`.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async getPermission(payload: any, req: any) {
    try {
      const userId = req?.user?.id;
      let userDetail = await this.prisma.user.findFirst({
        where: { id: userId },
        select: {
          id: true,
          uniqueId: true,
          email: true,
          firstName: true,
          lastName: true,
          userName: true,
          gender: true,
          status: true,
          dateOfBirth: true,
          phoneNumber: true,
          cc: true,
          tradeRole: true,
          otp: true,
          otpValidTime: true,
          resetPassword: true,
          profilePicture: true,
          identityProof: true,
          identityProofBack: true,
          onlineOffline: true,
          onlineOfflineDateStatus: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          userType: true,
          loginType: true,
          employeeId: true,
          userRoleName: true,
          userRoleId: true,
          customerId: true,
          stripeAccountId: true,
          addedBy: true,

          // Nested relation
          adminRoleDetail: {
            select: {
              id: true,
              adminRoleName: true,
              addedBy: true,
              status: true,
              createdAt: true,
              updatedAt: true,
              deletedAt: true,

              // Include permissions
              adminRolePermission: {
                select: {
                  id: true,
                  adminRoleId: true,
                  adminPermissionId: true,
                  status: true,
                  createdAt: true,
                  updatedAt: true,
                  deletedAt: true,
                  adminPermissionDetail: {
                    select: {
                      id: true,
                      name: true,
                      addedBy: true,
                      status: true,
                      createdAt: true,
                      updatedAt: true,
                      deletedAt: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!userDetail) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
        };
      }

      return {
        status: true,
        message: 'Fetch Successfully',
        data: userDetail,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in me',
        error: getErrorMessage(error),
      };
    }
  }

  // ---------- ADMIN PRODUCT MANAGE ----------

  /**
   * @method getAllProduct
   * @async
   * @description Retrieves a paginated, filterable, sortable list of products for the
   *   admin product management view.
   *
   * **Intent:** Serve the admin product grid with flexible server-side filtering.
   *
   * **Idea:** Dynamically builds a Prisma `where` clause from optional parameters:
   *   product type (P/R/F/ALL), text search on `productName`, brand IDs, category
   *   location substring, price range, and status.  Includes related entities
   *   (category, brand, placeOfOrigin, tags, images, prices).
   *
   * **Usage:** Called by `AdminController.getAllProduct()`.
   *
   * **Data Flow:** Params --> dynamic whereCondition --> Prisma findMany + count --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:**
   *   - `term` must be longer than 2 characters to activate text search.
   *   - `brandIds` is a comma-separated string that is parsed into an integer array.
   *   - `categoryId` uses a `contains` filter on `categoryLocation` (substring match).
   *   - Price range filter (`priceMin` / `priceMax`) targets `offerPrice`.
   *
   * @param {any} page - Page number (string parsed to int, default 1).
   * @param {any} limit - Page size (string parsed to int, default 10).
   * @param {any} req - Express request (unused beyond auth).
   * @param {any} term - Free-text search term.
   * @param {any} sortType - Column to sort by (default 'createdAt').
   * @param {any} sortOrder - 'asc' or 'desc' (default 'desc').
   * @param {any} brandIds - Comma-separated brand ID filter.
   * @param {any} priceMin - Minimum offer price.
   * @param {any} priceMax - Maximum offer price.
   * @param {any} status - Product status filter.
   * @param {any} productType - 'ALL', 'P', 'R', or 'F'.
   * @param {any} categoryId - Category location substring filter.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number, error?: string}>}
   */
  async getAllProduct(
    page: any,
    limit: any,
    req: any,
    term: any,
    sortType: any,
    sortOrder: any,
    brandIds: any,
    priceMin: any,
    priceMax: any,
    status: any,
    productType: any,
    categoryId: any,
  ) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize; // Calculate the offset
      let searchTerm = term?.length > 2 ? term : '';
      const SORTTYPE = sortType ? sortType : 'createdAt';
      const SORTORDER = sortOrder ? sortOrder : 'desc';

      let orderBy = {};
      orderBy[SORTTYPE] = SORTORDER;

      let whereCondition: any = {
        // status: status,
        productType:
          productType === 'ALL'
            ? {
                in: ['P', 'R', 'F'],
              }
            : productType
              ? {
                  in: [productType],
                }
              : undefined,
        productName: {
          contains: searchTerm,
          mode: 'insensitive',
        },
        brandId: brandIds
          ? {
              in: brandIds.split(',').map((id) => parseInt(id.trim())),
            }
          : undefined,
        categoryLocation: {
          contains: categoryId, // Checks if categoryId exists in categoryLocation
          mode: 'insensitive',
        },
      };

      if (priceMin && priceMax) {
        whereCondition.offerPrice = {
          gte: parseFloat(priceMin),
          lte: parseFloat(priceMax),
        };
      }

      if (status) {
        whereCondition.status = status;
      }

      let productDetailList = await this.prisma.product.findMany({
        // where: {
        //   status: 'ACTIVE',
        //   productName: {
        //     contains: searchTerm,
        //     mode: 'insensitive'
        //   },
        //   brandId: brandIds ? {
        //     in: brandIds.split(',').map(id => parseInt(id.trim()))
        //   } : undefined
        // },
        where: whereCondition,
        include: {
          // userBy: { where: { status: 'ACTIVE' } },
          // adminBy: { where: { status: 'ACTIVE' } },
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
          product_productPrice: true,
        },
        orderBy: orderBy,
        skip, // Offset
        take: pageSize, // Limit
      });

      let productDetailListCount = await this.prisma.product.count({
        where: whereCondition,
        // where: {
        //   status: 'ACTIVE',
        //   productName: {
        //     contains: searchTerm,
        //     mode: 'insensitive'
        //   },
        //   brandId: brandIds ? {
        //     in: brandIds.split(',').map(id => parseInt(id.trim()))
        //   } : undefined
        // },
      });

      if (!productDetailList) {
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

  async getDropshipableProducts(
    page: any,
    limit: any,
    req: any,
    term: any,
    sortType: any,
    sortOrder: any,
    brandIds: any,
    priceMin: any,
    priceMax: any,
    status: any,
    categoryId: any,
  ) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize; // Calculate the offset
      let searchTerm = term?.length > 2 ? term : '';
      const SORTTYPE = sortType ? sortType : 'createdAt';
      const SORTORDER = sortOrder ? sortOrder : 'desc';

      let orderBy = {};
      orderBy[SORTTYPE] = SORTORDER;

      let whereCondition: any = {
        isDropshipable: true, // Only show dropshipable products
        productName: {
          contains: searchTerm,
          mode: 'insensitive',
        },
        brandId: brandIds
          ? {
              in: brandIds.split(',').map((id) => parseInt(id.trim())),
            }
          : undefined,
        categoryLocation: {
          contains: categoryId, // Checks if categoryId exists in categoryLocation
          mode: 'insensitive',
        },
      };

      if (priceMin && priceMax) {
        whereCondition.offerPrice = {
          gte: parseFloat(priceMin),
          lte: parseFloat(priceMax),
        };
      }

      if (status) {
        whereCondition.status = status;
      }

      let productDetailList = await this.prisma.product.findMany({
        where: whereCondition,
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
          product_productPrice: true,
          userBy: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              companyName: true,
              accountName: true,
              tradeRole: true,
            },
          },
        },
        orderBy: orderBy,
        skip, // Offset
        take: pageSize, // Limit
      });

      let productDetailListCount = await this.prisma.product.count({
        where: whereCondition,
      });

      if (!productDetailList) {
        return {
          status: false,
          message: 'No dropshipable products found',
          data: [],
          totalCount: 0,
        };
      }

      return {
        status: true,
        message: 'Dropshipable products fetched successfully',
        data: productDetailList,
        totalCount: productDetailListCount,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in getDropshipableProducts',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method updateProductType
   * @async
   * @description Updates the `typeProduct` classification of a specific product.
   *
   * **Intent:** Allow admins to reclassify a product as VENDORLOCAL or BRAND.
   *
   * **Idea:** Uses the validated {@link UpdateProductTypeDTO} to extract `productId`
   *   and `typeProduct`, then performs a Prisma update.
   *
   * **Usage:** Called by `AdminController.updateProductType()`.
   *
   * **Data Flow:** DTO (productId, typeProduct) --> Prisma update (product) --> response.
   *
   * **Dependencies:** PrismaClient, UpdateProductTypeDTO.
   *
   * **Notes:** Only the `typeProduct` column is modified; other fields are untouched.
   *
   * @param {UpdateProductTypeDTO} payload - Validated DTO with `productId` and optional `typeProduct`.
   * @param {any} req - Express request (unused).
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async updateProductType(payload: UpdateProductTypeDTO, req: any) {
    try {
      const productId = payload.productId;
      let updateProductType = await this.prisma.product.update({
        where: {
          id: productId,
        },
        data: {
          typeProduct: payload?.typeProduct,
        },
      });

      return {
        status: true,
        message: 'Updated SuccessFully',
        data: updateProductType,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in updateProductType',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method updateProduct
   * @async
   * @description Updates a product's core fields and optionally replaces its tags and
   *   images in bulk.
   *
   * **Intent:** Provide a general-purpose admin product edit that can touch any field,
   *   including associated collections.
   *
   * **Idea:**
   *   1. Fetches the existing product (with lowest active price for validation context).
   *   2. Merges supplied fields with existing values (fallback pattern).
   *   3. If `productTagList` is provided, deletes all existing tags and re-creates.
   *   4. If `productImagesList` is provided, deletes all existing images and re-creates.
   *
   * **Usage:** Called by `AdminController.updateProduct()`.
   *
   * **Data Flow:** payload --> Prisma findUnique --> Prisma update (product) -->
   *   optional deleteMany + create loops (tags, images) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:**
   *   - Tags and images use a delete-all-and-recreate strategy (not incremental).
   *   - Commented-out code suggests a former price-zero guard was removed.
   *   - `req.user.id` is extracted but only used for context (not stored).
   *
   * @param {any} payload - Partial product fields plus optional `productTagList` and `productImagesList`.
   * @param {any} req - Express request (auth context).
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async updateProduct(payload: any, req: any) {
    try {
      const userId = req?.user?.id;
      const productId = payload.productId;
      let productDetail = await this.prisma.product.findUnique({
        where: { id: productId },
        include: {
          product_productPrice: {
            where: { status: 'ACTIVE' },
            orderBy: {
              offerPrice: 'asc',
            },
            take: 1,
          },
        },
      });

      if (!productDetail) {
        return {
          status: false,
          message: 'Updated SuccessFully',
          data: [],
        };
      }


      let updatedProduct = await this.prisma.product.update({
        where: { id: productId },
        data: {
          status: payload?.status || productDetail.status,
          productName: payload.productName || productDetail.productName,
          categoryId: payload.categoryId || productDetail.categoryId,
          brandId: payload.brandId || productDetail.brandId,
          placeOfOriginId:
            payload.placeOfOriginId || productDetail.placeOfOriginId,
          skuNo: payload.skuNo || productDetail.skuNo,
          productPrice: payload.productPrice || productDetail.productPrice,
          offerPrice: payload.offerPrice || productDetail.offerPrice,
          description: payload.description || productDetail.description,
          specification: payload.specification || productDetail.specification,
          categoryLocation:
            payload?.categoryLocation || productDetail.categoryLocation,
        },
      });

      if (payload.productTagList && payload.productTagList.length > 0) {
        await this.prisma.productTags.deleteMany({
          where: { productId: productId },
        });
        for (let i = 0; i < payload.productTagList.length; i++) {
          let addProductTags = await this.prisma.productTags.create({
            data: {
              productId: productId,
              tagId: payload.productTagList[i].tagId,
            },
          });
        }
      }

      if (payload.productImagesList && payload.productImagesList.length > 0) {
        await this.prisma.productImages.deleteMany({
          where: { productId: productId },
        });
        for (let j = 0; j < payload.productImagesList.length; j++) {
          let addProductImages = await this.prisma.productImages.create({
            data: {
              productId: productId,
              imageName: payload?.productImagesList[j]?.imageName,
              image: payload?.productImagesList[j]?.image,
              videoName: payload?.productImagesList[j]?.videoName,
              video: payload?.productImagesList[j]?.video,
            },
          });
        }
      }

      return {
        status: true,
        message: 'Updated SuccessFully',
        data: updatedProduct,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in updateProductt',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getOneProductOld
   * @async
   * @deprecated Not in use -- superseded by {@link getOneProduct}.
   * @description Legacy version of product detail retrieval. Included the admin
   *   detail relation on product prices (user profile with company info) but lacked
   *   geography and order relations.
   *
   * **Intent:** Retrieve a single product's full detail (historical version).
   *
   * **Idea:** Deep-includes category, brand, origin, tags, images, short descriptions,
   *   specifications, and prices with admin detail.
   *
   * **Usage:** Not currently routed by any controller method.
   *
   * **Data Flow:** productId --> parseInt --> Prisma findUnique with includes --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** Kept for reference; the active version is {@link getOneProduct}.
   *
   * @param {any} productId - The product's ID (string parsed to int).
   * @param {any} req - Express request (unused).
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number, error?: string}>}
   */
  // not in use
  async getOneProductOld(productId: any, req: any) {
    try {
      const productID = parseInt(productId);
      let productDetail = await this.prisma.product.findUnique({
        where: { id: productID },
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
          product_productShortDescription: { where: { status: 'ACTIVE' } },
          product_productSpecification: { where: { status: 'ACTIVE' } },
          product_productPrice: {
            include: {
              adminDetail: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
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
        message: 'error in getOneProduct',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getOneProduct
   * @async
   * @description Retrieves full details of a single product by ID, including all
   *   related entities needed by the admin product detail page.
   *
   * **Intent:** Serve a comprehensive product view for admin review and editing.
   *
   * **Idea:** Uses Prisma `findUnique` with deep `include` covering: category, brand,
   *   place of origin, tags (with tag detail), images, short descriptions,
   *   specifications, prices (with country/state/city and admin detail), sell regions
   *   (country/state/city), and order products.
   *
   * **Usage:** Called by `AdminController.getOneProduct()`.
   *
   * **Data Flow:** productId (string) --> parseInt --> Prisma findUnique --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:**
   *   - All related records are filtered by `status: 'ACTIVE'` where applicable.
   *   - Returns `totalCount: 1` on success for API consistency with list endpoints.
   *
   * @param {any} productId - The product's ID (string parsed to int).
   * @param {any} req - Express request (unused).
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number, error?: string}>}
   */
  async getOneProduct(productId: any, req: any) {
    try {
      const productID = parseInt(productId);
      let productDetail = await this.prisma.product.findUnique({
        where: { id: productID },
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
          product_productShortDescription: { where: { status: 'ACTIVE' } },
          product_productSpecification: { where: { status: 'ACTIVE' } },
          product_productPrice: {
            include: {
              productCountryDetail: { where: { status: 'ACTIVE' } },
              productStateDetail: { where: { status: 'ACTIVE' } },
              productCityDetail: { where: { status: 'ACTIVE' } },
              adminDetail: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
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
        message: 'error in getOneProduct',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getOneProductAllQuestion
   * @async
   * @description Retrieves a paginated list of active questions for a specific product,
   *   with the answerer's profile details.
   *
   * **Intent:** Allow admins to review and moderate product Q&A content.
   *
   * **Idea:** Filters by `productId` and `status: 'ACTIVE'`, includes the answering
   *   user's name and profile picture, and supports oldest/newest sort.
   *
   * **Usage:** Called by `AdminController.getOneProductAllQuestion()`.
   *
   * **Data Flow:** (page, limit, productId, sortType) --> Prisma findMany + count (productQuestion) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:**
   *   - `sortType === 'oldest'` yields ascending order; all other values yield descending.
   *   - Response key is `totalcount` (lowercase 'c') -- differs from other list endpoints.
   *
   * @param {any} page - Page number (string, default 1).
   * @param {any} limit - Page size (string, default 10).
   * @param {any} productId - The product's ID (string parsed to int).
   * @param {any} sortType - 'oldest' for ASC, otherwise DESC.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalcount?: number, error?: string}>}
   */
  async getOneProductAllQuestion(
    page: any,
    limit: any,
    productId: any,
    sortType: any,
  ) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize; // Calculate the offset
      let productID = parseInt(productId);
      let sort = {};
      if (sortType == 'oldest') {
        sort = { createdAt: 'asc' };
      } else {
        sort = { createdAt: 'desc' };
      }

      let getAllQuestion = await this.prisma.productQuestion.findMany({
        where: {
          productId: productID,
          status: 'ACTIVE',
        },
        include: {
          answerByuserIdDetail: {
            select: { firstName: true, lastName: true, profilePicture: true },
          },
        },
        orderBy: sort,
        skip, // Offset
        take: pageSize, // Limit
      });

      let getAllQuestionCount = await this.prisma.productQuestion.count({
        where: {
          productId: productID,
          status: 'ACTIVE',
        },
      });

      if (!getAllQuestion) {
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
        data: getAllQuestion,
        totalcount: getAllQuestionCount,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in getOneProductAllQuestion',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method deleteProductQuestion
   * @async
   * @description Hard-deletes a product question record by its ID.
   *
   * **Intent:** Allow admins to permanently remove inappropriate or spam questions.
   *
   * **Idea:** Performs a Prisma `delete` (physical row removal, not soft-delete).
   *
   * **Usage:** Called by `AdminController.deleteProductQuestion()`.
   *
   * **Data Flow:** productQuestionId (string) --> parseInt --> Prisma delete --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** Unlike product deletion, this is a hard delete. Error message says
   *   "getOneProductAllQuestion" -- likely a copy-paste artifact.
   *
   * @param {any} productQuestionId - The question's ID (string parsed to int).
   * @returns {Promise<{status: boolean, message: string, data?: any[], error?: string}>}
   */
  async deleteProductQuestion(productQuestionId: any) {
    try {
      const productQuestionID = parseInt(productQuestionId);

      let deleteProductQuestion = await this.prisma.productQuestion.delete({
        where: {
          id: productQuestionID,
        },
      });

      return {
        status: true,
        message: 'Deleted Successfully',
        data: [],
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in getOneProductAllQuestion',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method deleteProduct
   * @async
   * @description Soft-deletes a product by setting its status to 'DELETE' and stamping
   *   the current datetime on `deletedAt`.
   *
   * **Intent:** Remove a product from active listings while preserving its data for
   *   auditing and potential restoration.
   *
   * **Idea:** Uses Prisma `update` to change `status` and `deletedAt` instead of
   *   physically removing the row.
   *
   * **Usage:** Called by `AdminController.deleteProduct()`.
   *
   * **Data Flow:** productId (string) --> parseInt --> Prisma update (status='DELETE') --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** The `req` parameter is accepted but not used within this method.
   *
   * @param {any} productId - The product's ID (string parsed to int).
   * @param {any} req - Express request (unused).
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async deleteProduct(productId: any, req: any) {
    try {
      let ID = parseInt(productId);
      let updatedProduct = await this.prisma.product.update({
        where: { id: ID },
        data: {
          status: 'DELETE',
          deletedAt: new Date(),
        },
      });
      return {
        status: true,
        message: 'Deleted Successfully',
        data: updatedProduct,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in delete product',
        error: getErrorMessage(error),
      };
    }
  }

  // ---------- ADMIN PRODUCT MANAGE ENDS ----------

  /**
   * @method createDynamicForm
   * @async
   * @description Creates a new dynamic form record along with its hierarchical
   *   attribute elements (parents and children).
   *
   * **Intent:** Allow admins to define custom product-attribute forms that can later
   *   be assigned to categories.
   *
   * **Idea:**
   *   1. Creates the `DynamicForm` record with `formData` and `formName`.
   *   2. Iterates `attributeList`, creating a parent `DynamicFormElement` for each.
   *   3. For each parent, iterates its `fields` array and creates child elements
   *      linked via `parentId`.
   *
   * **Usage:** Called by `AdminController.createDynamicForm()`.
   *
   * **Data Flow:** payload --> Prisma create (dynamicForm) --> loop: create parent element -->
   *   loop: create child elements --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** Elements are created sequentially (not batched) to obtain each parent's
   *   auto-generated ID for child linking.
   *
   * @param {any} payload - `{ form: JSON, formName: string, attributeList: Array<{ keyName, label, typeField, fields: Array }> }`.
   * @returns {Promise<{status: boolean, message: string, data?: object, error?: string}>}
   */
  async createDynamicForm(payload: any) {
    try {
      let dynamicForm = await this.prisma.dynamicForm.create({
        data: {
          formData: payload.form,
          formName: payload.formName,
        },
      });

      for (let i = 0; i < payload.attributeList.length; i++) {
        let parentElement = await this.prisma.dynamicFormElement.create({
          data: {
            keyName: payload.attributeList[i].keyName,
            label: payload.attributeList[i].label,
            typeField: payload.attributeList[i].typeField,
            // parentId: 0,
            formId: dynamicForm.id,
          },
        });
        for (let j = 0; j < payload.attributeList[i].fields.length; j++) {
          await this.prisma.dynamicFormElement.create({
            data: {
              keyName: payload.attributeList[i].fields[j].keyName,
              label: payload.attributeList[i].fields[j].label,
              typeField: payload.attributeList[i].fields[j].typeField,
              parentId: parentElement.id,
              formId: dynamicForm.id,
            },
          });
        }
      }
      return {
        status: true,
        message: 'Form created successfully',
        data: {},
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in create form',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method dynamicFormDetails
   * @async
   * @description Retrieves a single dynamic form by its ID, including elements and
   *   associated category mappings.
   *
   * **Intent:** Serve the admin form-editor with the complete form definition.
   *
   * **Idea:** Uses Prisma `findUnique` with nested `include` for elements and
   *   dynamicFormCategory (with categoryIdDetail).
   *
   * **Usage:** Called by `AdminController.dynamicFormDetails()`.
   *
   * **Data Flow:** payload.id --> Prisma findUnique (dynamicForm with includes) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** Returns the full form even if its status is not ACTIVE.
   *
   * @param {any} payload - `{ id: number }`.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async dynamicFormDetails(payload: any) {
    try {
      let dynamicForm = await this.prisma.dynamicForm.findUnique({
        where: { id: payload.id },
        include: {
          elements: true,
          dynamicForm_dynamicFormCategory: {
            include: {
              categoryIdDetail: true,
            },
          },
        },
      });

      return {
        status: true,
        message: 'Form details',
        data: dynamicForm,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in create form',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method dynamicFormDetailsList
   * @async
   * @description Retrieves a paginated list of all active dynamic forms, including
   *   their elements and category assignments.
   *
   * **Intent:** Populate the admin "dynamic forms" list view.
   *
   * **Idea:** Filters by `status: 'ACTIVE'`, ordered newest first, with pagination.
   *
   * **Usage:** Called by `AdminController.dynamicFormDetailsList()`.
   *
   * **Data Flow:** payload (page, limit) --> Prisma findMany (dynamicForm) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** Default page size is 10 if `payload.limit` is not a valid integer.
   *
   * @param {any} payload - `{ page: number, limit: number }`.
   * @returns {Promise<{status: boolean, message: string, data?: any[], error?: string}>}
   */
  async dynamicFormDetailsList(payload: any) {
    try {
      const skip = (payload.page - 1) * payload.limit; // Calculate the offset
      let pageSize = parseInt(payload.limit) || 10;
      let dynamicForm = await this.prisma.dynamicForm.findMany({
        where: { status: 'ACTIVE' },
        include: {
          elements: true,
          dynamicForm_dynamicFormCategory: {
            include: {
              categoryIdDetail: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      });
      return {
        status: true,
        message: 'Form details',
        data: dynamicForm,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in create form',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method dynamicFormDetailsDelete
   * @async
   * @description Soft-deletes a dynamic form by setting its status to 'DELETE' and
   *   stamping `deletedAt`.
   *
   * **Intent:** Remove a dynamic form from active use while preserving its record.
   *
   * **Idea:** Uses Prisma `update` (soft-delete pattern) rather than physical removal.
   *
   * **Usage:** Called by `AdminController.dynamicFormDetailsDelete()`.
   *
   * **Data Flow:** payload.id --> Prisma update (status='DELETE', deletedAt=now) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** Does not cascade to associated DynamicFormElement or DynamicFormCategory
   *   records -- they remain in the database.
   *
   * @param {any} payload - `{ id: number }`.
   * @returns {Promise<{status: boolean, message: string, data?: object, error?: string}>}
   */
  async dynamicFormDetailsDelete(payload: any) {
    try {
      await this.prisma.dynamicForm.update({
        where: { id: payload.id },
        data: {
          status: 'DELETE',
          deletedAt: new Date(),
        },
      });
      return {
        status: true,
        message: 'deleted successfully',
        data: {},
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in create form',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method dynamicFormDetailsEdit
   * @async
   * @description Updates an existing dynamic form's metadata and completely replaces
   *   its attribute element hierarchy.
   *
   * **Intent:** Allow admins to modify a form's name, data payload, and attribute
   *   structure in a single operation.
   *
   * **Idea:**
   *   1. Updates the DynamicForm record (`formData`, `formName`).
   *   2. Deletes all existing DynamicFormElement records for this form.
   *   3. Re-creates parent and child elements from `attributeList`.
   *
   * **Usage:** Called by `AdminController.dynamicFormDetailsEdit()`.
   *
   * **Data Flow:** payload --> Prisma update (form) --> deleteMany (elements) -->
   *   loop: create parent + child elements --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** Uses a full-replace strategy for elements (not incremental patching).
   *
   * @param {any} payload - `{ id, form, formName, attributeList }`.
   * @returns {Promise<{status: boolean, message: string, data?: object, error?: string}>}
   */
  async dynamicFormDetailsEdit(payload: any) {
    try {
      let dynamicForm = await this.prisma.dynamicForm.update({
        where: { id: payload.id },
        data: {
          formData: payload.form,
          formName: payload.formName,
        },
      });
      await this.prisma.dynamicFormElement.deleteMany({
        where: { formId: payload.id },
      });

      for (let i = 0; i < payload.attributeList.length; i++) {
        let parentElement = await this.prisma.dynamicFormElement.create({
          data: {
            keyName: payload.attributeList[i].keyName,
            label: payload.attributeList[i].label,
            typeField: payload.attributeList[i].typeField,
            // parentId: 0,
            formId: dynamicForm.id,
          },
        });
        for (let j = 0; j < payload.attributeList[i].fields.length; j++) {
          await this.prisma.dynamicFormElement.create({
            data: {
              keyName: payload.attributeList[i].fields[j].keyName,
              label: payload.attributeList[i].fields[j].label,
              typeField: payload.attributeList[i].fields[j].typeField,
              parentId: parentElement.id,
              formId: dynamicForm.id,
            },
          });
        }
      }
      return {
        status: true,
        message: 'Form updated successfully',
        data: {},
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in create form',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method assignFormToCategory
   * @async
   * @description Assigns a dynamic form to one or more categories by creating
   *   DynamicFormCategory join records, skipping duplicates.
   *
   * **Intent:** Link custom attribute forms to product categories so that sellers
   *   are presented with the correct form fields during product listing.
   *
   * **Idea:** Iterates `categoryIdList`, checks for existing (formId, categoryId)
   *   pairs to prevent duplicates, and creates new records for non-existing pairs.
   *
   * **Usage:** Called by `AdminController.assignFormToCategory()`.
   *
   * **Data Flow:** payload.categoryIdList --> per-item: Prisma findFirst (dedup) -->
   *   Prisma create (if new) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:**
   *   - Returns early with `status: false` if `categoryIdList` is empty or missing.
   *   - Duplicates are silently skipped (logged to console).
   *
   * @param {any} payload - `{ categoryIdList: Array<{ formId, categoryId, categoryLocation? }> }`.
   * @returns {Promise<{status: boolean, message: string, data?: any[], error?: string}>}
   */
  async assignFormToCategory(payload: any) {
    try {
      if (!payload?.categoryIdList || payload?.categoryIdList.length == 0) {
        return {
          status: false,
          meesaage: 'Atleast One categoryId and one formId is required',
          data: [],
        };
      }

      for (let i = 0; i < payload?.categoryIdList.length; i++) {
        let categoryExist = await this.prisma.dynamicFormCategory.findFirst({
          where: {
            formId: payload?.categoryIdList[i].formId,
            categoryId: payload?.categoryIdList[i].categoryId,
          },
        });
        if (categoryExist) {
        } else {
          let assignFormToCategory = await this.prisma.dynamicFormCategory.create({
            data: {
              formId: payload?.categoryIdList[i].formId,
              categoryId: payload?.categoryIdList[i].categoryId,
              categoryLocation: payload?.categoryIdList[i]?.categoryLocation,
            },
          });
        }
      }

      return {
        status: true,
        message: 'Assigned Successfully',
        data: [],
      };
    } catch (error) {
      return {
        status: false,
        message: 'error, in assignFormToCategory',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method updateAssignFormToCategory
   * @async
   * @description Updates an existing form-to-category assignment record by its ID.
   *
   * **Intent:** Allow admins to change the form, category, or category location of
   *   a single DynamicFormCategory mapping.
   *
   * **Idea:** Performs a Prisma `update` on the DynamicFormCategory row identified
   *   by `payload.id`.
   *
   * **Usage:** Called by `AdminController.updateAssignFormToCategory()`.
   *
   * **Data Flow:** payload (id, formId, categoryId, categoryLocation) -->
   *   Prisma update (dynamicFormCategory) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** Updates a single assignment record; for bulk reassignment, see
   *   {@link editAssignFormToCategory}.
   *
   * @param {any} payload - `{ id, formId, categoryId, categoryLocation }`.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async updateAssignFormToCategory(payload: any) {
    try {
      const ID = payload.id;

      let updateAssignFormToCategory = await this.prisma.dynamicFormCategory.update({
        where: { id: ID },
        data: {
          formId: payload?.formId,
          categoryId: payload?.categoryId,
          categoryLocation: payload?.categoryLocation,
        },
      });

      return {
        status: true,
        message: 'Updated Successfully',
        data: updateAssignFormToCategory,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error, in updateAssignFormToCategory',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method editAssignFormToCategory
   * @async
   * @description Replaces all category assignments for a given form by deleting existing
   *   mappings and re-creating from the provided list (skipping category-level duplicates).
   *
   * **Intent:** Provide a bulk-reassign capability for form-to-category mappings.
   *
   * **Idea:**
   *   1. Validates that `formId` is present.
   *   2. Deletes all DynamicFormCategory rows for this form.
   *   3. Iterates `categoryIdList`, checking for category-level duplicates before creating.
   *
   * **Usage:** Called by `AdminController.editAssignFormToCategory()`.
   *
   * **Data Flow:** payload.formId --> Prisma deleteMany --> per-item: findFirst (dedup by categoryId) -->
   *   create (if new) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** Currently marked as "still not in use". Duplicate check is by `categoryId`
   *   only (not by formId+categoryId pair), which differs from {@link assignFormToCategory}.
   *
   * @param {any} payload - `{ formId: number, categoryIdList: Array<{ formId, categoryId }> }`.
   * @returns {Promise<{status: boolean, message: string, data?: any[], error?: string}>}
   */
  // still not in use
  async editAssignFormToCategory(payload: any) {
    try {
      if (!payload?.formId) {
        return {
          status: false,
          message: 'formId is required',
          data: [],
        };
      }
      const formId = payload?.formId;
      let deleteDynamicFormCategory =
        await this.prisma.dynamicFormCategory.deleteMany({
          where: { formId: formId },
        });

      for (let i = 0; i < payload?.categoryIdList.length; i++) {
        let categoryExist = await this.prisma.dynamicFormCategory.findFirst({
          where: {
            categoryId: payload?.categoryIdList[i].categoryId,
          },
        });
        if (categoryExist) {
        } else {
          let assignFormToCategory = await this.prisma.dynamicFormCategory.create({
            data: {
              formId: payload?.categoryIdList[i].formId,
              categoryId: payload?.categoryIdList[i].categoryId,
            },
          });
        }
      }

      return {
        status: true,
        message: 'Assigned Update Successfully',
        data: [],
      };
    } catch (error) {
      return {
        status: false,
        message: 'error, in editAssignFormToCategory',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAllUser
   * @async
   * @description Retrieves a paginated list of master accounts along with their
   *   associated user sub-accounts, optionally filtered by trade role.
   *
   * **Intent:** Power the admin user management list view, showing the master-account
   *   hierarchy with sub-accounts nested inside.
   *
   * **Idea:** Queries the `masterAccount` table, requiring at least one non-deleted
   *   user (optionally matching `tradeRole`). Includes basic master-account fields
   *   plus nested user records.
   *
   * **Usage:** Called by `AdminController.getAllUser()`.
   *
   * **Data Flow:** (page, limit, tradeRole) --> dynamic where clause --> Prisma findMany + count
   *   (masterAccount with users) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:**
   *   - Filters exclude soft-deleted records (`deletedAt: null`).
   *   - `tradeRole` filter is applied at both the `masterAccount.users.some` and
   *     the nested `users.where` level for consistency.
   *   - Sorted by `createdAt` descending.
   *
   * @param {any} page - Page number (string, default 1).
   * @param {any} limit - Page size (string, default 10).
   * @param {any} tradeRole - Optional trade role filter (e.g. 'BUYER', 'SELLER').
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number, error?: string}>}
   */
  // Master Account List with Sub-Accounts
  async getAllUser(page: any, limit: any, tradeRole: any) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize; // Calculate the offset
      const sortType = 'desc';

      // Get master accounts with their sub-accounts
      let masterAccounts = await this.prisma.masterAccount.findMany({
        where: {
          deletedAt: null,
          users: {
            some: {
              deletedAt: null,
              ...(tradeRole && { tradeRole: tradeRole }),
            },
          },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
          gender: true,
          dateOfBirth: true,
          profilePicture: true,
          createdAt: true,
          users: {
            where: {
              deletedAt: null,
              ...(tradeRole && { tradeRole: tradeRole }),
            },
            select: {
              id: true,
              accountName: true,
              tradeRole: true,
              companyName: true,
              isActive: true,
              deletedAt: true,
              createdAt: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: sortType },
        skip, // Offset
        take: pageSize, // Limit
      });

      if (!masterAccounts) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
        };
      }

      let masterAccountsCount = await this.prisma.masterAccount.count({
        where: {
          deletedAt: null,
          users: {
            some: {
              deletedAt: null,
              ...(tradeRole && { tradeRole: tradeRole }),
            },
          },
        },
      });

      return {
        status: true,
        message: 'Fetch Successfully',
        data: masterAccounts,
        totalCount: masterAccountsCount,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error, in getAllUser',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getSubAccounts
   * @async
   * @description Retrieves all sub-account user records linked to a specific master
   *   account, excluding the master user itself and soft-deleted records.
   *
   * **Intent:** Let admins drill into a master account to inspect every associated
   *   sub-account.
   *
   * **Idea:**
   *   1. Fetches all users with the given `masterAccountId` for debug logging.
   *   2. Fetches non-deleted users excluding the master user itself (by `id != masterAccountId`).
   *
   * **Usage:** Called by `AdminController.getSubAccounts()`.
   *
   * **Data Flow:** masterAccountId --> Prisma findMany (debug) --> Prisma findMany (filtered) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:**
   *   - Sorted by `createdAt` descending.
   *
   * @param {number} masterAccountId - The master account's unique ID.
   * @returns {Promise<{status: boolean, message: string, data?: any[], error?: string}>}
   */
  // Get sub-accounts for a specific master account
  async getSubAccounts(masterAccountId: number) {
    try {

      // First, let's check what users exist with this masterAccountId
      const allUsersWithMasterAccount = await this.prisma.user.findMany({
        where: {
          masterAccountId: masterAccountId,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isSubAccount: true,
          masterAccountId: true,
          deletedAt: true,
        },
      });


      // Now get the sub-accounts (users that are not the main user)
      const subAccounts = await this.prisma.user.findMany({
        where: {
          masterAccountId: masterAccountId,
          deletedAt: null,
          // Exclude the main user (the one that might be the master account itself)
          id: {
            not: masterAccountId,
          },
        },
        select: {
          id: true,
          accountName: true,
          tradeRole: true,
          companyName: true,
          isActive: true,
          deletedAt: true,
          createdAt: true,
          status: true,
          email: true,
          phoneNumber: true,
          identityProof: true,
          identityProofBack: true,
          statusNote: true,
          profilePicture: true,
        },
        orderBy: { createdAt: 'desc' },
      });


      return {
        status: true,
        message: 'Sub-accounts fetched successfully',
        data: subAccounts,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error fetching sub-accounts',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method updateMasterAccountStatus
   * @async
   * @description Updates the status of all user accounts associated with a given
   *   master account.
   *
   * **Intent:** Allow admins to activate, deactivate, or change the status of an
   *   entire master account and all its linked user accounts in a single operation.
   *
   * **Idea:** Verifies the master account exists, then uses `updateMany` on the
   *   user table to cascade the status change.
   *
   * **Usage:** Called by `AdminController.updateMasterAccountStatus()`.
   *
   * **Data Flow:** req.body (masterAccountId, status) --> Prisma findUnique (masterAccount) -->
   *   Prisma updateMany (user where masterAccountId) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** Does not update the `masterAccount` record itself -- only the associated
   *   `user` records.
   *
   * @param {any} req - Express request with `req.body.masterAccountId` and `req.body.status`.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  // Update master account and associated users status
  async updateMasterAccountStatus(req: any) {
    try {
      const masterAccountId = req.body.masterAccountId;
      const status = req.body.status;

      let masterAccountExist = await this.prisma.masterAccount.findUnique({
        where: {
          id: masterAccountId,
        },
      });

      if (!masterAccountExist) {
        return {
          status: false,
          message: 'Master account not found',
          data: [],
        };
      }

      // Update all associated user accounts status
      await this.prisma.user.updateMany({
        where: { masterAccountId: masterAccountId },
        data: {
          status: status,
        },
      });

      return {
        status: true,
        message: 'Associated users updated successfully',
        data: { masterAccountId, status },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error updating master account users',
        error: getErrorMessage(error),
      };
    }
  }

  async updateProfile(req: any) {
    try {
      const userId = req?.user?.id;
      const { firstName, lastName, email, phoneNumber, cc } = req.body;

      if (!userId) {
        return {
          status: false,
          message: 'User not authenticated',
          data: [],
        };
      }

      let userExist = await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

      if (!userExist) {
        return {
          status: false,
          message: 'User not found',
          data: [],
        };
      }

      // Prepare update data
      const updateData: any = {};
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (email !== undefined) updateData.email = email;
      if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
      if (cc !== undefined) updateData.cc = cc;

      let updateUser = await this.prisma.user.update({
        where: { id: userId },
        data: updateData,
      });

      return {
        status: true,
        message: 'Profile updated successfully',
        data: updateUser,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error updating profile',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method updateOneUser
   * @async
   * @description Updates a single user's status, status note, and/or trade role,
   *   enforcing valid status-transition rules and logging changes for audit.
   *
   * **Intent:** Allow admins to approve, reject, or deactivate individual user
   *   accounts with proper validation.
   *
   * **Idea:**
   *   1. Looks up the user.
   *   2. Validates the requested status transition via `validateStatusTransition()`.
   *   3. Builds a dynamic update object with only the provided fields.
   *   4. Applies the Prisma update.
   *   5. If the status actually changed, logs the transition for audit.
   *
   * **Usage:** Called by `AdminController.updateOneUser()`.
   *
   * **Data Flow:** req.body (userId, status, statusNote, tradeRole) --> findUnique -->
   *   validateStatusTransition --> Prisma update --> logStatusChange --> response.
   *
   * **Dependencies:** PrismaClient, validateStatusTransition (private), logStatusChange (private).
   *
   * **Notes:** Fields are read from `req.body` (not a validated DTO at the service level).
   *
   * @param {any} req - Express request with user update fields in `req.body`.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async updateOneUser(req: any) {
    try {
      const userId = req.body.userId;
      const status = req?.body?.status;
      const statusNote = req?.body?.statusNote;
      const tradeRole = req?.body?.tradeRole;

      let userExist = await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
      });
      if (!userExist) {
        return {
          status: false,
          message: 'User not found',
          data: [],
        };
      }

      // Validate status transition
      const isValidTransition = this.validateStatusTransition(
        userExist.status,
        status,
      );
      if (!isValidTransition.valid) {
        return {
          status: false,
          message: isValidTransition.message,
          data: [],
        };
      }

      // Prepare update data
      const updateData: any = {};
      if (status) updateData.status = status;
      if (statusNote !== undefined) updateData.statusNote = statusNote;
      if (tradeRole) updateData.tradeRole = tradeRole;

      let updateUser = await this.prisma.user.update({
        where: { id: userId },
        data: updateData,
      });

      // Log status change for audit
      if (status && status !== userExist.status) {
        await this.logStatusChange(
          userId,
          userExist.status,
          status,
          statusNote,
          req?.user?.id,
        );
      }

      return {
        status: true,
        message: 'User updated successfully',
        data: updateUser,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error updating user',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method validateStatusTransition
   * @private
   * @description Checks whether a user status transition from `currentStatus` to
   *   `newStatus` is allowed according to the platform's state-machine rules.
   *
   * **Intent:** Enforce deterministic, auditable status lifecycle rules for user accounts.
   *
   * **Idea:** Maintains a `Record<string, string[]>` mapping each status to its set
   *   of valid successor statuses. Returns `{ valid, message }`.
   *
   * **Usage:** Called internally by `updateOneUser()` and `bulkUpdateUserStatus()`.
   *
   * **Data Flow:** (currentStatus, newStatus) --> lookup in validTransitions map --> result.
   *
   * **Dependencies:** None (pure logic).
   *
   * **Notes:**
   *   - Valid transitions:
   *     WAITING --> ACTIVE, REJECT, INACTIVE, WAITING_FOR_SUPER_ADMIN
   *     ACTIVE  --> REJECT, INACTIVE, WAITING_FOR_SUPER_ADMIN
   *     REJECT  --> ACTIVE, INACTIVE, WAITING_FOR_SUPER_ADMIN
   *     INACTIVE --> ACTIVE, REJECT, WAITING_FOR_SUPER_ADMIN
   *     WAITING_FOR_SUPER_ADMIN --> ACTIVE, REJECT, INACTIVE
   *   - An unknown `currentStatus` results in `valid: false`.
   *
   * @param {string} currentStatus - The user's current status.
   * @param {string} newStatus - The desired target status.
   * @returns {{ valid: boolean, message: string }}
   */
  // Validate status transitions
  private validateStatusTransition(
    currentStatus: string,
    newStatus: string,
  ): { valid: boolean; message: string } {
    const validTransitions: Record<string, string[]> = {
      WAITING: ['ACTIVE', 'REJECT', 'INACTIVE', 'WAITING_FOR_SUPER_ADMIN'],
      ACTIVE: ['REJECT', 'INACTIVE', 'WAITING_FOR_SUPER_ADMIN'],
      REJECT: ['ACTIVE', 'INACTIVE', 'WAITING_FOR_SUPER_ADMIN'],
      INACTIVE: ['ACTIVE', 'REJECT', 'WAITING_FOR_SUPER_ADMIN'],
      WAITING_FOR_SUPER_ADMIN: ['ACTIVE', 'REJECT', 'INACTIVE'],
    };

    if (!validTransitions[currentStatus]) {
      return {
        valid: false,
        message: `Invalid current status: ${currentStatus}`,
      };
    }

    if (!validTransitions[currentStatus].includes(newStatus)) {
      return {
        valid: false,
        message: `Cannot transition from ${currentStatus} to ${newStatus}`,
      };
    }

    return { valid: true, message: 'Valid transition' };
  }

  /**
   * @method logStatusChange
   * @private
   * @async
   * @description Records a user status change for audit trail purposes. Currently
   *   logs to the console; a commented-out section shows the planned database
   *   persistence via a `statusChangeLog` table.
   *
   * **Intent:** Maintain an audit trail of every admin-initiated user status change.
   *
   * **Idea:** Accepts the full context of a status change (who, what, why) and persists
   *   or logs it. Future implementation will write to a dedicated audit table.
   *
   * **Usage:** Called internally by `updateOneUser()` and `bulkUpdateUserStatus()`.
   *
   *   (future: Prisma create to statusChangeLog).
   *
   * **Dependencies:** Console (future: PrismaClient).
   *
   * **Notes:**
   *     parent operation.
   *   - TODO: Implement proper audit table persistence.
   *
   * @param {number} userId - The user whose status changed.
   * @param {string} oldStatus - The previous status.
   * @param {string} newStatus - The new status.
   * @param {string} statusNote - Optional note explaining the change.
   * @param {number} adminId - The admin who performed the change.
   * @returns {Promise<void>}
   */
  // Log status changes for audit
  private async logStatusChange(
    userId: number,
    oldStatus: string,
    newStatus: string,
    statusNote: string,
    adminId: number,
  ) {
    try {
      // You can implement logging to a separate table or use Logger for now

    } catch (error) {
    }
  }

  /**
   * @method getAvailableStatusTransitions
   * @async
   * @description Returns the set of valid next statuses for a given user, based on
   *   their current status, along with metadata for UI rendering.
   *
   * **Intent:** Let the admin UI dynamically present only valid status options in
   *   dropdown menus, preventing invalid transitions at the UI level.
   *
   * **Idea:** Looks up the user's current status, consults the same transition
   *   whitelist used by `validateStatusTransition()`, and returns enriched
   *   transition objects with display labels and `requiresNote` hints.
   *
   * **Usage:** Called by `AdminController.getAvailableStatusTransitions()`.
   *
   * **Data Flow:** userId --> Prisma findUnique (status only) --> transition map lookup -->
   *   enriched response with `currentStatus`, `availableTransitions`, and `transitions`.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:**
   *   - `requiresNote` is `true` for REJECT and INACTIVE transitions.
   *   - Label formatting: first char uppercase, remainder lowercase.
   *   - Duplicates the transition map from `validateStatusTransition()` (not DRY).
   *
   * @param {number} userId - The user's unique ID.
   * @returns {Promise<{status: boolean, message: string, data?: { currentStatus: string, availableTransitions: string[], transitions: Array<{value, label, requiresNote}> }, error?: string}>}
   */
  // Get available status transitions for a user
  async getAvailableStatusTransitions(userId: number) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { status: true },
      });

      if (!user) {
        return {
          status: false,
          message: 'User not found',
          data: [],
        };
      }

      const validTransitions: Record<string, string[]> = {
        WAITING: ['ACTIVE', 'REJECT', 'INACTIVE', 'WAITING_FOR_SUPER_ADMIN'],
        ACTIVE: ['REJECT', 'INACTIVE', 'WAITING_FOR_SUPER_ADMIN'],
        REJECT: ['ACTIVE', 'INACTIVE', 'WAITING_FOR_SUPER_ADMIN'],
        INACTIVE: ['ACTIVE', 'REJECT', 'WAITING_FOR_SUPER_ADMIN'],
        WAITING_FOR_SUPER_ADMIN: ['ACTIVE', 'REJECT', 'INACTIVE'],
      };

      const availableTransitions = validTransitions[user.status] || [];

      return {
        status: true,
        message: 'Available transitions retrieved successfully',
        data: {
          currentStatus: user.status,
          availableTransitions,
          transitions: availableTransitions.map((status) => ({
            value: status,
            label: status.charAt(0) + status.slice(1).toLowerCase(),
            requiresNote: ['REJECT', 'INACTIVE'].includes(status),
          })),
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error retrieving status transitions',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method bulkUpdateUserStatus
   * @async
   * @description Updates the status of multiple users in a single request, validating
   *   each user's transition individually and collecting per-user results.
   *
   * **Intent:** Allow admins to batch-approve, batch-reject, or batch-deactivate
   *   multiple users at once, with individual-level error handling.
   *
   * **Idea:** Iterates `userIds`, for each:
   *   1. Looks up the user.
   *   2. Validates the transition.
   *   3. Updates the user record.
   *   4. Logs the audit entry.
   *   Collects successes and failures separately and returns a summary.
   *
   * **Usage:** Called by `AdminController.bulkUpdateUserStatus()`.
   *
   * **Data Flow:** req.body (userIds[], status, statusNote) --> per-user: findUnique -->
   *   validateStatusTransition --> update --> logStatusChange --> aggregate results.
   *
   * **Dependencies:** PrismaClient, validateStatusTransition (private), logStatusChange (private).
   *
   * **Notes:**
   *   - Partial success is possible: some users may succeed while others fail.
   *   - Returns `status: true` even if some users failed, as long as the operation
   *     itself did not throw.
   *   - Validates that `userIds` is a non-empty array and `status` is present.
   *
   * @param {any} req - Express request with `{ userIds: number[], status: string, statusNote?: string }` in body.
   * @returns {Promise<{status: boolean, message: string, data?: { successful: any[], failed: any[], summary: { total, successful, failed } }, error?: string}>}
   */
  // Bulk status update for multiple users
  async bulkUpdateUserStatus(req: any) {
    try {
      const { userIds, status, statusNote } = req.body;
      const adminId = req?.user?.id;

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return {
          status: false,
          message: 'User IDs array is required',
          data: [],
        };
      }

      if (!status) {
        return {
          status: false,
          message: 'Status is required',
          data: [],
        };
      }

      const results = [];
      const errors = [];

      for (const userId of userIds) {
        try {
          const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { status: true },
          });

          if (!user) {
            errors.push({ userId, error: 'User not found' });
            continue;
          }

          // Validate status transition
          const isValidTransition = this.validateStatusTransition(
            user.status,
            status,
          );
          if (!isValidTransition.valid) {
            errors.push({ userId, error: isValidTransition.message });
            continue;
          }

          // Update user status
          const updatedUser = await this.prisma.user.update({
            where: { id: userId },
            data: {
              status,
              statusNote: statusNote || null,
            },
          });

          // Log status change
          await this.logStatusChange(
            userId,
            user.status,
            status,
            statusNote,
            adminId,
          );

          results.push({ userId, success: true, data: updatedUser });
        } catch (error) {
          errors.push({ userId, error: getErrorMessage(error) });
        }
      }

      return {
        status: true,
        message: `Bulk update completed. ${results.length} successful, ${errors.length} failed`,
        data: {
          successful: results,
          failed: errors,
          summary: {
            total: userIds.length,
            successful: results.length,
            failed: errors.length,
          },
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in bulk status update',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAllRfqQuotes
   * @async
   * @description Retrieves a paginated list of all active RFQ (Request For Quotation)
   *   quotes with their addresses, products, and product images.
   *
   * **Intent:** Let admins monitor and review RFQ activity across the marketplace.
   *
   * **Idea:** Filters by `status: 'ACTIVE'` and deeply includes address and product
   *   relations (rfqQuoteAddress, rfqQuotesProducts -> rfqProductDetails -> productImages).
   *
   * **Usage:** Called by `AdminController.getAllRfqQuotes()`.
   *
   * **Data Flow:** (page, limit, req, sort) --> Prisma findMany + count (rfqQuotes) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:**
   *   - Default sort direction is 'desc' when `sort` is falsy.
   *   - The success-case response message erroneously says "Not Found" -- likely a
   *     copy-paste artifact.
   *
   * @param {any} page - Page number (string, default 1).
   * @param {any} limit - Page size (string, default 10).
   * @param {any} req - Express request (unused beyond auth).
   * @param {any} sort - Sort direction ('asc' or 'desc').
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number, error?: string}>}
   */
  // RFQ SECTION BEGINS
  async getAllRfqQuotes(page: any, limit: any, req: any, sort: any) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize; // Calculate the offset
      let sortType = sort ? sort : 'desc';

      let getAllRfqQuotes = await this.prisma.rfqQuotes.findMany({
        where: {
          status: 'ACTIVE',
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
        orderBy: { createdAt: sortType },
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
        message: 'error, in getallRfqQuotes',
        error: getErrorMessage(error),
      };
    }
  }

  // RFQ SECTION ENDS

  // ------------------------------------- Country & States ---------------------------------------

  /**
   * @method getAllCountry
   * @async
   * @description Retrieves a paginated list of all active countries.
   *
   * **Intent:** Populate geography dropdown selectors in the admin panel and other UIs.
   *
   * **Idea:** Filters by `status: 'ACTIVE'`, ordered by `createdAt` descending.
   *
   * **Usage:** Called by `AdminController.getAllCountry()`.
   *
   * **Data Flow:** (page, limit) --> Prisma findMany + count (countries) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:**
   *   - Default limit is very large (100000) to effectively return all countries.
   *   - The `sort` parameter is accepted but ignored; sort is hardcoded to 'desc'.
   *
   * @param {any} page - Page number (string, default 1).
   * @param {any} limit - Page size (string, default 100000).
   * @param {any} req - Express request (unused).
   * @param {any} sort - Sort direction (ignored).
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number, error?: string}>}
   */
  async getAllCountry(page: any, limit: any, req: any, sort: any) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 100000;
      const skip = (Page - 1) * pageSize;
      const sortType = 'desc';

      let getAllCountry = await this.prisma.countries.findMany({
        where: {
          status: 'ACTIVE',
        },
        orderBy: { createdAt: sortType },
        skip, // Offset
        take: pageSize, // Limit
      });

      if (!getAllCountry) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
        };
      }

      let getAllCountryCount = await this.prisma.countries.count({
        where: { status: 'ACTIVE' },
      });

      return {
        status: true,
        message: 'Fetch Successfully',
        data: getAllCountry,
        totalCount: getAllCountryCount,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error, in getAllCountry',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAllStates
   * @async
   * @description Retrieves a paginated list of active states/provinces for a given country.
   *
   * **Intent:** Populate state/province dropdown selectors filtered by country.
   *
   * **Idea:** Filters by `status: 'ACTIVE'` and `countryId`, with a fallback default
   *   of India (101) when no country is specified.
   *
   * **Usage:** Called by `AdminController.getAllStates()`.
   *
   * **Data Flow:** (page, limit, countryId) --> Prisma findMany + count (states) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:**
   *   - Default limit is 5000 to accommodate countries with many states.
   *   - Default countryId is 101 (India).
   *   - Sort direction is hardcoded to 'desc'.
   *
   * @param {any} page - Page number (string, default 1).
   * @param {any} limit - Page size (string, default 5000).
   * @param {any} req - Express request (unused).
   * @param {any} sort - Sort direction (ignored).
   * @param {any} countryId - Country ID to filter by (string, default 101).
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number, error?: string}>}
   */
  async getAllStates(
    page: any,
    limit: any,
    req: any,
    sort: any,
    countryId: any,
  ) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 5000;
      const skip = (Page - 1) * pageSize;
      const sortType = 'desc';
      const countryID = parseInt(countryId) || 101;

      let getAllStates = await this.prisma.states.findMany({
        where: {
          status: 'ACTIVE',
          countryId: countryID,
        },
        orderBy: { createdAt: sortType },
        skip, // Offset
        take: pageSize, // Limit
      });

      if (!getAllStates) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
        };
      }

      let getAllStatesCount = await this.prisma.states.count({
        where: {
          status: 'ACTIVE',
          countryId: countryID,
        },
      });

      return {
        status: true,
        message: 'Fetch Successfully',
        data: getAllStates,
        totalCount: getAllStatesCount,
      };
    } catch (error) {

      return {
        status: false,
        message: 'error, in getAllStates',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAllCities
   * @async
   * @description Retrieves a paginated list of active cities, optionally filtered by
   *   state ID.  When `stateId` is -1, returns all cities regardless of state.
   *
   * **Intent:** Populate city dropdown selectors in the admin panel.
   *
   * **Idea:** Branches on stateId:
   *   - If stateId == -1, queries all active cities.
   *   - Otherwise, filters by the parsed stateId.
   *
   * **Usage:** Called by `AdminController.getAllCities()`.
   *
   * **Data Flow:** (page, limit, stateId) --> branch logic --> Prisma findMany + count (cities) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:**
   *   - Default limit is 5000.
   *   - Default stateId is 101.
   *   - Sort direction is hardcoded to 'desc'.
   *   - When stateId is -1, the count query still filters by `stateId: -1`, which
   *     may return 0 -- potential inconsistency with the data query.
   *
   * @param {any} page - Page number (string, default 1).
   * @param {any} limit - Page size (string, default 5000).
   * @param {any} req - Express request (unused).
   * @param {any} sort - Sort direction (ignored).
   * @param {any} stateId - State ID to filter by (-1 for all cities).
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number, error?: string}>}
   */
  async getAllCities(page: any, limit: any, req: any, sort: any, stateId: any) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 5000;
      const skip = (Page - 1) * pageSize;
      const sortType = 'desc';
      const stateID = parseInt(stateId) || 101;

      if (stateID === -1) {
        let getAllCities = await this.prisma.cities.findMany({
          where: {
            status: 'ACTIVE',
          },
          orderBy: { createdAt: sortType },
          skip, // Offset
          take: pageSize, // Limit
        });

        if (!getAllCities) {
          return {
            status: false,
            message: 'Not Found',
            data: [],
          };
        }

        let getAllCitiesCount = await this.prisma.cities.count({
          where: {
            status: 'ACTIVE',
            stateId: stateID,
          },
        });

        return {
          status: true,
          message: 'Fetch Successfully',
          data: getAllCities,
          totalCount: getAllCitiesCount,
        };
      }

      let getAllCities = await this.prisma.cities.findMany({
        where: {
          status: 'ACTIVE',
          stateId: stateID,
        },
        orderBy: { createdAt: sortType },
        skip, // Offset
        take: pageSize, // Limit
      });

      if (!getAllCities) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
        };
      }

      let getAllCitiesCount = await this.prisma.cities.count({
        where: {
          status: 'ACTIVE',
          stateId: stateID,
        },
      });

      return {
        status: true,
        message: 'Fetch Successfully',
        data: getAllCities,
        totalCount: getAllCitiesCount,
      };
    } catch (error) {

      return {
        status: false,
        message: 'error, in getAllCities',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   *  Permission CRUD
   */

  /**
   * @method createPermission
   * @async
   * @description Creates a new permission record or returns the existing one if a
   *   permission with the same name already exists (idempotent).
   *
   * **Intent:** Allow admins to define new permission entries for role-based access control.
   *
   * **Idea:** Checks for an existing permission by name via `findFirst`. If found,
   *   returns it with "Already exists" and `status: true` (idempotent). If not found,
   *   creates a new permission record with `addedBy` set to the current admin's ID.
   *
   * **Usage:** Called by `AdminController.createPermission()`.
   *
   * **Data Flow:** payload.name --> Prisma findFirst (dedup) --> Prisma create (if new) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:**
   *   - Returns `status: false` if `name` is not provided.
   *   - Returns `status: true` even for already-existing permissions.
   *
   * @param {any} payload - `{ name: string }`.
   * @param {any} req - Express request (for `req.user.id` as `addedBy`).
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async createPermission(payload: any, req: any) {
    try {
      const userId = req?.user?.id;
      if (!payload.name) {
        return {
          status: false,
          message: 'name is required',
        };
      }

      // Check if the user role already exists
      let existPermission = await this.prisma.permission.findFirst({
        where: { name: payload.name },
      });

      if (existPermission) {
        return {
          status: true, // Still return true as it already exists
          message: 'Already exists',
          data: existPermission,
        };
      }

      // Create new permission
      let newPermission = await this.prisma.permission.create({
        data: {
          name: payload.name,
          addedBy: userId,
        },
      });

      return {
        status: true,
        message: 'Created successfully',
        data: newPermission,
      };
    } catch (error) {

      return {
        status: false,
        message: 'error, in createPermission',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAllPermission
   * @async
   * @description Retrieves a paginated list of permissions created by the requesting
   *   admin, with optional case-insensitive name search.
   *
   * **Intent:** Populate the permissions management table in the admin panel.
   *
   * **Idea:** Filters by `addedBy: userId` and, when `searchTerm` is provided, applies
   *   a case-insensitive `contains` filter on the permission `name`.
   *
   * **Usage:** Called by `AdminController.getAllPermission()`.
   *
   * **Data Flow:** (page, limit, searchTerm, req.user.id) --> dynamic where -->
   *   Prisma findMany + count (permission) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** Only returns permissions owned by the requesting admin (`addedBy: userId`).
   *
   * @param {any} page - Page number (string, default 1).
   * @param {any} limit - Page size (string, default 10).
   * @param {any} searchTerm - Optional name filter (case-insensitive).
   * @param {any} req - Express request (for `req.user.id`).
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number, error?: string}>}
   */
  async getAllPermission(page: any, limit: any, searchTerm: any, req: any) {
    try {
      const userId = req?.user?.id;
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize; // Calculate offset

      let whereCondition: any = {
        addedBy: userId,
      };

      // Apply search filter if searchTerm is provided
      if (searchTerm) {
        whereCondition.name = {
          contains: searchTerm,
          mode: 'insensitive', // Case-insensitive search
        };
      }

      // Fetch paginated permissions
      let getAllPermissions = await this.prisma.permission.findMany({
        where: whereCondition,
        orderBy: { id: 'desc' },
        skip, // Offset
        take: pageSize, // Limit
      });

      // Count total permissions
      let totalPermissions = await this.prisma.permission.count({
        where: whereCondition,
      });

      return {
        status: true,
        message: 'Fetch Successfully',
        data: getAllPermissions,
        totalCount: totalPermissions,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in getAllPermission',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Help Center
   */

  /**
   * @method getAllHelpCenter
   * @async
   * @description Retrieves a paginated list of help-center tickets with optional
   *   text-based search on the user's query.
   *
   * **Intent:** Let admins view and triage incoming user support requests.
   *
   * **Idea:** Dynamically builds a where clause with optional case-insensitive
   *   `contains` filter on the `query` field. Includes the `userDetail` relation.
   *
   * **Usage:** Called by `AdminController.getAllHelpCenter()`.
   *
   * **Data Flow:** (page, limit, searchTerm) --> dynamic where --> Prisma findMany + count
   *   (helpCenter with userDetail) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** Ordered by `id` descending (newest first).
   *
   * @param {any} page - Page number (string, default 1).
   * @param {any} limit - Page size (string, default 10).
   * @param {any} searchTerm - Optional query-text filter.
   * @param {any} req - Express request (unused beyond auth).
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number, error?: string}>}
   */
  async getAllHelpCenter(page: any, limit: any, searchTerm: any, req: any) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize; // Calculate offset

      let whereCondition: any = {};

      // Apply search filter if searchTerm is provided
      if (searchTerm) {
        whereCondition.query = {
          contains: searchTerm,
          mode: 'insensitive', // Case-insensitive search
        };
      }

      // Fetch paginated help center requests
      let helpCenterRequests = await this.prisma.helpCenter.findMany({
        where: whereCondition,
        include: {
          userDetail: true,
        },
        orderBy: { id: 'desc' },
        skip, // Offset
        take: pageSize, // Limit
      });

      // Count total help center requests
      let totalHelpCenterRequests = await this.prisma.helpCenter.count({
        where: whereCondition,
      });

      return {
        status: true,
        message: 'Fetched successfully',
        data: helpCenterRequests,
        totalCount: totalHelpCenterRequests,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in getAllHelpCenter',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method replyHelpCenterById
   * @async
   * @description Saves an admin's reply to a help-center ticket and sends a
   *   notification email to the user who submitted the query.
   *
   * **Intent:** Enable admins to respond to user support requests from the back-office.
   *
   * **Idea:**
   *   1. Looks up the help-center ticket.
   *   2. Updates the `response` field with the admin's reply.
   *   3. Sends an email via `NotificationService.replyHelpCenter()`.
   *
   * **Usage:** Called by `AdminController.replyHelpCenterById()`.
   *
   * **Data Flow:** payload (helpCenterId, response) --> Prisma findUnique --> Prisma update -->
   *   NotificationService.replyHelpCenter() (fire-and-forget) --> response.
   *
   * **Dependencies:** PrismaClient, NotificationService.
   *
   * **Notes:**
   *   - The notification call is NOT awaited, so email failures do not affect the
   *     HTTP response.
   *
   * @param {any} payload - `{ helpCenterId: number|string, response: string }`.
   * @param {any} req - Express request (unused beyond auth).
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async replyHelpCenterById(payload: any, req: any) {
    try {
      const helpCenterId = parseInt(payload.helpCenterId);
      let helpCenterExist = await this.prisma.helpCenter.findUnique({
        where: { id: helpCenterId },
      });
      if (!helpCenterExist) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
        };
      }

      const response = payload.response;
      let updateHelpCenter = await this.prisma.helpCenter.update({
        where: { id: helpCenterId },
        data: {
          response: response,
        },
      });

      let data = {
        email: helpCenterExist.userEmail,
        name: 'User',
        userQuery: helpCenterExist.query,
        response: response,
      };

      this.notificationService.replyHelpCenter(data);

      return {
        status: true,
        message: 'Replied Successfully',
        data: updateHelpCenter,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in replyHelpCenter',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Finance Management (Admin side transaction list)
   */

  /**
   * @method getAllTransaction
   * @async
   * @description Retrieves a paginated list of Paymob payment transactions, filterable
   *   by transaction status and a free-text search term.
   *
   * **Intent:** Let admins monitor payment activity across the marketplace.
   *
   * **Idea:** Builds a dynamic where clause supporting:
   *   - Default status filter: INCOMPLETE, PENDING, SUCCESS, FAILED.
   *   - Optional specific `transactionStatus` override.
   *   - Optional text search on `orderId` and `paymobTransactionId`.
   *   Uses `Promise.all` for parallel findMany + count queries.
   *
   * **Usage:** Called by `AdminController.getAllTransaction()`.
   *
   * **Data Flow:** req.query (page, limit, transactionStatus, searchTerm) -->
   *   dynamic where --> Prisma findMany + count (transactionPaymob) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** Response includes `currentPage` and `totalPages` for pagination UI.
   *
   * @param {any} req - Express request with query params.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number, currentPage?: number, totalPages?: number, error?: string}>}
   */
  async getAllTransaction(req: any) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 1000) || 10;
      const skip = (page - 1) * limit;

      const transactionStatus = req.query.transactionStatus;
      const whereCondition: any = {
        transactionStatus: {
          in: ['INCOMPLETE', 'PENDING', 'SUCCESS', 'FAILED'],
        },
      };

      if (req.query.transactionStatus) {
        whereCondition.transactionStatus = req.query.transactionStatus;
      }

      // Optionally handle searchTerm if needed
      if (req.query.searchTerm) {
        const searchTerm = req.query.searchTerm;
        whereCondition.OR = [
          { orderId: { contains: searchTerm, mode: 'insensitive' } },
          {
            paymobTransactionId: { contains: searchTerm, mode: 'insensitive' },
          },
          // Add more fields as needed
        ];
      }

      const [transactions, totalCount] = await Promise.all([
        this.prisma.transactionPaymob.findMany({
          where: whereCondition,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.transactionPaymob.count({ where: whereCondition }),
      ]);

      return {
        status: true,
        message: 'Fetched transactions successfully',
        data: transactions,
        totalCount,
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error fetching transactions',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getOneTransaction
   * @async
   * @description Retrieves a single Paymob transaction by its ID.
   *
   * **Intent:** Let admins inspect the details of an individual payment transaction.
   *
   * **Idea:** Accepts `transactionId` from either `req.params.id` or `req.query.transactionId`,
   *   then performs a Prisma `findUnique`.
   *
   * **Usage:** Called by `AdminController.getOneTransaction()`.
   *
   * **Data Flow:** req (params or query) --> extract transactionId --> Prisma findUnique
   *   (transactionPaymob) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** Returns `status: false` if the ID is missing or the transaction is not found.
   *
   * @param {any} req - Express request with `transactionId` in query or params.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async getOneTransaction(req: any) {
    try {
      const transactionId = req.params.id || req.query.transactionId;

      if (!transactionId) {
        return {
          status: false,
          message: 'Transaction ID is required',
        };
      }

      const transaction = await this.prisma.transactionPaymob.findUnique({
        where: {
          id: Number(transactionId),
        },
      });

      if (!transaction) {
        return {
          status: false,
          message: 'Transaction not found',
        };
      }

      return {
        status: true,
        message: 'Transaction fetched successfully',
        data: transaction,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error fetching transaction',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Order Details (Admin Side)
   */

  /**
   * @method getAllOrder
   * @async
   * @description Retrieves a paginated, searchable list of orders (excluding
   *   soft-deleted records), with optional order-status filtering.
   *
   * **Intent:** Let admins view and manage marketplace order activity.
   *
   * **Idea:** Builds a dynamic where clause with:
   *   - `deletedAt: null` to exclude soft-deleted orders.
   *   - Optional `searchTerm` across `orderNo` and `paymobOrderId`.
   *   - Optional `status` filter on `orderStatus`.
   *   Uses `Promise.all` for parallel findMany + count.
   *
   * **Usage:** Called by `AdminController.getAllOrder()`.
   *
   * **Data Flow:** req.query (page, limit, searchTerm, status) --> dynamic where -->
   *   Prisma findMany + count (order) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** Response includes `currentPage` and `totalPages`.
   *
   * @param {any} req - Express request with query params.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number, currentPage?: number, totalPages?: number, error?: string}>}
   */
  async getAllOrder(req: any) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const skip = (page - 1) * limit;
      const searchTerm = req.query.searchTerm?.trim();
      const status = req.query.status; // optional status filter

      let whereCondition: any = {
        deletedAt: null,
      };

      if (searchTerm) {
        whereCondition.OR = [
          { orderNo: { contains: searchTerm, mode: 'insensitive' } },
          { paymobOrderId: { contains: searchTerm, mode: 'insensitive' } },
          // Add more searchable fields here
        ];
      }

      if (status) {
        whereCondition.orderStatus = status;
      }

      const [orders, totalCount] = await Promise.all([
        this.prisma.order.findMany({
          where: whereCondition,
          include: {
            order_orderProducts: {
              select: {
                salePrice: true,
                purchasePrice: true,
                orderQuantity: true,
              },
            },
          },
          skip,
          take: limit,
          orderBy: {
            createdAt: 'desc',
          },
        }),
        this.prisma.order.count({
          where: whereCondition,
        }),
      ]);

      // Calculate totalCustomerPay from order products if it's 0 or null
      const ordersWithCalculatedTotals = orders.map((order: any) => {
        // Convert Decimal to number if needed
        const currentTotal = order.totalCustomerPay 
          ? (typeof order.totalCustomerPay === 'object' && order.totalCustomerPay.toNumber 
              ? order.totalCustomerPay.toNumber() 
              : Number(order.totalCustomerPay))
          : 0;
        
        if (!currentTotal || currentTotal === 0) {
          let calculatedTotal = 0;
          if (order.order_orderProducts && order.order_orderProducts.length > 0) {
            order.order_orderProducts.forEach((product: any) => {
              const price = product.salePrice 
                ? (typeof product.salePrice === 'object' && product.salePrice.toNumber 
                    ? product.salePrice.toNumber() 
                    : Number(product.salePrice))
                : (product.purchasePrice 
                    ? (typeof product.purchasePrice === 'object' && product.purchasePrice.toNumber 
                        ? product.purchasePrice.toNumber() 
                        : Number(product.purchasePrice))
                    : 0);
              const quantity = Number(product.orderQuantity || 1);
              calculatedTotal += price * quantity;
            });
          }
          const deliveryCharge = order.deliveryCharge 
            ? (typeof order.deliveryCharge === 'object' && order.deliveryCharge.toNumber 
                ? order.deliveryCharge.toNumber() 
                : Number(order.deliveryCharge))
            : 0;
          order.totalCustomerPay = calculatedTotal + deliveryCharge;
        } else {
          // Ensure it's a number, not a Decimal object
          order.totalCustomerPay = currentTotal;
        }
        return order;
      });

      return {
        status: true,
        message: 'Fetched successfully',
        data: ordersWithCalculatedTotals,
        totalCount,
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error fetching orders',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getOneOrder
   * @async
   * @description Retrieves full details of a single order by ID, including order
   *   products (with product, price, service, and shipping detail) and order addresses.
   *
   * **Intent:** Power the admin order detail view.
   *
   * **Idea:** Accepts `orderId` from params or query, then performs a Prisma `findUnique`
   *   with deep includes for order products and addresses.
   *
   * **Usage:** Called by `AdminController.getOneOrder()`.
   *
   * **Data Flow:** req (params or query) --> extract orderId --> Prisma findUnique (order
   *   with includes) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** Includes: order_orderProducts (product, price, service, shipping), order_orderAddress.
   *
   * @param {any} req - Express request with `orderId` in params or query.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async getOneOrder(req: any) {
    try {
      const orderId = req.params.id || req.query.orderId;

      if (!orderId) {
        return {
          status: false,
          message: 'Order ID is required',
        };
      }

      const order = await this.prisma.order.findUnique({
        where: {
          id: Number(orderId),
        },
        include: {
          order_orderProducts: {
            include: {
              orderProduct_product: {
                select: {
                  id: true,
                  productName: true,
                  productImages: {
                    select: {
                      id: true,
                      image: true,
                    },
                    take: 1,
                  },
                },
              },
              orderProduct_productPrice: {
                include: {
                  productPrice_product: {
                    select: {
                      id: true,
                      productName: true,
                      productImages: {
                        select: {
                          id: true,
                          image: true,
                        },
                        take: 1,
                      },
                    },
                  },
                },
              },
              service: true,
              orderShippingDetail: true,
            },
          },
          order_orderAddress: true,
        },
      });

      if (!order) {
        return {
          status: false,
          message: 'Order not found',
        };
      }

      return {
        status: true,
        message: 'Order fetched successfully',
        data: order,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error fetching order',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAllOrderProduct
   * @async
   * @description Retrieves a paginated list of order products for a specific order.
   *
   * **Intent:** Let admins inspect line items within a particular order.
   *
   * **Idea:** Filters by `orderId` and paginates the results. A `searchTerm` parameter
   *   is accepted but the corresponding filter is currently commented out.
   *
   * **Usage:** Called by `AdminController.getAllOrderProduct()`.
   *
   * **Data Flow:** req.query (orderId, page, limit) --> Prisma findMany + count
   *   (orderProducts) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:**
   *   - `searchTerm` filtering code is present but commented out.
   *   - Response includes `currentPage` and `totalPages`.
   *
   * @param {any} req - Express request with `orderId`, `page`, `limit` in query.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number, currentPage?: number, totalPages?: number, error?: string}>}
   */
  async getAllOrderProduct(req: any) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const skip = (page - 1) * limit;

      // Optional: Add searchTerm filter here if needed
      const searchTerm = req.query.searchTerm;
      const orderId = req.query.orderId;

      let whereCondition: any = {
        orderId: parseInt(orderId),
      };

      if (searchTerm) {
        // whereCondition = {
        //   OR: [
        //     { productName: { contains: searchTerm, mode: 'insensitive' } },
        //     { productCode: { contains: searchTerm, mode: 'insensitive' } },
        //   ],
        // };
      }

      const orderProducts = await this.prisma.orderProducts.findMany({
        where: whereCondition,
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      });

      const totalCount = await this.prisma.orderProducts.count({
        where: whereCondition,
      });

      return {
        status: true,
        message: 'Fetched order products successfully',
        data: orderProducts,
        totalCount,
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error fetching order products',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getOneOrderProduct
   * @async
   * @description Retrieves a single order product record by its ID.
   *
   * **Intent:** Let admins inspect individual line-item details within an order.
   *
   * **Idea:** Parses `orderProductId` from the query string and performs a Prisma
   *   `findUnique`.
   *
   * **Usage:** Called by `AdminController.getOneOrderProduct()`.
   *
   * **Data Flow:** req.query.orderProductId --> parseInt --> Prisma findUnique
   *   (orderProducts) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** Returns `status: false` with "Invalid order product ID" if the value is NaN.
   *
   * @param {any} req - Express request with `orderProductId` in query.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async getOneOrderProduct(req: any) {
    try {
      const orderProductId = parseInt(req.query.orderProductId);

      if (isNaN(orderProductId)) {
        return {
          status: false,
          message: 'Invalid order product ID',
        };
      }

      const orderProduct = await this.prisma.orderProducts.findUnique({
        where: { id: orderProductId },
      });

      if (!orderProduct) {
        return {
          status: false,
          message: 'Order product not found',
        };
      }

      return {
        status: true,
        message: 'Fetched order product successfully',
        data: orderProduct,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error fetching order product',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   *  Services
   */

  /**
   * @method getAllService
   * @async
   * @description Retrieves a paginated list of marketplace services that are either
   *   ACTIVE or INACTIVE, with optional name-based search.
   *
   * **Intent:** Let admins browse and moderate seller-provided services.
   *
   * **Idea:** Filters by `status in ['ACTIVE', 'INACTIVE']` and `serviceName` containing
   *   the trimmed search term (case-insensitive). Includes `serviceFeatures` and the
   *   first image for each service.
   *
   * **Usage:** Called by `AdminController.getAllService()`.
   *
   * **Data Flow:** (page, limit, req.query.searchTerm) --> dynamic where --> Prisma findMany + count
   *   (service with features and first image) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** Returns `status: false` with "No services found" if the result set is empty.
   *
   * @param {number} page - Page number (already parsed by pipe).
   * @param {number} limit - Page size (already parsed by pipe).
   * @param {any} req - Express request (for `req.query.searchTerm`).
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number, error?: string}>}
   */
  async getAllService(page: number, limit: number, req: any) {
    try {
      let Page = page || 1;
      let pageSize = limit || 100;
      const skip = (Page - 1) * pageSize;
      const searchTerm = req.query.searchTerm?.trim();

      let whereCondition: any = {
        status: { in: ['ACTIVE', 'INACTIVE'] },
        serviceName: {
          contains: searchTerm,
          mode: 'insensitive',
        },
      };

      const services = await this.prisma.service.findMany({
        where: whereCondition,
        include: {
          serviceFeatures: true,
          images: {
            take: 1,
          },
        },
        skip,
        take: pageSize,
        orderBy: {
          createdAt: 'desc',
        },
      });

      const totalCount = await this.prisma.service.count({
        where: whereCondition,
      });

      if (!services || services.length === 0) {
        return {
          status: false,
          message: 'No services found',
          data: [],
        };
      }

      return {
        status: true,
        message: 'Fetched services successfully',
        data: services,
        totalCount: totalCount,
      };
    } catch (error) {

      return {
        status: false,
        message: 'Error fetching getAllService',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getServiceById
   * @async
   * @description Retrieves full details of a single service by its ID, including all
   *   related entities (tags, features, images, seller profile, geography relations).
   *
   * **Intent:** Power the admin service detail / review view.
   *
   * **Idea:** Uses Prisma `findUnique` with deep `include` for: serviceTags,
   *   serviceFeatures, images, seller (selected fields + profile), country, state,
   *   toCity, fromCity, rangeCity.
   *
   * **Usage:** Called by `AdminController.getServiceById()`.
   *
   * **Data Flow:** serviceId --> Prisma findUnique (service with includes) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** Response uses `success` instead of `status` on success -- differs from
   *   the error branch and other methods.
   *
   * @param {number} serviceId - The service's unique ID.
   * @returns {Promise<{success?: boolean, status?: boolean, message: string, data?: any, error?: string}>}
   */
  async getServiceById(serviceId: number) {
    try {
      const serviceID = serviceId;
      const service = await this.prisma.service.findUnique({
        where: { id: serviceID },
        include: {
          serviceTags: true,
          serviceFeatures: true,
          images: true,
          seller: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profilePicture: true,
              email: true,
              cc: true,
              phoneNumber: true,
              tradeRole: true,
            },
          },
          country: true,
          state: true,
          toCity: true,
          fromCity: true,
          rangeCity: true,
        },
      });
      return {
        success: true,
        message: 'service fetched successfully',
        data: service,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in fetching service by id',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method updateService
   * @async
   * @description Updates the status of an existing service.
   *
   * **Intent:** Allow admins to activate or deactivate a seller's service listing.
   *
   * **Idea:** Looks up the service by ID, returns "Not Found" if missing, then updates
   *   the `status` field from `req.body.status`.
   *
   * **Usage:** Called by `AdminController.updateService()`.
   *
   * **Data Flow:** serviceId --> Prisma findUnique --> Prisma update (status) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** Only the `status` field is modified. Success response uses `success`
   *   key instead of `status` -- differs from most other methods.
   *
   * @param {number} serviceId - The service's unique ID.
   * @param {any} req - Express request with `req.body.status`.
   * @returns {Promise<{success?: boolean, status?: boolean, message: string, data?: any, error?: string}>}
   */
  async updateService(serviceId: number, req: any) {
    try {
      const serviceID = serviceId;
      const service = await this.prisma.service.findUnique({
        where: { id: serviceID },
      });
      if (!service) {
        return {
          success: false,
          message: 'No Found',
          data: [],
        };
      }

      let updateService = await this.prisma.service.update({
        where: { id: serviceID },
        data: {
          status: req?.body?.status,
        },
      });
      return {
        success: true,
        message: 'service updated successfully',
        data: updateService,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in updateService',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Page Setting
   */

  /**
   * @method createPageSetting
   * @async
   * @description Creates a new page-setting record for CMS-like configuration.
   *
   * **Intent:** Allow admins to persist page-level configuration (banners, content blocks,
   *   etc.) without code deployments.
   *
   * **Idea:** Creates a `PageSetting` record with `slug`, `setting` (JSON), and `status`.
   *
   * **Usage:** Not directly routed by the controller; the controller uses
   *   `updatePageSetting` which includes create-if-not-exists logic.
   *
   * **Data Flow:** payload (slug, setting, status) --> Prisma create (pageSetting) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** This method may be called internally by `updatePageSetting` or used for
   *   future direct-creation routes.
   *
   * @param {any} payload - `{ slug: string, setting: JSON, status: string }`.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async createPageSetting(payload: any) {
    try {
      const pageSetting = await this.prisma.pageSetting.create({
        data: {
          slug: payload.slug,
          setting: payload.setting,
          status: payload.status,
        },
      });
      return {
        status: true,
        message: 'Page Setting created successfully',
        data: pageSetting,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in create page setting',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAllPageSetting
   * @async
   * @description Retrieves a paginated list of active page settings, optionally
   *   filtered by slug.
   *
   * **Intent:** Let the admin panel or front-end list all configured page settings.
   *
   * **Idea:** Filters by `status: 'ACTIVE'` and optionally by `req.query.slug`.
   *   Ordered by `createdAt` descending.
   *
   * **Usage:** Called by `AdminController.getAllPageSetting()`.
   *
   * **Data Flow:** (page, limit, req.query.slug) --> dynamic where --> Prisma findMany + count
   *   (pageSetting) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** Default limit is 1000 to return most settings in one page.
   *
   * @param {any} page - Page number (string, default 1).
   * @param {any} limit - Page size (string, default 1000).
   * @param {any} req - Express request (for optional `req.query.slug`).
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number, error?: string}>}
   */
  async getAllPageSetting(page: any, limit: any, req: any) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 1000;
      const skip = (Page - 1) * pageSize; // Calculate the offset

      let whereCondition: any = {
        status: 'ACTIVE',
      };

      if (req.query.slug) {
        whereCondition.slug = req.query.slug;
      }

      let getAllPageSetting = await this.prisma.pageSetting.findMany({
        where: whereCondition,
        orderBy: { createdAt: 'desc' },
        skip, // Offset
        take: pageSize, // Limit
      });

      if (!getAllPageSetting) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
        };
      }

      let getAllPageSettingCount = await this.prisma.pageSetting.count({
        where: { status: 'ACTIVE' },
      });

      return {
        status: true,
        message: 'Fetch Successfully',
        data: getAllPageSetting,
        totalCount: getAllPageSettingCount,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error, in getAllPageSetting',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method updatePageSetting
   * @async
   * @description Creates or updates a page setting identified by its slug (upsert pattern).
   *
   * **Intent:** Allow admins to configure CMS-like page settings, creating new entries
   *   or modifying existing ones in a single operation.
   *
   * **Idea:**
   *   1. Checks if a page setting with the given slug already exists.
   *   2. If it exists, updates `setting` and `status`.
   *   3. If it does not exist, creates a new record with `slug`, `setting`, and `status`.
   *
   * **Usage:** Called by `AdminController.updatePageSetting()`.
   *
   * **Data Flow:** payload (slug, setting, status) --> Prisma findUnique --> branch:
   *   Prisma update (existing) or Prisma create (new) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** The response message differentiates between "updated" and "created".
   *
   * @param {any} payload - `{ slug: string, setting: JSON, status: string }`.
   * @param {any} req - Express request (unused beyond auth).
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async updatePageSetting(payload: any, req: any) {
    try {
      // Check if the PageSetting with the given slug exists
      const existingSetting = await this.prisma.pageSetting.findUnique({
        where: { slug: payload.slug },
      });

      let pageSetting;

      if (existingSetting) {
        // If it exists, update it
        pageSetting = await this.prisma.pageSetting.update({
          where: { slug: payload.slug },
          data: {
            setting: payload.setting,
            status: payload.status,
          },
        });
      } else {
        // If it doesn't exist, create a new one
        pageSetting = await this.prisma.pageSetting.create({
          data: {
            slug: payload.slug,
            setting: payload.setting,
            status: payload.status,
          },
        });
      }

      return {
        status: true,
        message: existingSetting
          ? 'Page Setting updated successfully'
          : 'Page Setting created successfully',
        data: pageSetting,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in updating/creating Page Setting',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getOnePageSetting
   * @async
   * @description Retrieves a single page setting by its unique slug.
   *
   * **Intent:** Let the front-end fetch the configuration for a specific page
   *   (e.g. homepage, footer).
   *
   * **Idea:** Uses Prisma `findUnique` on the `slug` field.
   *
   * **Usage:** Called by `AdminController.getOnePageSetting()`.
   *
   * **Data Flow:** slug --> Prisma findUnique (pageSetting) --> response.
   *
   * **Dependencies:** PrismaClient.
   *
   * **Notes:** Returns `status: false` with "Page Setting not found" if no record matches.
   *
   * @param {string} slug - The page setting's unique slug identifier.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async getOnePageSetting(slug: string) {
    try {
      const pageSetting = await this.prisma.pageSetting.findUnique({
        where: { slug: slug },
      });

      if (!pageSetting) {
        return {
          status: false,
          message: 'Page Setting not found',
          data: [],
        };
      }

      return {
        status: true,
        message: 'Page Setting fetched successfully',
        data: pageSetting,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in fetching Page Setting',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Dashboard Statistics
   */
  async getDashboardStatistics(req: any) {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Get all counts
      const [
        totalProducts,
        totalOrders,
        totalUsers,
        totalTransactions,
        totalServices,
        totalCategories,
        totalBrands,
        totalRfqQuotes,
        totalHelpCenter,
        totalDropshipableProducts,
      ] = await Promise.all([
        this.prisma.product.count({ where: { deletedAt: null } }),
        this.prisma.order.count({ where: { deletedAt: null } }),
        this.prisma.user.count({ where: { deletedAt: null, userType: { not: 'ADMIN' } } }),
        this.prisma.transactionPaymob.count(),
        this.prisma.service.count({ where: { status: { in: ['ACTIVE', 'INACTIVE'] } } }),
        this.prisma.category.count({ where: { status: 'ACTIVE' } }),
        this.prisma.brand.count({ where: { status: 'ACTIVE' } }),
        this.prisma.rfqQuotes.count({ where: { status: 'ACTIVE' } }),
        this.prisma.helpCenter.count(),
        this.prisma.product.count({ where: { isDropshipable: true, deletedAt: null } }),
      ]);

      // Get orders for revenue calculation
      const allOrders = await this.prisma.order.findMany({
        where: { deletedAt: null },
        select: {
          totalCustomerPay: true,
          createdAt: true,
          orderStatus: true,
        },
      });

      // Calculate total revenue
      const totalRevenue = allOrders.reduce((sum, order) => {
        const amount = parseFloat(order.totalCustomerPay?.toString() || '0');
        return sum + (isNaN(amount) ? 0 : amount);
      }, 0);

      // Get current period orders (last 30 days)
      const currentPeriodOrders = allOrders.filter(
        (order) => new Date(order.createdAt) >= thirtyDaysAgo,
      );
      const currentPeriodRevenue = currentPeriodOrders.reduce((sum, order) => {
        const amount = parseFloat(order.totalCustomerPay?.toString() || '0');
        return sum + (isNaN(amount) ? 0 : amount);
      }, 0);

      // Get previous period orders (30-60 days ago)
      const previousPeriodOrders = allOrders.filter(
        (order) =>
          new Date(order.createdAt) >= sixtyDaysAgo &&
          new Date(order.createdAt) < thirtyDaysAgo,
      );
      const previousPeriodRevenue = previousPeriodOrders.reduce((sum, order) => {
        const amount = parseFloat(order.totalCustomerPay?.toString() || '0');
        return sum + (isNaN(amount) ? 0 : amount);
      }, 0);

      // Calculate trends
      const calculateTrend = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
      };

      const revenueTrend = calculateTrend(currentPeriodRevenue, previousPeriodRevenue);
      const ordersTrend = calculateTrend(
        currentPeriodOrders.length,
        previousPeriodOrders.length,
      );

      // Get orders by status
      const ordersByStatus = await this.prisma.order.groupBy({
        by: ['orderStatus'],
        where: { deletedAt: null },
        _count: { id: true },
      });

      // Get last 7 days revenue data for chart
      const last7DaysData = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const dayStart = new Date(date.setHours(0, 0, 0, 0));
        const dayEnd = new Date(date.setHours(23, 59, 59, 999));

        const dayOrders = allOrders.filter(
          (order) =>
            new Date(order.createdAt) >= dayStart &&
            new Date(order.createdAt) <= dayEnd,
        );

        const dayRevenue = dayOrders.reduce((sum, order) => {
          const amount = parseFloat(order.totalCustomerPay?.toString() || '0');
          return sum + (isNaN(amount) ? 0 : amount);
        }, 0);

        last7DaysData.push({
          date: dayStart.toISOString().split('T')[0],
          revenue: dayRevenue,
          orders: dayOrders.length,
        });
      }

      // Get recent orders (last 10)
      const recentOrders = await this.prisma.order.findMany({
        where: { deletedAt: null },
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderNo: true,
          totalCustomerPay: true,
          orderStatus: true,
          createdAt: true,
          order_orderAddress: {
            select: {
              firstName: true,
              lastName: true,
            },
            take: 1,
          },
        },
      });

      // Get users by trade role
      const usersByRole = await this.prisma.user.groupBy({
        by: ['tradeRole'],
        where: { deletedAt: null, userType: { not: 'ADMIN' } },
        _count: { id: true },
      });

      // Get products by status
      const productsByStatus = await this.prisma.product.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { id: true },
      });

      // Get top categories
      const topCategories = await this.prisma.category.findMany({
        where: { status: 'ACTIVE', parentId: null },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              categoryProducts: true,
            },
          },
        },
      });

      return {
        status: true,
        message: 'Dashboard statistics fetched successfully',
        data: {
          overview: {
            totalProducts,
            totalOrders,
            totalUsers,
            totalRevenue,
            totalServices,
            totalCategories,
            totalBrands,
            totalRfqQuotes,
            totalHelpCenter,
            totalDropshipableProducts,
          },
          trends: {
            revenue: {
              current: currentPeriodRevenue,
              previous: previousPeriodRevenue,
              change: revenueTrend,
              isPositive: revenueTrend >= 0,
            },
            orders: {
              current: currentPeriodOrders.length,
              previous: previousPeriodOrders.length,
              change: ordersTrend,
              isPositive: ordersTrend >= 0,
            },
          },
          ordersByStatus: ordersByStatus.map((item) => ({
            status: item.orderStatus,
            count: item._count.id,
          })),
          usersByRole: usersByRole.map((item) => ({
            role: item.tradeRole,
            count: item._count.id,
          })),
          productsByStatus: productsByStatus.map((item) => ({
            status: item.status,
            count: item._count.id,
          })),
          chartData: {
            last7Days: last7DaysData,
          },
          recentOrders: recentOrders.map((order) => ({
            id: order.id,
            orderNo: order.orderNo,
            amount: parseFloat(order.totalCustomerPay?.toString() || '0'),
            status: order.orderStatus,
            date: order.createdAt,
            customer:
              order.order_orderAddress?.[0]?.firstName &&
              order.order_orderAddress?.[0]?.lastName
                ? `${order.order_orderAddress[0].firstName} ${order.order_orderAddress[0].lastName}`
                : 'N/A',
          })),
          topCategories: topCategories.map((cat) => ({
            id: cat.id,
            name: cat.name,
            productCount: cat._count.categoryProducts,
          })),
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error fetching dashboard statistics',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Admin Notifications
   */
  async getAdminNotifications(
    req: any,
    page: number,
    limit: number,
    read?: string,
  ) {
    try {
      const adminId = req?.user?.id;
      if (!adminId) {
        return {
          status: false,
          message: 'Unauthorized',
          data: [],
        };
      }

      // Ensure page and limit are integers
      const pageNum = typeof page === 'string' ? parseInt(page, 10) : page;
      const limitNum = typeof limit === 'string' ? parseInt(limit, 10) : limit;

      const skip = (pageNum - 1) * limitNum;
      const where: any = {
        userId: adminId,
        // Only show admin-specific notification types
        // Exclude user-facing notifications like RFQ, ORDER, MESSAGE, etc.
        type: {
          in: ['PRODUCT', 'ACCOUNT', 'SYSTEM'],
        },
      };

      if (read === 'true') {
        where.read = true;
      } else if (read === 'false') {
        where.read = false;
      }

      const [notifications, total] = await Promise.all([
        this.prisma.notification.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limitNum,
        }),
        this.prisma.notification.count({ where }),
      ]);

      return {
        status: true,
        message: 'Notifications fetched successfully',
        data: notifications,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error fetching notifications',
        error: getErrorMessage(error),
      };
    }
  }

  async getUnreadNotificationCount(req: any) {
    try {
      const adminId = req?.user?.id;
      if (!adminId) {
        return {
          status: false,
          message: 'Unauthorized',
          data: 0,
        };
      }

      const count = await this.prisma.notification.count({
        where: {
          userId: adminId,
          read: false,
          // Only count admin-specific notification types
          type: {
            in: ['PRODUCT', 'ACCOUNT', 'SYSTEM'],
          },
        },
      });

      return {
        status: true,
        message: 'Unread count fetched successfully',
        data: count,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error fetching unread count',
        error: getErrorMessage(error),
      };
    }
  }

  async markNotificationAsRead(id: number, req: any) {
    try {
      const adminId = req?.user?.id;
      if (!adminId) {
        return {
          status: false,
          message: 'Unauthorized',
          data: null,
        };
      }

      const notification = await this.prisma.notification.findFirst({
        where: {
          id,
          userId: adminId,
        },
      });

      if (!notification) {
        return {
          status: false,
          message: 'Notification not found',
          data: null,
        };
      }

      const updated = await this.prisma.notification.update({
        where: { id },
        data: {
          read: true,
          readAt: new Date(),
        },
      });

      return {
        status: true,
        message: 'Notification marked as read',
        data: updated,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error marking notification as read',
        error: getErrorMessage(error),
      };
    }
  }

  async markAllNotificationsAsRead(req: any) {
    try {
      const adminId = req?.user?.id;
      if (!adminId) {
        return {
          status: false,
          message: 'Unauthorized',
          data: null,
        };
      }

      const result = await this.prisma.notification.updateMany({
        where: {
          userId: adminId,
          read: false,
          // Only mark admin-specific notification types as read
          type: {
            in: ['PRODUCT', 'ACCOUNT', 'SYSTEM'],
          },
        },
        data: {
          read: true,
          readAt: new Date(),
        },
      });

      return {
        status: true,
        message: 'All notifications marked as read',
        data: { updatedCount: result.count },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error marking all notifications as read',
        error: getErrorMessage(error),
      };
    }
  }

  async deleteNotification(id: number, req: any) {
    try {
      const adminId = req?.user?.id;
      if (!adminId) {
        return {
          status: false,
          message: 'Unauthorized',
          data: null,
        };
      }

      const notification = await this.prisma.notification.findFirst({
        where: {
          id,
          userId: adminId,
        },
      });

      if (!notification) {
        return {
          status: false,
          message: 'Notification not found',
          data: null,
        };
      }

      await this.prisma.notification.delete({
        where: { id },
      });

      return {
        status: true,
        message: 'Notification deleted successfully',
        data: null,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error deleting notification',
        error: getErrorMessage(error),
      };
    }
  }

  async getSidebarCounts(req: any) {
    try {
      const adminUserId = req?.user?.id;
      
      // Get last viewed timestamps for users and products separately
      const twoHoursAgo = new Date();
      twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);
      
      // Get users viewed timestamp
      let usersCutoffTime = twoHoursAgo;
      if (adminUserId) {
        const usersViewedKey = `users_${adminUserId}`;
        const usersViewedTime = AdminService.adminViewTracking.get(usersViewedKey);
        if (usersViewedTime) {
          usersCutoffTime = usersViewedTime;
        } else {
          // Fallback to admin user's updatedAt if no tracking exists
          const adminUser = await this.prisma.user.findUnique({
            where: { id: adminUserId },
            select: { updatedAt: true },
          });
          if (adminUser?.updatedAt) {
            usersCutoffTime = adminUser.updatedAt;
          }
        }
      }
      
      // Get products viewed timestamp
      // Use admin user's onlineOfflineDateStatus field to store products viewed timestamp
      let productsCutoffTime = twoHoursAgo;
      if (adminUserId) {
        // First check in-memory Map
        const productsViewedKey = `products_${adminUserId}`;
        const productsViewedTime = AdminService.adminViewTracking.get(productsViewedKey);
        if (productsViewedTime) {
          productsCutoffTime = productsViewedTime;
        } else {
          // Fallback: check admin user's onlineOfflineDateStatus field (we'll use this to store products viewed time)
          const adminUser = await this.prisma.user.findUnique({
            where: { id: adminUserId },
            select: { onlineOfflineDateStatus: true },
          });
          if (adminUser?.onlineOfflineDateStatus) {
            productsCutoffTime = adminUser.onlineOfflineDateStatus;
          }
        }
      }
      

      // Count new users:
      // 1. Master accounts created after admin last viewed users list (or last 2 hours if never viewed)
      // 2. OR master accounts with users having WAITING status (need approval)
      const newUsersCount = await this.prisma.masterAccount.count({
        where: {
          deletedAt: null,
          OR: [
            {
              createdAt: {
                gte: usersCutoffTime,
              },
            },
            {
              users: {
                some: {
                  deletedAt: null,
                  status: 'WAITING',
                },
              },
            },
          ],
        },
      });

      // Count new products:
      // Only count products created after admin last viewed products list
      // This ensures the count clears when admin views the page
      const newProductsCount = await this.prisma.product.count({
        where: {
          deletedAt: null,
          createdAt: {
            gte: productsCutoffTime,
          },
        },
      });
      

      // Count new sub-accounts:
      // 1. Sub-accounts with WAITING status (need approval, excluding buyer accounts)
      // 2. OR sub-accounts created after admin last viewed users list (excluding buyer accounts)
      const newSubAccountsCount = await this.prisma.user.count({
        where: {
          deletedAt: null,
          tradeRole: {
            not: 'BUYER', // Exclude default buyer accounts
          },
          OR: [
            {
              status: 'WAITING',
            },
            {
              createdAt: {
                gte: usersCutoffTime,
              },
            },
          ],
        },
      });

      return {
        status: true,
        message: 'Counts fetched successfully',
        data: {
          newUsers: newUsersCount,
          newProducts: newProductsCount,
          newSubAccounts: newSubAccountsCount,
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error fetching counts',
        error: getErrorMessage(error),
        data: {
          newUsers: 0,
          newProducts: 0,
          newSubAccounts: 0,
        },
      };
    }
  }

  async markUserListViewViewed(req: any) {
    try {
      const adminUserId = req?.user?.id;
      
      if (!adminUserId) {
        return {
          status: false,
          message: 'Admin user ID not found',
        };
      }

      const now = new Date();
      const key = `users_${adminUserId}`;
      AdminService.adminViewTracking.set(key, now);

      return {
        status: true,
        message: 'User list marked as viewed',
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error marking as viewed',
        error: getErrorMessage(error),
      };
    }
  }

  async markProductsListViewViewed(req: any) {
    try {
      const adminUserId = req?.user?.id;
      
      if (!adminUserId) {
        return {
          status: false,
          message: 'Admin user ID not found',
        };
      }

      const now = new Date();
      const key = `products_${adminUserId}`;
      
      // Store in both Map and database for persistence
      AdminService.adminViewTracking.set(key, now);
      
      // Also store in admin user's onlineOfflineDateStatus field for persistence
      await this.prisma.user.update({
        where: { id: adminUserId },
        data: {
          onlineOfflineDateStatus: now,
        },
      });
      

      return {
        status: true,
        message: 'Products list marked as viewed',
        data: {
          timestamp: now,
          key: key,
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error marking as viewed',
        error: getErrorMessage(error),
      };
    }
  }
}
