/**
 * @fileoverview ServiceService -- Business-logic provider for the Service domain.
 *
 * Intent:
 *   Encapsulates every database operation related to service listings
 *   (create, read, update, list, Q&A) within the Ultrasooq marketplace.
 *
 * Idea:
 *   Acts as the single data-access layer between {@link ServiceController}
 *   and the Prisma ORM. Every public method follows the standard envelope
 *   response pattern `{ status/success, message, data?, error? }` and wraps
 *   database calls in try/catch so HTTP responses always return gracefully.
 *
 * Usage:
 *   Injected into {@link ServiceController} via NestJS DI. Not intended
 *   for direct instantiation outside the NestJS container.
 *
 * Data Flow:
 *   Controller -> ServiceService.method() -> PrismaClient -> PostgreSQL
 *   Each method returns a plain envelope object; the controller forwards
 *   it as the HTTP response body.
 *
 * Dependencies:
 *   - {@link PrismaClient}   -- module-scoped ORM instance (instantiated in constructor).
 *   - {@link HelperService}   -- provides `getAdminId()` to resolve team-member
 *                                user IDs to their admin/owner ID.
 *   - {@link CreateServiceDto}, {@link UpdateServiceDto} -- validated DTOs from the controller.
 *   - Prisma models: Service, ServiceTag, ServiceFeature, ServiceImage,
 *     CategoryConnectTo, Product, ProductQuestion, ProductQuestionAnswer.
 *
 * Notes:
 *   - PrismaClient is instantiated per-service (not shared via a global module).
 *     This is a known project-wide pattern.
 *   - The `itxClientDenyList` import from Prisma runtime is present but unused.
 *   - Q&A methods reuse the `ProductQuestion` / `ProductQuestionAnswer` models,
 *     discriminated by `questionType = 'SERVICE'`.
 *   - Error paths return `{ status: false }` while success paths may return
 *     either `{ status: true }` or `{ success: true }` -- the envelope key
 *     is inconsistent across methods.
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';
import { Prisma } from '../generated/prisma/client';

import { HelperService } from 'src/helper/helper.service';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage } from 'src/common/utils/get-error-message';

/**
 * Injectable service handling all service-listing business logic.
 *
 * Manages CRUD operations for marketplace services (BOOKING and MOVING types),
 * related-product lookups, and the Q&A subsystem for service listings.
 */
