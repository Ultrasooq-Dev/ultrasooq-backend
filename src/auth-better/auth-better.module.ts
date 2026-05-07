/**
 * @file auth-better.module.ts — Better Auth-aware Nest module
 *
 * Wires `AuthBetterController` (and any future Better Auth-specific
 * controllers) into the Nest DI graph. PrismaService is already global
 * via PrismaModule, so this module needs no providers beyond the
 * controller itself.
 *
 * Note: this is NOT where the Better Auth /api/auth/* handler is mounted —
 * that lives in main.ts via toNodeHandler(auth). This module only hosts
 * Nest-style endpoints that read the Better Auth session.
 */
import { Module } from '@nestjs/common';
import { AuthBetterController } from './auth-better.controller';

@Module({
  controllers: [AuthBetterController],
})
export class AuthBetterModule {}
