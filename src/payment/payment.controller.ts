/**
 * @fileoverview Payment Controller - HTTP route definitions for the Ultrasooq payment subsystem.
 *
 * @description
 * Exposes REST endpoints under the `/payment` prefix that handle all Paymob
 * (Oman region) payment operations: token retrieval, payment intentions,
 * webhooks, payment-link generation, saved-card tokenisation, EMI (installment)
 * payments, and transaction history.
 *
 * @module PaymentController
 *
 * **Intent:**
 * Act as the thin HTTP layer that validates route-level concerns (guards, HTTP
 * method, path) and delegates every business decision to {@link PaymentService}.
 *
 * **Idea:**
 * Keep the controller free of business logic. Each handler destructures the
 * NestJS `@Request()` and `@Body()` decorators, then forwards them to the
 * corresponding service method.
 *
 * **Usage:**
 * Automatically registered by {@link PaymentModule}. Routes become available at
 * `<host>/payment/*` once the application bootstraps.
 *
 * **Data Flow:**
 * ```
 * Client --> NestJS Router --> AuthGuard (when applied) --> PaymentController
 *   --> PaymentService --> Paymob API / Prisma DB --> Response envelope
 * ```
 *
 * **Dependencies:**
 * - {@link PaymentService} -- injected via constructor; contains all Paymob logic
 * - {@link AuthGuard}      -- JWT-based guard applied to protected endpoints
 *
 * **Notes:**
 * - Several endpoints are intentionally unguarded (webhooks, token endpoints)
 *   because they are called by Paymob's servers or during pre-auth flows.
 * - The commented-out `createPaymentPaymobAxios` endpoint is a deprecated
 *   Axios-based payment creation flow kept for historical reference.
 */
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Request, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/AuthGuard';
import { SuperAdminAuthGuard } from 'src/guards/SuperAdminAuthGuard';
import { PaymentService } from './payment.service';

/**
 * @class PaymentController
 * @description
 * NestJS controller bound to the `/payment` route prefix.
 * Every public method maps to a specific HTTP verb + path combination and
 * delegates to {@link PaymentService}.
 */
@ApiTags('payment')
@ApiBearerAuth('JWT-auth')
@Controller('payment')
export class PaymentController {

  /**
   * @constructor
   * @description Injects the PaymentService singleton provided by PaymentModule.
   *
   * @param {PaymentService} paymentService - Service encapsulating all Paymob
   *   integration logic, Prisma persistence, and EMI scheduling.
   *
   * **Dependencies:** PaymentService (provided by PaymentModule).
   */
  constructor(
    private readonly paymentService: PaymentService,
  ) { }


  /**
   * Retrieve a Paymob authentication token.
   *
   * **Intent:**
   * Allow the client (or internal callers) to obtain a fresh Paymob auth token
   * that can be used for subsequent API calls to the Paymob platform.
   *
   * **Idea:**
   * Delegates to {@link PaymentService.getAuthToken} which in turn calls
   * {@link HelperService.getAuthToken} to authenticate with Paymob.
   *
   * **Usage:**
   * `GET /payment/get-auth-token`
   *
   * **Data Flow:**
   * Client GET --> controller --> PaymentService.getAuthToken --> HelperService
   * --> Paymob Auth API --> token returned in `{ status, message, data }` envelope.
   *
   * **Dependencies:** HelperService (transitive via PaymentService).
   *
   * **Notes:**
   * - This endpoint is **not** guarded by AuthGuard; it is publicly accessible.
   *
   * @param {any} req - Express request object (injected by NestJS `@Request()`).
   * @returns {Promise<{status: boolean, message: string, data?: string}>}
   *   Standard response envelope containing the Paymob auth token on success.
   */
  // P1-03 FIX: Restrict Paymob auth token to super-admin only
  @UseGuards(SuperAdminAuthGuard)
  @Get('/get-auth-token')
  getAuthToken(@Request() req) {
    return this.paymentService.getAuthToken(req);
  }


