/**
 * @file fees.module.ts
 *
 * @intent
 *   NestJS module that encapsulates the entire Fees feature -- platform fee
 *   configurations for vendor and consumer charges across marketplace
 *   menu categories.
 *
 * @idea
 *   Centralises controller, service, and authentication providers so the
 *   Fees domain is self-contained and can be imported by the root AppModule
 *   without leaking internal dependencies.
 *
 * @usage
 *   Import FeesModule in the root AppModule:
 *     imports: [FeesModule]
 *   All /fees/* routes and their guards become available automatically.
 *
 * @dataflow
 *   AppModule  -->  FeesModule
 *                     |-- FeesController  (route handlers)
 *                     |-- FeesService     (business logic + Prisma queries)
 *                     |-- AuthService     (token verification for guards)
 *                     |-- JwtService      (JWT decoding, used by AuthService)
 *
 * @depends
 *   - FeesController  -- route definitions for /fees/*
 *   - FeesService     -- all CRUD operations against the Fees data model
 *   - AuthService     -- validates bearer tokens for admin-guarded endpoints
 *   - JwtService      -- low-level JWT helper consumed by AuthService
 *
 * @notes
 *   - AuthService and JwtService are registered here (not imported from
 *     AuthModule) so the SuperAdminAuthGuard used in FeesController can
 *     resolve its dependencies within this module's injector scope.
 */
import { Module } from '@nestjs/common';
import { FeesController } from './fees.controller';
import { FeesService } from './fees.service';
import { AuthService } from 'src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';

@Module({
  controllers: [FeesController],
  providers: [FeesService, AuthService, JwtService]
})
export class FeesModule {}
