/**
 * @file strategy-lab.module.ts
 * @intent NestJS module for the Strategy Lab feature.
 *         Wires controller, service, and auth providers.
 * @usage Import into AppModule to register /strategy-lab/* routes.
 */
import { Module } from '@nestjs/common';
import { StrategyLabController } from './strategy-lab.controller';
import { StrategyLabService } from './strategy-lab.service';
import { AuthService } from 'src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';

@Module({
  controllers: [StrategyLabController],
  providers: [StrategyLabService, AuthService, JwtService],
})
export class StrategyLabModule {}
