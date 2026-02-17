/**
 * @file admin-member.service.ts
 * @module AdminMemberService
 *
 * @description
 * Business-logic service for the Admin Member domain in the Ultrasooq
 * B2B/B2C marketplace backend.  Encapsulates all CRUD operations for:
 *
 *   - **Admin Roles**             -- named roles (e.g. "Editor", "Moderator").
 *   - **Admin Permissions**       -- granular permission definitions.
 *   - **Role-Permission mapping** -- many-to-many junction between roles and permissions.
 *   - **Admin Members**           -- sub-admin user accounts linked to roles.
 *
 * **Intent:**
 * Centralise the business rules and database interactions required to manage
 * the admin team, keeping the controller layer as thin as possible.
 *
 * **Idea:**
 * Every public method follows the project-wide response-envelope pattern
 * `{ status: boolean, message: string, data?: any, ... }`.  Errors are caught
 * internally and returned as `{ status: false, message, error }` so the HTTP
 * layer never throws unhandled exceptions.
 *
 * **Usage:**
 * Instantiated and injected by NestJS via the AdminMemberModule provider list.
 * Consumed exclusively by {@link AdminMemberController}.
 *
 * **Data Flow:**
 * Controller --> Service method --> PrismaClient (module-scoped singleton)
 *   --> PostgreSQL database.  Outbound side-effects include welcome emails
 *   dispatched through {@link NotificationService}.
 *
 * **Dependencies:**
 * - `PrismaClient`          -- module-scoped instance for DB access (not injected; instantiated at module level).
 * - {@link AuthService}     -- authentication utilities (available for future use).
 * - {@link NotificationService} -- sends welcome / credential emails to new admin members.
 * - {@link S3service}       -- AWS S3 upload utilities (available for future use).
 * - {@link HelperService}   -- provides `getSuperAdminORSubAdminId()` to resolve the
 *                              top-level admin ID when the caller is a sub-admin.
 * - `bcrypt`                -- password hashing (genSalt, hash).
 * - `randomstring`          -- generating default passwords and employee IDs.
 *
 * **Notes:**
 * - `PrismaClient` is instantiated at the module scope (`const prisma = new PrismaClient()`)
 *   rather than through NestJS DI.  This is a project-wide pattern for this codebase.
 * - All methods resolve the effective admin identity via
 *   `helperService.getSuperAdminORSubAdminId()` to support the admin-hierarchy
 *   model where sub-admins operate under a parent super-admin.
 */
import { Injectable } from '@nestjs/common';
import { AuthService } from 'src/auth/auth.service';
import { NotificationService } from 'src/notification/notification.service';
import { S3service } from 'src/user/s3.service';
import * as randomstring from 'randomstring';
import { compare, hash, genSalt } from 'bcrypt';
import { HelperService } from 'src/helper/helper.service';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage } from 'src/common/utils/get-error-message';

/**
 * Module-scoped PrismaClient instance shared by all methods in this service.
 * Follows the project convention of creating a single PrismaClient per service
 * file rather than injecting it through the NestJS DI container.
 * @type {PrismaClient}
 */

/**
 * @class AdminMemberService
 * @description
 * Injectable NestJS service that implements all business logic for admin roles,
 * permissions, role-permission mappings, and admin member user accounts.
 */
@Injectable()
export class AdminMemberService {

  /**
   * @constructor
   * @description Receives dependency-injected services required by admin member operations.
   *
   * @param {AuthService} authService               - Authentication helper (reserved for future use in this service).
   * @param {NotificationService} notificationService - Sends welcome emails with credentials to new admin members.
   * @param {S3service} s3service                     - S3 upload helper (reserved for future use in this service).
   * @param {HelperService} helperService             - Provides admin hierarchy resolution via `getSuperAdminORSubAdminId()`.
   */
  constructor(
    private readonly authService: AuthService,
    private readonly notificationService: NotificationService,
    private readonly s3service: S3service,
    private readonly helperService: HelperService,
    private readonly prisma: PrismaService,
  ) { }

  // ──────────────────────────────────────────────
  //  Admin Role methods
  // ──────────────────────────────────────────────

