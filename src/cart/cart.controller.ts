/**
 * @file cart.controller.ts
 * @description REST controller for every cart-related HTTP endpoint in the Ultrasooq marketplace.
 *
 * Handles four distinct cart domains:
 * 1. **Standard Product Cart** -- add, update, list, delete product items.
 * 2. **RFQ Cart** -- request-for-quotation flow with offer pricing.
 * 3. **Factories Cart** -- customisable product orders directed at factory suppliers.
 * 4. **Service Cart** -- standalone service items with feature line-items and linked products.
 *
 * Many endpoints exist in paired form (authenticated + unauthenticated) so that guest users
 * identified only by a `deviceId` can maintain a cart before logging in.
 *
 * @module CartController
 *
 * @dependencies
 * - {@link CartService} - Injected service containing all business / Prisma logic.
 * - {@link AuthGuard} - JWT-based guard applied to endpoints that require authentication.
 * - {@link AddCartServiceDto} - Validated DTO for adding a service to the cart.
 * - {@link AddCartServiceProdDto} - Validated DTO for linking a product to a service cart entry.
 * - {@link GetUser} - Custom parameter decorator that extracts user fields from the JWT payload.
 *
 * @notes
 * - Routes under `/cart` are prefixed by the `@Controller('cart')` decorator.
 * - All service methods return a `{ status, message, data }` response envelope.
 * - Unauthenticated ("UnAuth") routes delegate to the same service method as their
 *   authenticated counterpart; the service checks for `req.user` internally.
 */
import {
  Controller,
  Patch,
  UseGuards,
  Request,
  Body,
  Get,
  Query,
  Delete,
  Post,
  Param,
  ParseIntPipe,
  DefaultValuePipe,
  ParseArrayPipe,
} from '@nestjs/common';
import { AuthGuard } from 'src/guards/AuthGuard';
import { CartService } from './cart.service';
import { AddCartServiceDto, AddCartServiceProdDto } from './dto/cart.dto';
import { GetUser } from 'src/user/decorator/getUser.decorator';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

/**
 * @class CartController
 * @description Exposes all `/cart/*` REST endpoints. Delegates every request to
 * {@link CartService} after optional JWT authentication via {@link AuthGuard}.
 *
 * @idea Thin controller layer -- no business logic resides here; every handler is a
 * one-liner delegation to the service, keeping the controller easy to read and test.
 *
 * @usage Registered by {@link CartModule}. Consumers hit these routes via the API gateway.
 */
@ApiTags('cart')
@ApiBearerAuth('JWT-auth')
@Controller('cart')
export class CartController {
  /**
   * @constructor
   * @description Injects the CartService singleton provided by CartModule.
   * @param {CartService} cartService - The service handling all cart business logic.
   */
  constructor(private readonly cartService: CartService) {}

  /**
   * @method addToCart
   * @description Adds a product to the authenticated user's cart (product detail page flow).
   *
   * @intent Provide an "Add to Cart" action on the product detail page that accumulates
   *         quantity onto an existing cart row or creates a new one.
   * @idea Unlike {@link update}, this method *adds* the incoming quantity to any existing
   *       cart quantity rather than replacing it, matching the product-detail UX.
   * @usage `PATCH /cart/addToCart` with AuthGuard.
   * @dataflow Client -> AuthGuard (JWT) -> controller -> CartService.addToCart -> Prisma Cart table.
   * @dependencies {@link CartService.addToCart}
   * @notes Requires a valid JWT; guest users should use the standard update flow with deviceId.
   *
   * @param {any} req - Express request with `req.user` populated by AuthGuard.
   * @param {any} payload - Body containing `productPriceId`, `quantity`, optional `deviceId`.
   * @returns {Promise<{status: boolean, message: string, data: any}>} Standard response envelope.
   */
  @UseGuards(AuthGuard)
  @Patch('/addToCart')
  addToCart(@Request() req, @Body() payload: any) {
    return this.cartService.addToCart(payload, req);
  }

