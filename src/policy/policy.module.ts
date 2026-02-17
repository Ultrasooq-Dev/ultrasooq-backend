/**
 * @file policy.module.ts
 *
 * @intent
 *   Defines the NestJS module that groups together the Policy feature --
 *   its controller, service, and the auth providers needed to protect
 *   admin-only endpoints.
 *
 * @idea
 *   Keep the policy domain self-contained in a single module so it can be
 *   imported into the root AppModule without leaking implementation details.
 *   AuthService and JwtService are registered here because SuperAdminAuthGuard
 *   (used in the controller) depends on them at injection time.
 *
 * @usage
 *   Import PolicyModule in AppModule's `imports` array:
 *     @Module({ imports: [PolicyModule] })
 *     export class AppModule {}
 *
 * @dataflow
 *   AppModule -> PolicyModule -> PolicyController -> PolicyService -> PrismaClient
 *
 * @depends
 *   - PolicyController  : handles HTTP routing for /policy endpoints
 *   - PolicyService     : business logic and Prisma queries
 *   - AuthService       : token validation used by SuperAdminAuthGuard
 *   - JwtService        : JWT decode / verify consumed by AuthService
 *
 * @notes
 *   - AuthService and JwtService are provided at module scope so the guard
 *     can resolve them via the NestJS DI container.
 *   - PrismaClient is instantiated at module scope inside policy.service.ts,
 *     not injected through DI, so it does not appear in the providers array.
 */
import { Module } from '@nestjs/common';
import { PolicyController } from './policy.controller';
import { PolicyService } from './policy.service';
import { AuthService } from 'src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';

@Module({
  controllers: [PolicyController],
  providers: [PolicyService, AuthService, JwtService]
})
export class PolicyModule {}
