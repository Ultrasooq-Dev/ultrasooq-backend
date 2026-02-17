/**
 * @file create-sub-account.dto.ts — DTO for Creating a Sub-Account
 *
 * @intent
 *   Validates the request body for POST /user/createAccount. Defines the
 *   required and optional fields for creating a new sub-account under the
 *   currently authenticated user.
 *
 * @idea
 *   Part of the multi-account system that allows a single user to operate
 *   under different roles (buyer, freelancer, company). Each sub-account
 *   is stored as a UserAccount record linked to the main User.
 *
 * @usage
 *   - Used in UserController.createAccount(@Body() payload: CreateSubAccountDto)
 *   - Consumed by UserService.createAccount(payload, req)
 *   - Frontend: "My Accounts" page → "Create Account" form.
 *
 * @dataflow
 *   Frontend POST /user/createAccount → ValidationPipe → CreateSubAccountDto
 *   → UserService.createAccount() → prisma.userAccount.create()
 *
 * @depends
 *   - class-validator (IsString, IsEnum, IsOptional)
 *
 * @notes
 *   - Structurally identical to CreateUserAccountDto — these two DTOs could
 *     be consolidated into a single class.
 *   - Company fields are only meaningful when tradeRole === 'COMPANY'.
 */

import { IsString, IsEnum, IsOptional } from 'class-validator';

/**
 * TypeTrader — Allowed roles for sub-account creation.
 */
enum TypeTrader {
  BUYER = 'BUYER',
  FREELANCER = 'FREELANCER',
  COMPANY = 'COMPANY',
}

export class CreateSubAccountDto {
  @IsString()
  accountName: string;          // Display name for the sub-account

  @IsEnum(TypeTrader)
  tradeRole: TypeTrader;        // Trade role for this sub-account

  // Company-specific fields (optional, only for COMPANY role)
  @IsOptional()
  @IsString()
  companyName?: string;         // Legal company name

  @IsOptional()
  @IsString()
  companyAddress?: string;      // Company address

  @IsOptional()
  @IsString()
  companyPhone?: string;        // Company phone

  @IsOptional()
  @IsString()
  companyWebsite?: string;      // Company website

  @IsOptional()
  @IsString()
  companyTaxId?: string;        // Tax ID / VAT number
}