  /**
   * @method update
   * @description Updates a cart item's quantity for an authenticated user, or creates a new
   *              cart row if the product/price combination does not yet exist.
   *
   * @intent Allow logged-in users to set an absolute quantity or remove items from the cart.
   * @idea Quantity of -1 is a special sentinel that means "increment by 1", while 0 means
   *       "delete the row". Any positive value replaces the existing quantity outright.
   * @usage `PATCH /cart/update` with AuthGuard.
   * @dataflow Client -> AuthGuard (JWT) -> controller -> CartService.update -> Prisma Cart table.
   * @dependencies {@link CartService.update}
   * @notes Shares the same service method as {@link updateUnAuth} but the presence of
   *        `req.user` changes the Prisma WHERE clause from deviceId to userId.
   *
   * @param {any} req - Express request; `req.user.id` used to scope the cart.
   * @param {any} payload - Body with `productPriceId`, `quantity`, optional `deviceId`,
   *        `sharedLinkId`, `productVariant`.
   * @returns {Promise<{status: boolean, message: string, data: any}>} Standard response envelope.
   */
  @UseGuards(AuthGuard)
  @Patch('/update')
  update(@Request() req, @Body() payload: any) {
    return this.cartService.update(payload, req);
  }

  /**
   * @method updateCartServiceWithProduct
   * @description Adds or updates a service in the cart together with a linked product entry,
   *              creating the CartProductService join record.
   *
   * @intent Let users attach a service (with selected features) to a product already in
   *         the cart, or create both the service cart row and the relationship in one call.
   * @idea If a standalone service cart row already exists (no linked products), it reuses
   *       that row and upserts features; otherwise it creates a fresh service cart + link.
   * @usage `PATCH /cart/updateCartServiceWithProduct` with AuthGuard.
   * @dataflow Client -> AuthGuard -> controller -> CartService.updateCartServiceWithProduct
   *          -> Prisma Cart, CartServiceFeature, CartProductService tables.
   * @dependencies {@link CartService.updateCartServiceWithProduct}
   * @notes Payload must include `serviceId`, `features[]`, `cartId` (existing product cart),
   *        `productId`, and optionally `cartType`/`relatedCartType`.
   *
   * @param {any} req - Express request with authenticated user.
   * @param {any} payload - Request body.
   * @returns {Promise<{success: boolean, message: string, data: any}>} Response envelope.
   */
  @UseGuards(AuthGuard)
  @Patch('/updateCartServiceWithProduct')
  updateCartServiceWithProduct(@Request() req, @Body() payload: any) {
    return this.cartService.updateCartServiceWithProduct(payload, req);
  }

  /**
   * @method updateUnAuth
   * @description Unauthenticated variant of {@link update}. Allows guest users (identified
   *              by `deviceId` in the payload) to add/update cart items without logging in.
   *
   * @intent Support guest checkout by persisting cart state against a device fingerprint.
   * @idea Delegates to the same `CartService.update` method; because no AuthGuard is applied,
   *       `req.user` will be undefined and the service falls back to `payload.deviceId`.
   * @usage `PATCH /cart/updateUnAuth` -- no guard.
   * @dataflow Client -> controller (no auth) -> CartService.update -> Prisma Cart table.
   * @dependencies {@link CartService.update}
   * @notes After the user logs in, the frontend calls `updateUserIdBydeviceId` to merge
   *        device-based cart rows into the authenticated user's cart.
   *
   * @param {any} req - Express request (no `req.user`).
   * @param {any} payload - Body with `productPriceId`, `quantity`, `deviceId`.
   * @returns {Promise<{status: boolean, message: string, data: any}>} Standard response envelope.
   */
  @Patch('/updateUnAuth')
  updateUnAuth(@Request() req, @Body() payload: any) {
    return this.cartService.update(payload, req);
  }

  /**
   * @method list
   * @description Returns a paginated list of cart items for the authenticated user.
   *
   * @intent Display the shopping-cart page with all product, service, and feature details
   *         eagerly loaded.
   * @idea The service builds the WHERE clause from `req.user.id` (authenticated) or
   *       `deviceId` (guest), includes related product images and service features.
   * @usage `GET /cart/list?page=1&limit=10&deviceId=...` with AuthGuard.
   * @dataflow Client -> AuthGuard -> controller -> CartService.list -> Prisma Cart (with includes).
   * @dependencies {@link CartService.list}
   * @notes Returns `totalCount` alongside `data` for client-side pagination controls.
   *
   * @param {any} req - Express request with `req.user`.
   * @param {number} page - Page number (1-based, defaults to 1 in service).
   * @param {number} limit - Items per page (defaults to 10 in service).
   * @param {any} deviceId - Fallback device identifier for guest users.
   * @returns {Promise<{status: boolean, message: string, data: any[], totalCount: number}>}
   */
  @UseGuards(AuthGuard)
  @Get('/list')
  list(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('deviceId') deviceId: any,
  ) {
    return this.cartService.list(page, limit, req, deviceId);
  }

