/**
 * @file user.service.ts
 *
 * @intent
 *   Central service for all user-related operations in the Ultrasooq
 *   marketplace platform.  It exposes every action a user can perform on
 *   their account -- from initial registration through profile management,
 *   multi-account switching, role/permission administration, and more.
 *
 * @idea
 *   The service is built around a **MasterAccount / User** architecture.
 *   A single MasterAccount (holding personal details such as name, email,
 *   password) can own multiple User records that each represent a distinct
 *   trade role (BUYER, FREELANCER, COMPANY).  Only one User record is
 *   flagged as "current" at any time; switching accounts swaps the JWT
 *   context and updates the `isCurrent` flag.
 *
 * @usage
 *   Injected into `UserController` (and potentially other controllers).
 *   Each public method maps to a REST endpoint.  All methods return a
 *   standardised response envelope: `{ status, message, data?, error? }`.
 *
 * @dataflow
 *   Controller  -->  UserService  -->  PrismaClient (PostgreSQL)
 *                                 -->  AuthService      (JWT creation)
 *                                 -->  NotificationService (email / OTP)
 *                                 -->  S3service        (file operations)
 *                                 -->  HelperService    (utility helpers)
 *
 * @depends
 *   - PrismaClient  -- direct database access via Prisma ORM
 *   - AuthService    -- JWT token generation and validation
 *   - NotificationService -- email dispatch and OTP delivery
 *   - S3service      -- AWS S3 presigned-URL deletion
 *   - HelperService  -- shared utility methods (e.g. admin ID resolution)
 *   - bcrypt         -- password hashing and comparison
 *   - randomstring   -- unique ID / username generation
 *
 * @notes
 *   - OTP codes are four-digit integers valid for 5 minutes.
 *   - Soft-deletes are used throughout (`deletedAt` / status = 'DELETE').
 *   - Phone numbers and social links are replaced in bulk on update
 *     (delete-all then re-create).
 *   - Error handling follows a try/catch pattern that always returns the
 *     standard envelope so the caller never receives an unhandled throw.
 */

import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { compare, hash, genSalt } from 'bcrypt';
import { compareSync } from 'bcrypt';
import { AuthService } from 'src/auth/auth.service';
import { NotificationService } from 'src/notification/notification.service';
import { S3service } from './s3.service';
import { retry } from 'rxjs';
import * as randomstring from 'randomstring';
import { HelperService } from 'src/helper/helper.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  notifyAdminsNewUser,
  notifyAdminsIdentityProofUpload,
} from 'src/notification/notification.helper';
import { getErrorMessage } from 'src/common/utils/get-error-message';


@Injectable()
export class UserService {
  constructor(
    private readonly authService: AuthService,
    private readonly notificationService: NotificationService,
    private readonly s3service: S3service,
    private readonly helperService: HelperService,
    private readonly prisma: PrismaService,
  ) {}

  // ===========================================================================
  // SECTION: Email Utility
  // ===========================================================================

  /**
   * Sends a generic email from the backend using the NotificationService.
   *
   * @param req - Express request object whose body contains `email`, `name`,
   *              and an implicit hard-coded OTP (12345 -- used for testing).
   * @returns Standard response envelope confirming dispatch.
   *
   * @usage Called by the controller to trigger a test or generic email send.
   */
  async sendEmailFrombackend(req: any) {
    try {
      const { randomInt } = require('crypto');
      let otp = randomInt(1000, 10000);
      let data = {
        email: req.body.email,
        name: req.body.name,
        otp: otp,
      };
      this.notificationService.mailService(data);

      return {
        status: true,
        message: 'Email sent successfully',
        data: [],
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in sending email',
        error: getErrorMessage(error),
      };
    }
  }

  // ===========================================================================
  // SECTION: User Registration & OTP Verification
  // ===========================================================================

