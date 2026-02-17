/**
 * @file brand.controller.ts
 *
 * @intent
 *   Exposes the REST API surface for brand management under the `/brand`
 *   route prefix. Each endpoint delegates immediately to `BrandService` --
 *   the controller contains no business logic of its own.
 *
 * @idea
 *   Two creation paths exist:
 *     1. POST /brand/addBrand      -- super-admin creates a global (ADMIN-type) brand.
 *     2. POST /brand/addBrandByUser -- authenticated user creates a personal (USER-type) brand.
 *   Both call the same `BrandService.create()` method; the service inspects
 *   the caller's `userType` to set `brandType` accordingly.
 *
 * @usage
 *   Registered automatically by `BrandModule`. Clients interact via HTTP:
 *     - Public:  GET /brand/findAll, GET /brand/getAllBrand, GET /brand/findOne
 *     - Admin:   POST /brand/addBrand, PATCH /brand/update, DELETE /brand/delete/:brandId
 *     - User:    POST /brand/addBrandByUser
 *
 * @dataflow
 *   HTTP request -> NestJS routing -> Guard (if applied) -> Controller method
 *   -> BrandService -> PrismaClient -> Database -> response JSON
 *
 * @depends
 *   - BrandService           -- all business logic
 *   - AuthGuard              -- validates JWT for regular-user endpoints
 *   - SuperAdminAuthGuard    -- validates JWT + checks super-admin role
 *
 * @notes
 *   The three GET endpoints (findAll, getAllBrand, findOne) are publicly
 *   accessible -- no guard is applied. `findAll` returns an unpaginated list
 *   with optional type filtering, while `getAllBrand` returns a paginated list.
 */

import { Body, Controller, Get, Post, UseGuards, Request, Query, Param, Delete, Patch } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BrandService } from './brand.service';
import { AuthGuard } from 'src/guards/AuthGuard';
import { SuperAdminAuthGuard } from 'src/guards/SuperAdminAuthGuard';

@ApiTags('brands')
@ApiBearerAuth('JWT-auth')
@Controller('brand')
export class BrandController {
  constructor(
    private readonly brandService: BrandService,
  ) {}

  /**
   * @intent
   *   Create a new brand as a super-admin. The created brand will have
   *   `brandType` set to the admin's `userType` (typically "ADMIN").
   *
   * @idea
   *   Only super-admins may create global/official brands that are visible
   *   platform-wide. The `SuperAdminAuthGuard` ensures the caller holds the
   *   correct role before this handler executes.
   *
   * @usage
   *   POST /brand/addBrand
   *   Headers: Authorization: Bearer <admin-jwt>
   *   Body: { brandName: string }
   *
   * @dataflow
   *   req (with admin user) + payload -> BrandService.create() -> new Brand record
   *
   * @depends
   *   - SuperAdminAuthGuard -- rejects non-admin callers
   *   - BrandService.create()
   *
   * @notes
   *   Shares the same service method as `addBrandByUser`; the `brandType`
   *   is derived from the authenticated user's `userType`, not from the
   *   request body.
   */
  @UseGuards(SuperAdminAuthGuard)
  @Post('/addBrand')
  addBrand(@Request() req, @Body() payload: any) {
    return this.brandService.create(payload, req);
  }

  /**
   * @intent
   *   Allow a regular authenticated user to create a personal brand.
   *
   * @idea
   *   Users can register their own brands (e.g. for their shop or products).
   *   The resulting `brandType` will be "USER", derived from the caller's
   *   `userType`.
   *
   * @usage
   *   POST /brand/addBrandByUser
   *   Headers: Authorization: Bearer <user-jwt>
   *   Body: { brandName: string }
   *
   * @dataflow
   *   req (with user) + payload -> BrandService.create() -> new Brand record
   *
   * @depends
   *   - AuthGuard -- ensures a valid authenticated user
   *   - BrandService.create()
   *
   * @notes
   *   Identical service call to `addBrand`; only the guard differs.
   */
  @UseGuards(AuthGuard)
  @Post('/addBrandByUser')
  addBrandByUser(@Request() req, @Body() payload: any) {
    return this.brandService.create(payload, req);
  }

