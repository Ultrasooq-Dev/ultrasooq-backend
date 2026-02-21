/**
 * @file product.controller.ts
 * @description HTTP routing layer for all product-related endpoints in the Ultrasooq
 *   B2B/B2C marketplace backend.  Delegates every operation to {@link ProductService}
 *   and enforces authentication via {@link AuthGuard} or {@link SuperAdminAuthGuard}
 *   where required.
 *
 * @module ProductController
 *
 * @idea Provide a thin controller that maps REST routes to service methods, applies
 *   guards and DTO validation, and returns the standard `{ status, message, data }`
 *   envelope produced by the service.
 *
 * @usage Registered by {@link ProductModule}.  All routes are prefixed with `/product`.
 *
 * @dataflow
 *   HTTP request -> NestJS router -> AuthGuard (JWT) -> ProductController method
 *   -> ProductService method -> PrismaClient -> DB
 *   <- { status, message, data } envelope <- HTTP response
 *
 * @dependencies
 *   - {@link ProductService}                   -- business logic
 *   - {@link S3service}                        -- injected but not directly used in controller (used by service)
 *   - {@link AuthGuard}                        -- JWT-based route protection for authenticated users
 *   - {@link SuperAdminAuthGuard}              -- elevated guard for super-admin-only routes (currently commented out)
 *   - {@link UpdatedProductPriceDto}           -- body validation for single price update
 *   - {@link GetOneProductPriceDto}            -- query validation for single price fetch/delete
 *   - {@link AddMultiplePriceForProductDTO}    -- body validation for bulk price creation
 *   - {@link UpdateMultiplePriceForProductDTO} -- body validation for bulk price update
 *
 * @notes
 *   - Several guards are commented out (SuperAdminAuthGuard on findAll/findOne) indicating
 *     these routes were open during development and may need re-securing.
 *   - Many endpoints accept `payload: any` rather than a typed DTO, relying on service-level
 *     validation instead.
 *   - The controller never mutates data directly; it is a pure pass-through to the service.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MulterFile } from './types';
import { ProductService } from './product.service';
import { S3service } from 'src/user/s3.service';
import { SpecificationService } from 'src/specification/specification.service';
import { Throttle } from '@nestjs/throttler';
import { SuperAdminAuthGuard } from 'src/guards/SuperAdminAuthGuard';
import { AuthGuard } from 'src/guards/AuthGuard';
import { UpdatedProductPriceDto } from './dto/update-productPrice.dto';
import { GetOneProductPriceDto } from './dto/getOne-productPrice.dto';
import { AddMultiplePriceForProductDTO } from './dto/addMultiple-productPrice.dto';
import { UpdateMultiplePriceForProductDTO } from './dto/updateMultiple-productPrice.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

/**
 * @class ProductController
 * @description REST controller mounted at `/product`.  Routes span product CRUD,
 *   pricing management, reviews, Q&A, RFQ, factories, buy-group, seller rewards,
 *   generated links, existing-product copy, and analytics.
 *
 * @intent Serve as the single HTTP entry point for all product domain operations,
 *   delegating logic to {@link ProductService}.
 *
 * @usage Auto-discovered by NestJS via {@link ProductModule}.
 *
 * @dataflow See file-level JSDoc above.
 *
 * @dependencies {@link ProductService}, {@link S3service}.
 *
 * @notes
 *   - `S3service` is injected here but only used transitively through the service layer.
 *   - All methods return the `Promise<{ status, message, data?, ... }>` envelope.
 */
