/**
 * @file order.controller.ts
 * @description REST controller for the Order domain in the Ultrasooq marketplace.
 *
 * Intent:
 *   Exposes HTTP endpoints for creating, listing, and managing orders for both
 *   authenticated buyers/sellers and unauthenticated (guest) users.
 *
 * Idea:
 *   Thin controller layer -- every endpoint immediately delegates to OrderService.
 *   Authentication is enforced per-route via `@UseGuards(AuthGuard)`. Routes that
 *   must also serve guest checkout omit the guard.
 *
 * Usage:
 *   All routes are prefixed with `/order` (set by the @Controller decorator).
 *   Example: POST /order/createOrder, GET /order/getAllOrderByUserId
 *
 * Data Flow:
 *   Client -> OrderController (route + guard) -> OrderService -> PrismaClient / DB
 *   Responses follow the { status, message, data } envelope pattern.
 *
 * Dependencies:
 *   - OrderService : Contains all business logic for order operations.
 *   - AuthGuard    : JWT-based guard that populates `req.user` when applied.
 *
 * Notes:
 *   - Some endpoints (createOrderUnAuth, getOneOrderUnAuth, orderProductStatusById,
 *     orderShippingStatusUpdateById, getSaleDataByMonth) are intentionally unguarded
 *     to support guest or webhook-driven flows.
 *   - Payload validation is not enforced at the controller level (uses `any` types).
 */
import { Body, Controller, Get, Patch, Post, Query, Request, UseGuards, Response } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { OrderService } from './order.service';
import { AuthGuard } from 'src/guards/AuthGuard';

/**
 * @class OrderController
 * @description Handles all `/order` route requests for the Ultrasooq marketplace.
 *   Covers buyer-side order creation, seller-side order listing, order product
 *   status management, shipping/delivery operations, pre-order calculation,
 *   and sales analytics endpoints.
 */
@ApiTags('orders')
@ApiBearerAuth('JWT-auth')
@Controller('order')
export class OrderController {

  /**
   * @constructor
   * @param {OrderService} orderService - Injected order business-logic service.
   *
   * Intent:    Wire up the single service dependency via NestJS DI.
   * Data Flow: All controller methods delegate directly to this service.
   */
  constructor(
    private readonly orderService: OrderService,
  ) {}

  /**
   * @method createOrder
   * @description Creates a new order for an authenticated buyer.
   *
   * Intent:    Primary order-creation endpoint for logged-in users (buyer flow).
   * Idea:      Accepts cart IDs and shipping/billing details; delegates full
   *            processing (discount, fee calculation, stock deduction, payment
   *            transaction creation) to OrderService.createOrder2().
   * Usage:     POST /order/createOrder  (AuthGuard required)
   * Data Flow: req.user.id -> OrderService.createOrder2(payload, req) -> DB writes
   * Dependencies: AuthGuard (JWT), OrderService.createOrder2
   * Notes:     Despite the method name `createOrder`, the service method is
   *            `createOrder2`, indicating an evolved version of the order flow.
   *
   * @param {any} req     - Express request; `req.user` populated by AuthGuard.
   * @param {any} payload - Request body containing cartIds, serviceCartIds,
   *                         shipping, billing address, payment details.
   * @returns {Promise<object>} Standard envelope with order details, product list,
   *                             pricing breakdown, and transaction info.
   */
  // orderCreate for buyer
  @UseGuards(AuthGuard)
  @Post('/createOrder')
  createOrder(@Request() req, @Body() payload: any) {
    return this.orderService.createOrder2(payload, req);
  }

