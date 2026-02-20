/**
 * @file category.service.ts
 * @intent Encapsulates all business logic and Prisma persistence operations for
 *         the Category domain -- CRUD, tree traversal, white/black listing,
 *         and cross-category connections.
 * @idea  Keeping database queries and domain rules inside a single injectable
 *        service makes the controller a thin HTTP adapter and allows the same
 *        logic to be reused from other services or background jobs.
 * @usage Injected into CategoryController; every public method is invoked by
 *        exactly one controller endpoint.
 * @dataflow Controller (validated/parsed params) -> Service method -> PrismaClient
 *           query -> standardised JSON response {status, message, data?, error?}.
 * @depends PrismaClient (instantiated at module scope -- NOT via NestJS DI).
 *          CreateCategoryDto (type import for the legacy create() signature).
 * @notes  - Every public method returns a uniform envelope:
 *             { status: boolean, message: string, data?: any, error?: string }
 *         - Error handling: all methods catch exceptions and return status:false
 *           rather than throwing, so the controller never needs try/catch.
 *         - Soft-delete pattern: category rows set status='DELETE' + deletedAt;
 *           queries filter on status='ACTIVE'.
 *         - PrismaClient is a module-level singleton; this avoids connection
 *           pool churn but means the service is tightly coupled to Prisma and
 *           harder to mock in tests.
 */
import { Injectable, Logger } from '@nestjs/common';
import { CreateCategoryDto } from './dto/create-category.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService, CACHE_KEYS, CACHE_TTL } from '../cache/cache.service';
import { getErrorMessage } from 'src/common/utils/get-error-message';


