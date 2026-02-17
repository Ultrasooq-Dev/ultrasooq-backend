/**
 * @file user.module.ts — User Feature Module
 *
 * @intent
 *   Encapsulates all user-related functionality: registration, authentication,
 *   profile management, addresses, branches, phone numbers, role management,
 *   permissions, multi-account system, help center, and file uploads (S3).
 *
 * @idea
 *   This is one of the largest and most central modules. It directly provides
 *   AuthService and JwtService (rather than importing AuthModule) so that
 *   UserService can sign/validate tokens during login and account switching.
 *   NotificationService is provided for sending OTP and verification emails.
 *   HelperService provides shared utility functions (e.g., generating share links).
 *
 * @usage
 *   - Imported by AppModule (root).
 *   - UserController handles all /user/* HTTP routes.
 *   - UserService is the primary business-logic layer for user operations.
 *
 * @dataflow
 *   HTTP requests → UserController → UserService → Prisma (DB) + AuthService (JWT)
 *                                                  + NotificationService (Email)
 *                                                  + S3service (File uploads)
 *                                                  + HelperService (Utilities)
 *
 * @depends
 *   - ./user.service              (UserService — core user business logic)
 *   - ./user.controller           (UserController — HTTP route handlers)
 *   - src/auth/auth.service       (AuthService — JWT token operations)
 *   - @nestjs/jwt                  (JwtService — underlying JWT library)
 *   - src/notification/notification.service (NotificationService — email/OTP)
 *   - ./s3.service                 (S3service — AWS S3 file operations)
 *   - src/helper/helper.service   (HelperService — shared utilities)
 *
 * @notes
 *   - AuthService and JwtService are provided directly here instead of importing
 *     AuthModule. This is because AuthModule does not export AuthService, so
 *     other modules must provide their own instances. This leads to multiple
 *     AuthService instances across the app (one per module that needs it).
 *   - Similarly, NotificationService and HelperService are provided directly
 *     rather than imported from their respective modules.
 *   - S3service is both provided here AND imported in AppModule. This creates
 *     separate instances unless scoped globally.
 */

import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { AuthService } from 'src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { NotificationService } from 'src/notification/notification.service';
import { S3service } from './s3.service';
import { HelperService } from 'src/helper/helper.service';

@Module({
  providers: [UserService, AuthService, JwtService, NotificationService, S3service, HelperService],
  controllers: [UserController]
})
export class UserModule {}