  /**
   * @method getAllOrderByUserId
   * @description Retrieves a paginated list of orders belonging to the authenticated buyer.
   *
   * Intent:    Buyer-side order listing endpoint.
   * Idea:      Returns all orders (with their products and addresses) for the
   *            current user, supporting simple offset-based pagination.
   * Usage:     GET /order/getAllOrderByUserId?page=1&limit=10  (AuthGuard required)
   * Data Flow: req.user.id -> OrderService.getAllOrderByUserId -> prisma.order.findMany
   * Dependencies: AuthGuard (JWT), OrderService.getAllOrderByUserId
   * Notes:     Includes order_orderProducts and order_orderAddress relations.
   *
   * @param {any}    req   - Express request; `req.user` populated by AuthGuard.
   * @param {number} page  - Page number (1-based, defaults to 1).
   * @param {number} limit - Items per page (defaults to 10).
   * @returns {Promise<object>} Standard envelope with paginated order list.
   */
  // orderListing for buyer
  @UseGuards(AuthGuard)
  @Get('/getAllOrderByUserId')
  getAllOrderByUserId(@Request() req, @Query('page') page: number, @Query('limit') limit: number) {
    return this.orderService.getAllOrderByUserId(page, limit, req);
  }

  /**
   * @method getOneOrder
   * @description Fetches a single order by its ID without requiring authentication.
   *
   * Intent:    Allow unauthenticated access to order details (e.g. guest checkout
   *            confirmation, external webhook callbacks).
   * Idea:      Reads `orderId` from query string, returns the full order with
   *            products (including product price, service, and shipping) and addresses.
   * Usage:     GET /order/getOneOrderUnAuth?orderId=123  (no auth guard)
   * Data Flow: req.query.orderId -> OrderService.getOneOrder -> prisma.order.findUnique
   * Dependencies: OrderService.getOneOrder
   * Notes:     No authentication enforced -- intended for guest/external access.
   *
   * @param {any} req - Express request with `query.orderId`.
   * @returns {Promise<object>} Standard envelope with the single order or error.
   */
  @Get('/getOneOrderUnAuth')
  getOneOrder(@Request() req) {
    return this.orderService.getOneOrder(req);
  }

  /**
   * @method getAllOrderProductByUserId
   * @description Retrieves a paginated, filterable list of order-products for the
   *              authenticated buyer.
   *
   * Intent:    Buyer-side order-product listing with search, status filter, and
   *            date-range filter support.
   * Idea:      Queries orderProducts where userId matches the JWT user. Supports
   *            text search across product name and order number, optional status
   *            filter, and optional date range on orderProductDate.
   * Usage:     GET /order/getAllOrderProductByUserId?page=1&limit=10&term=phone
   *                &orderProductStatus=PLACED&startDate=2024-01-01&endDate=2024-12-31
   *            (AuthGuard required)
   * Data Flow: req.user.id + query params -> OrderService.getAllOrderProductByUserId
   *            -> prisma.orderProducts.findMany + count
   * Dependencies: AuthGuard (JWT), OrderService.getAllOrderProductByUserId
   * Notes:     Search term must be >2 characters to be applied; shorter values
   *            are treated as empty.
   *
   * @param {any}    req                - Express request; `req.user` populated by AuthGuard.
   * @param {number} page               - Page number (1-based).
   * @param {number} limit              - Items per page.
   * @param {string} term               - Free-text search term.
   * @param {string} orderProductStatus - Optional status filter (e.g. PLACED, SHIPPED).
   * @param {string} startDate          - ISO date string for range start.
   * @param {string} endDate            - ISO date string for range end.
   * @returns {Promise<object>} Standard envelope with order-product list and totalCount.
   */
  @UseGuards(AuthGuard)
  @Get('/getAllOrderProductByUserId')
  getAllOrderProductByUserId(@Request() req, @Query('page') page: number, @Query('limit') limit: number, @Query('term') term: string,
  @Query('orderProductStatus') orderProductStatus: string, @Query('startDate') startDate: string,
  @Query('endDate') endDate: string) {
    return this.orderService.getAllOrderProductByUserId(page, limit, req, term, orderProductStatus, startDate, endDate);
  }