  /**
   * Registers a new user (manual or social sign-up).
   *
   * **Manual flow:**
   *  1. Validates email format and uniqueness against MasterAccount.
   *  2. Creates a MasterAccount with personal info and hashed password.
   *  3. Creates a default User record (BUYER / COMPANY / FREELANCER).
   *  4. Generates a 7-digit zero-padded unique ID and a random username.
   *  5. Dispatches a 4-digit OTP email for verification.
   *
   * **Social flow (Google / Facebook):**
   *  Same as manual but skips OTP sending -- returns the created user
   *  directly.
   *
   * @param createUserDto - DTO containing firstName, lastName, email,
   *                        password, loginType, tradeRole, and optional
   *                        profile fields.
   * @returns `{ status, message, otp? }` on manual; `{ status, message, data }` on social.
   */
  async create(createUserDto: CreateUserDto) {
    try {

      if (createUserDto.loginType === 'MANUAL') {
        if (createUserDto.email) {
          let re =
            /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
          if (!re.test(String(createUserDto.email))) {
            return {
              status: 'false',
              message: 'enter a valid email',
              data: [],
            };
          }
          createUserDto.email = createUserDto.email.toLowerCase();
        }

        // Check if Master Account already exists
        const masterAccountExists = await this.prisma.masterAccount.findUnique({
          where: { email: createUserDto.email },
        });

        if (masterAccountExists) {
          return {
            status: 'false',
            message: 'email already exists',
            data: [],
          };
        }

        let tradeRole = createUserDto.tradeRole || 'BUYER';
        let userTypeCategoryId = 22; // Buyer
        if (tradeRole === 'COMPANY') {
          userTypeCategoryId = 66; // Vendor
        }
        if (tradeRole === 'FREELANCER') {
          userTypeCategoryId = 66; // Vendor
        }

        let firstName = createUserDto.firstName;
        let lastName = createUserDto.lastName;
        let email = createUserDto.email;
        let cc = createUserDto.cc;
        let phoneNumber = createUserDto.phoneNumber;
        const { randomInt } = require('crypto');
        let otp = randomInt(1000, 10000);
        let otpValidTime = new Date(new Date().getTime() + parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10) * 60000); // 5 minutes
        const salt = await genSalt(10);
        const password = await hash(createUserDto.password, salt);

        // Create Master Account first
        const masterAccount = await this.prisma.masterAccount.create({
          data: {
            email,
            password,
            firstName,
            lastName,
            phoneNumber,
            cc,
            dateOfBirth: createUserDto.dateOfBirth
              ? new Date(createUserDto.dateOfBirth)
              : null,
            gender: (createUserDto.gender as any) || 'MALE',
            profilePicture: createUserDto.profilePicture,
            otp,
            otpValidTime,
          },
        });

        // Create default User account (Buyer) linked to Master Account
        const user = await this.prisma.user.create({
          data: {
            masterAccountId: masterAccount.id,
            accountName: `${firstName} ${lastName} - ${tradeRole}`,
            tradeRole: tradeRole as any,
            isActive: true,
            isCurrent: true,
            userTypeCategoryId,
            status: 'ACTIVE', // Default buyer account should be ACTIVE
            // Company-specific fields for company accounts
            ...(tradeRole === 'COMPANY' && {
              companyName: `${firstName} ${lastName} Company`,
              companyAddress: '',
              companyPhone: phoneNumber,
              companyWebsite: '',
              companyTaxId: '',
            }),
          },
        });

        // Update Master Account with last active user
        await this.prisma.masterAccount.update({
          where: { id: masterAccount.id },
          data: { lastActiveUserId: user.id },
        });

        let idString = user.id.toString();
        let requestId;

        if (idString.length >= 7) {
          requestId = idString;
        } else {
          requestId = '0'.repeat(7 - idString.length) + idString;
        }

        // Create username from firstName + 4 random digits
        const cleanFirstName = firstName.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        const randomNumbers = Math.floor(1000 + Math.random() * 9000); // 4-digit number (1000-9999)
        const username = `${cleanFirstName}${randomNumbers}`;

        let updatedUser = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            uniqueId: requestId,
            userName: username,
          },
        });

        let data = {
          email: createUserDto.email,
          name: createUserDto.firstName,
          otp: otp,
        };
        this.notificationService.mailService(data);

        // Notify admins about new user registration
        try {
          const userName = `${firstName} ${lastName}`.trim();
          await notifyAdminsNewUser(
            this.notificationService,
            updatedUser.id,
            userName,
            email,
            tradeRole,
            this.prisma,
          );
        } catch (notifError) {
        }

        return {
          status: true,
          message: 'Register Successfully',
          otp: otp,
        };
      } else {
        // Social login (Google/Facebook)
        if (createUserDto.email) {
          let re =
            /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
          if (!re.test(String(createUserDto.email))) {
            return {
              status: 'false',
              message: 'enter a valid email',
              data: [],
            };
          }
          createUserDto.email = createUserDto.email.toLowerCase();
        }

        // Check if Master Account already exists
        const masterAccountExists = await this.prisma.masterAccount.findUnique({
          where: { email: createUserDto.email },
        });

        if (masterAccountExists) {
          return {
            status: 'false',
            message: 'email already exists',
            data: [],
          };
        }

        let tradeRole = createUserDto.tradeRole || 'BUYER';
        let firstName = createUserDto.firstName;
        let lastName = createUserDto.lastName;
        let email = createUserDto.email;
        let cc = createUserDto.cc;
        let phoneNumber = createUserDto.phoneNumber;
        const salt = await genSalt(10);
        const password = await hash(createUserDto.password, salt);

        let loginType;
        if (createUserDto.loginType === 'FACEBOOK') {
          loginType = 'FACEBOOK';
        } else {
          loginType = 'GOOGLE';
        }

        // Create Master Account first
        const masterAccount = await this.prisma.masterAccount.create({
          data: {
            email,
            password,
            firstName,
            lastName,
            phoneNumber,
            cc,
            dateOfBirth: createUserDto.dateOfBirth
              ? new Date(createUserDto.dateOfBirth)
              : null,
            gender: (createUserDto.gender as any) || 'MALE',
            profilePicture: createUserDto.profilePicture,
          },
        });

        // Create default User account (Buyer) linked to Master Account
        let user = await this.prisma.user.create({
          data: {
            masterAccountId: masterAccount.id,
            accountName: `${firstName} ${lastName} - ${tradeRole}`,
            tradeRole: tradeRole as any,
            isActive: true,
            isCurrent: true,
            userType: 'USER',
            status: 'ACTIVE', // Default buyer account should be ACTIVE
            // Company-specific fields for company accounts
            ...(tradeRole === 'COMPANY' && {
              companyName: `${firstName} ${lastName} Company`,
              companyAddress: '',
              companyPhone: phoneNumber,
              companyWebsite: '',
              companyTaxId: '',
            }),
          },
        });

        // Update Master Account with last active user
        await this.prisma.masterAccount.update({
          where: { id: masterAccount.id },
          data: { lastActiveUserId: user.id },
        });

        let idString = user.id.toString();
        let requestId;

        if (idString.length >= 7) {
          requestId = idString;
        } else {
          requestId = '0'.repeat(7 - idString.length) + idString;
        }

        // Create username from firstName + 4 random digits
        const cleanFirstName = firstName.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        const randomNumbers = Math.floor(1000 + Math.random() * 9000); // 4-digit number (1000-9999)
        const username = `${cleanFirstName}${randomNumbers}`;

        let updatedUser = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            uniqueId: requestId,
            userName: username,
          },
        });

        return {
          status: true,
          message: 'Register Successfully',
          data: updatedUser,
        };
      }
    } catch (error) {
      return {
        status: false,
        message: 'error in register',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Validates the OTP sent during registration.
   *
   * Flow:
   *  1. Looks up MasterAccount by email.
   *  2. Compares the supplied OTP against the stored value.
   *  3. Checks expiry (5-minute window).
   *  4. Clears OTP fields on success and issues a JWT access token.
   *
   * @param payload - `{ email: string, otp: number }`.
   * @returns Access token and merged user data (User + MasterAccount fields).
   */
  async registerValidateOtp(payload: any) {
    try {
      let { email, otp } = payload;

      // Find the Master Account by email (where personal info is stored)
      const masterAccount = await this.prisma.masterAccount.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (!masterAccount) {
        return {
          status: false,
          message: 'User not found',
          data: [],
        };
      }

      // Check if OTP matches (OTP is stored in MasterAccount)
      if (otp !== masterAccount.otp) {
        return {
          status: false,
          message: 'Invalid OTP',
          data: [],
        };
      }

      // Check if OTP is expired
      if (new Date() > masterAccount.otpValidTime) {
        return {
          status: false,
          message: 'OTP Expires',
          data: [],
        };
      }

      // Clear OTP after successful verification
      let updatedMasterAccount = await this.prisma.masterAccount.update({
        where: { email: email.toLowerCase() },
        data: {
          otp: null,
          otpValidTime: null,
        },
      });

      // Find the default User account for this Master Account
      const defaultUser = await this.prisma.user.findFirst({
        where: {
          masterAccountId: masterAccount.id,
          isCurrent: true,
        },
      });

      if (!defaultUser) {
        return {
          status: false,
          message: 'Default user account not found',
          data: [],
        };
      }

      let userAuth = {
        id: defaultUser.id,
      };
      let authToken = await this.authService.login(userAuth);
      const restokenData = authToken;

      return {
        status: true,
        message: 'OTP Verified Successfully',
        accessToken: restokenData.accessToken,
        refreshToken: restokenData.refreshToken,
        data: {
          ...defaultUser,
          // Include personal info from Master Account
          email: masterAccount.email,
          firstName: masterAccount.firstName,
          lastName: masterAccount.lastName,
          phoneNumber: masterAccount.phoneNumber,
          cc: masterAccount.cc,
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in registerValidateOtp',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Regenerates and resends a 4-digit OTP to the user's email.
   *
   * Updates the MasterAccount record with the new OTP and a fresh
   * 5-minute expiry window, then dispatches the email.
   *
   * @param payload - `{ email: string }`.
   * @returns Confirmation message with the new OTP value.
   */
  async resendOtp(payload: any) {
    try {
      // Find the Master Account by email (where personal info is stored)
      const masterAccount = await this.prisma.masterAccount.findUnique({
        where: { email: payload.email.toLowerCase() },
      });

      if (!masterAccount) {
        return {
          status: false,
          message: 'User not found',
          data: [],
        };
      }

      const { randomInt } = require('crypto');
      let otp = randomInt(1000, 10000);
      let otpValidTime = new Date(new Date().getTime() + parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10) * 60000); // 5 minutes

      // Update OTP in Master Account
      const updateMasterAccount = await this.prisma.masterAccount.update({
        where: {
          email: payload.email.toLowerCase(),
        },
        data: {
          otp,
          otpValidTime,
        },
      });

      let data = {
        email: payload.email,
        name: masterAccount.firstName,
        otp: otp,
      };
      this.notificationService.mailService(data);

      return {
        status: true,
        message: 'Resend OTP Successfully',
        otp: otp,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in resendOtp',
        data: [],
      };
    }
  }

  // ===========================================================================
  // SECTION: Authentication (Login)
  // ===========================================================================

  /**
   * Authenticates a user via email and password (manual login).
   *
   * Flow:
   *  1. Finds the MasterAccount by email; checks for soft-deletion.
   *  2. If a pending OTP exists, prompts the user to verify first.
   *  3. Compares the bcrypt-hashed password.
   *  4. Resolves the last-active User account (or falls back to BUYER).
   *  5. Marks that account as `isCurrent` and generates a JWT.
   *
   * @param payload - `{ email: string, password: string }`.
   * @returns JWT access token and merged user/master-account data.
   */
  async login(payload: any) {
    try {
      const email = payload.email;

      // Find the Master Account by email (where personal info and password are stored)
      const masterAccount = await this.prisma.masterAccount.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (!masterAccount) {
        return {
          status: false,
          message: 'User not found',
          data: [],
        };
      }

      // Check if Master Account is deleted
      if (masterAccount.deletedAt) {
        return {
          status: false,
          message: 'User Deleted',
          data: [],
        };
      }

      // Check if Master Account needs OTP verification (has OTP)
      if (
        masterAccount.otp &&
        masterAccount.otpValidTime &&
        new Date() < masterAccount.otpValidTime
      ) {
        return {
          status: true,
          message: 'An OTP was sent to your email.',
          data: {
            status: 'INACTIVE',
          },
        };
      }

      // Check password against Master Account
      if (!compareSync(payload.password, masterAccount.password)) {
        return {
          status: false,
          message: 'Invalid Credential',
          data: [],
        };
      }

      // Find the last active User account for this Master Account
      let activeUser = null;

      if (masterAccount.lastActiveUserId) {
        // Try to find the last active user account
        activeUser = await this.prisma.user.findFirst({
          where: {
            id: masterAccount.lastActiveUserId,
            masterAccountId: masterAccount.id,
            deletedAt: null,
            isActive: true,
          },
        });
      }

      // If no last active user or it's not found, find the default BUYER account
      if (!activeUser) {
        activeUser = await this.prisma.user.findFirst({
          where: {
            masterAccountId: masterAccount.id,
            tradeRole: 'BUYER', // Default main account
            deletedAt: null,
            isActive: true,
          },
        });
      }

      if (!activeUser) {
        return {
          status: false,
          message: 'No active user account found',
          data: [],
        };
      }

      // Check if the account is banned (INACTIVE status)
      // If the default buyer account is banned, prevent login
      if (activeUser.status === 'INACTIVE') {
        return {
          status: false,
          message: 'Your account has been banned. Please contact administrator.',
          data: [],
        };
      }

      // Set this account as current
      await this.prisma.user.updateMany({
        where: {
          masterAccountId: masterAccount.id,
          isCurrent: true,
        },
        data: {
          isCurrent: false,
        },
      });

      await this.prisma.user.update({
        where: { id: activeUser.id },
        data: { isCurrent: true },
      });

      // Create auth token with user context
      let userAuth = {
        id: activeUser.id,
        tradeRole: activeUser.tradeRole,
        userAccountId: activeUser.id, // Include the account context
      };

      let authToken = await this.authService.login(userAuth);
      const restokenData = authToken;

      // Exclude sensitive fields from response
      const { password: _pw, otp: _otp, otpValidTime: _otpTime, resetPassword: _rp, ...safeUser } = activeUser as any;

      return {
        status: true,
        message: 'Login Successfully',
        accessToken: restokenData.accessToken,
        refreshToken: restokenData.refreshToken,
        data: {
          ...safeUser,
          // Include personal info from Master Account
          email: masterAccount.email,
          firstName: masterAccount.firstName,
          lastName: masterAccount.lastName,
          phoneNumber: masterAccount.phoneNumber,
          cc: masterAccount.cc,
          profilePicture: masterAccount.profilePicture,
          dateOfBirth: masterAccount.dateOfBirth,
          gender: masterAccount.gender,
        },
      };
    } catch (error) {

      return {
        status: false,
        message: 'error in login',
        data: [],
      };
    }
  }

  /**
   * Authenticates a user via social (Google/Facebook) credentials.
   *
   * Looks up the user by email.  If found, issues a JWT.  If not found,
   * returns a "not found" response (auto-registration via social is
   * currently commented out).
   *
   * @param payload - `{ email: string, firstName?: string, lastName?: string,
   *                    loginType?: 'GOOGLE' | 'FACEBOOK' }`.
   * @returns JWT access token and user data, or not-found status.
   */
  async socialLogin(payload: any) {
    try {
      const email = payload.email?.toLowerCase();
      if (!email) {
        return {
          status: false,
          message: 'Email is required',
          data: [],
        };
      }

      // Check if Master Account exists
      let masterAccount = await this.prisma.masterAccount.findUnique({
        where: { email },
      });

      let user;
      const isNewUser = !masterAccount;

      if (!masterAccount) {
        // Auto-create user for social login (first time)
        const firstName = payload.firstName || 'User';
        const lastName = payload.lastName || '';
        const tradeRole = payload?.tradeRole || 'BUYER';
        const loginType = payload?.loginType || 'GOOGLE';
        let userTypeCategoryId = 22; // Buyer
        if (tradeRole === 'COMPANY' || tradeRole === 'FREELANCER') {
          userTypeCategoryId = 66; // Vendor
        }

        // Generate a random password for social login users (they won't use it)
        const salt = await genSalt(10);
        const randomPassword = Math.random().toString(36).slice(-12) + Date.now().toString(36);
        const hashedPassword = await hash(randomPassword, salt);

        // Create Master Account
        masterAccount = await this.prisma.masterAccount.create({
          data: {
            email,
            firstName,
            lastName,
            password: hashedPassword, // Required field - random password for social login
            phoneNumber: payload.phoneNumber || '', // Use from Google if available
            cc: payload.cc || '', // Use from Google if available
            gender: 'MALE', // Default
            dateOfBirth: payload.dateOfBirth ? new Date(payload.dateOfBirth) : null, // Use from Google if available
          },
        });

        // Create default User account (Buyer) linked to Master Account
        user = await this.prisma.user.create({
          data: {
            masterAccountId: masterAccount.id,
            accountName: `${firstName} ${lastName} - ${tradeRole}`,
            tradeRole: tradeRole as any,
            isActive: true,
            isCurrent: true,
            userTypeCategoryId,
            status: 'ACTIVE',
            // Company-specific fields for company accounts
            ...(tradeRole === 'COMPANY' && {
              companyName: `${firstName} ${lastName} Company`,
              companyAddress: '',
              companyPhone: '',
              companyWebsite: '',
              companyTaxId: '',
            }),
          },
        });

        // Update Master Account with last active user
        await this.prisma.masterAccount.update({
          where: { id: masterAccount.id },
          data: { lastActiveUserId: user.id },
        });

        // Generate uniqueId
        let idString = user.id.toString();
        let requestId;
        if (idString.length >= 7) {
          requestId = idString;
        } else {
          requestId = '0'.repeat(7 - idString.length) + idString;
        }

        // Create username from firstName + 4 random digits
        const cleanFirstName = firstName.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        const randomNumbers = Math.floor(1000 + Math.random() * 9000);
        const username = `${cleanFirstName}${randomNumbers}`;

        // Update user with uniqueId and username
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            uniqueId: requestId,
            userName: username,
          },
        });

        // Notify admins about new user registration
        try {
          const userName = `${firstName} ${lastName}`.trim();
          await notifyAdminsNewUser(
            this.notificationService,
            user.id, // userId parameter
            userName,
            email,
            tradeRole,
            this.prisma,
          );
        } catch (notifError) {
          // Don't fail registration if notification fails
        }
      } else {
        // User exists - get the current active user account
        user = await this.prisma.user.findFirst({
          where: {
            masterAccountId: masterAccount.id,
            isCurrent: true,
          },
        });

        if (!user) {
          // If no current user, get the first user account
          user = await this.prisma.user.findFirst({
            where: {
              masterAccountId: masterAccount.id,
            },
          });
        }
      }

      if (!user) {
        return {
          status: false,
          message: 'User account not found',
          data: [],
        };
      }

      // Generate auth token
      let userAuth = {
        id: user.id,
      };
      let authToken = await this.authService.login(userAuth);
      const restokenData = authToken;

      return {
        status: true,
        message: isNewUser ? 'Registered Successfully' : 'Login Successfully',
        accessToken: restokenData.accessToken,
        refreshToken: restokenData.refreshToken,
        data: user,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in socialLogin',
        data: [],
      };
    }
  }

  // ===========================================================================
  // SECTION: Profile Retrieval & Management
  // ===========================================================================

  /**
   * Returns the authenticated user's full profile.
   *
   * Supports the multi-account system:
   *  - If the JWT contains `userAccountId`, loads that sub-account's data.
   *  - Otherwise, loads the main account's data.
   *
   * The response merges User-level relations (phone, social links, profile,
   * branches) with personal info inherited from the MasterAccount.
   *
   * @param payload - Unused (reserved for future use).
   * @param req     - Express request containing `req.user` (JWT payload).
   * @returns Full user profile including nested relations.
   */
  async me(payload: any, req: any) {
    try {
      const userId = req?.user?.id || req?.user?.userId;
      const userAccountId = req?.user?.userAccountId; // Get account context from JWT


      // If user is in a sub-account context
      if (userAccountId) {

        // Get the sub-account user details
        const subAccountUser = await this.prisma.user.findUnique({
          where: { id: userAccountId },
          include: {
            masterAccount: true,
            userPhone: true,
            userSocialLink: true,
            userProfile: {
              include: {
                userProfileBusinessType: {
                  include: {
                    userProfileBusinessTypeTag: true,
                  },
                },
              },
            },
            userBranch: {
              include: {
                userBranchBusinessType: {
                  include: {
                    userBranch_BusinessType_Tag: true,
                  },
                },
                userBranchTags: {
                  include: {
                    userBranchTagsTag: true,
                  },
                },
                userBranch_userBranchCategory: {
                  include: {
                    userBranchCategory_category: true,
                  },
                },
              },
            },
          },
        });

        if (!subAccountUser) {
          return {
            status: false,
            message: 'Sub-account not found',
            data: null,
          };
        }

        // Check if the sub-account is banned (INACTIVE status)
        if (subAccountUser.status === 'INACTIVE') {
          return {
            status: false,
            message: 'Your account has been banned. Please contact administrator.',
            data: null,
          };
        }

        // Return sub-account user's data with personal info from Master Account
        const subAccountData = {
          ...subAccountUser,
          isSubAccount: true,
          userAccountId: userAccountId,
          // Personal info inherited from Master Account
          firstName: subAccountUser.masterAccount?.firstName,
          lastName: subAccountUser.masterAccount?.lastName,
          email: subAccountUser.masterAccount?.email,
          phoneNumber: subAccountUser.masterAccount?.phoneNumber,
          cc: subAccountUser.masterAccount?.cc,
          profilePicture: subAccountUser.masterAccount?.profilePicture,
          dateOfBirth: subAccountUser.masterAccount?.dateOfBirth,
          gender: subAccountUser.masterAccount?.gender,
        };


        return {
          status: true,
          message: 'Fetch Successfully',
          data: subAccountData,
        };
      }

      // User is using main account - existing logic

      let userDetail = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          masterAccount: true, // Include MasterAccount for personal info
          userPhone: true,
          userSocialLink: true,
          userProfile: {
            include: {
              userProfileBusinessType: {
                include: {
                  userProfileBusinessTypeTag: true,
                },
              },
            },
          },
          userBranch: {
            include: {
              userBranchBusinessType: {
                include: {
                  userBranch_BusinessType_Tag: true,
                },
              },
              userBranchTags: {
                include: {
                  userBranchTagsTag: true,
                },
              },
              userBranch_userBranchCategory: {
                include: {
                  userBranchCategory_category: true,
                },
              },
            },
          },
        },
      });

      if (!userDetail) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
        };
      }

      // Check if the account is banned (INACTIVE status)
      if (userDetail.status === 'INACTIVE') {
        return {
          status: false,
          message: 'Your account has been banned. Please contact administrator.',
          data: null,
        };
      }

      // Add main account identification and personal info from MasterAccount
      const mainAccountData = {
        ...userDetail,
        isSubAccount: false,
        userAccountId: null,
        // Personal info from MasterAccount
        firstName: userDetail.masterAccount?.firstName,
        lastName: userDetail.masterAccount?.lastName,
        email: userDetail.masterAccount?.email,
        phoneNumber: userDetail.masterAccount?.phoneNumber,
        cc: userDetail.masterAccount?.cc,
        profilePicture: userDetail.masterAccount?.profilePicture,
        dateOfBirth: userDetail.masterAccount?.dateOfBirth,
        gender: userDetail.masterAccount?.gender,
      };


      return {
        status: true,
        message: 'Fetch Successfully',
        data: mainAccountData,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error fetching user data',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Retrieves the authenticated user's details together with their assigned
   * role and associated permissions.
   *
   * Performs a deeply-nested select on the `userRoleDetail` -> `userRolePermission`
   * -> `permissionDetail` chain to deliver a complete RBAC snapshot.
   *
   * @param payload - Unused.
   * @param req     - Express request containing `req.user`.
   * @returns User record with role/permission hierarchy.
   */
  async getPermission(payload: any, req: any) {
    try {
      // Handle both user object structures (from User model or custom object)
      const userId = req?.user?.id || req?.user?.userId;
      let userDetail = await this.prisma.user.findFirst({
        where: { id: userId },
        select: {
          id: true,
          uniqueId: true,
          email: true,
          firstName: true,
          lastName: true,
          userName: true,
          gender: true,
          status: true,
          dateOfBirth: true,
          phoneNumber: true,
          cc: true,
          tradeRole: true,
          otp: true,
          otpValidTime: true,
          resetPassword: true,
          profilePicture: true,
          identityProof: true,
          identityProofBack: true,
          onlineOffline: true,
          onlineOfflineDateStatus: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          userType: true,
          loginType: true,
          employeeId: true,
          userRoleName: true,
          userRoleId: true,
          customerId: true,
          stripeAccountId: true,
          addedBy: true,

          // Nested relation
          userRoleDetail: {
            select: {
              id: true,
              userRoleName: true,
              addedBy: true,
              status: true,
              createdAt: true,
              updatedAt: true,
              deletedAt: true,

              // Include permissions
              userRolePermission: {
                select: {
                  id: true,
                  userRoleId: true,
                  permissionId: true,
                  status: true,
                  createdAt: true,
                  updatedAt: true,
                  deletedAt: true,
                  permissionDetail: {
                    select: {
                      id: true,
                      name: true,
                      addedBy: true,
                      status: true,
                      createdAt: true,
                      updatedAt: true,
                      deletedAt: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!userDetail) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
        };
      }

      return {
        status: true,
        message: 'Fetch Successfully',
        data: userDetail,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in me',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Updates the authenticated user's profile.
   *
   * Splits the update into two targets:
   *  - **MasterAccount** -- personal fields (name, email, phone, DOB, gender,
   *    profile picture).
   *  - **User** -- account-specific fields (username, identity proof).
   *
   * Additionally performs bulk-replace operations for:
   *  - Phone numbers (deletes all, re-creates from `phoneNumberList`).
   *  - Social links (deletes all, re-creates from `socialLinkList`).
   *  - Business categories (deletes all, re-creates from
   *    `userBusinessCategoryList`).
   *
   * Supports sub-account context via `userAccountId` in the JWT.
   *
   * @param payload - Object with optional updatable fields.
   * @param req     - Express request containing `req.user`.
   * @returns Updated user data merged with the updated MasterAccount.
   */
  async updateProfile(payload: any, req: any) {
    try {
      // Handle both user object structures (from User model or custom object)
      const userId = req?.user?.id || req?.user?.userId;
      const userAccountId = req?.user?.userAccountId; // Get account context from JWT


      // Determine which user ID to use for profile update
      const targetUserId = userAccountId || userId;

      // Get the current user to verify they exist
      const currentUser = await this.prisma.user.findUnique({
        where: { id: targetUserId },
        include: { masterAccount: true },
      });

      if (!currentUser || !currentUser.masterAccount) {
        return {
          status: false,
          message: 'User or Master Account not found',
          data: null,
        };
      }


      let userDetail = currentUser; // Use currentUser for backward compatibility

      // Check if username already exists
      if (payload?.userName) {
        let existUserName = await this.prisma.user.findFirst({
          where: {
            userName: payload?.userName,
            id: { not: targetUserId }, // Exclude current user
          },
        });
        if (existUserName) {
          return {
            status: false,
            message: 'userName already exists',
            data: null,
          };
        }
      }

      // Update Master Account (personal information)
      const updatedMasterAccount = await this.prisma.masterAccount.update({
        where: { id: currentUser.masterAccount.id },
        data: {
          firstName: payload.firstName || currentUser.masterAccount.firstName,
          lastName: payload.lastName || currentUser.masterAccount.lastName,
          email: payload.email || currentUser.masterAccount.email,
          phoneNumber:
            payload.phoneNumberList?.[0]?.phoneNumber ||
            currentUser.masterAccount.phoneNumber,
          cc: payload.phoneNumberList?.[0]?.cc || currentUser.masterAccount.cc,
          dateOfBirth:
            payload.dateOfBirth || currentUser.masterAccount.dateOfBirth,
          gender: payload.gender || currentUser.masterAccount.gender,
          profilePicture:
            payload.profilePicture || currentUser.masterAccount.profilePicture,
        },
      });

      // Check if identity proof is being uploaded (was null/empty before, now has value)
      const isIdentityProofUploaded =
        (!currentUser.identityProof && payload.identityProof) ||
        (!currentUser.identityProofBack && payload.identityProofBack);

      // Update User account (other details)
      let updatedUser = await this.prisma.user.update({
        where: { id: targetUserId },
        data: {
          userName: payload.userName || currentUser.userName,
          identityProof: payload.identityProof || currentUser.identityProof,
          identityProofBack:
            payload.identityProofBack || currentUser.identityProofBack,
        },
      });

      // Notify admins if identity proof was uploaded
      if (isIdentityProofUploaded) {
        try {
          const masterAccount = currentUser.masterAccount;
          const userName =
            masterAccount?.firstName && masterAccount?.lastName
              ? `${masterAccount.firstName} ${masterAccount.lastName}`.trim()
              : currentUser.userName || 'Unknown User';
          await notifyAdminsIdentityProofUpload(
            this.notificationService,
            targetUserId,
            userName,
            this.prisma,
          );
        } catch (notifError) {
        }
      }
      if (payload.phoneNumberList) {
        await this.prisma.userPhone.deleteMany({
          where: { userId: targetUserId },
        });
        let numberList = payload.phoneNumberList;
        for (let i = 0; i < numberList.length; i++) {
          let addUserPhone = await this.prisma.userPhone.create({
            data: {
              userId: targetUserId,
              cc: numberList[i]?.cc || '+91',
              phoneNumber: numberList[i].phoneNumber,
            },
          });
        }
      }

      if (payload.socialLinkList) {
        await this.prisma.userSocialLink.deleteMany({
          where: { userId: targetUserId },
        });
        let linkList = payload.socialLinkList;
        for (let j = 0; j < linkList.length; j++) {
          let addUserSocialLink = await this.prisma.userSocialLink.create({
            data: {
              userId: targetUserId,
              linkType: linkList[j].linkType,
              link: linkList[j].link,
            },
          });
        }
      }

      if (payload?.userBusinessCategoryList) {
        await this.prisma.userBusinessCategory.deleteMany({
          where: { userId: targetUserId },
        });
        let categoryList = payload.userBusinessCategoryList;
        for (let k = 0; k < categoryList.length; k++) {
          let addUserBusinessCategory =
            await this.prisma.userBusinessCategory.create({
              data: {
                userId: targetUserId,
                categoryId: categoryList[k].value || categoryList[k].categoryId,
                categoryLocation: categoryList[k].categoryLocation || '',
              },
            });
        }
      }

      return {
        status: true,
        message: 'Profile Updated Successfully',
        data: {
          ...updatedUser,
          tradeRole: currentUser.tradeRole,
          masterAccount: updatedMasterAccount,
        },
      };
    } catch (error) {

      return {
        status: false,
        message: 'error in updateProfile',
        error: getErrorMessage(error),
      };
    }
  }

  // ===========================================================================
  // SECTION: Password Management
  // ===========================================================================

  /**
   * Changes the password for the currently authenticated user.
   *
   * Verifies the current password first, then checks that `newPassword`
   * matches `confirmPassword` before hashing and persisting the new value.
   *
   * @param payload - `{ password: string, newPassword: string, confirmPassword: string }`.
   * @param req     - Express request containing `req.user`.
   * @returns Updated user record on success.
   */
  async changePassword(payload: any, req: any) {
    try {
      const userId = req?.user?.id;
      let userDetail = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (!userDetail) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
        };
      }

      if (compareSync(payload.password, userDetail.password)) {
        if (payload.newPassword != payload.confirmPassword) {
          return {
            status: false,
            message: 'Password Missmatch',
            data: [],
          };
        }
        const salt = await genSalt(10);
        const password = await hash(payload.newPassword, salt);

        let updatedUserDetail = await this.prisma.user.update({
          where: { id: userId },
          data: { password: password },
        });

        return {
          status: true,
          message: 'The password has been updated successfully.',
          data: updatedUserDetail,
        };
      } else {
        return {
          status: false,
          message: 'Invalid Credential',
          data: [],
        };
      }
    } catch (error) {
      return {
        status: false,
        message: 'error in changePassword',
        error: getErrorMessage(error),
      };
    }
  }

  // ===========================================================================
  // SECTION: User Lookup
  // ===========================================================================

  /**
   * Retrieves a paginated list of all users (page 1, size 10 -- currently
   * hard-coded).
   *
   * Includes associated phone records.
   *
   * @returns Array of user objects with phone data.
   */
  async findAll() {
    try {
      let page = 1;
      let pageSize = 10;
      const skip = (page - 1) * pageSize; // Calculate the offset
      let allUser = await this.prisma.user.findMany({
        include: {
          userPhone: true,
        },
        skip, // Offset
        take: pageSize, // Limit
      });
      if (!allUser) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
          totalCount: 0,
        };
      }

      return {
        status: true,
        message: 'Fetch Successfully',
        data: allUser,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in findAll',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Fetches a single user by ID with deeply-nested profile and branch data,
   * plus active business category associations.
   *
   * @param payload - `{ userId: number }`.
   * @returns Full user record including profiles, branches, and categories.
   */
  async findUnique(payload: any) {
    try {
      const userId = payload.userId;
      let userDetail = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          userPhone: true,
          userSocialLink: true,
          userProfile: {
            include: {
              userProfileBusinessType: {
                include: {
                  userProfileBusinessTypeTag: true,
                },
              },
            },
          },
          userBranch: {
            include: {
              userBranchBusinessType: {
                include: {
                  userBranch_BusinessType_Tag: true,
                },
              },
              userBranchTags: {
                include: {
                  userBranchTagsTag: true,
                },
              },
            },
          },
        },
      });
      if (!userDetail) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
        };
      }
      const userBusinesCategoryDetail =
        await this.prisma.userBusinessCategory.findMany({
          where: {
            userId: userId,
            status: 'ACTIVE',
          },
          include: {
            categoryDetail: true,
          },
        });
      return {
        status: true,
        message: 'Fetch Successfully',
        data: {
          ...userDetail,
          userBusinesCategoryDetail,
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in findUnique',
        error: getErrorMessage(error),
      };
    }
  }

  // ===========================================================================
  // SECTION: Phone & Social Link Management
  // ===========================================================================

  /**
   * Adds a new phone number entry for the authenticated user.
   *
   * @param payload - `{ phoneNumber: string }`.
   * @param req     - Express request containing `req.user`.
   * @returns Newly created UserPhone record.
   */
  async addUserPhone(payload: any, req: any) {
    try {
      const userId = req?.user?.id;
      const { phoneNumber } = payload;

      const newUserPhone = await this.prisma.userPhone.create({
        data: {
          phoneNumber,
          userId,
        },
      });

      return {
        status: true,
        message: 'User phone added successfully',
        data: newUserPhone,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to add user phone',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Adds a social-media link (e.g. LinkedIn, Twitter) for the authenticated user.
   *
   * @param payload - `{ linkType: string, link: string }`.
   * @param req     - Express request containing `req.user`.
   * @returns Newly created UserSocialLink record.
   */
  async addUserSocialLink(payload: any, req: any) {
    try {
      const userId = req?.user?.id;
      let addUserSocialLink = await this.prisma.userSocialLink.create({
        data: {
          userId: userId,
          linkType: payload.linkType,
          link: payload.link,
        },
      });
      return {
        status: true,
        message: 'Added Successfully',
        data: addUserSocialLink,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in addUserSocialLink',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Retrieves a single UserPhone record by its ID, including the
   * associated user.
   *
   * @param payload - `{ userId: number }` (note: used as userPhone ID).
   * @returns UserPhone record with related user data.
   */
  async viewOneUserPhone(payload: any) {
    try {
      const userId = payload.userId;
      let userDetail = await this.prisma.userPhone.findUnique({
        where: { id: userId },
        include: {
          user: true,
        },
      });
      if (!userDetail) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
        };
      }
      return {
        status: true,
        message: 'Fetch Successfully',
        data: userDetail,
      };
    } catch (error) {}
  }

  // ===========================================================================
  // SECTION: Password Recovery (Forget / Verify OTP / Reset)
  // ===========================================================================

  /**
   * Initiates the forgot-password flow.
   *
   * Validates the email, generates a 4-digit OTP (5-minute expiry), sets
   * `resetPassword = 1` on the user record, generates a JWT-based reset
   * link, and dispatches the OTP via email.
   *
   * @param payload - `{ email: string }`.
   * @returns OTP value and confirmation message, or inactive/deleted status.
   */
  async forgetPassword(payload: any) {
    try {
      if (payload.email) {
        let re =
          /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
        if (!re.test(String(payload.email))) {
          return {
            status: 'false',
            message: 'enter a valid email',
            data: [],
          };
        }
        payload.email = payload.email.toLowerCase();
      }

      let userDetail = await this.prisma.user.findUnique({
        where: { email: payload.email },
      });
      if (!userDetail) {
        return {
          status: false,
          message:
            'If you are register users you will get the instruction of reset password shortly',
          data: [],
        };
      }

      if (userDetail && userDetail.status == 'ACTIVE') {
        let userAuth = {
          id: userDetail.id,
        };
        let otp = Math.floor(1000 + Math.random() * 9000);
        let otpValidTime = new Date(new Date().getTime() + parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10) * 60000);
        await this.prisma.user.update({
          where: { id: userDetail.id },
          data: {
            resetPassword: 1,
            otp: otp,
            otpValidTime: otpValidTime,
          },
        });
        let authToken = await this.authService.getToken(userAuth);
        const restokenData = authToken;
        var link =
          process.env.FRONTEND_SERVER +
          '/reset?token=' +
          restokenData.accessToken;

        let data = {
          email: userDetail.email,
          name: userDetail.firstName,
          otp: otp,
          link: link,
        };
        this.notificationService.sendOtp(data);

        return {
          status: true,
          message: 'A verification OTP was sent to your email.',
          // data: link,
          otp: otp,
        };
      } else if (userDetail && userDetail.status == 'INACTIVE') {
        return {
          status: false,
          message: 'User Account InActive',
          data: [],
        };
      } else {
        return {
          status: false,
          message: 'User Account Deleted',
          data: [],
        };
      }
    } catch (error) {
      return {
        status: false,
        message: 'error in forgetPassword',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Verifies an OTP during the forgot-password flow.
   *
   * Checks the OTP value and expiry.  On success, clears the OTP fields
   * and issues a JWT access token so the user can proceed to reset their
   * password.
   *
   * @param payload - `{ email: string, otp: number }`.
   * @returns JWT access token on success.
   */
  async verifyOtp(payload: any) {
    try {
      const email = payload.email;
      const otp = payload.otp;
      const userDetail = await this.prisma.user.findUnique({
        where: { email },
      });
      if (!userDetail) {
        return {
          status: false,
          message: 'User not found',
          data: [],
        };
      }
      if (otp !== userDetail.otp) {
        return {
          status: false,
          message: 'Invalid OTP',
          data: userDetail,
        };
      }
      if (new Date() > userDetail.otpValidTime) {
        return {
          status: false,
          message: 'Otp Expires',
          data: [],
        };
      }
      let updatedUserDetail = await this.prisma.user.update({
        where: { email },
        data: {
          otp: null,
          otpValidTime: null,
        },
      });

      let userAuth = {
        id: userDetail.id,
      };
      let authToken = await this.authService.login(userAuth);
      const restokenData = authToken;
      return {
        status: true,
        message: 'OTP Verified Successfully',
        accessToken: restokenData.accessToken,
        refreshToken: restokenData.refreshToken,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in verfityOtp',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Resets the user's password after OTP verification.
   *
   * Requires `resetPassword == 1` on the user record (set during
   * `forgetPassword`).  Validates that `newPassword` matches
   * `confirmPassword`, hashes the new password, and clears the
   * `resetPassword` flag.
   *
   * @param payload - `{ newPassword: string, confirmPassword: string }`.
   * @param req     - Express request containing `req.user` (JWT from OTP verify step).
   * @returns Updated user record.
   */
  async resetPassword(payload: any, req: any) {
    try {
      // Handle both user object structures (from User model or custom object)
      const userId = req.user.id || req.user.userId;
      let userDetail = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (userDetail && userDetail.resetPassword == 1) {
        if (payload.newPassword != payload.confirmPassword) {
          return {
            status: false,
            message: 'PassWord Mismatch',
            data: [],
          };
        }
        const salt = await genSalt(10);
        const password = await hash(payload.newPassword, salt);

        let updatedUserDetail = await this.prisma.user.update({
          where: { id: userId },
          data: { resetPassword: 0, password: password },
        });

        return {
          status: true,
          message: 'The password has been updated successfully.',
          data: updatedUserDetail,
        };
      } else {
        return {
          status: false,
          message: 'Invalid Link',
          data: [],
        };
      }
    } catch (error) {
      return {
        status: false,
        message: 'error in resetPassword',
        error: getErrorMessage(error),
      };
    }
  }

  // ===========================================================================
  // SECTION: User Profile (Company / Freelancer) CRUD
  // ===========================================================================

  /**
   * Creates a new UserProfile and optionally associated branches, business
   * types, and categories.
   *
   * Supports the multi-account context (uses `userAccountId` from JWT when
   * available).  Profile fields are only persisted when they carry a value.
   *
   * @param payload - Object containing profile fields (`aboutUs`,
   *                  `companyName`, `address`, ...), `branchList[]`, and
   *                  `businessTypeList[]`.
   * @param req     - Express request containing `req.user`.
   * @returns Newly created UserProfile record.
   */
  async userProfile(payload: any, req: any) {
    try {
      // Handle both user object structures (from User model or custom object)
      const userId = req?.user?.id || req?.user?.userId;
      const userAccountId = req?.user?.userAccountId; // Get account context from JWT


      // Determine which user ID to use for profile creation
      const targetUserId = userAccountId || userId;

      // Get the current user to verify they exist
      const currentUser = await this.prisma.user.findUnique({
        where: { id: targetUserId },
        include: { masterAccount: true },
      });

      if (!currentUser) {
        return {
          status: false,
          message: 'User not found',
          data: null,
        };
      }


      // Create user profile
      let addUserProfile = null;
      if (payload.aboutUs || payload.companyName || payload.address) {
        // Build profile data object, only including non-null values
        const profileData: any = {
          userId: targetUserId,
          profileType: payload.profileType || 'FREELANCER',
        };

        // Only add fields that have actual values (not null or empty)
        if (payload.aboutUs) profileData.aboutUs = payload.aboutUs;
        if (payload.logo) profileData.logo = payload.logo;
        if (payload.companyName) profileData.companyName = payload.companyName;
        if (payload.address) profileData.address = payload.address;
        if (payload.city) profileData.city = payload.city;
        if (payload.province) profileData.province = payload.province;
        if (payload.country) profileData.country = payload.country;
        if (payload.yearOfEstablishment)
          profileData.yearOfEstablishment = payload.yearOfEstablishment;
        if (payload.totalNoOfEmployee)
          profileData.totalNoOfEmployee = payload.totalNoOfEmployee;
        if (payload.annualPurchasingVolume)
          profileData.annualPurchasingVolume = payload.annualPurchasingVolume;
        if (payload.cc) profileData.cc = payload.cc;
        if (payload.phoneNumber) profileData.phoneNumber = payload.phoneNumber;


        addUserProfile = await this.prisma.userProfile.create({
          data: profileData,
        });
      }

      // Create user branches
      if (payload.branchList && payload.branchList.length > 0) {
        for (const branchData of payload.branchList) {
          const branch = await this.prisma.userBranch.create({
            data: {
              userId: targetUserId,
              profileType: branchData.profileType || 'FREELANCER',
              address: branchData.address,
              city: branchData.city,
              province: branchData.province,
              country: branchData.country,
              contactNumber: branchData.contactNumber,
              contactName: branchData.contactName,
              startTime: branchData.startTime,
              endTime: branchData.endTime,
              workingDays: JSON.stringify(branchData.workingDays || {}),
              mainOffice: branchData.mainOffice || 0,
              cc: branchData.cc,
              userProfileId: addUserProfile?.id || 0, // Link to user profile
            },
          });

          // Create business type associations
          if (
            branchData.businessTypeList &&
            branchData.businessTypeList.length > 0
          ) {
            for (const businessType of branchData.businessTypeList) {
              await this.prisma.userBranchBusinessType.create({
                data: {
                  userBranchId: branch.id,
                  businessTypeId: businessType.businessTypeId,
                  userId: targetUserId,
                },
              });
            }
          }

          // Create category associations
          if (branchData.categoryList && branchData.categoryList.length > 0) {
            for (const category of branchData.categoryList) {
              await this.prisma.userBranchCategory.create({
                data: {
                  userBranchId: branch.id,
                  categoryId: category.categoryId,
                  categoryLocation: category.categoryLocation || '',
                  userId: targetUserId,
                },
              });
            }
          }
        }
      }

      // Create business type associations for company profiles (not just branches)
      if (
        payload.businessTypeList &&
        Array.isArray(payload.businessTypeList) &&
        payload.businessTypeList.length > 0 &&
        addUserProfile
      ) {
        for (const businessType of payload.businessTypeList) {
          if (businessType && businessType.businessTypeId) {
            await this.prisma.userProfileBusinessType.create({
              data: {
                userId: targetUserId,
                userProfileId: addUserProfile.id,
                businessTypeId: businessType.businessTypeId,
              },
            });
          }
        }
      }

      return {
        status: true,
        message: 'User Profile Created Successfully',
        data: addUserProfile,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in userprofile',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Updates an existing UserProfile by its `userProfileId`.
   *
   * Merges supplied fields with existing values (keeps old value if new
   * one is falsy).  When `businessTypeList` is provided, performs a
   * delete-all-then-recreate via `businessTypeAdd()`.
   *
   * @param payload - Object containing `userProfileId` and optional fields.
   * @param req     - Express request (unused beyond error logging).
   * @returns Updated UserProfile record.
   */
  async updateUserProfile(payload: any, req: any) {
    try {
      const userProfileId = payload.userProfileId;

      if (!userProfileId) {
        return {
          status: false,
          message: 'userProfileId is required',
          data: null,
        };
      }

      let userProfileDetail = await this.prisma.userProfile.findUnique({
        where: { id: userProfileId },
      });

      if (!userProfileDetail) {
        return {
          status: false,
          message: 'User profile not found',
          data: null,
        };
      }

      let updateUserProfile = await this.prisma.userProfile.update({
        where: { id: userProfileId },
        data: {
          logo: payload.logo || userProfileDetail.logo,
          companyName: payload.companyName || userProfileDetail.companyName,
          aboutUs: payload.aboutUs || userProfileDetail.aboutUs,
          address: payload.address || userProfileDetail.address,
          city: payload.city || userProfileDetail.city,
          province: payload.province || userProfileDetail.province,
          country: payload.country || userProfileDetail.country,
          yearOfEstablishment:
            payload.yearOfEstablishment ||
            userProfileDetail.yearOfEstablishment,
          totalNoOfEmployee:
            payload.totalNoOfEmployee || userProfileDetail.totalNoOfEmployee,
          annualPurchasingVolume:
            payload.annualPurchasingVolume ||
            userProfileDetail.annualPurchasingVolume,
          cc: payload?.cc || userProfileDetail.cc,
          phoneNumber: payload?.phoneNumber || userProfileDetail.phoneNumber,
        },
      });
      if (payload.businessTypeList) {
        await this.prisma.userProfileBusinessType.deleteMany({
          where: { userProfileId: userProfileId },
        });
        let obj1: any = {};
        obj1.businessTypeList = payload.businessTypeList;
        obj1.userProfileId = userProfileId;
        obj1.userId = userProfileDetail.userId;
        await this.businessTypeAdd(obj1);
      }
      return {
        status: true,
        message: 'Updated Successfully',
        data: updateUserProfile,
        // payload: payload
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in updateUserProfile',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Helper: Bulk-creates UserProfileBusinessType associations.
   *
   * Iterates over `obj1.businessTypeList` and creates a record for each
   * entry, linking it to the specified user and profile.
   *
   * @param obj1 - `{ userId, userProfileId, businessTypeList: Array<{ businessTypeId }> }`.
   * @internal Called by `updateUserProfile()`.
   */
  async businessTypeAdd(obj1: any) {
    try {
      for (let i = 0; i < obj1.businessTypeList.length; i++) {
        let userProfileBusinessType =
          await this.prisma.userProfileBusinessType.create({
            data: {
              userId: obj1.userId,
              userProfileId: obj1.userProfileId,
              businessTypeId: obj1.businessTypeList[i].businessTypeId,
            },
          });
      }
    } catch (error) {
      return {
        status: false,
        message: 'error in businessTypeAdd',
        error: getErrorMessage(error),
      };
    }
  }

  // ===========================================================================
  // SECTION: Branch Management
  // ===========================================================================

  /**
   * Helper: Bulk-creates UserBranch records (with nested business types,
   * tags, and categories) from a branch list.
   *
   * For each branch in `obj.branchList`:
   *  1. Creates the UserBranch record.
   *  2. Creates UserBranchBusinessType entries.
   *  3. Creates UserBranchTags entries.
   *  4. Creates UserBranchCategory entries.
   *
   * @param obj - `{ userId, userProfileId, branchList: Array<BranchPayload> }`.
   * @internal Called during profile creation.
   */
  async branchAdd(obj: any) {
    try {
      for (let i = 0; i < obj.branchList.length; i++) {
        let addUserBranch = await this.prisma.userBranch.create({
          data: {
            userId: obj.userId,
            userProfileId: obj.userProfileId,
            mainOffice: obj.branchList[i].mainOffice,
            profileType: obj.branchList[i].profileType,
            branchFrontPicture: obj.branchList[i].branchFrontPicture,
            proofOfAddress: obj.branchList[i].proofOfAddress,
            address: obj.branchList[i].address,
            city: obj.branchList[i].city,
            province: obj.branchList[i].province,
            country: obj.branchList[i].country,
            cc: obj.branchList[i].cc,
            contactNumber: obj.branchList[i].contactNumber,
            contactName: obj.branchList[i].contactName,
            startTime: obj.branchList[i].startTime,
            endTime: obj.branchList[i].endTime,
            workingDays: JSON.stringify(obj.branchList[i].workingDays), // Convert object to string
          },
        });

        if (
          obj.branchList[i].businessTypeList &&
          obj.branchList[i].businessTypeList.length
        ) {
          // To add businessType
          for (let j = 0; j < obj.branchList[i].businessTypeList.length; j++) {
            let addBranchBusniessType =
              await this.prisma.userBranchBusinessType.create({
                data: {
                  userId: obj.userId,
                  userBranchId: addUserBranch.id,
                  businessTypeId:
                    obj.branchList[i].businessTypeList[j].businessTypeId,
                },
              });
          }
        }

        if (obj.branchList[i].tagList && obj.branchList[i].tagList.length) {
          for (let k = 0; k < obj.branchList[i].tagList.length; k++) {
            let addUserBranchTag = await this.prisma.userBranchTags.create({
              data: {
                userId: obj.userId,
                userBranchId: addUserBranch.id,
                tagId: obj.branchList[i].tagList[k].tagId,
              },
            });
          }
        }

        if (
          obj.branchList[i].categoryList &&
          obj.branchList[i].categoryList.length
        ) {
          for (let m = 0; m < obj.branchList[i].categoryList.length; m++) {
            let addUserBranchCategory = await this.prisma.userBranchCategory.create({
              data: {
                userId: obj.userId,
                userBranchId: addUserBranch.id,
                categoryId: obj.branchList[i].categoryList[m].categoryId,
                categoryLocation:
                  obj.branchList[i].categoryList[m].categoryLocation,
              },
            });
          }
        }
      }
    } catch (error) {
      return {
        status: false,
        message: 'error in branchAdd',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Updates an existing branch by `branchId`.
   *
   * If `mainOffice` is set to 1, first demotes all other branches for
   * the same user.  Merges supplied values with existing ones.  Also
   * replaces business-type, tag, and category associations via
   * `updateBranchBusinessType`, `updateBranchTags`, and
   * `updateBranchCategory` helpers.
   *
   * @param payload - Branch fields plus optional `businessTypeList`,
   *                  `tagList`, `categoryList`.
   * @param req     - Express request containing `req.user`.
   * @returns Updated UserBranch record.
   */
  async updateBranch(payload: any, req: any) {
    try {
      const userId = req?.user?.id;

      if (payload?.mainOffice == 1) {
        // if mainOffice == 1, setting other mainOffice = 0
        await this.prisma.userBranch.updateMany({
          where: { userId: userId, mainOffice: 1 },
          data: { mainOffice: 0 },
        });
      }

      const branchId = payload.branchId;
      let branchDetail = await this.prisma.userBranch.findUnique({
        where: { id: branchId },
      });
      let updateBranch = await this.prisma.userBranch.update({
        where: { id: branchId },
        data: {
          mainOffice: payload.mainOffice || branchDetail.mainOffice,
          profileType: payload.profileType || branchDetail.profileType,
          branchFrontPicture:
            payload.branchFrontPicture || branchDetail.branchFrontPicture,
          proofOfAddress: payload.proofOfAddress || branchDetail.proofOfAddress,
          address: payload.address || branchDetail.address,
          city: payload.city || branchDetail.city,
          province: payload.province || branchDetail.province,
          country: payload.country || branchDetail.country,
          cc: payload.cc || branchDetail.cc,
          contactNumber: payload.contactNumber || branchDetail.contactNumber,
          contactName: payload.contactName || branchDetail.contactName,
          startTime: payload.startTime || branchDetail.startTime,
          endTime: payload.endTime || branchDetail.endTime,
          workingDays:
            JSON.stringify(payload.workingDays) || branchDetail.workingDays,
        },
      });
      if (payload.businessTypeList && payload.businessTypeList.length > 0) {
        await this.prisma.userBranchBusinessType.deleteMany({
          where: { userBranchId: branchId },
        });
        let obj: any = {};
        obj.businessTypeList = payload.businessTypeList;
        obj.branchId = branchId;
        obj.userId = branchDetail.userId;
        await this.updateBranchBusinessType(obj);
      }

      if (payload.tagList && payload.tagList.length > 0) {
        await this.prisma.userBranchTags.deleteMany({
          where: { userBranchId: branchId },
        });
        let obj1: any = {};
        obj1.tagList = payload.tagList;
        obj1.branchId = branchId;
        obj1.userId = branchDetail.userId;
        await this.updateBranchTags(obj1);
      }

      if (payload.categoryList && payload.categoryList.length > 0) {
        await this.prisma.userBranchCategory.deleteMany({
          where: { userBranchId: branchId },
        });
        let obj2: any = {};
        obj2.categoryList = payload.categoryList;
        obj2.branchId = branchId;
        obj2.userId = branchDetail.userId;
        await this.updateBranchCategory(obj2);
      }

      return {
        status: true,
        message: 'Update Successfully',
        data: updateBranch,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in updateBranch',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Helper: Re-creates business-type associations for a branch.
   *
   * @param obj - `{ userId, branchId, businessTypeList: Array<{ businessTypeId }> }`.
   * @internal Called by `updateBranch()`.
   */
  async updateBranchBusinessType(obj: any) {
    if (obj?.businessTypeList && obj.businessTypeList.length > 0) {
      // To add businessType
      for (let j = 0; j < obj.businessTypeList.length; j++) {
        let addBranchBusniessType = await this.prisma.userBranchBusinessType.create({
          data: {
            userId: obj.userId,
            userBranchId: obj.branchId,
            businessTypeId: obj.businessTypeList[j].businessTypeId,
          },
        });
      }
    }
  }

  /**
   * Helper: Re-creates tag associations for a branch.
   *
   * @param obj1 - `{ userId, branchId, tagList: Array<{ tagId }> }`.
   * @internal Called by `updateBranch()`.
   */
  async updateBranchTags(obj1: any) {
    if (obj1?.tagList && obj1?.tagList?.length > 0) {
      for (let k = 0; k < obj1.tagList.length; k++) {
        let addUserBranchTag = await this.prisma.userBranchTags.create({
          data: {
            userId: obj1.userId,
            userBranchId: obj1.branchId,
            tagId: obj1.tagList[k].tagId,
          },
        });
      }
    }
  }

  /**
   * Helper: Re-creates category associations for a branch.
   *
   * @param obj2 - `{ userId, branchId, categoryList: Array<{ categoryId, categoryLocation }> }`.
   * @internal Called by `updateBranch()`.
   */
  async updateBranchCategory(obj2: any) {
    if (obj2?.categoryList && obj2?.categoryList?.length > 0) {
      for (let m = 0; m < obj2.categoryList.length; m++) {
        let addUserBranchCategory = await this.prisma.userBranchCategory.create({
          data: {
            userId: obj2.userId,
            userBranchId: obj2.branchId,
            categoryId: obj2.categoryList[m].categoryId,
            categoryLocation: obj2.categoryList[m].categoryLocation,
          },
        });
      }
    }
  }

  // ===========================================================================
  // SECTION: Tags
  // ===========================================================================

  /**
   * Retrieves all active tags.
   *
   * @returns Array of active Tag records with a total count.
   */
  async viewTags() {
    try {
      let allTags = await this.prisma.tags.findMany({
        where: { status: 'ACTIVE' },
        take: 200, // Default cap for dropdown/tag lists
      });
      if (!allTags) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
          totalCount: 0,
        };
      }

      return {
        status: true,
        message: 'Fetch Successfully',
        data: allTags,
        totalCount: allTags.length,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in viewTag',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Creates a new tag, attributed to the authenticated user.
   *
   * @param payload - `{ tagName: string }`.
   * @param req     - Express request containing `req.user`.
   * @returns Newly created Tag record.
   */
  async createTag(payload: any, req: any) {
    try {
      // Handle both user object structures (from User model or custom object)
      const userId = req.user.id || req.user.userId;
      let addTag = await this.prisma.tags.create({
        data: {
          tagName: payload.tagName,
          addedBy: userId,
        },
      });

      return {
        status: true,
        message: 'Added Succesfully',
        data: addTag,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in createTag',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Adds a new branch to an already-existing profile (post-edit scenario).
   *
   * Handles `mainOffice` flag demotion, creates the branch, and
   * associates business types, tags, and categories.  Supports sub-account
   * context via `userAccountId`.
   *
   * @param payload - Full branch payload including nested lists.
   * @param req     - Express request containing `req.user`.
   * @returns Newly created UserBranch record.
   */
  async addBranchAfterEdit(payload: any, req: any) {
    try {
      // Handle both user object structures (from User model or custom object)
      const userId = req?.user?.id || req?.user?.userId;
      const userAccountId = req?.user?.userAccountId; // Get account context from JWT

      // Use sub-account ID if in sub-account context, otherwise use main user ID
      const targetUserId = userAccountId || userId;

      if (payload?.mainOffice == 1) {
        // if mainOffice == 1, setting other mainOffice = 0
        await this.prisma.userBranch.updateMany({
          where: { userId: targetUserId, mainOffice: 1 },
          data: { mainOffice: 0 },
        });
      }

      let addUserBranch = await this.prisma.userBranch.create({
        data: {
          userId: targetUserId,
          userProfileId: payload.userProfileId,
          mainOffice: payload.mainOffice,
          profileType: payload.profileType,
          branchFrontPicture: payload.branchFrontPicture,
          proofOfAddress: payload.proofOfAddress,
          address: payload.address,
          city: payload.city,
          province: payload.province,
          country: payload.country,
          cc: payload.cc,
          contactNumber: payload.contactNumber,
          contactName: payload.contactName,
          startTime: payload.startTime,
          endTime: payload.endTime,
          workingDays: JSON.stringify(payload.workingDays), // Convert object to string
        },
      });

      if (payload.businessTypeList && payload.businessTypeList.length) {
        // To add businessType
        for (let j = 0; j < payload.businessTypeList.length; j++) {
          let addBranchBusniessType =
            await this.prisma.userBranchBusinessType.create({
              data: {
                userId: targetUserId,
                userBranchId: addUserBranch.id,
                businessTypeId: payload.businessTypeList[j].businessTypeId,
              },
            });
        }
      }

      if (payload.tagList && payload.tagList.length) {
        for (let k = 0; k < payload.tagList.length; k++) {
          let addUserBranchTag = await this.prisma.userBranchTags.create({
            data: {
              userId: targetUserId,
              userBranchId: addUserBranch.id,
              tagId: payload.tagList[k].tagId,
            },
          });
        }
      }

      if (payload.categoryList && payload.categoryList.length) {
        for (let k = 0; k < payload.categoryList.length; k++) {
          let addUserBranchCategory = await this.prisma.userBranchCategory.create({
            data: {
              userId: targetUserId,
              userBranchId: addUserBranch.id,
              categoryId: payload.categoryList[k].categoryId,
              categoryLocation: payload.categoryList[k].categoryLocation,
            },
          });
        }
      }

      return {
        status: true,
        message: 'Branch Added Successfully',
        data: addUserBranch,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in addBranchAfterEdit',
        error: getErrorMessage(error),
      };
    }
  }

  // ===========================================================================
  // SECTION: Email Change
  // ===========================================================================

  /**
   * Initiates an email-change request for the authenticated user.
   *
   * Validates the new email (format, uniqueness, not-same-as-current),
   * generates a 4-digit OTP, stores it on the user record, and dispatches
   * a verification email to the **new** address.
   *
   * @param payload - `{ email: string }` (the desired new email).
   * @param req     - Express request containing `req.user`.
   * @returns OTP value and confirmation message.
   */
  async changeEmail(payload: any, req: any) {
    try {
      // Handle both user object structures (from User model or custom object)
      const userId = req.user.id || req.user.userId;
      let userDetail = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (!userDetail) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
        };
      }
      if (payload.email) {
        let re =
          /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
        if (!re.test(String(payload.email))) {
          return {
            status: 'false',
            message: 'enter a valid email',
            data: [],
          };
        }
        payload.email = payload.email.toLowerCase();
      }
      const userEmail = await this.prisma.user.findUnique({
        where: { email: payload.email },
      });
      if (userEmail && userDetail.email != payload.email) {
        return {
          status: false,
          message: 'Email already exists',
          data: [],
        };
      }
      if (userDetail.email == payload.email) {
        return {
          status: false,
          message: 'Same email cannot be changed!',
          data: [],
        };
      }

      let otp = Math.floor(1000 + Math.random() * 9000);
      let otpValidTime = new Date(new Date().getTime() + parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10) * 60000);
      const updateUser = await this.prisma.user.update({
        where: { id: userId },
        data: {
          otp,
          otpValidTime,
        },
      });
      let data = {
        email: payload.email,
        name: userDetail.firstName,
        otp: otp,
      };
      this.notificationService.mailService(data);

      return {
        status: true,
        message: 'An OTP was sent to your email.',
        otp: otp,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in changeEmail',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Completes the email-change flow by verifying the OTP.
   *
   * Checks OTP value and expiry.  On success, persists the new email
   * address on the user record.
   *
   * @param payload - `{ email: string, otp: number }`.
   * @param req     - Express request containing `req.user`.
   * @returns Updated user record with new email.
   */
  async verifyEmail(payload: any, req: any) {
    try {
      const { email, otp } = payload;
      // Handle both user object structures (from User model or custom object)
      const userId = req?.user?.id || req?.user?.userId;
      let userDetail = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (!userDetail) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
        };
      }
      if (otp !== userDetail.otp) {
        return {
          status: false,
          message: 'Invalid OTP',
          data: [],
        };
      }
      if (new Date() > userDetail.otpValidTime) {
        return {
          status: false,
          message: 'Otp Expires',
          data: [],
        };
      }
      let updatedEmail = await this.prisma.user.update({
        where: { id: userId },
        data: { email: email },
      });

      return {
        status: true,
        message: 'Email Updated Successfully',
        data: updatedEmail,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in verifyEmail',
        error: getErrorMessage(error),
      };
    }
  }

  // ===========================================================================
  // SECTION: Online / Offline Status
  // ===========================================================================

  /**
   * Updates the user's online/offline status and the associated timestamp.
   *
   * @param payload - `{ onlineOffline: string, onlineOfflineDateStatus: string (ISO date) }`.
   * @param req     - Express request containing `req.user`.
   * @returns Updated user record.
   */
  async onlineOfflineStatus(payload: any, req: any) {
    try {
      const userId = req?.user?.id;
      let userDetail = await this.prisma.user.update({
        where: { id: userId },
        data: {
          onlineOffline: payload.onlineOffline,
          onlineOfflineDateStatus: new Date(payload.onlineOfflineDateStatus),
        },
      });
      return {
        status: true,
        message: 'Updated Successfully',
        data: userDetail,
      };
    } catch (error) {

      return {
        status: false,
        message: 'error in onlineOfflineStatus',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Retrieves a single branch by ID with nested business types, tags,
   * and categories.
   *
   * @param branchId - Branch ID (parsed to integer internally).
   * @param req      - Express request containing `req.user`.
   * @returns UserBranch record with nested relations.
   */
  async findOneBranch(branchId: any, req: any) {
    try {
      const branchID = parseInt(branchId);
      const userId = req?.user?.id;
      let branchDetail = await this.prisma.userBranch.findUnique({
        where: { id: branchID },
        include: {
          userBranchBusinessType: {
            include: {
              userBranch_BusinessType_Tag: true,
            },
          },
          userBranchTags: {
            include: {
              userBranchTagsTag: true,
            },
          },
          userBranch_userBranchCategory: {
            include: {
              userBranchCategory_category: true,
            },
          },
        },
      });
      if (!branchDetail) {
        return {
          status: false,
          messasge: 'Branch Not Found',
          data: [],
        };
      }

      return {
        status: true,
        message: 'Fetch Successfully',
        data: branchDetail,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in findOneBranch',
        error: getErrorMessage(error),
      };
    }
  }

  // ===========================================================================
  // SECTION: File Management (S3)
  // ===========================================================================

  /**
   * Deletes an object from AWS S3 via the S3service.
   *
   * @param payload - Object containing the S3 key / URL to delete.
   * @param req     - Express request (unused).
   * @returns Result from `S3service.s3_deleteObject()`.
   */
  async presignedUrlDelete(payload: any, req: any) {
    try {
      return this.s3service.s3_deleteObject(payload);
    } catch (error) {
      return {
        status: false,
        message: 'error in presignedUrlDelete',
        error: getErrorMessage(error),
      };
    }
  }

  // ===========================================================================
  // SECTION: Address Management
  // ===========================================================================

  /**
   * Creates a new shipping/billing address for the authenticated user.
   *
   * @param payload - Address fields (address, city, province, country,
   *                  postCode, firstName, lastName, phoneNumber, cc,
   *                  countryId, stateId, cityId, town).
   * @param req     - Express request containing `req.user`.
   * @returns Newly created UserAddress record.
   */
  async addUserAddress(payload: any, req: any) {
    try {
      const userId = req?.user?.id;
      let addUserAddress = await this.prisma.userAddress.create({
        data: {
          address: payload?.address,
          city: payload?.city,
          province: payload?.province,
          country: payload?.country,
          postCode: payload?.postCode,
          userId: userId,
          firstName: payload?.firstName,
          lastName: payload?.lastName,
          phoneNumber: payload?.phoneNumber,
          cc: payload?.cc,
          countryId: payload?.countryId,
          stateId: payload?.stateId,
          cityId: payload?.cityId,
          town: payload?.town,
        },
      });

      return {
        status: true,
        message: 'Created Successfully',
        data: addUserAddress,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in addUserAddress',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Updates an existing UserAddress by `userAddressId`.
   *
   * Merges supplied fields with current values (keeps old if new is falsy).
   *
   * @param payload - `{ userAddressId: number }` plus optional address fields.
   * @param req     - Express request containing `req.user`.
   * @returns Updated UserAddress record.
   */
  async updateUserAddress(payload: any, req: any) {
    try {
      const userId = req?.user?.id;
      const userAddressId = payload?.userAddressId;
      let userAddressDetail = await this.prisma.userAddress.findUnique({
        where: { id: userAddressId },
      });

      if (!userAddressDetail) {
        return {
          status: true,
          message: 'Not Found',
          data: [],
        };
      }
      let addUserAddress = await this.prisma.userAddress.update({
        where: { id: userAddressId },
        data: {
          address: payload?.address || userAddressDetail.address,
          city: payload?.city || userAddressDetail.city,
          province: payload?.province || userAddressDetail.province,
          country: payload?.country || userAddressDetail.country,
          postCode: payload?.postCode || userAddressDetail.postCode,
          firstName: payload?.firstName || userAddressDetail.firstName,
          lastName: payload?.lastName || userAddressDetail.lastName,
          phoneNumber: payload?.phoneNumber || userAddressDetail.phoneNumber,
          cc: payload?.cc || userAddressDetail.cc,
          countryId: payload?.countryId || userAddressDetail.countryId,
          stateId: payload?.stateId || userAddressDetail.stateId,
          cityId: payload?.cityId || userAddressDetail.cityId,
          town: payload?.town || userAddressDetail.town,
        },
      });

      return {
        status: true,
        message: 'Updated Successfully',
        data: addUserAddress,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in updateUserAddress',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Retrieves a paginated list of the authenticated user's active addresses.
   *
   * Includes related country, state, and city detail records.
   *
   * @param page  - Page number (defaults to 1).
   * @param limit - Page size (defaults to 10).
   * @param req   - Express request containing `req.user`.
   * @returns Paginated address list with total count.
   */
  async getAllUserAddress(page: any, limit: any, req: any) {
    try {
      const userId = req?.user?.id;
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize; // Calculate the offset

      let getAllUserAddress = await this.prisma.userAddress.findMany({
        where: {
          status: 'ACTIVE',
          userId: userId,
        },
        include: {
          countryDetail: true,
          stateDetail: true,
          cityDetail: true,
        },
        orderBy: { id: 'desc' },
        skip, // Offset
        take: pageSize, // Limit
      });

      let getAllUserAddressCount = await this.prisma.userAddress.count({
        where: {
          status: 'ACTIVE',
          userId: userId,
        },
      });

      return {
        status: true,
        messsage: 'Fetch Successfullly',
        data: getAllUserAddress,
        totalCount: getAllUserAddressCount,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in getAllUserAddress',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Retrieves a single UserAddress by its ID, including country, state,
   * and city details.
   *
   * @param userAddressId - Address ID (parsed to integer internally).
   * @returns UserAddress record with geo-detail relations.
   */
  async getOneUserAddress(userAddressId: any) {
    try {
      const userAddressID = parseInt(userAddressId);
      let getOneUserAddress = await this.prisma.userAddress.findUnique({
        where: { id: userAddressID },
        include: {
          countryDetail: true,
          stateDetail: true,
          cityDetail: true,
        },
      });
      if (!getOneUserAddress) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
        };
      }

      return {
        status: true,
        message: 'Fetch Successfully',
        data: getOneUserAddress,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in getOneUserAddress',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Soft-deletes a UserAddress by setting its status to 'DELETE' and
   * stamping `deletedAt`.
   *
   * @param userAddressId - Address ID (parsed to integer internally).
   * @param req           - Express request containing `req.user`.
   * @returns The soft-deleted UserAddress record.
   */
  async deleteUserAddress(userAddressId: any, req: any) {
    try {
      const userId = req?.user?.id;
      const userAddressID = parseInt(userAddressId);
      let userAddressDetail = await this.prisma.userAddress.findUnique({
        where: { id: userAddressID },
      });

      if (!userAddressDetail) {
        return {
          status: true,
          message: 'Not Found',
          data: [],
        };
      }
      let addUserAddress = await this.prisma.userAddress.update({
        where: { id: userAddressID },
        data: {
          status: 'DELETE',
          deletedAt: new Date(),
        },
      });

      return {
        status: true,
        message: 'Deleted Successfully',
        data: addUserAddress,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in deleteUserAddress',
        error: getErrorMessage(error),
      };
    }
  }

  // ===========================================================================
  // SECTION: User Deletion
  // ===========================================================================

  /**
   * Pseudo-deletes a user by replacing their email with a random string,
   * effectively anonymising the record without physically removing it.
   *
   * @param payload - `{ userId: number }`.
   * @returns Updated user record with randomised email.
   */
  async userDelete(payload: any) {
    try {
      const userDetail = await this.prisma.user.findUnique({
        where: { id: payload?.userId },
      });

      if (!userDetail) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
        };
      }
      let random = randomstring.generate({
        length: 12,
        charset: 'alphanumeric',
      });
      let email = random + 'yopmail.com';

      let updatedUser = await this.prisma.user.update({
        where: { id: payload?.userId },
        data: { email: email },
      });

      return {
        status: true,
        message: 'Delete Successffully',
        data: updatedUser,
      };
    } catch (error) {
      return {
        status: false,
        message: 'error in userDelete',
        error: getErrorMessage(error),
      };
    }
  }

  // ===========================================================================
  // SECTION: Role Management (RBAC)
  // ===========================================================================

  /**
   * Creates a new UserRole (e.g. "Manager", "Editor").
   *
   * Returns the existing role if the name is already taken (idempotent).
   *
   * @param payload - `{ userRoleName: string }`.
   * @param req     - Express request containing `req.user`.
   * @returns Newly created or existing UserRole record.
   */
  async createUserRole(payload: any, req: any) {
    try {
      const userId = req?.user?.id;
      if (!payload.userRoleName) {
        return {
          status: false,
          message: 'userRoleName is required',
        };
      }

      // Check if the user role already exists
      let existUserRole = await this.prisma.userRole.findFirst({
        where: { userRoleName: payload.userRoleName },
      });

      if (existUserRole) {
        return {
          status: true, // Still return true as it already exists
          message: 'Already exists',
          data: existUserRole,
        };
      }

      // Create new user role
      let newUserRole = await this.prisma.userRole.create({
        data: {
          userRoleName: payload.userRoleName,
          addedBy: userId,
        },
      });

      return {
        status: true,
        message: 'Created successfully',
        data: newUserRole,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in createUserRole',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Retrieves a paginated, optionally searchable list of UserRoles
   * belonging to the admin (resolved via `HelperService.getAdminId`).
   *
   * @param page       - Page number.
   * @param limit      - Page size.
   * @param searchTerm - Optional case-insensitive name filter.
   * @param req        - Express request containing `req.user`.
   * @returns Paginated UserRole list with total count.
   */
  async getAllUserRole(page: any, limit: any, searchTerm: any, req: any) {
    try {
      let userId = req?.user?.id;
      userId = await this.helperService.getAdminId(userId);

      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize; // Calculate offset

      let whereCondition: any = {
        addedBy: userId,
        status: { in: ['ACTIVE', 'INACTIVE'] },
      };

      // Apply search filter if searchTerm is provided
      if (searchTerm) {
        whereCondition.userRoleName = {
          contains: searchTerm,
          mode: 'insensitive', // Case-insensitive search
        };
      }

      // Fetch paginated user roles
      let getAllUserRoles = await this.prisma.userRole.findMany({
        where: whereCondition,
        orderBy: { id: 'desc' },
        skip, // Offset
        take: pageSize, // Limit
      });

      // Count total user roles
      let totalUserRoles = await this.prisma.userRole.count({
        where: whereCondition,
      });

      return {
        status: true,
        message: 'Fetch Successfully',
        data: getAllUserRoles,
        totalCount: totalUserRoles,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in getAllUserRole',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Renames an existing UserRole.
   *
   * @param req - Express request whose body contains
   *              `{ userRoleId: number, userRoleName: string }`.
   * @returns Updated UserRole record.
   */
  async updateUserRole(req: any) {
    try {
      const userRoleId = req.body.userRoleId;
      if (!userRoleId) {
        return {
          status: false,
          message: 'userRoleId is required!',
        };
      }

      // updateing in user role table
      let updateUserRole = await this.prisma.userRole.update({
        where: { id: parseInt(userRoleId) },
        data: {
          userRoleName: req.body.userRoleName,
        },
      });

      return {
        status: true,
        message: 'Updated Successfully',
        data: updateUserRole,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in updateUserRole',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Soft-deletes a UserRole by setting its status to 'DELETE'.
   *
   * Prevents deletion if any user is currently assigned to the role.
   *
   * @param req - Express request whose query contains `id`.
   * @returns Soft-deleted UserRole record or rejection message.
   */
  async deleteUserRole(req: any) {
    try {
      const ID = parseInt(req.query.id);

      let userRoleExist = await this.prisma.userRole.findUnique({
        where: { id: ID },
      });
      if (!userRoleExist) {
        return {
          status: false,
          message: 'userRoleId not found',
          data: [],
        };
      }
      let userRoleInUserCount = await this.prisma.user.count({
        where: { userRoleId: ID },
      });
      if (userRoleInUserCount > 0) {
        return {
          status: false,
          message: 'userRoleId is associated with user',
          data: [],
        };
      }

      let updateUserRole = await this.prisma.userRole.update({
        where: { id: ID },
        data: {
          status: 'DELETE',
        },
      });

      return {
        status: false,
        message: 'Deleted successfully',
        data: updateUserRole,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in deleteUserRole',
        error: getErrorMessage(error),
      };
    }
  }

  // ===========================================================================
  // SECTION: Permission Management
  // ===========================================================================

  /**
   * Assigns a list of permissions to a UserRole.
   *
   * Creates a UserRolePermission record for each entry in
   * `permissionIdList`.  Validates that the role ID and list are present.
   *
   * @param payload - `{ userRoleId: number,
   *                    permissionIdList: Array<{ permissionId: number }> }`.
   * @param req     - Express request (unused beyond signature).
   * @returns Array of newly created UserRolePermission records.
   */
  async setPermission(payload: any, req: any) {
    try {
      const { userRoleId, permissionIdList } = payload;

      // Check if userRoleId is provided
      if (!userRoleId) {
        return {
          status: false,
          message: 'userRoleId is required',
        };
      }

      // Check if permissionIdList is an array and not empty
      if (!Array.isArray(permissionIdList) || permissionIdList.length === 0) {
        return {
          status: false,
          message: 'permissionIdList must be a non-empty array',
        };
      }

      // Validate each permissionId in the array
      for (const item of permissionIdList) {
        if (!item.permissionId) {
          return {
            status: false,
            message:
              'Each permissionIdList item must have a valid permissionId',
          };
        }
      }

      // Insert permissions one by one using a traditional for loop
      const createdPermissions = [];
      for (let i = 0; i < permissionIdList.length; i++) {
        const item = permissionIdList[i];
        const newPermission = await this.prisma.userRolePermission.create({
          data: {
            userRoleId,
            permissionId: item.permissionId,
            status: 'ACTIVE',
          },
        });
        createdPermissions.push(newPermission);
      }

      return {
        status: true,
        message: 'Permissions assigned successfully',
        data: createdPermissions,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in setPermission',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Retrieves a paginated list of UserRoles with their associated
   * permissions (including permission detail).
   *
   * @param page       - Page number.
   * @param limit      - Page size.
   * @param searchTerm - Optional case-insensitive name filter.
   * @param req        - Express request containing `req.user`.
   * @returns Paginated UserRole list (with nested permissions) and total count.
   */
  async getAllUserRoleWithPermission(
    page: any,
    limit: any,
    searchTerm: any,
    req: any,
  ) {
    try {
      const userId = req?.user?.id;
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize; // Calculate offset

      let whereCondition: any = {
        addedBy: userId,
      };

      // Apply search filter if searchTerm is provided
      if (searchTerm) {
        whereCondition.userRoleName = {
          contains: searchTerm,
          mode: 'insensitive', // Case-insensitive search
        };
      }

      // Fetch user roles with their permissions
      let userRoles = await this.prisma.userRole.findMany({
        where: whereCondition,
        include: {
          userRolePermission: {
            include: {
              permissionDetail: true, // Fetch details of each permission
            },
          },
        },
        orderBy: { id: 'desc' },
        skip, // Offset
        take: pageSize, // Limit
      });

      // Count total user roles
      let totalUserRoles = await this.prisma.userRole.count({
        where: whereCondition,
      });

      return {
        status: true,
        message: 'Fetch Successfully',
        data: userRoles,
        totalCount: totalUserRoles,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in getAllUserRoleWithPermission',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Replaces the full set of permissions for a UserRole.
   *
   * Deletes all existing UserRolePermission entries for the role, then
   * re-creates them from `permissionIdList`.  Verifies ownership via
   * `addedBy`.
   *
   * @param payload - `{ userRoleId: number,
   *                    permissionIdList: Array<{ permissionId: number }> }`.
   * @param req     - Express request containing `req.user`.
   * @returns Confirmation message.
   */
  async updateSetPermission(payload: any, req: any) {
    try {
      const { userRoleId, permissionIdList } = payload;
      const userId = req?.user?.id;

      // Validate userRoleId
      if (!userRoleId) {
        return {
          status: false,
          message: 'userRoleId is required',
        };
      }

      // Validate permissionIdList
      if (!Array.isArray(permissionIdList) || permissionIdList.length === 0) {
        return {
          status: false,
          message: 'permissionIdList must be a non-empty array',
        };
      }

      // Check if userRole exists
      const existingUserRole = await this.prisma.userRole.findUnique({
        where: { id: userRoleId, addedBy: userId },
      });

      if (!existingUserRole) {
        return {
          status: false,
          message:
            "UserRole not found or you don't have permission to update it",
        };
      }

      // Delete existing permissions for this userRoleId
      await this.prisma.userRolePermission.deleteMany({
        where: { userRoleId },
      });

      // Insert new permissions using a traditional loop
      for (let item of permissionIdList) {
        await this.prisma.userRolePermission.create({
          data: {
            userRoleId,
            permissionId: item.permissionId,
            status: 'ACTIVE',
          },
        });
      }

      return {
        status: true,
        message: 'Permissions updated successfully',
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in updateSetPermission',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Fetches a single UserRole by ID with all associated permissions
   * and their details.
   *
   * @param userRoleId - Role ID (parsed to integer internally).
   * @returns UserRole record with nested permission hierarchy.
   */
  async getOneUserRoleWithPermission(userRoleId: any) {
    try {
      // Validate userRoleId
      if (!userRoleId) {
        return {
          status: false,
          message: 'UserRoleId is required',
        };
      }

      // Fetch user role with associated permissions
      const userRole = await this.prisma.userRole.findUnique({
        where: { id: parseInt(userRoleId) },
        include: {
          userRolePermission: {
            include: {
              permissionDetail: true, // Fetch permission details
            },
          },
        },
      });

      // Check if the user role exists
      if (!userRole) {
        return {
          status: false,
          message: 'User Role not found',
        };
      }

      return {
        status: true,
        message: 'Fetch Successfully',
        data: userRole,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error fetching user role with permissions',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Duplicates an existing UserRole and all its permissions into a new
   * role named `<originalName>_copy`.
   *
   * Resolves the admin ID via `HelperService.getAdminId` to set `addedBy`.
   *
   * @param payload - `{ userRoleId: number }`.
   * @param req     - Express request containing `req.user`.
   * @returns Newly created UserRole and its cloned permission records.
   */
  async copyUserRoleWithPermission(payload: any, req: any) {
    try {
      const userRoleId = payload.userRoleId;

      let userId = req?.user?.id;
      userId = await this.helperService.getAdminId(userId);

      // Validate userRoleId
      if (!userRoleId) {
        return {
          status: false,
          message: 'UserRoleId is required',
        };
      }

      // Fetch user role with associated permissions
      const userRole = await this.prisma.userRole.findUnique({
        where: { id: parseInt(userRoleId) },
        include: {
          userRolePermission: true, // Fetch associated permissions
        },
      });

      if (!userRole) {
        return {
          status: false,
          message: 'User role not found',
        };
      }

      // Create a new user role with a unique name
      const newUserRole = await this.prisma.userRole.create({
        data: {
          userRoleName: `${userRole.userRoleName}_copy`,
          status: 'ACTIVE',
          addedBy: userId,
        },
      });

      // Copy permissions to the new role
      const newPermissions = [];
      for (const permission of userRole.userRolePermission) {
        const newPermission = await this.prisma.userRolePermission.create({
          data: {
            userRoleId: newUserRole.id,
            permissionId: permission.permissionId,
            status: 'ACTIVE',
          },
        });
        newPermissions.push(newPermission);
      }

      return {
        status: true,
        message: 'User role copied successfully with permissions',
        data: {
          newUserRole,
          newPermissions,
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in copyUserRoleWithPermission',
        error: getErrorMessage(error),
      };
    }
  }

  // ===========================================================================
  // SECTION: Help Center
  // ===========================================================================

  /**
   * Creates a new help-center support request.
   *
   * Stores the user's ID (if authenticated), email, and query text.
   *
   * @param payload - `{ userId?: number, email: string, query: string }`.
   * @param req     - Express request (unused beyond signature).
   * @returns Newly created HelpCenter record.
   */
  async createHelpCenter(payload: any, req: any) {
    try {
      const userId = payload.userId; // Extract user ID from request (if authenticated)
      const userEmail = payload.email; // Extract email from payload
      const query = payload.query; // Extract message from payload

      // Validate required fields
      if (!query) {
        return {
          status: false,
          message: 'Message is required',
        };
      }

      if (!userEmail) {
        return {
          status: false,
          message: 'Email is required',
        };
      }

      // Create help center request
      const newHelpCenterEntry = await this.prisma.helpCenter.create({
        data: {
          userId: userId || null, // Store userId if available
          userEmail: userEmail || null, // Store email if available
          query: query,
          status: 'ACTIVE',
        },
      });

      return {
        status: true,
        message: 'Help center request created successfully',
        data: newHelpCenterEntry,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in createHelpCenter',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Retrieves a paginated list of HelpCenter entries for the authenticated
   * admin user, with optional search filtering on the query text.
   *
   * @param page       - Page number.
   * @param limit      - Page size.
   * @param searchTerm - Optional case-insensitive filter on `query`.
   * @param req        - Express request containing `req.user`.
   * @returns Paginated help-center list with total count.
   */
  async getAllHelpCenterResponse(
    page: any,
    limit: any,
    searchTerm: any,
    req: any,
  ) {
    try {
      let Page = parseInt(page) || 1;
      let pageSize = parseInt(limit) || 10;
      const skip = (Page - 1) * pageSize; // Calculate offset

      // Handle both user object structures (from User model or custom object)
      const adminId = req.user.id || req.user.userId;

      let whereCondition: any = {
        userId: adminId,
      };

      // Apply search filter if searchTerm is provided
      if (searchTerm) {
        whereCondition.query = {
          contains: searchTerm,
          mode: 'insensitive', // Case-insensitive search
        };
      }

      // Fetch paginated help center requests
      let helpCenterRequests = await this.prisma.helpCenter.findMany({
        where: whereCondition,
        orderBy: { id: 'desc' },
        skip, // Offset
        take: pageSize, // Limit
      });

      // Count total help center requests
      let totalHelpCenterRequests = await this.prisma.helpCenter.count({
        where: whereCondition,
      });

      return {
        status: true,
        message: 'Fetched successfully',
        data: helpCenterRequests,
        totalCount: totalHelpCenterRequests,
        selectedAdminId: adminId,
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in getAllHelpCenter',
        error: getErrorMessage(error),
      };
    }
  }

  // ===========================================================================
  // SECTION: Business Categories
  // ===========================================================================

  /**
   * Returns the list of business categories applicable to the authenticated
   * user based on their `userTypeCategoryId`.
   *
   * Resolves category IDs through the `categoryConnectTo` junction table
   * in both directions (categoryId <-> connectTo), deduplicates, and
   * fetches the full Category records.
   *
   * @param page       - Page number (unused -- fetches all matching).
   * @param limit      - Page size (unused).
   * @param searchTerm - Search term (unused).
   * @param req        - Express request containing `req.user`.
   * @returns Array of Category records and debugging metadata.
   */
  async getAllBusinessCategory(
    page: any,
    limit: any,
    searchTerm: any,
    req: any,
  ) {
    try {
      // Handle both user object structures (from User model or custom object)
      // For multi-account system: req.user.id is the currently active user ID (which could be a sub-account user ID)
      // Business categories are stored in UserBusinessCategory table with userId
      // In the multi-account system, sub-accounts are also User records, so req.user.id is already the correct userId
      const primaryUserId = req?.user?.id || req?.user?.userId;
      const userAccountId = req?.user?.userAccountId;

      if (!primaryUserId) {
        return {
          status: false,
          message: 'User ID not found',
          data: [],
        };
      }

      // Candidate user IDs to check (sub-account id, userAccountId, etc.)
      const candidateUserIds = new Set<number>();
      candidateUserIds.add(primaryUserId);
      if (userAccountId) {
        candidateUserIds.add(userAccountId);
      }

      // Fetch the user to check for master account relationships
      const activeUser = await this.prisma.user.findUnique({
        where: { id: primaryUserId },
        select: {
          id: true,
          masterAccountId: true,
          addedBy: true,
        },
      });

      // If this user was added by another user, include the parent as a fallback
      if (activeUser?.addedBy) {
        candidateUserIds.add(activeUser.addedBy);
      }

      // Get user business categories from UserBusinessCategory table
      let userBusinesCategoryDetail = await this.prisma.userBusinessCategory.findMany({
        where: {
          userId: {
            in: Array.from(candidateUserIds),
          },
          status: 'ACTIVE',
        },
        include: {
          categoryDetail: true,
        },
      });

      // Fallback #1: If no userBusinessCategory entries, attempt to use user branches
      let userBranchCategories: any[] = [];
      if (userBusinesCategoryDetail.length === 0) {
        userBranchCategories = await this.prisma.userBranchCategory.findMany({
          where: {
            userId: {
              in: Array.from(candidateUserIds),
            },
            status: 'ACTIVE',
          },
          include: {
            userBranchCategory_category: true,
          },
        });

        if (userBranchCategories.length > 0) {
          userBusinesCategoryDetail = userBranchCategories.map((branchCategory: any) => ({
            id: branchCategory.id,
            userId: branchCategory.userId,
            categoryId: branchCategory.categoryId,
            categoryLocation: branchCategory.categoryLocation,
            status: branchCategory.status,
            createdAt: branchCategory.createdAt,
            updatedAt: branchCategory.updatedAt,
            deletedAt: branchCategory.deletedAt,
            categoryDetail: branchCategory.userBranchCategory_category,
            source: 'branch',
          })) as any[];
        }
      }

      // Fallback #2: If still empty, attempt to use master account (addedBy) categories
      if (userBusinesCategoryDetail.length === 0 && activeUser?.addedBy) {
        const parentBusinessCategories = await this.prisma.userBusinessCategory.findMany({
          where: {
            userId: activeUser.addedBy,
            status: 'ACTIVE',
          },
          include: {
            categoryDetail: true,
          },
        });

        if (parentBusinessCategories.length > 0) {
          userBusinesCategoryDetail = parentBusinessCategories.map((cat: any) => ({
            ...cat,
            source: 'parent',
          })) as any[];
        }
      }

      // Extract category IDs
      const categoryIds = userBusinesCategoryDetail
        .map((item: any) => item.categoryId)
        .filter(Boolean);

      // Get category details
      let categoryDetails = [];
      if (categoryIds.length > 0) {
        categoryDetails = await this.prisma.category.findMany({
          where: {
            id: { in: categoryIds },
            status: 'ACTIVE',
          },
        });
      }

      return {
        status: true,
        message: 'Fetch Successfully',
        data: userBusinesCategoryDetail, // Return the userBusinessCategory or fallback records with categoryDetail
        categoryDetails: categoryDetails, // Also return category details for convenience
        categoryIds: categoryIds, // Return category IDs array
      };
    } catch (error) {
      return {
        status: false,
        message: 'Error in getAllBusinessCategory',
        error: getErrorMessage(error),
      };
    }
  }

  // ===========================================================================
  // SECTION: Multi-Account System
  // ===========================================================================

  /**
   * Lists every User account associated with the authenticated user's
   * MasterAccount.
   *
   * Groups accounts by trade role (BUYER, FREELANCER, COMPANY) and
   * enriches each with personal info from the MasterAccount plus
   * placeholder statistics (messageCount, orderCount, etc.).
   *
   * @param req - Express request containing `req.user`.
   * @returns Master account info, current account, accounts grouped by
   *          type, and a flat `allAccounts` list.
   */
  async myAccounts(req: any) {
    try {
      const userId = req.user.id || req.user.userId;

      // Get the current user to find their Master Account
      const currentUser = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { masterAccount: true },
      });

      if (!currentUser || !currentUser.masterAccount) {
        return {
          status: false,
          message: 'User or Master Account not found',
          error: 'User not found',
        };
      }

      // Get all user accounts for this Master Account
      const allAccounts = await this.prisma.user.findMany({
        where: {
          masterAccountId: currentUser.masterAccountId,
          deletedAt: null,
          isActive: true,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          tradeRole: true,
          status: true,
          isCurrent: true,
          accountName: true,
          createdAt: true,
          masterAccountId: true,
          addedBy: true,
          isSubAccount: true,
          profilePicture: true,
        },
        orderBy: { createdAt: 'asc' },
      });


      // Get current active account
      const currentAccount = allAccounts.find((account) => account.isCurrent);

      // Group accounts by trade role
      const buyerAccounts = allAccounts.filter(
        (account) => account.tradeRole === 'BUYER',
      );
      const freelancerAccounts = allAccounts.filter(
        (account) => account.tradeRole === 'FREELANCER',
      );
      const companyAccounts = allAccounts.filter(
        (account) => account.tradeRole === 'COMPANY',
      );

      // Helper function to get new orders count for an account
      // Counts only orders created in the last 7 days as "new orders"
      const getOrdersCount = async (accountId: number, tradeRole: string) => {
        try {
          // Calculate the date 7 days ago
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

          if (tradeRole === 'COMPANY' || tradeRole === 'FREELANCER') {
            // For sellers: count new orders (created in last 7 days) where they are the seller
            const count = await this.prisma.orderProducts.count({
              where: {
                sellerId: accountId,
                deletedAt: null,
                status: 'ACTIVE',
                createdAt: {
                  gte: sevenDaysAgo, // Only orders created in the last 7 days
                },
              },
            });
            return count;
          } else if (tradeRole === 'BUYER') {
            // For buyers: count new orders (created in last 7 days) where they are the buyer
            const count = await this.prisma.orderProducts.count({
              where: {
                userId: accountId,
                deletedAt: null,
                status: 'ACTIVE',
                createdAt: {
                  gte: sevenDaysAgo, // Only orders created in the last 7 days
                },
              },
            });
            return count;
          }
          return 0;
        } catch (error) {
          return 0;
        }
      };

      // Helper function to get unread messages count for an account
      const getMessagesCount = async (accountId: number) => {
        try {
          // Get all rooms where the account is a participant
          const userRooms = await this.prisma.roomParticipants.findMany({
            where: {
              userId: accountId,
            },
            select: {
              roomId: true,
            },
          });

          const roomIds = userRooms.map((rp) => rp.roomId);

          if (roomIds.length === 0) {
            return 0;
          }

          // Count unread messages in those rooms that were not sent by the account
          const count = await this.prisma.message.count({
            where: {
              roomId: { in: roomIds },
              userId: { not: accountId }, // Messages not sent by the account
              status: 'UNREAD',
            },
          });

          return count;
        } catch (error) {
          return 0;
        }
      };

      // Calculate statistics for each account
      const accountsWithStats = await Promise.all(
        allAccounts.map(async (account) => {
          const [ordersCount, messagesCount] = await Promise.all([
            getOrdersCount(account.id, account.tradeRole),
            getMessagesCount(account.id),
          ]);

          return {
            ...account,
            // Personal info inherited from Master Account
            firstName: currentUser.masterAccount.firstName,
            lastName: currentUser.masterAccount.lastName,
            email: currentUser.masterAccount.email,
            phoneNumber: currentUser.masterAccount.phoneNumber,
            cc: currentUser.masterAccount.cc,
            profilePicture: currentUser.masterAccount.profilePicture,
            // Statistics
            orders: ordersCount,
            messages: messagesCount,
          };
        }),
      );

      // Get statistics for main account (use currentUser.id, not masterAccount.id)
      const mainAccountStats = await Promise.all([
        getOrdersCount(currentUser.id, currentUser.tradeRole),
        getMessagesCount(currentUser.id),
      ]);

      // Get statistics for current account if it exists
      let currentAccountStats = [0, 0];
      if (currentAccount) {
        currentAccountStats = await Promise.all([
          getOrdersCount(currentAccount.id, currentAccount.tradeRole),
          getMessagesCount(currentAccount.id),
        ]);
      }

      // Helper function to get account stats
      const getAccountWithStats = async (account: any) => {
        const [ordersCount, messagesCount] = await Promise.all([
          getOrdersCount(account.id, account.tradeRole),
          getMessagesCount(account.id),
        ]);

        return {
          ...account,
          firstName: currentUser.masterAccount.firstName,
          lastName: currentUser.masterAccount.lastName,
          email: currentUser.masterAccount.email,
          phoneNumber: currentUser.masterAccount.phoneNumber,
          cc: currentUser.masterAccount.cc,
          profilePicture: currentUser.masterAccount.profilePicture,
          orders: ordersCount,
          messages: messagesCount,
          isCurrentAccount: currentAccount?.id === account.id,
        };
      };

      // Get stats for accounts by type
      const buyerAccountsWithStats = await Promise.all(
        buyerAccounts.map((account) => getAccountWithStats(account)),
      );
      const freelancerAccountsWithStats = await Promise.all(
        freelancerAccounts.map((account) => getAccountWithStats(account)),
      );
      const companyAccountsWithStats = await Promise.all(
        companyAccounts.map((account) => getAccountWithStats(account)),
      );

      const response = {
        status: true,
        message: 'Accounts retrieved successfully',
        data: {
          mainAccount: {
            id: currentUser.id,
            firstName: currentUser.masterAccount.firstName,
            lastName: currentUser.masterAccount.lastName,
            email: currentUser.masterAccount.email,
            phoneNumber: currentUser.masterAccount.phoneNumber,
            cc: currentUser.masterAccount.cc,
            profilePicture: currentUser.masterAccount.profilePicture,
            tradeRole: currentUser.tradeRole,
            accountName: currentUser.accountName || `${currentUser.masterAccount.firstName} ${currentUser.masterAccount.lastName}`,
            orders: mainAccountStats[0],
            messages: mainAccountStats[1],
            status: currentUser.status,
            statusNote: currentUser.statusNote,
            isMainAccount: true,
            isCurrentAccount: currentAccount?.id === currentUser.id,
          },
          currentAccount: currentAccount
            ? {
                ...currentAccount,
                firstName: currentUser.masterAccount.firstName,
                lastName: currentUser.masterAccount.lastName,
                email: currentUser.masterAccount.email,
                phoneNumber: currentUser.masterAccount.phoneNumber,
                cc: currentUser.masterAccount.cc,
                profilePicture: currentUser.masterAccount.profilePicture,
                orders: currentAccountStats[0],
                messages: currentAccountStats[1],
              }
            : null,
          accountsByType: {
            buyer: buyerAccountsWithStats,
            freelancer: freelancerAccountsWithStats,
            company: companyAccountsWithStats,
          },
          allAccounts: accountsWithStats.map((account) => ({
            ...account,
            isCurrentAccount: currentAccount?.id === account.id,
          })),
        },
      };

      return response;
    } catch (error) {
      return {
        status: false,
        message: 'Error retrieving accounts',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Creates a new sub-account (BUYER, FREELANCER, or COMPANY) under the
   * current user's MasterAccount.
   *
   * Validates uniqueness of the account name within the same trade role.
   * Generates a timestamp-based unique ID.  For COMPANY accounts,
   * additional company-specific fields are persisted.
   *
   * @param payload - `{ tradeRole: string, accountName: string,
   *                    companyName?, companyAddress?, companyPhone?,
   *                    companyWebsite?, companyTaxId? }`.
   * @param req     - Express request containing `req.user`.
   * @returns Newly created sub-account summary.
   */
  async createAccount(payload: any, req: any) {
    try {
      const userId = req.user.id || req.user.userId;

      // Get the current user to find their Master Account
      const currentUser = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { masterAccount: true },
      });

      if (!currentUser || !currentUser.masterAccount) {
        return {
          status: false,
          message: 'User or Master Account not found',
          data: null,
        };
      }

      // Check if account name already exists for this user and trade role
      const existingAccount = await this.prisma.user.findFirst({
        where: {
          masterAccountId: currentUser.masterAccountId,
          tradeRole: payload.tradeRole,
          accountName: payload.accountName,
          deletedAt: null,
        },
      });

      if (existingAccount) {
        return {
          status: false,
          message: `You already have a ${payload.tradeRole.toLowerCase()} account with the name "${payload.accountName}"`,
          data: null,
        };
      }

      // Generate unique ID for the new account
      let idString = Date.now().toString();
      let requestId;
      if (idString.length >= 7) {
        requestId = idString;
      } else {
        requestId = '0'.repeat(7 - idString.length) + idString;
      }

      // For freelancer accounts, ensure the unique ID is properly formatted
      if (payload.tradeRole === 'FREELANCER') {
        // Ensure the unique ID is at least 7 digits
        while (requestId.length < 7) {
          requestId = '0' + requestId;
        }
      }

      // Create new sub-account inheriting from Master Account
      const newUserAccount = await this.prisma.user.create({
        data: {
          masterAccountId: currentUser.masterAccountId,
          accountName: payload.accountName,
          tradeRole: payload.tradeRole,
          isActive: true,
          isCurrent: false,
          uniqueId: requestId, // Set the unique ID
          // Company-specific fields (only for COMPANY role)
          ...(payload.tradeRole === 'COMPANY' && {
            companyName: payload.companyName || '',
            companyAddress: payload.companyAddress || '',
            companyPhone: payload.companyPhone || '',
            companyWebsite: payload.companyWebsite || '',
            companyTaxId: payload.companyTaxId || '',
          }),
        },
      });


      return {
        status: true,
        message:
          'Sub-account created successfully! You can now switch to this account.',
        data: {
          id: newUserAccount.id,
          accountName: newUserAccount.accountName,
          tradeRole: newUserAccount.tradeRole,
          companyName: newUserAccount.companyName,
          companyAddress: newUserAccount.companyAddress,
          companyPhone: newUserAccount.companyPhone,
          companyWebsite: newUserAccount.companyWebsite,
          companyTaxId: newUserAccount.companyTaxId,
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to create sub-account: ' + getErrorMessage(error),
        data: null,
      };
    }
  }

  /**
   * Switches the authenticated user's active context to a different
   * sub-account (or back to the main BUYER account).
   *
   * Flow:
   *  1. De-flags all `isCurrent` accounts for the MasterAccount.
   *  2. If `userAccountId === 0`, activates the default BUYER account.
   *  3. Otherwise, activates the specified sub-account (after verifying
   *     it belongs to the same MasterAccount).
   *  4. Updates `lastActiveUserId` on MasterAccount.
   *  5. Creates a new AccountSession with a fresh JWT (7-day expiry).
   *
   * @param payload - `{ userAccountId: number }` (0 = main account).
   * @param req     - Express request containing `req.user`.
   * @returns New JWT access token and account summary.
   */
  async switchAccount(payload: any, req: any) {
    try {
      // Handle both user object structures (from User model or custom object)
      const userId = req.user.id || req.user.userId;
      const { userAccountId } = payload;

      // First, get the current user to find their masterAccountId
      const currentUser = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { masterAccount: true },
      });


      if (!currentUser || !currentUser.masterAccountId) {
        return {
          status: false,
          message: 'User not found or no master account linked',
          data: null,
        };
      }

      // Deactivate all current accounts for this MasterAccount
      await this.prisma.user.updateMany({
        where: {
          masterAccountId: currentUser.masterAccountId,
          isCurrent: true,
        },
        data: {
          isCurrent: false,
        },
      });

      if (userAccountId === 0) {
        // Switch to main account (no sub-account)
        // Find the main account for this MasterAccount
        const user = await this.prisma.user.findFirst({
          where: {
            masterAccountId: currentUser.masterAccountId,
            tradeRole: 'BUYER', // Default main account is BUYER
            deletedAt: null,
            isActive: true,
          },
        });

        if (!user) {
          return {
            status: false,
            message: 'Main account not found',
            data: null,
          };
        }

        // Check if the main account is banned (INACTIVE status)
        if (user.status === 'INACTIVE') {
          return {
            status: false,
            message: 'This account has been banned. Please contact administrator.',
            data: null,
          };
        }

        // Activate the main account as current
        await this.prisma.user.update({
          where: { id: user.id },
          data: { isCurrent: true },
        });

        // Update the lastActiveUserId in MasterAccount
        await this.prisma.masterAccount.update({
          where: { id: currentUser.masterAccountId },
          data: { lastActiveUserId: user.id },
        });

        // Create new session for main account
        const tokenResult = await this.authService.getToken({
          id: user.id,
          email: user.email,
          tradeRole: user.tradeRole,
          userAccountId: user.id, // This is the main account
        });

        const session = await this.prisma.accountSession.create({
          data: {
            userId: user.id, // Use the main account ID, not the master account ID
            accessToken: tokenResult.accessToken,
            isActive: true,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          },
        });

        return {
          status: true,
          message: 'Switched to main account successfully',
          data: {
            accessToken: session.accessToken,
            account: {
              id: user.id,
              tradeRole: user.tradeRole,
              accountName: 'Main Account',
              isMainAccount: true,
            },
          },
        };
      } else {
        // Switch to specific sub-account

        if (!currentUser || !currentUser.masterAccountId) {
          return {
            status: false,
            message: 'User not found or no master account linked',
            data: null,
          };
        }

        // Find the sub-account that belongs to the same MasterAccount

        const userAccount = await this.prisma.user.findFirst({
          where: {
            id: userAccountId,
            masterAccountId: currentUser.masterAccountId,
            deletedAt: null,
            isActive: true,
          },
        });


        if (!userAccount) {
          return {
            status: false,
            message: 'Account not found or access denied',
            data: null,
          };
        }

        // Check if the account is banned (INACTIVE status)
        if (userAccount.status === 'INACTIVE') {
          return {
            status: false,
            message: 'This account has been banned. Please contact administrator.',
            data: null,
          };
        }

        // Activate this account as current
        await this.prisma.user.update({
          where: { id: userAccountId },
          data: { isCurrent: true },
        });

        // Update the lastActiveUserId in MasterAccount
        await this.prisma.masterAccount.update({
          where: { id: currentUser.masterAccountId },
          data: { lastActiveUserId: userAccountId },
        });

        // Get master user details
        const masterUser = await this.prisma.user.findUnique({
          where: { id: userId },
        });

        // Create new session with account context
        const tokenResult = await this.authService.getToken({
          id: userAccount.id, // Use the sub-account ID, not the master account ID
          email: userAccount.email,
          tradeRole: userAccount.tradeRole,
          userAccountId: userAccount.id, // This is the sub-account
        });

        const session = await this.prisma.accountSession.create({
          data: {
            userId: userAccount.id, // Use the sub-account ID, not the master account ID
            accessToken: tokenResult.accessToken,
            isActive: true,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
          },
        });

        return {
          status: true,
          message: 'Account switched successfully',
          data: {
            accessToken: session.accessToken,
            account: userAccount,
          },
        };
      }
    } catch (error) {
      return {
        status: false,
        message: 'Error switching account',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * One-time migration utility that converts legacy sub-accounts
   * (stored as flags on the User record with `isSubAccount = true`)
   * into standalone User records linked via `parentUserId`.
   *
   * For each un-migrated account:
   *  1. Creates a new User record with placeholder data.
   *  2. Creates a UserProfile and UserPhone for the new user.
   *  3. Links the original sub-account to the new user via `parentUserId`.
   *
   * @param req - Express request containing `req.user`.
   * @returns Migration summary with per-account status.
   */
  async migrateSubAccounts(req: any) {
    try {
      const userId = req.user.id || req.user.userId;

      // Find all sub-accounts without subAccountUserId
      const unmigatedAccounts = await this.prisma.user.findMany({
        where: {
          parentUserId: userId,
          isSubAccount: true,
          deletedAt: null,
        },
        select: {
          id: true,
          accountName: true,
          tradeRole: true,
          email: true,
          phoneNumber: true,
          cc: true,
          firstName: true,
          lastName: true,
        },
      });


      const results = [];

      for (const account of unmigatedAccounts) {
        try {

          // Create a new User record for this sub-account
          const newSubUser = await this.prisma.user.create({
            data: {
              email: `${account.accountName.toLowerCase().replace(/\s+/g, '')}@subaccount.local`,
              password: '$2b$10$defaulthash', // Default hash
              firstName: account.accountName,
              lastName: `(${account.tradeRole})`,
              tradeRole: account.tradeRole,
              phoneNumber: '1234567890',
              cc: '+1',
              status: 'ACTIVE',
              userType: 'USER',
              userName: account.accountName,
              uniqueId: `SUB${Date.now()}${account.id}`,
              gender: 'MALE',
              dateOfBirth: new Date('1990-01-01'),
              loginType: 'MANUAL',
            },
          });

          // Create UserProfile for the sub-account
          const userProfile = await this.prisma.userProfile.create({
            data: {
              userId: newSubUser.id,
              profileType: account.tradeRole,
              companyName: account.accountName,
              phoneNumber: '1234567890',
              cc: '+1',
            },
          });

          // Create UserPhone for the sub-account
          const userPhone = await this.prisma.userPhone.create({
            data: {
              userId: newSubUser.id,
              phoneNumber: '1234567890',
              cc: '+1',
              status: 'ACTIVE',
            },
          });

          // Update the User to link to the new sub-account user
          const updatedAccount = await this.prisma.user.update({
            where: { id: account.id },
            data: { parentUserId: newSubUser.id },
          });

          results.push({
            accountId: account.id,
            accountName: account.accountName,
            newSubUserId: newSubUser.id,
            status: 'migrated',
          });

        } catch (error) {
          results.push({
            accountId: account.id,
            accountName: account.accountName,
            status: 'failed',
            error: getErrorMessage(error),
          });
        }
      }

      return {
        status: true,
        message: 'Sub-account migration completed',
        data: {
          totalAccounts: unmigatedAccounts.length,
          results: results,
        },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Migration failed',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Returns the currently active account for the authenticated user.
   *
   * Resolution order:
   *  1. If JWT carries `userAccountId` (sub-account), return that account.
   *  2. Otherwise, find the `isCurrent` account under the MasterAccount.
   *  3. Fallback: return the default BUYER account.
   *
   * Each response includes personal info inherited from the MasterAccount
   * and, for COMPANY accounts, company-specific fields.
   *
   * @param req - Express request containing `req.user`.
   * @returns Current account details with `isMainAccount` flag.
   */
  async currentAccount(req: any) {
    try {
      // Handle both user object structures (from User model or custom object)
      const userId = req.user.id || req.user.userId;
      const userAccountId = req.user.userAccountId; // Get account context from JWT


      // If we have a specific account context, use that
      if (userAccountId && userAccountId !== userId) {
        // User is in a sub-account context
        const subAccount = await this.prisma.user.findUnique({
          where: {
            id: userAccountId,
            deletedAt: null,
            isActive: true,
          },
          include: {
            masterAccount: true,
          },
        });

        if (subAccount && subAccount.masterAccountId) {
          // Verify this sub-account belongs to the same master account
          const masterAccount = await this.prisma.masterAccount.findUnique({
            where: { id: subAccount.masterAccountId },
          });

          if (masterAccount) {
            return {
              status: true,
              message: 'Current account retrieved',
              data: {
                account: {
                  id: subAccount.id,
                  tradeRole: subAccount.tradeRole,
                  accountName: subAccount.accountName,
                  status: subAccount.status, // Add status field
                  isCurrent: true,
                  isMainAccount: false,
                  // Include company details if it's a company account
                  ...(subAccount.tradeRole === 'COMPANY' && {
                    companyName: subAccount.companyName,
                    companyAddress: subAccount.companyAddress,
                    companyPhone: subAccount.companyPhone,
                    companyWebsite: subAccount.companyWebsite,
                    companyTaxId: subAccount.companyTaxId,
                  }),
                  // Include personal info from master account
                  firstName: subAccount.masterAccount?.firstName,
                  lastName: subAccount.masterAccount?.lastName,
                  email: subAccount.masterAccount?.email,
                  phoneNumber: subAccount.masterAccount?.phoneNumber,
                  cc: subAccount.masterAccount?.cc,
                  profilePicture: subAccount.masterAccount?.profilePicture,
                  dateOfBirth: subAccount.masterAccount?.dateOfBirth,
                  gender: subAccount.masterAccount?.gender,
                },
                isMainAccount: false,
              },
            };
          }
        }
      }

      // First, get the current user with their master account info
      const currentUser = await this.prisma.user.findUnique({
        where: {
          id: userId,
          deletedAt: null,
          isActive: true,
        },
        include: {
          masterAccount: true,
        },
      });

      if (!currentUser) {
        return {
          status: false,
          message: 'User not found',
        };
      }

      // Check if user has a master account
      if (!currentUser.masterAccountId) {
        return {
          status: false,
          message: 'Master account not found',
        };
      }

      // Find the current active account for this master account
      const currentAccount = await this.prisma.user.findFirst({
        where: {
          masterAccountId: currentUser.masterAccountId,
          isCurrent: true,
          deletedAt: null,
          isActive: true,
        },
        include: {
          masterAccount: true,
        },
      });

      if (currentAccount) {
        // Return the current active account
        return {
          status: true,
          message: 'Current account retrieved',
          data: {
            account: {
              id: currentAccount.id,
              tradeRole: currentAccount.tradeRole,
              accountName: currentAccount.accountName,
              status: currentAccount.status, // Add status field
              isCurrent: true,
              isMainAccount: false,
              // Include company details if it's a company account
              ...(currentAccount.tradeRole === 'COMPANY' && {
                companyName: currentAccount.companyName,
                companyAddress: currentAccount.companyAddress,
                companyPhone: currentAccount.companyPhone,
                companyWebsite: currentAccount.companyWebsite,
                companyTaxId: currentAccount.companyTaxId,
              }),
              // Include personal info from master account
              firstName: currentAccount.masterAccount?.firstName,
              lastName: currentAccount.masterAccount?.lastName,
              email: currentAccount.masterAccount?.email,
              phoneNumber: currentAccount.masterAccount?.phoneNumber,
              cc: currentAccount.masterAccount?.cc,
              profilePicture: currentAccount.masterAccount?.profilePicture,
              dateOfBirth: currentAccount.masterAccount?.dateOfBirth,
              gender: currentAccount.masterAccount?.gender,
            },
            isMainAccount: false,
          },
        };
      } else {
        // Find the main account (the one created during registration)
        const mainAccount = await this.prisma.user.findFirst({
          where: {
            masterAccountId: currentUser.masterAccountId,
            tradeRole: 'BUYER', // Default main account is BUYER
            deletedAt: null,
            isActive: true,
          },
          include: {
            masterAccount: true,
          },
        });

        if (mainAccount) {
          return {
            status: true,
            message: 'Current account retrieved',
            data: {
              account: {
                id: mainAccount.id,
                tradeRole: mainAccount.tradeRole,
                accountName: mainAccount.accountName || 'Main Account',
                status: mainAccount.status, // Add status field
                isCurrent: true,
                isMainAccount: true,
                // Include personal info from master account
                firstName: mainAccount.masterAccount?.firstName,
                lastName: mainAccount.masterAccount?.lastName,
                email: mainAccount.masterAccount?.email,
                phoneNumber: mainAccount.masterAccount?.phoneNumber,
                cc: mainAccount.masterAccount?.cc,
                profilePicture: mainAccount.masterAccount?.profilePicture,
                dateOfBirth: mainAccount.masterAccount?.dateOfBirth,
                gender: mainAccount.masterAccount?.gender,
              },
              isMainAccount: true,
            },
          };
        } else {
          return {
            status: false,
            message: 'No active account found',
          };
        }
      }
    } catch (error) {
      return {
        status: false,
        message: 'Error retrieving current account',
        error: getErrorMessage(error),
      };
    }
  }
}
