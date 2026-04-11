import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsInt,
  IsEnum,
  Min,
  Max,
  IsPositive,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

// ─── Enums ───────────────────────────────────────────────────

export enum DealTypeFilter {
  ALL = 'ALL',
  BUYGROUP = 'BUYGROUP',
  DROPSHIP = 'WHOLESALE_PRODUCT',
  SERVICE = 'SERVICE',
  RETAIL = 'NORMALSELL',
}

export enum DealStatusFilter {
  ALL = 'all',
  ACTIVE = 'ACTIVE',
  THRESHOLD_MET = 'THRESHOLD_MET',
  EXPIRED = 'EXPIRED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

// ─── Query DTOs ──────────────────────────────────────────────

export class DealListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: DealTypeFilter })
  @IsOptional()
  @IsString()
  dealType?: string = 'ALL';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string = 'all';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sort?: string = 'newest';
}

// ─── Action DTOs ─────────────────────────────────────────────

export class ExtendDealDto {
  @ApiProperty({ description: 'ProductPrice ID of the deal' })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productPriceId: number;

  @ApiProperty({ description: 'Number of days to extend (max = half of original duration)' })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  extendDays: number;
}

export class AcceptDealDto {
  @ApiProperty({ description: 'ProductPrice ID of the deal' })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productPriceId: number;

  @ApiProperty({ description: 'Bypass minimum customer threshold' })
  @IsOptional()
  bypassMinimum?: boolean = false;
}

export class CancelDealDto {
  @ApiProperty({ description: 'ProductPrice ID of the deal' })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productPriceId: number;

  @ApiPropertyOptional({ description: 'Reason for cancellation' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class NotifyBuyersDto {
  @ApiProperty({ description: 'ProductPrice ID of the deal' })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  productPriceId: number;

  @ApiProperty({ description: 'Message to send to all buyers' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(1000)
  message: string;
}

export class CancelOrderDto {
  @ApiProperty({ description: 'OrderProduct ID to cancel' })
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  orderProductId: number;

  @ApiPropertyOptional({ description: 'Reason for cancellation' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
