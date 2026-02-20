/**
 * @file fees.controller.ts
 *
 * @intent
 *   REST controller that exposes all HTTP endpoints for managing platform
 *   fee configurations (CRUD for fees, fee details, locations, and
 *   category-to-fee associations).
 *
 * @idea
 *   Thin routing layer -- every handler immediately delegates to
 *   FeesService.  Mutation endpoints are protected by SuperAdminAuthGuard;
 *   read endpoints (getAllFees, getOneFees) are public.
 *
 * @usage
 *   Base path: /fees
 *   All mutation routes require a valid super-admin bearer token.
 *   Public routes: GET /fees/getAllFees, GET /fees/getOneFees
 *
 * @dataflow
 *   HTTP Request --> NestJS Router --> FeesController --> FeesService --> Prisma --> DB
 *
 * @depends
 *   - FeesService          -- business logic for every operation
 *   - SuperAdminAuthGuard  -- JWT guard restricting mutations to super-admins
 *
 * @notes
 *   - Several endpoints (deleteLocationFees, deleteLocationByType) are
 *     retained but marked "not in use" -- they belong to a previous
 *     location-hierarchy approach (FeesCountry/FeesState/FeesCity/FeesTown).
 *   - The commented-out getAllFeesCountry endpoint is likewise legacy.
 */
import { Body, Controller, Post, UseGuards, Request, Get, Patch, Delete, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SuperAdminAuthGuard } from 'src/guards/SuperAdminAuthGuard';
import { FeesService } from './fees.service';

@ApiTags('fees')
@ApiBearerAuth('JWT-auth')
@Controller('fees')
export class FeesController {
    constructor(private readonly feesService: FeesService) {}

    /**
     * @intent
     *   Create a new platform fee configuration with nested vendor/consumer
     *   detail pairs and optional location records.
     *
     * @idea
     *   A single POST creates the entire fee tree: main Fees record, one or
     *   more FeesDetail pairs (vendor + consumer), optional FeesLocation
     *   records, and the FeesToFeesDetail junction rows that tie them together.
     *
     * @usage
     *   POST /fees/createFees  (Super-admin only)
     *   Body: { feeName, feeDescription, policy, feeType, menuId, feesDetails[] }
     *
     * @dataflow
     *   payload --> FeesService.createFees --> Prisma (fees, feesDetail,
     *              feesLocation, feesToFeesDetail)
     *
     * @depends  FeesService.createFees
     *
     * @notes
     *   - menuId must be unique across all fees; duplicate check is in the service.
     *   - feesDetails is an array of { vendorDetails, customerDetails } objects.
     */
    @UseGuards(SuperAdminAuthGuard)
    @Post('/createFees')
    createFees(@Body() payload: any, @Request() req) {
        return this.feesService.createFees(payload);
    }

    /**
     * @intent
     *   Update an existing fee and all of its nested vendor/consumer details
     *   and location records in a single request.
     *
     * @idea
     *   Mirrors the create shape: the caller sends the full fee tree and
     *   the service overwrites every field, including child detail/location
     *   rows identified by their IDs.
     *
     * @usage
     *   PATCH /fees/updateFees  (Super-admin only)
     *   Body: { feeId, feeName, feeDescription, policy, feeType, menuId, feesDetails[] }
     *
     * @dataflow
     *   payload --> FeesService.updateFees --> Prisma (fees.update,
     *              feesDetail.update, feesLocation.update)
     *
     * @depends  FeesService.updateFees
     *
     * @notes
     *   - feeId is mandatory; each detail must carry its existing
     *     vendorFeesDetailId / consumerFeesDetailId so the service
     *     knows which rows to update.
     */
    @UseGuards(SuperAdminAuthGuard)
    @Patch('/updateFees')
    updateFees(@Body() payload: any, @Request() req) {
        return this.feesService.updateFees(payload);
    }

