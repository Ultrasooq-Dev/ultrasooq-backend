/**
 * @fileoverview Payment Service - Core business logic for the Ultrasooq payment subsystem.
 *
 * @description
 * Implements all Paymob (Oman region) payment operations consumed by
 * {@link PaymentController}: authentication token retrieval, payment intention
 * creation (DIRECT / ADVANCE / DUE), webhook processing, payment-link
 * generation, saved-card tokenisation, and EMI (installment) scheduling with a
 * cron-based auto-charge mechanism.
 *
 * @module PaymentService
 *
 * **Intent:**
 * Centralise every piece of Paymob-facing business logic behind a single
 * injectable NestJS service so that the controller remains a thin HTTP adapter.
 *
 * **Idea:**
 * Each public method corresponds to one payment use-case.  Webhook handlers
 * update the Prisma-backed `transactionPaymob`, `order`, `orderEMI`, and
 * `orderSaveCardToken` tables.  A scheduled cron job (`cronJobCheckEMIPayments`)
 * iterates over ongoing EMI plans and triggers token-based charges via Paymob's
 * MOTO (Mail-Order / Telephone-Order) integration.
 *
 * **Usage:**
 * Injected into {@link PaymentController} by NestJS DI.  Not intended for
 * direct instantiation.
 *
 * **Data Flow (high level):**
 * ```
 * Controller --> Service method --> Paymob REST API (axios)
 *                                --> PrismaClient (DB reads/writes)
 *                                --> HelperService (auth token)
 * ```
 *
 * **Dependencies:**
 * - `PrismaClient` -- module-scoped singleton (instantiated at file level)
 * - `Stripe`       -- module-scoped singleton (legacy; retained for future use)
 * - `axios`        -- HTTP client for Paymob API calls
 * - {@link AuthService}        -- authentication helper
 * - {@link NotificationService} -- notification dispatch
 * - {@link S3service}          -- S3 file-upload utilities
 * - {@link HelperService}      -- shared helpers (Paymob `getAuthToken`)
 * - `@nestjs/schedule` (`Cron`) -- declarative cron decorator for EMI polling
 *
 * **Notes:**
 * - PrismaClient and Stripe are instantiated at **module scope** (not injected).
 * - Currency is hard-coded to `"OMR"` (Omani Rial) across all Paymob calls.
 * - Webhook endpoints are intentionally unauthenticated (called by Paymob S2S).
 * - The Stripe instance is initialised but currently unused; it remains for a
 *   planned future Stripe integration path.
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { AuthService } from 'src/auth/auth.service';
import { NotificationService } from 'src/notification/notification.service';
import { S3service } from 'src/user/s3.service';
import Stripe from 'stripe';
import { HelperService } from 'src/helper/helper.service';
const axios = require("axios");
import * as cron from 'node-cron';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage } from 'src/common/utils/get-error-message';

/**
 * Module-scoped PrismaClient instance shared by all methods in this service.
 * Follows the project convention of creating a PrismaClient per module rather
 * than injecting a global Prisma service.
 * @type {PrismaClient}
 */

/**
 * Module-scoped Stripe client initialised with `STRIPE_SECRET_KEY`.
 * Currently unused -- retained for a future Stripe payment integration.
 * @type {Stripe}
 */
const stripe = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_placeholder'
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {})
  : null;

/**
 * @class PaymentService
 * @description
 * Injectable NestJS service encapsulating all Paymob payment integration logic
 * for the Ultrasooq B2B/B2C marketplace.  Handles direct payments, advance
 * payments, due-balance settlements, hosted payment links, saved-card token
 * storage, and EMI (installment) scheduling.
 */
@Injectable()
export class PaymentService {

  /**
   * @constructor
   * @description
   * Receives NestJS-injected dependencies required for authentication, notifications,
   * file storage, and Paymob helper utilities.
   *
   * @param {AuthService} authService - Service for user authentication operations.
   * @param {NotificationService} notificationService - Service for dispatching
   *   push / in-app notifications.
   * @param {S3service} s3service - AWS S3 file-upload service.
   * @param {HelperService} helperService - Shared helper service; provides
   *   `getAuthToken()` for Paymob API authentication.
   *
   * **Dependencies:**
   * All parameters are provided by the NestJS DI container via {@link PaymentModule}.
   */
  constructor(
    private readonly authService: AuthService,
    private readonly notificationService: NotificationService,
    private readonly s3service: S3service,
    private readonly helperService: HelperService,
    private readonly prisma: PrismaService,
  ) { }

  /**
   * Retrieve all Paymob transactions for the authenticated user (paginated).
   *
   * **Intent:**
   * Provide the frontend with a paginated transaction history so users can
   * review their past payments on the "My Payments" / order-history screen.
   *
   * **Idea:**
   * Reads `page` and `limit` from `req.query`, applies offset-based pagination,
   * and queries `transactionPaymob` records filtered by the authenticated user's
   * ID, ordered newest-first.
   *
   * **Usage:**
   * Called by {@link PaymentController.getAllTransaction} via
   * `GET /payment/transaction/getl-all?page=1&limit=10`.
   *
   * **Data Flow:**
   * 1. Extract `userId` from `req.user.id` (set by AuthGuard).
   * 2. Parse `page` / `limit` query params (defaults: 1 / 10).
   * 3. `this.prisma.transactionPaymob.findMany()` with `skip` and `take`.
   * 4. `this.prisma.transactionPaymob.count()` for total count.
   * 5. Return `{ status, message, data, totalCount, currentPage, totalPages }`.
   *
   * **Dependencies:** Prisma (`transactionPaymob`).
   *
   * **Notes:**
   * - Returns `{ status: false }` if the user is not authenticated.
   * - Catches all errors and returns a safe envelope rather than throwing.
   *
   * @param {any} req - Express request with `req.user.id` and `req.query.page` / `req.query.limit`.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number, currentPage?: number, totalPages?: number, error?: string}>}
   */
  async getAllTransaction(req: any) {
    try {
      const userId = req?.user?.id;
      if (!userId) {
        return {
          status: false,
          message: 'User not authenticated',
        };
      }
  
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const skip = (page - 1) * limit;
  
      const transactions = await this.prisma.transactionPaymob.findMany({
        where: {
          userId: userId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      });
  
      const totalCount = await this.prisma.transactionPaymob.count({
        where: {
          userId: userId,
        },
      });
  
      return {
        status: true,
        message: 'Fetched transactions successfully',
        data: transactions,
        totalCount,
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit)
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in getAllTransaction',
        error: getErrorMessage(error)
      };
    }
  }

  /**
   * Obtain a Paymob authentication token.
   *
   * **Intent:**
   * Fetch a fresh Paymob auth token that the frontend or other services can use
   * to authenticate subsequent Paymob API requests.
   *
   * **Idea:**
   * Delegates to {@link HelperService.getAuthToken} which encapsulates the
   * Paymob authentication endpoint call and returns the bearer / API token.
   *
   * **Usage:**
   * Called by {@link PaymentController.getAuthToken} via
   * `GET /payment/get-auth-token`.
   *
   * **Data Flow:**
   * 1. `this.helperService.getAuthToken()` -- calls Paymob auth API.
   * 2. Wraps the result in `{ status: true, message, data: token }`.
   *
   * **Dependencies:** {@link HelperService} (`getAuthToken`).
   *
   * **Notes:**
   * - The `req` parameter is accepted for controller-signature uniformity but
   *   is not used within the method body.
   *
   * @param {any} req - Express request object (unused).
   * @returns {Promise<{status: boolean, message: string, data?: string, error?: string}>}
   */
  async getAuthToken(req: any) {
    try {

      const token = await this.helperService.getAuthToken();

      return {
        status: true,
        message: 'fetched auth token',
        data: token
      };

    } catch (error) {
      return {
        status: false,
        message: 'Error in getAuthToken',
        error: getErrorMessage(error)
      };
    }
  }

