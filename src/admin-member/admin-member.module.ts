/**
 * @file admin-member.module.ts
 * @module AdminMemberModule
 *
 * @description
 * NestJS feature module that encapsulates the Admin Member domain for the
 * Ultrasooq B2B/B2C marketplace platform.  This module wires together the
 * controller, service, and all transitive dependency providers required to
 * manage admin team members, admin roles, and admin permissions.
 *
 * **Intent:**
 * Provide a self-contained NestJS module that groups every artifact needed
 * for CRUD operations on admin roles, admin permissions, admin-role-permission
 * mappings, and admin member accounts.
 *
 * **Idea:**
 * Rather than relying on global modules, this module explicitly registers all
 * required providers (including cross-domain services such as AuthService,
 * UserService, NotificationService, S3service, and HelperService) so the
 * dependency-injection container can resolve them within the module scope.
 *
 * **Usage:**
 * Import this module into the root AppModule (or a higher-level feature module)
 * to expose the `/admin-member/*` HTTP endpoints.
 *
 * **Data Flow:**
 * HTTP Request --> AdminMemberController --> AdminMemberService
 *   --> PrismaClient (database) / NotificationService (email) / HelperService (admin hierarchy)
 *
 * **Dependencies:**
 * - {@link AdminMemberController} -- route handler layer
 * - {@link AdminMemberService}    -- business-logic layer
 * - {@link UserService}           -- user account helpers
 * - {@link AuthService}           -- authentication utilities
 * - {@link JwtService}            -- JWT token operations (used by guards)
 * - {@link NotificationService}   -- email / notification dispatch
 * - {@link S3service}             -- AWS S3 file-upload utilities
 * - {@link HelperService}         -- shared helpers including admin-hierarchy resolution
 *
 * **Notes:**
 * - The module does NOT export any providers; consumers that need
 *   AdminMemberService should import this module or re-register it.
 * - SuperAdminAuthGuard (used in the controller) relies on JwtService and
 *   AuthService being available in the injection scope, hence their inclusion
 *   in the providers array.
 */
import { Module } from '@nestjs/common';
import { AdminMemberController } from './admin-member.controller';
import { AdminMemberService } from './admin-member.service';
import { UserService } from 'src/user/user.service';
import { AuthService } from 'src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { NotificationService } from 'src/notification/notification.service';
import { S3service } from 'src/user/s3.service';
import { HelperService } from 'src/helper/helper.service';

@Module({
  controllers: [AdminMemberController],
  providers: [AdminMemberService, UserService, AuthService, JwtService, NotificationService, S3service, HelperService]
})
export class AdminMemberModule {}
