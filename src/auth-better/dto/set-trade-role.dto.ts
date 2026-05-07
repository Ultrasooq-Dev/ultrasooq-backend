/**
 * @file set-trade-role.dto.ts — DTO for PATCH /api/v1/user/me/trade-role
 *
 * Validates the body of the trade-role upgrade request fired by the
 * register page Step 3 right after a fresh Better Auth sign-up. Mirrors
 * the legacy User shape so callers can persist BUYER / COMPANY / FREELANCER
 * without dropping role-specific fields.
 *
 * Validators tightened: every string field is trimmed and length-bounded;
 * `companyWebsite` requires a protocol-qualified URL; `companyPhone` is
 * format-restricted to digits, spaces, and standard punctuation.
 */
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

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
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  companyName?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(500)
  companyAddress?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(20)
  @Matches(/^[+\d\s\-()]+$/, {
    message: 'companyPhone must contain only digits, spaces, and the characters + - ( )',
  })
  companyPhone?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  @IsUrl({ require_protocol: true })
  companyWebsite?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(100)
  companyTaxId?: string;

  // FREELANCER-only field.
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  accountName?: string;
}