  /**
   * @method createAdminRole
   * @async
   * @description Create a new admin role record in the database.
   *
   * **Intent:** Allow a super-admin to define a named role (e.g. "Editor",
   * "Support Agent") that can later be assigned permissions and attached to
   * admin members.
   *
   * **Idea:** The method is idempotent with respect to the role name -- if an
   * `adminRole` with the same `adminRoleName` already exists, the existing
   * record is returned with `message: 'Already exists'` instead of creating a
   * duplicate.
   *
   * **Usage:** Called by `AdminMemberController.createAdminRole` via
   * `POST /admin-member/role/create`.
   *
   * **Data Flow:**
   * 1. Resolve effective admin ID via `helperService.getSuperAdminORSubAdminId`.
   * 2. Validate that `adminRoleName` is present in the payload.
   * 3. Check for an existing role with the same name (`findFirst`).
   * 4. If not found, insert a new `adminRole` record with `addedBy = adminId`.
   * 5. Return the standard response envelope.
   *
   * **Dependencies:** PrismaClient (`adminRole` model), HelperService.
   *
   * **Notes:**
   * - The duplicate check is name-based and global (not scoped to admin).
   * - On error the method returns a failure envelope rather than throwing.
   *
   * @param {any} payload - Request body; must contain `adminRoleName: string`.
   * @param {any} req     - Express request with `req.user.id`.
   * @returns {Promise<{status: boolean, message: string, data?: any, selectedSuperAdminId?: number}>}
   */
  async createAdminRole(payload: any, req: any) {
    try {
      let adminId = req?.user?.id;
      adminId = await this.helperService.getSuperAdminORSubAdminId(adminId);

      if (!payload.adminRoleName) {
        return {
          status: false,
          message: 'adminRoleName is required',
        };
      }

      let existAdminRole = await this.prisma.adminRole.findFirst({
        where: { adminRoleName: payload.adminRoleName }
      });

      if (existAdminRole) {
        return {
          status: true,
          message: 'Already exists',
          data: existAdminRole
        };
      }

      let newAdminRole = await this.prisma.adminRole.create({
        data: {
          adminRoleName: payload.adminRoleName,
          addedBy: adminId
        }
      });

      return {
        status: true,
        message: 'Created successfully',
        data: newAdminRole,
        selectedSuperAdminId: adminId
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in createAdminRole',
        error: getErrorMessage(error)
      };
    }
  }

  /**
   * @method getAllAdminRole
   * @async
   * @description Retrieve a paginated list of admin roles belonging to the
   * authenticated super-admin, with optional case-insensitive name search.
   *
   * **Intent:** Provide a browseable catalogue of roles for the admin dashboard.
   *
   * **Idea:** Uses offset-based pagination (`skip` / `take`) and filters to
   * roles whose `addedBy` matches the resolved admin ID.  Only ACTIVE and
   * INACTIVE roles are returned (soft-deleted roles are excluded).
   *
   * **Usage:** Called by `AdminMemberController.getAllAdminRole` via
   * `GET /admin-member/role/get-all`.
   *
   * **Data Flow:**
   * 1. Resolve effective admin ID.
   * 2. Build a Prisma `where` condition scoped to `addedBy` and non-deleted statuses.
   * 3. Optionally add a case-insensitive `contains` filter on `adminRoleName`.
   * 4. Execute `findMany` (paginated, desc order) and `count` in parallel intent.
   * 5. Return data array and `totalCount` inside the envelope.
   *
   * **Dependencies:** PrismaClient (`adminRole`), HelperService.
   *
   * **Notes:** Defaults to page 1 / limit 10 when parameters are falsy.
   *
   * @param {any} page       - 1-based page number (string from query, parsed to int).
   * @param {any} limit      - Page size (string from query, parsed to int).
   * @param {any} searchTerm - Optional substring to match against `adminRoleName`.
   * @param {any} req        - Express request with `req.user.id`.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number, selectedAdminId?: number}>}
   */
  async getAllAdminRole(page: any, limit: any, searchTerm: any, req: any) {
    try {
      let userId = req?.user?.id;
      userId = await this.helperService.getSuperAdminORSubAdminId(userId);

      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize;

      let whereCondition: any= {
        addedBy: userId,
        status: { in: ["ACTIVE", "INACTIVE"] }
      };

      if (searchTerm) {
        whereCondition.adminRoleName = {
          contains: searchTerm,
          mode: 'insensitive'
        };
      }

      let getAllAdminRoles = await this.prisma.adminRole.findMany({
        where: whereCondition,
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
      });

      let totalAdminRoles = await this.prisma.adminRole.count({
        where: whereCondition,
      });

      return {
        status: true,
        message: 'Fetch Successfully',
        data: getAllAdminRoles,
        totalCount: totalAdminRoles,
        selectedAdminId: userId
      };

    } catch (error) {
      return {
        status: false,
        message: 'Error in getAllAdminRole',
        error: getErrorMessage(error)
      };
    }
  }

