import { Module } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { HelperService } from '../helper/helper.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [VerificationController],
  providers: [VerificationService, JwtService, HelperService],
  exports: [VerificationService],
})
export class VerificationModule {}
