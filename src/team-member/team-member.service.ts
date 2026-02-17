/**
 * @file team-member.service.ts
 *
 * @intent
 * Service layer that encapsulates all business logic for creating,
 * listing, fetching, and updating team members (sub-users) that belong
 * to a seller / company account.
 *
 * @idea
 * A seller (parent account) can add team members who are stored as Users
 * with tradeRole='MEMBER'. Each member is also tracked in the TeamMember
 * table with a foreign key back to the User who added them (`addedBy`)
 * and an assigned UserRole for permissions. On creation, a random
 * password is generated, hashed, and the plaintext version is emailed
 * to the new member via NotificationService.
 *
 * @usage
 * Injected into TeamMemberController. Not intended for direct
 * instantiation -- NestJS DI provides the singleton instance.
 *
 * @dataflow
 * Controller -> Service methods -> PrismaClient -> PostgreSQL
 *   create:           payload + req -> User row + TeamMember row + email
 *   getAllTeamMember:  req.user.id -> getAdminId -> paginated query
 *   getOneTeamMember: memberId -> single record with includes
 *   update:           payload -> TeamMember update + User update (sync)
 *
 * @depends
 * - PrismaClient         -- database access (module-scoped singleton)
 * - AuthService           -- (injected, available for future use)
 * - NotificationService   -- sends welcome email (addMemberMail)
 * - S3service             -- (injected, available for future use)
 * - HelperService         -- resolves admin ownership (getAdminId)
 * - bcrypt (genSalt, hash) -- password hashing
 * - randomstring          -- random password / employeeId / username generation
 *
 * @notes
 * - PrismaClient is instantiated at module scope, not via DI.
 * - The `compare` import from bcrypt is unused in this file.
 * - The `create` method returns status as the string 'false' for
 *   validation errors, but boolean false for catch-block errors.
 *   This is an existing inconsistency.
 * - Plaintext passwords are emailed to new members -- security
 *   consideration for production hardening.
 */

import { Injectable } from '@nestjs/common';
import { compare, hash, genSalt } from 'bcrypt';
import * as randomstring from 'randomstring';
import { AuthService } from 'src/auth/auth.service';
import { HelperService } from 'src/helper/helper.service';
import { NotificationService } from 'src/notification/notification.service';
import { S3service } from 'src/user/s3.service';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage } from 'src/common/utils/get-error-message';


@Injectable()
export class TeamMemberService {

  constructor(
    private readonly authService: AuthService,
    private readonly notificationService: NotificationService,
    private readonly s3service: S3service,
    private readonly helperService: HelperService,
    private readonly prisma: PrismaService,
  ) { }