  /**
   * @method updateAdminRole
   * @async
   * @description Update the name of an existing admin role.
   *
   * **Intent:** Allow renaming of a role without deleting and recreating it,
   * preserving all existing permission mappings and member assignments.
   *
   * **Idea:** Reads `adminRoleId` and `adminRoleName` directly from `req.body`
   * and performs a Prisma `update` on the matching record.
   *
   * **Usage:** Called by `AdminMemberController.updateAdminRole` via
   * `PATCH /admin-member/role/update`.
   *
   * **Data Flow:**
   * 1. Extract `adminRoleId` from `req.body`; validate presence.
   * 2. Update the `adminRoleName` field on the matching `adminRole` record.
   * 3. Return the updated record in the envelope.
   *
   * **Dependencies:** PrismaClient (`adminRole`).
   *
   * **Notes:**
   * - The entire `req` object is received (not a destructured payload) because
   *   the controller forwards it as-is.
   * - No ownership check is performed; the guard ensures only super-admins
   *   reach this method.
   *
   * @param {any} req - Express request; `req.body` must contain `adminRoleId` and `adminRoleName`.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  async updateAdminRole(req: any) {
    try {
      const adminRoleId = req.body.adminRoleId;
      if (!adminRoleId) {
        return {
          status: false,
          message: "adminRoleId is required!"
        };
      }

      let updateAdminRole = await this.prisma.adminRole.update({
        where: { id: parseInt(adminRoleId) },
        data: {
          adminRoleName: req.body.adminRoleName
        }
      });

      return {
        status: true,
        message: 'Updated Successfully',
        data: updateAdminRole
      };

    } catch (error) {
      return {
        status: false,
        message: 'Error in updateAdminRole',
        error: getErrorMessage(error)
      };
    }
  }

  /**
   * @method deleteAdminRole
   * @async
   * @description Soft-delete an admin role by setting its status to "DELETE".
   *
   * **Intent:** Remove a role from active use while retaining the record for
   * audit and referential integrity.
   *
   * **Idea:** Before marking the role as deleted, the method verifies that no
   * admin members are currently assigned to it.  If any members reference this
   * role, the deletion is refused with an explanatory message.
   *
   * **Usage:** Called by `AdminMemberController.deleteAdminRole` via
   * `DELETE /admin-member/role/delete?id=<roleId>`.
   *
   * **Data Flow:**
   * 1. Parse `id` from `req.query`.
   * 2. Verify the role exists (`findUnique`).
   * 3. Check for associated `adminMember` records (`findMany` by `adminRoleId`).
   * 4. If no members are linked, set `status = "DELETE"` on the role record.
   * 5. Return the updated record or a refusal message.
   *
   * **Dependencies:** PrismaClient (`adminRole`, `adminMember`).
   *
   * **Notes:**
   * - This is a soft delete; the database row persists with `status = "DELETE"`.
   * - The role ID is read from `req.query.id`, not from the request body.
   *
   * @param {any} req - Express request; `req.query.id` must contain the role's numeric ID.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  async deleteAdminRole(req: any) {
    try {
      const ID = parseInt(req.query.id);

      let adminRoleExist = await this.prisma.adminRole.findUnique({
        where: { id: ID }
      });
      if (!adminRoleExist) {
        return {
          status: false,
          message: 'adminRoleId not found',
          data: []
        };
      }

      let adminRoleInMember = await this.prisma.adminMember.findMany({
        where: { adminRoleId: ID }
      });
      if (adminRoleInMember.length > 0) {
        return {
          status: false,
          message: 'adminRoleId is associated with admin members',
          data: []
        };
      }

      let updateAdminRole = await this.prisma.adminRole.update({
        where: { id: ID },
        data: {
          status: "DELETE"
        }
      });

      return {
        status: true,
        message: 'Deleted successfully',
        data: updateAdminRole
      };

    } catch (error) {
      return {
        status: false,
        message: 'Error in deleteAdminRole',
        error: getErrorMessage(error)
      };
    }
  }

  // ──────────────────────────────────────────────
  //  Admin Permission methods
  // ──────────────────────────────────────────────

  /**
   * @method createAdminPermission
   * @async
   * @description Create a new admin permission definition in the database.
   *
   * **Intent:** Define a granular capability (e.g. "manage_users",
   * "view_reports") that can be attached to admin roles.
   *
   * **Idea:** Idempotent by name -- if a permission with the same `name`
   * already exists, the existing record is returned rather than creating a
   * duplicate.
   *
   * **Usage:** Called by `AdminMemberController.createAdminPermission` via
   * `POST /admin-member/permission/create`.
   *
   * **Data Flow:**
   * 1. Resolve effective admin ID.
   * 2. Validate that `name` is present in the payload.
   * 3. Check for an existing permission by `name` (`findFirst`).
   * 4. If not found, create a new `adminPermission` record.
   * 5. Return the record in the standard envelope.
   *
   * **Dependencies:** PrismaClient (`adminPermission`), HelperService.
   *
   * **Notes:** Errors are logged to the console and returned in the envelope.
   *
   * @param {any} payload - Request body; must contain `name: string`.
   * @param {any} req     - Express request with `req.user.id`.
   * @returns {Promise<{status: boolean, message: string, data?: any, selectedSuperAdminId?: number}>}
   */
  async createAdminPermission(payload: any, req: any) {
    try {
      let userId = req?.user?.id;
      userId = await this.helperService.getSuperAdminORSubAdminId(userId);

      if (!payload.name) {
        return {
          status: false,
          message: 'name is required',
        };
      }

      // Check if the admin permission already exists
      let existPermission = await this.prisma.adminPermission.findFirst({
        where: { name: payload.name }
      });

      if (existPermission) {
        return {
          status: true,
          message: 'Already exists',
          data: existPermission
        };
      }

      // Create new admin permission
      let newPermission = await this.prisma.adminPermission.create({
        data: {
          name: payload.name,
          addedBy: userId
        }
      });
  
      return {
        status: true,
        message: 'Created successfully',
        data: newPermission,
        selectedSuperAdminId: userId
      };

    } catch (error) {
      
      return {
        status: false,
        message: 'Error in createAdminPermission',
        error: getErrorMessage(error)
      };
    }
  }

