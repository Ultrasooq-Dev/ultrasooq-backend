import {
  IsString,
  IsOptional,
  IsNumber,
  IsIn,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TrackPerformanceDto {
  @ApiProperty({ example: 'LCP', enum: ['LCP', 'FID', 'CLS', 'TTFB', 'INP', 'api_latency'] })
  @IsString()
  @IsIn(['LCP', 'FID', 'CLS', 'TTFB', 'INP', 'api_latency'])
  metricName: string;

  @ApiProperty({ example: 1200.5 })
  @IsNumber()
  metricValue: number;

  @ApiProperty({ example: 'frontend', enum: ['frontend', 'backend'] })
  @IsIn(['frontend', 'backend'])
  source: string;

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
  @IsString()
  @MaxLength(10)
  method?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requestId?: string;
}
