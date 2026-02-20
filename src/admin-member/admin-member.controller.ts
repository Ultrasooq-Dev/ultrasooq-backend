/**
 * @file admin-member.controller.ts
 * @module AdminMemberController
 *
 * @description
 * REST controller for the Admin Member domain of the Ultrasooq marketplace.
 * Exposes HTTP endpoints grouped into three logical areas:
 *
 *   1. **Admin Roles**       -- CRUD for named admin roles.
 *   2. **Admin Permissions**  -- CRUD for granular permission definitions and
 *                               role-permission mapping.
 *   3. **Admin Members**      -- CRUD for sub-admin / team-member user accounts.
 *
 * Every endpoint is protected by {@link SuperAdminAuthGuard}, which validates a
 * JWT bearer token and ensures the caller holds super-admin (or delegated
 * sub-admin) privileges.
 *
 * **Intent:**
 * Serve as the thin HTTP boundary layer that validates the incoming request
 * shape via NestJS decorators and immediately delegates to
 * {@link AdminMemberService} for business logic.
 *
 * **Idea:**
 * Keep the controller free of business rules; it only unpacks HTTP artifacts
 * (body, query params, request object) and forwards them to the service layer.
 *
 * **Usage:**
 * Registered under the route prefix `/admin-member`.  All calls require a valid
 * super-admin JWT in the `Authorization` header.
 *
 * **Data Flow:**
 * Client --> SuperAdminAuthGuard --> Controller method --> AdminMemberService --> Prisma / DB
 *
 * **Dependencies:**
 * - {@link AdminMemberService} -- injected via constructor DI
 * - {@link SuperAdminAuthGuard} -- applied via `@UseGuards` on every route
 *
 * **Notes:**
 * - `@Request() req` is passed through to the service so it can resolve the
 *   authenticated admin's identity via `req.user`.
 * - `AuthGuard` is imported but not used directly in this controller; the
 *   import is retained for potential future use or shared-guard scenarios.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/AuthGuard';
import { SuperAdminAuthGuard } from 'src/guards/SuperAdminAuthGuard';
import { AdminMemberService } from './admin-member.service';

/**
 * @class AdminMemberController
 * @description
 * Handles all `/admin-member/*` HTTP routes.  Delegates every operation to
 * {@link AdminMemberService} and returns the service's standard
 * `{ status, message, data }` response envelope unchanged.
 */
@ApiTags('admin-members')
@ApiBearerAuth('JWT-auth')
@Controller('admin-member')
export class AdminMemberController {

  /**
   * @constructor
   * @description Injects the AdminMemberService singleton provided by the AdminMemberModule.
   * @param {AdminMemberService} adminMemberService - Service containing all admin-member business logic.
   */
  constructor(
    private readonly adminMemberService: AdminMemberService,
  ) { }

  // ──────────────────────────────────────────────
  //  Admin Role endpoints
  // ──────────────────────────────────────────────

  /**
   * @method createAdminRole
   * @description Create a new admin role (e.g. "Editor", "Moderator").
   *
   * **Intent:** Allow super-admins to define named roles that can later be
   * assigned permissions and attached to admin members.
   *
   * **Idea:** Accepts a role name in the body; duplicates are detected by the
   * service and returned as-is rather than throwing an error.
   *
   * **Usage:** `POST /admin-member/role/create`
   * Body: `{ adminRoleName: string }`
   *
   * **Data Flow:** Body payload + authenticated request --> AdminMemberService.createAdminRole
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminMemberService
   *
   * **Notes:** Returns the existing record if the role name already exists.
   *
   * @param {any} req   - Express request object enriched with `req.user` by the guard.
   * @param {any} payload - Request body containing `adminRoleName`.
   * @returns {Promise<{status: boolean, message: string, data?: any}>} Standard response envelope.
   */
  @UseGuards(SuperAdminAuthGuard)
  @Post('/role/create')
  createAdminRole(@Request() req, @Body() payload: any) {
    return this.adminMemberService.createAdminRole(payload, req);
  }

