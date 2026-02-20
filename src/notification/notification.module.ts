/**
 * @file notification.module.ts
 *
 * @intent Configures the notification subsystem (email sending via SendGrid).
 *
 * @idea Provides NotificationService for transactional email dispatch. Also
 *       provides AuthService/JwtService (re-provided here since AuthModule
 *       doesn't export them).
 *
 * @usage Imported by AppModule. NotificationService is also directly provided
 *        by UserModule, OrderModule, etc.
 *
 * @depends @nestjs/common, NotificationService, AuthService, JwtService
 *
 * @notes AuthService and JwtService are re-provided here (same pattern as
 *        UserModule). NotificationService is not exported, so consuming
 *        modules must re-provide it.
 */
import { Module } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { BuygroupSchedulerService } from './buygroup-scheduler.service';
import { AuthService } from 'src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';

@Module({
  controllers: [NotificationController],
  providers: [NotificationService, BuygroupSchedulerService, AuthService, JwtService],
  exports: [NotificationService],
})
export class NotificationModule {}