  /**
   * Create a Paymob payment intention for DIRECT, ADVANCE, or DUE payment types.
   *
   * **Intent:**
   * Initiate a payment flow by creating an "intention" on the Paymob platform.
   * The returned client secret / redirect URL lets the frontend complete checkout.
   *
   * **Idea:**
   * Validates the incoming payload (amount, billing_data, extras, special_reference),
   * then POSTs to the Paymob Intention API (`/v1/intention/`).
   *
   * **Usage:**
   * `POST /payment/create-paymob-intention`
   * Body: `{ amount, billing_data, extras: { orderId, paymentType }, special_reference, ... }`
   *
   * **Data Flow:**
   * Client POST --> controller --> PaymentService.createIntention
   * --> Paymob `/v1/intention/` --> response envelope with intention data.
   *
   * **Dependencies:** Paymob Intention API (via axios in service).
   *
   * **Notes:**
   * - `AuthGuard` is currently commented out; the endpoint is publicly callable.
   * - Currency is hard-coded to `"OMR"` (Omani Rial).
   * - The `notification_url` in the service points to the `/paymob-webhook` endpoint.
   *
   * @param {any} req     - Express request object.
   * @param {any} payload - Request body containing payment intention fields.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   *   Paymob intention response wrapped in the standard envelope.
   */
  // N-004 FIX: Re-enable AuthGuard — payment intentions must be authenticated
  @UseGuards(AuthGuard)
  @Post('/create-paymob-intention')
  createIntention(@Request() req, @Body() payload: any) {
    return this.paymentService.createIntention(payload, req);
  }

  /**
   * Paymob webhook receiver for DIRECT, ADVANCE, and DUE transactions.
   *
   * **Intent:**
   * Receive asynchronous payment notifications from Paymob after a transaction
   * completes (success or failure) and update the local database accordingly.
   *
   * **Idea:**
   * Paymob sends a POST with `type === 'TRANSACTION'` containing the transaction
   * outcome.  The handler routes to the correct persistence path based on
   * `payment_key_claims.extra.paymentType` (DIRECT | ADVANCE | DUE).
   *
   * **Usage:**
   * `POST /payment/paymob-webhook`
   * Called by Paymob servers; not intended for direct client use.
   *
   * **Data Flow:**
   * Paymob POST --> controller --> PaymentService.paymobWebhook
   * --> Prisma `transactionPaymob` update / create --> Prisma `order` status update.
   *
   * **Dependencies:** Paymob webhook infrastructure, Prisma (`transactionPaymob`, `order`).
   *
   * **Notes:**
   * - No AuthGuard -- Paymob calls this endpoint server-to-server.
   * - For DUE payments a new `transactionPaymob` record is **created** rather than updated.
   *
   * @param {any} req     - Express request object (raw webhook body available at `req.body`).
   * @param {any} payload - Parsed JSON body from Paymob.
   * @returns {Promise<{success: boolean, message: string}>}
   */
  @Post('/paymob-webhook')
  paymobWebhook(@Request() req, @Body() payload: any) {
    return this.paymentService.paymobWebhook(payload, req);
  }

  /**
   * Create a hosted Paymob payment link.
   *
   * **Intent:**
   * Generate a one-time payment link that can be shared with a buyer via email,
   * SMS, or chat so they can complete payment outside the normal checkout flow.
   *
   * **Idea:**
   * Authenticates with Paymob via `HelperService.getAuthToken()`, builds the
   * payload for the Paymob E-Commerce Payment Links API, and returns the
   * generated link data.
   *
   * **Usage:**
   * `POST /payment/createPaymentLink`  (AuthGuard protected)
   * Body: `{ amountCents, referenceId, email, fullName, description, ... }`
   *
   * **Data Flow:**
   * Client POST --> AuthGuard --> controller --> PaymentService.createPaymentLink
   * --> HelperService.getAuthToken --> Paymob `/api/ecommerce/payment-links`
   * --> response envelope with link URL.
   *
   * **Dependencies:** HelperService, Paymob Payment Links API (via axios).
   *
   * **Notes:**
   * - This is one of the few endpoints protected by {@link AuthGuard}.
   * - `notification_url` points to `/paymob-webhook-createPaymentLink`.
   *
   * @param {any} req     - Express request with authenticated user on `req.user`.
   * @param {any} payload - Request body with payment-link parameters.
   * @returns {Promise<{success: boolean, message: string, data?: any}>}
   */
  @UseGuards(AuthGuard)
  @Post('/createPaymentLink')
  createPaymentLink(@Request() req, @Body() payload: any) {
    return this.paymentService.createPaymentLink(payload, req);
  }

