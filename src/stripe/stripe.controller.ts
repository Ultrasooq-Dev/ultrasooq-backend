/**
 * @fileoverview StripeController - HTTP controller for Stripe Express account management.
 *
 * @description
 * Exposes REST endpoints under the `/stripe` route prefix that allow
 * authenticated marketplace users (sellers) to create, retrieve, and
 * update their Stripe Express connected accounts. Every route is
 * protected by {@link AuthGuard}, which validates the JWT bearer token
 * and attaches the decoded user payload to `req.user`.
 *
 * @idea
 * The Ultrasooq marketplace requires sellers to have a Stripe Express
 * account so that the platform can split payments between itself and
 * the seller. This controller is the thin HTTP boundary that delegates
 * all business logic to {@link StripeService}.
 *
 * @usage
 * All endpoints require an `Authorization: Bearer <token>` header.
 *
 * | Method | Path                    | Purpose                                 |
 * |--------|-------------------------|-----------------------------------------|
 * | POST   | /stripe/account-create  | Create a Stripe Express account + link  |
 * | GET    | /stripe/get-account     | Retrieve an existing Stripe account      |
 * | PATCH  | /stripe/account-update  | Generate a new onboarding/update link   |
 *
 * @dataflow
 * HTTP Request -> AuthGuard (JWT verification) -> StripeController -> StripeService
 *
 * @dependencies
 * - {@link AuthGuard}     - JWT-based route guard (applied per-route).
 * - {@link StripeService} - Contains all Stripe SDK and Prisma interactions.
 *
 * @notes
 * - The controller passes the raw NestJS `req` object to the service layer,
 *   which extracts `req.user`, `req.body`, and `req.params` as needed.
 * - Several imported decorators (Body, Delete, Param, Query, Req, Res) are
 *   currently unused but kept for potential future endpoint expansion.
 *
 * @module StripeModule
 */
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Request, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/AuthGuard';
import { StripeService } from './stripe.service';

/**
 * @class StripeController
 *
 * @description
 * REST controller responsible for routing Stripe-related HTTP requests
 * to the appropriate service methods. Registered under the `/stripe`
 * route prefix.
 *
 * @idea
 * Acts as a thin delegation layer: validates authentication via guard,
 * then forwards the entire request context to the service for processing.
 *
 * @dependencies
 * - {@link StripeService} - Injected via constructor DI.
 */
@ApiTags('stripe')
@ApiBearerAuth('JWT-auth')
@Controller('stripe')
export class StripeController {
  /**
   * @constructor
   *
   * @description
   * Injects the {@link StripeService} singleton that encapsulates all
   * Stripe SDK and database interactions.
   *
   * @param {StripeService} stripeService - Service handling Stripe business logic.
   */
  constructor(
    private readonly stripeService: StripeService,
  ) { }

  /**
   * @method create
   *
   * @description
   * Creates a new Stripe Express connected account for the authenticated
   * user (or retrieves the existing one) and returns a Stripe-hosted
   * onboarding link the frontend can redirect the seller to.
   *
   * @idea
   * Sellers need a one-time onboarding flow to verify their identity and
   * banking details with Stripe. This endpoint initiates that process.
   *
   * @usage
   * ```
   * POST /stripe/account-create
   * Headers: Authorization: Bearer <jwt>
   * Body: { "returnURL": "https://ultrasooq.com/seller/onboarding" }
   * ```
   *
   * @dataflow
   * 1. AuthGuard verifies JWT and attaches `req.user`.
   * 2. Delegates to {@link StripeService.createStripeAccount}.
   * 3. Service creates or reuses a Stripe Express account, generates an
   *    account link, persists the Stripe account ID to the user record,
   *    and returns the onboarding URL.
   *
   * @dependencies
   * - {@link AuthGuard}                        - Route-level JWT protection.
   * - {@link StripeService.createStripeAccount} - Business logic handler.
   *
   * @notes
   * - `returnURL` (in the request body) is required; the service returns
   *   an error envelope if it is missing.
   * - Idempotent with respect to account creation: if the user already
   *   has a `stripeAccountId`, the existing ID is reused.
   *
   * @param {any} req - Express request object augmented with `req.user` by AuthGuard.
   * @returns {Promise<{ status: boolean; message: string; data: any }>}
   *          Standard API response envelope.
   */
  @UseGuards(AuthGuard)
  @Post('/account-create')
  create(@Request() req) {
    return this.stripeService.createStripeAccount(req);
  }

  /**
   * @method getAccount
   *
   * @description
   * Retrieves the full Stripe account object for the authenticated user
   * by looking up the stored `stripeAccountId` in the database and then
   * fetching the account details from the Stripe API.
   *
   * @idea
   * The frontend needs to inspect the Stripe account status (e.g.
   * `charges_enabled`, `payouts_enabled`, `requirements`) to determine
   * whether the seller has completed onboarding.
   *
   * @usage
   * ```
   * GET /stripe/get-account
   * Headers: Authorization: Bearer <jwt>
   * ```
   *
   * @dataflow
   * 1. AuthGuard verifies JWT and attaches `req.user`.
   * 2. Delegates to {@link StripeService.getAccount}.
   * 3. Service queries Prisma for the user's `stripeAccountId`, then
   *    calls `stripe.accounts.retrieve()` and wraps the result.
   *
   * @dependencies
   * - {@link AuthGuard}              - Route-level JWT protection.
   * - {@link StripeService.getAccount} - Business logic handler.
   *
   * @notes
   * - The service also supports an optional `req.params.stripeAccountId`
   *   override, though the current route does not define a URL parameter.
   *
   * @param {any} req - Express request object augmented with `req.user` by AuthGuard.
   * @returns {Promise<{ status: boolean; message: string; data: any }>}
   *          Standard API response envelope containing the Stripe account object.
   */
  @UseGuards(AuthGuard)
  @Get('/get-account')
  getAccount(@Request() req) {
    return this.stripeService.getAccount(req);
  }

  /**
   * @method updateStripeAccount
   *
   * @description
   * Generates a new Stripe account onboarding link for an existing
   * connected account, allowing the seller to update or complete their
   * account information.
   *
   * @idea
   * Stripe onboarding links are single-use and time-limited. If a seller
   * needs to revisit the onboarding flow (e.g. to supply additional
   * documents), a fresh link must be generated.
   *
   * @usage
   * ```
   * PATCH /stripe/account-update
   * Headers: Authorization: Bearer <jwt>
   * Body: { "returnUrl": "https://ultrasooq.com/seller/dashboard" }
   * ```
   *
   * @dataflow
   * 1. AuthGuard verifies JWT and attaches `req.user`.
   * 2. Delegates to {@link StripeService.updateStripeAccount}.
   * 3. Service validates preconditions (user exists, has a Stripe account),
   *    calls `stripe.accountLinks.create()`, and returns the link object.
   *
   * @dependencies
   * - {@link AuthGuard}                          - Route-level JWT protection.
   * - {@link StripeService.updateStripeAccount}   - Business logic handler.
   *
   * @notes
   * - The body field is `returnUrl` (camelCase), which differs from the
   *   `returnURL` field used in the create endpoint.
   * - Throws {@link BadRequestException} or {@link NotFoundException} via
   *   the service layer if preconditions are not met.
   *
   * @param {any} req - Express request object augmented with `req.user` by AuthGuard.
   * @returns {Promise<{ status: boolean; message: string; data: any }>}
   *          Standard API response envelope containing the Stripe account link object.
   */
  @UseGuards(AuthGuard)
  @Patch('/account-update')
  updateStripeAccount(@Request() req) {
    return this.stripeService.updateStripeAccount(req);
  }

}