@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * @intent Create a single category (legacy -- no icon support).
   * @idea   Original creation path that maps DTO fields directly to a Prisma
   *         create call.  Superseded by create2() which also handles the `icon`
   *         field.
   * @usage  Not currently called by any active controller route (commented out).
   * @dataflow CreateCategoryDto -> this.prisma.category.create -> success/error envelope.
   * @depends this.prisma.category
   * @notes  Kept for backward compatibility; may be removed once create2() is
   *         confirmed stable.
   */
  async create(createCategoryDto: CreateCategoryDto) {
    try {
      let addCategory = await this.prisma.category.create({
        data: {
          name: createCategoryDto?.name,
          type: createCategoryDto?.type,
          parentId: createCategoryDto?.parentId,
          menuId: createCategoryDto?.menuId
        }
      });

      // Invalidate all category caches
      await this.cacheService.invalidateAllCategories();

      return {
        status: true,
        message: 'Created Successfully',
        data: []
      }

    } catch (error) {

      return {
        status: false,
        message: 'error in createCategory',
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * @intent Create a single category WITH icon support.
   * @idea   Evolved version of create() that accepts an untyped payload so the
   *         `icon` field (not present on CreateCategoryDto) can be persisted.
   * @usage  Called by CategoryController.create() -- the active POST /category/create route.
   * @dataflow payload {name, icon, type, parentId, menuId} ->
   *           this.prisma.category.create -> success/error envelope.
   * @depends this.prisma.category
   * @notes  Accepts `any` -- no compile-time or runtime validation.  Consider
   *         extending CreateCategoryDto with an `icon` field to restore type safety.
   */
  async create2(payload: any) {
    try {
      let addCategory = await this.prisma.category.create({
        data: {
          name: payload?.name,
          icon: payload?.icon,
          type: payload?.type,
          parentId: payload?.parentId,
          menuId: payload?.menuId
        }
      });

      // Invalidate all category caches
      await this.cacheService.invalidateAllCategories();

      return {
        status: true,
        message: 'Created Successfully',
        data: []
      }

    } catch (error) {

      return {
        status: false,
        message: 'error in createCategory',
        error: getErrorMessage(error)
      }
    }
  }


  /**
   * @intent Bulk-create multiple categories in a single database round-trip.
   * @idea   Uses this.prisma.createMany instead of looping single creates (the
   *         commented-out predecessor above) for better performance and atomicity.
   * @usage  Called by CategoryController.createMultiple()
   *         -- POST /category/createMultiple.
   * @dataflow payload {categoryList: [{name, icon, id?}], type, parentId, menuId}
   *           -> map to create-ready objects (strip `id`) ->
   *           this.prisma.category.createMany with skipDuplicates -> success/error envelope.
   * @depends this.prisma.category
   * @notes  - `id` is destructured out of each list item to prevent the client
   *           from supplying a primary key.
   *         - `skipDuplicates: true` silently ignores rows that conflict on
   *           unique constraints rather than failing the entire batch.
   *         - Returns an empty data array; the caller does not receive the
   *           created rows (createMany limitation in Prisma).
   */
  async createMultiple(payload: any) {
    try {
      if (payload?.categoryList && payload?.categoryList.length > 0) {
        const formattedData = payload.categoryList.map(({ id, ...item }: any) => ({
          name: item.name,
          icon: item.icon,
          type: payload?.type,
          parentId: payload?.parentId,
          menuId: payload?.menuId
        }));

        await this.prisma.category.createMany({
          data: formattedData,
          skipDuplicates: true // optional: prevents failure on duplicate unique fields
        });

        // Invalidate all category caches
        await this.cacheService.invalidateAllCategories();

        return {
          status: true,
          message: 'Created Successfully',
          data: []
        };
      } else {
        return {
          status: false,
          message: 'CategoryList is Empty',
          data: []
        };
      }
    } catch (error) {

      return {
        status: false,
        message: 'Error in createCategory',
        error: getErrorMessage(error)
      };
    }
  }


  /**
   * @intent Retrieve a single category with its children (4 levels deep),
   *         associated dynamic forms, connectTo relations, fee schedules,
   *         and policy configuration.
   * @idea   Eagerly loads everything the frontend needs to render the category
   *         detail + management view in one database call.
   * @usage  Called by CategoryController.findOne()
   *         -- GET /category/findOne?categoryId=...&menuId=...
   * @dataflow categoryId (string) & menuId (string) -> parseInt ->
   *           this.prisma.category.findUnique with deeply nested includes ->
   *           success/error/not-found envelope.
   * @depends this.prisma.category, related models: DynamicFormCategory, CategoryConnectTo,
   *          CategoryStoreFees, CategoryCustomerFees, CategoryRfqFees, CategoryPolicy.
   * @notes  - menuId is parsed but NOT used in the where clause (commented out).
   *         - Children are statically nested to 4 levels; for deeper trees use
   *           categoryRecusive() instead.
   *         - Only ACTIVE children are included at each level.
   */
  // Get all Child
  async findOne(categoryId: any, menuId: any) {
    try {
      const categoryID = parseInt(categoryId);
      const menuID = parseInt(menuId);
      let categoryDetails = await this.prisma.category.findUnique({
        where: {
          id: categoryID,
          // menuId: menuID,
          status: 'ACTIVE'
        },
        include: {
          category_dynamicFormCategory: {
            include: {
              formIdDetail: {
                include: {
                  elements: true
                }
              }
            }
          },
          children: {
            where: {
              status: 'ACTIVE'
            },
            include: {
              children: {
                where: {
                  status: 'ACTIVE'
                },
                include: {
                  children: {
                    where: {
                      status: 'ACTIVE'
                    },
                    include: {
                      children: {
                        where: {
                          status: 'ACTIVE'
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          category_categoryIdDetail: {
            include: {
              connectToDetail: true
            }
          },
          categoryStore_fees: true,
          categoryCustomer_fees: true,
          categoryRfq_fees: true,
          category_policy: true
        },
        // orderBy: {
        //   createdAt: 'desc' as const// Sort by createdAt in descending order
        // }
      })
      if (!categoryDetails) {
        return {
          status: false,
          message: 'Not Found',
          data: []
        }
      }
      return {
        status: true,
        message: 'Fetch Successfully',
        data: categoryDetails
      }
    } catch (error) {
      return {
        status: false,
        message: 'error in findAll',
        error: getErrorMessage(error)
      }
    }
  }


  /**
   * @intent Compute the maximum depth of the sub-tree rooted at `categoryId`.
   * @idea   Recursively walks every branch of the tree and returns the deepest
   *         level found.  Originally intended to dynamically size the Prisma
   *         include depth in categoryRecusive(), but currently unused
   *         (call is commented out there).
   * @usage  Not actively called; available for future dynamic depth detection.
   * @dataflow categoryId + current depth -> fetch children ->
   *           recurse on each child -> return max depth across all branches.
   * @depends this.prisma.category
   * @notes  Performance: issues one query per node in the sub-tree (N+1).
   *         For very wide/deep trees this could be expensive.
   */
  async findCategoryDepth(categoryId: number, depth: number = 0): Promise<number> {
    const category = await this.prisma.category.findUnique({
      where: {
        id: categoryId
      },
      include: {
        children: true
      }
    });

    if (!category || !category.children || category.children.length === 0) {
      return depth;
    }

    let maxDepth = depth;
    for (const child of category.children) {
      const childDepth = await this.findCategoryDepth(child.id, depth + 1);
      if (childDepth > maxDepth) {
        maxDepth = childDepth;
      }
    }

    return maxDepth;
  }

  /**
   * @intent Fetch a category with its full recursive sub-tree (up to 50 levels).
   * @idea   Builds a deeply-nested Prisma `include` via the private recursive()
   *         helper so the entire category hierarchy is returned in a single query
   *         -- no client-side pagination through levels.
   * @usage  Called by CategoryController.categoryRecusive()
   *         -- GET /category/categoryRecusive?categoryId=...&menuId=...
   * @dataflow categoryId & menuId (strings) -> parseInt -> this.prisma.category.findUnique
   *           with recursive include (depth 50) -> success/error/not-found envelope.
   * @depends this.prisma.category, this.recursive()
   * @notes  - menuId is parsed but NOT used in the where clause.
   *         - Depth is hard-coded to 50; the dynamic depth detection via
   *           findCategoryDepth() is commented out.
   *         - Only ACTIVE children appear at every level.
   */
  async categoryRecusive(categoryId: any, menuId: any) {
    try {
      const categoryID = parseInt(categoryId);
      const menuID = parseInt(menuId);

      // Use the category tree cache key for recursive lookups
      const cacheKey = `${CACHE_KEYS.CATEGORY_TREE}:${categoryID}`;
      const cached = await this.cacheService.get(cacheKey);
      if (cached) return cached;

      let categoryDetails = await this.prisma.category.findUnique({
        where: {
          id: categoryID,
          status: 'ACTIVE'
        },
        include: {
          children: {
            where: { status: 'ACTIVE'},
            ...this.recursive(50)
          }
        }
      })
      if (!categoryDetails) {
        return {
          status: false,
          message: 'Not Found',
          data: []
        }
      }

      const result = {
        status: true,
        message: 'Fetch Successfully',
        data: categoryDetails
      };

      await this.cacheService.set(cacheKey, result, CACHE_TTL.CATEGORY_TREE);
      return result;
    } catch (error) {

      return {
        status: false,
        message: 'error in findAll',
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * @intent Build a nested Prisma `include` object for children, recursed to
   *         the specified level.
   * @idea   Generates the nested { include: { children: { where, include: ... }}}
   *         structure that Prisma needs for eager-loading a tree of arbitrary depth.
   * @usage  Called internally by categoryRecusive().
   * @dataflow level (int, counts down to 0) -> returns nested include object.
   * @depends None (pure helper).
   * @notes  - Base case (level === 0) still includes one level of children with
   *           the ACTIVE filter, so total depth is level + 1.
   *         - This produces a very large Prisma query object at level 50;
   *           performance depends on actual tree depth in the DB.
   */
  private recursive(level: number) {
    if (level === 0) {
      return {
        include: {
          children: {
            where: { status: 'ACTIVE' }
          }
        }
      }
    }
    return {
      include: {
        children: {
          where: { status: 'ACTIVE' },
          ...this.recursive(level - 1)
        }
      }
    };
  }

  /**
   * @intent Fetch a single category by primary key without children or relations.
   * @idea   Lightweight lookup for scenarios where only the category's own fields
   *         are needed (e.g., edit form pre-population).
   * @usage  Called by CategoryController.findUnique()
   *         -- POST /category/findUnique.
   * @dataflow payload {categoryId} + req -> this.prisma.category.findUnique ->
   *           success/error/not-found envelope.
   * @depends this.prisma.category
   * @notes  - `req` is accepted but not used.
   *         - menuId filtering is commented out.
   */
  async findUnique(payload: any, req: any) {
    try {
      const categoryId = payload.categoryId;
      let categoryDetails = await this.prisma.category.findUnique({
        where: {
          id: categoryId,
        }
      })
      if (!categoryDetails) {
        return {
          status: false,
          message: 'Not Found',
          data: []
        }
      }
      return {
        status: true,
        message: 'Fetch Successfully',
        data: categoryDetails
      }
    } catch (error) {
      return {
        status: false,
        message: 'error in findUnique',
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * @intent Update mutable fields on an existing category, merging with current
   *         values so the client only needs to send changed fields.
   * @idea   Reads the existing record first, then falls back to old values for
   *         any field not provided in the payload, enabling partial updates.
   * @usage  Called by CategoryController.update()
   *         -- PATCH /category/update.
   * @dataflow payload {categoryId, name?, icon?, connectTo?, store?, customer?,
   *           rfq?, policy?} + req -> fetch existing -> this.prisma.category.update
   *           with merged data -> success/error envelope with updated record.
   * @depends this.prisma.category
   * @notes  - `req` is accepted but not used.
   *         - Uses `||` for fallback, which means falsy values (empty string,
   *           0, false) will not overwrite the existing value.
   */
  async update(payload: any, req: any) {
    try {
      const categoryId = payload.categoryId;
      let existCategory = await this.prisma.category.findUnique({
        where: { id: categoryId }
      });
      let updatedCategory = await this.prisma.category.update({
        where: { id: categoryId,
        },
        data: {
          name: payload.name || existCategory.name,
          icon: payload.icon || existCategory.icon,
          connectTo: payload?.connectTo || existCategory.connectTo,
          store: payload.store || existCategory.store,
          customer: payload.customer || existCategory.customer,
          rfq: payload.rfq || existCategory.rfq,
          policy: payload.policy || existCategory.policy,
        }
      });

      // Invalidate all category caches
      await this.cacheService.invalidateAllCategories();

      return {
        status: true,
        message: 'Updated Successfully',
        data: updatedCategory
      }
    } catch (error) {
      return {
        status: false,
        message: 'error in update',
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * @intent Soft-delete a category and clean up all product rows that reference it.
   * @idea   Products store a stringified category path in `categoryLocation`.
   *         Before marking the category as deleted we must find every product
   *         whose path contains this category's id and nullify the reference to
   *         prevent broken links.
   * @usage  Called by CategoryController.delete()
   *         -- DELETE /category/delete/:categoryId.
   * @dataflow categoryId (string) -> parseInt -> find products whose
   *           categoryLocation contains the id string -> null out categoryId
   *           (if it matched exactly) and categoryLocation on each ->
   *           set category status='DELETE', deletedAt=now() -> success/error envelope.
   * @depends this.prisma.category, this.prisma.product
   * @notes  - This is a soft delete (status + timestamp), not a hard delete.
   *         - Product cleanup uses a case-insensitive string `contains` match,
   *           so it may match more products than intended if the id appears as a
   *           substring of another id (e.g., id "1" inside "10").
   *         - `req` is accepted but not used.
   */
  async delete(categoryId: any, req: any) {
    try {
      let ID = parseInt(categoryId)

      let whereCondition: any = {
        OR: [
          { categoryId: ID },
          { categoryLocation: { contains: `/${ID}/` } },
          { categoryLocation: { startsWith: `${ID}/` } },
          { categoryLocation: { endsWith: `/${ID}` } },
          { categoryLocation: { equals: String(ID) } },
        ],
      }

      let categoryUsedInProduct = await this.prisma.product.findMany({
        where: whereCondition,
        select: { id: true, categoryId: true, categoryLocation: true }
      });

      if (categoryUsedInProduct.length > 0) {
        for (let product of categoryUsedInProduct) {
          await this.prisma.product.update({
            where: { id: product.id },
            data: {
              categoryId: product.categoryId === ID ? null : product.categoryId,
              categoryLocation: null
            }
          });
        }
      }

      let updatedCategory = await this.prisma.category.update({
        where: { id: ID },
        data: {
          status: 'DELETE',
          deletedAt: new Date()
        }
      });

      // Invalidate all category caches
      await this.cacheService.invalidateAllCategories();

      return {
        status: true,
        message: 'Deleted Successfully',
        data: updatedCategory
      }
    } catch (error) {

      return {
        status: false,
        message: 'error in delete',
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * @intent Return a paginated list of all active categories that belong to a menu.
   * @idea   Provides the data behind admin category grids with offset-based
   *         pagination, including parent and menu-parent relations for display.
   * @usage  Called by CategoryController.findAll()
   *         -- GET /category/findAll?page=...&limit=...
   * @dataflow page & limit (strings) -> parseInt with defaults (1 / 10) ->
   *           this.prisma.category.findMany (skip/take) + this.prisma.category.count ->
   *           success/error envelope with data[], totalCount, page, limit.
   * @depends this.prisma.category
   * @notes  - Only categories where menuId is not null and status is ACTIVE
   *           are returned.
   *         - Results are ordered by id ascending.
   *         - Includes the `parent` and `menuParent` relations (both filtered
   *           to ACTIVE).
   */
  async findAll(page: any, limit: any) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize; // Calculate the offset

      const cacheKey = CACHE_KEYS.CATEGORY_ALL(Page, pageSize);
      const cached = await this.cacheService.get(cacheKey);
      if (cached) return cached;

      let findAll = await this.prisma.category.findMany({
        where: {
          status: 'ACTIVE',
          menuId: { not: null },
        },
        include: {
          parent: {
            where: {
              status: 'ACTIVE'
            }
          },
          menuParent: {
            where: {
              status: 'ACTIVE'
            }
          }
        },
        orderBy: { id: 'asc' },
        skip, // Offset
        take: pageSize, // Limit
      });

      let findAllCount = await this.prisma.category.count({
        where: {
          status: 'ACTIVE',
          menuId: { not: null },
        }
      });

      if (!findAll) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
          totalCount: 0,
          page: 0,
          limit: 0
        }
      }

      const result = {
        status: true,
        message: 'Fetch Successfully',
        data: findAll,
        totalCount: findAllCount,
        page: Page,
        limit: pageSize
      };

      await this.cacheService.set(cacheKey, result, CACHE_TTL.CATEGORY_ALL);
      return result;
    } catch (error) {
      return {
        status: false,
        message: 'error in findAll',
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * @intent Retrieve a category acting as a "menu" together with its direct
   *         (one-level) children.
   * @idea   Menus are represented as top-level categories; fetching a menu and
   *         its immediate children powers navigation dropdowns and sidebars.
   * @usage  Called by CategoryController.getMenu()
   *         -- GET /category/getMenu?categoryId=...
   * @dataflow categoryId (string) -> parseInt -> this.prisma.category.findUnique with
   *           one-level children include -> success/error/not-found envelope.
   * @depends this.prisma.category
   * @notes  Only ACTIVE status rows are returned (both root and children).
   */
  async getMenu(categoryId: any ) {
    try {
      const categoryID = parseInt(categoryId);

      const cacheKey = CACHE_KEYS.CATEGORY_MENU(categoryID);
      const cached = await this.cacheService.get(cacheKey);
      if (cached) return cached;

      let menuDetails = await this.prisma.category.findUnique({
        where: {
          id: categoryID,
          status: 'ACTIVE'
        },
        include: {
          children: {
            where: {
              status: 'ACTIVE'
            }
          }
        }
      });

      if (!menuDetails) {
        return {
          status: false,
          message: 'Not Found',
          data: []
        }
      }

      const result = {
        status: true,
        message: 'Fetch Successfully',
        data: menuDetails
      };

      await this.cacheService.set(cacheKey, result, CACHE_TTL.CATEGORY_MENU);
      return result;
    } catch (error) {
      return {
        status: false,
        message: 'error in getMenu',
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * @intent Fetch all top-level categories under menu 1 with their direct children.
   * @idea   Serves the default navigation menu by returning every level-one
   *         category and one tier of sub-categories, sorted by id.
   * @usage  Called by CategoryController.getCategoryLevelOne()
   *         -- GET /category/getCategoryLevelOne.
   * @dataflow (no params) -> this.prisma.category.findMany where menuId=1, status=ACTIVE,
   *           include ACTIVE children -> success/error/not-found envelope.
   * @depends this.prisma.category
   * @notes  Hard-coded to menuId = 1.  If the platform introduces multiple
   *         menus, this method will need a menuId parameter.
   */
  async getCategoryLevelOne() {
    try {
      const cacheKey = CACHE_KEYS.CATEGORY_LEVEL_ONE;
      const cached = await this.cacheService.get(cacheKey);
      if (cached) return cached;

      let getCategoryLevelOne = await this.prisma.category.findMany({
        where: {
          status: 'ACTIVE',
          menuId: 1,
        },
        include: {
          children: {
            where: {
              status: 'ACTIVE'
            }
          },
        },
        orderBy: { id: 'asc' },
        take: 100, // Safety cap for menu categories
      });

      if(!getCategoryLevelOne) {
        return {
          status: false,
          message: 'Not Found',
          data: []
        }
      }

      const result = {
        status: true,
        message: 'Fetch Successfully',
        data: getCategoryLevelOne
      };

      await this.cacheService.set(cacheKey, result, CACHE_TTL.CATEGORY_LEVEL_ONE);
      return result;

    } catch (error) {
      return {
        status: false,
        message: 'error in getCategoryLevelOne',
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * @intent Batch-update whiteList and/or blackList flags on multiple categories.
   * @idea   Accepts two arrays (whiteList, blackList) each containing {id, status}
   *         objects, and iterates through them to update each category individually.
   * @usage  Called by CategoryController.updateWhiteBlackList()
   *         -- PATCH /category/updateWhiteBlackList.
   * @dataflow payload {whiteList?: [{id, status}], blackList?: [{id, status}]}
   *           + req -> iterate whiteList, update each category's whiteList field
   *           -> iterate blackList, update each category's blackList field ->
   *           success/error envelope.
   * @depends this.prisma.category
   * @notes  - `req` is accepted but not used.
   *         - Updates are performed sequentially in a loop (not batched), so
   *           partial failures are possible: some rows may be updated before an
   *           error is caught.
   *         - Returns an empty data array; the caller does not receive the
   *           updated records.
   */
  async updateWhiteBlackList(payload: any, req: any) {
    try {
      if (payload.whiteList && payload.whiteList.length > 0) {
        for (let i=0; i<payload.whiteList.length; i++) {
          let updatedCategory = await this.prisma.category.update({
            where: { id: payload.whiteList[i].id },
            data: {
              whiteList: payload.whiteList[i].status
            }
          })
        }
      }

      if (payload.blackList && payload.blackList.length > 0) {
        for (let i=0; i<payload.blackList.length; i++) {
          let updatedCategory = await this.prisma.category.update({
            where: { id: payload.blackList[i].id },
            data: {
              blackList: payload.blackList[i].status
            }
          })
        }
      }

      // Invalidate all category caches
      await this.cacheService.invalidateAllCategories();

      return {
        status: true,
        message: 'Updated Successfully',
        data: []
      }
    } catch (error) {
      return {
        status: false,
        message: 'error, in updateWhiteBlackList',
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * @intent Create cross-reference ("connectTo") rows between a source category
   *         and one or more target categories.
   * @idea   Supports "related categories" or "connected categories" by inserting
   *         rows into the CategoryConnectTo join table.  Existing connections are
   *         deduplicated so the operation is idempotent.
   * @usage  Called by CategoryController.createCategoryConnectTo()
   *         -- POST /category/createCategoryConnectTo.
   * @dataflow payload {categoryId, categoryLocation, connectToList: [{connectTo,
   *           connectToLocation, connectToType}]} + req -> for each item, check
   *           if (categoryId, connectTo) pair already exists -> if not, create ->
   *           return array of newly created connections.
   * @depends this.prisma.categoryConnectTo
   * @notes  - `req` is accepted but not used.
   *         - Uses findFirst + create instead of upsert; safe but issues two
   *           queries per connection.
   *         - If no new connections were created, data returns the string
   *           'No new connections created' rather than an empty array.
   */
  // create multiple connectTo
  async createCategoryConnectTo(payload: any, req: any) {
    try {
      let createdConnections = [];
      const categoryId = payload.categoryId;
      const categoryLocation = payload.categoryLocation;

      if (payload?.connectToList && payload?.connectToList.length > 0) {
        for (let i = 0; i < payload.connectToList.length; i++) {
          const { connectTo, connectToLocation, connectToType } = payload.connectToList[i];

          // Check if categoryId and connectTo already exist in the categoryConnectTo table
          const existingConnection = await this.prisma.categoryConnectTo.findFirst({
            where: {
              categoryId: categoryId,
              connectTo: connectTo
            }
          });

          // If no existing connection, create a new one
          if (!existingConnection) {
            const newConnection = await this.prisma.categoryConnectTo.create({
              data: {
                categoryId: categoryId,
                categoryLocation: categoryLocation,
                connectTo: connectTo,
                connectToLocation: connectToLocation,
                connectToType: connectToType
              }
            });

            // Add the newly created connection to the response array
            createdConnections.push(newConnection);
          }
        }
      }

      return {
        status: true,
        message: 'Process completed successfully',
        data: createdConnections.length > 0 ? createdConnections : 'No new connections created'
      };

    } catch (error) {
      return {
        status: false,
        message: 'Error in createCategoryConnectTo',
        error: getErrorMessage(error)
      };
    }
  }


  /**
   * @intent Hard-delete a single CategoryConnectTo row by its primary key.
   * @idea   Connect-to rows are lightweight join records with no audit trail
   *         requirement, so a physical delete is used instead of the soft-delete
   *         pattern applied to categories.
   * @usage  Called by CategoryController.deleteCategoryConnectTo()
   *         -- DELETE /category/deleteCategoryConnectTo/:categoryConnectToId.
   * @dataflow categoryConnectToId (string) -> parseInt ->
   *           this.prisma.categoryConnectTo.delete -> success/error envelope with
   *           the deleted record.
   * @depends this.prisma.categoryConnectTo
   * @notes  - `req` is accepted but not used.
   *         - A soft-delete alternative (update status + deletedAt) is preserved
   *           in the commented-out block for reference.
   */
  async deleteCategoryConnectTo(categoryConnectToId: any, req: any) {
    try {
      const categoryConnectToID = parseInt(categoryConnectToId);

      let deleteCategoryConnectTo = await this.prisma.categoryConnectTo.delete({
        where: { id: categoryConnectToID }
      });
      return {
        status: true,
        message: 'Deleted Successfully',
        data: deleteCategoryConnectTo
      }

    } catch (error) {
      return {
        status: false,
        message: 'error, in deleteCategoryConnectTo',
        error: getErrorMessage(error)
      }
    }
  }
}
