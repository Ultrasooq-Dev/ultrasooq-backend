/**
 * @module PrismaModule
 * @description Global module providing PrismaService (singleton database client) to the entire application.
 *   Marked as @Global() so PrismaService can be injected anywhere without importing PrismaModule.
 *   Replaces the pattern of creating `new PrismaClient()` in individual service files.
 * @exports PrismaService
 * @usage Imported once in AppModule. PrismaService is then available globally via DI.
 */
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
