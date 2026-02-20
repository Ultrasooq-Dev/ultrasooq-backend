/**
 * @file admin.module.ts
 * @description NestJS module that encapsulates all super-admin functionality for the
 *   Ultrasooq B2B/B2C marketplace platform. This module wires together the controller,
 *   service, and supporting providers needed for administrative operations such as
 *   admin authentication, product management, user management, dynamic forms,
 *   RFQ quotes, geography lookups, permissions, help-center, finance, orders,
 *   services, and page settings.
 *
 * @module AdminModule
 *
 * @dependencies
 *   - {@link AdminController} -- routes HTTP requests to AdminService methods.
 *   - {@link AdminService}    -- business logic for every admin operation.
 *   - {@link AuthService}     -- JWT-based authentication (token generation / validation).
 *   - {@link JwtService}      -- low-level JWT signing and verification (used by AuthService).
 *   - {@link NotificationService} -- email / notification dispatch (e.g. help-center replies).
 *
 * @notes
 *   - Uses a module-scoped PrismaClient instantiated inside AdminService (not injected).
 *   - All guarded endpoints rely on {@link SuperAdminAuthGuard} defined in `src/guards/`.
 *   - This module does NOT export any providers; it is a self-contained feature module.
 */
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AuthService } from 'src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { NotificationService } from 'src/notification/notification.service';

/**
 * @class AdminModule
 * @description Feature module that registers admin-related controllers and providers.
 *
 * **Intent:** Isolate all super-admin back-office capabilities into a single cohesive module.
 *
 * **Idea:** By grouping AdminController with AdminService, AuthService, JwtService, and
 *   NotificationService, the module ensures the entire admin feature graph is available
 *   when the module is imported by the root AppModule.
 *
 * **Usage:** Imported once in AppModule; no further configuration required.
 *
 * **Data Flow:**
 *   HTTP request --> AdminController --> AdminService --> PrismaClient (DB)
 *                                     \-> AuthService   (JWT generation)
 *                                     \-> NotificationService (emails)
 *
 * **Dependencies:** AdminController, AdminService, AuthService, JwtService, NotificationService.
 *
 * **Notes:**
 *   - Providers are NOT exported, so other modules cannot inject AdminService directly.
 *   - PrismaClient is instantiated at the module-file level inside admin.service.ts,
 *     not via Dependency Injection.
 */
@Module({
  controllers: [AdminController],
  providers: [AdminService, AuthService, JwtService, NotificationService]
})
export class AdminModule {}
