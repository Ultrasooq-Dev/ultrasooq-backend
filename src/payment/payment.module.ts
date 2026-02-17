/**
 * @fileoverview Payment Module - NestJS module definition for the Ultrasooq payment subsystem.
 *
 * @description
 * Registers all controllers, services, and provider dependencies required by the
 * payment feature.  The module wires up Paymob (Oman region) payment processing,
 * including direct payments, advance payments, due payments, EMI (installment)
 * payments, and payment-link generation.
 *
 * @module PaymentModule
 *
 * **Intent:**
 * Serve as the single NestJS dependency-injection boundary for every payment-related
 * capability exposed by the Ultrasooq backend.
 *
 * **Idea:**
 * Aggregate the PaymentController (HTTP routing) and PaymentService (business logic)
 * together with the cross-cutting providers they depend on -- authentication, JWT
 * handling, notifications, file storage, and Paymob helper utilities.
 *
 * **Usage:**
 * Imported once in the root `AppModule`.  No exports are declared because other
 * modules do not depend on PaymentService directly.
 *
 * **Data Flow:**
 * 1. `AppModule` imports `PaymentModule`.
 * 2. NestJS instantiates all declared providers and injects them into
 *    `PaymentController` / `PaymentService` via constructor injection.
 * 3. HTTP requests routed to `/payment/*` are handled by `PaymentController`,
 *    which delegates to `PaymentService`.
 *
 * **Dependencies:**
 * - {@link PaymentController} -- route definitions for `/payment/*`
 * - {@link PaymentService}    -- core Paymob integration logic
 * - {@link UserService}       -- user look-ups used in auth flows
 * - {@link AuthService}       -- authentication helper (token verification, etc.)
 * - {@link JwtService}        -- JWT signing / validation (used by AuthGuard)
 * - {@link NotificationService} -- push / in-app notification dispatch
 * - {@link S3service}         -- AWS S3 file-upload utilities
 * - {@link HelperService}     -- shared helpers including `getAuthToken()` for Paymob
 *
 * **Notes:**
 * - All providers are module-scoped (default NestJS singleton scope).
 * - PrismaClient is **not** injected here; the service instantiates its own
 *   module-level PrismaClient (see `payment.service.ts`).
 */
import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { UserService } from 'src/user/user.service';
import { AuthService } from 'src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { NotificationService } from 'src/notification/notification.service';
import { S3service } from 'src/user/s3.service';
import { HelperService } from 'src/helper/helper.service';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, UserService, AuthService, JwtService, NotificationService, S3service, HelperService]
})
export class PaymentModule {}
