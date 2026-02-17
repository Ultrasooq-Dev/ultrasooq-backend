/**
 * @file category.controller.ts
 * @intent Exposes the REST API surface for the Category domain.  Every route
 *         is a thin pass-through to CategoryService -- the controller owns no
 *         business logic of its own.
 * @idea  Separating HTTP concerns (routing, guards, parameter extraction) from
 *        persistence logic keeps the controller easy to test and reason about.
 * @usage Registered by CategoryModule; accessible under the `/category` prefix.
 *        Public endpoints: findOne, categoryRecusive, findUnique, getMenu,
 *        findAll, getCategoryLevelOne, updateWhiteBlackList.
 *        Admin-only endpoints (SuperAdminAuthGuard): create, createMultiple,
 *        update, delete, createCategoryConnectTo, deleteCategoryConnectTo.
 * @dataflow HTTP request -> NestJS routing -> optional guard check ->
 *           controller method -> CategoryService method -> JSON response.
 * @depends CategoryService        -- injected; performs all DB work.
 *          AuthGuard              -- (imported but currently not applied to any active route).
 *          SuperAdminAuthGuard    -- protects admin-only mutation endpoints.
 *          CreateCategoryDto      -- imported for typing (currently unused after
 *                                    create() was replaced by create2()).
 * @notes  - The original `create()` using CreateCategoryDto is commented out;
 *           the active `create()` delegates to `categoryService.create2()`,
 *           which also persists an `icon` field.
 *         - Several endpoints (findOne, findUnique) were migrated from POST
 *           to GET; the old POST versions remain as inline comments.
 *         - `updateWhiteBlackList` is intentionally left public (no guard).
 */
import { Body, Controller, Post, UseGuards, Request, Get, Patch, Delete, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CategoryService } from './category.service';
import { AuthGuard } from 'src/guards/AuthGuard';
import { CreateCategoryDto } from './dto/create-category.dto';
import { SuperAdminAuthGuard } from 'src/guards/SuperAdminAuthGuard';

