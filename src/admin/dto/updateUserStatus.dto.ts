/**
 * @file updateUserStatus.dto.ts
 * @description Data Transfer Object for validating admin requests that change a
 *   user's account status.  The DTO enforces that only valid status values are
 *   accepted and that a required user ID is always present.
 *
 * @module AdminDTO
 *
 * @dependencies
 *   - class-validator decorators for runtime request body validation.
 *
 * @notes
 *   - The {@link UserStatus} enum is exported so that the service layer (and
 *     potentially other modules) can reference the same set of status constants.
 *   - Consumed by admin user-management endpoints such as `updateOneUser` and
 *     `bulkUpdateUserStatus`.
 */
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsNotEmpty,
} from 'class-validator';

/**
 * @enum UserStatus
 * @description Enumerates every lifecycle status a user account may occupy on
 *   the Ultrasooq platform.
 *
 * **Intent:** Provide a single source of truth for allowed user statuses that is
 *   shared between the DTO validation layer and the service-layer transition logic.
 *
 * **Values:**
 *   - `WAITING`                -- newly registered, pending initial review.
 *   - `ACTIVE`                 -- approved and fully operational.
 *   - `REJECT`                 -- rejected by an admin.
 *   - `INACTIVE`               -- deactivated (soft disable).
 *   - `WAITING_FOR_SUPER_ADMIN` -- escalated; awaiting super-admin decision.
 *
 * **Notes:** Must stay in sync with the Prisma schema's User.status enum values.
 */
export enum UserStatus {
  WAITING = 'WAITING',
  ACTIVE = 'ACTIVE',
  REJECT = 'REJECT',
  INACTIVE = 'INACTIVE',
  WAITING_FOR_SUPER_ADMIN = 'WAITING_FOR_SUPER_ADMIN',
}

/**
 * @class UpdateUserStatusDto
 * @description Validates the admin request body when updating a single user's
 *   account status (and optionally attaching an explanatory note).
 *
 * **Intent:** Guarantee that only structurally valid payloads reach the service
 *   layer, reducing defensive checks in business logic.
 *
 * **Idea:** class-validator decorators let the NestJS ValidationPipe reject
 *   malformed requests automatically, returning 400 Bad Request with details.
 *
 * **Usage:**
 *   ```
 *   PATCH /admin/updateOneUser
 *   Body: { "userId": 7, "status": "ACTIVE", "statusNote": "Approved after review" }
 *   ```
 *
 * **Data Flow:**
 *   HTTP Body --> ValidationPipe --> UpdateUserStatusDto --> AdminService.updateOneUser()
 *
 * **Dependencies:** class-validator (`IsNumber`, `IsNotEmpty`, `IsEnum`, `IsString`, `IsOptional`).
 *
 * **Notes:**
 *   - `statusNote` is optional; it is typically required by business rules only when
 *     the new status is REJECT or INACTIVE (enforced at the service level, not here).
 */
export class UpdateUserStatusDto {
  /** @property {number} userId - The unique ID of the user whose status will change. Required. */
  @IsNumber()
  @IsNotEmpty()
  userId: number;

  /** @property {UserStatus} status - The target status to transition the user to. Must be a valid {@link UserStatus} value. Required. */
  @IsEnum(UserStatus)
  @IsNotEmpty()
  status: UserStatus;

  /** @property {string} [statusNote] - An optional free-text note explaining the reason for the status change (e.g. rejection reason). */
  @IsString()
  @IsOptional()
  statusNote?: string;
}
