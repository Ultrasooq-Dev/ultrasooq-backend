/**
 * @file policy.controller.ts
 *
 * @intent
 *   REST controller that exposes all HTTP endpoints under the /policy route
 *   prefix for managing platform policies (return policy, shipping policy,
 *   tax rules, etc.).
 *
 * @idea
 *   Split endpoints into two groups:
 *     1. Admin-only (create, update, delete) -- protected by SuperAdminAuthGuard.
 *     2. Public    (getAllPolicy, getAllMainPolicy, getOnePolicy) -- no guard.
 *   The controller is intentionally thin; all business logic lives in
 *   PolicyService.
 *
 * @usage
 *   Registered automatically via PolicyModule.  Endpoints:
 *     POST   /policy/createPolicy          (admin)
 *     PATCH  /policy/updatePolicy          (admin)
 *     DELETE /policy/deletePolicy/:policyId (admin)
 *     GET    /policy/getAllPolicy           (public, paginated)
 *     GET    /policy/getAllMainPolicy       (public, no pagination)
 *     GET    /policy/getOnePolicy?policyId= (public)
 *
 * @dataflow
 *   HTTP request -> NestJS router -> PolicyController method -> PolicyService
 *
 * @depends
 *   - SuperAdminAuthGuard : restricts mutation endpoints to super-admin users
 *   - PolicyService       : contains all database / business logic
 *
 * @notes
 *   - The @Request() parameter is injected on guarded routes so the guard can
 *     attach the authenticated user, but it is not forwarded to the service
 *     for create / update / delete -- the payload already carries what is needed.
 *   - Query parameters for getAllPolicy arrive as strings and are parsed to
 *     numbers inside PolicyService.
 */
import { Body, Controller, Post, UseGuards, Request, Get, Patch, Delete, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SuperAdminAuthGuard } from 'src/guards/SuperAdminAuthGuard';
import { PolicyService } from './policy.service';

@ApiTags('policies')
@ApiBearerAuth('JWT-auth')
@Controller('policy')
export class PolicyController {
    constructor(private readonly policyService: PolicyService) {}

    /**
     * @intent
     *   Create a new policy (parent + child) or a sub-policy under an existing parent.
     *
     * @idea
     *   If `payload.categoryName` is provided, the service creates a new root
     *   policy and immediately nests a child under it.
     *   If `payload.parentId` is provided instead, only a child is created under
     *   the specified parent.
     *
     * @usage
     *   POST /policy/createPolicy
     *   Body: { ruleName, rule, categoryName } | { ruleName, rule, parentId }
     *
     * @dataflow
     *   Client -> SuperAdminAuthGuard -> createPolicy -> PolicyService.createPolicy -> Prisma
     *
     * @depends
     *   - SuperAdminAuthGuard : ensures only super-admins can create policies
     *   - PolicyService.createPolicy
     *
     * @notes
     *   - The `rule` field is expected to be a JSON-stringified Plate/Slate
     *     editor rich-text structure.
     */
    @UseGuards(SuperAdminAuthGuard)
    @Post('/createPolicy')
    createPolicy(@Body() payload: any, @Request() req) {
        return this.policyService.createPolicy(payload);
    }

    /**
     * @intent
     *   Update an existing policy's ruleName, rule content, or categoryName.
     *
     * @idea
     *   Accepts the target policyId inside the body together with the fields
     *   to update, then delegates to the service for a Prisma update call.
     *
     * @usage
     *   PATCH /policy/updatePolicy
     *   Body: { policyId, ruleName?, rule?, categoryName? }
     *
     * @dataflow
     *   Client -> SuperAdminAuthGuard -> updatePolicy -> PolicyService.updatePolicy -> Prisma
     *
     * @depends
     *   - SuperAdminAuthGuard : ensures only super-admins can update policies
     *   - PolicyService.updatePolicy
     *
     * @notes
     *   - Partial updates are allowed; only the fields present in the payload
     *     are written to the database.
     */
    @UseGuards(SuperAdminAuthGuard)
    @Patch('/updatePolicy')
    updatePolicy(@Body() payload: any, @Request() req) {
        return this.policyService.updatePolicy(payload);
    }

