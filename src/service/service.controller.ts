/**
 * @fileoverview ServiceController -- REST controller for the /service/* endpoints.
 *
 * Intent:
 *   Exposes all HTTP routes that allow authenticated users to create, list,
 *   retrieve, update, and query service listings, as well as manage Q&A
 *   threads attached to those services.
 *
 * Idea:
 *   Thin controller layer that validates/transforms incoming HTTP parameters
 *   (via NestJS pipes and DTOs) and delegates every operation to
 *   {@link ServiceService}. No business logic resides here.
 *
 * Usage:
 *   All routes require a valid JWT (enforced at class level by {@link AuthGuard}).
 *   The current user's ID is extracted by the {@link GetUser} parameter
 *   decorator where needed.
 *
 * Data Flow:
 *   Client -> AuthGuard (JWT) -> Controller method -> ServiceService -> Prisma -> DB
 *
 * Dependencies:
 *   - {@link ServiceService}    -- injected business-logic provider.
 *   - {@link AuthGuard}         -- JWT guard applied at the controller level.
 *   - {@link GetUser}           -- custom parameter decorator extracting user claims from the request.
 *   - {@link CreateServiceDto}  -- validation DTO for service creation.
 *   - {@link UpdateServiceDto}  -- validation DTO for service updates.
 *
 * Notes:
 *   - Some endpoints (e.g. `getAllServiceBySeller`) read additional query
 *     params directly from the raw `@Request()` object (fromCityId, toCityId)
 *     rather than from declared `@Query()` parameters, so those values are
 *     not pipe-validated at the controller level.
 *   - The `@UseGuards(AuthGuard)` decorator on the class means every route
 *     in this controller requires authentication; there are no public routes.
 */
import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/AuthGuard';
import { ServiceService } from './service.service';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';
import { GetUser } from 'src/user/decorator/getUser.decorator';

/**
 * REST controller for service-listing management.
 *
 * Mounted at the `/service` route prefix. Every endpoint is JWT-protected.
 */
@ApiTags('services')
@ApiBearerAuth('JWT-auth')
@Controller('service')
@UseGuards(AuthGuard)
export class ServiceController {
  /**
   * Creates a new ServiceController instance.
   *
   * @param {ServiceService} service - The injected service-layer provider
   *   responsible for all service-listing business logic.
   */
  constructor(private readonly service: ServiceService) {}

  /**
   * Creates a new service listing.
   *
   * Intent:
   *   Allow an authenticated seller (freelancer or company) to publish a new
   *   service with tags, features, and images in a single request.
   *
   * Idea:
   *   Accepts a validated {@link CreateServiceDto} body and the current user's
   *   ID, then delegates creation to {@link ServiceService.createService}.
   *
   * Usage:
   *   `POST /service/create` with a JSON body conforming to CreateServiceDto.
   *
   * Data Flow:
   *   Body (CreateServiceDto) + userId -> ServiceService.createService -> DB insert
   *
   * Dependencies:
   *   - {@link CreateServiceDto} for request validation.
   *   - {@link GetUser} decorator to extract the authenticated user ID.
   *
   * Notes:
   *   Seller ownership is resolved inside the service layer via
   *   `HelperService.getAdminId()`, so the passed `userId` may be a team
   *   member's ID that gets mapped to the admin/owner ID.
   *
   * @param {CreateServiceDto} dto - Validated service-creation payload.
   * @param {number} userId - The authenticated user's ID from the JWT.
   * @returns {Promise<{success: boolean, message: string, data: any}>} Envelope response.
   */
  @Post('create')
  createService(@Body() dto: CreateServiceDto, @GetUser('id') userId: number) {
    return this.service.createService(dto, userId);
  }

  /**
   * Retrieves a paginated, searchable list of services.
   *
   * Intent:
   *   Provide a general-purpose listing endpoint that supports pagination,
   *   text search, sort direction, and an "own services" toggle so sellers
   *   can view only their own listings (including INACTIVE ones).
   *
   * Idea:
   *   Query parameters are validated/defaulted via NestJS pipes; the heavy
   *   lifting (ownership resolution, Prisma queries) is in the service layer.
   *
   * Usage:
   *   `GET /service/list?page=1&limit=20&ownService=false&term=&sort=desc`
   *
   * Data Flow:
   *   Query params + userId -> ServiceService.getAllServices -> Prisma -> DB
   *
   * Dependencies:
   *   - {@link DefaultValuePipe}, {@link ParseIntPipe}, {@link ParseBoolPipe} for query param coercion.
   *   - {@link GetUser} decorator for the authenticated user ID.
   *
   * Notes:
   *   - `ownService=true` will include both ACTIVE and INACTIVE services
   *     scoped to the resolved admin/owner ID.
   *   - `term` must be longer than 2 characters to trigger a search; shorter
   *     values are ignored by the service layer.
   *
   * @param {number} page  - 1-based page index (default 1).
   * @param {number} limit - Number of results per page (default 20).
   * @param {boolean} ownService - If true, restrict results to the caller's own services.
   * @param {number} userId - Authenticated user ID from the JWT.
   * @param {string} term  - Optional search term for service name.
   * @param {string} sort  - Sort direction for createdAt ('asc' | 'desc'), defaults to 'desc'.
   * @returns {Promise<{success: boolean, message: string, data: {services: any[], total: number, limit: number}}>}
   */
  @Get('list')
  getAllServices(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('ownService', ParseBoolPipe)
    ownService: boolean,
    @GetUser('id') userId: number,
    @Query('term') term: string,
    @Query('sort') sort: string,
  ) {
    
    return this.service.getAllServices(page, limit, ownService, userId, term, sort);
  }

