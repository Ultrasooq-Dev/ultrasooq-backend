/**
 * @file cart.service.ts
 * @description Core business-logic service for all cart operations in the Ultrasooq marketplace.
 *
 * Manages four distinct cart domains persisted through Prisma:
 * 1. **Standard Product Cart** (`Cart` model) -- add, update, list, delete product line-items
 *    with variant/price support and optional shared-link tracking.
 * 2. **RFQ Cart** (`RFQCart` model) -- request-for-quotation items with offer pricing fields.
 * 3. **Factories Cart** (`FactoriesCart` model) -- customisable factory-direct product orders.
 * 4. **Service Cart** (reuses `Cart` with `cartType='SERVICE'`) -- standalone services
 *    with feature line-items and optional product links via `CartProductService`.
 *
 * Cross-cutting concerns:
 * - **Guest vs Authenticated**: Every cart write/read path checks `req.user.id` first;
 *   if absent, falls back to `payload.deviceId`. After login the `*UserIdBydeviceId`
 *   methods migrate device rows to the user and de-duplicate.
 * - **Response Envelope**: All methods return `{ status/success, message, data, ... }`.
 * - **Error Handling**: Every public method wraps its body in try/catch and returns an
 *   error envelope rather than throwing.
 *
 * @module CartService
 *
 * @dependencies
 * - {@link PrismaClient} - Module-scoped instance for all database access.
 * - {@link AddCartServiceDto} - Validated DTO consumed by `updateCartService`.
 * - {@link AddCartServiceProdDto} - Validated DTO consumed by `updateServiceProduct`.
 *
 * @notes
 * - A module-scoped `PrismaClient` is instantiated at the top of the file rather than being
 *   injected, following the project-wide convention.
 * - The unused `features` import from `'process'` is present in the original source but has
 *   no effect on runtime behaviour.
 */
import { Injectable } from '@nestjs/common';
import { Prisma, Status } from '../generated/prisma/client';
import { AddCartServiceDto, AddCartServiceProdDto } from './dto/cart.dto';
import { features } from 'process';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage } from 'src/common/utils/get-error-message';

/**
 * @class CartService
 * @description Injectable NestJS service containing all cart business logic.
 * Each public method corresponds to one or more controller endpoints and returns a
 * standardised response envelope.
 */