@Injectable()
export class ServiceService {
  /**
   * Creates a new ServiceService instance.
   *
   * @param {HelperService} helperService - Utility service providing
   *   `getAdminId()` for resolving team-member IDs to the admin/owner ID.
   * @param {PrismaService} prisma - Injected Prisma database service.
   */
  constructor(
    private readonly helperService: HelperService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Creates a new service listing with associated tags, features, and images.
   *
   * Intent:
   *   Persist a new service record and all of its nested relations (tags,
   *   features, images) in a single Prisma create call using `createMany`.
   *
   * Idea:
   *   Destructures the DTO into scalar fields (`rest`) and relation arrays
   *   (`tags`, `features`, `images`), then builds a
   *   `Prisma.ServiceUncheckedCreateInput` that leverages nested `createMany`
   *   to insert everything at once. The `sellerId` is resolved from the
   *   authenticated user via `HelperService.getAdminId()`.
   *
   * Usage:
   *   Called by `ServiceController.createService()`.
   *
   * Data Flow:
   *   dto + userId -> getAdminId(userId) -> Prisma service.create (with nested createMany) -> DB
   *
   * Dependencies:
   *   - {@link HelperService.getAdminId} to map team member -> admin owner.
   *   - Prisma models: Service, ServiceTag, ServiceFeature, ServiceImage.
   *
   * Notes:
   *   - On success, returns `{ success: true }`.
   *   - On error, returns `{ status: false }` (note the envelope key difference).
   *
   * @param {CreateServiceDto} dto    - Validated service-creation payload.
   * @param {number}           userId - Authenticated user ID (may be team member).
   * @returns {Promise<{success: boolean, message: string, data?: any, error?: string}>}
   */
  async createService(dto: CreateServiceDto, userId: number) {
    try {
      let selectedUserId = userId;
      selectedUserId = await this.helperService.getAdminId(selectedUserId);

      const { tags, features, images, ...rest } = dto;
      const data: Prisma.ServiceUncheckedCreateInput = {
        ...rest,
        sellerId: selectedUserId,
        serviceTags: {
          createMany: {
            data: tags,
          },
        },
        serviceFeatures: {
          createMany: {
            data: features,
          },
        },
        images: {
          createMany: {
            data: images,
          },
        },
      };

      const service = await this.prisma.service.create({
        data,
      });

      return {
        success: true,
        message: 'service created successfully',
        data: service,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in create service',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Retrieves a paginated, searchable list of service listings.
   *
   * Intent:
   *   Provide a general-purpose service listing that supports keyword search,
   *   sort direction, and an "own services" toggle for sellers.
   *
   * Idea:
   *   Builds a `Prisma.ServiceWhereInput` that always filters by ACTIVE
   *   status and case-insensitive `serviceName` containment. When
   *   `ownService` is true, the query is further scoped to the resolved
   *   admin/owner ID and also includes INACTIVE services (so sellers can
   *   manage their drafts/disabled listings). Results include the first
   *   image and the category relation.
   *
   * Usage:
   *   Called by `ServiceController.getAllServices()`.
   *
   * Data Flow:
   *   page, limit, ownService, userId, term, sort
   *   -> build whereInput (optionally with getAdminId)
   *   -> Prisma service.findMany + service.count
   *   -> { services, total, limit }
   *
   * Dependencies:
   *   - {@link HelperService.getAdminId} (only when `ownService` is true).
   *   - Prisma models: Service (with images, category).
   *
   * Notes:
   *   - Search term must be > 2 characters to be applied; shorter strings
   *     are treated as empty (matches all).
   *   - Sort defaults to `'desc'` when no sort parameter is provided.
   *   - Both `findMany` and `count` use the same `query` object to ensure
   *     the total count matches the returned page.
   *
   * @param {number}  page       - 1-based page index.
   * @param {number}  limit      - Number of results per page.
   * @param {boolean} ownService - Whether to restrict to the caller's own services.
   * @param {number}  userId     - Authenticated user ID.
   * @param {any}     term       - Optional search term for service name.
   * @param {any}     sort       - Sort direction for createdAt ('asc' | 'desc').
   * @returns {Promise<{success: boolean, message: string, data?: {services: any[], total: number, limit: number}, error?: string}>}
   */
  async getAllServices(
    page: number,
    limit: number,
    ownService: boolean,
    userId: number,
    term: any,
    sort: any,
  ) {
    try {
      const offset = (page - 1) * limit;
      const sortType = sort ? sort : 'desc';
      let searchTerm = term?.length > 2 ? term : '';
      

      let query: Prisma.ServiceWhereInput;
      query = {
        OR: searchTerm
          ? [
              {
                serviceName: {
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
                serviceTags: {
                  some: {
                    tag: {
                      tagName: {
                        contains: searchTerm,
                        mode: 'insensitive',
                      },
                    },
                  },
                },
              },
            ]
          : undefined,
        status: { in: ['ACTIVE'] }
      };
      if (ownService) {
        let selectedUserId = userId;
        selectedUserId = await this.helperService.getAdminId(selectedUserId);

        query.sellerId = selectedUserId
        query.status = { in: ['ACTIVE', 'INACTIVE'] }
      }
      
      const services = await this.prisma.service.findMany({
        where: query,
        orderBy: { createdAt: sortType },
        skip: offset,
        take: limit,
        include: {
          images: {
            take: 1,
          },
          category: true,
        },
        
      });
      const totalServices = await this.prisma.service.count({
        where: query,
      });
      return {
        success: true,
        message: 'services list fetched successfully',
        data: { services, total: totalServices, limit },
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in fetching services',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Retrieves a single service by its primary key, with all relations.
   *
   * Intent:
   *   Serve the service detail page with a fully hydrated service record
   *   including tags, features, images, and category.
   *
   * Idea:
   *   Uses `Prisma.service.findUnique` with `include` for all first-level
   *   relations. No ownership check is performed -- any authenticated user
   *   can read any service.
   *
   * Usage:
   *   Called by `ServiceController.getServiceById()`.
   *
   * Data Flow:
   *   serviceId -> Prisma service.findUnique (+ includes) -> DB -> envelope
   *
   * Dependencies:
   *   - Prisma models: Service, ServiceTag, ServiceFeature, ServiceImage, Category.
   *
   * Notes:
   *   - Returns `null` data (not an error) if the ID does not exist.
   *
   * @param {number} serviceId - Primary key of the service to retrieve.
   * @returns {Promise<{success: boolean, message: string, data?: any, error?: string}>}
   */
  async getServiceById(serviceId: number) {
    try {
      const service = await this.prisma.service.findUnique({
        where: { id: serviceId },
        include: {
          serviceTags: true,
          serviceFeatures: true,
          images: true,
          category: true
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
   * Updates an existing service listing, including reconciliation of nested
   * tags, features, and images within a Prisma transaction.
   *
   * Intent:
   *   Allow the service owner to modify scalar fields and perform a
   *   full reconciliation of tags, features, and images in one atomic
   *   operation -- adding new items and removing items whose IDs are
   *   no longer present in the payload.
   *
   * Idea:
   *   1. Resolve the caller's admin/owner ID via `getAdminId()`.
   *   2. Verify ownership by checking `service.findFirst` with both
   *      `serviceId` and `sellerId`.
   *   3. Build an array of `PrismaPromise` queries:
   *      a. Update scalar fields on the service.
   *      b. For each relation array (tags, features, images):
   *         - Collect IDs of items that already exist (have an `id` field).
   *         - Delete relation rows whose IDs are NOT in that collection.
   *         - Create new relation rows for items without an `id`.
   *   4. Execute all queries in a single `$transaction`.
   *
   * Usage:
   *   Called by `ServiceController.updateService()`.
   *
   * Data Flow:
   *   serviceId + userId + dto
   *   -> getAdminId(userId)
   *   -> ownership check (findFirst)
   *   -> build PrismaPromise[]
   *   -> $transaction(queries)
   *   -> envelope response
   *
   * Dependencies:
   *   - {@link HelperService.getAdminId} for team-member resolution.
   *   - Prisma models: Service, ServiceTag, ServiceFeature, ServiceImage.
   *   - {@link BadRequestException} thrown when the service is not found
   *     or does not belong to the caller.
   *
   * Notes:
   *   - The "delete stale + create new" strategy means existing relation
   *     rows are NOT updated in place; they are deleted and re-created.
   *   - Items with an `id` are KEPT (not deleted), but their field values
   *     are NOT updated -- only the scalar service fields receive updates.
   *   - The entire operation is wrapped in `$transaction` for atomicity.
   *
   * @param {number}           serviceId - Primary key of the service to update.
   * @param {number}           userId    - Authenticated user ID (may be team member).
   * @param {UpdateServiceDto} dto       - Partial update payload.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async updateService(
    serviceId: number,
    userId: number,
    dto: UpdateServiceDto,
  ) {
    try {
      let selectedUserId = userId;
      selectedUserId = await this.helperService.getAdminId(selectedUserId);

      const { tags, features, images, ...rest } = dto;
      const service = await this.prisma.service.findFirst({
        where: {
          id: serviceId,
          sellerId: selectedUserId,
        },
      });
      if (!service) {
        throw new BadRequestException('service not found');
      }
      const queries: Prisma.PrismaPromise<any>[] = [
        this.prisma.service.update({
          where: { id: serviceId },
          data: rest,
        }),
      ];
      if (tags && tags.length) {
        const serviceTagIds: number[] = [];
        const createTags = [];
        tags.forEach((tag) => {
          if (tag.id) {
            serviceTagIds.push(tag.id);
          } else {
            createTags.push({
              tagId: tag.tagId,
              serviceId: serviceId,
            });
          }
        });
        if (serviceTagIds.length) {
          queries.push(
            this.prisma.serviceTag.deleteMany({
              where: { serviceId, id: { notIn: serviceTagIds } },
            }),
          );
        }
        if (createTags.length) {
          queries.push(
            this.prisma.serviceTag.createMany({
              data: createTags,
            }),
          );
        }
      }

      if (features && features.length) {
        const serviceFeatureIds: number[] = [];
        const createFeatures = [];
        features.forEach((feature) => {
          if (feature.id) {
            serviceFeatureIds.push(feature.id);
          } else {
            const { name, serviceCost, serviceCostType } = feature;
            createFeatures.push({
              serviceId,
              name,
              serviceCost,
              serviceCostType,
            });
          }
        });
        if (serviceFeatureIds.length) {
          queries.push(
            this.prisma.serviceFeature.deleteMany({
              where: { serviceId, id: { notIn: serviceFeatureIds } },
            }),
          );
        }
        if (createFeatures.length) {
          queries.push(
            this.prisma.serviceFeature.createMany({
              data: createFeatures,
            }),
          );
        }
      }
      if (images && images.length) {
        const serviceImageIds: number[] = [];
        const createImages = [];

        images.forEach((image) => {
          if (image.id) {
            serviceImageIds.push(image.id);
          } else {
            const { url, fileName, fileType } = image;
            createImages.push({
              serviceId,
              url,
              fileName,
              fileType,
            });
          }
        });
        if (serviceImageIds.length) {
          queries.push(
            this.prisma.serviceImage.deleteMany({
              where: { serviceId, id: { notIn: serviceImageIds } },
            }),
          );
        }
        if (createImages.length) {
          queries.push(
            this.prisma.serviceImage.createMany({
              data: createImages,
            }),
          );
        }
      }

      const response = await this.prisma.$transaction(queries);

      return {
        status: true,
        message: 'service updated successfully',
        data: response,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in updating service by id',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Retrieves paginated MOVING-type services for a specific seller,
   * with optional city-based route filtering (shipping use-case).
   *
   * Intent:
   *   Support the shipping / moving-service selection flow by listing all
   *   ACTIVE MOVING services owned by the specified seller, optionally
   *   narrowed to a specific from-city / to-city route.
   *
   * Idea:
   *   Builds a `whereCondition` that always filters by ACTIVE status,
   *   the given sellerId, and `serviceType = 'MOVING'`. If both `fromCityId`
   *   and `toCityId` query params are present:
   *     - Different cities: filter by `fromCityId` + `toCityId`.
   *     - Same city: filter by `rangeCityId` (local / within-city move).
   *
   * Usage:
   *   Called by `ServiceController.getAllServiceBySeller()`.
   *
   * Data Flow:
   *   sellerId, page, limit, req.query.{fromCityId, toCityId}
   *   -> build whereCondition
   *   -> Prisma service.findMany + service.count
   *   -> envelope { data: services[], totalCount }
   *
   * Dependencies:
   *   - Prisma models: Service (with serviceFeatures, images).
   *
   * Notes:
   *   - `sellerId`, `page`, and `limit` arrive as strings and are parseInt'd internally.
   *   - Returns `{ status: false, data: [] }` when no services match.
   *   - Default page size is 100.
   *
   * @param {any} sellerId - Seller user ID (string, parsed to int).
   * @param {any} page     - Page number (string, parsed to int, default 1).
   * @param {any} limit    - Page size (string, parsed to int, default 100).
   * @param {any} req      - Raw Express request carrying fromCityId/toCityId query params.
   * @returns {Promise<{status: boolean, message: string, data: any[], totalCount?: number, error?: string}>}
   */
  async getAllServiceBySeller(sellerId: any, page: any, limit: any, req: any) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 100;
      const skip = (Page - 1) * pageSize;

      let whereCondition: any = {
        status: 'ACTIVE',
        sellerId: parseInt(sellerId),
        serviceType: 'MOVING',
      };

      if (req.query.fromCityId && req.query.toCityId) {
        if (req.query.fromCityId !== req.query.toCityId) {
          
          (whereCondition.fromCityId = parseInt(req.query.fromCityId)),
            (whereCondition.toCityId = parseInt(req.query.toCityId));
            
        } else if (req.query.fromCityId === req.query.toCityId) {
          whereCondition.rangeCityId = parseInt(req.query.toCityId);
          
        }
      }

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
      });

      const totalCount = await this.prisma.service.count({
        where: whereCondition,
      });

      if (!services || services.length === 0) {
        return {
          status: false,
          message: 'No services found for this seller',
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
        message: 'Error in fetching getAllServiceBySeller',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Retrieves paginated MOVING-type services from all sellers EXCEPT the
   * specified one, with optional city-based route filtering (shipping use-case).
   *
   * Intent:
   *   Show competing / alternative moving services that do NOT belong to the
   *   given seller, supporting comparison shopping in the shipping flow.
   *
   * Idea:
   *   Identical query structure to {@link getAllServiceBySeller}, but the
   *   Prisma `where` uses `sellerId: { not: parseInt(sellerId) }` to
   *   EXCLUDE the given seller instead of matching them.
   *
   * Usage:
   *   Called by `ServiceController.getAllServiceOfOtherSeller()`.
   *
   * Data Flow:
   *   sellerId, page, limit, req.query.{fromCityId, toCityId}
   *   -> build whereCondition (sellerId excluded)
   *   -> Prisma service.findMany + service.count
   *   -> envelope { data: services[], totalCount }
   *
   * Dependencies:
   *   - Prisma models: Service (with serviceFeatures, images).
   *
   * Notes:
   *   - Same city-filtering logic as {@link getAllServiceBySeller}.
   *   - Returns `{ status: false, data: [] }` when no services match.
   *   - Default page size is 100.
   *
   * @param {any} sellerId - Seller user ID to exclude (string, parsed to int).
   * @param {any} page     - Page number (string, parsed to int, default 1).
   * @param {any} limit    - Page size (string, parsed to int, default 100).
   * @param {any} req      - Raw Express request carrying fromCityId/toCityId query params.
   * @returns {Promise<{status: boolean, message: string, data: any[], totalCount?: number, error?: string}>}
   */
  async getAllServiceOfOtherSeller(
    sellerId: any,
    page: any,
    limit: any,
    req: any,
  ) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 100;
      const skip = (Page - 1) * pageSize;

      let whereCondition: any = {
        status: 'ACTIVE',
        sellerId: { not: parseInt(sellerId) },
        serviceType: 'MOVING',
      };

      if (req.query.fromCityId && req.query.toCityId) {
        if (req.query.fromCityId !== req.query.toCityId) {
          (whereCondition.fromCityId = parseInt(req.query.fromCityId)),
            (whereCondition.toCityId = parseInt(req.query.toCityId));
        } else if (req.query.fromCityId === req.query.toCityId) {
          whereCondition.rangeCityId = parseInt(req.query.toCityId);
        }
      }


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
      });

      const totalCount = await this.prisma.service.count({
        where: whereCondition,
      });

      if (!services || services.length === 0) {
        return {
          status: false,
          message: 'No services found for this seller',
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
        message: 'Error in fetching getAllServiceBySeller',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Retrieves products whose categories are connected to the given category
   * via the CategoryConnectTo mapping table (cross-sell use-case).
   *
   * Intent:
   *   Enable product cross-selling on service detail pages by surfacing
   *   ACTIVE products from categories linked to the service's category.
   *
   * Idea:
   *   1. Look up all `CategoryConnectTo` rows where `categoryId` matches
   *      the passed `serviceId` (which is actually treated as a category ID).
   *   2. Collect the distinct `connectTo` target category IDs.
   *   3. Fetch ACTIVE products within those categories, including the first
   *      product image and price details with admin/seller info.
   *
   * Usage:
   *   Called by `ServiceController.getProductService()`.
   *
   * Data Flow:
   *   serviceId (used as categoryId) + userId (unused)
   *   -> categoryConnectTo.findMany
   *   -> extract connected category IDs (Set)
   *   -> product.findMany (ACTIVE, in connected categories)
   *   -> envelope { data: products[], totalCount }
   *
   * Dependencies:
   *   - Prisma models: CategoryConnectTo, Product (with productImages,
   *     product_productPrice -> adminDetail).
   *
   * Notes:
   *   - The `serviceId` parameter is misleadingly named; it is used as
   *     a `categoryId` in the `categoryConnectTo` lookup.
   *   - The `userId` parameter is accepted but never used in the query.
   *   - Hardcoded to page 1 / limit 100 (no pagination support from the caller).
   *   - Uses a Set to deduplicate connected category IDs.
   *
   * @param {number} serviceId - Actually used as a categoryId for the category-connect lookup.
   * @param {number} userId    - Authenticated user ID (currently unused).
   * @returns {Promise<{status: boolean, message: string, data: any[], totalCount?: number, error?: string}>}
   */
  async getProductService(serviceId: number, userId: number) {
    try {
      const page = 1;
      const limit = 100;
      const skip = (page - 1) * limit;
      const categoryConnect = await this.prisma.categoryConnectTo.findMany({
        where: { categoryId: serviceId },
      });
      if (!categoryConnect.length) {
        return {
          status: false,
          message: 'No connecting product found',
          data: categoryConnect,
        };
      }
      const prodCategoryIds: Set<number> = new Set();

      categoryConnect.forEach((item) => prodCategoryIds.add(item.connectTo));
      const whereCond: Prisma.ProductWhereInput = {
        status: 'ACTIVE',
        categoryId: { in: Array.from(prodCategoryIds) },
      };

      const products = await this.prisma.product.findMany({
        where: whereCond,
        include: {
          productImages: {
            take: 1,
          },
          product_productPrice: {
            include: {
              adminDetail: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  profilePicture: true,
                  tradeRole: true,
                },
              },
            },
          },
        },
        skip,
        take: limit,
        orderBy: {
          createdAt: 'desc',
        },
      });

      const totalCount = await this.prisma.product.count({
        where: whereCond,
      });

      return {
        status: true,
        message: 'Fetched products  successfully',
        data: products,
        totalCount: totalCount,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in fetching get product service',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Retrieves BOOKING-type services whose categories are connected to the
   * given product category via CategoryConnectTo.
   *
   * Intent:
   *   Enable service cross-selling on product detail pages by showing
   *   bookable services related to the product's category (e.g., installation
   *   or consultation services for electronics).
   *
   * Idea:
   *   1. Parse `categoryId` and look up all `CategoryConnectTo` rows.
   *   2. Collect the distinct `connectTo` target category IDs.
   *   3. Fetch ACTIVE BOOKING services within those categories, ordered
   *      by createdAt descending.
   *
   * Usage:
   *   Called by `ServiceController.getAllServiceRelatedProductCategoryId()`.
   *
   * Data Flow:
   *   categoryId, page, limit, req
   *   -> categoryConnectTo.findMany
   *   -> extract connected category IDs (Set via spread)
   *   -> service.findMany (ACTIVE + BOOKING + in connected categories)
   *   -> envelope { data: services[], totalCount }
   *
   * Dependencies:
   *   - Prisma models: CategoryConnectTo, Service (with serviceFeatures, images).
   *
   * Notes:
   *   - Returns `{ status: false, data: [] }` if no connections or no matching
   *     services exist.
   *   - The `req` parameter is accepted but not used for additional filtering.
   *   - Default page size is 100.
   *
   * @param {any} categoryId - Product category ID (string, parsed to int).
   * @param {any} page       - Page number (string, parsed to int, default 1).
   * @param {any} limit      - Page size (string, parsed to int, default 100).
   * @param {any} req        - Raw Express request (unused).
   * @returns {Promise<{status: boolean, message: string, data: any[], totalCount?: number, error?: string}>}
   */
  async getAllServiceRelatedProductCategoryId(
    categoryId: any,
    page: any,
    limit: any,
    req: any,
  ) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 100;
      const skip = (Page - 1) * pageSize;
      const categoryID = parseInt(categoryId);

      let categoryConnect = await this.prisma.categoryConnectTo.findMany({
        where: { categoryId: categoryID },
      });

      if (!categoryConnect.length) {
        return {
          status: false,
          message: 'No Service',
          data: [],
        };
      }

      const categoryIds = [
        ...new Set(categoryConnect.map((item) => item.connectTo)),
      ];

      let whereCondition: any = {
        status: 'ACTIVE',
        serviceType: 'BOOKING',
        categoryId: { in: categoryIds },
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
        message: 'Error in fetching getAllServiceRelatedProductCategoryId',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Creates a new question on a service listing (Service Q&A subsystem).
   *
   * Intent:
   *   Allow any authenticated user to post a public question about a service,
   *   initiating a Q&A thread visible to all marketplace participants.
   *
   * Idea:
   *   Extracts `serviceId` and `question` from the loosely typed payload,
   *   reads the caller's user ID from `req.user.id`, and inserts a
   *   `ProductQuestion` record with `questionType = 'SERVICE'`.
   *
   * Usage:
   *   Called by `ServiceController.askQuestion()`.
   *
   * Data Flow:
   *   payload.{serviceId, question} + req.user.id
   *   -> Prisma productQuestion.create
   *   -> envelope { data: newQuestion }
   *
   * Dependencies:
   *   - Prisma model: ProductQuestion (shared between products and services,
   *     discriminated by `questionType`).
   *
   * Notes:
   *   - `serviceId` is parseInt'd before insertion.
   *   - Reuses the `ProductQuestion` table; the `questionType` field
   *     distinguishes service questions from product questions.
   *
   * @param {any} payload - `{ serviceId: number|string, question: string }`.
   * @param {any} req     - Express request; `req.user.id` provides the questioner's user ID.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async askQuestion (payload: any, req: any) {
    try {
      const userId = req?.user?.id;
      const serviceId = payload?.serviceId;

      let askQuestion = await this.prisma.productQuestion.create({
        data: {
          serviceId: parseInt(serviceId),
          question: payload?.question,
          questionByuserId: userId,
          questionType: 'SERVICE'
        },
      });

      return {
        status: true,
        message: 'Created Successfully',
        data: askQuestion,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in askQuestion',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Retrieves a paginated list of questions for a specific service, with
   * optional filtering by questioner type and sort order.
   *
   * Intent:
   *   Display the Q&A thread on a service detail page, letting consumers
   *   filter by vendor questions vs. customer questions and choose a sort order.
   *
   * Idea:
   *   Maps the `userType` parameter to Prisma `tradeRole` values:
   *     - 'VENDOR'   -> ['COMPANY', 'FREELANCER']
   *     - 'CUSTOMER' -> ['BUYER']
   *     - (default)  -> all three roles.
   *   Builds a `whereCondition` filtering by serviceId, ACTIVE status,
   *   `questionType = 'SERVICE'`, and the resolved tradeRole set.
   *   Includes nested user details and answer threads.
   *
   * Usage:
   *   Called by `ServiceController.getAllQuestion()`.
   *
   * Data Flow:
   *   page, limit, serviceId, sortType, userType, req
   *   -> build whereCondition (with tradeRole filter)
   *   -> Prisma productQuestion.findMany (+ includes) + count
   *   -> envelope { data: questions[], totalcount }
   *
   * Dependencies:
   *   - Prisma models: ProductQuestion (with questionByuserIdDetail,
   *     productQuestionAnswerDetail -> answerByUserDetail).
   *
   * Notes:
   *   - `sortType = 'oldest'` gives ascending order; any other value defaults to descending.
   *   - The `req` parameter is accepted but not used in the current implementation.
   *   - Default page size is 10.
   *   - The response uses lowercase `totalcount` (not `totalCount`).
   *
   * @param {any} page      - Page number (string, parsed to int, default 1).
   * @param {any} limit     - Page size (string, parsed to int, default 10).
   * @param {any} serviceId - Service ID (string, parsed to int).
   * @param {any} sortType  - 'oldest' for ASC, otherwise DESC.
   * @param {any} userType  - 'VENDOR', 'CUSTOMER', or omitted for all.
   * @param {any} req       - Raw Express request (unused).
   * @returns {Promise<{status: boolean, message: string, data: any[], totalcount?: number, error?: string}>}
   */
  async getAllQuestion(
    page: any,
    limit: any,
    serviceId: any,
    sortType: any,
    userType: any,
    req: any,
  ) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize; // Calculate the offset
      let serviceID = parseInt(serviceId);
      let sort = {};
      if (sortType == 'oldest') {
        sort = { createdAt: 'asc' };
      } else {
        sort = { createdAt: 'desc' };
      }

      let tradeRole;
      if (userType === 'VENDOR') {
        //  VENDOR
        tradeRole = ['COMPANY', 'FREELANCER'];
      } else if (userType === 'CUSTOMER') {
        // CUSTOMER
        tradeRole = ['BUYER'];
      } else {
        // For All
        tradeRole = ['COMPANY', 'FREELANCER', 'BUYER'];
      }

      let whereCondition: any = {
        serviceId: serviceID,
        status: 'ACTIVE',
        questionByuserIdDetail: {
          tradeRole: { in: tradeRole }, // Move filtering inside the relation
        },
        questionType: 'SERVICE'
      };

      let getAllQuestion = await this.prisma.productQuestion.findMany({
        where: whereCondition,
        include: {
          questionByuserIdDetail: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              profilePicture: true,
              tradeRole: true,
            },
          },
          productQuestionAnswerDetail: {
            include: {
              answerByUserDetail: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  profilePicture: true,
                },
              },
            },
          },
        },
        orderBy: sort,
        skip, // Offset
        take: pageSize, // Limit
      });

      let getAllQuestionCount = await this.prisma.productQuestion.count({
        where: whereCondition,
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
        message: 'error in getAllQuestion',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Creates an answer to an existing service question.
   *
   * Intent:
   *   Allow a seller (or any authenticated user) to respond to a question
   *   posted on a service listing.
   *
   * Idea:
   *   Extracts `serviceId`, `productQuestionId`, and `answer` from the
   *   payload; reads the caller's user ID from `req.user.id`; and inserts
   *   a `ProductQuestionAnswer` record with `questionType = 'SERVICE'`.
   *
   * Usage:
   *   Called by `ServiceController.giveAnswer()`.
   *
   * Data Flow:
   *   payload.{serviceId, productQuestionId, answer} + req.user.id
   *   -> Prisma productQuestionAnswer.create
   *   -> envelope { data: newAnswer }
   *
   * Dependencies:
   *   - Prisma model: ProductQuestionAnswer (shared between products and
   *     services, discriminated by `questionType`).
   *
   * Notes:
   *   - `serviceId` is parseInt'd before insertion.
   *   - Does not validate that the referenced `productQuestionId` exists or
   *     belongs to the given service; Prisma FK constraints handle integrity.
   *   - Reuses the `ProductQuestionAnswer` table, discriminated by
   *     `questionType = 'SERVICE'`.
   *
   * @param {any} payload - `{ serviceId, productQuestionId, answer }`.
   * @param {any} req     - Express request; `req.user.id` provides the answerer's user ID.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: string}>}
   */
  async giveAnswer(payload: any, req: any) {
    try {
      const userId = req?.user?.id;
      const productQuestionId = payload?.productQuestionId;

      let giveAnswer = await this.prisma.productQuestionAnswer.create({
        data: {
          serviceId: parseInt(payload?.serviceId),
          productQuestionId: productQuestionId,
          answer: payload?.answer,
          answerByuserId: userId,
          questionType: 'SERVICE'
        },
      });

      return {
        status: true,
        message: 'Created Successfully',
        data: giveAnswer,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in giveAnswer',
        error: getErrorMessage(error),
      };
    }
  }
}