  /**
   * Paymob webhook receiver for payment-link transactions.
   *
   * **Intent:**
   * Handle the asynchronous callback from Paymob when a buyer completes (or
   * fails) a payment initiated through a hosted payment link.
   *
   * **Idea:**
   * Extracts the `orderId` from the first item's `description` field using a
   * regex (`orderId=(\d+)`), then updates `transactionPaymob` and marks the
   * `order` as `PAID`.
   *
   * **Usage:**
   * `POST /payment/paymob-webhook-createPaymentLink`
   * Called by Paymob servers.
   *
   * **Data Flow:**
   * Paymob POST --> controller --> PaymentService.paymobwebhookForCreatePaymentLink
   * --> regex orderId extraction --> Prisma updates (`transactionPaymob`, `order`).
   *
   * **Dependencies:** Paymob webhook infrastructure, Prisma.
   *
   * **Notes:**
   * - Unguarded (server-to-server from Paymob).
   * - Transaction type is tagged as `'PAYMENTLINK'`.
   *
   * @param {any} req     - Express request object.
   * @param {any} payload - Parsed JSON body from Paymob.
   * @returns {Promise<{success: boolean, message: string, orderId?: number, transactionDetail?: any}>}
   */
  @Post('/paymob-webhook-createPaymentLink')
  paymobwebhookForCreatePaymentLink(@Request() req, @Body() payload: any) {
    return this.paymentService.paymobwebhookForCreatePaymentLink(payload, req);
  }

  /**
   * Persist a saved-card token received from Paymob.
   *
   * **Intent:**
   * Store the tokenised card credential returned by Paymob so that future
   * recurring / EMI payments can be charged without asking the buyer to
   * re-enter card details.
   *
   * **Idea:**
   * Paymob POSTs the token object after the initial card-present transaction.
   * This endpoint writes it into `orderSaveCardToken` for later retrieval
   * by the EMI cron job or manual installment trigger.
   *
   * **Usage:**
   * `POST /payment/createSaveCardToken`
   * Body: Paymob token webhook payload (`{ obj: { order_id, token, ... }, type }`).
   *
   * **Data Flow:**
   * Paymob POST --> controller --> PaymentService.createSaveCardToken
   * --> Prisma `orderSaveCardToken.create`.
   *
   * **Dependencies:** Prisma (`orderSaveCardToken`).
   *
   * **Notes:**
   * - Unguarded -- called by Paymob servers.
   * - The `payload` parameter in the signature is not forwarded; the service
   *   reads directly from `req.body`.
   *
   * @param {any} req     - Express request object containing the Paymob token payload.
   * @param {any} payload - Request body (unused in service; kept for decorator compliance).
   * @returns {Promise<{success: boolean, message: string, data?: any}>}
   */
  @Post('/createSaveCardToken')
  createSaveCardToken(@Request() req, @Body() payload: any) {
    return this.paymentService.createSaveCardToken(req);
  }

  /**
   * Retrieve all Paymob transactions for the authenticated user.
   *
   * **Intent:**
   * Provide a paginated list of the calling user's payment transactions for
   * display in a "My Payments" or order-history view.
   *
   * **Idea:**
   * Reads `page` and `limit` from query parameters, fetches matching
   * `transactionPaymob` records ordered by `createdAt DESC`, and returns them
   * with pagination metadata.
   *
   * **Usage:**
   * `GET /payment/transaction/getl-all?page=1&limit=10`  (AuthGuard protected)
   *
   * **Data Flow:**
   * Client GET --> AuthGuard --> controller --> PaymentService.getAllTransaction
   * --> Prisma `transactionPaymob.findMany` --> paginated envelope.
   *
   * **Dependencies:** Prisma (`transactionPaymob`), AuthGuard.
   *
   * **Notes:**
   * - Route path contains a typo (`getl-all` instead of `get-all`); kept as-is
   *   to preserve API compatibility.
   *
   * @param {any} req - Express request with `req.user.id` set by AuthGuard and
   *   `req.query.page` / `req.query.limit` for pagination.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number, currentPage?: number, totalPages?: number}>}
   */
  @UseGuards(AuthGuard)
  @Get('/transaction/getl-all')
  getAllTransaction(@Request() req) {
    return this.paymentService.getAllTransaction(req);
  }