@ApiTags('products')
@ApiBearerAuth('JWT-auth')
@Controller('product')
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly s3service: S3service,
    private readonly specificationService: SpecificationService,
  ) {}

  /**
   * @method create
   * @description Creates a new product with optional tags, images, price entries,
   *   short descriptions, specifications, and generates barcodes.
   *
   * @intent Allow authenticated sellers to add a new product to the catalogue.
   *
   * @usage `POST /product/create` (AuthGuard protected)
   *
   * @dataflow req.user.id -> HelperService.getAdminId() -> Prisma product + related inserts
   *   -> barcode generation -> { status, message, data }
   *
   * @dependencies {@link ProductService.create}
   *
   * @notes SKU uniqueness is enforced by the service layer.
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - Product creation payload (see CreateProductDto for shape).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Post('/create')
  create(@Request() req, @Body() payload: any) {
    return this.productService.create(payload, req);
  }

  /**
   * @method update
   * @description Updates an existing product's core fields, tags, images,
   *   short descriptions, specifications, and price entries.
   *
   * @intent Allow authenticated sellers to modify a product they own.
   *
   * @usage `PATCH /product/update` (AuthGuard protected)
   *
   * @dataflow payload.productId -> Prisma findUnique -> merge payload over existing
   *   -> delete-and-recreate child records -> barcode regeneration -> { status, message, data }
   *
   * @dependencies {@link ProductService.update}
   *
   * @notes Uses a delete-and-recreate strategy for tags, images, and descriptions
   *   rather than individual upserts.
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - Product update payload including `productId`.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Patch('/update')
  update(@Request() req, @Body() payload: any) {
    return this.productService.update(payload, req);
  }

  /**
   * @method getProductVariant
   * @description Retrieves product variant data for one or more product price IDs.
   *
   * @intent Fetch variant configuration (e.g. size, colour combinations) associated
   *   with specific product-price entries.
   *
   * @usage `POST /product/getProductVariant` (public)
   *
   * @dataflow payload.productPriceId (array) -> Prisma productVariant.findMany()
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.getProductVariant}
   *
   * @notes Endpoint is public (no guard).  Uses POST despite being a read operation,
   *   to accept an array body.
   *
   * @param {any} req - Express request object.
   * @param {any} payload - Body containing `productPriceId` (number[]).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @Post('/getProductVariant')
  getProductVariant(@Request() req, @Body() payload: any) {
    return this.productService.getProductVariant(payload, req);
  }

  /**
   * @method findOneProductPrice
   * @description Retrieves a single product-price record by product ID and user ID.
   *
   * @intent Look up a specific seller's price entry for a given product.
   *
   * @usage `GET /product/findOneProductPrice` (public)
   *
   * @dataflow payload.productId + payload.userId -> Prisma productPrice.findFirst()
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.findOneProductPrice}
   *
   * @notes Uses `@Body()` on a GET route, which is unconventional and may not be
   *   populated by all HTTP clients; query params may be more appropriate.
   *
   * @param {any} req - Express request object.
   * @param {any} payload - Body containing `productId` and `userId`.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @Get('/findOneProductPrice')
  findOneProductPrice(@Request() req, @Body() payload: any) {
    return this.productService.findOneProductPrice(payload, req);
  }

  /**
   * @method findAll
   * @description Retrieves a paginated, filterable list of products owned by a given user.
   *
   * @intent Provide a seller's product catalogue with search, brand filtering,
   *   expiry filtering, discount filtering, and sell-type filtering.
   *
   * @usage `GET /product/findAll?page=1&limit=10&userId=5&term=phone&brandIds=1,2`
   *   (public -- SuperAdminAuthGuard commented out)
   *
   * @dataflow userId -> HelperService.getAdminId() -> Prisma product.findMany() with
   *   includes (category, brand, tags, images, reviews, wishlist, prices)
   *   -> { status, message, data, totalCount }
   *
   * @dependencies {@link ProductService.findAll}
   *
   * @notes Also reads `req.query.status`, `req.query.expireDate`, `req.query.discount`,
   *   and `req.query.sellType` for additional filtering beyond the declared params.
   *
   * @param {any} req - Express request with additional query params.
   * @param {number} page - Page number (1-based).
   * @param {number} limit - Items per page.
   * @param {number} userId - Owner user ID to scope the product list.
   * @param {string} term - Search term (min 3 chars to activate).
   * @param {any} brandIds - Comma-separated brand IDs for filtering.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number}>}
   */
  // @UseGuards(SuperAdminAuthGuard)
  @Get('/findAll')
  findAll(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('userId') userId: number,
    @Query('term') term: string,
    @Query('brandIds') brandIds: any,
  ) {
    return this.productService.findAll(
      userId,
      page,
      limit,
      req,
      term,
      brandIds,
    );
  }

  /**
   * @method findOne
   * @description Retrieves a single product by ID with full relational detail,
   *   lowest-price seller, other sellers, wishlist status, and optional shared-link info.
   *
   * @intent Power the product detail page (PDP) for consumers and vendors.
   *
   * @usage `GET /product/findOne?productId=42&userId=5`
   *   (public -- SuperAdminAuthGuard commented out)
   *
   * @dataflow productId -> Prisma product.findUnique() with deep includes
   *   -> wishlist check -> other-seller query -> shared-link lookup
   *   -> { status, message, data, totalCount, inWishlist, otherSeller, generatedLinkDetail }
   *
   * @dependencies {@link ProductService.findOne}
   *
   * @notes Returns the lowest-offer-price seller via `orderBy: offerPrice asc, take: 1`.
   *
   * @param {any} req - Express request (reads `req.query.sharedLinkId`).
   * @param {number} productId - Primary key of the product.
   * @param {number} userId - Optional viewer user ID for wishlist detection.
   * @returns {Promise<{status: boolean, message: string, data?: any, otherSeller?: any[]}>}
   */
  // @UseGuards(SuperAdminAuthGuard)
  @Get('/findOne')
  findOne(
    @Request() req,
    @Query('productId') productId: number,
    @Query('userId') userId: number,
  ) {
    return this.productService.findOne(productId, req, userId);
  }

  /**
   * @method findOneWithProductPrice
   * @description Retrieves a single product filtered to a specific seller's price entry,
   *   plus other sellers and wishlist status.
   *
   * @intent Power the product detail page when the caller already knows which
   *   seller (adminId) they want to view.
   *
   * @usage `GET /product/findOneWithProductPrice?productId=42&adminId=7&userId=5`
   *   (public)
   *
   * @dataflow productId + adminId -> Prisma product.findUnique() with product_productPrice
   *   filtered by adminId -> wishlist check -> other-seller query
   *   -> { status, message, data, totalCount, inWishlist, otherSeller }
   *
   * @dependencies {@link ProductService.findOneWithProductPrice}
   *
   * @notes Unlike `findOne`, this does NOT limit product_productPrice to 1 row;
   *   it returns all ACTIVE prices for the specified admin.
   *
   * @param {any} req - Express request object.
   * @param {number} productId - Primary key of the product.
   * @param {number} adminId - Seller/admin user ID to scope price entries.
   * @param {number} userId - Optional viewer user ID for wishlist detection.
   * @returns {Promise<{status: boolean, message: string, data?: any, otherSeller?: any[]}>}
   */
  @Get('/findOneWithProductPrice')
  findOneWithProductPrice(
    @Request() req,
    @Query('productId') productId: number,
    @Query('adminId') adminId: number,
    @Query('userId') userId: number,
  ) {
    return this.productService.findOneWithProductPrice(
      productId,
      adminId,
      req,
      userId,
    );
  }

  /**
   * @method vendorDetails
   * @description Retrieves vendor profile details including user profile, business types,
   *   branches, and branch tags.
   *
   * @intent Power the vendor/seller public profile page on the storefront.
   *
   * @usage `GET /product/vendorDetails?adminId=7` (public)
   *
   * @dataflow adminId -> Prisma user.findUnique() with profile, business types,
   *   branches -> { status, message, data, totalCount }
   *
   * @dependencies {@link ProductService.vendorDetails}
   *
   * @notes Returns a single user record with deeply nested profile structures.
   *
   * @param {number} adminId - The vendor's user ID.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @Get('/vendorDetails')
  vendorDetails(@Query('adminId') adminId: number) {
    return this.productService.vendorDetails(adminId);
  }

  /**
   * @method vendorAllProduct
   * @description Retrieves a paginated list of all ACTIVE products for a specific vendor,
   *   with brand, expiry, discount, and sell-type filtering.
   *
   * @intent Power the vendor's public storefront product listing.
   *
   * @usage `GET /product/vendorAllProduct?adminId=7&page=1&limit=10` (public)
   *
   * @dataflow adminId -> Prisma product.findMany() where product_productPrice.adminId
   *   matches -> includes (category, brand, tags, images, reviews, prices)
   *   -> { status, message, data, totalCount }
   *
   * @dependencies {@link ProductService.vendorAllProduct}
   *
   * @notes Only ACTIVE products are returned (unlike `findAll` which respects a status filter).
   *
   * @param {number} page - Page number (1-based).
   * @param {number} limit - Items per page.
   * @param {number} adminId - Vendor's user ID.
   * @param {string} term - Search term (unused in current implementation but declared).
   * @param {any} req - Express request (reads additional query filters).
   * @param {any} brandIds - Comma-separated brand IDs.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number}>}
   */
  @Get('/vendorAllProduct')
  vendorAllProduct(
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('adminId') adminId: number,
    @Query('term') term: string,
    @Request() req,
    @Query('brandIds') brandIds: any,
  ) {
    return this.productService.vendorAllProduct(
      adminId,
      page,
      limit,
      req,
      brandIds,
    );
  }

  /**
   * @method delete
   * @description Soft-deletes a product by setting its status to 'DELETE' and recording
   *   the deletion timestamp.
   *
   * @intent Allow authenticated sellers to remove a product from their catalogue
   *   without physically deleting the database record.
   *
   * @usage `DELETE /product/delete/:productId` (AuthGuard protected)
   *
   * @dataflow productId -> Prisma product.update({ status: 'DELETE', deletedAt: now })
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.delete}
   *
   * @notes Uses the soft-delete pattern (status='DELETE' + deletedAt timestamp).
   *   The `payload` body parameter is declared but unused.
   *
   * @param {number} productId - Path parameter: primary key of the product.
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - Request body (unused).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Delete('/delete/:productId')
  delete(
    @Param('productId') productId: number,
    @Request() req,
    @Body() payload: any,
  ) {
    return this.productService.delete(productId, req);
  }

  /**
   * @method addPriceForProduct
   * @description Creates a new seller-specific price entry for an existing product,
   *   including barcode generation and geo-sell-region associations.
   *
   * @intent Let a seller add their own pricing to an already-catalogued product.
   *
   * @usage `POST /product/addPriceForProduct` (AuthGuard protected)
   *
   * @dataflow payload -> ProductService.addPriceForProduct() -> Prisma productPrice.create()
   *   + productSellCountry/State/City inserts + barcode generation
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.addPriceForProduct}
   *
   * @notes The service also handles menuId assignment based on sellType / isCustomProduct.
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - Pricing payload (productId, price fields, sell regions, etc.).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Post('/addPriceForProduct')
  addPriceForProduct(@Request() req, @Body() payload: any) {
    return this.productService.addPriceForProduct(payload, req);
  }

  /**
   * @method addMultiplePriceForProduct
   * @description Creates multiple seller-specific price entries in a single request,
   *   each targeting a different product.
   *
   * @intent Batch onboarding of seller prices across multiple catalogue products.
   *
   * @usage `POST /product/addMultiplePriceForProduct` (AuthGuard protected)
   *
   * @dataflow payload.productPrice[] -> service loop -> Prisma productPrice.create() per entry
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.addMultiplePriceForProduct}, {@link AddMultiplePriceForProductDTO}
   *
   * @notes Validated by {@link AddMultiplePriceForProductDTO} (class-validator).
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {AddMultiplePriceForProductDTO} payload - Array wrapper of price entries.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Post('/addMultiplePriceForProduct')
  addMultiplePriceForProduct(
    @Request() req,
    @Body() payload: AddMultiplePriceForProductDTO,
  ) {
    return this.productService.addMultiplePriceForProduct(payload, req);
  }

  /**
   * @method getAllProductPriceByUser
   * @description Retrieves all product-price entries owned by the authenticated user,
   *   with pagination, search, and brand filtering.
   *
   * @intent Power the seller's "My Prices" dashboard listing.
   *
   * @usage `GET /product/getAllProductPriceByUser?page=1&limit=10&term=phone&brandIds=1,2`
   *   (AuthGuard protected)
   *
   * @dataflow req.user.id -> HelperService.getAdminId() -> Prisma productPrice.findMany()
   *   + product includes -> { status, message, data, totalCount }
   *
   * @dependencies {@link ProductService.getAllProductPriceByUser}
   *
   * @notes Also reads `req.query.sellType` for sell-type filtering.
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {number} page - Page number (1-based).
   * @param {number} limit - Items per page.
   * @param {string} term - Search term for product name.
   * @param {string} brandIds - Comma-separated brand IDs.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number}>}
   */
  @UseGuards(AuthGuard)
  @Get('/getAllProductPriceByUser')
  getAllProductPriceByUser(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('term') term: string,
    @Query('brandIds') brandIds: string,
    // @Query() query: GetOneProductPriceDto
  ) {
    return this.productService.getAllProductPriceByUser(
      page,
      limit,
      req,
      term,
      brandIds,
    );
  }

  /**
   * @method updateMultipleProductPrice
   * @description Updates multiple product-price records in a single request.
   *
   * @intent Batch modification of seller prices, discounts, stock, and sell options.
   *
   * @usage `PATCH /product/updateMultipleProductPrice` (AuthGuard protected)
   *
   * @dataflow payload.productPrice[] -> service loop -> Prisma productPrice.update() per entry
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.updateMultipleProductPrice}, {@link UpdateMultiplePriceForProductDTO}
   *
   * @notes Validated by {@link UpdateMultiplePriceForProductDTO} (class-validator).
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {UpdateMultiplePriceForProductDTO} payload - Array wrapper of price update entries.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Patch('/updateMultipleProductPrice')
  updateMultipleProductPrice(
    @Request() req,
    @Body() payload: UpdateMultiplePriceForProductDTO,
  ) {
    return this.productService.updateMultipleProductPrice(payload, req);
  }

  /**
   * @method bulkHideShowProducts
   * @description Toggles visibility (ACTIVE / HIDDEN) for multiple product-price records.
   *
   * @intent Allow sellers to quickly hide or show a batch of price listings.
   *
   * @usage `PATCH /product/bulkHideShow` (AuthGuard protected)
   *
   * @dataflow payload.productPriceIds[] + payload.hide -> Prisma updateMany()
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.bulkHideShowProducts}
   *
   * @notes `hide: true` sets status to 'HIDDEN'; `hide: false` sets status to 'ACTIVE'.
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {{ productPriceIds: number[]; hide: boolean }} payload - IDs and visibility flag.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Patch('/bulkHideShow')
  bulkHideShowProducts(
    @Request() req,
    @Body() payload: { productPriceIds: number[]; hide: boolean },
  ) {
    return this.productService.bulkHideShowProducts(payload, req);
  }

  /**
   * @method bulkProductCondition
   * @description Updates the product condition label for multiple product-price records.
   *
   * @intent Allow sellers to batch-update condition (e.g. NEW, USED, REFURBISHED).
   *
   * @usage `PATCH /product/bulkProductCondition` (AuthGuard protected)
   *
   * @dataflow payload.productPriceIds[] + payload.productCondition -> Prisma updateMany()
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.bulkProductCondition}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {{ productPriceIds: number[]; productCondition: string }} payload - IDs and condition value.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Patch('/bulkProductCondition')
  bulkProductCondition(
    @Request() req,
    @Body() payload: { productPriceIds: number[]; productCondition: string },
  ) {
    return this.productService.bulkProductCondition(payload, req);
  }

  /**
   * @method bulkDiscountUpdate
   * @description Updates discount settings for multiple product-price records.
   *
   * @intent Allow sellers to batch-apply vendor/consumer discount percentages and types.
   *
   * @usage `PATCH /product/bulkDiscountUpdate` (AuthGuard protected)
   *
   * @dataflow payload.productPriceIds[] + payload.discountData -> Prisma updateMany()
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.bulkDiscountUpdate}
   *
   * @notes `discountData` contains vendorDiscount, consumerDiscount, and their types.
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {{ productPriceIds: number[]; discountData: any }} payload - IDs and discount config.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Patch('/bulkDiscountUpdate')
  bulkDiscountUpdate(
    @Request() req,
    @Body() payload: { productPriceIds: number[]; discountData: any },
  ) {
    return this.productService.bulkDiscountUpdate(payload, req);
  }

  /**
   * @method bulkWhereToSellUpdate
   * @description Updates geographic sell regions (country, state, city) for multiple
   *   product-price records.
   *
   * @intent Allow sellers to batch-update where their products are available for sale.
   *
   * @usage `PATCH /product/bulkWhereToSellUpdate` (AuthGuard protected)
   *
   * @dataflow payload.productPriceIds[] + payload.locationData -> delete existing geo rows
   *   + create new geo rows per price -> { status, message, data }
   *
   * @dependencies {@link ProductService.bulkWhereToSellUpdate}
   *
   * @notes Uses delete-and-recreate for productSellCountry, productSellState, productSellCity.
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {{ productPriceIds: number[]; locationData: any }} payload - IDs and location config.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Patch('/bulkWhereToSellUpdate')
  bulkWhereToSellUpdate(
    @Request() req,
    @Body() payload: { productPriceIds: number[]; locationData: any },
  ) {
    return this.productService.bulkWhereToSellUpdate(payload, req);
  }

  /**
   * @method bulkAskForUpdate
   * @description Updates "ask for" flags (askForPrice, askForStock, askForSell) for
   *   multiple product-price records.
   *
   * @intent Allow sellers to batch-toggle whether buyers must request pricing/stock info.
   *
   * @usage `PATCH /product/bulkAskForUpdate` (AuthGuard protected)
   *
   * @dataflow payload.productPriceIds[] + payload.askForData -> Prisma updateMany()
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.bulkAskForUpdate}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {{ productPriceIds: number[]; askForData: any }} payload - IDs and ask-for flags.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Patch('/bulkAskForUpdate')
  bulkAskForUpdate(
    @Request() req,
    @Body() payload: { productPriceIds: number[]; askForData: any },
  ) {
    return this.productService.bulkAskForUpdate(payload, req);
  }

  /**
   * @method updateProductPrice
   * @description Updates a single product-price record with full field support,
   *   including geo sell regions and seller images.
   *
   * @intent Allow a seller to modify all aspects of a specific price listing.
   *
   * @usage `PATCH /product/updateProductPrice` (AuthGuard protected)
   *
   * @dataflow UpdatedProductPriceDto -> ProductService.updateProductPrice()
   *   -> Prisma productPrice.update() + geo-region upserts + seller-image upserts
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.updateProductPrice}, {@link UpdatedProductPriceDto}
   *
   * @notes Validated by {@link UpdatedProductPriceDto} (class-validator).
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {UpdatedProductPriceDto} updatedProductPriceDto - Validated price update payload.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Patch('/updateProductPrice')
  updateProductPrice(
    @Request() req,
    @Body() updatedProductPriceDto: UpdatedProductPriceDto,
  ) {
    return this.productService.updateProductPrice(updatedProductPriceDto, req);
  }

  /**
   * @method getOneProductPrice
   * @description Retrieves a single product-price record by its primary key,
   *   including product details, admin details, and seller images.
   *
   * @intent Fetch full details of one price listing for display or editing.
   *
   * @usage `GET /product/getOneProductPrice?productPriceId=123` (AuthGuard protected)
   *
   * @dataflow query.productPriceId -> Prisma productPrice.findUnique() with includes
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.getOneProductPrice}, {@link GetOneProductPriceDto}
   *
   * @param {GetOneProductPriceDto} query - Validated query with productPriceId.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Get('/getOneProductPrice')
  getOneProductPrice(@Query() query: GetOneProductPriceDto) {
    return this.productService.getOneProductPrice(query.productPriceId);
  }

  /**
   * @method deleteOneProductPrice
   * @description Soft-deletes a single product-price record (status='DELETE', deletedAt=now).
   *
   * @intent Allow a seller to remove one of their price listings without hard-deleting.
   *
   * @usage `DELETE /product/deleteOneProductPrice?productPriceId=123` (AuthGuard protected)
   *
   * @dataflow query.productPriceId -> Prisma productPrice.update({ status: 'DELETE', deletedAt })
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.deleteOneProductPrice}, {@link GetOneProductPriceDto}
   *
   * @notes Uses the standard soft-delete pattern (status='DELETE' + deletedAt timestamp).
   *
   * @param {GetOneProductPriceDto} query - Validated query with productPriceId.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Delete('/deleteOneProductPrice')
  deleteOneProductPrice(@Query() query: GetOneProductPriceDto) {
    return this.productService.deleteOneProductPrice(query.productPriceId);
  }

  /**
   * @method getOneProductByProductCondition
   * @description Retrieves a product and its price entry filtered by product condition,
   *   along with custom field values.
   *
   * @intent Power the product-condition-specific view (e.g. NEW vs USED listings).
   *
   * @usage `GET /product/getOneProductByProductCondition?productId=42&productPriceId=99`
   *   (AuthGuard protected)
   *
   * @dataflow productId + productPriceId -> Prisma queries for product detail + price
   *   + custom fields -> { status, message, data }
   *
   * @dependencies {@link ProductService.getOneProductByProductCondition}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {number} productId - Primary key of the product.
   * @param {number} productPriceId - Primary key of the price entry.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Get('/getOneProductByProductCondition')
  getOneProductByProductCondition(
    @Request() req,
    @Query('productId') productId: number,
    @Query('productPriceId') productPriceId: number,
  ) {
    return this.productService.getOneProductByProductCondition(
      productId,
      req,
      productPriceId,
    );
  }

  /**
   * @method editProductPriceByProductCondition
   * @description Updates a product-price record based on product condition context,
   *   including custom field value management.
   *
   * @intent Allow sellers to edit price details within a specific condition context
   *   (e.g. adjusting the USED-condition listing separately).
   *
   * @usage `PATCH /product/editProductPriceByProductCondition` (AuthGuard protected)
   *
   * @dataflow payload -> ProductService.editProductPriceByProductCondition()
   *   -> Prisma productPrice.update() + custom-field upserts
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.editProductPriceByProductCondition}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - Update payload with productPriceId and field overrides.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Patch('/editProductPriceByProductCondition')
  editProductPriceByProductCondition(@Request() req, @Body() payload: any) {
    return this.productService.editProductPriceByProductCondition(payload, req);
  }

  /**
   * @method addCountry
   * @description Creates a new country record in the product-location reference data.
   *
   * @intent Populate the country master list used for geo-sell-region assignment.
   *
   * @usage `POST /product/addCountry` (public -- AuthGuard commented out)
   *
   * @dataflow payload -> Prisma productCountry.create() -> { status, message, data }
   *
   * @dependencies {@link ProductService.addCountry}
   *
   * @notes Guard is commented out; this route is currently publicly accessible.
   *
   * @param {any} req - Express request object.
   * @param {any} payload - Country data (name, code, etc.).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  // @UseGuards(AuthGuard)
  @Post('/addCountry')
  addCountry(@Request() req, @Body() payload: any) {
    return this.productService.addCountry(payload, req);
  }

  /**
   * @method countryList
   * @description Retrieves all active country records.
   *
   * @intent Populate country dropdown selectors on the frontend.
   *
   * @usage `GET /product/countryList` (public)
   *
   * @dataflow Prisma productCountry.findMany({ status: 'ACTIVE' })
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.countryList}
   *
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @Get('/countryList')
  countryList() {
    return this.productService.countryList();
  }

  /**
   * @method addLocation
   * @description Creates a new location record in the product-location reference data.
   *
   * @intent Populate the location master list for product geographic assignments.
   *
   * @usage `POST /product/addLocation` (public)
   *
   * @dataflow payload -> Prisma productLocation.create() -> { status, message, data }
   *
   * @dependencies {@link ProductService.addLocation}
   *
   * @param {any} req - Express request object.
   * @param {any} payload - Location data (name, coordinates, etc.).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @Post('/addLocation')
  addLocation(@Request() req, @Body() payload: any) {
    return this.productService.addLocation(payload, req);
  }

  /**
   * @method locationList
   * @description Retrieves all active location records.
   *
   * @intent Populate location dropdown selectors on the frontend.
   *
   * @usage `GET /product/locationList` (public)
   *
   * @dataflow Prisma productLocation.findMany({ status: 'ACTIVE' })
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.locationList}
   *
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @Get('/locationList')
  locationList() {
    return this.productService.locationList();
  }

  /**
   * @method productViewCount
   * @description Increments the view counter for a product (analytics tracking).
   *
   * @intent Track product page impressions for popularity / analytics dashboards.
   *
   * @usage `PATCH /product/productViewCount` (public)
   *
   * @dataflow req.body.productId -> Prisma product.update({ viewCount: increment })
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.productViewCount}
   *
   * @notes Reads productId from `req.body`, not query params.
   *
   * @param {any} req - Express request with body containing `productId`.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @Patch('/productViewCount')
  productViewCount(@Request() req) {
    return this.productService.productViewCount(req);
  }

  @Post('/trackClick')
  trackProductClick(@Request() req, @Body() payload: any) {
    return this.productService.trackProductClick(req, payload);
  }

  @Post('/trackSearch')
  trackProductSearch(@Request() req, @Body() payload: any) {
    return this.productService.trackProductSearch(req, payload);
  }

  /**
   * @method getAllProduct
   * @description Retrieves a paginated, sortable, filterable list of all marketplace
   *   products (storefront product listing).
   *
   * @intent Power the main storefront browse / search page.
   *
   * @usage `GET /product/getAllProduct?page=1&limit=20&sort=price_asc&term=phone&brandIds=1,2&priceMin=10&priceMax=500&categoryIds=3,4&userType=VENDOR`
   *   (public)
   *
   * @dataflow Query params -> Prisma product.findMany() with dynamic where/orderBy
   *   including price range, brand, category, userType filters
   *   -> { status, message, data, totalCount }
   *
   * @dependencies {@link ProductService.getAllProduct}
   *
   * @notes
   *   - `sort` accepts values like 'price_asc', 'price_desc', 'newest', etc.
   *   - `userType` filters by seller's trade role (e.g. vendor-only products).
   *
   * @param {any} req - Express request object.
   * @param {number} page - Page number (1-based).
   * @param {number} limit - Items per page.
   * @param {string} sort - Sort key.
   * @param {string} term - Search term.
   * @param {any} brandIds - Comma-separated brand IDs.
   * @param {any} priceMin - Minimum price filter.
   * @param {any} priceMax - Maximum price filter.
   * @param {any} userId - Optional user ID filter.
   * @param {any} categoryIds - Comma-separated category IDs.
   * @param {any} userType - Seller type filter (e.g. 'VENDOR').
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number}>}
   */
  @Get('/getAllProduct')
  getAllProduct(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('sort') sort: string,
    @Query('term') term: string,
    @Query('brandIds') brandIds: any,
    @Query('priceMin') priceMin: any,
    @Query('priceMax') priceMax: any,
    @Query('userId') userId: any,
    @Query('categoryIds') categoryIds: any,
    @Query('userType') userType: any,
    @Query('specFilters') specFilters: any,
  ) {
    // Parse specFilters from JSON string if provided
    let parsedSpecFilters: Record<string, string[]> | undefined;
    if (specFilters) {
      try {
        parsedSpecFilters = typeof specFilters === 'string' ? JSON.parse(specFilters) : specFilters;
      } catch (e) {
        // Ignore invalid JSON
      }
    }

    return this.productService.getAllProduct(
      page,
      limit,
      req,
      term,
      sort,
      brandIds,
      priceMin,
      priceMax,
      userId,
      categoryIds,
      userType,
      parsedSpecFilters,
    );
  }

  /**
   * @method getSearchSuggestions
   * @description Returns autocomplete suggestions for the search bar.
   *   Includes product name matches, category matches, popular searches,
   *   and user's recent searches.
   *
   * @usage `GET /product/search/suggestions?term=iph&userId=1&deviceId=abc`
   */
  @Get('/searchSuggestions')
  getSearchSuggestions(
    @Query('term') term: string,
    @Query('userId') userId: any,
    @Query('deviceId') deviceId: string,
  ) {
    return this.productService.getSearchSuggestions(
      term,
      userId ? parseInt(userId) : undefined,
      deviceId,
    );
  }

  /**
   * @method aiSearch
   * @description AI-powered natural language search. Parses query using LLM to extract
   *   structured filters, expands via tag semantics, and returns ranked results.
   *
   * @usage `GET /product/search/ai?q=red+leather+bag+under+50&page=1&limit=20`
   */
  @Get('/search/ai')
  aiSearch(
    @Query('q') query: string,
    @Query('page') page: any,
    @Query('limit') limit: any,
    @Query('userId') userId: any,
    @Query('userType') userType: string,
  ) {
    return this.productService.aiSearch({
      query,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 20,
      userId: userId ? parseInt(userId) : undefined,
      userType,
    });
  }

  /**
   * @method getAllProductByUserBusinessCategory
   * @description Retrieves products matching the authenticated user's business category.
   *
   * @intent Show personalised product recommendations based on the seller's business profile.
   *
   * @usage `GET /product/getAllProductByUserBusinessCategory` (AuthGuard protected)
   *
   * @dataflow req.user.id -> user profile lookup -> category match
   *   -> Prisma product query -> { status, message, data }
   *
   * @dependencies {@link ProductService.getAllProductByUserBusinessCategory}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Get('/getAllProductByUserBusinessCategory')
  getAllProductByUserBusinessCategory(@Request() req) {
    return this.productService.getAllProductByUserBusinessCategory(req);
  }

  /**
   * @method existingAllProduct
   * @description Retrieves a paginated list of existing catalogue products with advanced
   *   filters, scoped by the brand's original creator (brandAddedBy).
   *
   * @intent Allow sellers to browse the existing catalogue when adding their own prices
   *   to already-registered products.
   *
   * @usage `GET /product/existingAllProduct?page=1&limit=20&brandAddedBy=5`
   *   (public)
   *
   * @dataflow Query params -> Prisma product.findMany() with brand/category/price filters
   *   -> { status, message, data, totalCount }
   *
   * @dependencies {@link ProductService.existingAllProduct}
   *
   * @param {any} req - Express request object.
   * @param {number} page - Page number (1-based).
   * @param {number} limit - Items per page.
   * @param {string} sort - Sort key.
   * @param {string} term - Search term.
   * @param {any} brandIds - Comma-separated brand IDs.
   * @param {any} priceMin - Minimum price filter.
   * @param {any} priceMax - Maximum price filter.
   * @param {any} userId - Optional user ID filter.
   * @param {any} categoryIds - Comma-separated category IDs.
   * @param {any} brandAddedBy - User ID of the brand's original creator.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number}>}
   */
  @Get('/existingAllProduct')
  existingAllProduct(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('sort') sort: string,
    @Query('term') term: string,
    @Query('brandIds') brandIds: any,
    @Query('priceMin') priceMin: any,
    @Query('priceMax') priceMax: any,
    @Query('userId') userId: any,
    @Query('categoryIds') categoryIds: any,
    @Query('brandAddedBy') brandAddedBy: any,
  ) {
    return this.productService.existingAllProduct(
      page,
      limit,
      req,
      term,
      sort,
      brandIds,
      priceMin,
      priceMax,
      userId,
      categoryIds,
      brandAddedBy,
    );
  }

  /**
   * @method sameBrandAllProduct
   * @description Retrieves products sharing the same brand, excluding the current product.
   *
   * @intent Power the "More from this brand" recommendation section on the PDP.
   *
   * @usage `GET /product/sameBrandAllProduct?brandIds=5&productId=42&page=1&limit=10`
   *   (public)
   *
   * @dataflow brandIds + productId exclusion -> Prisma product.findMany()
   *   -> { status, message, data, totalCount }
   *
   * @dependencies {@link ProductService.sameBrandAllProduct}
   *
   * @param {any} req - Express request object.
   * @param {number} page - Page number (1-based).
   * @param {number} limit - Items per page.
   * @param {any} brandIds - Comma-separated brand IDs to match.
   * @param {any} userId - Optional user ID for wishlist detection.
   * @param {any} productId - Product ID to exclude from results.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number}>}
   */
  @Get('/sameBrandAllProduct')
  sameBrandAllProduct(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('brandIds') brandIds: any,
    @Query('userId') userId: any,
    @Query('productId') productId: any,
  ) {
    return this.productService.sameBrandAllProduct(
      page,
      limit,
      req,
      brandIds,
      userId,
      productId,
    );
  }

  /**
   * @method relatedAllProduct
   * @description Retrieves products related by shared tags, excluding the current product.
   *
   * @intent Power the "Related Products" recommendation section on the PDP.
   *
   * @usage `GET /product/relatedAllProduct?tagIds=1,2,3&productId=42&page=1&limit=10`
   *   (public)
   *
   * @dataflow tagIds + productId exclusion -> Prisma product.findMany() joined via productTags
   *   -> { status, message, data, totalCount }
   *
   * @dependencies {@link ProductService.relatedAllProduct}
   *
   * @param {number} page - Page number (1-based).
   * @param {number} limit - Items per page.
   * @param {any} tagIds - Comma-separated tag IDs to match.
   * @param {any} userId - Optional user ID for wishlist detection.
   * @param {any} productId - Product ID to exclude from results.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number}>}
   */
  @Get('/relatedAllProduct')
  relatedAllProduct(
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('tagIds') tagIds: any,
    @Query('userId') userId: any,
    @Query('productId') productId: any,
  ) {
    return this.productService.relatedAllProduct(
      page,
      limit,
      tagIds,
      userId,
      productId,
    );
  }

  // ----- Product Review -----

  /**
   * @method addProductReview
   * @description Creates a new product review (rating + text) by an authenticated user.
   *
   * @intent Allow buyers to rate and review products they have purchased.
   *
   * @usage `POST /product/addProductReview` (AuthGuard protected)
   *
   * @dataflow payload (productId, rating, review) -> Prisma productReview.create()
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.addProductReview}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - Review data (productId, rating, review text).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Post('/addProductReview')
  addProductReview(@Request() req, @Body() payload: any) {
    return this.productService.addProductReview(payload, req);
  }

  /**
   * @method editProductReview
   * @description Updates an existing product review.
   *
   * @intent Allow buyers to modify their previously submitted review.
   *
   * @usage `PATCH /product/editProductReview` (AuthGuard protected)
   *
   * @dataflow payload (productReviewId, updated fields) -> Prisma productReview.update()
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.editProductReview}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - Updated review data with productReviewId.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Patch('/editProductReview')
  editProductReview(@Request() req, @Body() payload: any) {
    return this.productService.editProductReview(payload, req);
  }

  /**
   * @method getOneProductReview
   * @description Retrieves a single product review by its primary key.
   *
   * @intent Fetch full details of a specific review for display or editing.
   *
   * @usage `GET /product/getOneProductReview?productReviewId=10` (public)
   *
   * @dataflow productReviewId -> Prisma productReview.findUnique() with user include
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.getOneProductReview}
   *
   * @param {number} productReviewId - Primary key of the review.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @Get('/getOneProductReview')
  getOneProductReview(@Query('productReviewId') productReviewId: number) {
    return this.productService.getOneProductReview(productReviewId);
  }

  /**
   * @method getAllProductReview
   * @description Retrieves a paginated, sortable list of reviews for a specific product.
   *
   * @intent Power the product review section on the PDP.
   *
   * @usage `GET /product/getAllProductReview?productId=42&page=1&limit=10&sortType=newest`
   *   (public)
   *
   * @dataflow productId + pagination/sort -> Prisma productReview.findMany()
   *   -> { status, message, data, totalCount }
   *
   * @dependencies {@link ProductService.getAllProductReview}
   *
   * @param {any} productId - Product to fetch reviews for.
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} sortType - Sort order (e.g. 'newest', 'highest', 'lowest').
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number}>}
   */
  @Get('/getAllProductReview')
  getAllProductReview(
    @Query('productId') productId: any,
    @Query('page') page: any,
    @Query('limit') limit: any,
    @Query('sortType') sortType: any,
  ) {
    return this.productService.getAllProductReview(
      page,
      limit,
      productId,
      sortType,
    );
  }

  /**
   * @method getAllProductReviewBySellerId
   * @description Retrieves all product reviews for products owned by the authenticated seller.
   *
   * @intent Power the seller's review management dashboard.
   *
   * @usage `GET /product/getAllProductReviewBySellerId?page=1&limit=10&sortType=newest`
   *   (AuthGuard protected)
   *
   * @dataflow req.user.id -> HelperService.getAdminId() -> Prisma productReview.findMany()
   *   where product.adminId matches -> { status, message, data, totalCount }
   *
   * @dependencies {@link ProductService.getAllProductReviewBySellerId}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} sortType - Sort order.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number}>}
   */
  @UseGuards(AuthGuard)
  @Get('/getAllProductReviewBySellerId')
  getAllProductReviewBySellerId(
    @Request() req,
    @Query('page') page: any,
    @Query('limit') limit: any,
    @Query('sortType') sortType: any,
  ) {
    return this.productService.getAllProductReviewBySellerId(
      page,
      limit,
      req,
      sortType,
    );
  }

  // ProductPriceReview BY User

  /**
   * @method addProductPriceReview
   * @description Creates a review for a specific seller's product-price entry (not the product itself).
   *
   * @intent Allow buyers to rate individual seller listings rather than just the product.
   *
   * @usage `POST /product/addProductPriceReview` (AuthGuard protected)
   *
   * @dataflow payload (productPriceId, rating, review) -> Prisma productPriceReview.create()
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.addProductPriceReview}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - Review data targeting a productPriceId.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Post('/addProductPriceReview')
  addProductPriceReview(@Request() req, @Body() payload: any) {
    return this.productService.addProductPriceReview(payload, req);
  }

  /**
   * @method updateOneProductPriceReview
   * @description Updates an existing product-price review.
   *
   * @intent Allow buyers to modify their seller-specific review.
   *
   * @usage `PATCH /product/updateOneProductPriceReview` (AuthGuard protected)
   *
   * @dataflow payload (productPriceReviewId, updated fields) -> Prisma productPriceReview.update()
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.updateOneProductPriceReview}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - Updated review data with productPriceReviewId.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Patch('/updateOneProductPriceReview')
  updateOneProductPriceReview(@Request() req, @Body() payload: any) {
    return this.productService.updateOneProductPriceReview(payload, req);
  }

  /**
   * @method getOneProductPriceReview
   * @description Retrieves a single product-price review by its primary key.
   *
   * @intent Fetch full details of a seller-specific review.
   *
   * @usage `GET /product/getOneProductPriceReview?productPriceReviewId=15` (public)
   *
   * @dataflow productPriceReviewId -> Prisma productPriceReview.findUnique()
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.getOneProductPriceReview}
   *
   * @param {number} productPriceReviewId - Primary key of the price review.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @Get('/getOneProductPriceReview')
  getOneProductPriceReview(
    @Query('productPriceReviewId') productPriceReviewId: number,
  ) {
    return this.productService.getOneProductPriceReview(productPriceReviewId);
  }

  /**
   * @method getAllProductPriceReviewBySellerId
   * @description Retrieves all product-price reviews for a specific seller,
   *   with pagination and sorting.
   *
   * @intent Power the seller's price-level review dashboard / public review section.
   *
   * @usage `GET /product/getAllProductPriceReviewBySellerId?sellerId=7&page=1&limit=10`
   *   (public -- AuthGuard commented out)
   *
   * @dataflow sellerId + pagination/sort -> Prisma productPriceReview.findMany()
   *   -> { status, message, data, totalCount }
   *
   * @dependencies {@link ProductService.getAllProductPriceReviewBySellerId}
   *
   * @param {any} req - Express request object.
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} sellerId - Seller user ID whose reviews to fetch.
   * @param {any} sortType - Sort order.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number}>}
   */
  // @UseGuards(AuthGuard)
  @Get('/getAllProductPriceReviewBySellerId')
  getAllProductPriceReviewBySellerId(
    @Request() req,
    @Query('page') page: any,
    @Query('limit') limit: any,
    @Query('sellerId') sellerId: any,
    @Query('sortType') sortType: any,
  ) {
    return this.productService.getAllProductPriceReviewBySellerId(
      page,
      limit,
      sellerId,
      sortType,
    );
  }

  /**
   * --------------- Question & Answer
   */

  /**
   * @method askQuestion
   * @description Creates a new question on a product listing.
   *
   * @intent Allow authenticated buyers to ask questions about a product on its detail page.
   *
   * @usage `POST /product/askQuestion` (AuthGuard protected)
   *
   * @dataflow payload (productId, question text) -> Prisma productQuestion.create()
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.askQuestion}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - Question data (productId, question).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Post('/askQuestion')
  askQuestion(@Request() req, @Body() payload: any) {
    return this.productService.askQuestion(payload, req);
  }

  /**
   * @method getAllQuestion
   * @description Retrieves a paginated, sortable list of questions for a product,
   *   with optional userType filtering.
   *
   * @intent Power the Q&A section on the product detail page.
   *
   * @usage `GET /product/getAllQuestion?productId=42&page=1&limit=10&sortType=newest&userType=VENDOR`
   *   (public)
   *
   * @dataflow productId + pagination/sort/userType -> Prisma productQuestion.findMany()
   *   with answers included -> { status, message, data, totalCount }
   *
   * @dependencies {@link ProductService.getAllQuestion}
   *
   * @param {any} productId - Product to fetch questions for.
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} sortType - Sort order.
   * @param {any} req - Express request object.
   * @param {any} userType - Optional filter by user type.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number}>}
   */
  @Get('/getAllQuestion')
  getAllQuestion(
    @Query('productId') productId: any,
    @Query('page') page: any,
    @Query('limit') limit: any,
    @Query('sortType') sortType: any,
    @Request() req,
    @Query('userType') userType: any,
  ) {
    return this.productService.getAllQuestion(
      page,
      limit,
      productId,
      sortType,
      userType,
      req,
    );
  }

  /**
   * @method giveAnswer
   * @description Adds or updates an answer to an existing product question.
   *
   * @intent Allow sellers or other users to answer questions posted on a product.
   *
   * @usage `PATCH /product/giveAnswer` (AuthGuard protected)
   *
   * @dataflow payload (productQuestionId, answer text) -> Prisma productQuestion.update()
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.giveAnswer}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - Answer data (productQuestionId, answer).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Patch('/giveAnswer')
  giveAnswer(@Request() req, @Body() payload: any) {
    return this.productService.giveAnswer(payload, req);
  }

  /**
   *
   *            ---- **** RFQ PRODUCT **** ----
   */

  /**
   * @method getAllRfqProduct
   * @description Retrieves a paginated list of RFQ (Request For Quotation) products
   *   with search, brand, admin, and sort filtering.
   *
   * @intent Power the RFQ product listing / dashboard for buyers and sellers.
   *
   * @usage `GET /product/getAllRfqProduct?page=1&limit=10&term=phone&adminId=5&sortType=newest`
   *   (AuthGuard protected)
   *
   * @dataflow Query params -> Prisma rfqProduct.findMany() with includes
   *   -> { status, message, data, totalCount }
   *
   * @dependencies {@link ProductService.getAllRfqProduct}
   *
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {string} term - Search term.
   * @param {any} adminId - Optional admin/seller ID filter.
   * @param {any} sortType - Sort order.
   * @param {any} req - Express request object.
   * @param {any} brandIds - Comma-separated brand IDs.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number}>}
   */
  @UseGuards(AuthGuard)
  @Get('/getAllRfqProduct')
  getAllRfqProduct(
    @Query('page') page: any,
    @Query('limit') limit: any,
    @Query('term') term: string,
    @Query('adminId') adminId: any,
    @Query('sortType') sortType: any,
    @Request() req,
    @Query('brandIds') brandIds: any,
  ) {
    return this.productService.getAllRfqProduct(
      page,
      limit,
      term,
      adminId,
      sortType,
      req,
      brandIds,
    );
  }

  /**
   * @method addRfqProduct
   * @description Creates a new RFQ product listing.
   *
   * @intent Allow authenticated buyers to submit an RFQ for a product they need.
   *
   * @usage `POST /product/addRfqProduct` (AuthGuard protected)
   *
   * @dataflow payload -> Prisma rfqProduct.create() + related records
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.addRfqProduct}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - RFQ product data.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Post('/addRfqProduct')
  addRfqProduct(@Request() req, @Body() payload: any) {
    return this.productService.addRfqProduct(payload, req);
  }

  /**
   * @method editRfqProduct
   * @description Updates an existing RFQ product listing.
   *
   * @intent Allow the RFQ creator to modify their request details.
   *
   * @usage `PATCH /product/editRfqProduct` (AuthGuard protected)
   *
   * @dataflow payload (rfqProductId + updates) -> Prisma rfqProduct.update()
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.editRfqProduct}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - Updated RFQ product data with rfqProductId.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Patch('/editRfqProduct')
  editRfqProduct(@Request() req, @Body() payload: any) {
    return this.productService.editRfqProduct(payload, req);
  }

  /**
   * @method getOneRfqProduct
   * @description Retrieves a single RFQ product by its primary key with full includes.
   *
   * @intent Power the RFQ product detail page.
   *
   * @usage `GET /product/getOneRfqProduct?rfqProductId=10`
   *   (public -- AuthGuard commented out)
   *
   * @dataflow rfqProductId -> Prisma rfqProduct.findUnique() with deep includes
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.getOneRfqProduct}
   *
   * @param {number} rfqProductId - Primary key of the RFQ product.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  // @UseGuards(AuthGuard)
  @Get('/getOneRfqProduct')
  getOneRfqProduct(@Query('rfqProductId') rfqProductId: number) {
    return this.productService.getOneRfqProduct(rfqProductId);
  }

  /**
   * @method addProductDuplicateRfq
   * @description Duplicates an existing product into the RFQ system.
   *
   * @intent Allow sellers to quickly create an RFQ listing from an existing product.
   *
   * @usage `POST /product/addProductDuplicateRfq` (AuthGuard protected)
   *
   * @dataflow payload (productId) -> service copies product data -> Prisma rfqProduct.create()
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.addProductDuplicateRfq}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - Source product reference (productId).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Post('/addProductDuplicateRfq')
  addProductDuplicateRfq(@Request() req, @Body() payload: any) {
    return this.productService.addProductDuplicateRfq(payload, req);
  }

  /**
   * @method allCompanyFreelancer
   * @description Retrieves all company and freelancer users matching specific criteria.
   *
   * @intent Support RFQ quote distribution by listing potential sellers/freelancers.
   *
   * @usage `POST /product/allCompanyFreelancer` (AuthGuard protected)
   *
   * @dataflow payload (filter criteria) -> Prisma user.findMany() with profile includes
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.allCompanyFreelancer}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - Filter criteria for company/freelancer lookup.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Post('/allCompanyFreelancer')
  allCompanyFreelancer(@Request() req, @Body() payload: any) {
    return this.productService.allCompanyFreelancer(payload, req);
  }

  /**
   * @method addRfqQuotes
   * @description Creates RFQ quote requests targeting specific sellers for a product.
   *
   * @intent Allow buyers to send quote requests to multiple sellers for an RFQ product.
   *
   * @usage `POST /product/addRfqQuotes` (AuthGuard protected)
   *
   * @dataflow payload (rfqProductId, seller list) -> Prisma rfqQuotes.create() per seller
   *   + notification dispatch -> { status, message, data }
   *
   * @dependencies {@link ProductService.addRfqQuotes}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - Quote request data (rfqProductId, targeted sellers).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Post('/addRfqQuotes')
  addRfqQuotes(@Request() req, @Body() payload: any) {
    return this.productService.addRfqQuotes(payload, req);
  }

  /**
   * @method getAllRfqQuotesByBuyerID
   * @description Retrieves all RFQ quotes created by the authenticated buyer, paginated.
   *
   * @intent Power the buyer's "My RFQ Quotes" dashboard.
   *
   * @usage `GET /product/getAllRfqQuotesByBuyerID?page=1&limit=10` (AuthGuard protected)
   *
   * @dataflow req.user.id -> Prisma rfqQuotes.findMany() with includes
   *   -> { status, message, data, totalCount }
   *
   * @dependencies {@link ProductService.getAllRfqQuotesByBuyerID}
   *
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number}>}
   */
  @UseGuards(AuthGuard)
  @Get('/getAllRfqQuotesByBuyerID')
  getAllRfqQuotesByBuyerID(
    @Query('page') page: any,
    @Query('limit') limit: any,
    @Request() req,
  ) {
    return this.productService.getAllRfqQuotesByBuyerID(page, limit, req);
  }

  /**
   * @method deleteOneRfqQuote
   * @description Soft-deletes a single RFQ quote (status='DELETE', deletedAt=now).
   *
   * @intent Allow buyers to remove an RFQ quote they no longer need.
   *
   * @usage `DELETE /product/deleteOneRfqQuote?rfqQuotesId=5` (AuthGuard protected)
   *
   * @dataflow rfqQuotesId -> Prisma rfqQuotes.update({ status: 'DELETE' })
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.deleteOneRfqQuote}
   *
   * @param {any} rfqQuotesId - Primary key of the RFQ quote.
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Delete('/deleteOneRfqQuote')
  deleteOneRfqQuote(@Query('rfqQuotesId') rfqQuotesId: any, @Request() req) {
    return this.productService.deleteOneRfqQuote(rfqQuotesId, req);
  }

  /**
   * @method getAllRfqQuotesUsersByBuyerID
   * @description Retrieves all sellers who received a specific RFQ quote from the buyer,
   *   with pagination.
   *
   * @intent Show the buyer which sellers they sent an RFQ quote to and their responses.
   *
   * @usage `GET /product/getAllRfqQuotesUsersByBuyerID?rfqQuotesId=5&page=1&limit=10`
   *   (AuthGuard protected)
   *
   * @dataflow rfqQuotesId + req.user.id -> Prisma rfqQuotesUser.findMany()
   *   -> { status, message, data, totalCount }
   *
   * @dependencies {@link ProductService.getAllRfqQuotesUsersByBuyerID}
   *
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} rfqQuotesId - Primary key of the RFQ quote.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number}>}
   */
  @UseGuards(AuthGuard)
  @Get('/getAllRfqQuotesUsersByBuyerID')
  getAllRfqQuotesUsersByBuyerID(
    @Query('page') page: any,
    @Query('limit') limit: any,
    @Request() req,
    @Query('rfqQuotesId') rfqQuotesId: any,
  ) {
    return this.productService.getAllRfqQuotesUsersByBuyerID(
      page,
      limit,
      req,
      rfqQuotesId,
    );
  }

  /**
   * @method getOneRfqQuotesUsersByBuyerID
   * @description Retrieves a single RFQ quote user record (seller response) for a buyer.
   *
   * @intent Show detailed seller response for a specific RFQ quote.
   *
   * @usage `GET /product/getOneRfqQuotesUsersByBuyerID?rfqQuotesId=5` (AuthGuard protected)
   *
   * @dataflow rfqQuotesId + req.user.id -> Prisma rfqQuotesUser.findFirst()
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.getOneRfqQuotesUsersByBuyerID}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} rfqQuotesId - Primary key of the RFQ quote.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Get('/getOneRfqQuotesUsersByBuyerID')
  getOneRfqQuotesUsersByBuyerID(
    @Request() req,
    @Query('rfqQuotesId') rfqQuotesId: any,
  ) {
    return this.productService.getOneRfqQuotesUsersByBuyerID(req, rfqQuotesId);
  }

  /**
   * @method getAllRfqQuotesUsersBySellerID
   * @description Retrieves all RFQ quote requests received by the authenticated seller,
   *   with pagination.
   *
   * @intent Power the seller's "Incoming RFQ Quotes" dashboard.
   *
   * @usage `GET /product/getAllRfqQuotesUsersBySellerID?page=1&limit=10`
   *   (AuthGuard protected)
   *
   * @dataflow req.user.id -> Prisma rfqQuotesUser.findMany() where sellerId matches
   *   -> { status, message, data, totalCount }
   *
   * @dependencies {@link ProductService.getAllRfqQuotesUsersBySellerID}
   *
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number}>}
   */
  @UseGuards(AuthGuard)
  @Get('/getAllRfqQuotesUsersBySellerID')
  getAllRfqQuotesUsersBySellerID(
    @Query('page') page: any,
    @Query('limit') limit: any,
    @Query('showHidden') showHidden: any,
    @Request() req,
  ) {
    const showHiddenBool = showHidden === 'true' || showHidden === true;
    return this.productService.getAllRfqQuotesUsersBySellerID(
      page,
      limit,
      req,
      showHiddenBool,
    );
  }

  @UseGuards(AuthGuard)
  @Patch('/hideRfqRequest')
  hideRfqRequest(
    @Body() body: { rfqQuotesUserId: number; isHidden: boolean },
    @Request() req,
  ) {
    return this.productService.hideRfqRequest(
      body.rfqQuotesUserId,
      body.isHidden,
      req,
    );
  }

  /**
   * @method rfqFindOne
   * @description Retrieves a single RFQ-type product detail with seller and wishlist info.
   *
   * @intent Power the RFQ product detail page for public viewers.
   *
   * @usage `GET /product/rfqFindOne?productId=42&userId=5` (public)
   *
   * @dataflow productId + userId -> Prisma product.findUnique() with RFQ-specific includes
   *   -> wishlist check -> { status, message, data }
   *
   * @dependencies {@link ProductService.rfqFindOne}
   *
   * @param {any} req - Express request object.
   * @param {number} productId - Primary key of the product.
   * @param {number} userId - Optional viewer user ID for wishlist detection.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @Get('/rfqFindOne')
  rfqFindOne(
    @Request() req,
    @Query('productId') productId: number,
    @Query('userId') userId: number,
  ) {
    return this.productService.rfqFindOne(productId, userId, req);
  }

  // ---- **** RFQ PRODUCT END **** ----

  // ---- **** CUSTOM FIELD FOR PRODUCT BEGINS **** ----

  /**
   * @method createCustomFieldValue
   * @description Creates or updates custom field values for a product-price entry.
   *
   * @intent Allow sellers to attach dynamic form field answers (defined per category)
   *   to their product price listings.
   *
   * @usage `POST /product/createCustomFieldValue` (AuthGuard protected)
   *
   * @dataflow payload (productPriceId, field values) -> Prisma customFieldValue upserts
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.createCustomFieldValue}
   *
   * @notes Custom fields are category-driven; the schema is defined in `dynamicFormCategory`.
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - Custom field data (productPriceId, field ID-value pairs).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Post('/createCustomFieldValue')
  createCustomFieldValue(@Request() req, @Body() payload: any) {
    return this.productService.createCustomFieldValue(payload, req);
  }

  // ---- **** CUSTOM FIELD FOR PRODUCT ENDS **** ----

  // -------------------------------------------------------------- Factories Product Begins -------------------------------------------------------  */

  /**
   * @method getAllFactoriesProduct
   * @description Retrieves a paginated list of factories-type products (isCustomProduct='true'),
   *   with search, brand, admin, sort, and userType filtering.
   *
   * @intent Power the Factories product listing page where buyers browse
   *   customisable / factory-direct products.
   *
   * @usage `GET /product/getAllFactoriesProduct?page=1&limit=10&term=widget&adminId=5`
   *   (AuthGuard protected)
   *
   * @dataflow Query params -> Prisma product.findMany() filtered by menuId=10 (factories)
   *   -> { status, message, data, totalCount }
   *
   * @dependencies {@link ProductService.getAllFactoriesProduct}
   *
   * @param {any} page - Page number (1-based).
   * @param {any} limit - Items per page.
   * @param {string} term - Search term.
   * @param {any} adminId - Optional admin/seller ID filter.
   * @param {any} sortType - Sort order.
   * @param {any} req - Express request object.
   * @param {any} brandIds - Comma-separated brand IDs.
   * @param {any} userType - Seller type filter.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number}>}
   */
  @UseGuards(AuthGuard)
  @Get('/getAllFactoriesProduct')
  getAllFactoriesProduct(
    @Query('page') page: any,
    @Query('limit') limit: any,
    @Query('term') term: string,
    @Query('adminId') adminId: any,
    @Query('sortType') sortType: any,
    @Request() req,
    @Query('brandIds') brandIds: any,
    @Query('userType') userType: any,
  ) {
    return this.productService.getAllFactoriesProduct(
      page,
      limit,
      term,
      adminId,
      sortType,
      req,
      brandIds,
      userType,
    );
  }

  /**
   * @method getAllFactoriesProductByUserBusinessCategory
   * @description Retrieves factories products matching the authenticated user's business category.
   *
   * @intent Show personalised factory-direct product recommendations.
   *
   * @usage `GET /product/getAllFactoriesProductByUserBusinessCategory` (AuthGuard protected)
   *
   * @dataflow req.user.id -> user profile category -> Prisma product query (menuId=10)
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.getAllFactoriesProductByUserBusinessCategory}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Get('/getAllFactoriesProductByUserBusinessCategory')
  getAllFactoriesProductByUserBusinessCategory(@Request() req) {
    return this.productService.getAllFactoriesProductByUserBusinessCategory(
      req,
    );
  }

  /**
   * @method addProductDuplicateFactories
   * @description Duplicates an existing product into the factories system with customisation.
   *
   * @intent Allow sellers to clone a product and adapt it for factory-direct / customised sales.
   *
   * @usage `POST /product/addProductDuplicateFactories` (AuthGuard protected)
   *
   * @dataflow payload (productId + overrides) -> service clones product + creates
   *   factory-specific productPrice -> { status, message, data }
   *
   * @dependencies {@link ProductService.addProductDuplicateFactories}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - Source product ID and factory-specific overrides.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Post('/addProductDuplicateFactories')
  addProductDuplicateFactories(@Request() req, @Body() payload: any) {
    return this.productService.addProductDuplicateFactories(payload, req);
  }

  /**
   * @method addCustomizeProduct
   * @description Creates a customised product variant from a factory product.
   *
   * @intent Allow buyers to submit customisation requests for factory products.
   *
   * @usage `POST /product/addCustomizeProduct` (AuthGuard protected)
   *
   * @dataflow payload (productId, customisation details) -> Prisma customizeProduct.create()
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.addCustomizeProduct}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - Customisation request data.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Post('/addCustomizeProduct')
  addCustomizeProduct(@Request() req, @Body() payload: any) {
    return this.productService.addCustomizeProduct(payload, req);
  }

  /**
   * @method createFactoriesRequest
   * @description Creates a request to a factory for product manufacturing.
   *
   * @intent Allow buyers to formally request factory production of a customised product.
   *
   * @usage `POST /product/createFactoriesRequest` (AuthGuard protected)
   *
   * @dataflow payload (factory details, product specs) -> Prisma factoriesRequest.create()
   *   + notification to factory -> { status, message, data }
   *
   * @dependencies {@link ProductService.createFactoriesRequest}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - Factory request data.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Post('/createFactoriesRequest')
  createFactoriesRequest(@Request() req, @Body() payload: any) {
    return this.productService.createFactoriesRequest(payload, req);
  }

  /**
   * @method getAllBuyGroupProduct
   * @description Retrieves a paginated list of buy-group products (sellType='BUYGROUP')
   *   with full storefront filtering capabilities.
   *
   * @intent Power the Buy Group product listing page for group-buying.
   *
   * @usage `GET /product/getAllBuyGroupProduct?page=1&limit=20&sort=price_asc`
   *   (public)
   *
   * @dataflow Query params -> Prisma product.findMany() filtered by menuId=9 (buy group)
   *   -> { status, message, data, totalCount }
   *
   * @dependencies {@link ProductService.getAllBuyGroupProduct}
   *
   * @param {any} req - Express request object.
   * @param {number} page - Page number (1-based).
   * @param {number} limit - Items per page.
   * @param {string} sort - Sort key.
   * @param {string} term - Search term.
   * @param {any} brandIds - Comma-separated brand IDs.
   * @param {any} priceMin - Minimum price filter.
   * @param {any} priceMax - Maximum price filter.
   * @param {any} userId - Optional user ID.
   * @param {any} categoryIds - Comma-separated category IDs.
   * @param {any} userType - Seller type filter.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number}>}
   */
  @Get('/getAllBuyGroupProduct')
  getAllBuyGroupProduct(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('sort') sort: string,
    @Query('term') term: string,
    @Query('brandIds') brandIds: any,
    @Query('priceMin') priceMin: any,
    @Query('priceMax') priceMax: any,
    @Query('userId') userId: any,
    @Query('categoryIds') categoryIds: any,
    @Query('userType') userType: any,
  ) {
    return this.productService.getAllBuyGroupProduct(
      page,
      limit,
      req,
      term,
      sort,
      brandIds,
      priceMin,
      priceMax,
      userId,
      categoryIds,
      userType,
    );
  }

  /**
   * @method getAllBuyGroupProductByUserBusinessCategory
   * @description Retrieves buy-group products matching the user's business category.
   *
   * @intent Show personalised buy-group product recommendations.
   *
   * @usage `GET /product/getAllBuyGroupProductByUserBusinessCategory` (AuthGuard protected)
   *
   * @dataflow req.user.id -> user profile category -> Prisma product query (menuId=9)
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.getAllBuyGroupProductByUserBusinessCategory}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Get('/getAllBuyGroupProductByUserBusinessCategory')
  getAllBuyGroupProductByUserBusinessCategory(@Request() req) {
    return this.productService.getAllBuyGroupProductByUserBusinessCategory(req);
  }

  /**
   * Seller Reward
   */

  /**
   * @method createSellerRewardProduct
   * @description Creates a seller reward programme entry linked to a product-price.
   *
   * @intent Allow sellers to configure reward/incentive programmes on specific listings.
   *
   * @usage `POST /product/createSellerRewardProduct` (AuthGuard protected)
   *
   * @dataflow payload (productPriceId, reward config) -> Prisma sellerReward.create()
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.createSellerRewardProduct}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - Reward configuration data.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Post('/createSellerRewardProduct')
  createSellerRewardProduct(@Request() req, @Body() payload: any) {
    return this.productService.createSellerRewardProduct(payload, req);
  }

  /**
   * @method getAllSellerReward
   * @description Retrieves all seller reward entries for the authenticated user, paginated.
   *
   * @intent Power the seller's "My Rewards" dashboard.
   *
   * @usage `GET /product/getAllSellerReward?page=1&limit=10&term=reward`
   *   (AuthGuard protected)
   *
   * @dataflow req.user.id + pagination/term -> Prisma sellerReward.findMany()
   *   -> { status, message, data, totalCount }
   *
   * @dependencies {@link ProductService.getAllSellerReward}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {number} page - Page number (1-based).
   * @param {number} limit - Items per page.
   * @param {string} term - Search term.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number}>}
   */
  @UseGuards(AuthGuard)
  @Get('/getAllSellerReward')
  getAllSellerReward(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('term') term: string,
  ) {
    return this.productService.getAllSellerReward(page, limit, term, req);
  }

  /**
   * Generate Link
   */

  /**
   * @method generateLink
   * @description Creates a shareable product link associated with a seller reward.
   *
   * @intent Enable affiliates / resellers to generate trackable sharing links
   *   for reward-eligible products.
   *
   * @usage `POST /product/generateLink` (AuthGuard protected)
   *
   * @dataflow payload (sellerRewardId, link config) -> Prisma sharedLink.create()
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.generateLink}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - Link generation data (sellerRewardId, etc.).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Post('/generateLink')
  generateLink(@Request() req, @Body() payload: any) {
    return this.productService.generateLink(payload, req);
  }

  /**
   * @method getAllGenerateLink
   * @description Retrieves all generated links for the authenticated user, paginated.
   *
   * @intent Power the "My Generated Links" dashboard.
   *
   * @usage `GET /product/getAllGenerateLink?page=1&limit=10&term=link`
   *   (AuthGuard protected)
   *
   * @dataflow req.user.id + pagination/term -> Prisma sharedLink.findMany()
   *   -> { status, message, data, totalCount }
   *
   * @dependencies {@link ProductService.getAllGenerateLink}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {number} page - Page number (1-based).
   * @param {number} limit - Items per page.
   * @param {string} term - Search term.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number}>}
   */
  @UseGuards(AuthGuard)
  @Get('/getAllGenerateLink')
  getAllGenerateLink(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('term') term: string,
  ) {
    return this.productService.getAllGenerateLink(page, limit, term, req);
  }

  /**
   * @method getAllGenerateLinkBySellerRewardId
   * @description Retrieves all generated links scoped to a specific seller reward,
   *   for the authenticated user, paginated.
   *
   * @intent Show all affiliate links generated under a particular reward programme.
   *
   * @usage `GET /product/getAllGenerateLinkBySellerRewardId?page=1&limit=10&term=link`
   *   (AuthGuard protected)
   *
   * @dataflow req.user.id + req.query.sellerRewardId + pagination
   *   -> Prisma sharedLink.findMany() -> { status, message, data, totalCount }
   *
   * @dependencies {@link ProductService.getAllGenerateLinkBySellerRewardId}
   *
   * @param {any} req - Express request with JWT-decoded `user` object and query params.
   * @param {number} page - Page number (1-based).
   * @param {number} limit - Items per page.
   * @param {string} term - Search term.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number}>}
   */
  @UseGuards(AuthGuard)
  @Get('/getAllGenerateLinkBySellerRewardId')
  getAllGenerateLinkBySellerRewardId(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('term') term: string,
  ) {
    return this.productService.getAllGenerateLinkBySellerRewardId(
      page,
      limit,
      term,
      req,
    );
  }

  /**
   * @method deleteProductFromBackend
   * @description Hard-deletes all product records and related data from the database.
   *
   * @intent Administrative / development utility for bulk data cleanup.
   *   NOT intended for production use by end-users.
   *
   * @usage `POST /product/deleteProductFromBackend` (public -- NO guard)
   *
   * @dataflow Prisma deleteMany() on all product-related tables
   *   -> { status, message }
   *
   * @dependencies {@link ProductService.deleteProductFromBackend}
   *
   * @notes
   *   - **DANGEROUS**: No authentication guard is applied.
   *   - Meant for manual backend operations only.
   *   - The `payload` parameter is declared but unused.
   *
   * @param {any} req - Express request object.
   * @param {any} payload - Unused request body.
   * @returns {Promise<{status: boolean, message: string}>}
   */
  /***
   *  DELETE ALL PRODUCT ONLY USED BY BACKEND MANUALLY
   */
  @UseGuards(SuperAdminAuthGuard)
  @Post('/deleteProductFromBackend')
  deleteProductFromBackend(@Request() req, @Body() payload: any) {
    return this.productService.deleteProductFromBackend(req);
  }

  /**
   * @method getMostSoldProducts
   * @description Retrieves the most-sold products ranked by order count.
   *
   * @intent Power analytics dashboards and "Best Sellers" storefront sections.
   *
   * @usage `GET /product/getMostSoldProducts` (public)
   *
   * @dataflow Prisma aggregation on order data -> ranked product list
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.getMostSoldProducts}
   *
   * @notes The `payload` body parameter is declared but unused.
   *
   * @param {any} req - Express request object.
   * @param {any} payload - Unused request body.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  /**
   *  Most sold Product
   */
  @Get('/getMostSoldProducts')
  getMostSoldProducts(@Request() req, @Body() payload: any) {
    return this.productService.getMostSoldProducts(req);
  }

  /**
   * @method getProductMostViewCount
   * @description Retrieves products ranked by view count (most viewed first).
   *
   * @intent Power the "Most Viewed" / "Trending" storefront sections.
   *
   * @usage `GET /product/getProductMostViewCount` (public)
   *
   * @dataflow Prisma product.findMany() ordered by viewCount desc
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.getProductMostViewCount}
   *
   * @notes The `payload` body parameter is declared but unused.
   *
   * @param {any} req - Express request object.
   * @param {any} payload - Unused request body.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @Get('/getProductMostViewCount')
  getProductMostViewCount(@Request() req, @Body() payload: any) {
    return this.productService.getProductMostViewCount(req);
  }

  /**
   * @method addToExistingProducts
   * @description Adds a product to the seller's "existing products" collection for
   *   quick-copy / re-listing workflows.
   *
   * @intent Allow sellers to bookmark catalogue products they want to re-list with
   *   their own pricing.
   *
   * @usage `POST /product/addToExistingProducts` (AuthGuard protected)
   *
   * @dataflow payload (productId) + req.user.id -> Prisma existingProduct.create()
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.addToExistingProducts}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - Product reference data (productId).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  /**
   * Add product to existing products
   */
  @UseGuards(AuthGuard)
  @Post('/addToExistingProducts')
  addToExistingProducts(@Request() req, @Body() payload: any) {
    return this.productService.addToExistingProducts(payload, req);
  }

  /**
   * @method getExistingProducts
   * @description Retrieves all "existing products" bookmarked by the authenticated user.
   *
   * @intent Power the seller's "My Existing Products" list for re-listing workflows.
   *
   * @usage `GET /product/getExistingProducts` (AuthGuard protected)
   *
   * @dataflow req.user.id -> Prisma existingProduct.findMany() with product includes
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.getExistingProducts}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  /**
   * Get all existing products
   */
  @UseGuards(AuthGuard)
  @Get('/getExistingProducts')
  getExistingProducts(@Request() req) {
    return this.productService.getExistingProducts(req);
  }

  /**
   * @method updateExistingProductStatus
   * @description Updates the status of an existing-product bookmark record.
   *
   * @intent Allow sellers to activate, deactivate, or hide bookmarked products.
   *
   * @usage `PATCH /product/updateExistingProductStatus` (AuthGuard protected)
   *
   * @dataflow payload (existingProductId, status) -> Prisma existingProduct.update()
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.updateExistingProductStatus}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - Status update payload (existingProductId, new status).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  /**
   * Update existing product status
   */
  @UseGuards(AuthGuard)
  @Patch('/updateExistingProductStatus')
  updateExistingProductStatus(@Request() req, @Body() payload: any) {
    return this.productService.updateExistingProductStatus(payload, req);
  }

  /**
   * Bulk update existing product status
   */
  @UseGuards(AuthGuard)
  @Patch('/bulkUpdateExistingProductStatus')
  bulkUpdateExistingProductStatus(@Request() req, @Body() payload: any) {
    return this.productService.bulkUpdateExistingProductStatus(payload, req);
  }

  /**
   * @method deleteExistingProduct
   * @description Soft-deletes an existing-product bookmark record.
   *
   * @intent Allow sellers to remove a product from their bookmarked collection.
   *
   * @usage `DELETE /product/deleteExistingProduct/:existingProductId` (AuthGuard protected)
   *
   * @dataflow existingProductId (path param) -> Prisma existingProduct.update({ status: 'DELETE' })
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.deleteExistingProduct}
   *
   * @notes Path parameter is received as string and parsed to integer.
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {string} existingProductId - Path parameter (parsed to number).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  /**
   * Delete existing product
   */
  @UseGuards(AuthGuard)
  @Delete('/deleteExistingProduct/:existingProductId')
  deleteExistingProduct(
    @Request() req,
    @Param('existingProductId') existingProductId: string,
  ) {
    return this.productService.deleteExistingProduct(
      parseInt(existingProductId),
      req,
    );
  }

  /**
   * @method searchExistingProducts
   * @description Searches existing-product bookmark records with full pagination,
   *   text search, sort, brand, price range, and category filters.
   *
   * @intent Power the seller's filtered search within their bookmarked products.
   *
   * @usage `GET /product/searchExistingProducts?page=1&limit=10&term=phone&sort=price_asc`
   *   (AuthGuard protected)
   *
   * @dataflow Query params + req.user.id -> Prisma existingProduct.findMany()
   *   -> { status, message, data, totalCount }
   *
   * @dependencies {@link ProductService.searchExistingProducts}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {number} page - Page number (1-based).
   * @param {number} limit - Items per page.
   * @param {string} term - Search term.
   * @param {string} sort - Sort key.
   * @param {string} brandIds - Comma-separated brand IDs.
   * @param {number} priceMin - Minimum price filter.
   * @param {number} priceMax - Maximum price filter.
   * @param {string} categoryIds - Comma-separated category IDs.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number}>}
   */
  /**
   * Search existing products with pagination and filters
   */
  @UseGuards(AuthGuard)
  @Get('/searchExistingProducts')
  searchExistingProducts(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('term') term: string,
    @Query('sort') sort: string,
    @Query('brandIds') brandIds: string,
    @Query('priceMin') priceMin: number,
    @Query('priceMax') priceMax: number,
    @Query('categoryIds') categoryIds: string,
  ) {
    return this.productService.searchExistingProducts(
      page,
      limit,
      req,
      term,
      sort,
      brandIds,
      priceMin,
      priceMax,
      categoryIds,
    );
  }

  /**
   * @method searchExistingProductsForCopy
   * @description Searches existing products specifically for the copy/duplicate workflow,
   *   with all filter capabilities.
   *
   * @intent Provide a dedicated search endpoint for the "copy existing product" UI flow
   *   where sellers clone catalogue products into their own listings.
   *
   * @usage `GET /product/searchExistingProductsForCopy?page=1&limit=10&term=phone`
   *   (AuthGuard protected)
   *
   * @dataflow Query params (string types, parsed to int) + req.user.id
   *   -> Prisma product search -> { status, message, data, totalCount }
   *
   * @dependencies {@link ProductService.searchExistingProductsForCopy}
   *
   * @notes Query params `page` and `limit` arrive as strings and are parsed to integers
   *   in this controller method before passing to the service.
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {string} page - Page number as string (parsed to int).
   * @param {string} limit - Items per page as string (parsed to int).
   * @param {string} term - Search term.
   * @param {string} sort - Sort key.
   * @param {string} brandIds - Comma-separated brand IDs.
   * @param {string} priceMin - Minimum price as string.
   * @param {string} priceMax - Maximum price as string.
   * @param {string} categoryIds - Comma-separated category IDs.
   * @returns {Promise<{status: boolean, message: string, data?: any, totalCount?: number}>}
   */
  /**
   * Search existing products for copy functionality (dedicated endpoint)
   */
  @UseGuards(AuthGuard)
  @Get('/searchExistingProductsForCopy')
  searchExistingProductsForCopy(
    @Request() req,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('term') term: string,
    @Query('sort') sort: string,
    @Query('brandIds') brandIds: string,
    @Query('priceMin') priceMin: string,
    @Query('priceMax') priceMax: string,
    @Query('categoryIds') categoryIds: string,
  ) {
    return this.productService.searchExistingProductsForCopy(
      parseInt(page),
      parseInt(limit),
      req,
      term,
      sort,
      brandIds,
      priceMin,
      priceMax,
      categoryIds,
    );
  }

  /**
   * @method getExistingProductByIdPath
   * @description Retrieves a single existing-product record by ID (path parameter version).
   *
   * @intent Support the copy workflow by fetching full product details for duplication.
   *
   * @usage `GET /product/getExistingProductById/:existingProductId` (AuthGuard protected)
   *
   * @dataflow existingProductId (path param, parsed to int) -> Prisma existingProduct.findUnique()
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.getExistingProductById}
   *
   * @notes Duplicate of `getExistingProductById` but uses a path parameter instead of query param.
   *
   * @param {string} existingProductId - Path parameter (parsed to number).
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  /**
   * Get existing product by ID for copy functionality (path parameter version)
   */
  @UseGuards(AuthGuard)
  @Get('/getExistingProductById/:existingProductId')
  getExistingProductByIdPath(
    @Param('existingProductId') existingProductId: string,
    @Request() req: any,
  ) {
    return this.productService.getExistingProductById(
      parseInt(existingProductId),
      req,
    );
  }

  /**
   * @method getExistingProductById
   * @description Retrieves a single existing-product record by ID (query parameter version).
   *
   * @intent Support the copy workflow by fetching full product details for duplication.
   *
   * @usage `GET /product/getExistingProductById?existingProductId=42` (AuthGuard protected)
   *
   * @dataflow existingProductId (query param, parsed to int) -> Prisma existingProduct.findUnique()
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.getExistingProductById}
   *
   * @param {string} existingProductId - Query parameter (parsed to number).
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  /**
   * Get existing product by ID for copy functionality
   */
  @UseGuards(AuthGuard)
  @Get('/getExistingProductById')
  getExistingProductById(
    @Query('existingProductId') existingProductId: string,
    @Request() req: any,
  ) {
    return this.productService.getExistingProductById(
      parseInt(existingProductId),
      req,
    );
  }

  /**
   * @method updateExistingProduct
   * @description Updates an existing-product bookmark record with new data.
   *
   * @intent Allow sellers to modify their bookmarked / existing product entries.
   *
   * @usage `PATCH /product/updateExistingProduct` (AuthGuard protected)
   *
   * @dataflow payload (existingProductId + updates) -> Prisma existingProduct.update()
   *   -> { status, message, data }
   *
   * @dependencies {@link ProductService.updateExistingProduct}
   *
   * @param {any} req - Express request with JWT-decoded `user` object.
   * @param {any} payload - Update payload with existingProductId and field overrides.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  /**
   * Update existing product
   */
  @UseGuards(AuthGuard)
  @Patch('/updateExistingProduct')
  updateExistingProduct(@Request() req, @Body() payload: any) {
    return this.productService.updateExistingProduct(payload, req);
  }

  // Dropshipping endpoints
  @UseGuards(AuthGuard)
  @Post('/dropship')
  createDropshipableProduct(@Request() req, @Body() payload: any) {
    return this.productService.createDropshipableProduct(payload, req);
  }

  @UseGuards(AuthGuard)
  @Get('/available-for-dropship')
  getAvailableProductsForDropship(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('term') term: string,
    @Query('categoryId') categoryId: string,
    @Query('priceMin') priceMin: string,
    @Query('priceMax') priceMax: string,
    @Request() req: any,
  ) {
    return this.productService.getAvailableProductsForDropship(
      parseInt(page) || 1,
      parseInt(limit) || 10,
      term,
      categoryId ? parseInt(categoryId) : undefined,
      priceMin ? parseFloat(priceMin) : undefined,
      priceMax ? parseFloat(priceMax) : undefined,
      req,
    );
  }

  @UseGuards(AuthGuard)
  @Get('/dropship-products')
  getDropshipProducts(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('status') status: string,
    @Request() req: any,
  ) {
    return this.productService.getDropshipProducts(
      parseInt(page) || 1,
      parseInt(limit) || 10,
      status,
      req,
    );
  }

  @UseGuards(AuthGuard)
  @Get('/dropship-earnings')
  getDropshipEarnings(@Request() req: any) {
    return this.productService.getDropshipEarnings(req);
  }

  @UseGuards(AuthGuard)
  @Patch('/dropship/:id/status')
  updateDropshipProductStatus(
    @Param('id') id: string,
    @Body() payload: { status: string },
    @Request() req: any,
  ) {
    return this.productService.updateDropshipProductStatus(
      parseInt(id),
      payload.status,
      req,
    );
  }

  @UseGuards(AuthGuard)
  @Delete('/dropship/:id')
  deleteDropshipProduct(@Param('id') id: string, @Request() req: any) {
    return this.productService.deleteDropshipProduct(parseInt(id), req);
  }

  // Mark product as dropshipable
  @UseGuards(AuthGuard)
  @Patch('/dropship/enable/:id')
  markProductAsDropshipable(
    @Param('id') id: string,
    @Body()
    payload: {
      isDropshipable: boolean;
      dropshipCommission?: number;
      dropshipMinMarkup?: number;
      dropshipMaxMarkup?: number;
      dropshipSettings?: any;
    },
    @Request() req: any,
  ) {
    return this.productService.markProductAsDropshipable(
      parseInt(id),
      payload.isDropshipable,
      payload,
      req,
    );
  }

  // Get vendor's dropshipable products
  @UseGuards(AuthGuard)
  @Get('/dropship/my-dropshipable-products')
  getMyDropshipableProducts(
    @Request() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.productService.getMyDropshipableProducts(
      parseInt(page),
      parseInt(limit),
      req,
    );
  }

  // Get dropship analytics
  @UseGuards(AuthGuard)
  @Get('/dropship/analytics')
  getDropshipAnalytics(@Request() req: any) {
    return this.productService.getDropshipAnalytics(req);
  }

  // Bulk enable/disable dropshipping
  @UseGuards(AuthGuard)
  @Patch('/dropship/bulk-enable')
  bulkUpdateDropshipable(
    @Body()
    payload: {
      productIds: number[];
      isDropshipable: boolean;
      dropshipCommission?: number;
      dropshipMinMarkup?: number;
      dropshipMaxMarkup?: number;
    },
    @Request() req: any,
  ) {
    return this.productService.bulkUpdateDropshipable(
      payload.productIds,
      payload.isDropshipable,
      payload,
      req,
    );
  }

  // Get wholesale products
  @UseGuards(AuthGuard)
  @Get('/wholesale/products')
  getWholesaleProducts(
    @Request() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.productService.getWholesaleProducts(
      parseInt(page),
      parseInt(limit),
      req,
    );
  }

  // Get wholesale dashboard
  @UseGuards(AuthGuard)
  @Get('/wholesale/dashboard')
  getWholesaleDashboard(@Request() req: any) {
    return this.productService.getWholesaleDashboard(req);
  }

  // Get wholesale product sales details
  @UseGuards(AuthGuard)
  @Get('/wholesale/product/:id/sales')
  getWholesaleProductSales(@Param('id') id: string, @Request() req: any) {
    return this.productService.getWholesaleProductSales(parseInt(id), req);
  }

  // Get user's own dropshipable products (productType = D, isDropshipable = true)
  @UseGuards(AuthGuard)
  @Get('/getUserOwnDropshipableProducts')
  getUserOwnDropshipableProducts(
    @Request() req: any,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('term') term: string,
    @Query('brandIds') brandIds: string,
    @Query('categoryIds') categoryIds: string,
    @Query('status') status: string,
    @Query('sort') sort: string,
  ) {
    return this.productService.getUserOwnDropshipableProducts(
      parseInt(page),
      parseInt(limit),
      req,
      term,
      brandIds,
      categoryIds,
      status,
      sort,
    );
  }

  // Get dropship products created from a specific original product
  @UseGuards(AuthGuard)
  @Get('/getDropshipProductsFromOriginal/:originalProductId')
  getDropshipProductsFromOriginal(
    @Param('originalProductId') originalProductId: string,
  ) {
    return this.productService.getDropshipProductsFromOriginal(
      parseInt(originalProductId),
    );
  }

  // AI Generate Product Data
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(AuthGuard)
  @Post('/ai-generate')
  @UseInterceptors(FileInterceptor('image'))
  async generateProductWithAI(
    @Request() req: any,
    @Body() body: { type: string; query?: string; url?: string },
    @UploadedFile() file?: MulterFile,
  ) {
    try {
      let input: string | MulterFile;
      
      if (body.type === 'image' && file) {
        input = file;
      } else if (body.type === 'url' && body.url) {
        input = body.url;
      } else if (body.type === 'text' && body.query) {
        input = body.query;
      } else {
        return {
          status: false,
          message: 'Invalid request. Missing required input.',
        };
      }

      const result = await this.productService.generateProductWithAI(
        body.type,
        input,
      );

      return result;
    } catch (error: any) {
      return {
        status: false,
        message: error.message || 'Failed to generate product data',
      };
    }
  }

  // AI Category Matching
  @UseGuards(AuthGuard)
  @Post('/ai-match-category')
  async matchCategoryWithAI(
    @Request() req: any,
    @Body() body: { aiCategoryName: string; productName?: string; availableCategories: Array<{ id: number; name: string; isLeaf?: boolean }> },
  ) {
    try {
      if (!body.aiCategoryName || !body.availableCategories || body.availableCategories.length === 0) {
        return {
          status: false,
          message: 'Invalid request. Missing category name or available categories.',
        };
      }

      const result = await this.productService.matchCategoryWithAI(
        body.aiCategoryName,
        body.availableCategories,
        body.productName,
      );

      return result;
    } catch (error: any) {
      return {
        status: false,
        message: error.message || 'Failed to match category',
      };
    }
  }

  // Generate lightweight product list
  @UseGuards(AuthGuard)
  @Post('/ai-generate-list')
  async generateProductList(
    @Request() req: any,
    @Body() body: { type: string; query?: string },
  ) {
    try {
      if (body.type !== 'text' || !body.query) {
        return {
          status: false,
          message: 'Invalid request. Text query is required.',
        };
      }

      const result = await this.productService.generateProductList(body.type, body.query);
      return result;
    } catch (error: any) {
      return {
        status: false,
        message: error.message || 'Failed to generate product list',
      };
    }
  }

  // Check if product model exists in existing products
  @UseGuards(AuthGuard)
  @Post('/check-model-exists')
  async checkModelExists(
    @Request() req: any,
    @Body() body: { modelName: string },
  ) {
    try {
      if (!body.modelName) {
        return {
          status: false,
          message: 'Invalid request. Model name is required.',
        };
      }

      const result = await this.productService.checkModelExists(
        body.modelName,
        req,
      );
      return result;
    } catch (error: any) {
      return {
        status: false,
        message: error.message || 'Failed to check model existence',
      };
    }
  }

  // Generate full product details
  @UseGuards(AuthGuard)
  @Post('/ai-generate-details')
  async generateProductDetails(
    @Request() req: any,
    @Body() body: { productName: string; category?: string; brand?: string },
  ) {
    try {
      if (!body.productName) {
        return {
          status: false,
          message: 'Invalid request. Product name is required.',
        };
      }

      const result = await this.productService.generateProductDetails(
        body.productName,
        body.category,
        body.brand,
      );
      return result;
    } catch (error: any) {
      return {
        status: false,
        message: error.message || 'Failed to generate product details',
      };
    }
  }

  /**
   * AI-powered product categorization from product name.
   * Analyzes the product name to find matching tags and categories.
   */
  @UseGuards(AuthGuard)
  @Post('/ai-categorize')
  async aiCategorize(
    @Body() body: { productName: string },
  ) {
    try {
      if (!body.productName || body.productName.trim().length < 2) {
        return {
          status: false,
          message: 'Product name must be at least 2 characters',
          data: { suggestedTags: [], suggestedCategories: [] },
        };
      }

      const result = await this.specificationService.aiCategorizeFromName(
        body.productName.trim(),
      );

      return {
        status: true,
        message: 'AI categorization completed',
        data: result,
      };
    } catch (error: any) {
      return {
        status: false,
        message: error.message || 'AI categorization failed',
        data: { suggestedTags: [], suggestedCategories: [] },
      };
    }
  }
}
