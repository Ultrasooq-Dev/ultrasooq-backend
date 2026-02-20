/**
 * @file brand.service.ts
 *
 * @intent
 *   Encapsulates all business logic for brand CRUD operations. Every
 *   controller method delegates to a corresponding method in this service.
 *
 * @idea
 *   Brands are lightweight entities (brandName, brandType, addedBy, status).
 *   The service handles two creation flows (admin and user), filtering with
 *   optional type/search, paginated listing, single-record lookup, and
 *   soft deletion. All database access goes through a module-scoped
 *   PrismaClient instance.
 *
 * @usage
 *   Injected into `BrandController` via NestJS DI.
 *   ```
 *   constructor(private readonly brandService: BrandService) {}
 *   ```
 *
 * @dataflow
 *   Controller -> BrandService method -> PrismaClient -> PostgreSQL
 *   Each method returns a uniform envelope: { status, message, data?, error? }
 *
 * @depends
 *   - PrismaClient (module-scoped singleton) -- all database queries
 *   - Prisma models: `brand`, `user`
 *
 * @notes
 *   - The PrismaClient is instantiated at module scope rather than injected,
 *     so it is shared across all instances of BrandService.
 *   - Every method catches its own errors and returns a JSON error envelope
 *     instead of throwing HTTP exceptions.
 *   - Search terms shorter than 3 characters are silently ignored (treated
 *     as an empty string) to avoid overly broad queries.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage } from 'src/common/utils/get-error-message';

/**
 * Module-scoped Prisma client instance.
 * Shared by all methods in BrandService; lives for the lifetime of the process.
 */