    /**
     * @intent
     *   Retrieve a paginated, searchable list of root-level policies with
     *   their active children included.
     *
     * @idea
     *   A public endpoint that supports server-side pagination, sort order,
     *   and case-insensitive search by categoryName.  Only root policies
     *   (parentId === null) are returned; child policies appear nested inside
     *   the `children` relation.
     *
     * @usage
     *   GET /policy/getAllPolicy?page=1&limit=20&sort=desc&searchTerm=tax
     *
     * @dataflow
     *   Client -> getAllPolicy -> PolicyService.getAllPolicy -> Prisma (findMany + count)
     *
     * @depends
     *   - PolicyService.getAllPolicy
     *
     * @notes
     *   - No auth guard; this endpoint is publicly accessible.
     *   - If `limit` is omitted, the service defaults to 10 000 000 (effectively
     *     returns everything).
     *   - The `searchTerm` is only applied when its length is > 2 characters.
     *   - The response `message` field reads "Created Successfully" -- this is
     *     a known copy-paste artefact from the create endpoint.
     */
    @Get('/getAllPolicy')
    getAllPolicy(@Request() req, @Query('page') page: number, @Query('limit') limit: number, @Query('sort') sort: string, @Query('searchTerm') searchTerm: string) {
        return this.policyService.getAllPolicy(req, page, limit, sort, searchTerm);
    }

    /**
     * @intent
     *   Return every root-level (main) policy without pagination.
     *
     * @idea
     *   Useful for dropdowns or navigation menus that need the full list of
     *   top-level policy categories.  No children are included in the response.
     *
     * @usage
     *   GET /policy/getAllMainPolicy
     *
     * @dataflow
     *   Client -> getAllMainPolicy -> PolicyService.getAllMainPolicy -> Prisma (findMany)
     *
     * @depends
     *   - PolicyService.getAllMainPolicy
     *
     * @notes
     *   - No auth guard; publicly accessible.
     *   - Only ACTIVE root policies (parentId === null) are returned.
     */
    @Get('/getAllMainPolicy')
    getAllMainPolicy() {
        return this.policyService.getAllMainPolicy();
    }

    /**
     * @intent
     *   Fetch a single policy by its ID, including its active children.
     *
     * @idea
     *   Used on detail / edit pages to display one policy and all its
     *   sub-policies.
     *
     * @usage
     *   GET /policy/getOnePolicy?policyId=42
     *
     * @dataflow
     *   Client -> getOnePolicy -> PolicyService.getOnePolicy -> Prisma (findUnique)
     *
     * @depends
     *   - PolicyService.getOnePolicy
     *
     * @notes
     *   - No auth guard; publicly accessible.
     *   - policyId arrives as a string from the query and is parsed to int
     *     inside the service.
     */
    @Get('/getOnePolicy')
    getOnePolicy(@Query('policyId') policyId: number,) {
        return this.policyService.getOnePolicy(policyId);
    }

    /**
     * @intent
     *   Soft-delete a policy by marking it as deleted rather than removing
     *   the database row.
     *
     * @idea
     *   Sets `status` to "DELETE" and `deletedAt` to the current timestamp.
     *   The record remains in the database for audit or recovery purposes.
     *
     * @usage
     *   DELETE /policy/deletePolicy/42
     *
     * @dataflow
     *   Client -> SuperAdminAuthGuard -> deletePolicy -> PolicyService.deletePolicy -> Prisma (update)
     *
     * @depends
     *   - SuperAdminAuthGuard : ensures only super-admins can delete policies
     *   - PolicyService.deletePolicy
     *
     * @notes
     *   - This does NOT cascade to children; child policies remain active
     *     unless deleted individually.
     */
    @UseGuards(SuperAdminAuthGuard)
    @Delete('/deletePolicy/:policyId')
    deletePolicy(@Param('policyId') policyId: number, @Request() req) {
        return this.policyService.deletePolicy(policyId);
    }
}