  /**
   * @method listUnAuth
   * @description Unauthenticated variant of {@link list}. Returns a paginated cart for
   *              guest users identified by `deviceId`.
   *
   * @intent Let unauthenticated visitors view their device-based cart contents.
   * @idea Same service call as `list`; without AuthGuard, `req.user` is undefined so
   *       the service filters by `deviceId` instead.
   * @usage `GET /cart/listUnAuth?page=1&limit=10&deviceId=...` -- no guard.
   * @dataflow Client -> controller (no auth) -> CartService.list -> Prisma Cart.
   * @dependencies {@link CartService.list}
   * @notes The `deviceId` query parameter is mandatory for this route to return results.
   *
   * @param {any} req - Express request (no `req.user`).
   * @param {number} page - Page number.
   * @param {number} limit - Items per page.
   * @param {any} deviceId - Device fingerprint identifying the guest cart.
   * @returns {Promise<{status: boolean, message: string, data: any[], totalCount: number}>}
   */
  @Get('/listUnAuth')
  listUnAuth(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('deviceId') deviceId: any,
  ) {
    return this.cartService.list(page, limit, req, deviceId);
  }

  /**
   * @method updateUserIdBydeviceId
   * @description Migrates all guest cart rows from a `deviceId` to the authenticated user's
   *              `userId`, merging duplicates by summing quantities.
   *
   * @intent Called immediately after login so that any items the user added as a guest are
   *         preserved under their account.
   * @idea The service reassigns rows, detects duplicate product entries via raw SQL, sums
   *       quantities, and deletes the redundant rows in a single Promise.all batch.
   * @usage `PATCH /cart/updateUserIdBydeviceId` with AuthGuard.
   * @dataflow Client -> AuthGuard -> controller -> CartService.updateUserIdBydeviceId
   *          -> Prisma Cart (updateMany, raw SQL, delete, update).
   * @dependencies {@link CartService.updateUserIdBydeviceId}
   * @notes Payload must include `deviceId`.
   *
   * @param {any} req - Express request with `req.user`.
   * @param {any} payload - Body containing `deviceId`.
   * @returns {Promise<{success: boolean, message: string, data: any[]}>}
   */
  @UseGuards(AuthGuard)
  @Patch('/updateUserIdBydeviceId')
  updateUserIdBydeviceId(@Request() req, @Body() payload: any) {
    return this.cartService.updateUserIdBydeviceId(payload, req);
  }

  /**
   * @method delete
   * @description Deletes a cart item and its associated service relationships by cart ID.
   *
   * @intent Provide a secondary delete endpoint (alias of `/deleteProduct`).
   * @idea Both `/delete` and `/deleteProduct` invoke `CartService.deleteProduct`, which
   *       performs a cascading delete of related services, features, and product-service links.
   * @usage `DELETE /cart/delete?cartId=123` -- no guard (public).
   * @dataflow Client -> controller -> CartService.deleteProduct -> Prisma Cart cascade delete.
   * @dependencies {@link CartService.deleteProduct}
   * @notes No AuthGuard -- any caller with a valid `cartId` can delete. Consider adding
   *        ownership verification in production.
   *
   * @param {number} cartId - The primary key of the cart row to remove.
   * @returns {Promise<{status: boolean, message: string, data: object}>}
   */
  @Delete('/delete')
  delete(@Query('cartId') cartId: number) {
    return this.cartService.deleteProduct(cartId);
  }