  /**
   * @method getAllAdminRole
   * @description Retrieve a paginated, optionally filtered list of admin roles.
   *
   * **Intent:** Let super-admins browse all roles they have created.
   *
   * **Idea:** Supports cursor-free offset pagination (`page` / `limit`) and an
   * optional case-insensitive `searchTerm` filter on the role name.
   *
   * **Usage:** `GET /admin-member/role/get-all?page=1&limit=10&searchTerm=editor`
   *
   * **Data Flow:** Query params + request --> AdminMemberService.getAllAdminRole
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminMemberService
   *
   * **Notes:** Defaults to page 1, limit 10 when parameters are omitted.
   *
   * @param {number} page       - 1-based page index.
   * @param {number} limit      - Number of records per page.
   * @param {number} searchTerm - Search string applied to `adminRoleName` (typed as number in decorator but used as string).
   * @param {any}    req        - Express request with authenticated user.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/role/get-all')
  getAllAdminRole(@Query('page') page: number, @Query('limit') limit: number, @Query('searchTerm') searchTerm: number, @Request() req) {
    return this.adminMemberService.getAllAdminRole(page, limit, searchTerm, req);
  }

  /**
   * @method updateAdminRole
   * @description Update the name of an existing admin role.
   *
   * **Intent:** Allow super-admins to rename roles without recreating them.
   *
   * **Idea:** Reads `adminRoleId` and `adminRoleName` from the request body
   * and patches the corresponding database record.
   *
   * **Usage:** `PATCH /admin-member/role/update`
   * Body: `{ adminRoleId: number, adminRoleName: string }`
   *
   * **Data Flow:** Full request object --> AdminMemberService.updateAdminRole
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminMemberService
   *
   * **Notes:** The entire `req` object is forwarded because the service reads
   * fields from `req.body` directly.
   *
   * @param {any} req - Express request containing body with role update fields.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Patch('/role/update')
  updateAdminRole(@Request() req) {
    return this.adminMemberService.updateAdminRole(req);
  }

  /**
   * @method deleteAdminRole
   * @description Soft-delete an admin role by setting its status to "DELETE".
   *
   * **Intent:** Remove a role from active use while preserving audit history.
   *
   * **Idea:** Before deletion the service checks that no admin members are
   * currently assigned to the role; if any exist, deletion is refused.
   *
   * **Usage:** `DELETE /admin-member/role/delete?id=<roleId>`
   *
   * **Data Flow:** Full request (query param `id`) --> AdminMemberService.deleteAdminRole
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminMemberService
   *
   * **Notes:** This is a soft delete; the record remains in the database with
   * `status = "DELETE"`.
   *
   * @param {any} req - Express request whose `req.query.id` carries the role ID.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Delete('/role/delete')
  deleteAdminRole(@Request() req) {
    return this.adminMemberService.deleteAdminRole(req);
  }

  // ──────────────────────────────────────────────
  //  Admin Permission endpoints
  // ──────────────────────────────────────────────

  /**
   * @method createAdminPermission
   * @description Create a new granular admin permission definition.
   *
   * **Intent:** Define a named permission (e.g. "manage_users", "view_reports")
   * that can later be linked to one or more admin roles.
   *
   * **Idea:** Idempotent -- if the permission already exists it is returned
   * without creating a duplicate.
   *
   * **Usage:** `POST /admin-member/permission/create`
   * Body: `{ name: string }`
   *
   * **Data Flow:** Body payload + request --> AdminMemberService.createAdminPermission
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminMemberService
   *
   * **Notes:** The `addedBy` field is populated from the resolved super-admin ID.
   *
   * @param {any} req     - Authenticated Express request.
   * @param {any} payload - Request body with `name` field.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Post('/permission/create')
  createAdminPermission(@Request() req, @Body() payload: any) {
    return this.adminMemberService.createAdminPermission(payload, req);
  }

  /**
   * @method getAllAdminPermission
   * @description Retrieve a paginated, optionally filtered list of admin permissions.
   *
   * **Intent:** Let super-admins see all permission definitions they own.
   *
   * **Idea:** Same pagination / search pattern as `getAllAdminRole`.
   *
   * **Usage:** `GET /admin-member/permission/get-all?page=1&limit=10&searchTerm=manage`
   *
   * **Data Flow:** Query params + request --> AdminMemberService.getAllAdminPermission
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminMemberService
   *
   * **Notes:** Only permissions with status ACTIVE or INACTIVE are returned.
   *
   * @param {number} page       - 1-based page index.
   * @param {number} limit      - Records per page.
   * @param {number} searchTerm - Optional name filter.
   * @param {any}    req        - Authenticated request.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/permission/get-all')
  getAllAdminPermission(@Query('page') page: number, @Query('limit') limit: number, @Query('searchTerm') searchTerm: number, @Request() req) {
    return this.adminMemberService.getAllAdminPermission(page, limit, searchTerm, req);
  }

  // ──────────────────────────────────────────────
  //  Admin Role-Permission mapping endpoints
  // ──────────────────────────────────────────────

  /**
   * @method setAdminRolePermission
   * @description Assign a list of permissions to an admin role (initial assignment).
   *
   * **Intent:** Establish the permission set for a newly created role.
   *
   * **Idea:** Receives a role ID and an array of permission IDs; creates one
   * `adminRolePermission` junction record per permission.
   *
   * **Usage:** `POST /admin-member/set-permission`
   * Body: `{ adminRoleId: number, permissionIdList: [{ permissionId: number }, ...] }`
   *
   * **Data Flow:** Body payload + request --> AdminMemberService.setAdminRolePermission
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminMemberService
   *
   * **Notes:** Does NOT delete pre-existing mappings; for a full replacement use
   * the `updateAdminRolePermission` endpoint instead.
   *
   * @param {any} payload - Body with `adminRoleId` and `permissionIdList`.
   * @param {any} req     - Authenticated request.
   * @returns {Promise<{status: boolean, message: string, data?: any[]}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Post('/set-permission')
  setAdminRolePermission(@Body() payload: any, @Request() req) {
    return this.adminMemberService.setAdminRolePermission(payload, req);
  }

  /**
   * @method updateAdminRolePermission
   * @description Replace the entire permission set for an existing admin role.
   *
   * **Intent:** Allow super-admins to redefine which permissions a role carries.
   *
   * **Idea:** Deletes all current role-permission mappings for the given role,
   * then inserts the new list -- effectively a "set-replace" operation.
   *
   * **Usage:** `PATCH /admin-member/update-set-permission`
   * Body: `{ adminRoleId: number, permissionIdList: [{ permissionId: number }, ...] }`
   *
   * **Data Flow:** Body payload + request --> AdminMemberService.updateAdminRolePermission
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminMemberService
   *
   * **Notes:** This is a destructive overwrite; any permissions not in the new
   * list are removed from the role.
   *
   * @param {any} payload - Body with `adminRoleId` and `permissionIdList`.
   * @param {any} req     - Authenticated request.
   * @returns {Promise<{status: boolean, message: string}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Patch('/update-set-permission')
  updateAdminRolePermission(@Body() payload: any, @Request() req) {
    return this.adminMemberService.updateAdminRolePermission(payload, req);
  }

  /**
   * @method getAllAdminRoleWithPermission
   * @description Retrieve all admin roles with their associated permissions eagerly loaded.
   *
   * **Intent:** Provide a consolidated view of which permissions belong to each role.
   *
   * **Idea:** Uses Prisma `include` to join `adminRolePermission` and nested
   * `adminPermissionDetail` in a single query, paginated and searchable.
   *
   * **Usage:** `GET /admin-member/getAllAdminRole-with-permission?page=1&limit=10&searchTerm=editor`
   *
   * **Data Flow:** Query params + request --> AdminMemberService.getAllAdminRoleWithPermission
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminMemberService
   *
   * **Notes:** Search term filters on role name via nested relation condition.
   *
   * @param {any} page       - 1-based page index.
   * @param {any} limit      - Records per page.
   * @param {any} searchTerm - Optional filter on role name.
   * @param {any} req        - Authenticated request.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/getAllAdminRole-with-permission')
  getAllAdminRoleWithPermission(@Query('page') page: any, @Query('limit') limit: any, @Query('searchTerm') searchTerm: any, @Request() req) {
    return this.adminMemberService.getAllAdminRoleWithPermission(page, limit, searchTerm, req);
  }

  /**
   * @method getOneAdminRoleWithPermission
   * @description Fetch a single admin role together with all its associated permissions.
   *
   * **Intent:** Provide detail view for editing a specific role's permissions.
   *
   * **Idea:** Looks up the role by primary key and eagerly loads its
   * permission mappings via Prisma `include`.
   *
   * **Usage:** `GET /admin-member/getOneAdminRole-with-permission?adminRoleId=5`
   *
   * **Data Flow:** Query param `adminRoleId` --> AdminMemberService.getOneAdminRoleWithPermission
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminMemberService
   *
   * **Notes:** The `req` parameter is accepted by the controller but not
   * forwarded to the service; the service only needs the role ID.
   *
   * @param {any} adminRoleId - Primary key of the admin role.
   * @param {any} req         - Authenticated request (unused by the service).
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/getOneAdminRole-with-permission')
  getOneAdminRoleWithPermission(@Query('adminRoleId') adminRoleId: any, @Request() req) {
    return this.adminMemberService.getOneAdminRoleWithPermission(adminRoleId);
  }

  // ──────────────────────────────────────────────
  //  Admin Member endpoints
  // ──────────────────────────────────────────────

  /**
   * @method create
   * @description Create a new admin member (sub-admin user account).
   *
   * **Intent:** Allow the super-admin to onboard team members who can manage
   * portions of the Ultrasooq back-office.
   *
   * **Idea:** Creates a new `User` record with `tradeRole = "ADMINMEMBER"` and
   * `userType = "ADMIN"`, generates or uses a supplied password, hashes it,
   * links the user to an admin role, sends a welcome email, and finally creates
   * the `adminMember` junction record.
   *
   * **Usage:** `POST /admin-member/create`
   * Body: `{ email, firstName?, lastName?, cc?, phoneNumber?, password?, adminRoleId, status? }`
   *
   * **Data Flow:** Body + request --> AdminMemberService.create --> User table + AdminMember table + NotificationService
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminMemberService
   *
   * **Notes:** If no password is provided, an 8-char alphanumeric string is
   * auto-generated and emailed to the new member.
   *
   * @param {any} payload - New admin member fields.
   * @param {any} req     - Authenticated request.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Post('/create')
  create(@Body() payload: any, @Request() req) {
    return this.adminMemberService.create(payload, req);
  }

  /**
   * @method getAll
   * @description List all admin members belonging to the authenticated super-admin.
   *
   * **Intent:** Provide an overview of the admin team for management purposes.
   *
   * **Idea:** Returns paginated admin member records with eagerly loaded
   * `userDetail` and `adminRolDetail` relations.
   *
   * **Usage:** `GET /admin-member/get-all?page=1&limit=20`
   *
   * **Data Flow:** Query params + request --> AdminMemberService.getAll
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminMemberService
   *
   * **Notes:** The default limit is 10 000 when not specified, effectively
   * returning all records unless pagination is explicitly requested.
   *
   * @param {any} page  - 1-based page index.
   * @param {any} limit - Records per page.
   * @param {any} req   - Authenticated request.
   * @returns {Promise<{status: boolean, message: string, data?: any[], totalCount?: number}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/get-all')
  getAll(@Query('page') page: any, @Query('limit') limit: any, @Request() req) {
    return this.adminMemberService.getAll(page, limit, req);
  }

  /**
   * @method getOne
   * @description Retrieve a single admin member by their `adminMember` primary key.
   *
   * **Intent:** Provide detail view for viewing or editing one team member.
   *
   * **Idea:** Looks up the record including `userDetail` and `adminRolDetail`.
   *
   * **Usage:** `GET /admin-member/get-one?adminMemberId=12`
   *
   * **Data Flow:** Query param + request --> AdminMemberService.getOne
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminMemberService
   *
   * **Notes:** Returns a 200 with `status: false` if the ID is missing or the
   * record is not found (no HTTP error thrown).
   *
   * @param {any} adminMemberId - Primary key of the adminMember record.
   * @param {any} req           - Authenticated request.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/get-one')
  getOne(@Query('adminMemberId') adminMemberId: any, @Request() req) {
    return this.adminMemberService.getOne(adminMemberId, req);
  }

  /**
   * @method update
   * @description Update an existing admin member's role, status, or profile fields.
   *
   * **Intent:** Let super-admins adjust a team member's role assignment,
   * activation status, or personal information without re-creating the account.
   *
   * **Idea:** Patches the `adminMember` record and, if profile fields are
   * present, also updates the linked `User` record.
   *
   * **Usage:** `PATCH /admin-member/update`
   * Body: `{ adminMemberId, adminRoleId?, status?, firstName?, lastName?, cc?, phoneNumber? }`
   *
   * **Data Flow:** Body + request --> AdminMemberService.update --> AdminMember + User tables
   *
   * **Dependencies:** SuperAdminAuthGuard, AdminMemberService
   *
   * **Notes:** Only the fields present in the payload are updated; omitted
   * fields remain unchanged.
   *
   * @param {any} payload - Fields to update (must include `adminMemberId`).
   * @param {any} req     - Authenticated request.
   * @returns {Promise<{status: boolean, message: string, data?: any}>}
   */
  @UseGuards(SuperAdminAuthGuard)
  @Patch('/update')
  update(@Body() payload: any, @Request() req) {
    return this.adminMemberService.update(payload, req);
  }


}
