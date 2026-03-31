import {
  IsString,
  IsOptional,
  IsInt,
  IsIn,
  IsObject,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TrackErrorDto {
  @ApiProperty({ example: 'TypeError: Cannot read property of undefined' })
  @IsString()
  @MaxLength(1000)
  message: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  stack?: string;

  @ApiProperty({ example: 'frontend', enum: ['frontend', 'backend', 'api'] })
  @IsIn(['frontend', 'backend', 'api'])
  source: string;

  @ApiPropertyOptional({ example: 'error', enum: ['error', 'warning'] })
  @IsOptional()
  @IsIn(['error', 'warning'])
  level?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  userId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  endpoint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  statusCode?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