  /**
   * @method deleteProduct
   * @description Deletes a product cart row and cascades deletion to any linked services,
   *              service features, and cart-product-service join records.
   *
   * @intent Remove a product from the cart while ensuring all child service data is
   *         cleaned up to avoid orphaned records.
   * @idea Five-step cascade: find related service cart IDs -> delete service features ->
   *       delete CartProductService joins -> delete service carts -> delete the main cart row.
   * @usage `DELETE /cart/deleteProduct?cartId=123` -- no guard (public).
   * @dataflow Client -> controller -> CartService.deleteProduct -> Prisma multi-table cascade.
   * @dependencies {@link CartService.deleteProduct}
   * @notes Hard-deletes rows; does not use the soft-delete / `deletedAt` pattern.
   *
   * @param {number} cartId - The primary key of the cart row to remove.
   * @returns {Promise<{status: boolean, message: string, data: object}>}
   */
  @Delete('/deleteProduct')
  deleteProduct(@Query('cartId') cartId: number) {
    return this.cartService.deleteProduct(cartId);
  }

  /**
   * @method cartCountUnAuth
   * @description Returns the total number of cart items for an unauthenticated (guest) user,
   *              scoped by `deviceId`.
   *
   * @intent Display a badge count on the cart icon in the UI for guest users.
   * @idea Delegates to `CartService.cartCount` which counts non-deleted rows matching
   *       either `userId` or `deviceId`.
   * @usage `POST /cart/cartCountUnAuth` -- no guard.
   * @dataflow Client -> controller (no auth) -> CartService.cartCount -> Prisma Cart.count.
   * @dependencies {@link CartService.cartCount}
   * @notes Payload must include `deviceId` for the count to be meaningful.
   *
   * @param {any} req - Express request (no user).
   * @param {any} payload - Body with `deviceId`.
   * @returns {Promise<{status: boolean, message: string, data: number}>}
   */
  @Post('/cartCountUnAuth')
  cartCountUnAuth(@Request() req, @Body() payload: any) {
    return this.cartService.cartCount(payload, req);
  }

  /**
   * @method cartCount
   * @description Returns the total number of cart items for the authenticated user.
   *
   * @intent Display a badge count on the cart icon in the UI for logged-in users.
   * @idea Same service call as {@link cartCountUnAuth}; the AuthGuard ensures `req.user`
   *       is present so the count is scoped to the user's ID.
   * @usage `POST /cart/cartCount` with AuthGuard.
   * @dataflow Client -> AuthGuard -> controller -> CartService.cartCount -> Prisma Cart.count.
   * @dependencies {@link CartService.cartCount}
   *
   * @param {any} req - Express request with `req.user`.
   * @param {any} payload - Body (may include `deviceId` but userId takes precedence).
   * @returns {Promise<{status: boolean, message: string, data: number}>}
   */
  @UseGuards(AuthGuard)
  @Post('/cartCount')
  cartCount(@Request() req, @Body() payload: any) {
    return this.cartService.cartCount(payload, req);
  }

  /**
   * @method deleteAllCartItemByUserId
   * @description Removes every cart item belonging to the specified user. Typically called
   *              after a successful order placement to clear the cart.
   *
   * @intent Bulk-clear the entire cart for a given user in a single request.
   * @idea Uses `Prisma.cart.deleteMany` with a `userId` filter for a one-shot wipe.
   * @usage `POST /cart/deleteAllCartItemByUserId` -- no guard (public).
   * @dataflow Client -> controller -> CartService.deleteAllCartItemByUserId
   *          -> Prisma Cart.deleteMany.
   * @dependencies {@link CartService.deleteAllCartItemByUserId}
   * @notes Payload must contain `userId`. No AuthGuard is present; the caller is trusted.
   *
   * @param {any} req - Express request.
   * @param {any} payload - Body with `userId`.
   * @returns {Promise<{status: boolean, message: string, data: any[]}>}
   */
  @Post('/deleteAllCartItemByUserId')
  deleteAllCartItemByUserId(@Request() req, @Body() payload: any) {
    return this.cartService.deleteAllCartItemByUserId(payload, req);
  }

  // ----- ***** RFQ CART BEGINS ***** -----

