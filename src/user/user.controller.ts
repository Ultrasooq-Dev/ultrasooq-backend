/**
 * @file user.controller.ts — User HTTP Route Controller
 *
 * @intent
 *   Defines all HTTP endpoints under the /user/* route prefix. Handles user
 *   registration, authentication, profile management, file uploads, address
 *   management, role/permission management, help center, business categories,
 *   multi-account operations, and email/password changes.
 *
 * @idea
 *   Follows the NestJS controller pattern: thin route handlers that delegate
 *   all business logic to UserService. The controller is responsible for:
 *   - Route mapping (HTTP method + path)
 *   - Request parsing (body, query, files, request object)
 *   - Guard application (AuthGuard for protected routes)
 *   - File upload interception (FileFieldsInterceptor for multipart)
 *
 * @usage
 *   - Registered in UserModule.controllers.
 *   - Base path: /user (from @Controller('user'))
 *   - All endpoints are consumed by the Next.js frontend via HTTP/Axios.
 *
 * @dataflow
 *   HTTP Request → NestJS Router → AuthGuard (if protected) → UserController method
 *   → UserService method → Prisma DB / S3 / Email → Response
 *
 * @depends
 *   - @nestjs/common            (Controller, decorators)
 *   - @nestjs/platform-express   (FileFieldsInterceptor — multer-based file upload)
 *   - UserService               (business logic for all operations)
 *   - S3service                 (direct file upload for presignedUrlUpload endpoints)
 *   - AuthGuard                 (JWT authentication guard)
 *   - DTOs: CreateUserDto, RegisterValidateOtp, CreateSubAccountDto, SwitchAccountDto
 *
 * @notes
 *   - Most endpoints use @UseGuards(AuthGuard) for authentication. Public
 *     endpoints (no guard): register, registerValidateOtp, resendOtp, login,
 *     socialLogin, findUnique, viewOneUserPhone, forgetPassword, verifyOtp,
 *     viewTags, sendEmailFrombackend, userDelete, createHelpCenter.
 *   - userDelete (POST /userDelete) has NO auth guard — any caller can
 *     potentially delete a user. This is a security concern.
 *   - userProfileFile endpoint is a stub (returns true) — incomplete implementation.
 *   - CreateUserAccountDto is imported but not used — CreateSubAccountDto is
 *     used instead for the createAccount endpoint.
 *   - Some query parameters are typed as 'number' but arrive as strings from
 *     HTTP (no transform: true in ValidationPipe), so they're actually strings
 *     at runtime unless manually parsed.
 */

import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  Request,
  UploadedFiles,
  UseInterceptors,
  Patch,
  Query,
  Delete,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { AuthGuard } from 'src/guards/AuthGuard';
