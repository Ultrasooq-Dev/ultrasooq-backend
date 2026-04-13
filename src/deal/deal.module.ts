import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DealController } from './deal.controller';
import { DealService } from './deal.service';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { HelperService } from '../helper/helper.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [DealController],
  providers: [DealService, JwtService, HelperService],
  exports: [DealService],
})
export class DealModule {}