    /**
     * @intent
     *   Partially update a single FeesDetail record (vendor or consumer
     *   fields) without touching the parent Fees row.
     *
     * @idea
     *   Fine-grained update for one detail row; only provided fields
     *   are overwritten (undefined values are skipped by Prisma).
     *
     * @usage
     *   PATCH /fees/updateFeesDetail  (Super-admin only)
     *   Body: { feesDetailId, vendorDetails?, customerDetails? }
     *
     * @dataflow
     *   payload --> FeesService.updateFeesDetail --> Prisma (feesDetail.update)
     *
     * @depends  FeesService.updateFeesDetail
     *
     * @notes
     *   - Only the fields present in vendorDetails / customerDetails
     *     are merged into the update object.
     */
    @UseGuards(SuperAdminAuthGuard)
    @Patch('/updateFeesDetail')
    updateFeesDetail(@Body() payload: any, @Request() req) {
        return this.feesService.updateFeesDetail(payload);
    }

    /**
     * @intent
     *   Retrieve a paginated, searchable list of all active fees with their
     *   deeply nested detail and location data.
     *
     * @idea
     *   Public read endpoint used by the admin dashboard listing page.
     *   Search is case-insensitive on feeName (minimum 3 characters).
     *
     * @usage
     *   GET /fees/getAllFees?page=1&limit=10&sort=desc&searchTerm=shipping
     *   (Public -- no auth guard)
     *
     * @dataflow
     *   query params --> FeesService.getAllFees --> Prisma (fees.findMany with
     *                   nested includes) --> paginated response
     *
     * @depends  FeesService.getAllFees
     *
     * @notes
     *   - Returns totalCount alongside data for client-side pagination.
     *   - Only ACTIVE records are returned at every nesting level.
     */
    @Get('/getAllFees')
    getAllFees(@Request() req, @Query('page') page: number, @Query('limit') limit: number, @Query('sort') sort: string, @Query('searchTerm') searchTerm: string) {
        return this.feesService.getAllFees(req, page, limit, sort, searchTerm);
    }

    /**
     * @intent
     *   Fetch a single fee by ID with all nested details, locations, and
     *   linked categories.
     *
     * @idea
     *   Detail view for the admin fee editor -- provides everything needed
     *   to populate the edit form in one request.
     *
     * @usage
     *   GET /fees/getOneFees?feeId=42
     *   (Public -- no auth guard)
     *
     * @dataflow
     *   feeId --> FeesService.getOneFees --> Prisma (fees.findUnique with
     *            deep includes) --> single fee response
     *
     * @depends  FeesService.getOneFees
     *
     * @notes
     *   - Includes fees_feesCategoryConnectTo with categoryDetail, which
     *     getAllFees does not.
     */
    @Get('/getOneFees')
    getOneFees(@Query('feeId') feeId: number,) {
        return this.feesService.getOneFees(feeId);
    }

    /**
     * @intent
     *   Hard-delete a fee and ALL of its related records (locations, details,
     *   junction rows).
     *
     * @idea
     *   Cascading hard delete -- the service manually walks the relation
     *   graph and removes every dependent row before deleting the parent
     *   Fees record.
     *
     * @usage
     *   DELETE /fees/deleteFees/:feeId  (Super-admin only)
     *
     * @dataflow
     *   feeId --> FeesService.deleteFees --> Prisma (feesLocation.delete,
     *            feesToFeesDetail.deleteMany, feesDetail.deleteMany,
     *            fees.delete)
     *
     * @depends  FeesService.deleteFees
     *
     * @notes
     *   - This is an irreversible hard delete, not a soft-delete.
     *   - A commented-out soft-delete version exists in the service.
     */
    @UseGuards(SuperAdminAuthGuard)
    @Delete('/deleteFees/:feeId')
    deleteFees(@Param('feeId') feeId: number, @Request() req) {
        return this.feesService.deleteFees(feeId);
    }

    /**
     * @intent
     *   Delete a single FeesToFeesDetail junction record together with its
     *   associated vendor detail, consumer detail, and their location records.
     *
     * @idea
     *   Removes one vendor+consumer detail pair from a fee without deleting
     *   the parent fee itself.
     *
     * @usage
     *   DELETE /fees/deleteLocation/:id  (Super-admin only)
     *   :id is the FeesToFeesDetail.id
     *
     * @dataflow
     *   id --> FeesService.deleteLocation --> Prisma (feesLocation.delete,
     *         feesDetail.delete, feesToFeesDetail.delete)
     *
     * @depends  FeesService.deleteLocation
     *
     * @notes
     *   - Global details (isVendorGlobal / isConsumerGlobal) skip location
     *     deletion because no FeesLocation row exists.
     */
    @UseGuards(SuperAdminAuthGuard)
    @Delete('/deleteLocation/:id')
    deleteLocation(@Param('id') id: number, @Request() req) {
        return this.feesService.deleteLocation(id);
    }

