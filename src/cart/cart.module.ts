/**
 * @file cart.module.ts
 * @description NestJS module definition for the Cart domain of the Ultrasooq B2B/B2C marketplace.
 *
 * This module encapsulates all cart-related functionality including standard product carts,
 * RFQ (Request For Quotation) carts, Factories carts, and service-based carts. It wires
 * together the CartController (route handling) and CartService (business logic), along with
 * authentication dependencies required by guarded endpoints.
 *
 * @module CartModule
 *
 * @dependencies
 * - {@link CartController} - Handles HTTP routing for all cart endpoints.
 * - {@link CartService} - Contains business logic and Prisma database operations for cart CRUD.
 * - {@link AuthService} - Provides user authentication/validation consumed by AuthGuard.
 * - {@link JwtService} - JWT token utilities required by AuthService for token verification.
 *
 * @notes
 * - AuthService and JwtService are registered as module-scoped providers (not imported from
 *   AuthModule) so that AuthGuard can resolve its dependencies within this module's injector.
 * - The CartService instantiates its own module-scoped PrismaClient rather than relying on a
 *   shared PrismaModule, following the project-wide pattern.
 */
import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { AuthService } from 'src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';

/**
 * @class CartModule
 * @description Root module that registers the cart controller, cart service, and authentication
 * providers. Importing this module into the AppModule exposes all `/cart/*` routes.
 *
 * @idea Centralise every cart variant (product, RFQ, factories, service) under one module to
 * keep routing consistent and allow a single AuthGuard registration to protect all secured
 * endpoints.
 *
 * @usage Imported by the root AppModule; no exports are declared because cart functionality
 * is not consumed by other modules.
 */
@Module({
  controllers: [CartController],
  providers: [CartService, AuthService, JwtService]
})
export class CartModule {}
