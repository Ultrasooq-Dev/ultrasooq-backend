/**
 * @file admin.controller.ts
 * @description NestJS REST controller that exposes every super-admin HTTP endpoint
 *   for the Ultrasooq marketplace back-office.  Responsibilities include admin
 *   authentication, product CRUD, user management (single and bulk status updates),
 *   dynamic form management, RFQ quote listing, geography lookups (countries / states /
 *   cities), permission CRUD, help-center ticket management, finance / transaction
 *   views, order views, service management, and page-setting management.
 *
 * @module AdminController
 *
 * @dependencies
 *   - {@link AdminService}          -- all business logic is delegated here.
 *   - {@link SuperAdminAuthGuard}   -- JWT-based guard restricting access to admin users.
 *   - {@link UpdateProductTypeDTO}  -- DTO for product-type update validation.
 *
 * @notes
 *   - Every guarded endpoint uses `@UseGuards(SuperAdminAuthGuard)` which verifies
 *     the JWT and attaches `req.user` with the admin's identity.
 *   - Public (unguarded) endpoints: login, dynamicFormDetailsList, getAllCountry,
 *     getAllStates, getAllCities, getAllPermission, getAllPageSetting, getOnePageSetting.
 *   - The controller is mounted at the `/admin` route prefix.
 */