  /**
   * @intent
   * Create a new team member (sub-user) under the currently authenticated
   * seller account.
   *
   * @idea
   * 1. Validate that email is provided and not already registered.
   * 2. Look up the assigned UserRole by userRoleId.
   * 3. Generate an 8-character random alphanumeric password and hash it.
   * 4. Generate a random employeeId for the new user.
   * 5. Create a User record with tradeRole='MEMBER', linking it to the
   *    caller via `addedBy`.
   * 6. Derive a zero-padded `uniqueId` and a `userName` (firstName +
   *    random suffix), then update the User record.
   * 7. Send a welcome email containing the plaintext password.
   * 8. Create a TeamMember record referencing the new User, the assigned
   *    role, and the owner.
   *
   * @usage
   * Called from TeamMemberController.create (POST /team-member/create).
   *
   * @dataflow
   * payload (email, firstName, lastName, cc, phoneNumber, userRoleId, status?)
   *   + req.user.id
   *   -> validate email uniqueness
   *   -> fetch UserRole
   *   -> generate password & employeeId
   *   -> this.prisma.user.create
   *   -> this.prisma.user.update (uniqueId, userName)
   *   -> notificationService.addMemberMail (plaintext password)
   *   -> this.prisma.teamMember.create
   *   -> return newMember
   *
   * @depends PrismaClient, bcrypt (genSalt, hash), randomstring,
   *          NotificationService.addMemberMail
   *
   * @notes
   * - Validation-error responses use status: 'false' (string), while the
   *   catch block uses status: false (boolean).
   * - The plaintext password is emailed to the user -- intended for
   *   first-time login; a password-change flow is expected downstream.
   * - The uniqueId is left-padded with zeros to a minimum of 7 digits.
   * - The userName is firstName concatenated with an 8-char random string.
   *
   * @param {any} payload - Request body with member details.
   * @param {any} req     - Express request object (req.user.id used as owner).
   * @returns {{ status: boolean | string, message: string, data?: any, error?: string }}
   */
  async create(payload: any, req: any) {
    try {
      // -- Validate required email field --
      if (!payload?.email) {
        return {
          status: 'false',
          message: 'email is required!',
        };
      }
      const userId = req?.user?.id;
      const userRoleID = parseInt(payload.userRoleId);

      // -- Check for duplicate email in User table --
      const userExist = await this.prisma.user.findUnique({
        where: { email: payload.email }
      });

      if (userExist) {
        return {
          status: 'false',
          message: 'email already exists',
          data: [],
        };
      }

      // -- Fetch the UserRole record to obtain the role name --
      let userRoleDetail = await this.prisma.userRole.findUnique({
        where: { id: userRoleID }
      })

      // -- Generate random password (8-char alphanumeric) and hash it --
      const salt = await genSalt(10);
      const password = randomstring.generate({
        length: 8,
        charset: "alphanumeric",
      });

      // -- Generate a random employeeId for the new user --
      const employeeId = randomstring.generate({
        length: 8,
        charset: "alphanumeric",
      });
      const hashedPassword = await hash(password, salt);

      // -- Extract and normalise payload fields --
      let firstName = payload?.firstName || null;
      let lastName = payload?.lastName || null;
      let email = payload.email;
      let cc = payload?.cc || null;
      let phoneNumber = payload?.phoneNumber || null;
      let userRoleName = userRoleDetail.userRoleName;
      let userRoleId = userRoleID

      // -- Create the User record with tradeRole 'MEMBER' --
      let newUser = await this.prisma.user.create({
        data: {
          firstName,
          lastName,
          email,
          password: hashedPassword,
          tradeRole: 'MEMBER',
          cc,
          phoneNumber,
          userType: 'USER',
          status: 'ACTIVE',
          userRoleName,
          userRoleId,
          employeeId: employeeId,
          addedBy: userId
        }
      });

      // -- Build a zero-padded uniqueId (minimum 7 digits) --
      let idString = newUser.id.toString();
      let requestId;

      if (idString.length >= 7) {
        requestId = idString;
      } else {
        // Pad with zeros to make it an 8-digit number
        requestId = "0".repeat(7 - idString.length) + idString;
      }

      // -- Create a userName by appending a random suffix to firstName --
      // creating username from firstName
      const username = firstName + randomstring.generate({
        length: 8,
        charset: "alphanumeric",
      });

      // -- Persist uniqueId and userName back to the User record --
      let updatedUser = await this.prisma.user.update({
        where: { id: newUser.id },
        data: {
          uniqueId: requestId,
          userName: username
        }
      });

      // -- Send welcome email with plaintext password --
      let data = {
        email: email,
        name: firstName || 'User',
        password: password
      }
      this.notificationService.addMemberMail(data)

      // ------------------------------------------ Storing ---------------------------------
      // -- Create the TeamMember record linking user, role, and owner --
      let newMember = await this.prisma.teamMember.create({
        data: {
          userId: newUser.id,
          userRoleId: userRoleID,
          addedBy: userId,
          status: payload?.status || 'ACTIVE'
        }
      })


      return {
        status: true,
        message: 'Created Successfully',
        data: newMember
      }
    } catch (error) {
      return {
        status: false,
        message: 'error in create team member',
        error: getErrorMessage(error)
      }
    }
  }

