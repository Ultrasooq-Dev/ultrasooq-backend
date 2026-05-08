/**
 * @file switch-account.dto.ts — DTO for Switching Between User Accounts
 *
 * @intent
 *   Validates the request body for POST /user/switchAccount. Allows the
 *   authenticated user to switch between their main account and sub-accounts.
 *
 * @idea
 *   In the multi-account system, a user can have one main account and multiple
 *   sub-accounts (each with a different tradeRole). Switching accounts issues
 *   a new JWT with the selected account's context embedded.
 *
 * @usage
 *   - Used in UserController.switchAccount(@Body() payload: SwitchAccountDto)
 *   - Consumed by UserService.switchAccount(payload, req)
 *   - Frontend: "My Accounts" page → account selector.
 *
 * @dataflow
 *   Frontend POST /user/switchAccount → { userAccountId }
 *   → UserService.switchAccount() → AuthService.getToken() → new JWT
 *
 * @depends
 *   - class-validator (IsNumber)
 *
 * @notes
 *   - userAccountId = 0 means switch to the main account.
 *   - userAccountId > 0 references a specific UserAccount record ID.
 */

import { IsOptional } from 'class-validator';

export class SwitchAccountDto {
  // Better Auth User.id is a string. Pass null / 0 / master id to switch
  // back to the master account. Number is allowed for backwards compat
  // with callers that still send `userAccountId: 0`.
  @IsOptional()
  userAccountId?: string | number | null;
}