  /**
   * @method updateRfqCart
   * @description Creates or updates an RFQ (Request For Quotation) cart item for an
   *              authenticated user, supporting offer-price negotiation fields.
   *
   * @intent Allow B2B buyers to build an RFQ cart with custom offer prices and notes
   *         before submitting a formal quotation request.
   * @idea Uses the `RFQCart` Prisma model (separate from the standard Cart). Existing
   *       items are updated in place; setting `quantity <= 0` deletes the row.
   * @usage `PATCH /cart/updateRfqCart` with AuthGuard.
   * @dataflow Client -> AuthGuard -> controller -> CartService.updateRfqCart -> Prisma RFQCart.
   * @dependencies {@link CartService.updateRfqCart}
   * @notes Payload includes `productId`, `quantity`, `offerPrice`, `offerPriceFrom`,
   *        `offerPriceTo`, `note`, and optional `deviceId`.
   *
   * @param {any} req - Express request with `req.user`.
   * @param {any} payload - RFQ cart item data.
   * @returns {Promise<{status: boolean, message: string, data: any}>}
   */
  @UseGuards(AuthGuard)
  @Patch('/updateRfqCart')
  updateRfqCart(@Request() req, @Body() payload: any) {
    return this.cartService.updateRfqCart(payload, req);
  }

  /**
   * @method updateRfqCartUnAuth
   * @description Unauthenticated variant of {@link updateRfqCart} for guest users
   *              identified by `deviceId`.
   *
   * @intent Enable guest users to build an RFQ cart before account creation.
   * @idea Delegates to `CartService.updateRfqCart`; `req.user` will be undefined so the
   *       service uses `payload.deviceId` in the WHERE clause.
   * @usage `PATCH /cart/updateRfqCartUnAuth` -- no guard.
   * @dataflow Client -> controller (no auth) -> CartService.updateRfqCart -> Prisma RFQCart.
   * @dependencies {@link CartService.updateRfqCart}
   *
   * @param {any} req - Express request (no user).
   * @param {any} payload - RFQ cart item data including `deviceId`.
   * @returns {Promise<{status: boolean, message: string, data: any}>}
   */
  @Patch('/updateRfqCartUnAuth')
  updateRfqCartUnAuth(@Request() req, @Body() payload: any) {
    return this.cartService.updateRfqCart(payload, req);
  }

  /**
   * @method rfqCartlist
   * @description Returns a paginated list of RFQ cart items for the authenticated user,
   *              including related product details and images.
   *
   * @intent Display the RFQ cart page with product thumbnails and negotiation data.
   * @idea Queries the `RFQCart` model with nested product includes, ordered by ID ascending.
   * @usage `GET /cart/rfqCartlist?page=1&limit=10&deviceId=...` with AuthGuard.
   * @dataflow Client -> AuthGuard -> controller -> CartService.rfqCartlist -> Prisma RFQCart.
   * @dependencies {@link CartService.rfqCartlist}
   * @notes Returns `totalCount` for pagination alongside `data`.
   *
   * @param {any} req - Express request with `req.user`.
   * @param {number} page - Page number (1-based).
   * @param {number} limit - Items per page.
   * @param {any} deviceId - Fallback device identifier.
   * @returns {Promise<{status: boolean, message: string, data: any[], totalCount: number}>}
   */
  @UseGuards(AuthGuard)
  @Get('/rfqCartlist')
  rfqCartlist(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('deviceId') deviceId: any,
  ) {
    return this.cartService.rfqCartlist(page, limit, req, deviceId);
  }

  /**
   * @method rfqCartlistUnAuth
   * @description Unauthenticated variant of {@link rfqCartlist} for guest users.
   *
   * @intent Let guest users view their RFQ cart before logging in.
   * @idea Same service call; `req.user` is absent so the service filters by `deviceId`.
   * @usage `GET /cart/rfqCartlistUnAuth?page=1&limit=10&deviceId=...` -- no guard.
   * @dataflow Client -> controller (no auth) -> CartService.rfqCartlist -> Prisma RFQCart.
   * @dependencies {@link CartService.rfqCartlist}
   *
   * @param {any} req - Express request (no user).
   * @param {number} page - Page number.
   * @param {number} limit - Items per page.
   * @param {any} deviceId - Device fingerprint.
   * @returns {Promise<{status: boolean, message: string, data: any[], totalCount: number}>}
   */
  @Get('/rfqCartlistUnAuth')
  rfqCartlistUnAuth(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('deviceId') deviceId: any,
  ) {
    return this.cartService.rfqCartlist(page, limit, req, deviceId);
  }

