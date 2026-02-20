/**
 * @file team-member.controller.ts
 *
 * @intent
 * REST controller that exposes CRUD endpoints for managing team members
 * (sub-users) under a seller / company account. Every route is protected
 * by AuthGuard, so only authenticated users can access them.
 *
 * @idea
 * Acts as the thin HTTP layer between incoming requests and the
 * TeamMemberService. The controller is responsible only for extracting
 * request data (body, query params, auth context) and forwarding it to
 * the service; all business logic lives in TeamMemberService.
 *
 * @usage
 * Base path: /team-member
 * Routes:
 *   POST   /team-member/create           -- create a new team member
 *   PATCH  /team-member/update           -- update an existing team member
 *   GET    /team-member/getAllTeamMember  -- list team members (paginated)
 *   GET    /team-member/getOneTeamMember -- fetch a single team member by id
 *
 * @dataflow
 * HTTP Request -> AuthGuard (JWT validation) -> Controller method
 *   -> TeamMemberService -> PrismaClient -> Database
 *
 * @depends
 * - AuthGuard           -- validates JWT token on every request
 * - TeamMemberService   -- contains all business logic
 *
 * @notes
 * - All endpoints return a uniform response shape:
 *   { status: boolean | string, message: string, data?: any, ... }
 * - Delete and Param decorators are imported but not currently used.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/AuthGuard';
import { TeamMemberService } from './team-member.service';

@ApiTags('team-members')
@ApiBearerAuth('JWT-auth')
@Controller('team-member')
export class TeamMemberController {

  constructor(
    private readonly teamMemberService: TeamMemberService,
  ) { }

  /**
   * @intent  Create a new team member (sub-user) under the authenticated seller.
   * @idea    Accepts member details in the body and delegates creation to the
   *          service, which generates credentials, creates User + TeamMember
   *          records, and sends a welcome email.
   * @usage   POST /team-member/create
   *          Body: { email, firstName?, lastName?, cc?, phoneNumber?, userRoleId, status? }
   * @dataflow  req.user.id (owner) + payload -> TeamMemberService.create
   * @depends AuthGuard, TeamMemberService.create
   * @notes   The authenticated user's id is used as `addedBy` for ownership.
   */
  @UseGuards(AuthGuard)
  @Post('/create')
  create(@Request() req, @Body() payload: any) {
    return this.teamMemberService.create(payload, req);
  }

  /**
   * @intent  Update an existing team member's details and/or role.
   * @idea    Allows changing userRoleId, status, and personal fields
   *          (firstName, lastName, cc, phoneNumber). The service syncs
   *          relevant changes to both TeamMember and User tables.
   * @usage   PATCH /team-member/update
   *          Body: { memberId, userRoleId?, status?, firstName?, lastName?, cc?, phoneNumber? }
   * @dataflow  payload.memberId identifies the record -> TeamMemberService.update
   * @depends AuthGuard, TeamMemberService.update
   * @notes   memberId is required in the body; returns error if missing or not found.
   */
  @UseGuards(AuthGuard)
  @Patch('/update')
  update(@Request() req, @Body() payload: any) {
    return this.teamMemberService.update(payload, req);
  }

  /**
   * @intent  List all team members added by the current user (or their admin).
   * @idea    Supports pagination via `page` and `limit` query parameters.
   *          Ownership is resolved through HelperService.getAdminId(), so
   *          both admin and member callers see the same team list.
   * @usage   GET /team-member/getAllTeamMember?page=1&limit=10
   * @dataflow  req.user.id -> HelperService.getAdminId -> Prisma query
   * @depends AuthGuard, TeamMemberService.getAllTeamMember
   * @notes   Defaults to page=1 and limit=10000 when not provided.
   */
  @UseGuards(AuthGuard)
  @Get('/getAllTeamMember')
  getAllTeamMember(@Query('page') page: number, @Query('limit') limit: number, @Request() req) {
    return this.teamMemberService.getAllTeamMember(page, limit, req);
  }

  /**
   * @intent  Retrieve a single team member's full details.
   * @idea    Returns the TeamMember record along with its related User and
   *          UserRole data via Prisma includes.
   * @usage   GET /team-member/getOneTeamMember?memberId=42
   * @dataflow  memberId query param -> TeamMemberService.getOneTeamMember
   * @depends AuthGuard, TeamMemberService.getOneTeamMember
   * @notes   memberId is required; returns an error response if missing or not found.
   */
  @UseGuards(AuthGuard)
  @Get('/getOneTeamMember')
  getOneTeamMember(@Query('memberId') memberId: number, @Request() req) {
    return this.teamMemberService.getOneTeamMember(memberId, req);
  }

}

