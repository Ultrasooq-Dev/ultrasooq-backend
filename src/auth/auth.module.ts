/**
 * @file auth.module.ts — Authentication Module
 *
 * @intent
 *   Configures the JWT infrastructure and provides the AuthService for token
 *   signing and validation across the entire application.
 *
 * @idea
 *   Centralizes JWT setup using @nestjs/jwt. AuthService is the sole authority
 *   for creating and verifying tokens. Other modules (guards, user service)
 *   depend on AuthService for authentication operations.
 *
 * @usage
 *   - Imported by AppModule (root).
 *   - AuthService is injected by:
 *     • AuthGuard (src/guards/AuthGuard.ts) — validates tokens on protected routes.
 *     • SuperAdminAuthGuard (src/guards/SuperAdminAuthGuard.ts) — validates tokens + admin check.
 *     • UserService (src/user/user.service.ts) — calls login()/getToken() after signup/login.
 *     • Other services that need to generate or validate JWTs.
 *
 * @dataflow
 *   JwtModule.registerAsync() → provides JwtService → injected into AuthService
 *   AuthService.login() / getToken() → signs JWT
 *   AuthService.validateToken() → verifies JWT
 *
 * @depends
 *   - @nestjs/common   (Module)
 *   - @nestjs/config    (ConfigService — reads env vars)
 *   - @nestjs/jwt       (JwtModule — wraps jsonwebtoken library)
 *   - ./auth.service    (AuthService — token operations)
 *
 * @notes
 *   - JWT_SECRET and JWT_EXPIRY are read from environment variables via
 *     ConfigService at startup. No hardcoded secrets remain in the codebase.
 *   - AuthService is exported from this module so other modules can inject it.
 */

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRY', '1h') as any,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
