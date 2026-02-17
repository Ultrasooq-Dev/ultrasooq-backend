/**
 * @file create-user-account.dto.ts — DTO for Creating a User Account (Multi-Account System)
 *
 * @intent
 *   Validates the request body when a user creates a new account within the
 *   multi-account system. Each user can have multiple accounts (buyer,
 *   freelancer, company) under a single login.
 *
 * @idea
 *   The platform supports a multi-account architecture where one authenticated
 *   user can operate under different trade roles. This DTO captures the account
 *   name, role type, and optional company details (for COMPANY accounts).
 *
 * @usage
 *   - Used in UserController.createAccount(@Body() payload: CreateSubAccountDto)
 *     Note: The controller actually uses CreateSubAccountDto, not this DTO.
 *     This DTO may be an earlier version or intended for a different endpoint.
 *   - Frontend sends this when creating a new sub-account from "My Accounts".
 *
 * @dataflow
 *   Frontend POST /user/createAccount → ValidationPipe → DTO → UserService.createAccount()
 *
 * @depends
 *   - class-validator (IsString, IsEnum, IsOptional)
 *
 * @notes
 *   - TypeTrader enum here only includes BUYER, FREELANCER, COMPANY (no MEMBER
 *     or ADMINMEMBER) — sub-accounts are limited to these three trade roles.
 *   - Company fields (companyName, companyAddress, companyPhone, companyWebsite,
 *     companyTaxId) are optional and only relevant when tradeRole is COMPANY.
 *   - This DTO is structurally identical to CreateSubAccountDto — potential
 *     duplication that could be consolidated.
 */

import { IsString, IsEnum, IsOptional } from 'class-validator';

/**
 * TypeTrader — Allowed roles for sub-account creation.
 * Subset of the full TradeRole enum (excludes MEMBER, ADMINMEMBER).
 */
enum TypeTrader {
  BUYER = 'BUYER',
  FREELANCER = 'FREELANCER',
  COMPANY = 'COMPANY',
}

export class CreateUserAccountDto {
  @IsString()
  accountName: string;          // Display name for the account (e.g., "My Buyer Account")

  @IsEnum(TypeTrader)
  tradeRole: TypeTrader;        // The trade role for this account

  // Company-specific fields (optional)
  @IsOptional()
  @IsString()
  companyName?: string;         // Legal company name (COMPANY role only)

  @IsOptional()
  @IsString()
  companyAddress?: string;      // Company physical address

  @IsOptional()
  @IsString()
  companyPhone?: string;        // Company phone number

  @IsOptional()
  @IsString()
  companyWebsite?: string;      // Company website URL

  @IsOptional()
  @IsString()
  companyTaxId?: string;        // Company tax identification number
}
