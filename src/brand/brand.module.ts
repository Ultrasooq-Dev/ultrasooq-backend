/**
 * @file brand.module.ts
 *
 * @intent
 *   Declares the NestJS module responsible for brand management, wiring
 *   together the BrandController and all services required by the brand
 *   feature.
 *
 * @idea
 *   Brands can be created by two actor types -- super-admins (global brands)
 *   and regular users (personal brands). The module therefore depends on
 *   authentication-related services (AuthService, JwtService) as well as
 *   ancillary services (UserService, NotificationService, S3service,
 *   HelperService) that the guards and downstream logic rely on.
 *
 * @usage
 *   Import `BrandModule` in the root `AppModule` (or a feature-aggregate
 *   module). NestJS will instantiate the controller and all listed providers
 *   automatically.
 *
 * @dataflow
 *   AppModule -> BrandModule -> BrandController -> BrandService -> PrismaClient
 *   Guards (AuthGuard / SuperAdminAuthGuard) depend on AuthService, JwtService,
 *   and UserService which are re-provided here so they are available in this
 *   module's injector scope.
 *
 * @depends
 *   - BrandController  -- route handler for /brand/*
 *   - BrandService      -- business logic for brand CRUD
 *   - UserService       -- user look-ups needed by guards and service layer
 *   - AuthService       -- token validation used by AuthGuard / SuperAdminAuthGuard
 *   - JwtService        -- JWT signing/verification
 *   - NotificationService -- notification side-effects (available for future use)
 *   - S3service         -- S3 file operations (available for future use)
 *   - HelperService     -- shared utility helpers
 *
 * @notes
 *   The providers list is intentionally large because the auth guards are
 *   constructor-injected and NestJS requires every transitive dependency to
 *   be provided within the same module (or exported from an imported module).
 */

import { Module } from '@nestjs/common';
import { BrandController } from './brand.controller';
import { BrandService } from './brand.service';
import { UserService } from 'src/user/user.service';
import { AuthService } from 'src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { NotificationService } from 'src/notification/notification.service';
import { S3service } from 'src/user/s3.service';
import { HelperService } from 'src/helper/helper.service';

@Module({
  controllers: [BrandController],
  providers: [BrandService, UserService, AuthService, JwtService, NotificationService, S3service, HelperService]
})
export class BrandModule {}