  /**
   * Execute a payment using a previously saved card token.
   *
   * **Intent:**
   * Charge a buyer's tokenised card without requiring them to re-enter payment
   * details -- used for recurring or follow-up payments.
   *
   * **Idea:**
   * Sends the saved-card `identifier` (token) and a `payment_token` to the
   * Paymob acceptance payments API with `subtype: 'TOKEN'`.
   *
   * **Usage:**
   * `POST /payment/createPaymentUsingSaveCardToken`
   * Body: `{ identifier: "<card-token>", payment_token: "<payment-key>" }`
   *
   * **Data Flow:**
   * Client POST --> controller --> PaymentService.createPaymentUsingSaveCardToken
   * --> Paymob `/api/acceptance/payments/pay` --> response envelope.
   *
   * **Dependencies:** Paymob Acceptance API (via axios).
   *
   * **Notes:**
   * - Unguarded -- intended for internal / testing use.
   * - The `payload` parameter is not forwarded; values are read from `req.body`.
   *
   * @param {any} req     - Express request containing `identifier` and `payment_token` on body.
   * @param {any} payload - Request body (unused in service).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  // N-004 FIX: Guard saved-card payment — must require authentication
  @UseGuards(AuthGuard)
  @Post('/createPaymentUsingSaveCardToken')
  createPaymentUsingSaveCardToken(@Request() req, @Body() payload: any) {
    return this.paymentService.createPaymentUsingSaveCardToken(req);
  }

  /**
   * Create the first EMI (Equated Monthly Installment) payment intention.
   *
   * **Intent:**
   * Initiate the EMI payment flow by creating a Paymob intention for the first
   * installment.  The buyer completes this payment on the Paymob-hosted page,
   * and the card is saved (force_save_card) so that subsequent installments can
   * be auto-charged.
   *
   * **Idea:**
   * Validates the same payload shape as `createIntention` but routes the
   * `notification_url` to the EMI-specific webhook (`/webhook-PaymentForEMI`).
   *
   * **Usage:**
   * `POST /payment/createPaymentForEMI`
   * Body: `{ amount, billing_data, extras: { orderId, paymentType: 'EMI' }, special_reference, ... }`
   *
   * **Data Flow:**
   * Client POST --> controller --> PaymentService.createPaymentForEMI
   * --> Paymob `/v1/intention/` --> intention data with payment redirect.
   *
   * **Dependencies:** Paymob Intention API (via axios).
   *
   * **Notes:**
   * - Unguarded in the current configuration.
   * - After the first payment succeeds, the card token is persisted via
   *   the `/createSaveCardToken` webhook flow.
   *
   * @param {any} req     - Express request object.
   * @param {any} payload - Request body with EMI payment fields.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  // N-004 FIX: Guard EMI payment creation — must require authentication
  @UseGuards(AuthGuard)
  @Post('/createPaymentForEMI')
  createPaymentForEMI(@Request() req, @Body() payload: any) {
    return this.paymentService.createPaymentForEMI(payload, req);
  }

  /**
   * Paymob webhook receiver for the first EMI payment transaction.
   *
   * **Intent:**
   * Process the Paymob callback after the buyer completes (or fails) the first
   * EMI installment and update the transaction / order records.
   *
   * **Idea:**
   * Updates the existing `transactionPaymob` record and sets the order status
   * to `PENDING` (not `PAID`) because further installments remain.  Also
   * persists the `paymobOrderId` on the order for future token look-ups.
   *
   * **Usage:**
   * `POST /payment/webhook-PaymentForEMI`
   * Called by Paymob servers after the first EMI transaction.
   *
   * **Data Flow:**
   * Paymob POST --> controller --> PaymentService.webhookForFirstEMI
   * --> Prisma updates (`transactionPaymob`, `order`).
   *
   * **Dependencies:** Paymob webhook infrastructure, Prisma.
   *
   * **Notes:**
   * - Unguarded (server-to-server).
   * - The `payload` parameter is not forwarded; the service reads `req.body`.
   *
   * @param {any} req     - Express request object.
   * @param {any} payload - Parsed Paymob webhook body (unused directly).
   * @returns {Promise<void | {status: boolean, message: string, error?: any}>}
   */
  @Post('/webhook-PaymentForEMI')
  webhookForFirstEMI(@Request() req, @Body() payload: any) {
    return this.paymentService.webhookForFirstEMI(req);
  }