  /**
   * @method rfqCartDelete
   * @description Hard-deletes a single RFQ cart item by its ID.
   *
   * @intent Remove a specific product from the RFQ quotation cart.
   * @idea Looks up the row by primary key, returns 404 if missing, then performs
   *       `prisma.rFQCart.delete`.
   * @usage `DELETE /cart/rfqCartDelete?rfqCartId=123` -- no guard.
   * @dataflow Client -> controller -> CartService.rfqCartDelete -> Prisma RFQCart.delete.
   * @dependencies {@link CartService.rfqCartDelete}
   * @notes No AuthGuard -- public endpoint.
   *
   * @param {number} rfqCartId - Primary key of the RFQ cart row.
   * @returns {Promise<{status: boolean, message: string, data: object}>}
   */
  @Delete('/rfqCartDelete')
  rfqCartDelete(@Query('rfqCartId') rfqCartId: number) {
    return this.cartService.rfqCartDelete(rfqCartId);
  }

  /**
   * @method updateRfqCartUserIdBydeviceId
   * @description Migrates guest RFQ cart rows from a `deviceId` to the authenticated user's
   *              `userId`, merging duplicates by summing quantities.
   *
   * @intent Called after login to adopt guest RFQ cart items into the user's account.
   * @idea Mirrors {@link updateUserIdBydeviceId} but targets the `RFQCart` table.
   * @usage `PATCH /cart/updateRfqCartUserIdBydeviceId` with AuthGuard.
   * @dataflow Client -> AuthGuard -> controller -> CartService.updateRfqCartUserIdBydeviceId
   *          -> Prisma RFQCart (updateMany, raw SQL dedup, delete, update).
   * @dependencies {@link CartService.updateRfqCartUserIdBydeviceId}
   * @notes Currently marked as "Still Now NOT USED!" in the service implementation.
   *
   * @param {any} req - Express request with `req.user`.
   * @param {any} payload - Body with `deviceId`.
   * @returns {Promise<{success: boolean, message: string, data: any[]}>}
   */
  @UseGuards(AuthGuard)
  @Patch('/updateRfqCartUserIdBydeviceId')
  updateRfqCartUserIdBydeviceId(@Request() req, @Body() payload: any) {
    return this.cartService.updateRfqCartUserIdBydeviceId(payload, req);
  }

  /**
   * @method deleteAllRfqCartItemByUserId
   * @description Bulk-deletes every RFQ cart item for a given user.
   *
   * @intent Clear the entire RFQ cart (e.g., after a quotation request is submitted).
   * @idea Delegates to `CartService.deleteAllRfqCartItemByUserId`, which currently has
   *       an empty try/catch body (stub -- not yet implemented).
   * @usage `POST /cart/deleteAllRfqCartItemByUserId` -- no guard.
   * @dataflow Client -> controller -> CartService.deleteAllRfqCartItemByUserId -> (stub).
   * @dependencies {@link CartService.deleteAllRfqCartItemByUserId}
   * @notes The service method body is currently empty; this endpoint is a no-op placeholder.
   *
   * @param {any} req - Express request.
   * @param {any} payload - Body (expected to contain `userId`).
   * @returns {Promise<void>} Currently returns undefined (empty catch).
   */
  @Post('/deleteAllRfqCartItemByUserId')
  deleteAllRfqCartItemByUserId(@Request() req, @Body() payload: any) {
    return this.cartService.deleteAllRfqCartItemByUserId(payload, req);
  }

  // ----- ***** RFQ CART ENDS ***** -----