  /**
   * @method createOrderUnAuth
   * @description Creates an order for a guest (unauthenticated) user.
   *
   * Intent:    Support guest checkout without requiring the user to register
   *            or log in first.
   * Idea:      If the guest email does not exist, a new user record is auto-created
   *            with a random password and a welcome email is sent. The order is then
   *            placed using the resolved userId.
   * Usage:     POST /order/createOrderUnAuth  (no auth guard)
   * Data Flow: payload.guestUser -> user lookup/creation -> order + orderProducts
   *            + orderAddress writes -> NotificationService.newUserCreatedOnCheckout
   * Dependencies: OrderService.createOrderUnAuth, NotificationService
   * Notes:     Cart items are deleted after order creation. No fee calculation
   *            or stock validation is performed in this flow (simplified path).
   *
   * @param {any} payload - Request body with guestUser info, cartIds, addresses,
   *                         and payment method.
   * @returns {Promise<object>} Standard envelope with order details.
   */
  @Post('/createOrderUnAuth')
  createOrderUnAuth(@Body() payload: any) {
    return this.orderService.createOrderUnAuth(payload);
  }

  /**
   * @method getOneOrderProductDetailByUserId
   * @description Fetches the full detail of a single order-product for the buyer,
   *              including seller info, images, shipping, and sibling order-products.
   *
   * Intent:    Buyer-side order-product detail view.
   * Idea:      Retrieves the order-product by ID with deeply nested relations
   *            (product price, admin/seller profile, product images, order addresses)
   *            and also returns the other order-products from the same order.
   * Usage:     GET /order/getOneOrderProductDetailByUserId?orderProductId=42
   *            (AuthGuard required)
   * Data Flow: orderProductId -> OrderService.getOneOrderProductDetailByUserId
   *            -> prisma.orderProducts.findUnique + prisma.order.findMany
   * Dependencies: AuthGuard (JWT), OrderService.getOneOrderProductDetailByUserId
   * Notes:     Also fetches orderShippingDetail if an orderShippingId exists
   *            on the order-product.
   *
   * @param {number} orderProductId - ID of the order-product to retrieve.
   * @param {any}    req            - Express request; `req.user` populated by AuthGuard.
   * @returns {Promise<object>} Standard envelope with order-product detail,
   *                             shipping detail, and sibling order data.
   */
  @UseGuards(AuthGuard)
  @Get('/getOneOrderProductDetailByUserId')
  getOneOrderProductDetailByUserId(@Query('orderProductId') orderProductId: number, @Request() req,) {
    return this.orderService.getOneOrderProductDetailByUserId(orderProductId, req);
  }

  /**
   * @method getAllOrderProductBySellerId
   * @description Retrieves a paginated, filterable list of order-products sold by
   *              the authenticated seller.
   *
   * Intent:    Seller-side order-product listing with search and status filter.
   * Idea:      Resolves the seller ID (including team-member -> admin fallback),
   *            then queries orderProducts where sellerId matches. Excludes orders
   *            with PENDING orderStatus. Supports text search on product name and
   *            seller order number.
   * Usage:     GET /order/getAllOrderProductBySellerId?page=1&limit=10&term=phone
   *                &orderProductStatus=SHIPPED
   *            (AuthGuard required)
   * Data Flow: req.user.id -> admin resolution -> OrderService.getAllOrderProductBySellerId
   *            -> prisma.orderProducts.findMany + count
   * Dependencies: AuthGuard (JWT), OrderService.getAllOrderProductBySellerId
   * Notes:     Team members are resolved to their parent admin ID so that all
   *            products under the company are returned.
   *
   * @param {any}    req                - Express request; `req.user` populated by AuthGuard.
   * @param {number} page               - Page number (1-based).
   * @param {number} limit              - Items per page.
   * @param {string} term               - Free-text search term.
   * @param {string} orderProductStatus - Optional status filter.
   * @returns {Promise<object>} Standard envelope with order-product list,
   *                             totalCount, and resolved selectedAdminId.
   */
  @UseGuards(AuthGuard)
  @Get('/getAllOrderProductBySellerId')
  getAllOrderProductBySellerId(@Request() req, @Query('page') page: number, @Query('limit') limit: number, @Query('term') term: string,
  @Query('orderProductStatus') orderProductStatus: string) {
    return this.orderService.getAllOrderProductBySellerId(page, limit, req, term, orderProductStatus);
  }

