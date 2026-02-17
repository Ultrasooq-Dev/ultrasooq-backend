/**
 * @file team-member.module.ts
 *
 * @intent
 * NestJS module definition for the Team Member feature. Registers the controller
 * and all service providers required to manage team members (sub-users)
 * under a parent seller / company account.
 *
 * @idea
 * Seller accounts can invite sub-users (tradeRole='MEMBER') who inherit
 * scoped permissions via a UserRole. This module wires together the
 * controller, the domain service, and every cross-cutting service that
 * the domain service depends on.
 *
 * @usage
 * Imported by the root AppModule. Once imported, the routes defined in
 * TeamMemberController (POST /team-member/create, PATCH /team-member/update,
 * GET /team-member/getAllTeamMember, GET /team-member/getOneTeamMember) become
 * available to authenticated users.
 *
 * @dataflow
 * AppModule -> TeamMemberModule -> TeamMemberController -> TeamMemberService
 *   TeamMemberService delegates to AuthService, NotificationService,
 *   S3service, and HelperService as needed.
 *
 * @depends
 * - TeamMemberController  -- route handlers
 * - TeamMemberService     -- core business logic for CRUD operations
 * - UserService           -- user-level operations (re-provided for DI)
 * - AuthService           -- authentication helpers (re-provided for DI)
 * - JwtService            -- JWT token utilities (re-provided for DI)
 * - NotificationService   -- email dispatch (welcome email with password)
 * - S3service             -- S3 / file-upload utilities (re-provided for DI)
 * - HelperService         -- shared helpers such as getAdminId()
 *
 * @notes
 * - All providers are listed explicitly so they are available inside this
 *   module's injector scope without needing to export them from their
 *   own modules. This is the "re-provide" pattern.
 */

import { Module } from '@nestjs/common';
import { TeamMemberController } from './team-member.controller';
import { TeamMemberService } from './team-member.service';
import { UserService } from 'src/user/user.service';
import { AuthService } from 'src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { NotificationService } from 'src/notification/notification.service';
import { S3service } from 'src/user/s3.service';
import { HelperService } from 'src/helper/helper.service';

@Module({
  controllers: [TeamMemberController],
  providers: [
    TeamMemberService,
    UserService,
    AuthService,
    JwtService,
    NotificationService,
    S3service,
    HelperService,
  ],
})
export class TeamMemberModule {}