    /**
     * @intent
     *   Delete an individual vendor OR consumer FeesDetail record by type.
     *
     * @idea
     *   Allows removing only one side (vendor or consumer) of a fee detail
     *   pair while leaving the other intact.
     *
     * @usage
     *   DELETE /fees/deleteLocationFees/:id/:type  (Super-admin only)
     *   :type is "vendor" or "consumer"
     *
     * @dataflow
     *   id, type --> FeesService.deleteLocationFees --> Prisma
     *
     * @depends  FeesService.deleteLocationFees
     *
     * @notes
     *   - NOT IN USE -- retained for potential future re-activation.
     */
    // not in use
    @UseGuards(SuperAdminAuthGuard)
    @Delete('/deleteLocationFees/:id/:type')
    deleteLocationFees(@Param('id') id: number, @Request() req, @Param('type') type: string) {
        return this.feesService.deleteLocationFees(id, type);
    }

    /**
     * @intent
     *   Recursively delete a location-hierarchy node (COUNTRY -> STATE ->
     *   CITY -> TOWN) and all of its children.
     *
     * @idea
     *   Legacy endpoint from the previous FeesCountry/FeesState/FeesCity/
     *   FeesTown data model.  Walks down the hierarchy and hard-deletes
     *   each level.
     *
     * @usage
     *   DELETE /fees/deleteLocationByType/:id/:type  (Super-admin only)
     *   :type is "COUNTRY" | "STATE" | "CITY" | "TOWN"
     *
     * @dataflow
     *   id, type --> FeesService.deleteLocationByType --> recursive Prisma deletes
     *
     * @depends  FeesService.deleteLocationByType
     *
     * @notes
     *   - NOT IN USE -- belongs to the deprecated location-hierarchy model.
     */
    // not in use
    @UseGuards(SuperAdminAuthGuard)
    @Delete('/deleteLocationByType/:id/:type')
    deleteLocationByType(@Param('id') id: number, @Request() req, @Param('type') type: string) {
        return this.feesService.deleteLocationByType(id, type);
    }

    /**
     * @intent
     *   Link one or more marketplace categories to an existing fee record.
     *
     * @idea
     *   Creates FeesCategoryConnectTo junction rows.  Duplicates are
     *   silently skipped (dedup check per feeId + categoryId).
     *
     * @usage
     *   POST /fees/addCategoryToFees  (Super-admin only)
     *   Body: { feeId, categoryIdList: [{ categoryId, categoryLocation }] }
     *
     * @dataflow
     *   payload --> FeesService.addCategoryToFees --> Prisma
     *             (feesCategoryConnectTo.findFirst + create)
     *
     * @depends  FeesService.addCategoryToFees
     *
     * @notes
     *   - Each entry in categoryIdList is checked individually for existing
     *     connections before creation.
     */
    @UseGuards(SuperAdminAuthGuard)
    @Post('/addCategoryToFees')
    addCategoryToFees(@Body() payload: any, @Request() req) {
        return this.feesService.addCategoryToFees(payload);
    }

    /**
     * @intent
     *   Remove a single category-to-fee association.
     *
     * @idea
     *   Hard-deletes one FeesCategoryConnectTo row by its primary key.
     *
     * @usage
     *   DELETE /fees/deleteCategoryToFees/:feesCategoryId  (Super-admin only)
     *
     * @dataflow
     *   feesCategoryId --> FeesService.deleteCategoryToFees --> Prisma
     *                     (feesCategoryConnectTo.delete)
     *
     * @depends  FeesService.deleteCategoryToFees
     *
     * @notes
     *   - Returns 'Not Found' if the record does not exist.
     */
    @UseGuards(SuperAdminAuthGuard)
    @Delete('/deleteCategoryToFees/:feesCategoryId')
    deleteCategoryToFees(@Param('feesCategoryId') feesCategoryId: number, @Request() req) {
        return this.feesService.deleteCategoryToFees(feesCategoryId);
    }


}