@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @method update
   * @description Creates or updates a standard product cart item. Supports both authenticated
   * (userId) and guest (deviceId) callers. Used by both `/update` and `/updateUnAuth` routes.
   *
   * @intent Provide the primary cart upsert for the product listing / cart page, where the
   *         incoming quantity *replaces* the existing value (unlike `addToCart` which accumulates).
   * @idea
   * - Looks up `ProductPrice` by `payload.productPriceId` to resolve the canonical `productId`.
   * - Builds a dynamic Prisma WHERE clause scoped by `userId` or `deviceId`.
   * - If an active (non-deleted) cart row matches, quantity semantics apply:
   *     - `quantity === -1` => increment existing quantity by 1.
   *     - `quantity > 0`    => overwrite with the new absolute quantity.
   *     - `quantity <= 0`   => hard-delete the cart row.
   * - If no match, a new cart row is created.
   * - Stores optional `sharedLinkId` and `productVariant` (as JSON `object` column).
   *
   * @usage Called by `CartController.update` (auth) and `CartController.updateUnAuth` (guest).
   *
   * @dataflow
   * payload.productPriceId -> ProductPrice lookup -> Cart findFirst (userId|deviceId + productPriceId)
   * -> branch: update existing | create new | delete if qty=0.
   *
   * @dependencies Prisma models: `ProductPrice`, `Cart`.
   *
   * @notes
   * - The `deletedAt: null` filter means only non-soft-deleted rows are considered.
   * - When `quantity === -1`, the method increments by 1 (special UI shorthand for "+1").
   *
   * @param {any} payload - Request body: `{ productPriceId, quantity, deviceId?, sharedLinkId?, productVariant? }`.
   * @param {any} req - Express request; `req.user.id` used when present.
   * @returns {Promise<{status: boolean, message: string, data: any[], error?: string}>}
   */
  // using this func with login API & withOut Login API
  async update(payload: any, req: any) {
    try {
      const productPrice = await this.prisma.productPrice.findUnique({
        where: { id: payload?.productPriceId },
      });

      if (!productPrice) {
        return { status: false, message: 'Product price not found', data: [] };
      }

      let where: Prisma.CartWhereInput = {};

      if (req?.user?.id) {
        where.OR = [{ userId: req.user.id }];
      } else {
        where.OR = [{ deviceId: payload.deviceId }];
      }

      const existingCart = await this.prisma.cart.findFirst({
        where: {
          AND: [
            where,
            { productId: productPrice.productId },
            { productPriceId: productPrice.id },
            { deletedAt: null },
          ],
        },
      });

      if (existingCart) {
        if (payload?.quantity == -1) {
          existingCart.quantity = existingCart.quantity + 1;
          await this.prisma.cart.update({
            where: { id: existingCart.id },
            data: {
              quantity: existingCart.quantity,
              sharedLinkId: payload?.sharedLinkId,
              object: payload?.productVariant,
            },
          });
        } else {
          // existingCart.quantity = existingCart.quantity + payload?.quantity
          if (payload?.quantity > 0) {
            await this.prisma.cart.update({
              where: { id: existingCart.id },
              data: {
                quantity: payload?.quantity,
                // quantity: existingCart.
                sharedLinkId: payload?.sharedLinkId,
                object: payload?.productVariant,
              },
            });
          } else {
            await this.prisma.cart.delete({
              where: { id: existingCart.id },
            });
          }
        }

        return {
          status: true,
          message: 'Existing Cart Updated',
          data: [],
        };
      } else {
        // new product
        let cartDetail = await this.prisma.cart.create({
          data: {
            userId: req?.user?.id || undefined,
            deviceId: payload?.deviceId || undefined,
            productId: productPrice.productId,
            productPriceId: productPrice.id,
            quantity: payload?.quantity === -1 ? 1 : payload?.quantity || 1,
            sharedLinkId: payload?.sharedLinkId,
            object: payload?.productVariant,
          },
        });

        return {
          status: true,
          message: 'Cart Created Successfully',
          data: [],
        };
      }
    } catch (error) {
      return {
        status: false,
        message: 'error in update',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method updateCartServiceWithProduct
   * @description Adds a service (with selected features) to the cart and simultaneously
   * creates a `CartProductService` join record linking it to an existing product cart entry.
   *
   * @intent Enable the "add service to product" UX: when a user views a product in their cart,
   * they can attach a service (e.g., installation, warranty) with specific feature selections.
   *
   * @idea
   * - Checks whether a service cart row already exists for this user + service that has
   *   **no** linked products (`cartProductServices: { none: {} }`).
   * - If **no** existing row:
   *   1. Creates a new Cart row with `cartType='SERVICE'` and bulk-creates feature rows.
   *   2. Creates a `CartProductService` linking `payload.cartId` (product) to the new service cart.
   * - If an existing standalone service cart row is found, features are upserted:
   *   new features are created; existing features have their quantity updated.
   *
   * @usage Called by `CartController.updateCartServiceWithProduct`.
   *
   * @dataflow
   * payload -> Cart.findFirst (serviceId + userId, no linked products)
   * -> branch: create cart + features + CartProductService | upsert features on existing cart.
   *
   * @dependencies Prisma models: `Cart`, `CartServiceFeature`, `CartProductService`.
   *
   * @notes
   * - `payload.cartId` refers to the **product** cart row to which the service is being attached.
   * - The `cartType` / `relatedCartType` fields default to 'PRODUCT' / 'SERVICE' respectively.
   *
   * @param {any} payload - `{ serviceId, features[], cartId, productId, cartType?, relatedCartType? }`.
   * @param {any} req - Express request with `req.user`.
   * @returns {Promise<{success: boolean, message: string, data: any, cartProductService?: any}>}
   */
  // Add/Update Service with product
  async updateCartServiceWithProduct(payload: any, req: any) {
    try {
      // Handle both user object structures (from User model or custom object)
      const userId = req.user.id || req.user.userId;
      const { serviceId, features } = payload;
      const existInCart = await this.prisma.cart.findFirst({
        where: {
          serviceId,
          userId,
          cartProductServices: {
            none: {},
          },
        },
      });
      if (!existInCart) {
        const cart = await this.prisma.cart.create({
          data: {
            userId,
            serviceId,
            cartType: 'SERVICE',
            quantity: 1,
            cartServiceFeatures: {
              createMany: {
                data: features,
              },
            },
          },
        });

        let cartProductService = await this.prisma.cartProductService.create({
          data: {
            cartId: payload.cartId,
            productId: payload.productId,
            serviceId: payload.serviceId,
            relatedCartId: cart.id,
            cartType: payload.cartType || 'PRODUCT',
            relatedCartType: payload.relatedCartType || 'SERVICE',
          },
        });

        return {
          success: true,
          message: 'service added to cart',
          data: cart,
          cartProductService: cartProductService,
        };
      } else {
        const response = await Promise.all(
          features.map(async (feature) => {
            const existingCartFeature =
              await this.prisma.cartServiceFeature.findFirst({
                where: {
                  cartId: existInCart.id,
                  serviceFeatureId: feature.serviceFeatureId,
                },
              });

            if (!existingCartFeature) {
              return await this.prisma.cartServiceFeature.create({
                data: {
                  cartId: existInCart.id,
                  ...feature,
                },
              });
            } else {
              return await this.prisma.cartServiceFeature.update({
                where: {
                  id: existingCartFeature.id,
                },
                data: {
                  quantity: feature.quantity,
                },
              });
            }
          }),
        );
        return {
          success: true,
          message: 'service added to cart',
          data: response,
        };
      }
    } catch (error) {
      return {
        status: false,
        message: 'error in update service cart',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method addToCart
   * @description Adds a product to the cart from the product detail page. Unlike {@link update},
   * this method **accumulates** quantity onto an existing cart row rather than replacing it.
   *
   * @intent Provide the "Add to Cart" button behaviour on the product detail page where
   * repeated clicks should increase the quantity additively.
   *
   * @idea
   * - Resolves `ProductPrice` from `payload.productPriceId`.
   * - Builds a userId/deviceId-based WHERE clause and searches for an existing non-deleted row.
   * - If found:
   *     - `quantity === -1` => increment by 1.
   *     - `quantity > 0`    => **add** incoming quantity to the existing quantity.
   *     - `quantity <= 0`   => hard-delete the cart row.
   * - If not found, creates a new cart row with the given quantity (defaulting to 1).
   *
   * @usage Called by `CartController.addToCart` (authenticated only).
   *
   * @dataflow
   * payload.productPriceId -> ProductPrice lookup -> Cart.findFirst
   * -> branch: accumulate quantity | create new row | delete row.
   *
   * @dependencies Prisma models: `ProductPrice`, `Cart`.
   *
   * @notes
   * - Key difference from `update`: line `existingCart.quantity += payload.quantity` (additive)
   *   vs `update` which sets `quantity = payload.quantity` (replacement).
   * - Does not store `sharedLinkId` or `productVariant` (unlike `update`).
   *
   * @param {any} payload - `{ productPriceId, quantity, deviceId? }`.
   * @param {any} req - Express request with `req.user`.
   * @returns {Promise<{status: boolean, message: string, data: any[], error?: string}>}
   */
  // this api is used only in product detail page
  async addToCart(payload: any, req: any) {
    try {
      const productPrice = await this.prisma.productPrice.findUnique({
        where: { id: payload?.productPriceId },
      });

      if (!productPrice) {
        return { status: false, message: 'Product price not found', data: [] };
      }

      let where: Prisma.CartWhereInput = {};

      if (req?.user?.id) {
        where.OR = [{ userId: req.user.id }];
      } else {
        where.OR = [{ deviceId: payload.deviceId }];
      }

      const existingCart = await this.prisma.cart.findFirst({
        where: {
          AND: [
            where,
            { productId: productPrice.productId },
            { productPriceId: productPrice.id },
            { deletedAt: null },
          ],
        },
      });

      if (existingCart) {
        if (payload?.quantity == -1) {
          existingCart.quantity = existingCart.quantity + 1;
          await this.prisma.cart.update({
            where: { id: existingCart.id },
            data: {
              quantity: existingCart.quantity,
            },
          });
        } else {
          existingCart.quantity = existingCart.quantity + payload?.quantity;
          if (payload?.quantity > 0) {
            await this.prisma.cart.update({
              where: { id: existingCart.id },
              data: {
                // quantity: payload?.quantity
                quantity: existingCart.quantity,
              },
            });
          } else {
            await this.prisma.cart.delete({
              where: { id: existingCart.id },
            });
          }
        }

        return {
          status: true,
          message: 'Existing Cart Updated',
          data: [],
        };
      } else {
        // new product
        let cartDetail = await this.prisma.cart.create({
          data: {
            userId: req?.user?.id || undefined,
            deviceId: payload?.deviceId || undefined,
            productId: productPrice.productId,
            productPriceId: productPrice.id,
            quantity: payload?.quantity === -1 ? 1 : payload?.quantity || 1,
          },
        });

        return {
          status: true,
          message: 'Cart Created Successfully',
          data: [],
        };
      }
    } catch (error) {
      return {
        status: false,
        message: 'error in update',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method list
   * @description Returns a paginated list of cart items with deeply nested product,
   * service, and feature relations. Supports both authenticated and guest callers.
   *
   * @intent Power the shopping-cart UI with all data needed to render line-items,
   * product thumbnails, service details, and feature breakdowns in a single query.
   *
   * @idea
   * - Parses `page` and `limit` with fallback defaults (1 and 10).
   * - Filters by `deletedAt: null` and either `userId` or `deviceId`.
   * - Eagerly includes:
   *     - `productPriceDetails` -> `productPrice_product` -> `productImages`
   *     - `cartProductServices`
   *     - `cartServiceFeatures` -> `serviceFeature`
   *     - `service` -> `images`
   * - Also returns `totalCount` for client pagination controls.
   *
   * @usage Called by `CartController.list` (auth) and `CartController.listUnAuth` (guest).
   *
   * @dataflow
   * (page, limit, req, deviceId) -> Prisma Cart.findMany (with includes) + Cart.count.
   *
   * @dependencies Prisma models: `Cart` with relations to `ProductPrice`, `Product`,
   * `ProductImage`, `CartProductService`, `CartServiceFeature`, `ServiceFeature`, `Service`.
   *
   * @notes
   * - Results are ordered by `id ASC` (oldest first).
   * - The `!cartResponse` check can never be true for `findMany` (returns `[]`), but it
   *   is kept for defensive coding.
   *
   * @param {any} page - Page number string (parsed to int, default 1).
   * @param {any} limit - Page size string (parsed to int, default 10).
   * @param {any} req - Express request; `req.user.id` used when present.
   * @param {any} deviceId - Fallback device identifier for guest users.
   * @returns {Promise<{status: boolean, message: string, data: any[], totalCount: number}>}
   */
  // using this func with login API & withOut Login API
  async list(page: any, limit: any, req: any, deviceId: any) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize; // Calculate the offset

      let where: Prisma.CartWhereInput = { deletedAt: null };

      if (req?.user?.id) {
        where = { ...where, userId: req?.user?.id };
      } else {
        where = { ...where, deviceId: deviceId };
      }

      let cartResponse = await this.prisma.cart.findMany({
        where,
        include: {
          productPriceDetails: {
            include: {
              productPrice_product: {
                include: {
                  productImages: true,
                },
              },
            },
          },
          cartProductServices: true,
          cartServiceFeatures: {
            include: {
              serviceFeature: true,
            },
          },
          service: {
            include: {
              images: true,
            },
          },
        },
        orderBy: { id: 'asc' },
        skip, // Offset
        take: pageSize, // Limit
      });

      let cartResponseCount = await this.prisma.cart.count({
        where,
      });

      if (!cartResponse) {
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
        data: cartResponse,
        totalCount: cartResponseCount,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in list',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method updateUserIdBydeviceId
   * @description Migrates all guest (device-based) cart rows to the authenticated user's
   * account, then de-duplicates by summing quantities of rows sharing the same `productPriceId`.
   *
   * @intent Called immediately after login so that items a user added as a guest are
   * preserved under their authenticated account without creating duplicate rows.
   *
   * @idea
   * 1. `updateMany`: reassign all Cart rows with matching `deviceId` to the user's `userId`
   *    and null-out `deviceId`.
   * 2. Raw SQL query finds `(userId, productPriceId)` groups with `COUNT > 1`.
   * 3. For each duplicate group, keep the first row encountered, sum all quantities into it,
   *    and delete the surplus rows.
   * 4. All deletes and updates are dispatched concurrently via `Promise.all`.
   *
   * @usage Called by `CartController.updateUserIdBydeviceId` (authenticated).
   *
   * @dataflow
   * (payload.deviceId, req.user.id) -> Cart.updateMany (deviceId -> userId)
   * -> raw SQL duplicate detection -> Cart.delete (duplicates) + Cart.update (merged qty).
   *
   * @dependencies Prisma models: `Cart`. Uses `this.prisma.$queryRaw` for duplicate detection.
   *
   * @notes
   * - Handles both `req.user.id` and `req.user.userId` to accommodate different JWT payload shapes.
   * - Defines a local `DuplicateCartItem` interface for the raw query result type.
   * - Not wrapped in a single Prisma transaction -- partial failure is possible under
   *   concurrent writes.
   *
   * @param {any} payload - `{ deviceId }`.
   * @param {any} req - Express request with `req.user`.
   * @returns {Promise<{success: boolean, message: string, data: any[], error?: string}>}
   */
  async updateUserIdBydeviceId(payload: any, req: any) {
    let userId, deviceId, returnValue;
    try {
      if (req?.user?.id && payload?.deviceId) {
        // Handle both user object structures (from User model or custom object)
        userId = req.user.id || req.user.userId;
        deviceId = payload?.deviceId;
        returnValue = await this.prisma.cart.updateMany({
          where: {
            deviceId,
          },
          data: {
            userId,
            deviceId: null,
          },
        });
      }

      // finding duplicateCartItem
      interface DuplicateCartItem {
        userId: number;
        // productId: number;
        productPriceId: number;
      }

      const duplicateCartItemsQueryResult: DuplicateCartItem[] =
        await this.prisma.$queryRaw`
        SELECT "userId", "productPriceId"
        FROM "Cart"
        WHERE "userId" = ${userId}
        GROUP BY "userId", "productPriceId"
        HAVING COUNT("productPriceId") > 1;
      `;

      const duplicateProductIds = duplicateCartItemsQueryResult.map(
        (item) => item.productPriceId,
      );

      const duplicateCartItems = await this.prisma.cart.findMany({
        where: {
          userId: userId,
          productPriceId: {
            in: duplicateProductIds,
          },
        },
      });
      // end of duplicateCartItem

      const groupedItems: {
        [productPriceId: number]: { id: number; quantity: number };
      } = {};
      const promiseArr: Promise<any>[] = [];

      for (const item of duplicateCartItems) {
        const productPriceId = item.productPriceId;
        if (!groupedItems[productPriceId]) {
          groupedItems[productPriceId] = {
            id: item.id,
            quantity: item.quantity,
          };
        } else {
          groupedItems[productPriceId].quantity += item.quantity;
          promiseArr.push(this.prisma.cart.delete({ where: { id: item.id } }));
        }
      }

      for (const productPriceId in groupedItems) {
        const item = groupedItems[productPriceId];
        promiseArr.push(
          this.prisma.cart.update({
            where: { id: item.id },
            data: { quantity: item.quantity },
          }),
        );
      }

      await Promise.all(promiseArr);

      return {
        success: true,
        message: 'Cart items updated successfully',
        data: [],
      };
    } catch (error) {

      return {
        status: false,
        message: 'error in updateUserIdBydeviceId',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method delete
   * @description Hard-deletes a single cart row and its associated `CartProductService`
   * join records. Does NOT cascade to related service carts or features.
   *
   * @intent Provide a simple single-row delete (product only, no service cascade).
   * @idea Looks up the Cart by ID, deletes any CartProductService rows referencing it,
   *       then deletes the Cart row itself.
   *
   * @usage **Not currently in use** -- superseded by {@link deleteProduct} which performs
   * a full cascading delete.
   *
   * @dataflow cartId -> Cart.findUnique -> CartProductService.deleteMany -> Cart.delete.
   *
   * @dependencies Prisma models: `Cart`, `CartProductService`.
   *
   * @notes
   * - Marked as "Not in use" in the original source.
   * - Does not remove related service carts or their features, which could leave orphans.
   *
   * @param {any} cartId - The cart row ID (string or number, parsed to int internally).
   * @returns {Promise<{status: boolean, message: string, data: object, error?: string}>}
   */
  // Not in use
  // only delete product
  async delete(cartId: any) {
    try {
      const cartID = parseInt(cartId);

      let existCart = await this.prisma.cart.findUnique({
        where: { id: cartID },
      });

      if (!existCart) {
        return {
          status: false,
          message: 'Not Found',
          data: {},
        };
      }

      let deleteCartProductService = await this.prisma.cartProductService.deleteMany(
        {
          where: { cartId: cartID },
        },
      );

      let deletedCart = await this.prisma.cart.delete({
        where: { id: cartID },
      });

      return {
        status: true,
        message: 'Deleted Successfully',
        data: {},
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in delete cart',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method deleteProduct
   * @description Performs a full cascading hard-delete of a product cart row and every
   * related service entity underneath it.
   *
   * @intent Remove a product from the cart while ensuring no orphaned service carts,
   * feature rows, or join records remain in the database.
   *
   * @idea Five-step cascade executed sequentially:
   * 1. Find all `CartProductService` rows where `cartId` matches (these link to service carts).
   * 2. Collect the `relatedCartId` values (service cart IDs).
   * 3. Delete `CartServiceFeature` rows belonging to those service carts.
   * 4. Delete the `CartProductService` join rows.
   * 5. Delete the service Cart rows, then delete the main (product) Cart row.
   *
   * @usage Called by `CartController.delete` and `CartController.deleteProduct`.
   *
   * @dataflow
   * cartId -> Cart.findUnique -> CartProductService.findMany -> CartServiceFeature.deleteMany
   * -> CartProductService.deleteMany -> Cart.deleteMany (services) -> Cart.delete (product).
   *
   * @dependencies Prisma models: `Cart`, `CartProductService`, `CartServiceFeature`.
   *
   * @notes
   * - All operations are individual awaits (not a Prisma transaction), so partial failure
   *   is theoretically possible under extreme concurrency.
   * - Returns 404-style envelope if the cart row does not exist.
   *
   * @param {any} cartId - The cart row ID (string or number, parsed to int internally).
   * @returns {Promise<{status: boolean, message: string, data: object, error?: string}>}
   */
  // delete product & services under it
  async deleteProduct(cartId: any) {
    try {
      const cartID = parseInt(cartId);

      const existCart = await this.prisma.cart.findUnique({
        where: { id: cartID },
      });

      if (!existCart) {
        return {
          status: false,
          message: 'Cart not found',
          data: {},
        };
      }

      // Step 1: Get all services under this product
      const relatedServices = await this.prisma.cartProductService.findMany({
        where: { cartId: cartID },
      });

      const relatedServiceCartIds = relatedServices
        .map((rel) => rel.relatedCartId)
        .filter(Boolean);

      // Step 2: Delete related service features
      if (relatedServiceCartIds.length > 0) {
        await this.prisma.cartServiceFeature.deleteMany({
          where: {
            cartId: {
              in: relatedServiceCartIds,
            },
          },
        });
      }

      // Step 3: Delete related cartProductService entries
      await this.prisma.cartProductService.deleteMany({
        where: { cartId: cartID },
        // where: {
        //   OR: [
        //     { cartId: cartID },
        //     { relatedCartId: cartID },
        //   ],
        // },
      });

      // Step 4: Delete the related service carts
      if (relatedServiceCartIds.length > 0) {
        await this.prisma.cart.deleteMany({
          where: {
            id: {
              in: relatedServiceCartIds,
            },
          },
        });
      }

      // Step 5: Delete the main cart (product)
      await this.prisma.cart.delete({
        where: { id: cartID },
      });

      return {
        status: true,
        message: 'Deleted product and its related services successfully',
        data: {},
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error deleting cart',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method cartCount
   * @description Returns the total number of non-deleted cart items for a user or device.
   *
   * @intent Provide a lightweight count for the cart badge icon in the UI header.
   *
   * @idea
   * - Filters by `deletedAt: null` and either `userId` (authenticated) or `deviceId` (guest).
   * - Uses `this.prisma.cart.count` for an efficient database-level count.
   *
   * @usage Called by `CartController.cartCount` (auth) and `CartController.cartCountUnAuth`.
   *
   * @dataflow (payload.deviceId, req.user.id) -> Prisma Cart.count -> number.
   *
   * @dependencies Prisma model: `Cart`.
   *
   * @notes
   * - Returns `totalCount: 0` and `status: false` when the count is zero or falsy.
   * - The response uses POST despite being a read operation, likely for body-based `deviceId`.
   *
   * @param {any} payload - `{ deviceId? }`.
   * @param {any} req - Express request; `req.user.id` takes precedence.
   * @returns {Promise<{status: boolean, message: string, data: number|any[], totalCount?: number}>}
   */
  async cartCount(payload: any, req: any) {
    try {
      const deviceId = payload?.deviceId;
      let where: Prisma.CartWhereInput = { deletedAt: null };

      if (req?.user?.id) {
        where = { ...where, userId: req?.user?.id };
      } else {
        where = { ...where, deviceId: deviceId };
      }

      let cartResponseCount = await this.prisma.cart.count({
        where,
      });

      if (!cartResponseCount) {
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
        data: cartResponseCount,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in cartCount',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method deleteAllCartItemByUserId
   * @description Bulk hard-deletes every cart item belonging to the specified user.
   *
   * @intent Wipe the entire cart after a successful order placement or on explicit user request.
   *
   * @idea
   * - Finds all cart rows for `payload.userId`.
   * - If any exist, performs a `deleteMany` to remove them all in one query.
   *
   * @usage Called by `CartController.deleteAllCartItemByUserId`.
   *
   * @dataflow payload.userId -> Cart.findMany (existence check) -> Cart.deleteMany.
   *
   * @dependencies Prisma model: `Cart`.
   *
   * @notes
   * - Does NOT cascade-delete related `CartServiceFeature` or `CartProductService` rows,
   *   which could leave orphans if service carts exist.
   * - The `findMany` existence check is redundant since `deleteMany` safely handles zero rows.
   * - `req` parameter is accepted but not used.
   *
   * @param {any} payload - `{ userId }`.
   * @param {any} req - Express request (unused).
   * @returns {Promise<{status: boolean, message: string, data: any[], error?: string}>}
   */
  async deleteAllCartItemByUserId(payload: any, req: any) {
    try {
      const userId = payload?.userId;

      let existAllCartItemCount = await this.prisma.cart.count({
        where: { userId: userId },
      });

      if (existAllCartItemCount === 0) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
        };
      }

      let deleteAllCartItem = await this.prisma.cart.deleteMany({
        where: { userId: userId },
      });

      return {
        status: true,
        message: 'All Deleted Successfully',
        data: [],
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in deleteAllCartItemByUserId',
        error: getErrorMessage(error),
      };
    }
  }

  // ----- ***** RFQ CART BEGINS ***** -----

  /**
   * @method updateRfqCart
   * @description Creates or updates an RFQ (Request For Quotation) cart item. Supports
   * offer-price negotiation fields unique to the B2B quoting workflow.
   *
   * @intent Enable B2B buyers to build a quotation request cart with custom pricing,
   * quantity, and notes before submitting the RFQ to suppliers.
   *
   * @idea
   * - Resolves the Product by `payload.productId`.
   * - Builds a userId/deviceId WHERE clause and looks for an existing non-deleted `RFQCart` row.
   * - If found:
   *     - `quantity > 0` => update quantity, offerPrice, note, offerPriceFrom, offerPriceTo.
   *     - `quantity <= 0` => hard-delete the row.
   * - If not found, creates a new `RFQCart` row.
   *
   * @usage Called by `CartController.updateRfqCart` (auth) and `CartController.updateRfqCartUnAuth`.
   *
   * @dataflow
   * payload.productId -> Product.findUnique -> RFQCart.findFirst (userId|deviceId + productId)
   * -> branch: update | create | delete.
   *
   * @dependencies Prisma models: `Product`, `RFQCart`.
   *
   * @notes
   * - Uses `product.id` (from the lookup) rather than `payload.productId` directly when
   *   building the WHERE clause, ensuring referential integrity.
   * - Update uses `||` fallback so that omitted fields retain their previous values.
   *
   * @param {any} payload - `{ productId, quantity, offerPrice?, note?, offerPriceFrom?, offerPriceTo?, deviceId? }`.
   * @param {any} req - Express request; `req.user.id` used when present.
   * @returns {Promise<{status: boolean, message: string, data: any[], error?: string}>}
   */
  async updateRfqCart(payload: any, req: any) {
    try {
      const productId = payload?.productId;
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
      });

      let where: Prisma.RFQCartWhereInput = {};
      if (req?.user?.id) {
        where.OR = [{ userId: req.user.id }];
      } else {
        where.OR = [{ deviceId: payload.deviceId }];
      }

      const existingCart = await this.prisma.rFQCart.findFirst({
        where: {
          AND: [where, { productId: product.id }, { deletedAt: null }],
        },
      });

      if (existingCart) {
        if (payload?.quantity > 0) {
          await this.prisma.rFQCart.update({
            where: { id: existingCart.id },
            data: {
              quantity: payload?.quantity || existingCart?.quantity,
              offerPrice: payload?.offerPrice || existingCart?.offerPrice,
              note: payload?.note || existingCart?.note,
              offerPriceFrom:
                payload?.offerPriceFrom || existingCart?.offerPriceFrom,
              offerPriceTo: payload?.offerPriceTo || existingCart?.offerPriceTo,
              productType: payload?.productType || existingCart?.productType || 'SAME',
            },
          });
        } else {
          await this.prisma.rFQCart.delete({
            where: { id: existingCart.id },
          });
        }

        return {
          status: true,
          message: 'Existing Cart Updated',
          data: [],
        };
      } else {
        // new product
        let rfqCartDetail = await this.prisma.rFQCart.create({
          data: {
            userId: req?.user?.id || undefined,
            deviceId: payload?.deviceId || undefined,
            productId: product?.id,
            quantity: payload?.quantity,
            offerPrice: payload?.offerPrice,
            note: payload?.note,
            offerPriceFrom: payload?.offerPriceFrom,
            offerPriceTo: payload?.offerPriceTo,
            productType: payload?.productType || 'SAME',
          },
        });

        return {
          status: true,
          message: 'Cart Created Successfully',
          data: [],
        };
      }
    } catch (error) {
      return {
        status: false,
        message: 'error in updateRfqCart',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method rfqCartlist
   * @description Returns a paginated list of RFQ cart items with related product details
   * and images. Supports both authenticated and guest callers.
   *
   * @intent Power the RFQ cart page, displaying product thumbnails and negotiation data.
   *
   * @idea
   * - Parses `page`/`limit` with defaults (1, 10).
   * - Filters by `userId` or `deviceId`.
   * - Includes `rfqCart_productDetails` -> `productImages` for thumbnail rendering.
   * - Returns both `data` and `totalCount`.
   *
   * @usage Called by `CartController.rfqCartlist` (auth) and `CartController.rfqCartlistUnAuth`.
   *
   * @dataflow (page, limit, req, deviceId) -> RFQCart.findMany + RFQCart.count.
   *
   * @dependencies Prisma models: `RFQCart`, `Product`, `ProductImage`.
   *
   * @notes
   * - Ordered by `id ASC`.
   * - Does not filter by `deletedAt` (unlike the standard cart list), relying on the
   *   RFQCart model's schema to manage soft-deletes if applicable.
   *
   * @param {any} page - Page number string.
   * @param {any} limit - Page size string.
   * @param {any} req - Express request; `req.user.id` used when present.
   * @param {any} deviceId - Fallback device identifier.
   * @returns {Promise<{status: boolean, message: string, data: any[], totalCount: number}>}
   */
  async rfqCartlist(page: any, limit: any, req: any, deviceId: any) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize; // Calculate the offset

      let where: Prisma.RFQCartWhereInput = {};
      if (req?.user?.id) {
        where = { ...where, userId: req?.user?.id };
      } else {
        where = { ...where, deviceId: deviceId };
      }

      let rfqCartResponse = await this.prisma.rFQCart.findMany({
        where,
        // include: {
        //   rfqProductDetails: {
        //     include: {
        //       rfqProductImage: true
        //     }
        //   }
        // },
        include: {
          rfqCart_productDetails: {
            include: {
              productImages: true,
            },
          },
        },
        orderBy: { id: 'asc' },
        skip, // Offset
        take: pageSize, // Limit
      });

      let rfqCartResponseCount = await this.prisma.rFQCart.count({
        where,
      });

      if (!rfqCartResponse) {
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
        data: rfqCartResponse,
        totalCount: rfqCartResponseCount,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in rfqCartlist',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method rfqCartDelete
   * @description Hard-deletes a single RFQ cart item by its primary key.
   *
   * @intent Allow users to remove a specific product from their RFQ quotation cart.
   *
   * @idea Parses the ID, verifies existence via `findUnique`, then performs `rFQCart.delete`.
   *
   * @usage Called by `CartController.rfqCartDelete`.
   *
   * @dataflow rfqCartId -> parseInt -> RFQCart.findUnique -> RFQCart.delete.
   *
   * @dependencies Prisma model: `RFQCart`.
   *
   * @notes
   * - Returns a "Not Found" envelope if the row does not exist.
   * - No ownership check is performed (public endpoint).
   *
   * @param {any} rfqCartId - The RFQ cart row ID (string or number).
   * @returns {Promise<{status: boolean, message: string, data: object, error?: string}>}
   */
  async rfqCartDelete(rfqCartId: any) {
    try {
      const rfqCartID = parseInt(rfqCartId);

      let existCart = await this.prisma.rFQCart.findUnique({
        where: { id: rfqCartID },
      });

      if (!existCart) {
        return {
          status: false,
          message: 'Not Found',
          data: {},
        };
      }

      let deletedCart = await this.prisma.rFQCart.delete({
        where: { id: rfqCartID },
      });

      return {
        status: true,
        message: 'Deleted Successfully',
        data: {},
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in rfqCartDelete',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method updateRfqCartUserIdBydeviceId
   * @description Migrates guest RFQ cart rows from a `deviceId` to the authenticated user's
   * `userId`, then de-duplicates by summing quantities for the same `productId`.
   *
   * @intent Called after login to adopt guest RFQ cart items into the user's account,
   * mirroring the logic of {@link updateUserIdBydeviceId} but for the RFQCart table.
   *
   * @idea
   * 1. `updateMany`: reassign all RFQCart rows with matching `deviceId` to the user's ID.
   * 2. Raw SQL detects `(userId, productId)` groups with duplicates.
   * 3. Keeps the first row per group, sums quantities, deletes surplus rows.
   * 4. Executes all deletes/updates concurrently via `Promise.all`.
   *
   * @usage Called by `CartController.updateRfqCartUserIdBydeviceId`.
   *
   * @dataflow
   * (payload.deviceId, req.user.id) -> RFQCart.updateMany -> raw SQL dedup
   * -> RFQCart.delete (duplicates) + RFQCart.update (merged qty).
   *
   * @dependencies Prisma models: `RFQCart`. Uses `this.prisma.$queryRaw` for duplicate detection.
   *
   * @notes
   * - Marked as "Still Now NOT USED!" -- the logic is implemented but no frontend caller
   *   exercises this endpoint yet.
   * - Same concurrency caveat as `updateUserIdBydeviceId` (no wrapping transaction).
   *
   * @param {any} payload - `{ deviceId }`.
   * @param {any} req - Express request with `req.user`.
   * @returns {Promise<{success: boolean, message: string, data: any[], error?: string}>}
   */
  // Still Now NOT USED!
  async updateRfqCartUserIdBydeviceId(payload: any, req: any) {
    let userId, deviceId, returnValue;
    try {
      if (req?.user?.id && payload?.deviceId) {
        // Handle both user object structures (from User model or custom object)
        userId = req.user.id || req.user.userId;
        deviceId = payload.deviceId;
        returnValue = await this.prisma.rFQCart.updateMany({
          where: {
            deviceId,
          },
          data: {
            userId,
            deviceId: null,
          },
        });
      }

      // finding duplicateCartItem
      interface DuplicateRfqCartItem {
        userId: number;
        productId: number;
      }

      const duplicateRfqCartItemsQueryResult: DuplicateRfqCartItem[] =
        await this.prisma.$queryRaw`
        SELECT "userId", "productId"
        FROM "RFQCart"
        WHERE "userId" = ${userId}
        GROUP BY "userId", "productId"
        HAVING COUNT("productId") > 1;
      `;

      const duplicateRfqProductIds = duplicateRfqCartItemsQueryResult.map(
        (item) => item.productId,
      );

      const duplicateRfqCartItems = await this.prisma.rFQCart.findMany({
        where: {
          userId: userId,
          productId: {
            in: duplicateRfqProductIds,
          },
        },
      });

      const groupedItems: {
        [productId: number]: { id: number; quantity: number };
      } = {};
      const promiseArr: Promise<any>[] = [];

      for (const item of duplicateRfqCartItems) {
        const productId = item.productId;
        if (!groupedItems[productId]) {
          groupedItems[productId] = { id: item.id, quantity: item.quantity };
        } else {
          groupedItems[productId].quantity += item.quantity;
          promiseArr.push(this.prisma.rFQCart.delete({ where: { id: item.id } }));
        }
      }

      for (const productId in groupedItems) {
        const item = groupedItems[productId];
        promiseArr.push(
          this.prisma.rFQCart.update({
            where: { id: item.id },
            data: { quantity: item.quantity },
          }),
        );
      }

      await Promise.all(promiseArr);

      return {
        success: true,
        message: 'Cart items updated successfully',
        data: [],
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in updateRfqCartUserIdBydeviceId',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method deleteAllRfqCartItemByUserId
   * @description Placeholder for bulk-deleting all RFQ cart items for a given user.
   *
   * @intent Clear the entire RFQ cart after a quotation request is submitted.
   *
   * @idea Intended to mirror {@link deleteAllCartItemByUserId} but for the `RFQCart` model.
   *
   * @usage Called by `CartController.deleteAllRfqCartItemByUserId` -- currently a no-op.
   *
   * @dataflow N/A -- method body is empty.
   *
   * @dependencies None (stub).
   *
   * @notes **Stub** -- the try/catch body is empty. This method currently returns `undefined`.
   *
   * @param {any} payload - Expected `{ userId }` (not yet consumed).
   * @param {any} req - Express request (not yet consumed).
   * @returns {Promise<void>}
   */
  async deleteAllRfqCartItemByUserId(payload: any, req: any) {
    try {
    } catch (error) {}
  }

  // ----- ***** RFQ CART ENDS ***** -----

  // ----------------------------------------------- Factories Cart ---------------------------------------------------

  /**
   * @method addUpdateFactoriesCart
   * @description Creates or updates a Factories cart item for custom factory-direct orders.
   * Supports both standard products and customise-products.
   *
   * @intent Enable the Factories marketplace flow where buyers configure custom products
   * and add them to a dedicated factories cart.
   *
   * @idea
   * - Requires at least one of `productId` or `customizeProductId`.
   * - Builds a userId/deviceId WHERE clause and checks for an existing non-deleted row
   *   matching both `productId` AND `customizeProductId`.
   * - If found:
   *     - `quantity > 0` => update the quantity.
   *     - otherwise => hard-delete the row.
   * - If not found, creates a new `FactoriesCart` row (quantity defaults to 1).
   *
   * @usage Called by `CartController.updateFactoriesCart`.
   *
   * @dataflow
   * payload -> FactoriesCart.findFirst (userId|deviceId + productId + customizeProductId)
   * -> branch: update | create | delete.
   *
   * @dependencies Prisma model: `FactoriesCart`.
   *
   * @notes
   * - Supports both `req.user.id` and `req.user.userId` for JWT payload compatibility.
   * - `deletedAt: null` filter applied to avoid matching soft-deleted rows.
   *
   * @param {any} payload - `{ productId?, customizeProductId?, quantity, deviceId? }`.
   * @param {any} req - Express request with `req.user`.
   * @returns {Promise<{status: boolean, message: string, data: any, error?: string}>}
   */
  async addUpdateFactoriesCart(payload: any, req: any) {
    try {
      const { productId, customizeProductId, quantity, deviceId } = payload;
      // Handle both user object structures (from User model or custom object)
      const userId = req?.user?.id || req?.user?.userId;

      if (!productId && !customizeProductId) {
        return {
          status: false,
          message: 'Either productId or customizeProductId is required',
        };
      }

      // Prepare dynamic where condition based on user/device
      let where: Prisma.FactoriesCartWhereInput = {};
      if (userId) {
        where.OR = [{ userId }];
      } else if (deviceId) {
        where.OR = [{ deviceId }];
      }

      // Check if cart item exists
      const existingCart = await this.prisma.factoriesCart.findFirst({
        where: {
          AND: [
            where,
            { deletedAt: null },
            { productId },
            { customizeProductId },
          ],
        },
      });

      if (existingCart) {

        if (quantity > 0) {
          // Update existing cart item
          await this.prisma.factoriesCart.update({
            where: { id: existingCart.id },
            data: { quantity },
          });

          return {
            status: true,
            message: 'Factories Cart Updated Successfully',
            data: [],
          };
        } else {
          // Remove item if quantity is 0 or not provided
          await this.prisma.factoriesCart.delete({ where: { id: existingCart.id } });

          return {
            status: true,
            message: 'Factories Cart Item Removed',
            data: [],
          };
        }
      } else {
        // Create new cart item
        const newCart = await this.prisma.factoriesCart.create({
          data: {
            userId: userId || undefined,
            deviceId: deviceId || undefined,
            productId: productId || undefined,
            customizeProductId: customizeProductId || undefined,
            quantity: quantity > 0 ? quantity : 1, // Default to 1 if not provided
          },
        });

        return {
          status: true,
          message: 'Factories Cart Created Successfully',
          data: newCart,
        };
      }
    } catch (error) {
      return {
        status: false,
        message: 'Error in addUpdateFactoriesCart API',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAllFactoriesCart
   * @description Returns a paginated list of Factories cart items with nested product and
   * customise-product details (including images), filtered to ACTIVE status.
   *
   * @intent Display the Factories cart page with thumbnails and product/customisation info.
   *
   * @idea
   * - Parses `page`/`limit` with defaults (1, 10).
   * - Filters by `deletedAt: null` and `userId` or `deviceId`.
   * - Includes:
   *     - `customizeProductDetail` (where status ACTIVE) -> `customizeProductImageDetail` (ACTIVE).
   *     - `productDetails` (where status ACTIVE) -> `productImages` (ACTIVE).
   * - Returns `totalCount` for pagination.
   *
   * @usage Called by `CartController.getAllFactoriesCart`.
   *
   * @dataflow (page, limit, req, deviceId) -> FactoriesCart.findMany + FactoriesCart.count.
   *
   * @dependencies Prisma models: `FactoriesCart`, `CustomizeProduct`, `CustomizeProductImage`,
   * `Product`, `ProductImage`.
   *
   * @notes
   * - Nested includes filter by `status: 'ACTIVE'`, hiding soft-deleted or draft entities.
   * - Ordered by `id ASC`.
   *
   * @param {any} page - Page number string.
   * @param {any} limit - Page size string.
   * @param {any} req - Express request; `req.user.id` used when present.
   * @param {any} deviceId - Fallback device identifier.
   * @returns {Promise<{status: boolean, message: string, data: any[], totalCount: number}>}
   */
  async getAllFactoriesCart(page: any, limit: any, req: any, deviceId: any) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize; // Calculate the offset

      let where: Prisma.FactoriesCartWhereInput = { deletedAt: null };

      if (req?.user?.id) {
        where = { ...where, userId: req?.user?.id };
      } else {
        where = { ...where, deviceId: deviceId };
      }

      let cartResponse = await this.prisma.factoriesCart.findMany({
        where: where,
        include: {
          customizeProductDetail: {
            where: { status: 'ACTIVE' },
            include: {
              customizeProductImageDetail: {
                where: { status: 'ACTIVE' },
              },
            },
          },
          productDetails: {
            where: { status: 'ACTIVE' },
            include: {
              productImages: {
                where: { status: 'ACTIVE' },
              },
            },
          },
        },
        orderBy: { id: 'asc' },
        skip, // Offset
        take: pageSize, // Limit
      });

      let cartResponseCount = await this.prisma.factoriesCart.count({
        where,
      });

      if (!cartResponse) {
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
        data: cartResponse,
        totalCount: cartResponseCount,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in getAllFactoriesCart',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method deleteFactoriesCart
   * @description Deletes a Factories cart item along with its associated customise-product
   * record and images. A three-step cascading hard-delete.
   *
   * @intent Remove a factory-direct order item and its custom product data in one operation.
   *
   * @idea
   * 1. Validate `factoriesCartId` and look up the row.
   * 2. Delete all `CustomizeProductImage` rows referencing the `customizeProductId`.
   * 3. Delete the `CustomizeProduct` itself.
   * 4. Delete the `FactoriesCart` row.
   *
   * @usage Called by `CartController.deleteFactoriesCart`.
   *
   * @dataflow
   * factoriesCartId -> FactoriesCart.findUnique -> CustomizeProductImage.deleteMany
   * -> CustomizeProduct.delete -> FactoriesCart.delete.
   *
   * @dependencies Prisma models: `FactoriesCart`, `CustomizeProduct`, `CustomizeProductImage`.
   *
   * @notes
   * - If the factories cart row has no `customizeProductId`, the CustomizeProduct delete
   *   will throw; the catch block handles this and returns an error envelope.
   * - Not wrapped in a Prisma transaction.
   *
   * @param {any} factoriesCartId - The FactoriesCart row ID (string or number).
   * @returns {Promise<{status: boolean, message: string, data: object, error?: string}>}
   */
  async deleteFactoriesCart(factoriesCartId: any) {
    try {
      if (!factoriesCartId) {
        return {
          status: false,
          message: 'factoriesCartId is required',
        };
      }
      const factoriesCartID = parseInt(factoriesCartId);

      let existFactoriesCart = await this.prisma.factoriesCart.findUnique({
        where: { id: factoriesCartID },
      });

      if (!existFactoriesCart) {
        return {
          status: false,
          message: 'Not Found',
          data: {},
        };
      }

      const customizeProductId = existFactoriesCart.customizeProductId;

      let deleteCustomizeProductImages =
        await this.prisma.customizeProductImage.deleteMany({
          where: {
            customizeProductId: customizeProductId,
          },
        });

      let deleteCustomizeProduct = await this.prisma.customizeProduct.delete({
        where: {
          id: customizeProductId,
        },
      });

      let deletedFactoriesCart = await this.prisma.factoriesCart.delete({
        where: { id: factoriesCartID },
      });

      return {
        status: true,
        message: 'Deleted Successfully',
        data: {},
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in deleteFactoriesCart',
        error: getErrorMessage(error),
      };
    }
  }
  /**
   * @method updateCartService
   * @description Adds or updates a standalone service in the cart (no product link).
   * Uses the validated {@link AddCartServiceDto} for input.
   *
   * @intent Allow users to purchase marketplace services independently by selecting
   * specific features with quantities and optional booking date-times.
   *
   * @idea
   * - Searches for an existing Cart row with `cartType` implicitly 'SERVICE' (matched by
   *   `serviceId + userId` and `cartProductServices: { none: {} }` -- i.e., no linked products).
   * - If **no** existing row: creates a new Cart with `cartType='SERVICE'` and bulk-creates
   *   `CartServiceFeature` rows from `dto.features`.
   * - If an existing row is found: iterates over each feature:
   *     - New features are created.
   *     - Existing features (matched by `serviceFeatureId`) have their `quantity` and
   *       `bookingDateTime` updated.
   *
   * @usage Called by `CartController.updateService`.
   *
   * @dataflow
   * dto -> Cart.findFirst (serviceId + userId, no products linked)
   * -> branch: Cart.create + CartServiceFeature.createMany | CartServiceFeature upsert loop.
   *
   * @dependencies Prisma models: `Cart`, `CartServiceFeature`.
   * @dependencies DTO: {@link AddCartServiceDto}.
   *
   * @notes
   * - The `cartProductServices: { none: {} }` filter distinguishes standalone service carts
   *   from those linked to products via `updateCartServiceWithProduct`.
   *
   * @param {AddCartServiceDto} dto - Validated DTO with `serviceId` and `features[]`.
   * @param {number} userId - The authenticated user's ID.
   * @returns {Promise<{success: boolean, message: string, data: any, error?: string}>}
   */
  async updateCartService(dto: AddCartServiceDto, userId: number) {
    try {
      const { serviceId, features } = dto;
      const existInCart = await this.prisma.cart.findFirst({
        where: {
          serviceId,
          userId,
          cartProductServices: {
            none: {},
          },
        },
      });
      if (!existInCart) {
        const cart = await this.prisma.cart.create({
          data: {
            userId,
            serviceId,
            cartType: 'SERVICE',
            quantity: 1,
            cartServiceFeatures: {
              createMany: {
                data: features,
              },
            },
          },
        });
        return {
          success: true,
          message: 'service added to cart',
          data: cart,
        };
      } else {
        const response = await Promise.all(
          features.map(async (feature) => {
            const existingCartFeature =
              await this.prisma.cartServiceFeature.findFirst({
                where: {
                  cartId: existInCart.id,
                  serviceFeatureId: feature.serviceFeatureId,
                },
              });

            if (!existingCartFeature) {
              return await this.prisma.cartServiceFeature.create({
                data: {
                  cartId: existInCart.id,
                  ...feature,
                },
              });
            } else {
              return await this.prisma.cartServiceFeature.update({
                where: {
                  id: existingCartFeature.id,
                },
                data: {
                  quantity: feature.quantity,
                  bookingDateTime: feature.bookingDateTime,
                },
              });
            }
          }),
        );
        return {
          success: true,
          message: 'service added to cart',
          data: response,
        };
      }
    } catch (error) {
      return {
        status: false,
        message: 'error in update service cart',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method updateServiceProduct
   * @description Creates a new product cart entry that is linked to an existing service
   * cart entry, using a Prisma interactive transaction for atomicity.
   *
   * @intent Allow users to add a related product to a service already in the cart,
   * forming a service-product bundle (e.g., a product + installation service).
   *
   * @idea
   * - Inside a `this.prisma.$transaction`:
   *   1. Creates a Cart row for the product (`cartType='DEFAULT'`) with `productId`,
   *      `productPriceId`, `quantity`, and optional `object` (variant JSON).
   *   2. Creates a `CartProductService` join row linking `dto.cartId` (service cart)
   *      to the newly created product cart via `relatedCartId`.
   * - Returns the created product cart row.
   *
   * @usage Called by `CartController.updateServiceProduct`.
   *
   * @dataflow
   * dto -> this.prisma.$transaction: Cart.create (product) + CartProductService.create (link).
   *
   * @dependencies Prisma models: `Cart`, `CartProductService`.
   * @dependencies DTO: {@link AddCartServiceProdDto}.
   *
   * @notes
   * - The DTO enforces `cartType='SERVICE'` and `relatedCartType='PRODUCT'` via `@IsIn`
   *   validators, ensuring the link direction is correct.
   * - The transaction guarantees both the cart row and the join record are created atomically.
   *
   * @param {AddCartServiceProdDto} dto - Validated DTO with service/product IDs and quantities.
   * @param {number} userId - The authenticated user's ID.
   * @returns {Promise<{success: boolean, message: string, data: any, error?: string}>}
   */
  async updateServiceProduct(dto: AddCartServiceProdDto, userId: number) {
    try {
      const {
        cartId,
        serviceId,
        productPriceId,
        productId,
        object,
        cartType,
        relatedCartType,
        quantity,
      } = dto;

      const response = await this.prisma.$transaction(async (tx) => {
        const cart = await tx.cart.create({
          data: {
            userId,
            productId,
            productPriceId,
            cartType: 'DEFAULT',
            quantity,
            object,
          },
        });

        await tx.cartProductService.create({
          data: {
            productId,
            cartId,
            cartType,
            relatedCartId: cart.id,
            relatedCartType,
            serviceId,
          },
        });
        return cart;
      });

      return {
        success: true,
        message: 'product related to service added to cart',
        data: response,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in update product related to service cart',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method deleteCartService
   * @description Deletes a service from the cart. Supports two operation modes:
   *
   * 1. **Partial deletion** -- when `serviceFeatureIds` or `serviceProdIds` are provided,
   *    only those specific features and product-service links are removed.
   * 2. **Full deletion** -- when no IDs are provided, the entire service cart row plus all
   *    child features, product links, and related product carts are removed atomically via
   *    a Prisma `$transaction`.
   *
   * @intent Allow fine-grained removal of individual service features / linked products
   * or wholesale deletion of a service cart entry with all its relationships.
   *
   * @idea
   * - Fetches the Cart row with `findUniqueOrThrow` scoped to `userId` for ownership.
   * - **Partial mode**: deletes specified CartServiceFeature rows and CartProductService
   *   rows (plus their related product Cart rows) individually.
   * - **Full mode**: collects all child IDs, then performs a four-operation `$transaction`:
   *   delete features -> delete product-service links -> delete related product carts
   *   -> delete the main service cart.
   *
   * @usage Called by `CartController.deleteCartService`.
   *
   * @dataflow
   * (cartId, userId) -> Cart.findUniqueOrThrow (with includes)
   * -> branch: partial delete (deleteMany by IDs) | full $transaction cascade.
   *
   * @dependencies Prisma models: `Cart`, `CartServiceFeature`, `CartProductService`.
   *
   * @notes
   * - Ownership is enforced by including `userId` in the `findUniqueOrThrow` WHERE clause.
   *   If the row does not belong to the caller, Prisma throws and the catch returns an error.
   * - Both partial and full modes return `status: false` in the response envelope (appears
   *   intentional for the frontend to distinguish deletion responses from success responses).
   *
   * @param {number} cartId - Primary key of the service Cart row.
   * @param {number} userId - Authenticated user's ID for ownership verification.
   * @param {number[]} serviceFeatureIds - Optional array of CartServiceFeature IDs to remove.
   * @param {number[]} serviceProdIds - Optional array of CartProductService IDs to remove.
   * @returns {Promise<{status: boolean, message: string, data: any, error?: string}>}
   */
  async deleteCartService(
    cartId: number,
    userId: number,
    serviceFeatureIds: number[],
    serviceProdIds: number[],
  ) {
    try {
      const cart = await this.prisma.cart.findUniqueOrThrow({
        where: {
          id: cartId,
          userId,
        },
        include: {
          cartServiceFeatures: true,
          cartProductServices: true,
        },
      });
      if (serviceFeatureIds.length || serviceProdIds.length) {
        const deletedFeatures = await this.prisma.cartServiceFeature.deleteMany({
          where: {
            id: { in: serviceFeatureIds },
            cartId,
          },
        });

        const deletedProdCartIds: number[] = [];
        cart.cartProductServices.forEach((prod) => {
          if (prod.relatedCartId) {
            deletedProdCartIds.push(prod.relatedCartId);
          }
        });
        const deletedProds = await this.prisma.$transaction([
          this.prisma.cart.deleteMany({
            where: {
              id: { in: deletedProdCartIds },
            },
          }),
          this.prisma.cartProductService.deleteMany({
            where: {
              id: { in: serviceProdIds },
            },
          }),
        ]);
        return {
          status: false,
          message: 'service features & products deleted from cart',
          data: {
            features: deletedFeatures,
            products: deletedProds,
          },
        };
      }
      const cartServiceFeatureIds = cart.cartServiceFeatures.map(
        (serviceFeature) => serviceFeature.id,
      );

      const deletedProdCartIds: number[] = [];
      cart.cartProductServices.forEach((prod) => {
        if (prod.relatedCartId) {
          deletedProdCartIds.push(prod.relatedCartId);
        }
      });

      const cartServiceProdIds = cart.cartProductServices.map(
        (serviceProd) => serviceProd.id,
      );

      const deletedCart = await this.prisma.$transaction([
        this.prisma.cartServiceFeature.deleteMany({
          where: {
            id: { in: cartServiceFeatureIds },
          },
        }),
        this.prisma.cartProductService.deleteMany({
          where: { id: { in: cartServiceProdIds } },
        }),
        this.prisma.cart.deleteMany({
          where: {
            id: { in: deletedProdCartIds },
          },
        }),
        this.prisma.cart.delete({ where: { id: cartId } }),
      ]);
      return {
        status: false,
        message: 'service deleted from cart',
        data: deletedCart,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in delete service cart',
        error: getErrorMessage(error),
      };
    }
  }

  async getCartRecommendations(req: any, payload: { productIds?: string; limit?: number }) {
    try {
      const userId = req?.user?.id;
      const deviceId = req?.query?.deviceId;
      const productIds = payload?.productIds ? payload.productIds.split(',').map(Number) : [];
      const limit = payload?.limit || 20;

      // Get products from cart
      let where: Prisma.CartWhereInput = { deletedAt: null };
      if (userId) {
        where = { ...where, userId };
      } else if (deviceId) {
        where = { ...where, deviceId };
      }

      const cartItems = await this.prisma.cart.findMany({
        where,
        include: {
          productPriceDetails: {
            include: {
              productPrice_product: {
                include: {
                  productTags: {
                    include: { productTagsTag: true },
                  },
                  brand: true,
                  category: true,
                },
              },
            },
          },
        },
      });

      // Extract data from cart
      const cartProductIds = new Set<number>();
      const categoryIds = new Set<number>();
      const tagIds = new Set<number>();
      const brandIds = new Set<number>();

      cartItems.forEach((item) => {
        if (item.productId) {
          cartProductIds.add(item.productId);
          const product = item.productPriceDetails?.productPrice_product;
          if (product) {
            if (product.categoryId) categoryIds.add(product.categoryId);
            if (product.brandId) brandIds.add(product.brandId);
            product.productTags?.forEach((pt: any) => {
              if (pt.productTagsTag?.id) tagIds.add(pt.productTagsTag.id);
            });
          }
        }
      });

      const recommendations: any[] = [];
      const seenProductIds = new Set<number>(Array.from(cartProductIds));

      // 1. User's most viewed products
      if (userId || deviceId) {
        const whereClause: any = {
          productId: { notIn: Array.from(cartProductIds) },
          deletedAt: null,
          viewCount: { gt: 0 },
        };

        if (userId) {
          whereClause.userId = userId;
        } else if (deviceId) {
          whereClause.deviceId = deviceId;
        }

        const userViewedProducts = await this.prisma.productView.findMany({
          where: whereClause,
          include: {
            product: {
              include: {
                product_productPrice: {
                  where: { status: 'ACTIVE' },
                  include: { productPrice_productSellerImage: true },
                  take: 1,
                },
                productImages: { where: { status: 'ACTIVE' }, take: 1 },
                product_productShortDescription: { where: { status: 'ACTIVE' }, take: 1 },
                productReview: true,
                product_wishlist: userId ? { where: { userId } } : false,
                category: {
                  include: { category_categoryIdDetail: true },
                },
                brand: true,
              },
            },
          },
          orderBy: [
            { viewCount: 'desc' },
            { lastViewedAt: 'desc' },
          ],
          take: Math.floor(limit * 0.3),
        });

        userViewedProducts.forEach((pv) => {
          if (pv.product && pv.product.status === 'ACTIVE' && !pv.product.deletedAt && !seenProductIds.has(pv.product.id)) {
            recommendations.push(pv.product);
            seenProductIds.add(pv.product.id);
          }
        });
      }

      // 2. Most clicked products (user-specific if available)
      if (userId || deviceId) {
        const whereClause: any = {
          productId: { notIn: Array.from(seenProductIds) },
          deletedAt: null,
        };

        if (userId) {
          whereClause.userId = userId;
        } else if (deviceId) {
          whereClause.deviceId = deviceId;
        }

        const clickedProducts = await this.prisma.productClick.groupBy({
          by: ['productId'],
          where: whereClause,
          _count: { productId: true },
          orderBy: { _count: { productId: 'desc' } },
          take: Math.floor(limit * 0.2),
        });

        if (clickedProducts.length > 0) {
          const clickedProductIds = clickedProducts.map((cp) => cp.productId);
          const products = await this.prisma.product.findMany({
            where: {
              id: { in: clickedProductIds },
              status: 'ACTIVE',
              deletedAt: null,
            },
            include: {
              product_productPrice: {
                where: { status: 'ACTIVE' },
                include: { productPrice_productSellerImage: true },
                take: 1,
              },
                productImages: { where: { status: 'ACTIVE' }, take: 1 },
                product_productShortDescription: { where: { status: 'ACTIVE' }, take: 1 },
                productReview: true,
                product_wishlist: userId ? { where: { userId } } : false,
              category: {
                include: { category_categoryIdDetail: true },
              },
              brand: true,
            },
          });

          products.forEach((product) => {
            if (!seenProductIds.has(product.id)) {
              recommendations.push(product);
              seenProductIds.add(product.id);
            }
          });
        }
      }

      // 3. Related products by category, tags, and brand
      if (categoryIds.size > 0 || tagIds.size > 0 || brandIds.size > 0) {
        const relatedProducts = await this.prisma.product.findMany({
          where: {
            id: { notIn: Array.from(seenProductIds) },
            status: 'ACTIVE',
            deletedAt: null,
            OR: [
              ...(categoryIds.size > 0 ? [{ categoryId: { in: Array.from(categoryIds) } }] : []),
              ...(brandIds.size > 0 ? [{ brandId: { in: Array.from(brandIds) } }] : []),
              ...(tagIds.size > 0
                ? [
                    {
                      productTags: {
                        some: {
                          tagId: { in: Array.from(tagIds) },
                          status: Status.ACTIVE,
                        },
                      },
                    },
                  ]
                : []),
            ],
          },
          include: {
            product_productPrice: {
              where: { status: 'ACTIVE' },
              include: { productPrice_productSellerImage: true },
              take: 1,
            },
                productImages: { where: { status: 'ACTIVE' }, take: 1 },
                product_productShortDescription: { where: { status: 'ACTIVE' }, take: 1 },
                productReview: true,
                product_wishlist: userId ? { where: { userId } } : false,
            category: {
              include: { category_categoryIdDetail: true },
            },
            brand: true,
          },
          orderBy: { productViewCount: 'desc' },
          take: Math.floor(limit * 0.3),
        });

        relatedProducts.forEach((product) => {
          if (!seenProductIds.has(product.id)) {
            recommendations.push(product);
            seenProductIds.add(product.id);
          }
        });
      }

      // 4. Most searched products (from search history)
      if (userId || deviceId) {
        const whereClause: any = {
          clicked: true,
          productId: { not: null, notIn: Array.from(seenProductIds) },
          deletedAt: null,
        };

        if (userId) {
          whereClause.userId = userId;
        } else if (deviceId) {
          whereClause.deviceId = deviceId;
        }

        const searchedProducts = await this.prisma.productSearch.groupBy({
          by: ['productId'],
          where: whereClause,
          _count: { productId: true },
          orderBy: { _count: { productId: 'desc' } },
          take: Math.floor(limit * 0.1),
        });

        if (searchedProducts.length > 0) {
          const searchedProductIds = searchedProducts
            .map((sp) => sp.productId)
            .filter((id): id is number => id !== null);

          const products = await this.prisma.product.findMany({
            where: {
              id: { in: searchedProductIds },
              status: 'ACTIVE',
              deletedAt: null,
            },
            include: {
              product_productPrice: {
                where: { status: 'ACTIVE' },
                include: { productPrice_productSellerImage: true },
                take: 1,
              },
                productImages: { where: { status: 'ACTIVE' }, take: 1 },
                product_productShortDescription: { where: { status: 'ACTIVE' }, take: 1 },
                productReview: true,
                product_wishlist: userId ? { where: { userId } } : false,
              category: {
                include: { category_categoryIdDetail: true },
              },
              brand: true,
            },
          });

          products.forEach((product) => {
            if (!seenProductIds.has(product.id)) {
              recommendations.push(product);
              seenProductIds.add(product.id);
            }
          });
        }
      }

      // 5. Most viewed products globally (fallback)
      if (recommendations.length < limit) {
        const mostViewedProducts = await this.prisma.product.findMany({
          where: {
            id: { notIn: Array.from(seenProductIds) },
            status: 'ACTIVE',
            deletedAt: null,
            productViewCount: { gt: 0 },
          },
          include: {
            product_productPrice: {
              where: { status: 'ACTIVE' },
              include: { productPrice_productSellerImage: true },
              take: 1,
            },
                productImages: { where: { status: 'ACTIVE' }, take: 1 },
                product_productShortDescription: { where: { status: 'ACTIVE' }, take: 1 },
                productReview: true,
                product_wishlist: userId ? { where: { userId } } : false,
            category: {
              include: { category_categoryIdDetail: true },
            },
            brand: true,
          },
          orderBy: { productViewCount: 'desc' },
          take: limit - recommendations.length,
        });

        recommendations.push(...mostViewedProducts);
      }

      // Remove duplicates and limit
      const uniqueProducts = new Map<number, any>();
      recommendations.forEach((product) => {
        if (!uniqueProducts.has(product.id) && !cartProductIds.has(product.id)) {
          uniqueProducts.set(product.id, product);
        }
      });

      const finalRecommendations = Array.from(uniqueProducts.values()).slice(0, limit);

      return {
        status: true,
        message: 'Recommendations fetched successfully',
        data: finalRecommendations,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in getCartRecommendations',
        error: getErrorMessage(error),
      };
    }
  }
}
