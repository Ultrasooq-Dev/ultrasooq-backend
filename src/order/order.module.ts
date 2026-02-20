/**
 * @file order.module.ts
 * @description NestJS module that encapsulates the Order domain of the Ultrasooq B2B/B2C marketplace.
 *
 * Intent:
 *   Registers the OrderController and all required providers so that order-related
 *   HTTP endpoints are available once this module is imported by the root AppModule.
 *
 * Idea:
 *   Follows the NestJS "module-per-domain" convention. Every dependency the
 *   OrderService and OrderController need (authentication, notifications, helper
 *   utilities) is declared locally as a provider rather than imported from
 *   external modules. This keeps the module self-contained at the cost of
 *   per-module instantiation of shared services.
 *
 * Usage:
 *   Import OrderModule into the root AppModule:
 *   ```
 *   @Module({ imports: [OrderModule, ...] })
 *   export class AppModule {}
 *   ```
 *
 * Data Flow:
 *   HTTP Request -> OrderController -> OrderService -> PrismaClient (module-scoped)
 *                                   -> NotificationService (email side-effects)
 *                                   -> HelperService (admin/team member resolution)
 *
 * Dependencies:
 *   - OrderController  : Route handler layer
 *   - OrderService     : Business logic layer
 *   - AuthService      : JWT token validation consumed by AuthGuard
 *   - JwtService       : Low-level JWT signing/verification (peer of AuthService)
 *   - NotificationService : Sends order-related emails (e.g. guest user creation)
 *   - HelperService    : Resolves team-member ownership via getAdminId()
 *
 * Notes:
 *   - AuthService and JwtService are provided here so that AuthGuard can inject
 *     them at the module scope without a global registration.
 *   - PrismaClient is instantiated at the module level inside OrderService (not
 *     injected), following the project-wide convention.
 */
import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { AuthModule } from 'src/auth/auth.module';
import { JwtService } from '@nestjs/jwt/dist';
import { NotificationModule } from 'src/notification/notification.module';
import { HelperService } from 'src/helper/helper.service';
import { WalletModule } from 'src/wallet/wallet.module';

@Module({
  imports: [AuthModule, WalletModule, NotificationModule],
  controllers: [OrderController],
  providers: [OrderService, JwtService, HelperService]
})
export class OrderModule {}