@ApiTags('categories')
@ApiBearerAuth('JWT-auth')
@Controller('category')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  /**
   * @intent Create a single category (with icon support via create2).
   * @idea   Replaced the original DTO-based create() with an untyped payload
   *         so the `icon` field (not present on CreateCategoryDto) can be
   *         forwarded to the service layer.
   * @usage  POST /category/create  (SuperAdmin only)
   * @dataflow payload {name, icon, type, parentId, menuId} ->
   *           categoryService.create2() -> new Category row -> JSON response.
   * @depends SuperAdminAuthGuard, CategoryService.create2
   * @notes  Accepts `any` payload -- no runtime validation via class-validator.
   */
  @UseGuards(SuperAdminAuthGuard)
  @Post('/create')
  create(@Body() payload: any) {
    return this.categoryService.create2(payload);
  }

  /**
   * @intent Bulk-create categories in a single request.
   * @idea   Accepts a list of categories sharing the same type, parentId, and
   *         menuId so an admin can seed an entire level of the tree at once.
   * @usage  POST /category/createMultiple  (SuperAdmin only)
   * @dataflow payload {categoryList[], type, parentId, menuId} ->
   *           categoryService.createMultiple() -> prisma.createMany ->
   *           JSON response.
   * @depends SuperAdminAuthGuard, CategoryService.createMultiple
   * @notes  Uses prisma `skipDuplicates` -- duplicates on unique fields are
   *         silently ignored rather than causing an error.
   */
  @UseGuards(SuperAdminAuthGuard)
  @Post('/createMultiple')
  // create(@Request() req, @Body() createCategoryDto: CreateCategoryDto) {
  createMultiple(@Body() payload: any) {
    return this.categoryService.createMultiple(payload);
  }

  /**
   * @intent Retrieve a single category and its nested children (up to 4 levels
   *         deep), dynamic forms, connectTo relations, fees, and policies.
   * @idea   Gives the frontend everything it needs in one call to render a
   *         category detail view with its immediate sub-tree and associated
   *         configuration.
   * @usage  GET /category/findOne?categoryId=...&menuId=...  (Public)
   * @dataflow categoryId & menuId query params -> parseInt ->
   *           prisma.category.findUnique with nested includes -> JSON response.
   * @depends CategoryService.findOne
   * @notes  menuId is accepted but currently not used in the Prisma where clause
   *         (commented out).  Children are eagerly included to 4 levels.
   */
  @Get('/findOne')
  findOne(@Query('categoryId') categoryId: number, @Query('menuId') menuId: number) {
    return this.categoryService.findOne( categoryId, menuId);
  }

  /**
   * @intent Fetch a category together with its full recursive sub-tree (up to
   *         50 levels deep).
   * @idea   Uses a dynamically-built Prisma include structure so the entire
   *         tree can be returned without multiple round-trips.
   * @usage  GET /category/categoryRecusive?categoryId=...&menuId=...  (Public)
   * @dataflow categoryId & menuId query params -> parseInt ->
   *           prisma.category.findUnique with recursive include -> JSON response.
   * @depends CategoryService.categoryRecusive
   * @notes  The recursive include is built by a private helper up to depth 50.
   */
  @Get('/categoryRecusive')
  categoryRecusive(@Query('categoryId') categoryId: number, @Query('menuId') menuId: number) {
    return this.categoryService.categoryRecusive( categoryId, menuId);
  }

  /**
   * @intent Fetch a single category record by its primary key (no children).
   * @idea   Lightweight lookup when only the category's own fields are needed.
   * @usage  POST /category/findUnique  (Public)
   * @dataflow payload {categoryId} -> prisma.category.findUnique -> JSON response.
   * @depends CategoryService.findUnique
   * @notes  Originally protected by SuperAdminAuthGuard (now commented out).
   */
  // @UseGuards(SuperAdminAuthGuard)
  @Post('/findUnique')
  findUnique(@Request() req, @Body() payload: any) {
    return this.categoryService.findUnique(payload, req);
  }

  /**
   * @intent Update an existing category's mutable fields (name, icon, connectTo,
   *         store/customer/rfq/policy flags).
   * @idea   Merges incoming values with existing data so callers only need to
   *         send the fields they want to change.
   * @usage  PATCH /category/update  (SuperAdmin only)
   * @dataflow payload {categoryId, ...fields} -> service.update() ->
   *           prisma.category.update -> JSON response with updated record.
   * @depends SuperAdminAuthGuard, CategoryService.update
   * @notes  None.
   */
  @UseGuards(SuperAdminAuthGuard)
  @Patch('/update')
  update(@Request() req, @Body() payload: any) {
    return this.categoryService.update(payload, req);
  }

  /**
   * @intent Soft-delete a category and clean up product references that point
   *         to it.
   * @idea   Rather than hard-deleting, the category's status is set to 'DELETE'
   *         and deletedAt is stamped, preserving audit history.  Products whose
   *         categoryLocation contains this category ID have their references
   *         nullified to avoid dangling foreign keys.
   * @usage  DELETE /category/delete/:categoryId  (SuperAdmin only)
   * @dataflow categoryId route param -> find affected products -> null out
   *           references -> soft-delete category -> JSON response.
   * @depends SuperAdminAuthGuard, CategoryService.delete
   * @notes  Product cleanup uses a case-insensitive `contains` match on
   *         categoryLocation (string column).
   */
  @UseGuards(SuperAdminAuthGuard)
  @Delete('/delete/:categoryId')
  delete(@Param('categoryId') categoryId: number, @Request() req) {
    return this.categoryService.delete(categoryId, req);
  }

  /**
   * @intent Retrieve a category (acting as a "menu") along with its direct
   *         children (one level).
   * @idea   Menus are top-level categories; this endpoint surfaces a menu and
   *         its first tier of sub-categories for navigation rendering.
   * @usage  GET /category/getMenu?categoryId=...  (Public)
   * @dataflow categoryId query param -> prisma.category.findUnique with
   *           children include -> JSON response.
   * @depends CategoryService.getMenu
   * @notes  Only ACTIVE children are included.
   */
  @Get('/getMenu')
  getMenu(@Query('categoryId') categoryId: number) {
    return this.categoryService.getMenu( categoryId );
  }

  /**
   * @intent Paginated listing of all active categories that belong to a menu.
   * @idea   Powers admin grids and category browsers with server-side paging.
   * @usage  GET /category/findAll?page=1&limit=10  (Public)
   * @dataflow page & limit query params -> prisma.category.findMany (offset
   *           pagination) + count -> JSON response with data, totalCount,
   *           page, limit.
   * @depends CategoryService.findAll
   * @notes  Only returns categories where menuId is not null and status is ACTIVE.
   */
  @Get('/findAll')
  findAll(@Query('page') page: number, @Query('limit') limit: number) {
    return this.categoryService.findAll(page, limit);
  }

  /**
   * @intent Retrieve all level-one categories (those directly under menuId 1)
   *         together with their immediate children.
   * @idea   Provides the primary navigation entries for the default menu.
   * @usage  GET /category/getCategoryLevelOne  (Public)
   * @dataflow (no params) -> prisma.category.findMany where menuId=1 ->
   *           JSON response.
   * @depends CategoryService.getCategoryLevelOne
   * @notes  Hard-coded to menuId = 1.
   */
  @Get('/getCategoryLevelOne')
  getCategoryLevelOne() {
    return this.categoryService.getCategoryLevelOne();
  }

  /**
   * @intent Batch-update white-list and/or black-list flags on categories.
   * @idea   Allows toggling visibility / restriction of multiple categories in
   *         one request rather than issuing individual updates.
   * @usage  PATCH /category/updateWhiteBlackList  (Public -- no guard applied)
   * @dataflow payload {whiteList: [{id, status}], blackList: [{id, status}]} ->
   *           iterate and prisma.category.update each -> JSON response.
   * @depends CategoryService.updateWhiteBlackList
   * @notes  Endpoint is public; consider adding a guard if this should be
   *         admin-only.
   */
  @Patch('/updateWhiteBlackList')
  updateWhiteBlackList(@Request() req, @Body() payload: any) {
    return this.categoryService.updateWhiteBlackList(payload, req);
  }

  /**
   * @intent Create cross-references between categories (CategoryConnectTo rows).
   * @idea   Supports "related category" or "connected category" relationships
   *         so a category can reference others (e.g., accessories linked to a
   *         main product category).
   * @usage  POST /category/createCategoryConnectTo  (SuperAdmin only)
   * @dataflow payload {categoryId, categoryLocation, connectToList[]} ->
   *           deduplicate against existing rows -> prisma.categoryConnectTo.create
   *           for new ones -> JSON response with created records.
   * @depends SuperAdminAuthGuard, CategoryService.createCategoryConnectTo
   * @notes  Existing connections are silently skipped (idempotent).
   */
  @UseGuards(SuperAdminAuthGuard)
  @Post('/createCategoryConnectTo')
  createCategoryConnectTo(@Request() req, @Body() payload: any) {
    return this.categoryService.createCategoryConnectTo(payload, req);
  }

  /**
   * @intent Hard-delete a CategoryConnectTo row by its primary key.
   * @idea   Unlike category soft-delete, connect-to rows are physically removed
   *         because they are pure join records with no audit requirement.
   * @usage  DELETE /category/deleteCategoryConnectTo/:categoryConnectToId
   *         (SuperAdmin only)
   * @dataflow categoryConnectToId route param -> parseInt ->
   *           prisma.categoryConnectTo.delete -> JSON response.
   * @depends SuperAdminAuthGuard, CategoryService.deleteCategoryConnectTo
   * @notes  A soft-delete approach (commented out in the service) was considered
   *         but not adopted.
   */
  @UseGuards(SuperAdminAuthGuard)
  @Delete('/deleteCategoryConnectTo/:categoryConnectToId')
  deleteCategoryConnectTo(@Param('categoryConnectToId') categoryConnectToId: number, @Request() req) {
    return this.categoryService.deleteCategoryConnectTo(categoryConnectToId, req);
  }

}
