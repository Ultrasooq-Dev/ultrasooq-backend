// @ts-nocheck
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
import { randomUUID } from 'crypto';
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


/**
 * Identifier prefix used in `better_auth_verification` rows that hold a
 * pending email-change OTP. Namespaced so it doesn't collide with rows
 * Better Auth itself writes (email-verify links, password-reset, etc.).
 *
 * Phase 4 dropped the `User.otp` / `User.otpValidTime` columns that used
 * to back `changeEmail` / `verifyEmail`. The follow-up was to move the
 * OTP onto Better Auth's `verification` table so it survives restarts /
 * works across cluster nodes — see `changeEmail`/`verifyEmail` below.
 */
const CHANGE_EMAIL_VERIFICATION_PREFIX = 'change-email:';

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
  async me(_payload: any, req: any) {
    try {
      const userId = req?.user?.id || req?.user?.userId;

      const userDetail = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          userPhone: true,
          userSocialLink: true,
          userProfile: {
            include: {
              userProfileBusinessType: {
                include: { userProfileBusinessTypeTag: true },
              },
            },
          },
          userBranch: {
            include: {
              userBranchBusinessType: {
                include: { userBranch_BusinessType_Tag: true },
              },
              userBranchTags: {
                include: { userBranchTagsTag: true },
              },
              userBranch_userBranchCategory: {
                include: { userBranchCategory_category: true },
              },
            },
          },
        },
      });

      if (!userDetail) {
        return { status: false, message: 'Not Found', data: [] };
      }
      if (userDetail.status === 'INACTIVE') {
        return {
          status: false,
          message: 'Your account has been banned. Please contact administrator.',
          data: null,
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
          profilePicture: true,
          identityProof: true,
          identityProofBack: true,
          onlineOffline: true,
          onlineOfflineDateStatus: true,
          createdAt: true,
          updatedAt: true,
          userType: true,
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
      const updatedMasterAccount = await this.prisma.user.update({
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
      // Better Auth stores the credential password in `Account` (providerId =
      // 'credential'), not on User. Verify against that and write back there.
      const credential = await this.prisma.account.findFirst({
        where: { userId, providerId: 'credential' },
      });
      if (!credential || !credential.password) {
        return { status: false, message: 'No credential password set', data: [] };
      }
      if (!compareSync(payload.password, credential.password)) {
        return { status: false, message: 'Invalid Credential', data: [] };
      }
      if (payload.newPassword != payload.confirmPassword) {
        return { status: false, message: 'Password Missmatch', data: [] };
      }
      const salt = await genSalt(10);
      const newHash = await hash(payload.newPassword, salt);
      await this.prisma.account.update({
        where: { id: credential.id },
        data: { password: newHash },
      });
      return {
        status: true,
        message: 'The password has been updated successfully.',
        data: null,
      };
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

  async updateTag(payload: any, req: any) {
    try {
      const tagId = parseInt(payload.tagId || payload.id);
      if (!tagId) return { status: false, message: 'Invalid tagId' };
      const existing = await this.prisma.tags.findUnique({ where: { id: tagId } });
      if (!existing) return { status: false, message: 'Tag not found', data: null };
      const updated = await this.prisma.tags.update({
        where: { id: tagId },
        data: {
          tagName: payload.tagName ?? existing.tagName,
        },
      });
      return { status: true, message: 'Tag updated successfully', data: updated };
    } catch (error) {
      return { status: false, message: 'error in updateTag', error: getErrorMessage(error) };
    }
  }

  async deleteTag(tagId: any, req: any) {
    try {
      const id = parseInt(tagId);
      if (!id) return { status: false, message: 'Invalid tagId' };
      const updated = await this.prisma.tags.update({
        where: { id },
        data: { status: 'DELETE', deletedAt: new Date() },
      });
      return { status: true, message: 'Tag deleted successfully', data: updated };
    } catch (error) {
      return { status: false, message: 'error in deleteTag', error: getErrorMessage(error) };
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

      const otp = Math.floor(1000 + Math.random() * 9000);
      const otpExpiryMs =
        parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10) * 60000;
      const identifier = `${CHANGE_EMAIL_VERIFICATION_PREFIX}${userId}`;
      const expiresAt = new Date(Date.now() + otpExpiryMs);

      // Opportunistically prune expired verification rows (any
      // `change-email:*` rows whose `expiresAt` is already in the past)
      // and any prior pending row for THIS user — only one outstanding
      // OTP per user at a time.
      const now = new Date();
      await this.prisma.verification.deleteMany({
        where: {
          OR: [
            { identifier, expiresAt: { lt: now } },
            { identifier },
            {
              identifier: { startsWith: CHANGE_EMAIL_VERIFICATION_PREFIX },
              expiresAt: { lt: now },
            },
          ],
        },
      });
      await this.prisma.verification.create({
        data: {
          id: randomUUID(),
          identifier,
          value: JSON.stringify({ otp, pendingEmail: payload.email }),
          expiresAt,
        },
      });

      const data = {
        email: payload.email,
        name: userDetail.firstName,
        otp,
      };
      this.notificationService.mailService(data);

      return {
        status: true,
        message: 'An OTP was sent to your email.',
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
      const userDetail = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (!userDetail) {
        return {
          status: false,
          message: 'Not Found',
          data: [],
        };
      }
      const identifier = `${CHANGE_EMAIL_VERIFICATION_PREFIX}${userId}`;
      const pendingRow = await this.prisma.verification.findFirst({
        where: { identifier },
        orderBy: { createdAt: 'desc' },
      });
      if (!pendingRow) {
        return {
          status: false,
          message: 'Invalid OTP',
          data: [],
        };
      }
      let pending: { otp: number; pendingEmail: string };
      try {
        pending = JSON.parse(pendingRow.value);
      } catch {
        await this.prisma.verification.delete({
          where: { id: pendingRow.id },
        });
        return {
          status: false,
          message: 'Invalid OTP',
          data: [],
        };
      }
      if (otp !== pending.otp) {
        return {
          status: false,
          message: 'Invalid OTP',
          data: [],
        };
      }
      if (Date.now() > pendingRow.expiresAt.getTime()) {
        await this.prisma.verification.delete({
          where: { id: pendingRow.id },
        });
        return {
          status: false,
          message: 'Otp Expires',
          data: [],
        };
      }
      // The new email originally sent to changeEmail is the source of
      // truth — accept either it or the email passed back by the client
      // (kept for backwards compat with the existing frontend request shape).
      const newEmail = email || pending.pendingEmail;
      const updatedEmail = await this.prisma.user.update({
        where: { id: userId },
        data: { email: newEmail },
      });
      await this.prisma.verification.delete({
        where: { id: pendingRow.id },
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
      const candidateUserIds = new Set<string>();
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
  // SECTION: Multi-Account System (REMOVED in Better Auth migration)
  //
  // The legacy User/MasterAccount split + sub-account hierarchy is gone.
  // Each User row is now a flat top-level account. The endpoints below are
  // kept (still routed by user.controller.ts) but return "feature removed"
  // until the frontend is updated.
  // ===========================================================================

  async myAccounts(_req: any) {
    return {
      status: true,
      message: 'Multi-account feature removed',
      data: {
        masterAccount: null,
        currentAccount: null,
        allAccounts: [],
        buyerAccounts: [],
        freelancerAccounts: [],
        companyAccounts: [],
      },
    };
  }

  async createAccount(_payload: any, _req: any) {
    return {
      status: false,
      message: 'Multi-account feature removed; sign up a new top-level account instead',
    };
  }

  async switchAccount(_payload: any, _req: any) {
    return {
      status: false,
      message: 'Multi-account feature removed',
    };
  }

  async migrateSubAccounts(_req: any) {
    return {
      status: false,
      message: 'Multi-account feature removed',
    };
  }

  async currentAccount(_req: any) {
    return {
      status: true,
      message: 'Multi-account feature removed',
      data: null,
    };
  }
}