  /**
   * Create a Paymob payment intention for DIRECT, ADVANCE, or DUE payment types.
   *
   * **Intent:**
   * Initiate a payment flow by registering a new "intention" on the Paymob
   * platform.  The response includes a client secret / redirect URL the frontend
   * uses to render the Paymob checkout page.
   *
   * **Idea:**
   * 1. Validate that the required top-level fields (`amount`, `billing_data`,
   *    `extras`, `special_reference`) are present.
   * 2. Validate nested `billing_data` fields (name, address, contact).
   * 3. Validate nested `extras` fields (`orderId`, `paymentType`).
   * 4. POST to Paymob `/v1/intention/` with the assembled payload.
   * 5. Return the Paymob response wrapped in the standard envelope.
   *
   * **Usage:**
   * Called by {@link PaymentController.createIntention} via
   * `POST /payment/create-paymob-intention`.
   *
   * **Data Flow:**
   * ```
   * payload validation --> axios.post(Paymob /v1/intention/) --> { status, message, data }
   * ```
   * - `notification_url` is hard-coded to `/payment/paymob-webhook`.
   * - `redirection_url` points to the frontend checkout-complete page.
   * - Currency is fixed to `"OMR"` (Omani Rial).
   * - `force_save_card` is `true` so the card token is persisted by Paymob.
   *
   * **Dependencies:**
   * - Paymob Intention API (`https://oman.paymob.com/v1/intention/`)
   * - Environment variables: `PAYMOB_SECRET_KEY`, `PAYMOB_INTEGRATION_ID`
   *
   * **Notes:**
   * - `payment_methods` is overridden to `[PAYMOB_INTEGRATION_ID]` regardless
   *   of what the client sends.
   * - Several destructured fields (`currency`, `payment_methods`,
   *   `notification_url`, `redirection_url`) from the payload are not forwarded;
   *   hard-coded values are used instead.
   *
   * @param {any} payload - Request body with `amount`, `billing_data`, `extras`,
   *   `special_reference`, and optional `items`.
   * @param {any} req     - Express request object (unused in body).
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: any}>}
   */
  async createIntention(payload: any, req: any) {
    try {

      const requiredFields = ['amount', 'billing_data', 'extras', 'special_reference'];
      // Validate top-level fields
      for (const field of requiredFields) {
        if (!payload[field]) {
          return {
            status: false,
            message: `Missing required field: ${field}`
          };
        }
      }

      const billingFields = [
        'apartment', 'first_name', 'last_name', 'street', 'building',
        'phone_number', 'city', 'country', 'email', 'floor', 'state'
      ];

      const extrasFields = ['orderId', 'paymentType'];

      // Validate billing_data fields
      for (const field of billingFields) {
        if (!payload.billing_data[field]) {
          return {
            status: false,
            message: `Missing required billing_data field: ${field}`
          };
        }
      }

      // Validate extras fields
      for (const field of extrasFields) {
        if (!payload.extras[field]) {
          return {
            status: false,
            message: `Missing required extras field: ${field}`
          };
        }
      }


      const PAYMOB_INTENTION_URL = 'https://oman.paymob.com/v1/intention/';
      const AUTH_TOKEN = process.env.PAYMOB_SECRET_KEY
      const {
        amount,
        currency,
        payment_methods,
        items,
        billing_data,
        extras,
        special_reference,
        notification_url,
        redirection_url
      } = payload;

      const response = await axios.post(
        PAYMOB_INTENTION_URL,
        {
          amount: amount,
          currency: "OMR",
          payment_methods: [parseInt(process.env.PAYMOB_INTEGRATION_ID)],
          items: items,
          billing_data: billing_data,
          extras: extras,
          special_reference: special_reference,
          notification_url: process.env.PAYMOB_WEBHOOK_URL || "https://devbackend.ultrasooq.com/payment/paymob-webhook",
          redirection_url: process.env.FRONTEND_CHECKOUT_URL || "https://dev.ultrasooq.com/checkout-complete",
          "force_save_card": true
        },
        {
          headers: {
            Authorization: `Token ${AUTH_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        status: true,
        message: 'Payment intention created successfully',
        data: response.data
      };
    } catch (error: any) {
      return {
        status: false,
        message: 'Error in createIntention',
        error: (error as any)?.response?.data || getErrorMessage(error)
      };
    }
  }

  /**
   * Process the Paymob webhook for DIRECT, ADVANCE, and DUE transactions.
   *
   * **Intent:**
   * Receive and handle the asynchronous transaction notification from Paymob
   * after a buyer completes (or fails) a checkout, updating the local database
   * to reflect the payment outcome.
   *
   * **Idea:**
   * 1. Check that `data.type === 'TRANSACTION'`.
   * 2. Extract `success`, `id`, `amount_cents`, `order`, and
   *    `payment_key_claims` from `data.obj`.
   * 3. Branch on `payment_key_claims.extra.paymentType`:
   *    - **DIRECT** -- Update existing `transactionPaymob` to SUCCESS/FAILED;
   *      on success also update `order.orderStatus` to `PAID`.
   *    - **ADVANCE** -- Same update pattern but order status is **not** changed
   *      (the order remains in its current state until the balance is settled).
   *    - **DUE** -- **Create** a new `transactionPaymob` record (since the
   *      original was recorded at order time); on success clear `dueAmount` and
   *      mark order as `PAID`.
   *
   * **Usage:**
   * Called by {@link PaymentController.paymobWebhook} via
   * `POST /payment/paymob-webhook`.
   * Invoked server-to-server by Paymob; not called by the frontend directly.
   *
   * **Data Flow:**
   * ```
   * Paymob POST (req.body) --> type check --> paymentType branch
   *   --> this.prisma.transactionPaymob.updateMany / create
   *   --> this.prisma.order.update (conditional)
   *   --> { success: true, message }
   * ```
   *
   * **Dependencies:**
   * - Prisma (`transactionPaymob`, `order`)
   *
   * **Notes:**
   * - The outer `try` wraps an inner `try/catch` that silently catches logging
   * - `orderId` is extracted from `payment_key_claims.extra.orderId` (parsed as int).
   * - For the DUE path, `orderDetail` is fetched to obtain `userId` for the
   *   new transaction record.
   *
   * @param {any} payload - Parsed JSON body from Paymob (also available on `req.body`).
   * @param {any} req     - Express request object; `req.body` is the raw webhook data.
   * @returns {Promise<{success: boolean, message: string} | {status: boolean, message: string, error?: any}>}
   */
  async paymobWebhook(payload: any, req: any) {
    try {
      try {
      } catch (e) {
      }
      const data = req.body;
      if (data?.type === 'TRANSACTION') {
        const { success, id, amount_cents, order, payment_key_claims } = data.obj;
        const merchant_order_id = parseInt(order?.merchant_order_id);
        const orderId = parseInt(payment_key_claims?.extra.orderId);

        if (payment_key_claims && payment_key_claims.extra.paymentType === 'DIRECT') {

          if (success && orderId) {

            let transactionDetail = await this.prisma.transactionPaymob.updateMany({
              where: { orderId: orderId },
              data: {
                transactionStatus: 'SUCCESS',
                paymobTransactionId: String(id), // <-- convert to string,
                amountCents: data.obj.amount_cents || 0,
                success: success,
                paymobObject: req.body,
                merchantOrderId: merchant_order_id,
                paymobOrderId: order?.id,
              }
            });
            await this.prisma.order.update({
              where: { id: orderId },
              data: {
                orderStatus: 'PAID'
              }
            });
          } else {
            let transactionDetail = await this.prisma.transactionPaymob.updateMany({
              where: { orderId: orderId },
              data: {
                transactionStatus: 'FAILED',
                paymobTransactionId: String(id), // <-- convert to string,
                amountCents: data?.obj?.amount_cents || 0,
                success: success,
                paymobObject: req.body,
                merchantOrderId: merchant_order_id,
                paymobOrderId: order?.id,
              }
            });
          }
        } else if (payment_key_claims && payment_key_claims.extra.paymentType === 'ADVANCE') {

          // update transaction
          if (success && orderId) {

            let transactionDetail = await this.prisma.transactionPaymob.updateMany({
              where: { orderId: orderId },
              data: {
                transactionStatus: 'SUCCESS',
                paymobTransactionId: String(id), // <-- convert to string,
                amountCents: data.obj.amount_cents || 0,
                success: success,
                paymobObject: req.body,
                merchantOrderId: merchant_order_id,
                paymobOrderId: order?.id,
              }
            });
          } else {
            let transactionDetail = await this.prisma.transactionPaymob.updateMany({
              where: { orderId: orderId },
              data: {
                transactionStatus: 'FAILED',
                paymobTransactionId: String(id), // <-- convert to string,
                amountCents: data?.obj?.amount_cents || 0,
                success: success,
                paymobObject: req.body,
                merchantOrderId: merchant_order_id,
                paymobOrderId: order?.id,
              }
            });
          }

        } else if (payment_key_claims && payment_key_claims.extra.paymentType === 'DUE') {


          let orderDetail = await this.prisma.order.findUnique({
            where: { id: orderId },
          });
          // create trasaction
          if (success && orderId) {
            let newTransaction = await this.prisma.transactionPaymob.create({
              data: {
                transactionStatus: 'SUCCESS',
                paymobTransactionId: String(id), // <-- convert to string,
                amountCents: data.obj.amount_cents || 0,
                success: success,
                paymobObject: req.body,
                merchantOrderId: merchant_order_id,
                paymobOrderId: order?.id,
                orderId: orderId,
                transactionType: 'DUE',
                userId: orderDetail.userId
              }
            });
            await this.prisma.order.update({
              where: { id: orderId },
              data: {
                dueAmount: 0,
                orderStatus: 'PAID'
              }
            });
          } else {
            let newTransaction = await this.prisma.transactionPaymob.create({
              data: {
                transactionStatus: 'FAILED',
                paymobTransactionId: String(id), // <-- convert to string,
                amountCents: data.obj.amount_cents || 0,
                success: success,
                paymobObject: req.body,
                merchantOrderId: merchant_order_id,
                paymobOrderId: order?.id,
                orderId: orderId,
                transactionType: 'DUE',
                userId: orderDetail.userId
              }
            })
          }

        }
      }

      return {
        success: true,
        message: "paymobWebhook successfully"
      };

    } catch (error) {
      return {
        status: false,
        message: 'Error in paymobWebhook',
        error: (error as any)?.response?.data || getErrorMessage(error)
      };
    }
  }

  /**
   * Create a hosted Paymob payment link.
   *
   * **Intent:**
   * Generate a shareable, one-time payment URL via the Paymob E-Commerce
   * Payment Links API so that a buyer can complete payment outside the normal
   * checkout flow (e.g., via email or chat).
   *
   * **Idea:**
   * 1. Obtain a Paymob auth token through {@link HelperService.getAuthToken}.
   * 2. Build the JSON payload (amount, reference, billing info, redirect URLs).
   * 3. POST to `https://oman.paymob.com/api/ecommerce/payment-links`.
   * 4. Return the Paymob response (includes the hosted link URL).
   *
   * **Usage:**
   * Called by {@link PaymentController.createPaymentLink} via
   * `POST /payment/createPaymentLink` (AuthGuard protected).
   *
   * **Data Flow:**
   * ```
   * HelperService.getAuthToken() --> authToken
   * payload destructure --> jsonPayload assembly
   * axios.post(Paymob payment-links API) --> { success, message, data }
   * ```
   *
   * **Dependencies:**
   * - {@link HelperService} (`getAuthToken`)
   * - Paymob Payment Links API
   * - Environment variable: `PAYMOB_INTEGRATION_ID`
   *
   * **Notes:**
   * - `notification_url` is hard-coded to `/payment/paymob-webhook-createPaymentLink`.
   * - `redirection_url` defaults to the frontend checkout-complete page.
   * - `is_live` defaults to `false` when not supplied by the client.
   * - `phone_number` is accepted in the payload but commented out in the request body.
   *
   * @param {any} payload - Request body: `{ amountCents, referenceId, paymentMethods,
   *   email, fullName, description, redirectionUrl?, isLive?, phoneNumber? }`.
   * @param {any} req     - Express request with authenticated user context.
   * @returns {Promise<{success: boolean, message: string, data?: any, error?: any}>}
   */
  async createPaymentLink(payload: any, req: any) {
    try {
      const tokenResponse = await this.helperService.getAuthToken();
  
      
      const authToken = tokenResponse;

      
      // return;
  
      // Step 2: Prepare JSON payload
      const {
        amountCents,
        referenceId,
        paymentMethods,
        email,
        fullName,
        description,
        redirectionUrl,
        isLive,
        phoneNumber, // optional
      } = payload;
  
      const jsonPayload = {
        amount_cents: amountCents,
        reference_id: referenceId,
        payment_methods: [parseInt(process.env.PAYMOB_INTEGRATION_ID)],
        email: email,
        is_live: isLive || false,
        full_name: fullName,
        description: description,
        notification_url: process.env.PAYMOB_PAYMENT_LINK_WEBHOOK_URL || 'https://devbackend.ultrasooq.com/payment/paymob-webhook-createPaymentLink', // webhook
        redirection_url: redirectionUrl || process.env.FRONTEND_CHECKOUT_URL || 'https://dev.ultrasooq.com/checkout-complete', // redirect
        // phone_number: phoneNumber, // optional
      };
  
      // Step 3: Make request to Paymob
      const response = await axios.post(
        "https://oman.paymob.com/api/ecommerce/payment-links",
        jsonPayload,
        {
          headers: {
            "Authorization": `Bearer ${authToken}`,
            "Content-Type": "application/json",
          },
        }
      );
  
      return {
        success: true,
        message: "Payment link created successfully",
        data: response.data,
      };
  
    } catch (error: any) {
      return {
        success: false,
        message: "Failed to create payment link",
        error: (error as any)?.response?.data || getErrorMessage(error),
      };
    }
  }

  /**
   * Process the Paymob webhook for payment-link transactions.
   *
   * **Intent:**
   * Handle the asynchronous callback from Paymob when a buyer completes (or
   * fails) a payment initiated through a hosted payment link, and reconcile
   * the transaction / order state in the database.
   *
   * **Idea:**
   * 1. Extract `orderId` by regex-matching `orderId=(\d+)` inside the first
   *    item's `description` field of the webhook payload.
   * 2. Pull transaction metadata (`success`, `id`, `amount_cents`, etc.) from
   *    `data.obj`.
   * 3. Update the matching `transactionPaymob` records with status `SUCCESS`
   *    and tag the `transactionType` as `'PAYMENTLINK'`.
   * 4. Mark the corresponding `order` as `PAID`.
   *
   * **Usage:**
   * Called by {@link PaymentController.paymobwebhookForCreatePaymentLink} via
   * `POST /payment/paymob-webhook-createPaymentLink`.
   * Invoked server-to-server by Paymob.
   *
   * **Data Flow:**
   * ```
   * req.body --> orderId regex extraction from items[0].description
   * --> this.prisma.transactionPaymob.updateMany (SUCCESS, PAYMENTLINK)
   * --> this.prisma.order.update (PAID)
   * --> { success, message, orderId, transactionDetail }
   * ```
   *
   * **Dependencies:** Prisma (`transactionPaymob`, `order`).
   *
   * **Notes:**
   * - Throws if `orderId` cannot be extracted (returned as error envelope).
   * - Currently always sets `transactionStatus` to `'SUCCESS'`; failed payments
   *   are not explicitly handled (Paymob may not call back on failure for links).
   *
   * @param {any} payload - Parsed Paymob webhook body.
   * @param {any} req     - Express request; `req.body` is the raw webhook data.
   * @returns {Promise<{success: boolean, message: string, orderId?: number, transactionDetail?: any} | {status: boolean, message: string, error?: any}>}
   */
  async paymobwebhookForCreatePaymentLink(payload: any, req: any) {
    try {
  
      const data = req.body;
      let orderId: number | null = null;
  
      // Step 1: Extract orderId from description if event is TRANSACTION
      if (data?.type === 'TRANSACTION') {
        const items = data?.order?.items;
        const description = items?.[0]?.description;
  
        if (description) {
          const match = description.match(/orderId=(\d+)/);
          if (match) {
            orderId = parseInt(match[1], 10);
          }
        }
  
      }
  
      // Step 2: Safety check
      if (!orderId) {
        throw new Error('Order ID not found in webhook payload');
      }
  
      // Step 3: Extract other fields from webhook object
      const obj = data?.obj || {};
      const success = obj.success;
      const id = obj.id;
      const amount_cents = obj.amount_cents || 0;
      const merchant_order_id = parseInt(obj.order?.merchant_order_id);
      const paymobOrderId = data?.order?.id;
  
      // Step 4: Update transactionPaymob
      const transactionDetail = await this.prisma.transactionPaymob.updateMany({
        where: { orderId },
        data: {
          transactionStatus: 'SUCCESS',
          paymobTransactionId: String(id),
          amountCents: amount_cents,
          success: success,
          paymobObject: req.body,
          merchantOrderId: merchant_order_id,
          paymobOrderId: paymobOrderId,
          transactionType: 'PAYMENTLINK'
        },
      });
  
      // Step 5: Update order status
      await this.prisma.order.update({
        where: { id: orderId },
        data: { orderStatus: 'PAID' },
      });
  
      // Step 6: Respond
      return {
        success: true,
        message: 'paymobWebhookForCreatePaymentLink successfully',
        orderId,
        transactionDetail,
      };
  
    } catch (error: any) {
      return {
        status: false,
        message: 'Error in paymobwebhookForCreatePaymentLink',
        error: (error as any)?.response?.data || getErrorMessage(error),
      };
    }
  }

  /**
   * Persist a saved-card token received from Paymob.
   *
   * **Intent:**
   * Store the tokenised card credential that Paymob returns after the initial
   * card-present transaction, enabling future recurring / EMI payments to be
   * charged without buyer re-authentication.
   *
   * **Idea:**
   * Paymob POSTs a webhook containing `{ obj: { order_id, token, ... }, type }`.
   * This method writes the token and the full webhook object into the
   * `orderSaveCardToken` table, keyed by `paymobOrderId`.
   *
   * **Usage:**
   * Called by {@link PaymentController.createSaveCardToken} via
   * `POST /payment/createSaveCardToken`.
   * Invoked by Paymob servers after a successful card tokenisation event.
   *
   * **Data Flow:**
   * ```
   * req.body --> destructure { obj, type }
   * --> this.prisma.orderSaveCardToken.create({ paymobOrderId, token, saveCardObject })
   * --> { success, message, data }
   * ```
   *
   * **Dependencies:** Prisma (`orderSaveCardToken`).
   *
   * **Notes:**
   * - `paymobOrderId` is parsed as an integer from `obj.order_id`.
   * - The full raw body is stored in `saveCardObject` for auditing / debugging.
   * - This is part of the EMI payment flow; the saved token is later retrieved
   *   by {@link payInstallment} to charge subsequent installments.
   *
   * @param {any} req - Express request containing the Paymob token webhook payload on `req.body`.
   * @returns {Promise<{success: boolean, message: string, data?: any} | {status: boolean, message: string, error?: any}>}
   */
  async createSaveCardToken (req: any) {
    try {
      const { obj, type } = req.body;

      const newSaveCardToken = await this.prisma.orderSaveCardToken.create({
        data: {
          paymobOrderId: parseInt(obj?.order_id) || null,
          token: obj?.token || null,
          saveCardObject: req.body,
        },
      });

      return {
        success: true,
        message: 'newSaveCardToken created successfully',
        data: newSaveCardToken,
      };
      
    } catch (error) {
      return {
        status: false,
        message: 'Error in createSaveCardToken',
        error: (error as any)?.response?.data || getErrorMessage(error),
      };
    }
  }

  /**
   * Execute a payment using a previously saved card token.
   *
   * **Intent:**
   * Charge a buyer's tokenised card without requiring them to re-enter payment
   * details.  Useful for recurring payments, follow-up charges, or testing the
   * saved-token flow.
   *
   * **Idea:**
   * Sends the saved-card `identifier` (token string) and a `payment_token`
   * (Paymob payment key) to the Paymob Acceptance Payments API with
   * `subtype: 'TOKEN'`.
   *
   * **Usage:**
   * Called by {@link PaymentController.createPaymentUsingSaveCardToken} via
   * `POST /payment/createPaymentUsingSaveCardToken`.
   *
   * **Data Flow:**
   * ```
   * req.body { identifier, payment_token }
   * --> axios.post(Paymob /api/acceptance/payments/pay)
   * --> { status, message, data }
   * ```
   *
   * **Dependencies:**
   * - Paymob Acceptance Payments API (`https://oman.paymob.com/api/acceptance/payments/pay`)
   *
   * **Notes:**
   * - This is primarily a **test / utility** endpoint.
   * - The caller must supply both `identifier` and `payment_token` on the
   *   request body.
   *
   * @param {any} req - Express request with `req.body.identifier` (card token)
   *   and `req.body.payment_token` (Paymob payment key).
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: any}>}
   */
  async createPaymentUsingSaveCardToken(req: any) {
    try {

      const response = await axios.post(
        'https://oman.paymob.com/api/acceptance/payments/pay',
        {
          source: {
            identifier: req.body.identifier, // e.g., token
            subtype: 'TOKEN'
          },
          payment_token: req.body.payment_token
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        status: true,
        message: 'Payment created successfully',
        data: response.data
      };
    } catch (error: any) {

      return {
        status: false,
        message: 'Error in createPaymentPaymob',
        error: (error as any)?.response?.data || getErrorMessage(error)
      };
    }
  }

  /**
   * Create the first EMI (Equated Monthly Installment) payment intention.
   *
   * **Intent:**
   * Initiate the EMI payment flow by creating a Paymob intention for the first
   * installment.  The buyer completes payment on the Paymob-hosted page; the
   * card is force-saved so that subsequent installments can be auto-charged
   * by the cron job.
   *
   * **Idea:**
   * 1. Validate the payload identically to {@link createIntention} (top-level
   *    fields, `billing_data` sub-fields, `extras` sub-fields).
   * 2. POST to Paymob `/v1/intention/` with `notification_url` pointing to
   *    the EMI-specific webhook (`/webhook-PaymentForEMI`) instead of the
   *    general webhook.
   * 3. Return the Paymob intention data to the frontend.
   *
   * **Usage:**
   * Called by {@link PaymentController.createPaymentForEMI} via
   * `POST /payment/createPaymentForEMI`.
   *
   * **Data Flow:**
   * ```
   * payload validation --> axios.post(Paymob /v1/intention/)
   * --> { status, message, data }
   * ```
   * - `notification_url` = `/payment/webhook-PaymentForEMI`
   * - `redirection_url` = frontend checkout-complete page
   * - Currency: `"OMR"`
   *
   * **Dependencies:**
   * - Paymob Intention API
   * - Environment variables: `PAYMOB_SECRET_KEY`, `PAYMOB_INTEGRATION_ID`
   *
   * **Notes:**
   * - The validation logic mirrors `createIntention`; both share the same
   *   required-field lists.
   * - After the first payment succeeds, the card token is stored via the
   *   `/createSaveCardToken` webhook.
   * - `force_save_card` is **not** explicitly set here (unlike `createIntention`)
   *   but Paymob may still save the card based on the integration configuration.
   *
   * @param {any} payload - Request body with `amount`, `billing_data`,
   *   `extras: { orderId, paymentType: 'EMI' }`, `special_reference`, and optional `items`.
   * @param {any} req     - Express request object (unused in body).
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: any}>}
   */
  async createPaymentForEMI (payload: any, req: any) {
    try {
      const requiredFields = ['amount', 'billing_data', 'extras', 'special_reference'];
      // Validate top-level fields
      for (const field of requiredFields) {
        if (!payload[field]) {
          return {
            status: false,
            message: `Missing required field: ${field}`
          };
        }
      }

      const billingFields = [
        'apartment', 'first_name', 'last_name', 'street', 'building',
        'phone_number', 'city', 'country', 'email', 'floor', 'state'
      ];

      const extrasFields = ['orderId', 'paymentType'];

      // Validate billing_data fields
      for (const field of billingFields) {
        if (!payload.billing_data[field]) {
          return {
            status: false,
            message: `Missing required billing_data field: ${field}`
          };
        }
      }

      // Validate extras fields
      for (const field of extrasFields) {
        if (!payload.extras[field]) {
          return {
            status: false,
            message: `Missing required extras field: ${field}`
          };
        }
      }

      const PAYMOB_INTENTION_URL = 'https://oman.paymob.com/v1/intention/';
      const AUTH_TOKEN = process.env.PAYMOB_SECRET_KEY
      const {
        amount,
        currency,
        payment_methods,
        items,
        billing_data,
        extras,
        special_reference,
        notification_url,
        redirection_url
      } = payload;

      const response = await axios.post(
        PAYMOB_INTENTION_URL,
        {
          amount: amount,
          currency: "OMR",
          payment_methods: [parseInt(process.env.PAYMOB_INTEGRATION_ID)],
          items: items,
          billing_data: billing_data,
          extras: extras,
          special_reference: special_reference,
          notification_url: process.env.PAYMOB_EMI_WEBHOOK_URL || "https://devbackend.ultrasooq.com/payment/webhook-PaymentForEMI",
          redirection_url: process.env.FRONTEND_CHECKOUT_URL || "https://dev.ultrasooq.com/checkout-complete",
        },
        {
          headers: {
            Authorization: `Token ${AUTH_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return {
        status: true,
        message: 'createPaymentForEMI created successfully',
        data: response.data
      };

    } catch (error) {
      return {
        status: false,
        message: 'Error in createPaymentForEMI',
        error: (error as any)?.response?.data || getErrorMessage(error)
      };
    }
  }

  /**
   * Process the Paymob webhook for the first EMI payment transaction.
   *
   * **Intent:**
   * Handle the callback from Paymob after the buyer completes (or fails) the
   * initial EMI installment, and update local records so that the EMI schedule
   * can proceed.
   *
   * **Idea:**
   * 1. Verify `data.type === 'TRANSACTION'` and `paymentType === 'EMI'`.
   * 2. On success: update `transactionPaymob` to `SUCCESS`, set order status
   *    to `PENDING` (not `PAID` -- further installments remain), and persist
   *    the `paymobOrderId` on the order for saved-card look-ups.
   * 3. On failure: update `transactionPaymob` to `FAILED`.
   *
   * **Usage:**
   * Called by {@link PaymentController.webhookForFirstEMI} via
   * `POST /payment/webhook-PaymentForEMI`.
   * Invoked server-to-server by Paymob.
   *
   * **Data Flow:**
   * ```
   * req.body --> type + paymentType check
   * --> this.prisma.transactionPaymob.updateMany (SUCCESS | FAILED)
   * --> this.prisma.order.update (PENDING + paymobOrderId)  [on success]
   * ```
   *
   * **Dependencies:** Prisma (`transactionPaymob`, `order`).
   *
   * **Notes:**
   * - Setting the order to `PENDING` (rather than `PAID`) signals that the EMI
   *   plan is active but incomplete.
   * - The `paymobOrderId` stored on the order is used by {@link payInstallment}
   *   to look up the saved card token for recurring charges.
   * - Does not return an explicit success envelope on the happy path (returns
   *   `undefined`); only returns an error envelope on catch.
   *
   * @param {any} req - Express request; `req.body` contains the Paymob webhook payload.
   * @returns {Promise<void | {status: boolean, message: string, error?: any}>}
   */
  async webhookForFirstEMI (req: any) {
    try {
      const data = req.body;
      if (data?.type === 'TRANSACTION') {
        const { success, id, amount_cents, order, payment_key_claims } = data.obj;
        const merchant_order_id = parseInt(order?.merchant_order_id);
        const orderId = parseInt(payment_key_claims?.extra.orderId);

        if (payment_key_claims && payment_key_claims.extra.paymentType === 'EMI') {

          if (success && orderId) {

            let transactionDetail = await this.prisma.transactionPaymob.updateMany({
              where: { orderId: orderId },
              data: {
                transactionStatus: 'SUCCESS',
                paymobTransactionId: String(id), // <-- convert to string,
                amountCents: data.obj.amount_cents || 0,
                success: success,
                paymobObject: req.body,
                merchantOrderId: merchant_order_id,
                paymobOrderId: order?.id,
              }
            });
            await this.prisma.order.update({
              where: { id: orderId },
              data: {
                orderStatus: 'PENDING',
                paymobOrderId: String(order?.id),
              }
            });
          } else {
            let transactionDetail = await this.prisma.transactionPaymob.updateMany({
              where: { orderId: orderId },
              data: {
                transactionStatus: 'FAILED',
                paymobTransactionId: String(id), // <-- convert to string,
                amountCents: data?.obj?.amount_cents || 0,
                success: success,
                paymobObject: req.body,
                merchantOrderId: merchant_order_id,
                paymobOrderId: order?.id,
              }
            });
          }
        } 
      }
    } catch (error) {
      return {
        status: false,
        message: 'Error in createPaymentForEMI',
        error: (error as any)?.response?.data || getErrorMessage(error)
      };
    }
  }

  /**
   * Heartbeat cron job that runs every hour.
   *
   * **Intent:**
   * Provide a simple log-based heartbeat to confirm that the NestJS scheduler
   * is operational.
   *
   * **Idea:**
   * Logs a message to stdout on every invocation. No business logic is executed.
   *
   * **Usage:**
   * Automatically triggered by `@nestjs/schedule` at the top of every hour
   * (`0 0 * * * *`).  Not called by any controller.
   *
   * **Data Flow:**
   *
   * **Dependencies:** `@nestjs/schedule` (`Cron` decorator).
   *
   * **Notes:**
   * - A commented-out alternative schedule (an "every 5 seconds" cron string)
   *   exists for debugging purposes and can be re-enabled during development.
   * - No return value; errors are caught and logged silently.
   *
   * @returns {Promise<void>}
   */
  // @Cron('*/5 * * * * *')
  @Cron('0 0 * * * *')
  async cronJobRunEveryHour() {
    try{
    } catch (error) {
    }
  }

  /**
   * Cron job that checks for due EMI installments and triggers auto-charges.
   *
   * **Intent:**
   * Periodically scan all active EMI plans and automatically charge the next
   * installment when the due date has arrived, using the buyer's saved card
   * token.
   *
   * **Idea:**
   * 1. Query `orderEMI` for records with `emiStatus === 'ONGOING'`,
   *    `deletedAt === null`, and `emiInstallmentCount > 0`.
   * 2. For each EMI, check whether unpaid installments remain **and** the
   *    `nextEmiDueDate` is today or earlier.
   * 3. If both conditions hold, call {@link payInstallment} to create a Paymob
   *    intention + charge via the saved card token.
   *
   * **Usage:**
   * Intended to be triggered by `@nestjs/schedule` on a recurring interval.
   * The `@Cron` decorator is currently commented out (previously configured to run
   * every 2 minutes during development); the job must be re-enabled for
   * production EMI processing by adding an appropriate cron expression.
   *
   * **Data Flow:**
   * ```
   * Scheduler tick --> this.prisma.orderEMI.findMany(ONGOING)
   * --> for each overdue EMI: payInstallment(orderId)
   * ```
   *
   * **Dependencies:**
   * - Prisma (`orderEMI`)
   * - {@link payInstallment} (internal)
   * - `@nestjs/schedule` (`Cron` decorator -- currently disabled)
   *
   * **Notes:**
   * - The commented-out `@Cron` decorator means this job does **not** run
   *   automatically in the current build.
   * - `payInstallment` is invoked with `orderId` directly, but the method
   *   signature expects an Express `req` object -- see the note on
   *   {@link payInstallment} regarding dual-use (cron vs. HTTP).
   *
   * @returns {Promise<void>}
   */
  // @Cron('*/2 * * * *') // Every 2 minutes
  async cronJobCheckEMIPayments() {
    try {
  
      const ongoingEMIs = await this.prisma.orderEMI.findMany({
        where: {
          emiStatus: 'ONGOING',
          deletedAt: null,
          emiInstallmentCount: {
            gt: 0
          },
        },
      });
  
      for (const emi of ongoingEMIs) {
        const {
          orderId,
          emiInstallmentCount,
          emiInstallmentsPaid,
          nextEmiDueDate,
          emiInstallmentAmountCents
        } = emi;
  
        // Check if installments are still pending and due date is today or earlier
        if ( orderId && emiInstallmentCount > (emiInstallmentsPaid || 0) && nextEmiDueDate && new Date(nextEmiDueDate) <= new Date()) {
          await this.payInstallment(orderId );
        }
      }
  
    } catch (error) {
    }
  }

  /**
   * Trigger a single EMI installment payment using a saved card token.
   *
   * **Intent:**
   * Charge the buyer's saved card for one EMI installment by creating a Paymob
   * MOTO intention and immediately executing the token-based payment.
   *
   * **Idea:**
   * 1. Look up the order by `orderId` to obtain its `paymobOrderId`.
   * 2. Retrieve the saved card token from `orderSaveCardToken` using `paymobOrderId`.
   * 3. Create a new Paymob intention via `/v1/intention/` using the MOTO
   *    (Mail-Order / Telephone-Order) integration ID (`25198`), which allows
   *    unattended (no-3DS) charges.
   * 4. Extract the `payment_token` (payment key) from the intention response.
   * 5. POST to `/api/acceptance/payments/pay` with the saved card token and the
   *    payment key to execute the charge.
   *
   * **Usage:**
   * - Called by {@link PaymentController.payInstallment} via
   *   `POST /payment/payInstallment-testing` (testing endpoint).
   * - Also called internally by {@link cronJobCheckEMIPayments} (when enabled).
   *
   * **Data Flow:**
   * ```
   * req.body.orderId --> this.prisma.order.findUnique --> paymobOrderId
   * --> this.prisma.orderSaveCardToken.findFirst --> identifier (card token)
   * --> axios.post(Paymob /v1/intention/) [MOTO] --> payment_token
   * --> axios.post(Paymob /api/acceptance/payments/pay) --> { status, message, data }
   * ```
   *
   * **Dependencies:**
   * - Prisma (`order`, `orderSaveCardToken`)
   * - Paymob Intention API (MOTO integration)
   * - Paymob Acceptance Payments API
   * - Environment variables: `PAYMOB_SECRET_KEY`, `PAYMOB_INTEGRATION_ID`
   *
   * **Notes:**
   * - The amount is **hard-coded to `1000`** (minor units). This is a placeholder
   *   and should be replaced with dynamic installment amounts in production.
   * - `billing_data` fields are populated with `"dumy"` placeholder strings
   *   since the card is already tokenised and billing info is not re-validated.
   * - `payment_methods` uses the hard-coded MOTO integration ID `25198`, not the
   *   standard `PAYMOB_INTEGRATION_ID` environment variable.
   * - `notification_url` points to `/payment/webhookForEMI` so the result is
   *   processed by {@link webhookForEMI}.
   * - A commented-out alternative signature accepted `emiInstallmentAmountCents`
   *   for dynamic amounts.
   *
   * @param {any} req - Express request with `req.body.orderId`, **or** a plain
   *   orderId number when called from the cron job.
   * @returns {Promise<{status: boolean, message: string, data?: any, error?: any}>}
   */
  // async payInstallment(req: any, emiInstallmentAmountCents: any) {
  async payInstallment(req: any) {
    try {
      const PAYMOB_INTENTION_URL = 'https://oman.paymob.com/v1/intention/';
      const AUTH_TOKEN = process.env.PAYMOB_SECRET_KEY;
      const INTEGRATION_ID = parseInt(process.env.PAYMOB_INTEGRATION_ID);
  
      const orderId = req.body.orderId;

      // Fetch the order details
      const orderDetail = await this.prisma.order.findUnique({
        where: { id: orderId }
      });
      if (!orderDetail || !orderDetail.paymobOrderId) {
        throw new Error('Order or paymobOrderId not found');
      }
  
      const paymobOrderId = parseInt(orderDetail.paymobOrderId);
  
      // Get the saved card token
      const saveCardTakenDetail = await this.prisma.orderSaveCardToken.findFirst({
        where: { paymobOrderId }
      });
      if (!saveCardTakenDetail || !saveCardTakenDetail.token) {
        throw new Error('Saved card token not found');
      }
  
      const identifier = saveCardTakenDetail.token;
      const amount = 1000; // You might want to dynamically fetch this later
  
      const billing_data = {
        apartment: "dumy",
        first_name: "dumy",
        last_name: "dumy",
        street: "dumy",
        building: "dumy",
        phone_number: "dumy",
        city: "dumy",
        country: "dumy",
        email: "dumy",
        floor: "dumy",
        state: "dumy"
      };
  
      const extras = {
        orderId: orderId,
        paymentType: "EMI"
      };
  
      const special_reference = new Date();
  
      const responseIntention = await axios.post(
        PAYMOB_INTENTION_URL,
        {
          amount,
          currency: "OMR",
          payment_methods: [parseInt(process.env.PAYMOB_MOTO_INTEGRATION_ID || '25198')], //[INTEGRATION_ID], // Use this 25198 Intention Moto Id to create Intention for EMI Payment
          billing_data,
          extras,
          special_reference,
          notification_url: process.env.PAYMOB_EMI_RECURRING_WEBHOOK_URL || "https://devbackend.ultrasooq.com/payment/webhookForEMI",
          redirection_url: process.env.FRONTEND_CHECKOUT_URL || "https://dev.ultrasooq.com/checkout-complete"
        },
        {
          headers: {
            Authorization: `Token ${AUTH_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
  
      const paymentToken = responseIntention.data?.payment_keys?.[0]?.key;
      if (!paymentToken) {
        throw new Error('Payment token not received from Paymob');
      }
  
      const paymentResponse = await axios.post(
        'https://oman.paymob.com/api/acceptance/payments/pay',
        {
          source: {
            identifier,
            subtype: 'TOKEN'
          },
          payment_token: paymentToken
        },
        {
          headers: { 'Content-Type': 'application/json' }
        }
      );
  
      return {
        status: true,
        message: 'Payment created successfully',
        data: paymentResponse.data
      };
  
    } catch (error) {
      return {
        status: false,
        message: 'Error in payInstallment',
        error: (error as any)?.response?.data || getErrorMessage(error)
      };
    }
  }
  
  /**
   * Process the Paymob webhook for subsequent (recurring) EMI installment payments.
   *
   * **Intent:**
   * Handle the callback from Paymob each time an auto-charged EMI installment
   * completes (success or failure) and keep the EMI schedule in sync.
   *
   * **Idea:**
   * 1. Verify `data.type === 'TRANSACTION'` and `paymentType === 'EMI'`.
   * 2. Fetch the order to obtain `userId`.
   * 3. On **success**:
   *    a. Create a `transactionPaymob` record with `transactionType: 'EMI'`
   *       and `transactionStatus: 'SUCCESS'`.
   *    b. Fetch the current `orderEMI` record.
   *    c. Increment `emiInstallmentsPaid`.
   *    d. If all installments are paid, set `emiStatus` to `'COMPLETED'` and
   *       clear `nextEmiDueDate`.
   *    e. Otherwise, advance `nextEmiDueDate` by 30 days.
   * 4. On **failure**:
   *    a. Create a `transactionPaymob` record with `transactionStatus: 'FAILED'`.
   *    b. Set `nextEmiDueDate` to tomorrow (retry the next day).
   *
   * **Usage:**
   * Called by {@link PaymentController.webhookForEMI} via
   * `POST /payment/webhookForEMI`.
   * Invoked server-to-server by Paymob after each recurring EMI charge attempt.
   *
   * **Data Flow:**
   * ```
   * req.body --> type + paymentType check
   * --> this.prisma.order.findUnique (userId)
   * --> this.prisma.transactionPaymob.create (SUCCESS | FAILED)
   * --> this.prisma.orderEMI.findFirst --> this.prisma.orderEMI.updateMany
   *     (increment paid count, advance due date or mark COMPLETED)
   * ```
   *
   * **Dependencies:** Prisma (`transactionPaymob`, `order`, `orderEMI`).
   *
   * **Notes:**
   * - On failure the due date is pushed to **tomorrow**, giving the cron job
   *   another chance to retry the charge.
   * - The 30-day interval is a fixed offset (`new Date().getDate() + 30`), not
   *   calendar-month aligned.
   * - Does not return an explicit success envelope on the happy path.
   *
   * @param {any} req - Express request; `req.body` contains the Paymob webhook payload.
   * @returns {Promise<void | {status: boolean, message: string, error?: any}>}
   */
  async webhookForEMI (req: any) {
    try {
      const data = req.body;
      if (data?.type === 'TRANSACTION') {
        const { success, id, amount_cents, order, payment_key_claims } = data.obj;
        const merchant_order_id = parseInt(order?.merchant_order_id);
        const orderId = parseInt(payment_key_claims?.extra.orderId);

        if (payment_key_claims && payment_key_claims.extra.paymentType === 'EMI') {

          let orderDetail = await this.prisma.order.findUnique({
            where: { id: orderId },
          });

          if (success && orderId) {

            let newTransaction = await this.prisma.transactionPaymob.create({
              data: {
                transactionStatus: 'SUCCESS',
                paymobTransactionId: String(id), // <-- convert to string,
                amountCents: data.obj.amount_cents || 0,
                success: success,
                paymobObject: req.body,
                merchantOrderId: merchant_order_id,
                paymobOrderId: order?.id,
                orderId: orderId,
                transactionType: 'EMI',
                userId: orderDetail.userId
              }
            });

            // Fetch existing EMI data
            const orderEMI = await this.prisma.orderEMI.findFirst({
              where: { orderId }
            });

            if (orderEMI) {
              const updatedInstallmentsPaid = (orderEMI.emiInstallmentsPaid || 0) + 1;
              const isCompleted = updatedInstallmentsPaid >= (orderEMI.emiInstallmentCount || 0);

              await this.prisma.orderEMI.updateMany({
                where: { orderId },
                data: {
                  emiInstallmentsPaid: updatedInstallmentsPaid,
                  emiStatus: isCompleted ? 'COMPLETED' : 'ONGOING',
                  nextEmiDueDate: isCompleted ? null : (() => {
                    const nextDue = new Date();
                    nextDue.setDate(nextDue.getDate() + 30);
                    return nextDue;
                  })()
                }
              });
            }

          } else {

            let newTransaction = await this.prisma.transactionPaymob.create({
              data: {
                transactionStatus: 'FAILED',
                paymobTransactionId: String(id), // <-- convert to string,
                amountCents: data.obj.amount_cents || 0,
                success: success,
                paymobObject: req.body,
                merchantOrderId: merchant_order_id,
                paymobOrderId: order?.id,
                orderId: orderId,
                transactionType: 'EMI',
                userId: orderDetail.userId
              }
            });

            // Update nextEmiDueDate to tomorrow
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);

            await this.prisma.orderEMI.updateMany({
              where: { orderId },
              data: {
                nextEmiDueDate: tomorrow
              }
            });

          }
        } 
      }
    } catch (error) {
      return {
        status: false,
        message: 'Error in webhookForEMI',
        error: (error as any)?.response?.data || getErrorMessage(error)
      };
    }
  }

  /**
   * AMWALPAY INTEGRATION
   */
  private readonly AMWALPAY_MID = process.env.AMWALPAY_MID || '158161';
  private readonly AMWALPAY_TID = process.env.AMWALPAY_TID || '623265';
  private readonly AMWALPAY_SECURE_HASH_KEY = process.env.AMWALPAY_SECURE_HASH_KEY || '54CB00FC77C742668B09F98B9776CC50F61D1A31D3F85EC73B31E80D1676936B'; // Hex format
  private readonly AMWALPAY_CURRENCY_ID = process.env.AMWALPAY_CURRENCY_ID || '512'; // OMR

  /**
   * Create AmwalPay Smartbox Configuration
   */
  async createAmwalPayConfig(payload: any, req: any) {
    try {
      const { amount, orderId, languageId = 'en' } = payload;

      if (!amount || !orderId) {
        return {
          status: false,
          message: 'Missing required fields: amount and orderId'
        };
      }

      // Generate merchant reference (unique order identifier)
      const merchantReference = `ORDER_${orderId}_${Date.now()}`;
      
      // Format transaction date time (ISO 8601 format)
      const requestDateTime = new Date().toISOString();
      
      // Convert amount to string
      const amountStr = amount.toString();
      
      // SessionToken - empty if not using recurring payments
      const sessionToken = '';

      // Prepare parameters object for hash calculation
      const paramsObj = {
        Amount: amountStr,
        CurrencyId: this.AMWALPAY_CURRENCY_ID,
        MerchantId: this.AMWALPAY_MID,
        MerchantReference: merchantReference,
        RequestDateTime: requestDateTime,
        SessionToken: sessionToken,
        TerminalId: this.AMWALPAY_TID
      };

      // Calculate SecureHash using HMAC SHA-256
      const secureHash = this.calculateAmwalPaySecureHash(paramsObj);

      // Store transaction in database for tracking
      await this.prisma.transactionPaymob.create({
        data: {
          orderId: orderId,
          transactionStatus: 'PENDING',
          merchantOrderId: orderId, // Use orderId as merchantOrderId (number type required)
          amountCents: Math.round(amount * 1000), // Convert to cents
          transactionType: 'DIRECT',
          userId: req?.user?.id || null,
          paymobObject: {
            paymentGateway: 'AMWALPAY',
            merchantReference: merchantReference, // Store the actual merchant reference here
            config: paramsObj,
            secureHash: secureHash
          }
        }
      });

      return {
        status: true,
        message: 'AmwalPay config created successfully',
        data: {
          MID: this.AMWALPAY_MID,
          TID: this.AMWALPAY_TID,
          CurrencyId: this.AMWALPAY_CURRENCY_ID,
          AmountTrxn: amountStr,
          MerchantReference: merchantReference,
          LanguageId: languageId === 'ar' ? 'ar' : 'en',
          PaymentViewType: 1, // 1 = Popup, 2 = Redirect
          TrxDateTime: requestDateTime,
          SessionToken: sessionToken,
          SecureHash: secureHash,
          OrderId: orderId
        }
      };
    } catch (error: any) {
      return {
        status: false,
        message: 'Error creating AmwalPay config',
        error: getErrorMessage(error)
      };
    }
  }

  /**
   * Calculate SecureHash according to AmwalPay specification
   * Based on: https://amwalpay.om/developers/smartbox/securehash-calculation/
   */
  private calculateAmwalPaySecureHash(paramsObj: any): string {
    const crypto = require('crypto');
    
    // Step 1: Sort parameters alphabetically by key and concatenate
    // Format: key=value&key=value
    const sortedParams = [
      `Amount=${paramsObj.Amount}`,
      `CurrencyId=${paramsObj.CurrencyId}`,
      `MerchantId=${paramsObj.MerchantId}`,
      `MerchantReference=${paramsObj.MerchantReference}`,
      `RequestDateTime=${paramsObj.RequestDateTime}`,
      `SessionToken=${paramsObj.SessionToken}`,
      `TerminalId=${paramsObj.TerminalId}`
    ].join('&');

    // Step 2: Convert hex key to binary
    const binaryKey = Buffer.from(this.AMWALPAY_SECURE_HASH_KEY, 'hex');
    
    // Step 3: Calculate HMAC SHA-256
    const hmac = crypto.createHmac('sha256', binaryKey);
    const hashValue = hmac.update(sortedParams, 'utf-8').digest('hex');
    
    // Step 4: Return uppercase hash
    return hashValue.toUpperCase();
  }

  /**
   * Handle AmwalPay Webhook
   */
  async amwalPayWebhook(payload: any, req: any) {
    try {
      
      const data = req.body;
      const responseData = data?.data || {};
      
      const { 
        merchantReference, 
        transactionId,
        amount,
        currencyId,
        responseCode,
        transactionTime,
        secureHashValue // For integrity validation
      } = responseData;

      // Check if it's a wallet recharge (starts with WALLET_)
      if (merchantReference?.startsWith('WALLET_')) {
        // Handle wallet recharge
        const walletIdMatch = merchantReference.match(/WALLET_(\d+)_/);
        const walletId = walletIdMatch ? parseInt(walletIdMatch[1]) : null;

        if (!walletId) {
          return {
            status: false,
            message: 'Wallet ID not found in merchant reference'
          };
        }


        // Verify response integrity
        const isValid = this.verifyAmwalPayResponseHash(responseData, data.responseCode);
        if (!isValid) {
          throw new Error('AmwalPay response hash verification failed — possible webhook forgery');
        }

        // Determine if payment was successful
        const isSuccess = data.success === true && data.responseCode === '00';

        // Extract amount - it might be in different locations
        // Amount from AmwalPay is usually in the format "500.000" (string)
        // Wallet balance is stored in base currency (OMR), not cents
        const amountValue = amount || responseData.amount || data.data?.amount || 0;
        const parsedAmount = typeof amountValue === 'string' ? parseFloat(amountValue) : amountValue;
        const rechargeAmount = parsedAmount; // Use amount directly, wallet balance is in base currency
        

        // Update transaction status - find by merchantReference in paymobObject
        const transactionUpdate = await this.prisma.transactionPaymob.updateMany({
          where: { 
            merchantOrderId: walletId,
            transactionType: 'WALLET_RECHARGE'
          },
          data: {
            transactionStatus: isSuccess ? 'SUCCESS' : 'FAILED',
            paymobTransactionId: transactionId || null,
            amountCents: Math.round(rechargeAmount * 1000), // Store in cents for transactionPaymob (for consistency with other payments)
            success: isSuccess,
            paymobObject: {
              ...req.body,
              merchantReference: merchantReference
            }
          }
        });


        // Update wallet balance if payment successful
        if (isSuccess) {
          // Get current wallet balance
          const wallet = await this.prisma.wallet.findUnique({
            where: { id: walletId }
          });

          if (!wallet) {
            return {
              status: false,
              message: 'Wallet not found'
            };
          }


          const balanceBefore = Number(wallet.balance); // Convert Decimal to number
          const balanceAfter = balanceBefore + rechargeAmount; // Add in base currency (OMR)


          // Update wallet balance
          await this.prisma.wallet.update({
            where: { id: walletId },
            data: {
              balance: balanceAfter
            }
          });


          // Create wallet transaction record
          // Note: WalletTransaction.amount is also in base currency, not cents
          const walletTransaction = await this.prisma.walletTransaction.create({
            data: {
              walletId: walletId,
              transactionType: 'DEPOSIT',
              amount: rechargeAmount, // Store in base currency
              balanceBefore: balanceBefore,
              balanceAfter: balanceAfter,
              status: 'COMPLETED',
              referenceId: transactionId || merchantReference,
              referenceType: 'PAYMENT',
              metadata: {
                paymentGateway: 'AMWALPAY',
                transactionId: transactionId,
                merchantReference: merchantReference,
                amount: parsedAmount
              }
            }
          });


          return {
            status: true,
            message: 'AmwalPay wallet recharge webhook processed successfully',
            walletId: walletId,
            transactionStatus: 'SUCCESS',
            balanceBefore: balanceBefore,
            balanceAfter: balanceAfter,
            rechargeAmount: rechargeAmount
          };
        }

        return {
          status: true,
          message: 'AmwalPay wallet recharge webhook processed (payment failed)',
          walletId: walletId,
          transactionStatus: 'FAILED'
        };
      }

      // Handle order payment (existing logic)
      // Extract orderId from MerchantReference (format: ORDER_{orderId}_{timestamp})
      const orderIdMatch = merchantReference?.match(/ORDER_(\d+)_/);
      const orderId = orderIdMatch ? parseInt(orderIdMatch[1]) : null;

      if (!orderId) {
        return {
          status: false,
          message: 'Order ID not found in merchant reference'
        };
      }

      // Verify response integrity by calculating hash
      const isValid = this.verifyAmwalPayResponseHash(responseData, data.responseCode);

      if (!isValid) {
        throw new Error('AmwalPay response hash verification failed — possible webhook forgery');
      }

      // Determine if payment was successful
      const isSuccess = data.success === true && data.responseCode === '00';
      
      // Update transaction status
      // Find transaction by orderId and merchantReference in paymobObject
      await this.prisma.transactionPaymob.updateMany({
        where: { 
          orderId: orderId,
          // merchantReference is stored in paymobObject, so we search by orderId
        },
        data: {
          transactionStatus: isSuccess ? 'SUCCESS' : 'FAILED',
          paymobTransactionId: transactionId || null,
          amountCents: Math.round((amount || 0) * 1000),
          success: isSuccess,
          paymobObject: {
            ...req.body,
            merchantReference: merchantReference // Ensure merchantReference is stored
          }
        }
      });

      // Update order status if payment successful
      if (isSuccess) {
        await this.prisma.order.update({
          where: { id: orderId },
          data: {
            orderStatus: 'PAID'
          }
        });
      }

      return {
        status: true,
        message: 'AmwalPay webhook processed successfully',
        orderId: orderId,
        transactionStatus: isSuccess ? 'SUCCESS' : 'FAILED'
      };
    } catch (error: any) {
      return {
        status: false,
        message: 'Error processing AmwalPay webhook',
        error: getErrorMessage(error)
      };
    }
  }

  /**
   * Verify AmwalPay Response Hash (for integrity validation)
   */
  private verifyAmwalPayResponseHash(responseData: any, responseCode: string): boolean {
    try {
      const crypto = require('crypto');
      
      // Prepare integrity parameters (sorted alphabetically)
      const integrityParams = {
        amount: responseData.amount?.toString() || '',
        currencyId: responseData.currencyId?.toString() || '',
        customerId: responseData.customerId || '',
        customerTokenId: responseData.customerTokenId || '',
        merchantId: responseData.merchantId?.toString() || '',
        merchantReference: responseData.merchantReference || '',
        responseCode: responseCode || '',
        terminalId: responseData.terminalId?.toString() || '',
        transactionId: responseData.transactionId || '',
        transactionTime: responseData.transactionTime || ''
      };

      // Build sorted string
      const sortedString = [
        `amount=${integrityParams.amount}`,
        `currencyId=${integrityParams.currencyId}`,
        `customerId=${integrityParams.customerId}`,
        `customerTokenId=${integrityParams.customerTokenId}`,
        `merchantId=${integrityParams.merchantId}`,
        `merchantReference=${integrityParams.merchantReference}`,
        `responseCode=${integrityParams.responseCode}`,
        `terminalId=${integrityParams.terminalId}`,
        `transactionId=${integrityParams.transactionId}`,
        `transactionTime=${integrityParams.transactionTime}`
      ].join('&');

      // Calculate hash
      const binaryKey = Buffer.from(this.AMWALPAY_SECURE_HASH_KEY, 'hex');
      const hmac = crypto.createHmac('sha256', binaryKey);
      const calculatedHash = hmac.update(sortedString, 'utf-8').digest('hex').toUpperCase();

      // Compare with received hash
      const receivedHash = responseData.secureHashValue?.toUpperCase() || '';
      return calculatedHash === receivedHash;
    } catch (error) {
      return false;
    }
  }

  /**
   * Verify and process AmwalPay wallet payment (fallback if webhook doesn't fire)
   */
  async verifyAmwalPayWalletPayment(payload: any, req: any) {
    try {
      const { merchantReference, transactionId, amount } = payload;

      if (!merchantReference || !transactionId) {
        return {
          status: false,
          message: 'Missing required fields: merchantReference and transactionId'
        };
      }

      // Check if it's a wallet recharge
      if (!merchantReference.startsWith('WALLET_')) {
        return {
          status: false,
          message: 'Invalid merchant reference for wallet recharge'
        };
      }

      const walletIdMatch = merchantReference.match(/WALLET_(\d+)_/);
      const walletId = walletIdMatch ? parseInt(walletIdMatch[1]) : null;

      if (!walletId) {
        return {
          status: false,
          message: 'Wallet ID not found in merchant reference'
        };
      }

      // Check if transaction already processed
      const existingTransaction = await this.prisma.walletTransaction.findFirst({
        where: {
          referenceId: transactionId,
          status: 'COMPLETED'
        }
      });

      if (existingTransaction) {
        return {
          status: true,
          message: 'Transaction already processed',
          walletId: walletId,
          alreadyProcessed: true
        };
      }

      // Get wallet
      const wallet = await this.prisma.wallet.findUnique({
        where: { id: walletId }
      });

      if (!wallet) {
        return {
          status: false,
          message: 'Wallet not found'
        };
      }

      // Parse amount
      // Wallet balance is stored in base currency (OMR), not cents
      const parsedAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
      const rechargeAmount = parsedAmount; // Use amount directly

      const balanceBefore = Number(wallet.balance);
      const balanceAfter = balanceBefore + rechargeAmount; // Add in base currency

      // Update wallet balance
      await this.prisma.wallet.update({
        where: { id: walletId },
        data: {
          balance: balanceAfter
        }
      });

      // Create wallet transaction
      // Note: WalletTransaction.amount is in base currency, not cents
      await this.prisma.walletTransaction.create({
        data: {
          walletId: walletId,
          transactionType: 'DEPOSIT',
          amount: rechargeAmount, // Store in base currency
          balanceBefore: balanceBefore,
          balanceAfter: balanceAfter,
          status: 'COMPLETED',
          referenceId: transactionId || merchantReference,
          referenceType: 'PAYMENT',
          metadata: {
            paymentGateway: 'AMWALPAY',
            transactionId: transactionId,
            merchantReference: merchantReference,
            amount: parsedAmount,
            processedVia: 'FRONTEND_CALLBACK'
          }
        }
      });

      // Update transactionPaymob if exists
      await this.prisma.transactionPaymob.updateMany({
        where: {
          merchantOrderId: walletId,
          transactionType: 'WALLET_RECHARGE'
        },
        data: {
          transactionStatus: 'SUCCESS',
          paymobTransactionId: transactionId,
          amountCents: Math.round(rechargeAmount * 1000), // Store in cents for transactionPaymob
          success: true
        }
      });

      return {
        status: true,
        message: 'Wallet recharge processed successfully',
        walletId: walletId,
        balanceBefore: balanceBefore,
        balanceAfter: balanceAfter,
        rechargeAmount: rechargeAmount
      };
    } catch (error: any) {
      return {
        status: false,
        message: 'Error verifying wallet payment',
        error: getErrorMessage(error)
      };
    }
  }

  /**
   * Create AmwalPay Config for Wallet Recharge
   */
  async createAmwalPayWalletConfig(payload: any, req: any) {
    try {
      const { amount, walletId, languageId = 'en' } = payload;

      if (!amount || !walletId) {
        return {
          status: false,
          message: 'Missing required fields: amount and walletId'
        };
      }

      // Generate merchant reference for wallet recharge
      const merchantReference = `WALLET_${walletId}_${Date.now()}`;
      
      // Format transaction date time (ISO 8601 format)
      const requestDateTime = new Date().toISOString();
      
      // Convert amount to string
      const amountStr = amount.toString();
      
      // SessionToken - empty if not using recurring payments
      const sessionToken = '';

      // Prepare parameters object for hash calculation
      const paramsObj = {
        Amount: amountStr,
        CurrencyId: this.AMWALPAY_CURRENCY_ID,
        MerchantId: this.AMWALPAY_MID,
        MerchantReference: merchantReference,
        RequestDateTime: requestDateTime,
        SessionToken: sessionToken,
        TerminalId: this.AMWALPAY_TID
      };

      // Calculate SecureHash using HMAC SHA-256
      const secureHash = this.calculateAmwalPaySecureHash(paramsObj);

      // Store transaction in database for tracking
      await this.prisma.transactionPaymob.create({
        data: {
          orderId: null, // No order for wallet recharge
          transactionStatus: 'PENDING',
          merchantOrderId: walletId, // Use walletId as merchantOrderId
          amountCents: Math.round(amount * 1000), // Convert to cents
          transactionType: 'WALLET_RECHARGE',
          userId: req?.user?.id || null,
          paymobObject: {
            paymentGateway: 'AMWALPAY',
            transactionType: 'WALLET_RECHARGE',
            walletId: walletId,
            merchantReference: merchantReference,
            config: paramsObj,
            secureHash: secureHash
          }
        }
      });

      return {
        status: true,
        message: 'AmwalPay wallet config created successfully',
        data: {
          MID: this.AMWALPAY_MID,
          TID: this.AMWALPAY_TID,
          CurrencyId: this.AMWALPAY_CURRENCY_ID,
          AmountTrxn: amountStr,
          MerchantReference: merchantReference,
          LanguageId: languageId === 'ar' ? 'ar' : 'en',
          PaymentViewType: 1,
          TrxDateTime: requestDateTime,
          SessionToken: sessionToken,
          SecureHash: secureHash,
          WalletId: walletId
        }
      };
    } catch (error: any) {
      return {
        status: false,
        message: 'Error creating AmwalPay wallet config',
        error: getErrorMessage(error)
      };
    }
  }

}