import { RegisterValidateOtp } from './dto/registerValidateOtp.dto';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { S3service } from './s3.service';
import { Throttle } from '@nestjs/throttler';
import { CreateUserAccountDto } from './dto/create-user-account.dto';
import { CreateSubAccountDto } from './dto/create-sub-account.dto';
import { SwitchAccountDto } from './dto/switch-account.dto';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('users')
@ApiBearerAuth('JWT-auth')
@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly s3service: S3service,
  ) {}

  /* ═══════════════════════════════════════════════════════════════════════
   * AUTHENTICATION & REGISTRATION ENDPOINTS
   * ═══════════════════════════════════════════════════════════════════════ */

  /** POST /user/register — Create a new user account (public, no auth).
   *  Sends OTP email for verification. User is inactive until OTP is validated. */
  @Post('/register')
  register(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  /** POST /user/registerValidateOtp — Validate OTP sent during registration (public). */
  @Post('/registerValidateOtp')
  registerValidateOtp(@Body() payload: RegisterValidateOtp) {
    return this.userService.registerValidateOtp(payload);
  }

  /** POST /user/resendOtp — Resend OTP email for registration verification (public). */
  @Post('/resendOtp')
  resendOtp(@Body() payload: any) {
    return this.userService.resendOtp(payload);
  }

  /** POST /user/login — Authenticate via email/password, returns JWT (public). */
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('/login')
  login(@Body() payload: any) {
    return this.userService.login(payload);
  }

  /** POST /user/socialLogin — Authenticate via Google OAuth, returns JWT (public). */
  @Post('/socialLogin')
  socialLogin(@Body() payload: any) {
    return this.userService.socialLogin(payload);
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * PROFILE & USER DATA ENDPOINTS (Authenticated)
   * ═══════════════════════════════════════════════════════════════════════ */

  /** POST /user/me — Get current authenticated user's data (protected). */
  @UseGuards(AuthGuard)
  @Post('/me')
  me(@Request() req, @Body() payload: any) {
    return this.userService.me(payload, req);
  }

  /** GET /user/get-perrmision — Get permissions for current user (protected).
   *  Note: endpoint name has a typo "perrmision" — kept for backwards compatibility. */
  @UseGuards(AuthGuard)
  @Get('/get-perrmision')
  getPermission(@Request() req, @Body() payload: any) {
    return this.userService.getPermission(payload, req);
  }

  /** POST /user/userProfile — Get/update user profile details (protected). */
  @UseGuards(AuthGuard)
  @Post('/userProfile')
  userProfile(@Request() req, @Body() payload: any) {
    return this.userService.userProfile(payload, req);
  }

  /** POST /user/userProfileFile — STUB: Intended for profile file upload.
   *  Currently returns `true` without doing anything. Dead code. */
  @UseGuards(AuthGuard)
  @Post('/userProfileFile')
  // @UseInterceptors(FileFieldsInterceptor([]))
  userProfileFile(@UploadedFiles() files, @Body() payload: any) {
    return true;
  }

  /** PATCH /user/updateUserProfile — Update the user's profile fields (protected). */
  @UseGuards(AuthGuard)
  @Patch('/updateUserProfile')
  updateUserProfile(@Request() req, @Body() payload: any) {
    return this.userService.updateUserProfile(payload, req);
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * FILE UPLOAD / DELETE ENDPOINTS (Authenticated)
   * ═══════════════════════════════════════════════════════════════════════ */

  /** POST /user/presignedUrlUpload — Upload a single file to S3 (protected).
   *  Accepts multipart form data with a 'content' field (max 1 file).
   *  Files are stored at public/{userId}/{timestamp}_{filename} in S3. */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(AuthGuard)
  @Post('/presignedUrlUpload')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'content', maxCount: 1 }]))
  presignedUrlUpload(
    @UploadedFiles() files,
    @Request() req,
    @Body() payload: any,
  ) {
    if (files.content) {
      const currentFile = Date.now() + '_' + files?.content[0]?.originalname;
      const path = 'public/' + req.user.id + '/' + currentFile;
      return this.s3service.s3_upload(
        files.content[0].buffer,
        path,
        files.content[0].mimetype,
        files.content[0],
      );
    }
  }

  /** POST /user/presignedUrlUploadMultiple — Upload up to 50 files to S3 (protected).
   *  Iterates over each file, uploads sequentially, returns array of S3 URLs. */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(AuthGuard)
  @Post('/presignedUrlUploadMultiple')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'content', maxCount: 50 }]))
  async presignedUrlUploadMultiple(
    @UploadedFiles() files,
    @Request() req,
    @Body() payload: any,
  ) {
    let resourceFileData = [];

    if (files.content && files.content.length > 0) {
      for (let i = 0; i < files.content.length; i++) {
        const currentFile = Date.now() + '_' + files?.content[i]?.originalname;
        const path = 'public/' + req.user.id + '/' + currentFile;
        const url = await this.s3service.s3_uploadMulti(
          files.content[i].buffer,
          path,
          files.content[i].mimetype,
          files.content[i],
        );

        // Add the URL to resourceFileData
        resourceFileData.push(url);
      }
    }
    return {
      status: true,
      message: 'Upload Successfully',
      data: resourceFileData,
      uniqueId: payload?.uniqueId || null,
    };
  }

  /** POST /user/presignedUrlDelete — Delete a file from S3 (protected). */
  @UseGuards(AuthGuard)
  @Post('/presignedUrlDelete')
  async presignedUrlDelete(@Request() req, @Body() payload: any) {

    return this.userService.presignedUrlDelete(payload, req);
  }

  /** PATCH /user/updateProfile — Update user profile (with optional file interceptor, protected). */
  @UseGuards(AuthGuard)
  @Patch('/updateProfile')
  @UseInterceptors(FileFieldsInterceptor([]))
  updateProfile(@UploadedFiles() files, @Request() req, @Body() payload: any) {
    return this.userService.updateProfile(payload, req);
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * PASSWORD & EMAIL CHANGE ENDPOINTS
   * ═══════════════════════════════════════════════════════════════════════ */

  /** POST /user/changePassword — Change password for authenticated user (protected). */
  @UseGuards(AuthGuard)
  @Post('/changePassword')
  changePassword(@Request() req, @Body() payload: any) {
    return this.userService.changePassword(payload, req);
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * USER LOOKUP ENDPOINTS
   * ═══════════════════════════════════════════════════════════════════════ */

  /** GET /user/findAll — List all users (protected). */
  @UseGuards(AuthGuard)
  @Get('/findAll')
  findAll() {
    return this.userService.findAll();
  }

  /** POST /user/findUnique — Find a single user by criteria (public — NO auth guard). */
  @Post('/findUnique')
  findUnique(@Body() payload: any) {
    return this.userService.findUnique(payload);
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * USER PHONE & SOCIAL LINK ENDPOINTS
   * ═══════════════════════════════════════════════════════════════════════ */

  /** POST /user/addUserPhone — Add a phone number to the user's profile (protected). */
  @UseGuards(AuthGuard)
  @Post('/addUserPhone')
  addUserPhone(@Request() req, @Body() payload: any) {
    return this.userService.addUserPhone(payload, req);
  }

  /** POST /user/addUserSocialLink — Add a social media link to profile (protected). */
  @UseGuards(AuthGuard)
  @Post('/addUserSocialLink')
  addUserSocialLink(@Request() req, @Body() payload: any) {
    return this.userService.addUserSocialLink(payload, req);
  }

  /** POST /user/viewOneUserPhone — View a user's phone (public — NO auth guard). */
  @Post('/viewOneUserPhone')
  viewOneUserPhone(@Body() payload: any) {
    return this.userService.viewOneUserPhone(payload);
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * PASSWORD RESET FLOW (Public)
   * ═══════════════════════════════════════════════════════════════════════ */

  /** POST /user/forgetPassword — Initiate password reset, sends OTP email (public). */
  @Post('/forgetPassword')
  forgetPassword(@Body() payload: any) {
    return this.userService.forgetPassword(payload);
  }

  /** POST /user/verifyOtp — Verify OTP for password reset (public). */
  @Post('/verifyOtp')
  verifyOtp(@Body() payload: any) {
    return this.userService.verifyOtp(payload);
  }

  /** POST /user/resetPassword — Set new password after OTP verification (protected). */
  @UseGuards(AuthGuard)
  @Post('/resetPassword')
  resetPassword(@Request() req, @Body() payload: any) {
    return this.userService.resetPassword(payload, req);
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * TAG & BRANCH ENDPOINTS
   * ═══════════════════════════════════════════════════════════════════════ */

  /** GET /user/viewTags — List all tags (public). */
  @Get('/viewTags')
  viewTags(@Body() payload: any) {
    return this.userService.viewTags();
  }

  /** POST /user/createTag — Create a new tag (protected). */
  @UseGuards(AuthGuard)
  @Post('/createTag')
  createTag(@Request() req, @Body() payload: any) {
    return this.userService.createTag(payload, req);
  }

  /** PATCH /user/updateBranch — Update a user branch (business location) (protected). */
  @UseGuards(AuthGuard)
  @Patch('/updateBranch')
  updateBranch(@Request() req, @Body() payload: any) {
    return this.userService.updateBranch(payload, req);
  }

  /** PATCH /user/onlineoffline — Toggle user online/offline status (protected). */
  @UseGuards(AuthGuard)
  @Patch('/onlineoffline')
  onlineOfflineStatus(@Request() req, @Body() payload: any) {
    return this.userService.onlineOfflineStatus(payload, req);
  }

  /** PATCH /user/changeEmail — Initiate email change, sends verification OTP (protected). */
  @UseGuards(AuthGuard)
  @Patch('/changeEmail')
  changeEmail(@Request() req, @Body() payload: any) {
    return this.userService.changeEmail(payload, req);
  }

  /** PATCH /user/verifyEmail — Verify new email address via OTP (protected). */
  @UseGuards(AuthGuard)
  @Patch('/verifyEmail')
  verifyEmail(@Request() req, @Body() payload: any) {
    return this.userService.verifyEmail(payload, req);
  }

  /** POST /user/addBranch — Add a new business branch/location (protected). */
  @UseGuards(AuthGuard)
  @Post('/addBranch')
  AddBranch(@Request() req, @Body() payload: any) {
    return this.userService.addBranchAfterEdit(payload, req);
  }

  /** GET /user/findOneBranch?branchId=N — Get a single branch by ID (protected). */
  @UseGuards(AuthGuard)
  @Get('/findOneBranch')
  findOneBranch(@Query('branchId') branchId: number, @Request() req) {
    return this.userService.findOneBranch(branchId, req);
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * USER ADDRESS ENDPOINTS (Authenticated)
   * ═══════════════════════════════════════════════════════════════════════ */

  /** POST /user/addUserAddress — Add a shipping/billing address (protected). */
  @UseGuards(AuthGuard)
  @Post('/addUserAddress')
  addUserAddress(@Request() req, @Body() payload: any) {
    return this.userService.addUserAddress(payload, req);
  }

  /** PATCH /user/updateUserAddress — Update an existing address (protected). */
  @UseGuards(AuthGuard)
  @Patch('/updateUserAddress')
  updateUserAddress(@Request() req, @Body() payload: any) {
    return this.userService.updateUserAddress(payload, req);
  }

  /** GET /user/getAllUserAddress?page=N&limit=N — List user's addresses with pagination (protected). */
  @UseGuards(AuthGuard)
  @Get('/getAllUserAddress')
  getAllUserAddress(
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Request() req,
  ) {
    return this.userService.getAllUserAddress(page, limit, req);
  }

  /** GET /user/getOneUserAddress?userAddressId=N — Get a single address (protected). */
  @UseGuards(AuthGuard)
  @Get('/getOneUserAddress')
  getOneUserAddress(
    @Query('userAddressId') userAddressId: number,
    @Request() req,
  ) {
    return this.userService.getOneUserAddress(userAddressId);
  }

  /** DELETE /user/deleteUserAddress?userAddressId=N — Delete an address (protected). */
  @UseGuards(AuthGuard)
  @Delete('/deleteUserAddress')
  deleteUserAddress(
    @Query('userAddressId') userAddressId: number,
    @Request() req,
  ) {
    return this.userService.deleteUserAddress(userAddressId, req);
  }

  /** POST /user/userDelete — Delete a user account (public — NO auth guard!).
   *  WARNING: This endpoint has no authentication, which is a security risk. */
  @Post('/userDelete')
  userDelete(@Body() payload: any) {
    return this.userService.userDelete(payload);
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * USER ROLE MANAGEMENT ENDPOINTS (Authenticated)
   * ═══════════════════════════════════════════════════════════════════════ */

  /** POST /user/createUserRole — Create a new user role definition (protected). */
  @UseGuards(AuthGuard)
  @Post('/createUserRole')
  createUserRole(@Body() payload: any, @Request() req) {
    return this.userService.createUserRole(payload, req);
  }

  /** GET /user/getAllUserRole?page=N&limit=N&searchTerm=S — List user roles (protected). */
  @UseGuards(AuthGuard)
  @Get('/getAllUserRole')
  getAllUserRole(
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('searchTerm') searchTerm: number,
    @Request() req,
  ) {
    return this.userService.getAllUserRole(page, limit, searchTerm, req);
  }

  /** PATCH /user/updateUserRole — Update an existing user role (protected). */
  @UseGuards(AuthGuard)
  @Patch('/updateUserRole')
  updateUserRole(@Request() req) {
    return this.userService.updateUserRole(req);
  }

  /** DELETE /user/deleteUserRole — Delete a user role (protected). */
  @UseGuards(AuthGuard)
  @Delete('/deleteUserRole')
  deleteUserRole(@Request() req) {
    return this.userService.deleteUserRole(req);
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * PERMISSION MANAGEMENT ENDPOINTS (Authenticated)
   * ═══════════════════════════════════════════════════════════════════════ */

  /** POST /user/set-permision — Set permissions for a user role (protected).
   *  Note: endpoint name has typo "permision" — kept for backwards compatibility. */
  @UseGuards(AuthGuard)
  @Post('/set-permision')
  setPermission(@Body() payload: any, @Request() req) {
    return this.userService.setPermission(payload, req);
  }

  /** PATCH /user/update-set-permission — Update permissions for a role (protected). */
  @UseGuards(AuthGuard)
  @Patch('/update-set-permission')
  updateSetPermission(@Body() payload: any, @Request() req) {
    return this.userService.updateSetPermission(payload, req);
  }

  /** GET /user/getAllUserRole-with-permission — List roles with their permissions (protected). */
  @UseGuards(AuthGuard)
  @Get('/getAllUserRole-with-permission')
  getAllUserRoleWithPermission(
    @Query('page') page: any,
    @Query('limit') limit: any,
    @Query('searchTerm') searchTerm: any,
    @Request() req,
  ) {
    return this.userService.getAllUserRoleWithPermission(
      page,
      limit,
      searchTerm,
      req,
    );
  }

  /** GET /user/getOneUserRole-with-permission?userRoleId=N — Get one role with permissions (protected). */
  @UseGuards(AuthGuard)
  @Get('/getOneUserRole-with-permission')
  getOneUserRoleWithPermission(
    @Query('userRoleId') userRoleId: any,
    @Request() req,
  ) {
    return this.userService.getOneUserRoleWithPermission(userRoleId);
  }

  /** PATCH /user/copy-userRole-with-permission — Duplicate an existing role + permissions (protected). */
  @UseGuards(AuthGuard)
  @Patch('/copy-userRole-with-permission')
  copyUserRoleWithPermission(@Body() payload: any, @Request() req) {
    return this.userService.copyUserRoleWithPermission(payload, req);
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * HELP CENTER ENDPOINTS
   * ═══════════════════════════════════════════════════════════════════════ */

  /** POST /user/help-center/create — Submit a help center ticket/query (public). */
  @Post('/help-center/create')
  createHelpCenter(@Body() payload: any, @Request() req) {
    return this.userService.createHelpCenter(payload, req);
  }

  /** GET /user/help-center/get-all/?page=N&limit=N&searchTerm=S — List help center entries (protected). */
  @UseGuards(AuthGuard)
  @Get('/help-center/get-all/')
  getAllHelpCenterResponse(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('searchTerm') searchTerm: string,
  ) {
    return this.userService.getAllHelpCenterResponse(
      page,
      limit,
      searchTerm,
      req,
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * BUSINESS CATEGORY ENDPOINTS
   * ═══════════════════════════════════════════════════════════════════════ */

  /** GET /user/bussiness-category/get-all — List business categories for user's type (protected).
   *  Note: "bussiness" is a typo — kept for backwards compatibility. */
  @UseGuards(AuthGuard)
  @Get('/bussiness-category/get-all')
  getAllBusinessCategory(
    @Request() req,
    @Query('page') page: number,
    @Query('limit') limit: number,
    @Query('searchTerm') searchTerm: string,
  ) {
    return this.userService.getAllBusinessCategory(
      page,
      limit,
      searchTerm,
      req,
    );
  }

  /** POST /user/sendEmailFrombackend — Test endpoint for sending email (public, for dev testing). */
  //Testing send Emai
  @Post('sendEmailFrombackend')
  sendEmailFrombackend(@Request() req) {
    return this.userService.sendEmailFrombackend(req);
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * MULTI-ACCOUNT SYSTEM ENDPOINTS (Authenticated)
   * These endpoints manage the user's multiple accounts (buyer, freelancer,
   * company sub-accounts under a single login).
   * ═══════════════════════════════════════════════════════════════════════ */

  /** GET /user/myAccounts — List all accounts for the authenticated user (protected). */
  // Multi-Account System Endpoints
  @UseGuards(AuthGuard)
  @Get('/myAccounts')
  myAccounts(@Request() req) {
    return this.userService.myAccounts(req);
  }

  /** POST /user/createAccount — Create a new sub-account (buyer/freelancer/company) (protected). */
  @UseGuards(AuthGuard)
  @Post('/createAccount')
  createAccount(@Request() req, @Body() payload: CreateSubAccountDto) {
    return this.userService.createAccount(payload, req);
  }

  /** POST /user/migrateSubAccounts — Migrate existing user data to sub-account format (protected).
   *  One-time migration utility for transitioning to the multi-account system. */
  @UseGuards(AuthGuard)
  @Post('/migrateSubAccounts')
  migrateSubAccounts(@Request() req) {
    return this.userService.migrateSubAccounts(req);
  }

  /** POST /user/switchAccount — Switch active account, returns new JWT with account context (protected). */
  @UseGuards(AuthGuard)
  @Post('/switchAccount')
  switchAccount(@Request() req, @Body() payload: SwitchAccountDto) {
    return this.userService.switchAccount(payload, req);
  }

  /** GET /user/currentAccount — Get details of the currently active account (protected). */
  @UseGuards(AuthGuard)
  @Get('/currentAccount')
  currentAccount(@Request() req) {
    return this.userService.currentAccount(req);
  }
}