  /**
   * @method getOneOrderProductDetailBySellerId
   * @description Fetches the full detail of a single order-product from the
   *              seller's perspective.
   *
   * Intent:    Seller-side order-product detail view.
   * Idea:      Retrieves the order-product by ID with nested relations including
   *            order addresses, product price, admin/seller profile, and product images.
   *            Also looks up the associated orderShipping record if present.
   * Usage:     GET /order/getOneOrderProductDetailBySellerId?orderProductId=42
   *            (AuthGuard required)
   * Data Flow: orderProductId -> OrderService.getOneOrderProductDetailBySellerId
   *            -> prisma.orderProducts.findUnique + prisma.orderShipping.findUnique
   * Dependencies: AuthGuard (JWT), OrderService.getOneOrderProductDetailBySellerId
   * Notes:     Unlike the buyer-side counterpart, this does NOT return sibling
   *            order-products from the same order.
   *
   * @param {number} orderProductId - ID of the order-product to retrieve.
   * @param {any}    req            - Express request; `req.user` populated by AuthGuard.
   * @returns {Promise<object>} Standard envelope with order-product detail
   *                             and embedded shipping detail.
   */
  @UseGuards(AuthGuard)
  @Get('/getOneOrderProductDetailBySellerId')
  getOneOrderProductDetailBySellerId(@Query('orderProductId') orderProductId: number, @Request() req,) {
    return this.orderService.getOneOrderProductDetailBySellerId(orderProductId, req);
  }

  /**
   * @method orderProductStatusById
   * @description Updates the status of a specific order-product (e.g. PLACED,
   *              CONFIRMED, SHIPPED, DELIVERED, CANCELLED).
   *
   * Intent:    Allow status transitions on individual order-products.
   * Idea:      Accepts orderProductId and the new status. If transitioning to
   *            SHIPPED, also updates the linked orderShipping record.
   * Usage:     POST /order/orderProductStatusById  (no auth guard)
   * Data Flow: payload.orderProductId + payload.status
   *            -> OrderService.orderProductStatusById
   *            -> prisma.orderProducts.update (+ optional orderShipping.update)
   * Dependencies: OrderService.orderProductStatusById
   * Notes:     This endpoint is unguarded -- may be called by internal systems
   *            or webhooks. The status field in the response envelope shadows
   *            the boolean `status` key (naming collision with order product status).
   *
   * @param {any} payload - Body containing { orderProductId: number, status: string }.
   * @returns {Promise<object>} Standard envelope with updated order-product record.
   */
  @Post('/orderProductStatusById')
  orderProductStatusById(@Body() payload: any) {
    return this.orderService.orderProductStatusById(payload);
  }

  /**
   * @method orderShippingStatusUpdateById
   * @description Updates an order-shipping record (currently updates the receipt field).
   *
   * Intent:    Allow a shipping provider or seller to attach a receipt to an
   *            order-shipping entry.
   * Idea:      Accepts orderShippingId and receipt data in the body, then patches
   *            the orderShipping record.
   * Usage:     PATCH /order/orderShippingStatusUpdateById  (no auth guard)
   * Data Flow: payload.orderShippingId + payload.receipt
   *            -> OrderService.orderShippingStatusUpdateById
   *            -> prisma.orderShipping.update
   * Dependencies: OrderService.orderShippingStatusUpdateById
   * Notes:     The status field update is currently commented out in the service;
   *            only the receipt is updated. No auth guard applied.
   *
   * @param {any} payload - Body containing { orderShippingId: number, receipt: any }.
   * @param {any} req     - Express request (unused in current implementation).
   * @returns {Promise<object>} Standard envelope with updated orderShipping record.
   */
  @Patch('/orderShippingStatusUpdateById')
  orderShippingStatusUpdateById(@Body() payload: any, @Request() req) {
    return this.orderService.orderShippingStatusUpdateById(payload, req);
  }

