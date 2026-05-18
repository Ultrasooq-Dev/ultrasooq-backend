/**
 * @file support.module.ts
 * @description User-facing support widget module. The admin side of this
 * feature lives in AdminController/AdminService under /admin/support/*
 * and reads the same SupportConversation/SupportMessage tables this
 * module writes to.
 *
 * Why a separate module from AdminModule:
 *  - The admin endpoints are gated by SuperAdminAuthGuard.
 *  - The user-facing endpoints use the regular AuthGuard (any signed-in
 *    user can open a ticket, including inactive ones — by design, since
 *    "talk to admin when not active" is the primary use case).
 */
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { AuthService } from '../auth/auth.service';
import { NotificationModule } from '../notification/notification.module';

// PrismaModule is @Global(), so PrismaService is injectable without imports here.
// AuthGuard needs AuthService + JwtService, so we register both locally — same
// pattern as ChatModule. JWT_SECRET is read from ConfigService.
// NotificationModule is imported so SupportService can fan a new-message
// notification out to every active admin (lights up the bell on /support).
@Module({
  imports: [
    NotificationModule,
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
  controllers: [SupportController],
  providers: [SupportService, AuthService],
  exports: [SupportService],
})
export class SupportModule {}
