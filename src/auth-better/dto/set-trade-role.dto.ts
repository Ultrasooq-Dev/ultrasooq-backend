/**
 * @file set-trade-role.dto.ts — DTO for PATCH /api/v1/user/me/trade-role
 *
 * Validates the body of the trade-role upgrade request fired by the
 * register page Step 3 right after a fresh Better Auth sign-up. Mirrors
 * the legacy User shape so callers can persist BUYER / COMPANY / FREELANCER
 * without dropping role-specific fields.
 */
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum TradeRole {
  BUYER = 'BUYER',
  FREELANCER = 'FREELANCER',
  COMPANY = 'COMPANY',
}

export class SetTradeRoleDto {
  @IsEnum(TradeRole)
  tradeRole!: TradeRole;

  // COMPANY-only fields — silently ignored for non-COMPANY tradeRole values.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  companyAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  companyPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyWebsite?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyTaxId?: string;

  // FREELANCER-only field.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  accountName?: string;
}
