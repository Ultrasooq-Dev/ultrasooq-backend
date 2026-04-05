import { IsString, IsOptional, IsInt, IsEnum, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartScrapeDto {
  @ApiProperty({ enum: ['amazon', 'alibaba', 'aliexpress', 'taobao'] })
  @IsEnum(['amazon', 'alibaba', 'aliexpress', 'taobao'])
  platform: 'amazon' | 'alibaba' | 'aliexpress' | 'taobao';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  region?: string;

  @ApiProperty()
  @IsString()
  categoryUrl: string;

  @ApiProperty()
  @IsString()
  categoryPath: string;

  @ApiPropertyOptional({ default: 1000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  maxProducts?: number;

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  priority?: number;
}

export class ScrapeProgressDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  jobId?: number;

  @ApiPropertyOptional({ enum: ['amazon', 'alibaba', 'aliexpress', 'taobao'] })
  @IsOptional()
  @IsString()
  platform?: string;
}

export class ScrapeFixDto {
  @ApiProperty()
  @IsInt()
  jobId: number;

  @ApiProperty({ enum: ['new_session', 'change_region', 'reduce_rate', 'skip', 'wait'] })
  @IsEnum(['new_session', 'change_region', 'reduce_rate', 'skip', 'wait'])
  strategy: 'new_session' | 'change_region' | 'reduce_rate' | 'skip' | 'wait';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  newRegion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  waitMinutes?: number;
}

export class ExportBatchDto {
  @ApiProperty({ enum: ['amazon', 'alibaba', 'aliexpress', 'taobao'] })
  @IsEnum(['amazon', 'alibaba', 'aliexpress', 'taobao'])
  platform: 'amazon' | 'alibaba' | 'aliexpress' | 'taobao';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ enum: ['json', 'csv'], default: 'json' })
  @IsOptional()
  @IsString()
  format?: 'json' | 'csv';
}

export class ImportToDbDto {
  @ApiProperty()
  @IsString()
  batchId: string;
}

export class CategoryMapDto {
  @ApiProperty()
  @IsString()
  sourcePath: string;

  @ApiProperty({ enum: ['amazon', 'alibaba', 'aliexpress', 'taobao'] })
  @IsEnum(['amazon', 'alibaba', 'aliexpress', 'taobao'])
  platform: 'amazon' | 'alibaba' | 'aliexpress' | 'taobao';
}