  /**
   * @method updateFactoriesCart
   * @description Creates or updates a Factories cart item for customisable factory-direct
   *              product orders.
   *
   * @intent Support the Factories marketplace flow where buyers can request custom products
   *         from factory suppliers.
   * @idea Delegates to `CartService.addUpdateFactoriesCart`, which upserts into the
   *       `FactoriesCart` Prisma model based on `productId` / `customizeProductId`.
   * @usage `PATCH /cart/updateFactoriesCart` with AuthGuard.
   * @dataflow Client -> AuthGuard -> controller -> CartService.addUpdateFactoriesCart
   *          -> Prisma FactoriesCart.
   * @dependencies {@link CartService.addUpdateFactoriesCart}
   * @notes Payload includes `productId`, `customizeProductId`, `quantity`, `deviceId`.
   *
   * @param {any} req - Express request with `req.user`.
   * @param {any} payload - Factories cart item data.
   * @returns {Promise<{status: boolean, message: string, data: any}>}
   */
  @UseGuards(AuthGuard)
  @Patch('/updateFactoriesCart')
  updateFactoriesCart(@Request() req, @Body() payload: any) {
    return this.cartService.addUpdateFactoriesCart(payload, req);
  }

  /**
   * @method getAllFactoriesCart
   * @description Returns a paginated list of Factories cart items for the authenticated user,
   *              including customise-product and standard product details with images.
   *
   * @intent Display the Factories cart page with thumbnails and product info.
   * @idea Queries the `FactoriesCart` model; includes `customizeProductDetail` and
   *       `productDetails` relations filtered by `status = 'ACTIVE'`.
   * @usage `GET /cart/getAllFactoriesCart?page=1&limit=10&deviceId=...` with AuthGuard.
   * @dataflow Client -> AuthGuard -> controller -> CartService.getAllFactoriesCart
   *          -> Prisma FactoriesCart.
   * @dependencies {@link CartService.getAllFactoriesCart}
   *
   * @param {any} req - Express request with `req.user`.
   * @param {number} page - Page number (1-based).
   * @param {number} limit - Items per page.
   * @param {any} deviceId - Fallback device ID.
   * @returns {Promise<{status: boolean, message: string, data: any[], totalCount: number}>}
   */
  @UseGuards(AuthGuard)
  @Get('/getAllFactoriesCart')
  getAllFactoriesCart(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('deviceId') deviceId: any,
  ) {
    return this.cartService.getAllFactoriesCart(page, limit, req, deviceId);
  }

  /**
   * @method deleteFactoriesCart
   * @description Deletes a Factories cart item along with its associated customise-product
   *              data and images.
   *
   * @intent Remove a factory-direct order item and all its custom product data in one call.
   * @idea Cascades: delete customise-product images -> delete customise-product -> delete
   *       factories cart row.
   * @usage `DELETE /cart/deleteFactoriesCart?factoriesCartId=123` with AuthGuard.
   * @dataflow Client -> AuthGuard -> controller -> CartService.deleteFactoriesCart
   *          -> Prisma CustomizeProductImage, CustomizeProduct, FactoriesCart.
   * @dependencies {@link CartService.deleteFactoriesCart}
   *
   * @param {number} factoriesCartId - Primary key of the FactoriesCart row.
   * @returns {Promise<{status: boolean, message: string, data: object}>}
   */
  @UseGuards(AuthGuard)
  @Delete('/deleteFactoriesCart')
  deleteFactoriesCart(@Query('factoriesCartId') factoriesCartId: number) {
    return this.cartService.deleteFactoriesCart(factoriesCartId);
  }

  /**
   * @method updateService
   * @description Adds or updates a standalone service in the cart (not linked to a product).
   *              Uses validated DTO for input.
   *
   * @intent Allow users to purchase services independently, selecting specific service
   *         features with quantities and optional booking date-times.
   * @idea If a service cart without linked products exists, features are upserted onto it;
   *       otherwise a new cart row with cartType='SERVICE' is created.
   * @usage `PATCH /cart/updateservice` with AuthGuard and validated {@link AddCartServiceDto}.
   * @dataflow Client -> AuthGuard -> controller -> CartService.updateCartService
   *          -> Prisma Cart + CartServiceFeature.
   * @dependencies {@link CartService.updateCartService}, {@link AddCartServiceDto}
   * @notes Uses the `@GetUser('id')` decorator to extract userId from the JWT payload.
   *
   * @param {AddCartServiceDto} dto - Validated body with `serviceId` and `features[]`.
   * @param {number} userId - Authenticated user's ID (extracted by GetUser decorator).
   * @returns {Promise<{success: boolean, message: string, data: any}>}
   */
  @UseGuards(AuthGuard)
  @Patch('updateservice')
  updateService(@Body() dto: AddCartServiceDto, @GetUser('id') userId: number) {
    return this.cartService.updateCartService(dto, userId);
  }