  /**
   * Retrieves paginated MOVING services for a specific seller, optionally
   * filtered by origin/destination city.
   *
   * Intent:
   *   Support the shipping / moving-service flow by listing all ACTIVE
   *   MOVING-type services owned by the given seller.
   *
   * Idea:
   *   City-based filtering (fromCityId / toCityId / rangeCityId) is read
   *   from the raw request object and handled in the service layer.
   *
   * Usage:
   *   `GET /service/getAllServiceBySeller?sellerId=5&page=1&limit=100&fromCityId=10&toCityId=20`
   *
   * Data Flow:
   *   sellerId, page, limit, req.query.{fromCityId,toCityId} -> ServiceService.getAllServiceBySeller -> Prisma -> DB
   *
   * Dependencies:
   *   - Raw `@Request()` object for city filter query params.
   *
   * Notes:
   *   - Only services with `serviceType = 'MOVING'` and `status = 'ACTIVE'` are returned.
   *   - When fromCityId equals toCityId, the query switches to a `rangeCityId`
   *     filter (same-city / local move).
   *
   * @param req    - The raw Express request (carries additional query params).
   * @param {number} page     - Page number (parsed as int in the service layer).
   * @param {number} limit    - Page size (parsed as int in the service layer).
   * @param {string} sellerId - Seller (user) ID as a string, parsed in the service layer.
   * @returns {Promise<{status: boolean, message: string, data: any[], totalCount?: number}>}
   */
  @Get('getAllServiceBySeller')
  getAllServiceBySeller(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('sellerId') sellerId: string,
  ) {

    return this.service.getAllServiceBySeller(sellerId, page, limit, req);
  }

  /**
   * Retrieves paginated MOVING services from sellers OTHER THAN the
   * specified seller, optionally filtered by city.
   *
   * Intent:
   *   Allow the shipping flow to show competing / alternative moving services
   *   that do NOT belong to the current seller.
   *
   * Idea:
   *   Identical to {@link getAllServiceBySeller} but the Prisma query uses
   *   `sellerId: { not: sellerId }` to exclude the given seller.
   *
   * Usage:
   *   `GET /service/getAllServiceOfOtherSeller?sellerId=5&page=1&limit=100&fromCityId=10&toCityId=20`
   *
   * Data Flow:
   *   sellerId, page, limit, req.query.{fromCityId,toCityId} -> ServiceService.getAllServiceOfOtherSeller -> Prisma -> DB
   *
   * Dependencies:
   *   - Raw `@Request()` object for city filter query params.
   *
   * Notes:
   *   - Same city-filtering logic as {@link getAllServiceBySeller}.
   *   - Only ACTIVE MOVING services are returned.
   *
   * @param req    - The raw Express request.
   * @param {number} page     - Page number.
   * @param {number} limit    - Page size.
   * @param {string} sellerId - The seller to EXCLUDE from results.
   * @returns {Promise<{status: boolean, message: string, data: any[], totalCount?: number}>}
   */
  @Get('getAllServiceOfOtherSeller')
  getAllServiceOfOtherSeller(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('sellerId') sellerId: string,
  ) {

    return this.service.getAllServiceOfOtherSeller(sellerId, page, limit, req);
  }