  /**
   * @method orderProductCancelReason
   * @description Records a cancellation reason on a specific order-product.
   *
   * Intent:    Allow a buyer to provide a reason when cancelling an order-product.
   * Idea:      Updates the `cancelReason` field on the orderProducts record.
   *            Requires a non-empty cancelReason in the payload.
   * Usage:     PATCH /order/orderProductCancelReason  (AuthGuard required)
   * Data Flow: payload.orderProductId + payload.cancelReason
   *            -> OrderService.orderProductCancelReason
   *            -> prisma.orderProducts.update
   * Dependencies: AuthGuard (JWT), OrderService.orderProductCancelReason
   * Notes:     Only updates the reason text; does NOT change the orderProductStatus.
   *            Status change should be done separately via orderProductStatusById.
   *
   * @param {any} payload - Body containing { orderProductId: number, cancelReason: string }.
   * @returns {Promise<object>} Standard envelope with updated order-product.
   */
  @UseGuards(AuthGuard)
  @Patch('/orderProductCancelReason')
  orderProductCancelReason(@Body() payload: any) {
    return this.orderService.orderProductCancelReason(payload);
  }

  /**
   * @method preOrderCal
   * @description Performs a pre-order calculation (price preview) without creating
   *              an actual order.
   *
   * Intent:    Let the buyer see a price breakdown (discounts, platform fees,
   *            cashback, customer pay amount) before confirming the order.
   * Idea:      Mirrors much of the createOrder2 logic (trade-role validation,
   *            discount application, fee calculation) but does NOT write to the
   *            database or deduct stock. Returns the computed product list with
   *            breakdowns for the frontend checkout summary.
   * Usage:     POST /order/preOrderCal  (AuthGuard required)
   * Data Flow: req.user.id + payload (cartIds, serviceCartIds, userAddressId)
   *            -> OrderService.preOrderCal -> fee/discount computation (read-only)
   * Dependencies: AuthGuard (JWT), OrderService.preOrderCal, calculateFees()
   * Notes:     Also processes service cart items in addition to product cart items.
   *
   * @param {any} req     - Express request; `req.user` populated by AuthGuard.
   * @param {any} payload - Body containing cartIds, serviceCartIds, userAddressId.
   * @returns {Promise<object>} Standard envelope with product list, totals,
   *                             discounts, fee breakdowns, and invalid products.
   */
  // PreOrderCal
  @UseGuards(AuthGuard)
  @Post('/preOrderCal')
  preOrderCal(@Request() req, @Body() payload: any) {
    return this.orderService.preOrderCal(payload, req);
  }

  /**
   * @method getSaleDataByMonth
   * @description Returns daily sales totals for a given seller, month, and year.
   *
   * Intent:    Provide per-day sales data for dashboard charts/analytics.
   * Idea:      Accepts month name, year, and sellerId from query params. Aggregates
   *            orderProducts by day within the specified month to produce an array
   *            of { day, value } entries.
   * Usage:     GET /order/getSaleDataByMonth?month=january&year=2025&sellerId=5
   *            (no auth guard)
   * Data Flow: req.query.{month,year,sellerId}
   *            -> OrderService.getSaleDataByMonth
   *            -> prisma.orderProducts.findMany -> daily aggregation
   * Dependencies: OrderService.getSaleDataByMonth, moment.js
   * Notes:     Unguarded endpoint. Month is expected as a full English name
   *            (case-insensitive). Only non-deleted order-products are counted.
   *
   * @param {any} req - Express request with query params month, year, sellerId.
   * @returns {Promise<object>} Standard envelope with daily sales array and metadata.
   */
  @Get('/getSaleDataByMonth')
  getSaleDataByMonth (@Request() req) {
    return this.orderService.getSaleDataByMonth(req);
  }

  /**
   * @method totalSaleCountBySeller
   * @description Returns the total count of order-products sold by the authenticated
   *              seller (or the admin they belong to).
   *
   * Intent:    Dashboard KPI -- total number of sales for a seller.
   * Idea:      Resolves the seller's admin ID via HelperService.getAdminId()
   *            to handle team-member ownership, then counts all orderProducts
   *            for that seller.
   * Usage:     GET /order/totalSaleCountBySeller  (AuthGuard required)
   * Data Flow: req.user.id -> HelperService.getAdminId -> prisma.orderProducts.findMany
   *            -> count
   * Dependencies: AuthGuard (JWT), OrderService.totalSaleCountBySeller, HelperService
   * Notes:     Returns totalSaleCount as a simple integer, not paginated.
   *
   * @param {any} req - Express request; `req.user` populated by AuthGuard.
   * @returns {Promise<object>} Standard envelope with { totalSaleCount, sellerId }.
   */
  @UseGuards(AuthGuard)
  @Get('/totalSaleCountBySeller')
  totalSaleCountBySeller (@Request() req) {
    return this.orderService.totalSaleCountBySeller(req);
  }