  /**
   * @method updateServiceProduct
   * @description Creates a new product cart entry that is linked to an existing service
   *              cart entry via the CartProductService join table, inside a transaction.
   *
   * @intent Allow adding a product as a "related item" to a service that is already in the
   *         cart, forming a service-product bundle.
   * @idea Uses a Prisma interactive transaction to atomically create both the product cart
   *       row and the CartProductService relationship.
   * @usage `PATCH /cart/updateservice/product` with AuthGuard and validated
   *        {@link AddCartServiceProdDto}.
   * @dataflow Client -> AuthGuard -> controller -> CartService.updateServiceProduct
   *          -> Prisma $transaction (Cart.create + CartProductService.create).
   * @dependencies {@link CartService.updateServiceProduct}, {@link AddCartServiceProdDto}
   * @notes The DTO enforces `cartType='SERVICE'` and `relatedCartType='PRODUCT'`.
   *
   * @param {AddCartServiceProdDto} dto - Validated body with service/product IDs, quantity, etc.
   * @param {number} userId - Authenticated user's ID.
   * @returns {Promise<{success: boolean, message: string, data: any}>}
   */
  @UseGuards(AuthGuard)
  @Patch('updateservice/product')
  updateServiceProduct(
    @Body() dto: AddCartServiceProdDto,
    @GetUser('id') userId: number,
  ) {
    return this.cartService.updateServiceProduct(dto, userId);
  }

  /**
   * @method deleteCartService
   * @description Deletes a service from the cart. Supports two modes:
   *   1. **Partial** -- if `serviceFeatureIds` or `serviceProdIds` are provided, only those
   *      specific features/products are removed from the service cart entry.
   *   2. **Full** -- if no IDs are provided, the entire service cart row plus all child
   *      features, product links, and related product carts are deleted via a transaction.
   *
   * @intent Allow fine-grained removal of individual service features or wholesale deletion
   *         of a service cart entry with all its relationships.
   * @idea Uses comma-separated query parameters parsed by `ParseArrayPipe` to receive arrays
   *       of IDs. A Prisma `$transaction` ensures atomicity during full deletion.
   * @usage `DELETE /cart/deleteService/:cartid?servicefeatureids=1,2&serviceprodidsids=3,4`
   *        with AuthGuard.
   * @dataflow Client -> AuthGuard -> controller -> CartService.deleteCartService
   *          -> Prisma CartServiceFeature, CartProductService, Cart ($transaction).
   * @dependencies {@link CartService.deleteCartService}
   * @notes The ownership check uses `findUniqueOrThrow` scoped to `userId`, which will
   *        throw a Prisma error (caught in the service) if the cart row does not belong
   *        to the caller.
   *
   * @param {number} cartId - Path parameter: primary key of the service cart row.
   * @param {number[]} serviceFeatureIds - Optional comma-separated feature IDs to remove.
   * @param {number[]} serviceProdIds - Optional comma-separated product-service link IDs.
   * @param {number} userId - Authenticated user's ID.
   * @returns {Promise<{status: boolean, message: string, data: any}>}
   */
  @UseGuards(AuthGuard)
  @Delete('deleteService/:cartid')
  deleteCartService(
    @Param('cartid', ParseIntPipe) cartId: number,
    @Query(
      'servicefeatureids',
      new DefaultValuePipe([]),
      new ParseArrayPipe({ items: Number, separator: ',', optional: true }),
    )
    serviceFeatureIds: number[],
    @Query(
      'serviceprodidsids',
      new DefaultValuePipe([]),
      new ParseArrayPipe({ items: Number, separator: ',', optional: true }),
    )
    serviceProdIds: number[],
    @GetUser('id') userId: number,
  ) {
    return this.cartService.deleteCartService(
      cartId,
      userId,
      serviceFeatureIds,
      serviceProdIds,
    );
  }

  @Get('/recommendations')
  getCartRecommendations(
    @Request() req,
    @Query('productIds') productIds?: string,
    @Query('limit') limit?: number,
    @Query('deviceId') deviceId?: string,
  ) {
    return this.cartService.getCartRecommendations(req, { productIds, limit });
  }
}
