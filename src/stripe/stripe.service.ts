/**
 * @fileoverview StripeService - Business-logic service for Stripe Express account management.
 *
 * @description
 * Encapsulates all interactions with the Stripe API and the Prisma ORM
 * related to marketplace seller connected accounts. Provides methods to
 * create Stripe Express accounts, retrieve account details, generate
 * onboarding/update links, and persist Stripe account IDs on user records.
 *
 * @idea
 * The Ultrasooq marketplace uses Stripe Connect (Express variant) so that
 * sellers can receive payouts from marketplace transactions. This service
 * owns the lifecycle of a seller's Stripe account: initial creation,
 * onboarding link generation, status retrieval, and re-onboarding.
 *
 * @usage
 * Injected into {@link StripeController} via NestJS DI. Not intended to
 * be called directly from outside the Stripe module.
 *
 * @dataflow
 * StripeController
 *   -> StripeService (this file)
 *       -> Stripe Node SDK  (external API calls)
 *       -> PrismaClient     (database reads/writes on `user` table)
 *
 * @dependencies
 * - `stripe`          - Official Stripe Node.js SDK, instantiated at module scope.
 * - `@prisma/client`  - Prisma ORM client, instantiated at module scope.
 * - `randomstring`    - Random string generator (imported but currently unused).
 * - {@link AuthService}        - Injected; available for auth-related helpers.
 * - {@link NotificationService} - Injected; available for sending notifications.
 * - {@link S3service}           - Injected; available for S3 file operations.
 *
 * @notes
 * - Both `prisma` and `stripe` are instantiated as **module-scoped singletons**
 *   outside the class, following the project-wide pattern. They are NOT
 *   managed by NestJS DI.
 * - `process.env.STRIPE_SECRET_KEY` must be set at process startup; the Stripe
 *   client is constructed immediately on module load.
 * - All public methods follow the project-standard response envelope:
 *   `{ status: boolean, message: string, data: any }`.
 * - `randomstring` is imported but not currently used; it may be a leftover
 *   from earlier implementation or reserved for future use.
 *
 * @module StripeModule
 */
import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { AuthService } from 'src/auth/auth.service';
import { NotificationService } from 'src/notification/notification.service';
import { S3service } from 'src/user/s3.service';
import Stripe from 'stripe';
import * as randomstring from 'randomstring';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage } from 'src/common/utils/get-error-message';

/**
 * @description Module-scoped Prisma client instance used for all database
 * operations within this service. Follows the project convention of
 * instantiating PrismaClient outside the NestJS DI container.
 *
 * @notes This instance is shared across all method calls in this module
 * and persists for the lifetime of the Node.js process.
 */

/**
 * @description Module-scoped Stripe SDK client initialised with the
 * secret key from the `STRIPE_SECRET_KEY` environment variable.
 *
 * @notes The second argument (empty options object) accepts Stripe SDK
 * configuration such as `apiVersion`. An empty object inherits the
 * library's default API version.
 */
const stripe = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_placeholder'
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {})
  : null;

/**
 * @class StripeService
 *
 * @description
 * Injectable NestJS service that manages Stripe Express connected accounts
 * for Ultrasooq marketplace sellers. Handles account creation, retrieval,
 * and onboarding-link generation.
 *
 * @idea
 * Centralises Stripe account lifecycle management so that the controller
 * layer remains a thin HTTP adapter and all payment logic is testable
 * in isolation.
 *
 * @dependencies
 * - {@link AuthService}          - Available for token/auth helper methods.
 * - {@link NotificationService}  - Available for dispatching user notifications.
 * - {@link S3service}            - Available for S3 file operations.
 * - Module-scoped `prisma`       - Prisma ORM client for DB access.
 * - Module-scoped `stripe`       - Stripe Node SDK client.
 */