import {
  Body,
  Controller,
  Post,
  UseGuards,
  Request,
  Get,
  Query,
  Patch,
  Param,
  Delete,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { SuperAdminAuthGuard } from 'src/guards/SuperAdminAuthGuard';
import { UpdateProductTypeDTO } from './dto/updateProductType.dto';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

/**
 * @class AdminController
 * @description Thin REST controller that maps HTTP verbs + paths to {@link AdminService}
 *   methods.  Contains no business logic of its own.
 *
 * **Intent:** Provide a clean HTTP interface for admin panel front-end consumption.
 *
 * **Idea:** Keep the controller as a pass-through routing layer so that all
 *   testable business logic resides in the service.
 *
 * **Usage:** Automatically discovered by NestJS via the AdminModule registration.
 *
 * **Data Flow:**
 *   Client --> AdminController (route + guard) --> AdminService --> PrismaClient / DB
 *
 * **Dependencies:** AdminService (injected via constructor DI).
 *
 * **Notes:** Route prefix is `/admin`; each method adds its own sub-path.
 */
@ApiTags('admin')
@ApiBearerAuth('JWT-auth')
@Controller('admin')
export class AdminController {
  /**
   * @constructor
   * @param {AdminService} adminService - Injected service containing all admin business logic.
   */
  constructor(private readonly adminService: AdminService) {}

  /**
   * @method login
   * @description Authenticates an admin user with email and password credentials.
   *
   * **Intent:** Allow admin panel users to obtain a JWT access token.
   *
   * **Idea:** Public endpoint (no guard) -- the token returned is subsequently used
   *   for all guarded endpoints.
   *
   * **Usage:** `POST /admin/login` with `{ email, password }` body.
   *
   * **Data Flow:** Body payload --> AdminService.login() --> AuthService.login() --> JWT.
   *
   * **Dependencies:** AdminService.login, AuthService (JWT generation), bcrypt (password comparison).
   *
   * **Notes:** No guard is applied; this is the authentication entry point.
   *
   * @param {any} payload - Request body containing `email` and `password`.
   * @returns {Promise<{status: boolean, message: string, accessToken?: string, data?: any}>}
   */
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('/login')
  login(@Body() payload: any) {
    return this.adminService.login(payload);
  }

  /**
   * @method findOne
   * @description Retrieves the profile of the currently authenticated admin user.
   *
   * **Intent:** Let the admin panel fetch the logged-in admin's own user record.
   *
   * **Idea:** Uses `req.user.id` (set by SuperAdminAuthGuard) to look up the user.
   *
   * **Usage:** `GET /admin/findOne` with a valid admin JWT in the Authorization header.
   *
   * **Data Flow:** req.user.id --> AdminService.findOne() --> Prisma user lookup.
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.findOne.
   *
   * **Notes:** The `payload` body is accepted but not used inside the service for this endpoint.
   *
   * @param {any} req - Express request with `req.user` set by the auth guard.
   * @param {any} payload - Request body (currently unused).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/findOne')
  findOne(@Request() req, @Body() payload: any) {
    return this.adminService.findOne(payload, req);
  }

  /**
   * @method getPermission
   * @description Fetches the authenticated admin's user profile along with their
   *   assigned admin role and associated permissions.
   *
   * **Intent:** Provide the admin panel front-end with the full permission tree so
   *   it can render UI elements conditionally.
   *
   * **Idea:** A single call returns the user record plus nested adminRoleDetail and
   *   adminRolePermission relations.
   *
   * **Usage:** `GET /admin/get-permission` with a valid admin JWT.
   *
   * **Data Flow:** req.user.id --> AdminService.getPermission() --> Prisma deep select.
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.getPermission.
   *
   * **Notes:** Deeply nested Prisma `select` includes adminRoleDetail > adminRolePermission > adminPermissionDetail.
   *
   * @param {any} req - Express request with `req.user` set by the auth guard.
   * @param {any} payload - Request body (currently unused).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/get-permission')
  getPermission(@Request() req, @Body() payload: any) {
    return this.adminService.getPermission(payload, req);
  }

  /**
   * @method me
   * @description Alias for {@link findOne} -- returns the currently authenticated admin's profile.
   *
   * **Intent:** Provide a conventional `/me` endpoint for admin panel identity checks.
   *
   * **Idea:** Delegates to the same `AdminService.findOne` as `/findOne`.
   *
   * **Usage:** `GET /admin/me` with a valid admin JWT.
   *
   * **Data Flow:** req.user.id --> AdminService.findOne() --> Prisma user lookup.
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.findOne.
   *
   * **Notes:** Functionally identical to `/findOne`; exists for front-end convenience.
   *
   * @param {any} req - Express request with `req.user` set by the auth guard.
   * @param {any} payload - Request body (currently unused).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/me')
  me(@Request() req, @Body() payload: any) {
    return this.adminService.findOne(payload, req);
  }

  /**
   * @method getAllProduct
   * @description Retrieves a paginated, filterable, sortable list of all products
   *   for the admin product management view.
   *
   * **Intent:** Allow admins to browse, search, and filter the full product catalogue.
   *
   * **Idea:** Accepts numerous optional query parameters to build a dynamic Prisma
   *   `where` clause supporting text search, brand filtering, price range, status,
   *   product type, and category ID.
   *
   * **Usage:** `GET /admin/getAllProduct?page=1&limit=10&term=laptop&status=ACTIVE`
   *
   * **Data Flow:** Query params --> AdminService.getAllProduct() --> Prisma findMany + count.
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.getAllProduct.
   *
   * **Notes:**
   *   - `brandIds` is a comma-separated string of numeric IDs.
   *   - `productType` accepts 'ALL', 'P', 'R', or 'F'.
   *   - Includes related category, brand, placeOfOrigin, tags, images, and prices.
   *
   * @param {any} req - Express request (auth context).
   * @param {number} page - Page number (1-based, default 1).
   * @param {number} limit - Page size (default 10).
   * @param {string} sortType - Column name to sort by (default 'createdAt').
   * @param {string} term - Free-text search term (min 3 chars to activate).
   * @param {any} brandIds - Comma-separated brand ID filter.
   * @param {any} priceMin - Minimum offer price filter.
   * @param {any} priceMax - Maximum offer price filter.
   * @param {any} status - Product status filter (e.g. 'ACTIVE').
   * @param {string} sortOrder - 'asc' or 'desc' (default 'desc').
   * @param {string} productType - Product type filter ('ALL', 'P', 'R', 'F').
   * @param {any} categoryId - Category location substring filter.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/getAllProduct')
  getAllProduct(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('sortType') sortType: string,
    @Query('term') term: string,
    @Query('brandIds') brandIds: any,
    @Query('priceMin') priceMin: any,
    @Query('priceMax') priceMax: any,
    @Query('status') status: any,
    @Query('sortOrder') sortOrder: string,
    @Query('productType') productType: string,
    @Query('categoryId') categoryId: any,
  ) {
    return this.adminService.getAllProduct(
      page,
      limit,
      req,
      term,
      sortType,
      sortOrder,
      brandIds,
      priceMin,
      priceMax,
      status,
      productType,
      categoryId,
    );
  }

  /**
   * @method updateProductType
   * @description Updates the `typeProduct` classification of a specific product.
   *
   * **Intent:** Allow admins to reclassify a product as VENDORLOCAL or BRAND.
   *
   * **Idea:** Uses the validated {@link UpdateProductTypeDTO} to guarantee payload correctness.
   *
   * **Usage:** `PATCH /admin/updateProductType` with `{ productId, typeProduct }` body.
   *
   * **Data Flow:** Body --> UpdateProductTypeDTO (validated) --> AdminService.updateProductType() --> Prisma update.
   *
   * **Dependencies:** SuperAdminAuthGuard, UpdateProductTypeDTO, AdminService.updateProductType.
   *
   * **Notes:** Only the `typeProduct` field is modified; all other product fields are untouched.
   *
   * @param {any} req - Express request (auth context).
   * @param {UpdateProductTypeDTO} payload - Validated DTO with productId and optional typeProduct.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/getDropshipableProducts')
  getDropshipableProducts(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('sortType') sortType: string,
    @Query('term') term: string,
    @Query('brandIds') brandIds: any,
    @Query('priceMin') priceMin: any,
    @Query('priceMax') priceMax: any,
    @Query('status') status: any,
    @Query('sortOrder') sortOrder: string,
    @Query('categoryId') categoryId: any,
  ) {
    return this.adminService.getDropshipableProducts(
      page,
      limit,
      req,
      term,
      sortType,
      sortOrder,
      brandIds,
      priceMin,
      priceMax,
      status,
      categoryId,
    );
  }

  @UseGuards(SuperAdminAuthGuard)
  @Patch('/updateProductType')
  updateProductType(@Request() req, @Body() payload: UpdateProductTypeDTO) {
    return this.adminService.updateProductType(payload, req);
  }

  /**
   * @method updateProduct
   * @description Updates one or more fields of an existing product, including its
   *   tags and images (which are replaced in full).
   *
   * **Intent:** Provide a general-purpose product edit for the admin product detail page.
   *
   * **Idea:** The service merges supplied fields with existing values, then optionally
   *   replaces tags and images via delete-and-recreate.
   *
   * **Usage:** `PATCH /admin/updateProduct` with partial product fields in the body.
   *
   * **Data Flow:** Body --> AdminService.updateProduct() --> Prisma update + tag/image re-creation.
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.updateProduct.
   *
   * **Notes:** Tags and images lists, when provided, completely replace existing records.
   *
   * @param {any} req - Express request (auth context with `req.user.id`).
   * @param {any} payload - Product fields to update, plus optional `productTagList` and `productImagesList`.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Patch('/updateProduct')
  updateProduct(@Request() req, @Body() payload: any) {
    return this.adminService.updateProduct(payload, req);
  }

  /**
   * @method getOneProduct
   * @description Retrieves full details of a single product by its ID, including
   *   all related entities (category, brand, origin, tags, images, descriptions,
   *   specifications, prices with geo details, sell regions, and order products).
   *
   * **Intent:** Power the admin product detail / edit view.
   *
   * **Idea:** Deeply includes every relation the admin panel needs in a single query.
   *
   * **Usage:** `GET /admin/getOneProduct?productId=42`
   *
   * **Data Flow:** Query param --> AdminService.getOneProduct() --> Prisma findUnique with includes.
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.getOneProduct.
   *
   * **Notes:** Returns `totalCount: 1` on success for UI compatibility with list endpoints.
   *
   * @param {any} req - Express request (auth context).
   * @param {number} productId - The product's unique identifier.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/getOneProduct')
  getOneProduct(@Request() req, @Query('productId') productId: number) {
    return this.adminService.getOneProduct(productId, req);
  }

  /**
   * @method getOneProductAllQuestion
   * @description Retrieves a paginated list of questions associated with a single product.
   *
   * **Intent:** Let admins review and moderate product Q&A content.
   *
   * **Idea:** Paginates questions for a given product, sortable by newest or oldest.
   *
   * **Usage:** `GET /admin/getOneProductAllQuestion?productId=42&page=1&limit=10&sortType=oldest`
   *
   * **Data Flow:** Query params --> AdminService.getOneProductAllQuestion() --> Prisma findMany + count.
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.getOneProductAllQuestion.
   *
   * **Notes:** `sortType` accepts 'oldest' for ascending; anything else defaults to descending.
   *
   * @param {any} req - Express request (auth context).
   * @param {number} page - Page number (1-based).
   * @param {number} limit - Page size.
   * @param {number} productId - The product whose questions to retrieve.
   * @param {string} sortType - 'oldest' for ASC, otherwise DESC.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalcount?: number}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/getOneProductAllQuestion')
  getOneProductAllQuestion(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('productId') productId: number,
    @Query('sortType') sortType: string,
  ) {
    return this.adminService.getOneProductAllQuestion(
      page,
      limit,
      productId,
      sortType,
    );
  }

  /**
   * @method deleteProductQuestion
   * @description Hard-deletes a product question by its ID.
   *
   * **Intent:** Allow admins to remove inappropriate or spam questions from a product.
   *
   * **Idea:** Performs a hard delete (not soft) via Prisma `delete`.
   *
   * **Usage:** `DELETE /admin/deleteProductQuestion/123`
   *
   * **Data Flow:** Route param --> AdminService.deleteProductQuestion() --> Prisma delete.
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.deleteProductQuestion.
   *
   * **Notes:** `req` and `payload` are accepted but not used by the service.
   *
   * @param {number} productQuestionId - Route parameter: the question's unique ID.
   * @param {any} req - Express request (unused).
   * @param {any} payload - Request body (unused).
   * @returns {Promise<{status: boolean, message: string, data?: any[]}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Delete('/deleteProductQuestion/:productQuestionId')
  deleteProductQuestion(
    @Param('productQuestionId') productQuestionId: number,
    @Request() req,
    @Body() payload: any,
  ) {
    return this.adminService.deleteProductQuestion(productQuestionId);
  }

  /**
   * @method deleteProduct
   * @description Soft-deletes a product by setting its status to 'DELETE' and recording
   *   the deletion timestamp.
   *
   * **Intent:** Allow admins to remove products from active listings without losing data.
   *
   * **Idea:** Uses a soft-delete pattern (status='DELETE', deletedAt=now) instead of
   *   physical row removal.
   *
   * **Usage:** `DELETE /admin/deleteProduct/42`
   *
   * **Data Flow:** Route param --> AdminService.deleteProduct() --> Prisma update (soft delete).
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.deleteProduct.
   *
   * **Notes:** `payload` body is accepted but not used by the service.
   *
   * @param {number} productId - Route parameter: the product's unique ID.
   * @param {any} req - Express request (auth context).
   * @param {any} payload - Request body (unused).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Delete('/deleteProduct/:productId')
  deleteProduct(
    @Param('productId') productId: number,
    @Request() req,
    @Body() payload: any,
  ) {
    return this.adminService.deleteProduct(productId, req);
  }

  /**
   * @method createDynamicForm
   * @description Creates a new dynamic form with its attribute elements and child fields.
   *
   * **Intent:** Allow admins to define custom attribute forms that can later be
   *   assigned to product categories.
   *
   * **Idea:** Persists the form record first, then iterates over `attributeList` to
   *   create parent and child `DynamicFormElement` records linked by `parentId`.
   *
   * **Usage:** `POST /admin/createDynamicForm` with `{ form, formName, attributeList }`.
   *
   * **Data Flow:** Body --> AdminService.createDynamicForm() --> Prisma create (form + elements).
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.createDynamicForm.
   *
   * **Notes:** `attributeList[i].fields` contains child elements for each parent attribute.
   *
   * @param {any} payload - `{ form: JSON, formName: string, attributeList: Array }`.
   * @returns {Promise<{status: boolean, message: string, data?: object}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Post('/createDynamicForm')
  createDynamicForm(@Body() payload: any) {
    return this.adminService.createDynamicForm(payload);
  }

  /**
   * @method dynamicFormDetails
   * @description Retrieves a single dynamic form by ID, including its elements and
   *   assigned category mappings.
   *
   * **Intent:** Power the admin "edit form" view by fetching the full form definition.
   *
   * **Idea:** Uses Prisma `findUnique` with nested `include` for elements and
   *   dynamicFormCategory relations.
   *
   * **Usage:** `POST /admin/findDynamicFormById` with `{ id: <formId> }`.
   *
   * **Data Flow:** Body.id --> AdminService.dynamicFormDetails() --> Prisma findUnique.
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.dynamicFormDetails.
   *
   * **Notes:** Despite being a read operation, uses POST (legacy convention).
   *
   * @param {any} payload - `{ id: number }` identifying the dynamic form.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Post('/findDynamicFormById')
  dynamicFormDetails(@Body() payload: any) {
    return this.adminService.dynamicFormDetails(payload);
  }

  /**
   * @method dynamicFormDetailsList
   * @description Retrieves a paginated list of all active dynamic forms with their
   *   elements and category assignments.
   *
   * **Intent:** Populate the admin "dynamic forms" list view.
   *
   * **Idea:** Filters by `status: 'ACTIVE'`, ordered by newest first.
   *
   * **Usage:** `POST /admin/dynamicFormDetailsList` with `{ page, limit }`.
   *
   * **Data Flow:** Body --> AdminService.dynamicFormDetailsList() --> Prisma findMany.
   *
   * **Dependencies:** AdminService.dynamicFormDetailsList.
   *
   * **Notes:** Guard is commented out -- this endpoint is currently public.
   *
   * @param {any} payload - `{ page: number, limit: number }`.
   * @returns {Promise<{status: boolean, message: string, data?: any[]}>}
   */
  // @UseGuards(SuperAdminAuthGuard)
  @Post('/dynamicFormDetailsList')
  dynamicFormDetailsList(@Body() payload: any) {
    return this.adminService.dynamicFormDetailsList(payload);
  }

  /**
   * @method dynamicFormDetailsDelete
   * @description Soft-deletes a dynamic form by setting its status to 'DELETE'.
   *
   * **Intent:** Allow admins to remove obsolete dynamic forms without losing historical data.
   *
   * **Idea:** Updates `status` to 'DELETE' and sets `deletedAt` timestamp.
   *
   * **Usage:** `POST /admin/dynamicFormDetailsDelete` with `{ id: <formId> }`.
   *
   * **Data Flow:** Body.id --> AdminService.dynamicFormDetailsDelete() --> Prisma update.
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.dynamicFormDetailsDelete.
   *
   * **Notes:** Despite being a delete operation, uses POST (legacy convention).
   *
   * @param {any} payload - `{ id: number }` identifying the dynamic form.
   * @returns {Promise<{status: boolean, message: string, data?: object}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Post('/dynamicFormDetailsDelete')
  dynamicFormDetailsDelete(@Body() payload: any) {
    return this.adminService.dynamicFormDetailsDelete(payload);
  }

  /**
   * @method dynamicFormDetailsEdit
   * @description Updates an existing dynamic form's metadata and completely replaces
   *   its attribute elements.
   *
   * **Intent:** Allow admins to modify a form's name, data, and attribute structure.
   *
   * **Idea:** Updates the form record, deletes all existing elements, then re-creates
   *   parent and child elements from `attributeList`.
   *
   * **Usage:** `POST /admin/dynamicFormDetailsEdit` with `{ id, form, formName, attributeList }`.
   *
   * **Data Flow:** Body --> AdminService.dynamicFormDetailsEdit() --> Prisma update + deleteMany + create loop.
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.dynamicFormDetailsEdit.
   *
   * **Notes:** Elements are fully replaced (delete-all then recreate), not incrementally patched.
   *
   * @param {any} payload - `{ id, form, formName, attributeList }`.
   * @returns {Promise<{status: boolean, message: string, data?: object}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Post('/dynamicFormDetailsEdit')
  dynamicFormDetailsEdit(@Body() payload: any) {
    return this.adminService.dynamicFormDetailsEdit(payload);
  }

  /**
   * @method assignFormToCategory
   * @description Assigns a dynamic form to one or more categories by creating
   *   DynamicFormCategory join records.
   *
   * **Intent:** Link dynamic attribute forms to product categories so sellers see
   *   the correct form fields when listing products.
   *
   * **Idea:** Iterates `categoryIdList`, skipping duplicates that already exist.
   *
   * **Usage:** `POST /admin/assignFormToCategory` with `{ categoryIdList: [{ formId, categoryId, categoryLocation }] }`.
   *
   * **Data Flow:** Body --> AdminService.assignFormToCategory() --> Prisma findFirst (duplicate check) + create.
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.assignFormToCategory.
   *
   * **Notes:** Requires at least one entry in `categoryIdList`; returns early if empty.
   *
   * @param {any} payload - `{ categoryIdList: Array<{ formId, categoryId, categoryLocation? }> }`.
   * @returns {Promise<{status: boolean, message: string, data?: any[]}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Post('/assignFormToCategory')
  assignFormToCategory(@Body() payload: any) {
    return this.adminService.assignFormToCategory(payload);
  }

  /**
   * @method updateAssignFormToCategory
   * @description Updates an existing form-to-category assignment record.
   *
   * **Intent:** Allow admins to change which form or category a DynamicFormCategory
   *   record points to.
   *
   * **Idea:** Updates the DynamicFormCategory row identified by `payload.id`.
   *
   * **Usage:** `PATCH /admin/updateAssignFormToCategory` with `{ id, formId, categoryId, categoryLocation }`.
   *
   * **Data Flow:** Body --> AdminService.updateAssignFormToCategory() --> Prisma update.
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.updateAssignFormToCategory.
   *
   * **Notes:** Only updates a single assignment record at a time.
   *
   * @param {any} payload - `{ id, formId, categoryId, categoryLocation }`.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Patch('/updateAssignFormToCategory')
  updateAssignFormToCategory(@Body() payload: any) {
    return this.adminService.updateAssignFormToCategory(payload);
  }

  /**
   * @method editAssignFormToCategory
   * @description Replaces all category assignments for a given form by deleting
   *   existing mappings and re-creating them from the provided list.
   *
   * **Intent:** Provide a bulk-reassign capability for form-to-category mappings.
   *
   * **Idea:** Deletes all DynamicFormCategory rows for `formId`, then re-creates
   *   only non-duplicate entries from `categoryIdList`.
   *
   * **Usage:** `POST /admin/editAssignFormToCategory` with `{ formId, categoryIdList }`.
   *
   * **Data Flow:** Body --> AdminService.editAssignFormToCategory() --> Prisma deleteMany + create loop.
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.editAssignFormToCategory.
   *
   * **Notes:** Currently marked as "still not in use" in the service implementation.
   *
   * @param {any} payload - `{ formId: number, categoryIdList: Array<{ formId, categoryId }> }`.
   * @returns {Promise<{status: boolean, message: string, data?: any[]}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Post('/editAssignFormToCategory')
  editAssignFormToCategory(@Body() payload: any) {
    return this.adminService.editAssignFormToCategory(payload);
  }

  /**
   * @method getAllUser
   * @description Retrieves a paginated list of master accounts with their associated
   *   sub-accounts (users), optionally filtered by trade role.
   *
   * **Intent:** Power the admin user management list view, showing the master-account
   *   hierarchy.
   *
   * **Idea:** Queries the `masterAccount` table with nested `users` relation, applying
   *   optional `tradeRole` filtering on both levels.
   *
   * **Usage:** `GET /admin/getAllUser?page=1&limit=10&tradeRole=BUYER`
   *
   * **Data Flow:** Query params --> AdminService.getAllUser() --> Prisma findMany + count (masterAccount).
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.getAllUser.
   *
   * **Notes:** Returns master accounts (not raw users); each master includes its sub-accounts array.
   *
   * @param {any} req - Express request (auth context).
   * @param {number} page - Page number (1-based).
   * @param {number} limit - Page size (default 10).
   * @param {string} tradeRole - Optional trade role filter (e.g. 'BUYER', 'SELLER').
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/getAllUser')
  getAllUser(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('tradeRole') tradeRole: string,
  ) {
    return this.adminService.getAllUser(page, limit, tradeRole);
  }

  /**
   * @method getSubAccounts
   * @description Retrieves all sub-accounts (child user records) linked to a specific
   *   master account.
   *
   * **Intent:** Let admins drill into a master account to see every associated sub-account.
   *
   * **Idea:** Queries the `user` table filtering by `masterAccountId`, excluding the
   *   master user itself and soft-deleted records.
   *
   * **Usage:** `GET /admin/getSubAccounts/42`
   *
   * **Data Flow:** Route param --> ParseIntPipe --> AdminService.getSubAccounts() --> Prisma findMany (user).
   *
   * **Dependencies:** SuperAdminAuthGuard, ParseIntPipe, AdminService.getSubAccounts.
   *
   * **Notes:** Excludes the user whose `id` equals the masterAccountId to avoid
   *   returning the master as its own sub-account.
   *
   * @param {number} masterAccountId - Route parameter: the master account's unique ID.
   * @returns {Promise<{status: boolean, message: string, data?: any[]}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/getSubAccounts/:masterAccountId')
  getSubAccounts(
    @Param('masterAccountId', ParseIntPipe) masterAccountId: number,
  ) {
    return this.adminService.getSubAccounts(masterAccountId);
  }

  /**
   * @method updateMasterAccountStatus
   * @description Updates the status of a master account and cascades the change to
   *   all of its associated user accounts.
   *
   * **Intent:** Allow admins to activate, deactivate, or change the status of an
   *   entire master account and all its sub-accounts in one action.
   *
   * **Idea:** Finds the master account, then uses `updateMany` on users sharing
   *   the same `masterAccountId`.
   *
   * **Usage:** `PATCH /admin/updateMasterAccountStatus` with `{ masterAccountId, status }` in the body.
   *
   * **Data Flow:** req.body --> AdminService.updateMasterAccountStatus() --> Prisma findUnique + updateMany.
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.updateMasterAccountStatus.
   *
   * **Notes:** Status is read from `req.body.status` (not from a DTO).
   *
   * @param {any} req - Express request with `req.body.masterAccountId` and `req.body.status`.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Patch('/updateMasterAccountStatus')
  updateMasterAccountStatus(@Request() req) {
    return this.adminService.updateMasterAccountStatus(req);
  }

  /**
   * @method updateOneUser
   * @description Updates a single user's status, status note, and/or trade role,
   *   with status-transition validation and audit logging.
   *
   * **Intent:** Allow admins to approve, reject, or deactivate individual users
   *   while enforcing valid state transitions.
   *
   * **Idea:** The service validates the transition against a whitelist before applying
   *   the update and logs the change for audit purposes.
   *
   * **Usage:** `PATCH /admin/updateOneUser` with `{ userId, status, statusNote?, tradeRole? }` in the body.
   *
   * **Data Flow:** req.body --> AdminService.updateOneUser() --> validateStatusTransition() -->
   *   Prisma update --> logStatusChange().
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.updateOneUser, validateStatusTransition, logStatusChange.
   *
   * **Notes:** Fields are read from `req.body` (not a validated DTO at controller level).
   *
   * @param {any} req - Express request with user update fields in `req.body`.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Patch('/update-profile')
  updateProfile(@Request() req) {
    return this.adminService.updateProfile(req);
  }

  @UseGuards(SuperAdminAuthGuard)
  @Patch('/updateOneUser')
  updateOneUser(@Request() req) {
    return this.adminService.updateOneUser(req);
  }

  /**
   * @method getAvailableStatusTransitions
   * @description Returns the set of valid status transitions for a given user based
   *   on their current status.
   *
   * **Intent:** Let the admin UI dynamically render only the allowed status options
   *   in a dropdown, preventing invalid transitions.
   *
   * **Idea:** Looks up the user's current status, then consults a transition whitelist
   *   to determine valid next states.
   *
   * **Usage:** `GET /admin/user/42/status-transitions`
   *
   * **Data Flow:** Route param --> ParseIntPipe --> AdminService.getAvailableStatusTransitions() -->
   *   Prisma findUnique (status only) --> transition map lookup.
   *
   * **Dependencies:** SuperAdminAuthGuard, ParseIntPipe, AdminService.getAvailableStatusTransitions.
   *
   * **Notes:** Also returns `requiresNote` boolean per transition for UI hint.
   *
   * @param {number} userId - Route parameter: the user's unique ID.
   * @returns {Promise<{status: boolean, message: string, data?: { currentStatus, availableTransitions, transitions }}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/user/:userId/status-transitions')
  getAvailableStatusTransitions(@Param('userId', ParseIntPipe) userId: number) {
    return this.adminService.getAvailableStatusTransitions(userId);
  }

  /**
   * @method bulkUpdateUserStatus
   * @description Updates the status of multiple users in a single request, validating
   *   each transition individually and collecting per-user results.
   *
   * **Intent:** Allow admins to batch-approve, batch-reject, or batch-deactivate
   *   multiple users at once.
   *
   * **Idea:** Iterates over `userIds`, validates each transition, applies the update,
   *   and logs audit entries. Returns a summary with successful and failed counts.
   *
   * **Usage:** `PATCH /admin/bulk-update-user-status` with `{ userIds: number[], status, statusNote? }`.
   *
   * **Data Flow:** req.body --> AdminService.bulkUpdateUserStatus() --> per-user: findUnique -->
   *   validateStatusTransition --> update --> logStatusChange.
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.bulkUpdateUserStatus.
   *
   * **Notes:** Partial success is possible -- some users may fail while others succeed.
   *
   * @param {any} req - Express request with `{ userIds, status, statusNote }` in body.
   * @returns {Promise<{status: boolean, message: string, data?: { successful, failed, summary }}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Patch('/bulk-update-user-status')
  bulkUpdateUserStatus(@Request() req) {
    return this.adminService.bulkUpdateUserStatus(req);
  }

  // ---- RFQ SECTION BEGINS ----
  /**
   * @method getAllRfqQuotes
   * @description Retrieves a paginated list of all active RFQ (Request For Quotation)
   *   quotes with their addresses and product details.
   *
   * **Intent:** Let admins monitor and review RFQ activity on the marketplace.
   *
   * **Idea:** Filters by `status: 'ACTIVE'`, includes nested address and product
   *   relations (with product images), and supports sort direction.
   *
   * **Usage:** `GET /admin/getAllRfqQuotes?page=1&limit=10&sort=desc`
   *
   * **Data Flow:** Query params --> AdminService.getAllRfqQuotes() --> Prisma findMany + count.
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.getAllRfqQuotes.
   *
   * **Notes:** Deep includes: rfqQuoteAddress, rfqQuotesProducts > rfqProductDetails > productImages.
   *
   * @param {any} req - Express request (auth context).
   * @param {number} page - Page number (1-based).
   * @param {number} limit - Page size.
   * @param {string} sort - Sort direction ('asc' or 'desc', default 'desc').
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/getAllRfqQuotes')
  getAllRfqQuotes(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('sort') sort: string,
  ) {
    return this.adminService.getAllRfqQuotes(page, limit, req, sort);
  }
  // ---- RFQ SECTION ENDS ----

  /**
   * @method getAllCountry
   * @description Retrieves a paginated list of all active countries.
   *
   * **Intent:** Populate geography dropdown selectors in the admin panel.
   *
   * **Idea:** Returns countries with status 'ACTIVE', ordered by creation date descending.
   *
   * **Usage:** `GET /admin/getAllCountry?page=1&limit=100`
   *
   * **Data Flow:** Query params --> AdminService.getAllCountry() --> Prisma findMany + count (countries).
   *
   * **Dependencies:** AdminService.getAllCountry.
   *
   * **Notes:** This endpoint is public (no guard). Default limit is 100000 in the service.
   *
   * @param {any} req - Express request.
   * @param {number} page - Page number (1-based).
   * @param {number} limit - Page size.
   * @param {string} sort - Sort direction (currently ignored; service hardcodes 'desc').
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number}>}
   */
  @Get('/getAllCountry')
  getAllCountry(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('sort') sort: string,
  ) {
    return this.adminService.getAllCountry(page, limit, req, sort);
  }

  /**
   * @method getAllStates
   * @description Retrieves a paginated list of active states for a given country.
   *
   * **Intent:** Populate state/province dropdown selectors in the admin panel.
   *
   * **Idea:** Filters by `status: 'ACTIVE'` and `countryId`, defaulting to India (101)
   *   when no country is specified.
   *
   * **Usage:** `GET /admin/getAllStates?countryId=101&page=1&limit=500`
   *
   * **Data Flow:** Query params --> AdminService.getAllStates() --> Prisma findMany + count (states).
   *
   * **Dependencies:** AdminService.getAllStates.
   *
   * **Notes:** This endpoint is public (no guard). Default limit is 5000; default countryId is 101.
   *
   * @param {any} req - Express request.
   * @param {number} page - Page number.
   * @param {number} limit - Page size.
   * @param {string} sort - Sort direction (ignored; service hardcodes 'desc').
   * @param {string} countryId - Country ID to filter states by.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number}>}
   */
  @Get('/getAllStates')
  getAllStates(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('sort') sort: string,
    @Query('countryId') countryId: string,
  ) {
    return this.adminService.getAllStates(page, limit, req, sort, countryId);
  }

  /**
   * @method getAllCities
   * @description Retrieves a paginated list of active cities, optionally filtered
   *   by state ID.
   *
   * **Intent:** Populate city dropdown selectors in the admin panel.
   *
   * **Idea:** When `stateId` is -1, returns all cities regardless of state;
   *   otherwise filters by the specified state.
   *
   * **Usage:** `GET /admin/getAllCities?stateId=10&page=1&limit=500`
   *
   * **Data Flow:** Query params --> AdminService.getAllCities() --> Prisma findMany + count (cities).
   *
   * **Dependencies:** AdminService.getAllCities.
   *
   * **Notes:** This endpoint is public (no guard). Default limit is 5000; default stateId is 101.
   *
   * @param {any} req - Express request.
   * @param {number} page - Page number.
   * @param {number} limit - Page size.
   * @param {string} sort - Sort direction (ignored; service hardcodes 'desc').
   * @param {string} stateId - State ID to filter cities by (-1 for all cities).
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number}>}
   */
  @Get('/getAllCities')
  getAllCities(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('sort') sort: string,
    @Query('stateId') stateId: string,
  ) {
    return this.adminService.getAllCities(page, limit, req, sort, stateId);
  }

  /**
   *  Permission CRUD
   */

  /**
   * @method createPermission
   * @description Creates a new permission record if one with the same name does not
   *   already exist.
   *
   * **Intent:** Allow admins to define new permissions that can be attached to roles.
   *
   * **Idea:** Checks for an existing permission by name; if found, returns it with
   *   "Already exists"; otherwise creates a new record tagged with `addedBy`.
   *
   * **Usage:** `POST /admin/create-permission` with `{ name: "manage_users" }`.
   *
   * **Data Flow:** Body --> AdminService.createPermission() --> Prisma findFirst (dedup) + create.
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.createPermission.
   *
   * **Notes:** Returns `status: true` even if the permission already exists (idempotent).
   *
   * @param {any} payload - `{ name: string }`.
   * @param {any} req - Express request (for `req.user.id` as `addedBy`).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Post('/create-permission')
  createPermission(@Body() payload: any, @Request() req) {
    return this.adminService.createPermission(payload, req);
  }

  /**
   * @method getAllPermission
   * @description Retrieves a paginated list of permissions created by the requesting
   *   admin, with optional name-based search.
   *
   * **Intent:** Populate the permissions management table in the admin panel.
   *
   * **Idea:** Filters by `addedBy: userId` and optional case-insensitive name search.
   *
   * **Usage:** `GET /admin/permission/get-all?page=1&limit=10&searchTerm=manage`
   *
   * **Data Flow:** Query params --> AdminService.getAllPermission() --> Prisma findMany + count.
   *
   * **Dependencies:** AdminService.getAllPermission.
   *
   * **Notes:** This endpoint is public (no guard applied).
   *
   * @param {any} req - Express request (for `req.user.id`).
   * @param {number} page - Page number (1-based).
   * @param {number} limit - Page size (default 10).
   * @param {string} searchTerm - Optional case-insensitive name filter.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number}>}
   */
  @Get('/permission/get-all')
  getAllPermission(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('searchTerm') searchTerm: string,
  ) {
    return this.adminService.getAllPermission(page, limit, searchTerm, req);
  }

  /**
   * Help Center
   */

  /**
   * @method getAllHelpCenter
   * @description Retrieves a paginated list of help-center tickets (user queries),
   *   with optional search filtering on the query text.
   *
   * **Intent:** Let admins view and triage incoming user support requests.
   *
   * **Idea:** Returns help-center records with user details, searchable by query
   *   content (case-insensitive).
   *
   * **Usage:** `GET /admin/help-center/get-all?page=1&limit=10&searchTerm=refund`
   *
   * **Data Flow:** Query params --> AdminService.getAllHelpCenter() --> Prisma findMany + count.
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.getAllHelpCenter.
   *
   * **Notes:** Includes the `userDetail` relation for each ticket.
   *
   * @param {any} req - Express request (auth context).
   * @param {number} page - Page number (1-based).
   * @param {number} limit - Page size (default 10).
   * @param {string} searchTerm - Optional text filter on `query` field.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/help-center/get-all')
  getAllHelpCenter(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('searchTerm') searchTerm: string,
  ) {
    return this.adminService.getAllHelpCenter(page, limit, searchTerm, req);
  }

  /**
   * @method replyHelpCenterById
   * @description Saves an admin reply to a help-center ticket and sends a notification
   *   email to the user who submitted the query.
   *
   * **Intent:** Enable admins to respond to user support requests from the back-office.
   *
   * **Idea:** Updates the `response` field on the help-center record and invokes
   *   `NotificationService.replyHelpCenter()` to send an email.
   *
   * **Usage:** `PATCH /admin/help-center/reply` with `{ helpCenterId, response }`.
   *
   * **Data Flow:** Body --> AdminService.replyHelpCenterById() --> Prisma update -->
   *   NotificationService.replyHelpCenter() (email).
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.replyHelpCenterById, NotificationService.
   *
   * **Notes:** The email is dispatched fire-and-forget (no await on the notification call).
   *
   * @param {any} payload - `{ helpCenterId: number, response: string }`.
   * @param {any} req - Express request (auth context).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Patch('/help-center/reply')
  replyHelpCenterById(@Body() payload: any, @Request() req) {
    return this.adminService.replyHelpCenterById(payload, req);
  }

  /**
   * Finance Management (Admin side transaction list)
   */

  /**
   * @method getAllTransaction
   * @description Retrieves a paginated, filterable list of Paymob payment transactions.
   *
   * **Intent:** Let admins monitor payment activity across the marketplace.
   *
   * **Idea:** Supports filtering by `transactionStatus` and a free-text search term
   *   (orderId or paymobTransactionId). Returns pagination metadata.
   *
   * **Usage:** `GET /admin/transaction/get-all?page=1&limit=10&transactionStatus=SUCCESS&searchTerm=ORD123`
   *
   * **Data Flow:** req.query --> AdminService.getAllTransaction() --> Prisma findMany + count (transactionPaymob).
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.getAllTransaction.
   *
   * **Notes:** Pagination and filter params are read from `req.query` inside the service.
   *
   * @param {any} req - Express request with query params `page`, `limit`, `transactionStatus`, `searchTerm`.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number, currentPage?: number, totalPages?: number}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/transaction/get-all')
  getAllTransaction(@Request() req) {
    return this.adminService.getAllTransaction(req);
  }

  /**
   * @method getOneTransaction
   * @description Retrieves a single Paymob transaction by its ID.
   *
   * **Intent:** Let admins inspect the details of an individual payment transaction.
   *
   * **Idea:** Accepts `transactionId` from either `req.params.id` or `req.query.transactionId`.
   *
   * **Usage:** `GET /admin/transaction/get-one?transactionId=99`
   *
   * **Data Flow:** req.query/params --> AdminService.getOneTransaction() --> Prisma findUnique.
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.getOneTransaction.
   *
   * **Notes:** Returns a 200 with `status: false` if the transaction is not found.
   *
   * @param {any} req - Express request with `transactionId` in query or params.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/transaction/get-one')
  getOneTransaction(@Request() req) {
    return this.adminService.getOneTransaction(req);
  }

  /**
   * Order Details (Admin Side)
   */

  /**
   * @method getAllOrder
   * @description Retrieves a paginated, searchable list of all orders (excluding
   *   soft-deleted ones), with optional status filtering.
   *
   * **Intent:** Let admins view and manage order activity across the marketplace.
   *
   * **Idea:** Supports search by `orderNo` and `paymobOrderId`, status filter, and
   *   cursor-based pagination.
   *
   * **Usage:** `GET /admin/order/get-all?page=1&limit=10&status=PENDING&searchTerm=ORD001`
   *
   * **Data Flow:** req.query --> AdminService.getAllOrder() --> Prisma findMany + count (order).
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.getAllOrder.
   *
   * **Notes:** Pagination metadata includes `currentPage` and `totalPages`.
   *
   * @param {any} req - Express request with query params.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number, currentPage?: number, totalPages?: number}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/order/get-all')
  getAllOrder(@Request() req) {
    return this.adminService.getAllOrder(req);
  }

  /**
   * @method getOneOrder
   * @description Retrieves full details of a single order by ID, including order
   *   products (with product, price, service, and shipping details) and addresses.
   *
   * **Intent:** Power the admin order detail view.
   *
   * **Idea:** Deep-includes order products and address relations in a single query.
   *
   * **Usage:** `GET /admin/order/get-one?orderId=42`
   *
   * **Data Flow:** req.query/params --> AdminService.getOneOrder() --> Prisma findUnique with includes.
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.getOneOrder.
   *
   * **Notes:** Returns `status: false` if the order is not found.
   *
   * @param {any} req - Express request with `orderId` in query or params.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/order/get-one')
  getOneOrder(@Request() req) {
    return this.adminService.getOneOrder(req);
  }

  /**
   * @method getAllOrderProduct
   * @description Retrieves a paginated list of order products for a specific order.
   *
   * **Intent:** Let admins inspect the line items within a particular order.
   *
   * **Idea:** Filters order products by `orderId` and paginates the results.
   *
   * **Usage:** `GET /admin/order/order-product/get-all?orderId=42&page=1&limit=10`
   *
   * **Data Flow:** req.query --> AdminService.getAllOrderProduct() --> Prisma findMany + count (orderProducts).
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.getAllOrderProduct.
   *
   * **Notes:** `searchTerm` parameter is accepted but filtering by it is currently commented out.
   *
   * @param {any} req - Express request with `orderId`, `page`, `limit` in query.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number, currentPage?: number, totalPages?: number}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/order/order-product/get-all')
  getAllOrderProduct(@Request() req) {
    return this.adminService.getAllOrderProduct(req);
  }

  /**
   * @method getOneOrderProduct
   * @description Retrieves a single order product by its ID.
   *
   * **Intent:** Let admins inspect individual line-item details.
   *
   * **Idea:** Accepts `orderProductId` from the query string and returns the matching record.
   *
   * **Usage:** `GET /admin/order/order-product/get-one?orderProductId=5`
   *
   * **Data Flow:** req.query --> AdminService.getOneOrderProduct() --> Prisma findUnique.
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.getOneOrderProduct.
   *
   * **Notes:** Returns `status: false` with "Invalid order product ID" if the value is NaN.
   *
   * @param {any} req - Express request with `orderProductId` in query.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/order/order-product/get-one')
  getOneOrderProduct(@Request() req) {
    return this.adminService.getOneOrderProduct(req);
  }

  /**
   *  Services
   */

  /**
   * @method getAllService
   * @description Retrieves a paginated list of marketplace services (ACTIVE or INACTIVE),
   *   with optional name-based search.
   *
   * **Intent:** Let admins browse and moderate seller-provided services.
   *
   * **Idea:** Filters by status in ['ACTIVE', 'INACTIVE'] and `serviceName` containing
   *   the search term. Includes service features and the first image.
   *
   * **Usage:** `GET /admin/service/get-all?page=1&limit=100&searchTerm=logistics`
   *
   * **Data Flow:** Query params (with defaults via DefaultValuePipe) --> AdminService.getAllService() -->
   *   Prisma findMany + count (service).
   *
   * **Dependencies:** SuperAdminAuthGuard, DefaultValuePipe, ParseIntPipe, AdminService.getAllService.
   *
   * **Notes:** `page` defaults to 1, `limit` defaults to 100 via pipes.
   *
   * @param {any} req - Express request (for `req.query.searchTerm`).
   * @param {number} page - Page number (default 1).
   * @param {number} limit - Page size (default 100).
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/service/get-all')
  getAllService(
    @Request() req,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    return this.adminService.getAllService(page, limit, req);
  }

  /**
   * @method getServiceById
   * @description Retrieves full details of a single service by its ID, including
   *   tags, features, images, seller profile, and geography relations.
   *
   * **Intent:** Power the admin service detail / review view.
   *
   * **Idea:** Deep-includes all service relations (tags, features, images, seller,
   *   country, state, toCity, fromCity, rangeCity) in one query.
   *
   * **Usage:** `GET /admin/service/get-one?serviceId=42`
   *
   * **Data Flow:** Query param --> ParseIntPipe --> AdminService.getServiceById() --> Prisma findUnique.
   *
   * **Dependencies:** SuperAdminAuthGuard, ParseIntPipe, AdminService.getServiceById.
   *
   *
   * @param {number} serviceId - The service's unique identifier.
   * @returns {Promise<{success: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/service/get-one')
  getServiceById(@Query('serviceId', ParseIntPipe) serviceId: number) {

    return this.adminService.getServiceById(serviceId);
  }

  /**
   * @method updateService
   * @description Updates the status of an existing service.
   *
   * **Intent:** Allow admins to activate or deactivate a seller's service listing.
   *
   * **Idea:** Looks up the service by ID, then updates its `status` field from `req.body.status`.
   *
   * **Usage:** `PATCH /admin/service/update?serviceId=42` with `{ status: "INACTIVE" }` body.
   *
   * **Data Flow:** Query param + req.body --> AdminService.updateService() --> Prisma findUnique + update.
   *
   * **Dependencies:** SuperAdminAuthGuard, ParseIntPipe, AdminService.updateService.
   *
   * **Notes:** Only the `status` field is updatable through this endpoint.
   *
   * @param {number} serviceId - The service's unique identifier (query param).
   * @param {any} req - Express request with `{ status }` in the body.
   * @returns {Promise<{success: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Patch('/service/update')
  updateService(
    @Query('serviceId', ParseIntPipe) serviceId: number,
    @Request() req,
  ) {
    return this.adminService.updateService(serviceId, req);
  }

  /**
   * @method updatePageSetting
   * @description Creates or updates a page setting identified by its slug (upsert pattern).
   *
   * **Intent:** Allow admins to configure CMS-like page settings (e.g. homepage banners,
   *   footer content) without code deploys.
   *
   * **Idea:** If a page setting with the given slug exists, it is updated; otherwise a new
   *   record is created.
   *
   * **Usage:** `PATCH /admin/page-settings/update` with `{ slug, setting, status }`.
   *
   * **Data Flow:** Body --> AdminService.updatePageSetting() --> Prisma findUnique + update/create.
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminService.updatePageSetting.
   *
   * **Notes:** The `slug` field acts as a unique key for lookup.
   *
   * @param {any} payload - `{ slug: string, setting: JSON, status: string }`.
   * @param {any} req - Express request (auth context).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Patch('/page-settings/update')
  updatePageSetting(@Body() payload: any, @Request() req) {
    return this.adminService.updatePageSetting(payload, req);
  }

  /**
   * @method getAllPageSetting
   * @description Retrieves a paginated list of active page settings, optionally
   *   filtered by slug.
   *
   * **Intent:** Let the admin panel (or front-end) list all configured page settings.
   *
   * **Idea:** Filters by `status: 'ACTIVE'` and optional slug from `req.query.slug`.
   *
   * **Usage:** `GET /admin/page-settings/get-all?page=1&limit=100&slug=homepage`
   *
   * **Data Flow:** Query params --> AdminService.getAllPageSetting() --> Prisma findMany + count.
   *
   * **Dependencies:** AdminService.getAllPageSetting.
   *
   * **Notes:** This endpoint is public (no guard). Default limit is 1000 in the service.
   *
   * @param {any} req - Express request (for optional `req.query.slug`).
   * @param {number} page - Page number.
   * @param {number} limit - Page size.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number}>}
   */
  @Get('/page-settings/get-all')
  getAllPageSetting(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
  ) {
    return this.adminService.getAllPageSetting(page, limit, req);
  }

  /**
   * @method getOnePageSetting
   * @description Retrieves a single page setting by its unique slug.
   *
   * **Intent:** Let the front-end fetch configuration for a specific page.
   *
   * **Idea:** Uses Prisma `findUnique` on the slug field.
   *
   * **Usage:** `GET /admin/page-settings/get-one?slug=homepage`
   *
   * **Data Flow:** Query param --> AdminService.getOnePageSetting() --> Prisma findUnique.
   *
   * **Dependencies:** AdminService.getOnePageSetting.
   *
   * **Notes:** This endpoint is public (no guard).
   *
   * @param {string} slug - The page setting's unique slug identifier.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @Get('/page-settings/get-one')
  getOnePageSetting(@Query('slug') slug: string) {
    return this.adminService.getOnePageSetting(slug);
  }

  /**
   * Dashboard Statistics
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/dashboard/statistics')
  getDashboardStatistics(@Request() req) {
    return this.adminService.getDashboardStatistics(req);
  }

  /**
   * Admin Notifications
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/notifications')
  getAdminNotifications(
    @Request() req,
    @Query('page') page: string | number,
    @Query('limit') limit: string | number,
    @Query('read') read: string,
  ) {
    return this.adminService.getAdminNotifications(
      req,
      typeof page === 'string' ? parseInt(page, 10) || 1 : page || 1,
      typeof limit === 'string' ? parseInt(limit, 10) || 20 : limit || 20,
      read,
    );
  }

  @UseGuards(SuperAdminAuthGuard)
  @Get('/notifications/unread-count')
  getUnreadNotificationCount(@Request() req) {
    return this.adminService.getUnreadNotificationCount(req);
  }

  @UseGuards(SuperAdminAuthGuard)
  @Patch('/notifications/:id/mark-read')
  markNotificationAsRead(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
  ) {
    return this.adminService.markNotificationAsRead(id, req);
  }

  @UseGuards(SuperAdminAuthGuard)
  @Patch('/notifications/mark-all-read')
  markAllNotificationsAsRead(@Request() req) {
    return this.adminService.markAllNotificationsAsRead(req);
  }

  @UseGuards(SuperAdminAuthGuard)
  @Delete('/notifications/:id')
  deleteNotification(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
  ) {
    return this.adminService.deleteNotification(id, req);
  }

  @UseGuards(SuperAdminAuthGuard)
  @Get('/sidebar-counts')
  getSidebarCounts(@Request() req) {
    return this.adminService.getSidebarCounts(req);
  }

  @UseGuards(SuperAdminAuthGuard)
  @Post('/mark-user-list-viewed')
  markUserListViewViewed(@Request() req) {
    return this.adminService.markUserListViewViewed(req);
  }

  @UseGuards(SuperAdminAuthGuard)
  @Post('/mark-products-list-viewed')
  markProductsListViewViewed(@Request() req) {
    return this.adminService.markProductsListViewViewed(req);
  }
}