  /**
   * @intent
   *   Update an existing brand's name. Restricted to super-admins.
   *
   * @idea
   *   Provides a controlled way to rename brands without altering ownership
   *   or type. Only the `brandName` field is updated.
   *
   * @usage
   *   PATCH /brand/update
   *   Headers: Authorization: Bearer <admin-jwt>
   *   Body: { brandId: number, brandName: string }
   *
   * @dataflow
   *   payload.brandId -> Prisma brand.update({ brandName }) -> updated Brand record
   *
   * @depends
   *   - SuperAdminAuthGuard
   *   - BrandService.update()
   *
   * @notes
   *   Uses PATCH semantics -- only the supplied fields are modified.
   */
  @UseGuards(SuperAdminAuthGuard)
  @Patch('/update')
  update(@Request() req, @Body() payload: any) {
    return this.brandService.update(payload, req);
  }

  /**
   * @intent
   *   Retrieve a filtered, unpaginated list of active brands.
   *
   * @idea
   *   Supports three filtering modes via the `type` query parameter:
   *     - "OWNBRAND" -- returns only brands created by the specified `addedBy` user.
   *     - "BRAND"    -- returns only admin-created (global) brands.
   *     - (none)     -- returns all active brands.
   *   An optional `term` parameter applies a case-insensitive search on
   *   `brandName` (minimum 3 characters to take effect).
   *
   * @usage
   *   GET /brand/findAll?term=nik&addedBy=42&type=OWNBRAND
   *   (Public -- no authentication required)
   *
   * @dataflow
   *   Query params -> BrandService.findAll(term, addedBy, type)
   *   -> Prisma brand.findMany -> brand list JSON
   *
   * @depends
   *   - BrandService.findAll()
   *
   * @notes
   *   No guard is applied; this is a public endpoint. The search term is
   *   silently ignored when fewer than 3 characters are supplied.
   */
  @Get('/findAll')
  findAll(@Query('term') term: string, @Query('addedBy') addedBy: number, @Query('type') type: string) {
    return this.brandService.findAll(term, addedBy, type);
  }

  /**
   * @intent
   *   Retrieve a paginated list of all active brands with optional search.
   *
   * @idea
   *   Unlike `findAll`, this endpoint is designed for admin dashboards or
   *   listing pages that require pagination. It returns both the page slice
   *   and the total count for building pagination controls.
   *
   * @usage
   *   GET /brand/getAllBrand?page=1&limit=10&term=app
   *   (Public -- no authentication required)
   *
   * @dataflow
   *   Query params -> BrandService.findAllWithPagination(page, limit, term)
   *   -> Prisma brand.findMany (skip/take) + brand.count -> paginated response
   *
   * @depends
   *   - BrandService.findAllWithPagination()
   *
   * @notes
   *   Defaults to page 1 with 10 results per page if parameters are omitted.
   *   Search term requires at least 3 characters to be applied.
   */
  @Get('/getAllBrand')
  getAllBrand(@Query('page') page: number, @Query('limit') limit: number, @Query('term') term: string) {
    return this.brandService.findAllWithPagination(page, limit, term);
  }

  /**
   * @intent
   *   Fetch a single brand by its ID.
   *
   * @idea
   *   Returns the full brand record for detail views, editing forms, or
   *   client-side lookups.
   *
   * @usage
   *   GET /brand/findOne?brandId=7
   *   (Public -- no authentication required)
   *
   * @dataflow
   *   brandId -> BrandService.findOne(brandId, req) -> Prisma brand.findUnique
   *   -> single Brand record or "Not Found" response
   *
   * @depends
   *   - BrandService.findOne()
   *
   * @notes
   *   Returns `{ status: false, message: 'Not Found' }` when the brand does
   *   not exist rather than throwing a 404 exception.
   */
  @Get('/findOne')
  findOne(@Query('brandId') brandId: number, @Request() req) {
    return this.brandService.findOne(brandId, req);
  }

  /**
   * @intent
   *   Soft-delete a brand by setting its status to "DELETE" and recording
   *   a `deletedAt` timestamp.
   *
   * @idea
   *   Brands are never physically removed from the database. Instead, a
   *   status flag marks them as deleted so they are excluded from active
   *   queries while remaining available for audit or recovery.
   *
   * @usage
   *   DELETE /brand/delete/:brandId
   *   Headers: Authorization: Bearer <admin-jwt>
   *
   * @dataflow
   *   brandId param -> BrandService.delete(brandId, req)
   *   -> Prisma brand.update({ status: 'DELETE', deletedAt }) -> confirmation JSON
   *
   * @depends
   *   - SuperAdminAuthGuard
   *   - BrandService.delete()
   *
   * @notes
   *   Only super-admins can delete brands. The `brandId` is taken from the
   *   URL path parameter, not from the request body.
   */
  @UseGuards(SuperAdminAuthGuard)
  @Delete('/delete/:brandId')
  delete(@Param('brandId') brandId: number, @Request() req) {
    return this.brandService.delete(brandId, req);
  }
}