  /**
   * @intent
   * Retrieve a paginated list of all team members that belong to the
   * authenticated user's seller account.
   *
   * @idea
   * Uses HelperService.getAdminId() to resolve the true admin/owner id.
   * If the caller is themselves a MEMBER, getAdminId returns the parent
   * admin's id so that all members under the same organisation see the
   * same list.
   *
   * @usage
   * Called from TeamMemberController.getAllTeamMember
   * (GET /team-member/getAllTeamMember?page=1&limit=10).
   *
   * @dataflow
   * req.user.id -> helperService.getAdminId(userId) -> resolved adminId
   *   -> this.prisma.teamMember.findMany (where addedBy = adminId, ordered desc)
   *   -> this.prisma.teamMember.count (active only, for totalCount)
   *   -> return list + totalCount + selectedAdminId
   *
   * @depends HelperService.getAdminId, PrismaClient
   *
   * @notes
   * - Default page size is 10 000 when `limit` is not provided, effectively
   *   returning all records in a single page.
   * - totalCount only counts ACTIVE members, while the list includes all
   *   statuses.
   * - Includes related `userDetail` and `userRolDetail` in each record.
   *
   * @param {any} page  - Page number (1-based). Defaults to 1.
   * @param {any} limit - Page size. Defaults to 10000.
   * @param {any} req   - Express request object (req.user.id).
   * @returns {{ status: boolean, message: string, data?: any[], totalCount?: number, selectedAdminId?: number, error?: string }}
   */
  async getAllTeamMember (page: any, limit: any, req: any) {
    try {
      let userId = req?.user?.id;

      // -- Resolve the admin/owner id (handles MEMBER callers) --
      userId = await this.helperService.getAdminId(userId);

      // -- Parse pagination parameters with defaults --
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10000;
      const skip = (Page - 1) * pageSize; // Calculate the offset

      // -- Fetch team members with related user and role data --
      let getAllTeamMembers = await this.prisma.teamMember.findMany({
        where: {
          addedBy: userId,
        },
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
        include: {
          userDetail: true,
          userRolDetail: true,
        },
      });

      // -- Count only ACTIVE members for the total (used by frontend pagination) --
      let getAllTeamMemberCount = await this.prisma.teamMember.count({
        where: {
          addedBy: userId,
          status: 'ACTIVE',
        },
      });

      return {
        status: true,
        message: 'Fetch Successfully',
        data: getAllTeamMembers,
        totalCount: getAllTeamMemberCount,
        selectedAdminId: userId
      };

    } catch (error) {
      return {
        status: false,
        message: 'error in getAllTeamMember',
        error: getErrorMessage(error)
      };
    }
  }

