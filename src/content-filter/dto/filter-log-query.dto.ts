import { IsOptional, IsString, IsNumberString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FilterLogQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @ApiPropertyOptional({ example: 42, description: 'Filter by user ID' })
  @IsOptional()
  @IsNumberString()
  userId?: string;

  @ApiPropertyOptional({ example: 'SEVERE', enum: ['MILD', 'MODERATE', 'SEVERE'] })
  @IsOptional()
  @IsString()
  severity?: string;

  @ApiPropertyOptional({ example: 'product_listing', description: 'Filter by context (e.g. product_listing, chat)' })
  @IsOptional()
  @IsString()
  context?: string;

  @ApiPropertyOptional({ example: '2025-01-01', description: 'Start date (ISO string)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2025-12-31', description: 'End date (ISO string)' })
  @IsOptional()
  @IsString()
  endDate?: string;
}
