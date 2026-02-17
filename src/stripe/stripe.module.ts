/**
 * @fileoverview StripeModule - NestJS feature module for Stripe payment integration.
 *
 * @description
 * This module encapsulates all Stripe-related functionality for the Ultrasooq
 * B2B/B2C marketplace platform. It wires together the controller and service
 * layers responsible for creating, retrieving, and updating Stripe Express
 * connected accounts for marketplace sellers.
 *
 * @idea
 * Stripe Express accounts allow marketplace sellers to onboard and receive
 * payouts. This module centralises that capability so it can be imported
 * into the root AppModule as a self-contained feature slice.
 *
 * @usage
 * Import {@link StripeModule} in the root `AppModule` to expose the
 * `/stripe/*` HTTP endpoints and make {@link StripeService} available
 * for injection within this module's scope.
 *
 * @dataflow
 * AppModule -> StripeModule -> StripeController -> StripeService
 *                                                  -> AuthService (JWT validation helpers)
 *                                                  -> NotificationService
 *                                                  -> S3service
 *
 * @dependencies
 * - {@link StripeController}     - HTTP layer for Stripe endpoints.
 * - {@link StripeService}        - Business logic for Stripe account operations.
 * - {@link UserService}          - User CRUD used by AuthGuard / auth chain.
 * - {@link AuthService}          - JWT token verification used by AuthGuard.
 * - {@link JwtService}           - Low-level JWT signing/verification (needed by AuthService).
 * - {@link NotificationService}  - Notification dispatch (injected into StripeService).
 * - {@link S3service}            - AWS S3 file operations (injected into StripeService).
 * - {@link HelperService}        - Shared utility helpers used across providers.
 *
 * @notes
 * - All providers are registered at module scope; none are exported, so
 *   StripeService is NOT available to other modules unless this module
 *   explicitly exports it.
 * - AuthGuard is applied per-route in the controller, not at the module level.
 *
 * @module StripeModule
 */
import { Module } from '@nestjs/common';
import { StripeController } from './stripe.controller';
import { StripeService } from './stripe.service';
import { UserService } from 'src/user/user.service';
import { AuthService } from 'src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { NotificationService } from 'src/notification/notification.service';
import { S3service } from 'src/user/s3.service';
import { HelperService } from 'src/helper/helper.service';

/**
 * @class StripeModule
 *
 * @description
 * NestJS module that registers the Stripe controller and all required
 * providers for Stripe Express connected-account management.
 *
 * @idea
 * Keeps Stripe payment concerns isolated from the rest of the application
 * so that payment-related changes do not ripple into unrelated modules.
 *
 * @usage
 * ```typescript
 * @Module({ imports: [StripeModule] })
 * export class AppModule {}
 * ```
 *
 * @dependencies
 * Controllers: {@link StripeController}
 * Providers:   {@link StripeService}, {@link UserService}, {@link AuthService},
 *              {@link JwtService}, {@link NotificationService}, {@link S3service},
 *              {@link HelperService}
 *
 * @notes
 * - The provider list includes transitive dependencies required by
 *   AuthGuard and StripeService that NestJS cannot auto-resolve because
 *   they are not globally scoped.
 */
@Module({
  controllers: [StripeController],
  providers: [StripeService, UserService, AuthService, JwtService, NotificationService, S3service, HelperService]
})
export class StripeModule {}