  /**
   * @intent
   * Retrieve a single team member by their TeamMember record id.
   *
   * @idea
   * Looks up the TeamMember row by primary key and eagerly loads the
   * associated User (userDetail) and UserRole (userRolDetail) records
   * so the caller gets the full picture in one request.
   *
   * @usage
   * Called from TeamMemberController.getOneTeamMember
   * (GET /team-member/getOneTeamMember?memberId=42).
   *
   * @dataflow
   * memberId (query param, parsed to int)
   *   -> this.prisma.teamMember.findUnique with includes
   *   -> return single record or 'not found'
   *
   * @depends PrismaClient
   *
   * @notes
   * - memberId is required; returns an error object if falsy.
   * - The `req` parameter is accepted but not currently used -- it is
   *   available for future authorisation checks.
   *
   * @param {any} memberId - TeamMember primary key (passed as string, parsed to int).
   * @param {any} req      - Express request object (unused but available).
   * @returns {{ status: boolean, message: string, data?: any, error?: string }}
   */
  async getOneTeamMember (memberId: any, req: any) {
    try {
      // -- Validate memberId presence --
      if (!memberId) {
        return {
          status: false,
          message: 'memberId is required',
        };
      }

      // -- Fetch the team member with related user and role includes --
      let teamMember = await this.prisma.teamMember.findUnique({
        where: { id: parseInt(memberId) },
        include: {
          userDetail: true, // Fetch associated user details
          userRolDetail: true, // Fetch associated user role details
        },
      });

      if (!teamMember) {
        return {
          status: false,
          message: 'Team member not found',
        };
      }

      return {
        status: true,
        message: 'Fetch Successfully',
        data: teamMember,
      };

    } catch (error) {
      return {
        status: false,
        message: 'Error in getOneTeamMember',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @intent
   * Update an existing team member's role, status, and/or personal
   * information, keeping the TeamMember and User tables in sync.
   *
   * @idea
   * The method performs up to three database writes:
   * 1. Update the TeamMember record (userRoleId, status, updatedAt).
   * 2. If personal fields changed (firstName, lastName, cc, phoneNumber),
   *    propagate them to the linked User record.
   * 3. If userRoleId changed, look up the new UserRole's name and sync
   *    both userRoleId and userRoleName to the User record.
   *
   * @usage
   * Called from TeamMemberController.update
   * (PATCH /team-member/update).
   * Body: { memberId, userRoleId?, status?, firstName?, lastName?, cc?, phoneNumber? }
   *
   * @dataflow
   * payload.memberId -> this.prisma.teamMember.findUnique (existence check)
   *   -> this.prisma.teamMember.update (role/status)
   *   -> this.prisma.user.update (personal fields, if any changed)
   *   -> this.prisma.userRole.findUnique + this.prisma.user.update (role sync, if changed)
   *   -> return updatedTeamMember
   *
   * @depends PrismaClient
   *
   * @notes
   * - memberId is required in the payload; returns error if missing.
   * - Only truthy fields are included in updateData, so passing an
   *   empty string or zero would skip the field.
   * - The User-table sync for personal fields always writes all four
   *   fields (firstName, lastName, cc, phoneNumber) even if only one
   *   changed -- the others will be overwritten with whatever is in the
   *   payload (possibly undefined).
   * - updatedAt is set explicitly to new Date() on the TeamMember record.
   *
   * @param {any} payload - Request body containing memberId and fields to update.
   * @param {any} req     - Express request object (req.user.id extracted but
   *                        not currently used for authorisation).
   * @returns {{ status: boolean, message: string, data?: any, error?: string }}
   */
  async update (payload: any, req: any) {
    try {
      const userId = req?.user?.id;

      // -- Validate memberId presence --
      if (!payload.memberId) {
        return {
          status: false,
          message: 'memberId is required',
        };
      }

      // -- Check if the team member exists --
      // Check if the team member exists
      let existingTeamMember = await this.prisma.teamMember.findUnique({
        where: { id: parseInt(payload.memberId) }
      });

      if (!existingTeamMember) {
        return {
          status: false,
          message: 'Team member not found',
        };
      }

      // -- Build the update payload, including only truthy fields --
      // Prepare update data (filter out undefined fields)
      let updateData: any = {};

      if (payload.userRoleId) updateData.userRoleId = payload.userRoleId;
      if (payload.status) updateData.status = payload.status;

      // -- Persist changes to the TeamMember record --
      // Update the team member
      let updatedTeamMember = await this.prisma.teamMember.update({
        where: { id: parseInt(payload.memberId) },
        data: {
          ...updateData,
          updatedAt: new Date(),
        },
      });

      // -- Sync personal fields to the User table if any were provided --
      // if firstName, lastName etc is changed then update it in user
      if (payload.firstName || payload.lastName || payload.cc || payload.phoneNumber) {
        await this.prisma.user.update({
          where: { id: existingTeamMember.userId },
          data: {
            firstName: payload.firstName,
            lastName: payload.lastName,
            cc: payload.cc,
            phoneNumber: payload.phoneNumber,
          }
        })
      }

      // -- Sync userRoleId and derived userRoleName to the User table --
      // userRoleId is changed then update it in user table as well
      if (payload.userRoleId) {
        let userRoleDetail = await this.prisma.userRole.findUnique({
          where: { id: parseInt(payload.userRoleId) }
        });
        await this.prisma.user.update({
          where: { id: existingTeamMember.userId },
          data: {
            userRoleId: payload.userRoleId,
            userRoleName: userRoleDetail.userRoleName,
          }
        })
      }

      return {
        status: true,
        message: 'Updated Successfully',
        data: updatedTeamMember,
      };

    } catch (error) {
      return {
        status: false,
        message: 'Error in update',
        error: getErrorMessage(error),
      };
    }
  }


}