  /**
   * @method getAllAdminPermission
   * @async
   * @description Retrieve a paginated list of admin permissions owned by the
   * authenticated super-admin, with optional case-insensitive name search.
   *
   * **Intent:** Provide a browseable list of permission definitions for the
   * admin dashboard.
   *
   * **Idea:** Mirrors the pagination / search pattern of `getAllAdminRole`,
   * scoped to `addedBy` and non-deleted statuses (ACTIVE / INACTIVE).
   *
   * **Usage:** Called by `AdminMemberController.getAllAdminPermission` via
   * `GET /admin-member/permission/get-all`.
   *
   * **Data Flow:**
   * 1. Resolve effective admin ID.
   * 2. Build `where` condition filtered by `addedBy` and status.
   * 3. Optionally add case-insensitive `contains` on `name`.
   * 4. Execute `findMany` (paginated, desc order) and `count`.
   * 5. Return data array and `totalCount`.
   *
   * **Dependencies:** PrismaClient (`adminPermission`), HelperService.
   *
   * **Notes:** Defaults to page 1 / limit 10 when params are falsy.
   *
   * @param {any} page       - 1-based page number.
   * @param {any} limit      - Page size.
   * @param {any} searchTerm - Optional substring filter on permission `name`.
   * @param {any} req        - Express request with `req.user.id`.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number, selectedSuperAdminId?: number}>}
   */
  async getAllAdminPermission(page: any, limit: any, searchTerm: any, req: any) {
    try {
      let userId = req?.user?.id;
      userId = await this.helperService.getSuperAdminORSubAdminId(userId);

      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize; // Calculate offset
  
      let whereCondition: any = {
        addedBy: userId,
        status: { in: ["ACTIVE", "INACTIVE"] }
      };
  
      // Apply search filter if searchTerm is provided
      if (searchTerm) {
        whereCondition.name = {
          contains: searchTerm,
          mode: 'insensitive' // Case-insensitive search
        };
      }
  
      // Fetch paginated admin permissions
      let getAllPermissions = await this.prisma.adminPermission.findMany({
        where: whereCondition,
        orderBy: { id: 'desc' },
        skip, // Offset
        take: pageSize // Limit
      });
  
      // Count total admin permissions
      let totalPermissions = await this.prisma.adminPermission.count({
        where: whereCondition
      });
  
      return {
        status: true,
        message: 'Fetch Successfully',
        data: getAllPermissions,
        totalCount: totalPermissions,
        selectedSuperAdminId: userId
      };
  
    } catch (error) {
      return {
        status: false,
        message: 'Error in getAllAdminPermission',
        error: getErrorMessage(error)
      };
    }
  }


  // ──────────────────────────────────────────────
  //  Role-Permission mapping methods
  // ──────────────────────────────────────────────