  /**
   * Retrieves BOOKING-type services whose categories are connected to the
   * given product category via the CategoryConnectTo mapping table.
   *
   * Intent:
   *   Enable cross-selling by showing bookable services related to a product
   *   category (e.g., installation services for electronics).
   *
   * Idea:
   *   Resolves linked category IDs through `categoryConnectTo`, then fetches
   *   ACTIVE BOOKING services within those categories.
   *
   * Usage:
   *   `GET /service/getAllServiceRelatedProductCategoryId?categoryId=42&page=1&limit=100`
   *
   * Data Flow:
   *   categoryId -> categoryConnectTo lookup -> ServiceService query by connected IDs -> Prisma -> DB
   *
   * Dependencies:
   *   - Raw `@Request()` object (forwarded to service layer, though not
   *     currently used for additional query params).
   *
   * Notes:
   *   - Returns an empty array with `status: false` if no category connections
   *     or matching services exist.
   *
   * @param req - The raw Express request.
   * @param {number} page       - Page number.
   * @param {number} limit      - Page size.
   * @param {string} categoryId - The product category ID to find related services for.
   * @returns {Promise<{status: boolean, message: string, data: any[], totalCount?: number}>}
   */
  @Get('getAllServiceRelatedProductCategoryId')
  getAllServiceRelatedProductCategoryId(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('categoryId') categoryId: string,
  ) {
    
    return this.service.getAllServiceRelatedProductCategoryId(categoryId, page, limit, req);
  }

  /**
   * Posts a new question on a service listing.
   *
   * Intent:
   *   Let any authenticated user ask a question about a service, starting
   *   a public Q&A thread visible to buyers and sellers.
   *
   * Idea:
   *   Payload is loosely typed (`any`); the service layer extracts
   *   `serviceId` and `question` and persists a `ProductQuestion` record
   *   with `questionType = 'SERVICE'`.
   *
   * Usage:
   *   `POST /service/ask-question` with JSON body `{ serviceId, question }`.
   *
   * Data Flow:
   *   payload + req (user context) -> ServiceService.askQuestion -> ProductQuestion insert
   *
   * Dependencies:
   *   - Raw `@Request()` to read the authenticated user's ID (`req.user.id`).
   *
   * Notes:
   *   - Reuses the `ProductQuestion` model (shared between products and
   *     services), discriminated by `questionType`.
   *
   * @param req     - The raw Express request containing the JWT-decoded user.
   * @param payload - `{ serviceId: number|string, question: string }`.
   * @returns {Promise<{status: boolean, message: string, data: any}>}
   */
  @Post('ask-question')
  askQuestion(@Request() req, @Body() payload: any) {
    return this.service.askQuestion(payload, req);
  }

  /**
   * Retrieves a paginated list of questions for a specific service.
   *
   * Intent:
   *   Display the Q&A thread on a service detail page, with optional
   *   filtering by user type (vendor vs. customer) and sort order.
   *
   * Idea:
   *   Accepts serviceId, pagination, sort direction, and a userType filter;
   *   delegates to {@link ServiceService.getAllQuestion} which maps userType
   *   to tradeRole values (COMPANY/FREELANCER for vendors, BUYER for customers).
   *
   * Usage:
   *   `GET /service/getAllQuestion?serviceId=10&page=1&limit=10&sortType=newest&userType=VENDOR`
   *
   * Data Flow:
   *   Query params + req -> ServiceService.getAllQuestion -> ProductQuestion query -> DB
   *
   * Dependencies:
   *   - Raw `@Request()` forwarded to the service layer.
   *
   * Notes:
   *   - `sortType` accepts 'oldest' for ascending; any other value defaults to descending.
   *   - Includes nested `questionByuserIdDetail` and `productQuestionAnswerDetail` relations.
   *
   * @param {any} serviceId - Service ID (parsed to int in service layer).
   * @param {any} page      - Page number.
   * @param {any} limit     - Page size.
   * @param {any} sortType  - 'oldest' for ASC, otherwise DESC.
   * @param req             - Raw Express request.
   * @param {any} userType  - 'VENDOR', 'CUSTOMER', or omitted for all.
   * @returns {Promise<{status: boolean, message: string, data: any[], totalcount?: number}>}
   */
  @Get('/getAllQuestion')
  getAllQuestion(
    @Query('serviceId') serviceId: any,
    @Query('page') page: any,
    @Query('limit') limit: any,
    @Query('sortType') sortType: any,
    @Request() req,
    @Query('userType') userType: any,
  ) {
    return this.service.getAllQuestion(
      page,
      limit,
      serviceId,
      sortType,
      userType,
      req,
    );
  }

  /**
   * Submits an answer to an existing service question.
   *
   * Intent:
   *   Allow a seller (or any authenticated user) to answer a previously
   *   posted question on a service listing.
   *
   * Idea:
   *   Receives a loosely typed payload with `serviceId`,
   *   `productQuestionId`, and `answer`; persists a
   *   `ProductQuestionAnswer` record with `questionType = 'SERVICE'`.
   *
   * Usage:
   *   `PATCH /service/giveAnswer` with JSON body
   *   `{ serviceId, productQuestionId, answer }`.
   *
   * Data Flow:
   *   payload + req (user context) -> ServiceService.giveAnswer -> ProductQuestionAnswer insert
   *
   * Dependencies:
   *   - Raw `@Request()` to read the authenticated user's ID.
   *
   * Notes:
   *   - Uses PATCH semantics (updating the Q&A state), although it creates
   *     a new answer record rather than modifying an existing one.
   *
   * @param req     - The raw Express request containing the JWT-decoded user.
   * @param payload - `{ serviceId, productQuestionId, answer }`.
   * @returns {Promise<{status: boolean, message: string, data: any}>}
   */
  @Patch('/giveAnswer')
  giveAnswer(@Request() req, @Body() payload: any) {
    return this.service.giveAnswer(payload, req);
  }