@Injectable()
export class StripeService {
  /**
   * @constructor
   *
   * @description
   * Receives NestJS-managed dependencies via constructor injection.
   * These services are registered as providers in {@link StripeModule}.
   *
   * @param {AuthService} authService - Service for authentication-related helpers.
   * @param {NotificationService} notificationService - Service for dispatching notifications.
   * @param {S3service} s3service - Service for AWS S3 file operations.
   */
  constructor(
    private readonly authService: AuthService,
    private readonly notificationService: NotificationService,
    private readonly s3service: S3service,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * @method createStripeAccount
   * @async
   *
   * @description
   * Creates a new Stripe Express connected account for the authenticated
   * user (or reuses an existing one) and returns a Stripe-hosted
   * onboarding link that the frontend should redirect the seller to.
   *
   * @idea
   * This is the entry point for seller onboarding. The method is
   * idempotent with respect to account creation: if the user already
   * has a persisted `stripeAccountId`, no new Stripe account is created
   * and only a fresh onboarding link is generated.
   *
   * @usage
   * Called by {@link StripeController.create} via `POST /stripe/account-create`.
   * Expects `req.body.returnURL` (the URL Stripe redirects back to after
   * onboarding) and `req.user.id` (set by AuthGuard).
   *
   * @dataflow
   * 1. Extract `userId` from `req.user.id`.
   * 2. Validate that `req.body.returnURL` is present.
   * 3. Query Prisma for the user's existing `stripeAccountId`.
   * 4. If none exists:
   *    a. Call `stripe.accounts.create()` to provision an Express account.
   *    b. Persist the new account ID on the user record via Prisma.
   * 5. Call {@link generateAccountLink} to obtain a one-time onboarding URL.
   * 6. Return the account ID and onboarding URL in the response envelope.
   *
   * @dependencies
   * - Module-scoped `prisma` - Reads/writes user record.
   * - Module-scoped `stripe` - Creates Express account via Stripe API.
   * - {@link generateAccountLink} - Produces the onboarding URL.
   *
   * @notes
   * - The Stripe Express account is hard-coded to `country: 'US'` and
   *   requests `card_payments` and `transfers` capabilities.
   * - On error, the method catches exceptions and returns an error
   *   envelope rather than throwing, so the HTTP response is always 200.
   *
   * @param {any} req - Express request object with `req.user` (from AuthGuard)
   *                     and `req.body.returnURL`.
   * @returns {Promise<{ status: boolean; message: string; data: any; error?: string }>}
   *          Success: `{ status: true, data: { stripeAccountId, url } }`.
   *          Failure: `{ status: false, message, error }`.
   */
  async createStripeAccount(req: any) {
    try {
      const userId = req?.user?.id;
      if (!req?.body?.returnURL) {
        return {
          status: false,
          message: 'returnURL is required!',
          data: [],
        };
      }

      let stripeAccountId;
      let userDetails = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!userDetails?.stripeAccountId) {
        // Create a new Stripe Express account
        const account = await stripe.accounts.create({
          type: 'express',
          country: 'US',
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
        });

        stripeAccountId = account.id;

        // Update user record with the new Stripe account ID
        if (userId) {
          await this.prisma.user.update({
            where: { id: userId },
            data: { stripeAccountId: account.id },
          });
        }
      } else {
        stripeAccountId = userDetails.stripeAccountId;
      }

      // Generate Stripe onboarding link
      const accountLinkURL = await this.generateAccountLink(
        stripeAccountId,
        req.body.returnURL,
      );

      return {
        status: true,
        message: 'Stripe account link generated successfully!',
        data: {
          stripeAccountId,
          url: accountLinkURL,
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in createStripeAccount',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAccount
   * @async
   *
   * @description
   * Retrieves the full Stripe account object for the authenticated user.
   * First looks up the user's `stripeAccountId` in the database, then
   * fetches the account details from the Stripe API.
   *
   * @idea
   * The frontend displays Stripe account status (e.g. `charges_enabled`,
   * `payouts_enabled`, outstanding `requirements`) on the seller dashboard.
   * This endpoint surfaces that information.
   *
   * @usage
   * Called by {@link StripeController.getAccount} via `GET /stripe/get-account`.
   * Requires only the JWT token (no body or query params needed).
   *
   * @dataflow
   * 1. Extract `userId` from `req.user.id` or `req.user.userId`.
   * 2. Query Prisma for the user record.
   * 3. Determine `stripeAccountId` from `req.params` (if present) or
   *    the persisted value on the user record.
   * 4. Call `stripe.accounts.retrieve(stripeAccountId)`.
   * 5. Return the full Stripe account object in the response envelope.
   *
   * @dependencies
   * - Module-scoped `prisma` - Reads user record to obtain `stripeAccountId`.
   * - Module-scoped `stripe` - Retrieves account details from Stripe API.
   *
   * @notes
   * - Supports two `req.user` shapes: `{ id }` and `{ userId }` to
   *   accommodate different JWT payload structures.
   * - `req.params.stripeAccountId` can override the DB-stored value,
   *   though no current route parameter exposes this.
   *
   * @param {any} req - Express request object with `req.user` (from AuthGuard).
   * @returns {Promise<{ status: boolean; message: string; data: any; error?: string }>}
   *          Success: `{ status: true, data: <Stripe.Account> }`.
   *          Failure: `{ status: false, message, error }`.
   */
  async getAccount(req: any) {
    try {
      // Handle both user object structures (from User model or custom object)
      const userId = req.user.id || req.user.userId; // Get userId from request
      const authUser = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!authUser) {
        return {
          status: false,
          message: 'user not found',
          data: [],
        };
      }

      const stripeAccountId =
        req.params.stripeAccountId || authUser.stripeAccountId;

      if (!stripeAccountId) {
        return {
          status: false,
          message: 'Stripe account ID not found for user',
          data: [],
        };
      }

      const stripeAccount = await stripe.accounts.retrieve(stripeAccountId);

      return {
        status: true,
        message: 'Stripe account retrieved successfully',
        data: stripeAccount,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error retrieving Stripe account',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method updateStripeAccount
   * @async
   *
   * @description
   * Generates a fresh Stripe account onboarding link for a user who
   * already has a Stripe Express account. This allows the seller to
   * revisit the onboarding flow to supply additional documents or update
   * their information.
   *
   * @idea
   * Stripe onboarding links are single-use and expire. When a seller
   * needs to update their account (e.g. new banking details, additional
   * verification documents), a new link must be generated. This method
   * serves that purpose without creating a new Stripe account.
   *
   * @usage
   * Called by {@link StripeController.updateStripeAccount} via
   * `PATCH /stripe/account-update`.
   * Expects `req.body.returnUrl` (note: camelCase, different from
   * `returnURL` in the create endpoint) and `req.user`.
   *
   * @dataflow
   * 1. Extract `userId` from `req.user.id` or `req.user.userId`.
   * 2. Validate `userId` and `req.body.returnUrl` are present.
   * 3. Query Prisma for the user and their `stripeAccountId`.
   * 4. Throw if user not found or has no Stripe account.
   * 5. Call `stripe.accountLinks.create()` with the `account_onboarding` type.
   * 6. Return the generated account link object in the response envelope.
   *
   * @dependencies
   * - Module-scoped `prisma` - Reads user record to obtain `stripeAccountId`.
   * - Module-scoped `stripe` - Creates a new account link via Stripe API.
   *
   * @notes
   * - Unlike {@link createStripeAccount}, this method throws NestJS HTTP
   *   exceptions ({@link BadRequestException}, {@link NotFoundException})
   *   for validation failures rather than returning error envelopes. These
   *   are caught by the outer try/catch and serialised into the error
   *   envelope anyway.
   * - The `refresh_url` appends `?refresh=true` so the frontend can detect
   *   when the user's link has expired and trigger regeneration.
   * - The `return_url` is used as-is (no query parameter appended), unlike
   *   {@link generateAccountLink} which appends `?success=true`.
   *
   * @param {any} req - Express request object with `req.user` (from AuthGuard)
   *                     and `req.body.returnUrl`.
   * @returns {Promise<{ status: boolean; message: string; data: any; error?: string }>}
   *          Success: `{ status: true, data: <Stripe.AccountLink> }`.
   *          Failure: `{ status: false, message, error }`.
   */
  async updateStripeAccount(req: any) {
    try {
      // Handle both user object structures (from User model or custom object)
      const userId = req.user?.id || req.user?.userId;
      if (!userId) {
        throw new BadRequestException('User ID is required');
      }

      if (!req.body.returnUrl) {
        throw new BadRequestException('returnUrl is required');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }

      const stripeAccountId = user.stripeAccountId;
      if (!stripeAccountId) {
        throw new NotFoundException('Please create a Stripe account first');
      }

      const accountLink = await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url: `${req.body.returnUrl}?refresh=true`,
        return_url: req.body.returnUrl,
        type: 'account_onboarding',
      });

      return {
        status: true,
        message: 'Link created successfully',
        data: accountLink,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in updateStripeAccount',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method generateAccountLink
   * @async
   * @private
   *
   * @description
   * Creates a Stripe account onboarding link for the given connected
   * account ID. The link directs the seller to Stripe's hosted
   * onboarding form where they provide identity, tax, and banking
   * information.
   *
   * @idea
   * Extracted as a private helper so that onboarding-link generation can
   * be reused by any public method that needs to send a seller through
   * the Stripe onboarding flow (currently used by {@link createStripeAccount}).
   *
   * @usage
   * ```typescript
   * const url = await this.generateAccountLink('acct_xxx', 'https://example.com/return');
   * ```
   *
   * @dataflow
   * 1. Call `stripe.accountLinks.create()` with `type: 'account_onboarding'`
   *    and `collect: 'currently_due'`.
   * 2. `refresh_url` = `returnUrl?refresh=true` (used when the link expires).
   * 3. `return_url`  = `returnUrl?success=true` (used after successful completion).
   * 4. Return the `.url` property from the Stripe response.
   *
   * @dependencies
   * - Module-scoped `stripe` - Creates the account link via Stripe API.
   *
   * @notes
   * - `collect: 'currently_due'` tells Stripe to only gather information
   *   that is immediately required, making the onboarding flow shorter.
   * - On failure, wraps the Stripe error in a generic `Error` and re-throws,
   *   which will be caught by the calling method's try/catch.
   * - The `return_url` here appends `?success=true`, which differs from
   *   {@link updateStripeAccount} where the `return_url` is passed through
   *   unmodified.
   *
   * @param {string} accountID - The Stripe connected account ID (e.g. `acct_xxxxx`).
   * @param {string} returnUrl - The frontend URL to redirect to after onboarding.
   * @returns {Promise<string>} The Stripe-hosted onboarding URL.
   * @throws {Error} If the Stripe API call fails.
   */
  private async generateAccountLink(
    accountID: string,
    returnUrl: string,
  ): Promise<string> {
    try {
      const accountLink = await stripe.accountLinks.create({
        type: 'account_onboarding',
        account: accountID,
        refresh_url: `${returnUrl}?refresh=true`,
        return_url: `${returnUrl}?success=true`,
        collect: 'currently_due',
      });

      return accountLink.url;
    } catch (error) {
      throw new Error(`Failed to generate account link: ${getErrorMessage(error)}`);
    }
  }
}
