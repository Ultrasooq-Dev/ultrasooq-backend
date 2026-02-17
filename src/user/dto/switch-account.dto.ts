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

import { IsNumber } from 'class-validator';

export class SwitchAccountDto {
  @IsNumber()
  userAccountId: number; // 0 for main account, >0 for sub-accounts
}