  /**
   * ORDER SHIPPING - DELIVERY
   */

  /**
   * @method getAllOrderShipping
   * @description Retrieves a paginated list of order-shipping records assigned to
   *              the authenticated shipper/delivery provider.
   *
   * Intent:    Shipper-side listing of delivery assignments.
   * Idea:      Resolves the shipper's admin ID and queries orderShipping where
   *            the linked service's sellerId matches. Includes service and
   *            service feature details.
   * Usage:     GET /order/getAllOrderShipping?page=1&limit=10  (AuthGuard required)
   * Data Flow: req.user.id -> HelperService.getAdminId -> prisma.orderShipping.findMany + count
   * Dependencies: AuthGuard (JWT), OrderService.getAllOrderShipping, HelperService
   * Notes:     Pagination params (page, limit, term) are read from req.query
   *            inside the service rather than from controller query decorators.
   *
   * @param {any} req - Express request; `req.user` populated by AuthGuard.
   * @returns {Promise<object>} Standard envelope with shipping list and totalCount.
   */
  @UseGuards(AuthGuard)
  @Get('/getAllOrderShipping')
  getAllOrderShipping (@Request() req) {
    return this.orderService.getAllOrderShipping(req);
  }

  /**
   * @method getOneOrderShipping
   * @description Fetches a single order-shipping record by its ID, including
   *              linked order-products and order addresses.
   *
   * Intent:    Detail view for a specific shipping/delivery assignment.
   * Idea:      Reads orderShippingId from query string, returns the shipping
   *            record with nested order-product details, the parent order,
   *            and associated service info.
   * Usage:     GET /order/getOneOrderShipping?orderShippingId=7  (AuthGuard required)
   * Data Flow: req.query.orderShippingId -> OrderService.getOneOrderShipping
   *            -> prisma.orderShipping.findUnique
   * Dependencies: AuthGuard (JWT), OrderService.getOneOrderShipping
   * Notes:     Unlike other endpoints, this method uses the Express @Response()
   *            object directly to send status-coded JSON (400, 404, 500).
   *            This means NestJS does NOT auto-serialize the return value.
   *
   * @param {any} req - Express request with query.orderShippingId.
   * @param {any} res - Express response used for manual status-code responses.
   * @returns {Promise<void>} JSON sent directly via res.status().json().
   */
  @UseGuards(AuthGuard)
  @Get('/getOneOrderShipping')
  getOneOrderShipping (@Request() req, @Response() res) {
    return this.orderService.getOneOrderShipping(req, res);
  }

  // ==================== VENDOR DASHBOARD ENDPOINTS ====================

  @UseGuards(AuthGuard)
  @Get('/vendor/order-stats')
  getVendorOrderStats(@Request() req) {
    return this.orderService.getVendorOrderStats(req);
  }

  @UseGuards(AuthGuard)
  @Get('/vendor/recent-orders')
  getVendorRecentOrders(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
    @Query('sellType') sellType?: string,
  ) {
    return this.orderService.getVendorRecentOrders(req, page, limit, status, startDate, endDate, search, sellType);
  }

  @UseGuards(AuthGuard)
  @Patch('/vendor/update-status')
  updateOrderStatus(@Request() req, @Body() payload: any) {
    return this.orderService.updateOrderStatus(req, payload);
  }

  @UseGuards(AuthGuard)
  @Post('/vendor/add-tracking')
  addOrderTracking(@Request() req, @Body() payload: any) {
    return this.orderService.addOrderTracking(req, payload);
  }

}
