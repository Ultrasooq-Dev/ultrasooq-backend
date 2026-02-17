/**
 * @fileoverview ServiceModule -- NestJS feature module for the Service domain.
 *
 * Intent:
 *   Registers all providers and controllers needed to manage service listings
 *   (freelancer / company services) within the Ultrasooq B2B/B2C marketplace.
 *
 * Idea:
 *   Encapsulates the service CRUD lifecycle, including listing, searching,
 *   Q&A, and related-product lookups, behind a single NestJS module boundary
 *   so the rest of the application can import or lazy-load this feature as
 *   a cohesive unit.
 *
 * Usage:
 *   Imported by the root AppModule. No explicit exports -- all interaction
 *   happens through HTTP endpoints declared in {@link ServiceController}.
 *
 * Data Flow:
 *   HTTP request -> ServiceController -> ServiceService -> PrismaClient -> DB
 *
 * Dependencies:
 *   - {@link ServiceService}    -- business logic layer for services.
 *   - {@link AuthService}       -- used indirectly by {@link AuthGuard} for JWT verification.
 *   - {@link JwtService}        -- token parsing/validation consumed by AuthService.
 *   - {@link HelperService}     -- utility layer, notably `getAdminId()` for team-member ownership resolution.
 *   - {@link ServiceController} -- REST controller exposing /service/* endpoints.
 *
 * Notes:
 *   - AuthModule is imported at the statement level but is NOT listed in the
 *     `imports` array; AuthService and JwtService are instead registered
 *     directly as module-scoped providers.
 *   - PrismaClient is instantiated inside ServiceService (module-scoped
 *     instance), not injected from a shared module.
 */
import { Module } from '@nestjs/common';
import { ServiceService } from './service.service';
import { ServiceController } from './service.controller';
import { AuthModule } from 'src/auth/auth.module';
import { AuthService } from 'src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { HelperService } from 'src/helper/helper.service';

@Module({
  providers: [ServiceService, AuthService, JwtService, HelperService],
  controllers: [ServiceController],
})
export class ServiceModule {}