  /**
   * @method setAdminRolePermission
   * @async
   * @description Assign a list of permissions to an admin role by creating
   * junction records in the `adminRolePermission` table.
   *
   * **Intent:** Establish the initial permission set for a newly created
   * admin role.
   *
   * **Idea:** Receives an `adminRoleId` and an array of permission references
   * (`permissionIdList`).  Each item in the array produces one
   * `adminRolePermission` record with `status = "ACTIVE"`.
   *
   * **Usage:** Called by `AdminMemberController.setAdminRolePermission` via
   * `POST /admin-member/set-permission`.
   *
   * **Data Flow:**
   * 1. Validate `adminRoleId` and `permissionIdList`.
   * 2. Map over the list and `Promise.all` create calls.
   * 3. Return the array of created junction records.
   *
   * **Dependencies:** PrismaClient (`adminRolePermission`).
   *
   * **Notes:**
   * - This method does NOT remove pre-existing mappings; it only adds.
   * - For a full replacement (delete + re-insert), use `updateAdminRolePermission`.
   * - Each element in `permissionIdList` is expected to be `{ permissionId: number }`.
   *
   * @param {any} payload - `{ adminRoleId: number, permissionIdList: Array<{permissionId: number}> }`.
   * @param {any} req     - Express request (currently unused in method body).
   * @returns {Promise<{status: boolean, message: string, data?: any[]}>}
   */
  async setAdminRolePermission(payload: any, req: any) {
    try {
      const { adminRoleId, permissionIdList } = payload;

      // Validate adminRoleId
      if (!adminRoleId) {
        return { status: false, message: "adminRoleId is required" };
      }

      // Validate permissionIdList
      if (!Array.isArray(permissionIdList) || permissionIdList.length === 0) {
        return { status: false, message: "permissionIdList must be a non-empty array" };
      }

      // Insert permissions
      const createdPermissions = await Promise.all(
        permissionIdList.map(async (item) => {
          return await this.prisma.adminRolePermission.create({
            data: {
              adminRoleId,
              adminPermissionId: item.permissionId,
              status: "ACTIVE",
            },
          });
        })
      );

      return {
        status: true,
        message: "Permissions assigned successfully",
        data: createdPermissions,
      };

    } catch (error) {
      return {
        status: false,
        message: "Error in setAdminRolePermission",
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getAllAdminRoleWithPermission
   * @async
   * @description Retrieve all admin roles with their associated permissions
   * eagerly loaded, supporting pagination and search.
   *
   * **Intent:** Give super-admins a consolidated view of which permissions
   * each role carries, useful for the role-management UI.
   *
   * **Idea:** Uses Prisma's `include` to join through the
   * `adminRolePermission` junction table and further include the nested
   * `adminPermissionDetail` relation, yielding a fully hydrated role object.
   *
   * **Usage:** Called by `AdminMemberController.getAllAdminRoleWithPermission`
   * via `GET /admin-member/getAllAdminRole-with-permission`.
   *
   * **Data Flow:**
   * 1. Parse pagination params.
   * 2. Optionally build a nested search filter on the role's name.
   * 3. Execute `findMany` with deep `include` and `count`.
   * 4. Return hydrated data plus `totalCount`.
   *
   * **Dependencies:** PrismaClient (`adminRole`, `adminRolePermission`,
   * `adminPermission`).
   *
   * **Notes:**
   * - Search filters on a nested `adminRoleDetail.name` field which may differ
   *   from the top-level `adminRoleName` depending on the schema design.
   * - Defaults to page 1 / limit 10.
   *
   * @param {any} page       - 1-based page number.
   * @param {any} limit      - Page size.
   * @param {any} searchTerm - Optional role name filter.
   * @param {any} req        - Express request (currently unused in method body).
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number}>}
   */
  async getAllAdminRoleWithPermission(page: any, limit: any, searchTerm: any, req: any) {
    try {
      const Page = parseInt(page) || 1;
      const pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize;

      let whereCondition: any = {};

      if (searchTerm) {
        whereCondition.adminRoleDetail = {
          name: { 
            contains: searchTerm, 
            mode: "insensitive" 
          },
        };
      }

      const adminRoles = await this.prisma.adminRole.findMany({
        where: whereCondition,
        include: {
          adminRolePermission: {
            include: {
              adminPermissionDetail: true,
            },
          },
        },
        orderBy: { id: "desc" },
        skip,
        take: pageSize,
      });

      const totalAdminRoles = await this.prisma.adminRole.count({ where: whereCondition });

      return {
        status: true,
        message: "Fetched successfully",
        data: adminRoles,
        totalCount: totalAdminRoles,
      };

    } catch (error) {
      return {
        status: false,
        message: "Error in getAllAdminRoleWithPermission",
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method updateAdminRolePermission
   * @async
   * @description Replace the entire permission set for an admin role using a
   * delete-then-insert strategy.
   *
   * **Intent:** Allow super-admins to redefine which permissions a role
   * carries in a single atomic-like operation.
   *
   * **Idea:** First verifies the role exists, then deletes ALL existing
   * `adminRolePermission` rows for the given `adminRoleId`, and finally
   * inserts new rows from the supplied `permissionIdList`.
   *
   * **Usage:** Called by `AdminMemberController.updateAdminRolePermission` via
   * `PATCH /admin-member/update-set-permission`.
   *
   * **Data Flow:**
   * 1. Validate `adminRoleId` and `permissionIdList`.
   * 2. Confirm the admin role exists (`findUnique`).
   * 3. Delete all current junction records (`deleteMany`).
   * 4. Create new junction records from the list (`Promise.all` of `create`).
   * 5. Return success envelope.
   *
   * **Dependencies:** PrismaClient (`adminRole`, `adminRolePermission`).
   *
   * **Notes:**
   * - This is a destructive overwrite; any permissions NOT in the new list are
   *   removed from the role.
   * - The delete + insert steps are not wrapped in a Prisma transaction, so a
   *   failure during insertion could leave the role without permissions.
   *
   * @param {any} payload - `{ adminRoleId: number, permissionIdList: Array<{permissionId: number}> }`.
   * @param {any} req     - Express request (currently unused in method body).
   * @returns {Promise<{status: boolean, message: string}>}
   */
  async updateAdminRolePermission(payload: any, req: any) {
    try {
      const { adminRoleId, permissionIdList } = payload;

      // Validate adminRoleId
      if (!adminRoleId) {
        return { status: false, message: "adminRoleId is required" };
      }

      // Validate permissionIdList
      if (!Array.isArray(permissionIdList) || permissionIdList.length === 0) {
        return { status: false, message: "permissionIdList must be a non-empty array" };
      }

      // Check if admin role exists
      const existingAdminRole = await this.prisma.adminRole.findUnique({
        where: { id: adminRoleId },
      });

      if (!existingAdminRole) {
        return { status: false, message: "Admin role not found" };
      }

      // Delete existing permissions
      await this.prisma.adminRolePermission.deleteMany({
        where: { adminRoleId },
      });

      // Insert new permissions
      await Promise.all(
        permissionIdList.map(async (item) => {
          await this.prisma.adminRolePermission.create({
            data: {
              adminRoleId,
              adminPermissionId: item.permissionId,
              status: "ACTIVE",
            },
          });
        })
      );

      return {
        status: true,
        message: "Permissions updated successfully"
      };

    } catch (error) {
      return {
        status: false,
        message: "Error in updateAdminRolePermission",
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * @method getOneAdminRoleWithPermission
   * @async
   * @description Fetch a single admin role by ID together with all associated
   * permissions eagerly loaded.
   *
   * **Intent:** Provide a detail view for a specific role, typically used when
   * editing the role's permission set.
   *
   * **Idea:** Uses `findUnique` with a deep `include` chain through
   * `adminRolePermission` --> `adminPermissionDetail` to return the role and
   * its full permission tree in one query.
   *
   * **Usage:** Called by `AdminMemberController.getOneAdminRoleWithPermission`
   * via `GET /admin-member/getOneAdminRole-with-permission?adminRoleId=5`.
   *
   * **Data Flow:**
   * 1. Validate `adminRoleId` is present.
   * 2. Query `adminRole` by PK with nested includes.
   * 3. Return the hydrated role or a "not found" message.
   *
   * **Dependencies:** PrismaClient (`adminRole`, `adminRolePermission`,
   * `adminPermission`).
   *
   * **Notes:** `adminRoleId` arrives as a string from the query param and is
   * parsed to an integer via `parseInt`.
   *
   * @param {any} adminRoleId - Primary key of the admin role (string or number).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  async getOneAdminRoleWithPermission(adminRoleId: any) {
    try {
      // Validate adminRoleId
      if (!adminRoleId) {
        return {
          status: false,
          message: "AdminRoleId is required",
        };
      }

      // Fetch admin role with associated permissions
      const adminRole = await this.prisma.adminRole.findUnique({
        where: { id: parseInt(adminRoleId) },
        include: {
          adminRolePermission: {
            include: {
              adminPermissionDetail: true, // Fetch permission details
            },
          },
        },
      });

      // Check if the admin role exists
      if (!adminRole) {
        return {
          status: false,
          message: "Admin Role not found",
        };
      }

      return {
        status: true,
        message: "Fetch Successfully",
        data: adminRole,
      };
    } catch (error) {
      return {
        status: false,
        message: "Error fetching admin role with permissions",
        error: getErrorMessage(error),
      };
    }
  }


  // ──────────────────────────────────────────────
  //  Admin Member methods
  // ──────────────────────────────────────────────

  /**
   * @method create
   * @async
   * @description Create a new admin member (sub-admin) by provisioning a User
   * account, linking it to an admin role, and sending a welcome email.
   *
   * **Intent:** Onboard a new team member into the Ultrasooq admin back-office
   * under the authenticated super-admin's hierarchy.
   *
   * **Idea:** The method performs several sequential steps:
   *   1. Resolve the parent super-admin ID.
   *   2. Verify the email is not already registered.
   *   3. Create a `User` record with `tradeRole = "ADMINMEMBER"` and
   *      `userType = "ADMIN"`, using a hashed password (auto-generated if not
   *      supplied).
   *   4. Generate a zero-padded `uniqueId` and a randomised `userName`, then
   *      update the user record.
   *   5. Dispatch a welcome email containing the plain-text password.
   *   6. Create an `adminMember` junction record linking the user to the
   *      specified admin role.
   *
   * **Usage:** Called by `AdminMemberController.create` via
   * `POST /admin-member/create`.
   *
   * **Data Flow:**
   * Payload --> User table (create + update) --> NotificationService (email) --> AdminMember table (create)
   *
   * **Dependencies:** PrismaClient (`user`, `adminRole`, `adminMember`),
   * HelperService, NotificationService, bcrypt (`genSalt`, `hash`), randomstring.
   *
   * **Notes:**
   * - If `payload.password` is omitted, an 8-character alphanumeric password is
   *   generated automatically and emailed to the new member.
   * - `employeeId` is a random 8-character alphanumeric string.
   * - `uniqueId` is the user's numeric ID zero-padded to at least 7 digits.
   * - The welcome email is fire-and-forget (no `await`).
   *
   * @param {any} payload - `{ email, firstName?, lastName?, cc?, phoneNumber?, password?, adminRoleId, status? }`.
   * @param {any} req     - Express request with `req.user.id`.
   * @returns {Promise<{status: boolean, message: string, data?: any, selectedSuperAdminId?: number}>}
   */
  async create(payload: any, req: any) {
    try {
      if (!payload?.email) {
        return { status: false, message: 'Email is required!' };
      }
      let userId = req?.user?.id;
      userId = await this.helperService.getSuperAdminORSubAdminId(userId);


      const adminRoleId = parseInt(payload.adminRoleId);

      const userExist = await this.prisma.user.findUnique({ where: { email: payload.email } });
      if (userExist) {
        return { 
          status: false, 
          message: 'Email already exists', 
          data: [] 
        };
      }

      const adminRoleDetail = await this.prisma.adminRole.findUnique({ where: { id: adminRoleId } });

      const salt = await genSalt(10);
      const password = payload?.password || randomstring.generate({ length: 8, charset: 'alphanumeric' });
      const employeeId = randomstring.generate({ length: 8, charset: 'alphanumeric' });
      const hashedPassword = await hash(password, salt);
      
      let newUser = await this.prisma.user.create({
        data: {
          firstName: payload?.firstName || null,
          lastName: payload?.lastName || null,
          email: payload.email,
          password: hashedPassword,
          tradeRole: "ADMINMEMBER",
          cc: payload?.cc || null,
          phoneNumber: payload?.phoneNumber || null,
          userType: 'ADMIN',
          status: 'ACTIVE',
          // userRoleName: userRoleDetail?.userRoleName,
          // userRoleId: userRoleID,
          employeeId,
          addedBy: userId,
          adminRoleId: adminRoleId
        }
      });

      let idString = newUser.id.toString();
      let requestId;

      if (idString.length >= 7) {
        requestId = idString;
      } else {
        // Pad with zeros to make it an 8-digit number
        requestId = "0".repeat(7 - idString.length) + idString;
      }

      const username = (payload?.firstName || 'Sub-Admin') + randomstring.generate({ length: 8, charset: 'alphanumeric' });
      await this.prisma.user.update({
        where: { id: newUser.id },
        data: { 
          uniqueId: requestId, 
          userName: username 
        }
      });

      let data = {
        email: payload.email,
        name: payload?.firstName || 'Admin',
        password: password
      }
      this.notificationService.addMemberMail(data);

      let newAdminMember = await this.prisma.adminMember.create({
        data: {
          userId: newUser.id,
          adminRoleId: adminRoleId,
          addedBy: userId,
          status: payload?.status || 'ACTIVE'
        }
      });

      return { 
        status: true, 
        message: 'Admin member created successfully', 
        data: newAdminMember,
        selectedSuperAdminId: userId
      };
    } catch (error) {
      return { 
        status: false, 
        message: 'Error creating admin member', 
        error: getErrorMessage(error) 
      };
    }
  }

  /**
   * @method getAll
   * @async
   * @description Retrieve a paginated list of all admin members created by the
   * authenticated super-admin, with user and role details eagerly loaded.
   *
   * **Intent:** Provide a team-management overview for the admin dashboard.
   *
   * **Idea:** Queries the `adminMember` table filtered by `addedBy` (the
   * resolved super-admin ID) and includes the related `userDetail` and
   * `adminRolDetail` records for each member.
   *
   * **Usage:** Called by `AdminMemberController.getAll` via
   * `GET /admin-member/get-all`.
   *
   * **Data Flow:**
   * 1. Resolve effective admin ID.
   * 2. Parse pagination params (defaults: page 1, limit 10 000).
   * 3. Execute `findMany` with `include` and `count`.
   * 4. Return data array and `totalCount`.
   *
   * **Dependencies:** PrismaClient (`adminMember`, related `user` and
   * `adminRole`), HelperService.
   *
   * **Notes:**
   * - The default limit of 10 000 effectively returns all records when no
   *   explicit limit is provided.
   * - `totalCount` is computed with an additional `status: 'ACTIVE'` filter,
   *   so it may differ from the length of `data` which includes all statuses.
   *
   * @param {any} page  - 1-based page number.
   * @param {any} limit - Page size.
   * @param {any} req   - Express request with `req.user.id`.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number, selectedSuperAdminId?: number}>}
   */
  async getAll(page: any, limit: any, req: any) {
    try {
      let userId = req?.user?.id;
      userId = await this.helperService.getSuperAdminORSubAdminId(userId);

      const Page = parseInt(page) || 1;
      const pageSize = parseInt(limit) || 10000;
      const skip = (Page - 1) * pageSize;
      
      const adminMembers = await this.prisma.adminMember.findMany({
        where: { addedBy: userId },
        orderBy: { id: 'desc' },
        skip,
        take: pageSize,
        include: { 
          userDetail: true, 
          adminRolDetail: true 
        },
      });
      
      const totalCount = await this.prisma.adminMember.count({ 
        where: { 
          addedBy: userId, 
          status: 'ACTIVE' 
        } 
      });
      
      return { 
        status: true, 
        message: 'Fetched successfully', 
        data: adminMembers, 
        totalCount ,
        selectedSuperAdminId: userId
      };
    } catch (error) {
      return { 
        status: false, 
        message: 'Error fetching admin members', 
        error: getErrorMessage(error) 
      };
    }
  }

  /**
   * @method getOne
   * @async
   * @description Retrieve a single admin member by primary key, including
   * related user profile and role details.
   *
   * **Intent:** Provide a detail view for viewing or editing one team member.
   *
   * **Idea:** Simple lookup by `id` on the `adminMember` table with eager
   * loading of `userDetail` and `adminRolDetail`.
   *
   * **Usage:** Called by `AdminMemberController.getOne` via
   * `GET /admin-member/get-one?adminMemberId=12`.
   *
   * **Data Flow:**
   * 1. Validate `adminMemberId` is present.
   * 2. Execute `findUnique` with includes.
   * 3. Return the record or a "not found" message.
   *
   * **Dependencies:** PrismaClient (`adminMember`, related `user`, `adminRole`).
   *
   * **Notes:**
   * - `adminMemberId` is parsed from string to integer via `parseInt`.
   * - Returns `{ status: false }` rather than throwing when the record is missing.
   *
   * @param {any} adminMemberId - Primary key of the `adminMember` record.
   * @param {any} req           - Express request (currently unused in method body).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  async getOne(adminMemberId: any, req: any) {
    try {
      if (!adminMemberId) return { status: false, message: 'Admin member ID is required' };
      
      const adminMember = await this.prisma.adminMember.findUnique({
        where: { id: parseInt(adminMemberId) },
        include: { 
          userDetail: true, 
          adminRolDetail: true 
        },
      });
      
      if (!adminMember) return { status: false, message: 'Admin member not found' };

      return { 
        status: true, 
        message: 'Fetched successfully', 
        data: adminMember 
      };
    } catch (error) {
      return { 
        status: false, 
        message: 'Error fetching admin member', 
        error: getErrorMessage(error) 
      };
    }
  }

  /**
   * @method update
   * @async
   * @description Update an existing admin member's role assignment, status,
   * and/or linked user profile fields.
   *
   * **Intent:** Let super-admins adjust a team member's configuration without
   * deleting and recreating the account.
   *
   * **Idea:** The method performs a two-phase update:
   *   1. Patch the `adminMember` record (role ID, status, `updatedAt`).
   *   2. If profile-related fields (`firstName`, `lastName`, `cc`,
   *      `phoneNumber`) are present in the payload, also update the linked
   *      `User` record.
   *
   * **Usage:** Called by `AdminMemberController.update` via
   * `PATCH /admin-member/update`.
   *
   * **Data Flow:**
   * 1. Validate `adminMemberId` in the payload.
   * 2. Verify the member exists (`findUnique`).
   * 3. Build a dynamic `updateData` object from optional fields.
   * 4. Update `adminMember` record.
   * 5. Conditionally update the related `User` record.
   * 6. Return the updated `adminMember` record.
   *
   * **Dependencies:** PrismaClient (`adminMember`, `user`).
   *
   * **Notes:**
   * - Only non-falsy fields in the payload are applied; omitted fields are
   *   left unchanged.
   * - `updatedAt` is explicitly set to `new Date()` on the admin member record.
   * - The user update is only triggered when at least one profile field is
   *   present in the payload.
   *
   * @param {any} payload - `{ adminMemberId, adminRoleId?, status?, firstName?, lastName?, cc?, phoneNumber? }`.
   * @param {any} req     - Express request (currently unused in method body).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  async update(payload: any, req: any) {
    try {
      if (!payload.adminMemberId) return { status: false, message: 'Admin member ID is required' };
      
      const existingAdminMember = await this.prisma.adminMember.findUnique({ 
        where: { 
          id: parseInt(payload.adminMemberId)
        }
      });

      if (!existingAdminMember) return { status: false, message: 'Admin member not found' };

      let updateData: any = {};
      if (payload.adminRoleId) updateData.adminRoleId = payload.adminRoleId;
      if (payload.status) updateData.status = payload.status;

      const updatedAdminMember = await this.prisma.adminMember.update({
        where: { 
          id: parseInt(payload.adminMemberId) 
        },
        data: { 
          ...updateData, 
          updatedAt: new Date() 
        },
      });
      
      if (payload.firstName || payload.lastName || payload.cc || payload.phoneNumber) {
        await this.prisma.user.update({
          where: { id: existingAdminMember.userId },
          data: {
            firstName: payload.firstName,
            lastName: payload.lastName,
            cc: payload.cc,
            phoneNumber: payload.phoneNumber,
          }
        });
      }
      
      return { 
        status: true, 
        message: 'Updated successfully', 
        data: updatedAdminMember
      };
      
    } catch (error) {
      return { 
        status: false, 
        message: 'Error updating admin member', 
        error: getErrorMessage(error) 
      };
    }
  }


}