  /**
   * Paymob webhook receiver for subsequent (recurring) EMI installment payments.
   *
   * **Intent:**
   * Handle the callback from Paymob each time an auto-charged EMI installment
   * completes, and keep the EMI schedule in sync.
   *
   * **Idea:**
   * Creates a new `transactionPaymob` record for the installment, increments
   * `emiInstallmentsPaid`, and advances `nextEmiDueDate` by 30 days.  When all
   * installments are paid, marks the EMI as `COMPLETED`.  On failure, retries
   * the next day by setting `nextEmiDueDate` to tomorrow.
   *
   * **Usage:**
   * `POST /payment/webhookForEMI`
   * Called by Paymob servers after each recurring EMI charge.
   *
   * **Data Flow:**
   * Paymob POST --> controller --> PaymentService.webhookForEMI
   * --> Prisma creates `transactionPaymob` --> Prisma updates `orderEMI`.
   *
   * **Dependencies:** Paymob webhook infrastructure, Prisma (`transactionPaymob`, `orderEMI`).
   *
   * **Notes:**
   * - Unguarded (server-to-server).
   *
   * @param {any} req     - Express request object.
   * @param {any} payload - Parsed Paymob webhook body (unused directly).
   * @returns {Promise<void | {status: boolean, message: string, error?: any}>}
   */
  @Post('/webhookForEMI')
  webhookForEMI(@Request() req, @Body() payload: any) {
    return this.paymentService.webhookForEMI(req);
  }

  /**
   * Manually trigger an EMI installment payment (testing endpoint).
   *
   * **Intent:**
   * Allow developers to manually trigger the installment payment flow for a
   * given order without waiting for the cron job, facilitating QA and debugging.
   *
   * **Idea:**
   * Looks up the order, retrieves its saved card token, creates a new Paymob
   * intention using the MOTO integration ID, and charges the card via the
   * acceptance payments API.
   *
   * **Usage:**
   * `POST /payment/payInstallment-testing`
   * Body: `{ orderId: <number> }`
   *
   * **Data Flow:**
   * Client POST --> controller --> PaymentService.payInstallment
   * --> Prisma order + token look-up --> Paymob `/v1/intention/` (MOTO)
   * --> Paymob `/api/acceptance/payments/pay` --> response envelope.
   *
   * **Dependencies:** Paymob Intention API (MOTO), Paymob Acceptance API, Prisma.
   *
   * **Notes:**
   * - Intended **only** for testing; no AuthGuard is applied.
   * - The amount is hard-coded to `1000` (will need to be dynamic in production).
   * - Uses MOTO integration ID `25198` for unattended card charges.
   *
   * @param {any} req     - Express request with `req.body.orderId`.
   * @param {any} payload - Request body (unused directly by service).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  // N-004 FIX: Removed payInstallment-testing endpoint (was exposed in production with no auth).
  // Use the cron job or an admin-only endpoint for EMI testing.

  /**
   * AMWALPAY
   */
  // N-004 FIX: Guard AmwalPay config creation — must require authentication
  @UseGuards(AuthGuard)
  @Post('/create-amwalpay-config')
  createAmwalPayConfig(@Request() req, @Body() payload: any) {
    return this.paymentService.createAmwalPayConfig(payload, req);
  }

  @Post('/amwalpay-webhook')
  amwalPayWebhook(@Request() req, @Body() payload: any) {
    return this.paymentService.amwalPayWebhook(payload, req);
  }

  // N-004 FIX: Guard AmwalPay wallet config — must require authentication
  @UseGuards(AuthGuard)
  @Post('/create-amwalpay-wallet-config')
  createAmwalPayWalletConfig(@Request() req, @Body() payload: any) {
    return this.paymentService.createAmwalPayWalletConfig(payload, req);
  }

  // N-004 FIX: Guard AmwalPay wallet verification — credits wallets, must require authentication
  @UseGuards(AuthGuard)
  @Post('/verify-amwalpay-wallet-payment')
  verifyAmwalPayWalletPayment(@Request() req, @Body() payload: any) {
    return this.paymentService.verifyAmwalPayWalletPayment(payload, req);
  }

}