  /**
   * Retrieves a single service by its ID, including all relations.
   *
   * Intent:
   *   Serve the service detail page by returning a complete service record
   *   with tags, features, images, and category.
   *
   * Idea:
   *   Simple pass-through to {@link ServiceService.getServiceById}; the
   *   `serviceid` route param is validated and parsed to an integer.
   *
   * Usage:
   *   `GET /service/:serviceid`
   *
   * Data Flow:
   *   serviceid (route param) -> ServiceService.getServiceById -> Prisma findUnique -> DB
   *
   * Dependencies:
   *   - {@link ParseIntPipe} for route param validation.
   *
   * Notes:
   *   - Does not check ownership; any authenticated user can view any service.
   *
   * @param {number} serviceId - The service's primary key, parsed from the URL.
   * @returns {Promise<{success: boolean, message: string, data: any}>}
   */
  @Get(':serviceid')
  getServiceById(@Param('serviceid', ParseIntPipe) serviceId: number) {
    return this.service.getServiceById(serviceId);
  }

  /**
   * Updates an existing service listing.
   *
   * Intent:
   *   Allow the service owner (or a team member resolved via getAdminId) to
   *   modify the service's scalar fields, tags, features, and images.
   *
   * Idea:
   *   Accepts a validated {@link UpdateServiceDto}, verifies ownership in the
   *   service layer, then performs an atomic transaction that updates scalar
   *   fields, reconciles tags/features/images (add new, remove missing), and
   *   returns the transaction result.
   *
   * Usage:
   *   `PATCH /service/:serviceid` with a JSON body conforming to UpdateServiceDto.
   *
   * Data Flow:
   *   serviceid + userId + UpdateServiceDto -> ServiceService.updateService
   *   -> ownership check -> Prisma $transaction -> DB
   *
   * Dependencies:
   *   - {@link ParseIntPipe} for route param validation.
   *   - {@link UpdateServiceDto} for body validation.
   *   - {@link GetUser} decorator for the authenticated user ID.
   *
   * Notes:
   *   - If the calling user does not own the service (after admin-ID
   *     resolution), a BadRequestException is thrown.
   *   - Tag/feature/image reconciliation uses a "keep IDs + delete rest +
   *     create new" strategy inside a single Prisma transaction.
   *
   * @param {number} serviceId - The service's primary key, parsed from the URL.
   * @param {UpdateServiceDto} dto - Partial update payload.
   * @param {number} userId - Authenticated user ID.
   * @returns {Promise<{status: boolean, message: string, data: any}>}
   */
  @Patch(':serviceid')
  updateService(
    @Param('serviceid', ParseIntPipe) serviceId: number,
    @Body() dto: UpdateServiceDto,
    @GetUser('id') userId: number,
  ) {
    return this.service.updateService(serviceId, userId, dto);
  }

  /**
   * Retrieves products that are linked to a service's category via
   * the CategoryConnectTo mapping table.
   *
   * Intent:
   *   Enable cross-selling by showing products related to a service
   *   (e.g., supplies needed for a moving service).
   *
   * Idea:
   *   Uses the service's category ID to look up connected product categories,
   *   then fetches active products from those categories.
   *
   * Usage:
   *   `GET /service/product/:serviceid`
   *
   * Data Flow:
   *   serviceid + userId -> ServiceService.getProductService
   *   -> categoryConnectTo lookup -> Product query -> DB
   *
   * Dependencies:
   *   - {@link ParseIntPipe} for route param validation.
   *   - {@link GetUser} decorator for the authenticated user ID.
   *
   * Notes:
   *   - The `serviceid` param is actually used as a `categoryId` in the
   *     service layer's `categoryConnectTo` lookup -- the name is misleading.
   *   - Returns up to 100 products, ordered by createdAt descending.
   *
   * @param {number} serviceId - Passed as-is; used as a categoryId in the service layer.
   * @param {number} userId    - Authenticated user ID (currently unused in the service layer query).
   * @returns {Promise<{status: boolean, message: string, data: any[], totalCount?: number}>}
   */
  @Get('product/:serviceid')
  getProductService(
    @Param('serviceid', ParseIntPipe) serviceId: number,
    @GetUser('id') userId: number,
  ) {
    return this.service.getProductService(serviceId, userId);
  }
}