@Injectable()
export class BrandService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @intent
   *   Create a new brand record. Used by both the admin and user creation
   *   routes (POST /brand/addBrand and POST /brand/addBrandByUser).
   *
   * @idea
   *   The caller's `userType` (looked up from the database) determines the
   *   `brandType` of the new brand -- "ADMIN" for super-admins, "USER" for
   *   regular users. This means the same method serves two distinct
   *   authorization levels without branching on role.
   *
   * @usage
   *   ```
   *   await this.brandService.create({ brandName: 'Nike' }, req);
   *   ```
   *
   * @dataflow
   *   1. Extract userId from `req.user.id` or `req.user.userId`.
   *   2. Fetch the user's `userType` via Prisma `user.findUnique`.
   *   3. Insert a new `brand` record with brandName, brandType, and addedBy.
   *   4. Return the created record in a success envelope.
   *
   * @depends
   *   - Prisma `user` model  -- to resolve the caller's userType
   *   - Prisma `brand` model -- to insert the new record
   *
   * @notes
   *   - Handles two user-object shapes (`id` vs `userId`) coming from
   *     different auth guard implementations.
   *   - `brandType` is derived server-side, not accepted from the client.
   */
  async create(payload: any, req: any) {
    // This function is used by route: /addBrandByUser(USER), /addBrand(ADMIN)
    try {
      // Handle both user object structures (from User model or custom object)
      const userId = req.user.id || req.user.userId;
      let userDetail = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, userType: true },
      });
      let addBrand = await this.prisma.brand.create({
        data: {
          brandName: payload.brandName,
          brandType: userDetail.userType,
          addedBy: userId,
        },
      });

      return {
        status: true,
        message: 'Created Successfully',
        data: addBrand,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in create',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @intent
   *   Update the name of an existing brand, identified by `brandId`.
   *
   * @idea
   *   Only the `brandName` field is mutable through this method. Other
   *   fields (brandType, addedBy, status) remain unchanged, preserving
   *   ownership and visibility semantics.
   *
   * @usage
   *   ```
   *   await this.brandService.update({ brandId: 5, brandName: 'Adidas' }, req);
   *   ```
   *
   * @dataflow
   *   payload.brandId -> Prisma brand.update({ brandName }) -> updated record
   *
   * @depends
   *   - Prisma `brand` model
   *
   * @notes
   *   - Restricted to super-admins at the controller level.
   *   - The `req` parameter is accepted for consistency but not currently
   *     used within this method.
   */
  async update(payload: any, req: any) {
    try {
      let addBrand = await this.prisma.brand.update({
        where: { id: payload.brandId },
        data: {
          brandName: payload.brandName,
        },
      });

      return {
        status: true,
        message: 'Created Successfully',
        data: addBrand,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in create',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @intent
   *   Retrieve a filtered, unpaginated list of active brands.
   *
   * @idea
   *   Three filtering strategies based on the `type` parameter:
   *     - "OWNBRAND" -- only brands where `addedBy` matches the given user.
   *     - "BRAND"    -- only admin-created brands (`brandType` = "ADMIN").
   *     - (falsy)    -- all active brands regardless of type or creator.
   *   An optional search `term` performs a case-insensitive substring match
   *   on `brandName`, but only when the term is at least 3 characters long.
   *
   * @usage
   *   ```
   *   await this.brandService.findAll('nik', 42, 'OWNBRAND');
   *   await this.brandService.findAll('', undefined, 'BRAND');
   *   await this.brandService.findAll(undefined, undefined, undefined);
   *   ```
   *
   * @dataflow
   *   1. Sanitize search term (enforce 3-char minimum).
   *   2. Parse `addedBy` to an integer.
   *   3. Branch on `type` to build the appropriate Prisma `where` clause.
   *   4. Execute `brand.findMany` with `status: 'ACTIVE'` and the search filter.
   *   5. Return the brand list plus a `totalCount` in the envelope.
   *
   * @depends
   *   - Prisma `brand` model
   *
   * @notes
   *   - All queries exclude soft-deleted brands (only `status: 'ACTIVE'`).
   *   - The `addedBy` filter is only applied for the "OWNBRAND" type.
   *   - Returns an empty array with `status: false` when no brands match.
   */
  async findAll(term: any, addedBy: any, type: any) {
    try {
      let searchTerm = term?.length > 2 ? term : '';
      const addedBY = parseInt(addedBy);

      let brandList;
      if (type == 'OWNBRAND') {
        brandList = await this.prisma.brand.findMany({
          where: {
            status: 'ACTIVE',
            brandName: {
              contains: searchTerm,
              mode: 'insensitive',
            },
            addedBy: addedBY,
          },
        });
      } else if (type == 'BRAND') {
        brandList = await this.prisma.brand.findMany({
          where: {
            status: 'ACTIVE',
            brandName: {
              contains: searchTerm,
              mode: 'insensitive',
            },
            brandType: 'ADMIN',
            // addedBy: {
            //   notIn: [addedBY] // Exclude brands with addedBy matching addedBY
            // }
          },
        });
      } else {
        brandList = await this.prisma.brand.findMany({
          where: {
            status: 'ACTIVE',
            brandName: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
        });
      }

      if (!brandList) {
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
        data: brandList,
        totalCount: brandList.length,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in brandList',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @intent
   *   Retrieve a paginated list of all active brands, with optional search.
   *
   * @idea
   *   Designed for admin dashboards or listing pages that need both a page
   *   slice and a total count for pagination controls. Unlike `findAll`,
   *   this method does not support type-based filtering -- it always returns
   *   all active brands.
   *
   * @usage
   *   ```
   *   await this.brandService.findAllWithPagination(1, 10, 'apple');
   *   ```
   *
   * @dataflow
   *   1. Parse `page` (default 1) and `limit` (default 10) to integers.
   *   2. Compute `skip` offset: (page - 1) * limit.
   *   3. Sanitize search term (3-char minimum).
   *   4. Execute `brand.findMany` with skip/take for the page slice.
   *   5. Execute `brand.count` with the same `where` clause for total count.
   *   6. Return the page data and totalCount in the envelope.
   *
   * @depends
   *   - Prisma `brand` model (findMany + count)
   *
   * @notes
   *   - Two separate Prisma calls (findMany + count) are issued sequentially;
   *     they share identical `where` clauses to ensure consistency.
   *   - Defaults: page = 1, pageSize = 10.
   *   - Search term under 3 characters is treated as empty (matches all).
   */
  async findAllWithPagination(page: any, limit: any, term: any) {
    try {
      const Page = parseInt(page) || 1;
      const pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize; // Calculate the offset
      let searchTerm = term?.length > 2 ? term : '';

      let brandList = await this.prisma.brand.findMany({
        where: {
          status: 'ACTIVE',
          brandName: {
            contains: searchTerm,
            mode: 'insensitive',
          },
        },
        skip, // Offset
        take: pageSize, // Limit
      });

      let brandListCount = await this.prisma.brand.count({
        where: {
          status: 'ACTIVE',
          brandName: {
            contains: searchTerm,
            mode: 'insensitive',
          },
        },
      });

      if (!brandList) {
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
        data: brandList,
        totalCount: brandListCount,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in brandList',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @intent
   *   Fetch a single brand by its primary key.
   *
   * @idea
   *   Provides a detail-level lookup for a specific brand -- used by
   *   detail pages, edit forms, or client-side brand resolution.
   *
   * @usage
   *   ```
   *   await this.brandService.findOne(7, req);
   *   ```
   *
   * @dataflow
   *   brandId (string) -> parseInt -> Prisma brand.findUnique({ id })
   *   -> full Brand record or "Not Found" envelope
   *
   * @depends
   *   - Prisma `brand` model
   *
   * @notes
   *   - The `brandId` arrives as a string from the query parameter and is
   *     parsed to an integer before querying.
   *   - Returns `{ status: false }` rather than throwing a 404 when the
   *     brand does not exist.
   *   - The `req` parameter is accepted for consistency but is not used.
   */
  async findOne(brandId: any, req: any) {
    try {
      const brandID = parseInt(brandId);
      let brandDetail = await this.prisma.brand.findUnique({
        where: { id: brandID },
      });
      if (!brandDetail) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
        };
      }
      return {
        status: true,
        message: 'Fetch Successfully',
        data: brandDetail,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in findOne',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @intent
   *   Soft-delete a brand by marking it as "DELETE" and recording the
   *   deletion timestamp.
   *
   * @idea
   *   Physical deletion is avoided so that historical references (e.g.
   *   products linked to this brand) remain intact and the record can be
   *   audited or restored if needed. Active queries throughout the app
   *   filter on `status: 'ACTIVE'`, so a "DELETE" brand becomes invisible
   *   to normal operations.
   *
   * @usage
   *   ```
   *   await this.brandService.delete(12, req);
   *   ```
   *
   * @dataflow
   *   brandId (string) -> parseInt -> Prisma brand.update({
   *     status: 'DELETE', deletedAt: new Date()
   *   }) -> confirmation envelope
   *
   * @depends
   *   - Prisma `brand` model
   *
   * @notes
   *   - Restricted to super-admins at the controller level.
   *   - Sets `deletedAt` to the current server timestamp for audit trails.
   *   - Returns an empty `data` array on success, not the deleted record.
   *   - The `req` parameter is accepted for consistency but is not used.
   */
  async delete(brandId: any, req: any) {
    try {
      const brandID = parseInt(brandId);
      let deletedBrand = await this.prisma.brand.update({
        where: { id: brandID },
        data: {
          status: 'DELETE',
          deletedAt: new Date(),
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
        message: 'error in delete',
        error: getErrorMessage(error),
      };
    }
  }

  async findOrCreateByName(brandName: string, userId: number, userType: string = 'ADMIN'): Promise<{ id: number; brandName: string }> {
    try {
      if (!brandName || brandName.trim() === '') {
        throw new Error('Brand name is required');
      }

      const normalizedBrandName = brandName.trim();

      // First, try to find existing brand (case-insensitive, only ACTIVE brands)
      const existingBrand = await this.prisma.brand.findFirst({
        where: {
          brandName: {
            equals: normalizedBrandName,
            mode: 'insensitive',
          },
          status: 'ACTIVE',
        },
      });

      if (existingBrand) {
        return {
          id: existingBrand.id,
          brandName: existingBrand.brandName,
        };
      }

      // Brand doesn't exist, create it
      const newBrand = await this.prisma.brand.create({
        data: {
          brandName: normalizedBrandName,
          brandType: userType,
          addedBy: userId,
          status: 'ACTIVE',
        },
      });

      return {
        id: newBrand.id,
        brandName: newBrand.brandName,
      };
    } catch (error) {
      throw new Error(`Failed to find or create brand: ${getErrorMessage(error)}`);
    }
  }
}
