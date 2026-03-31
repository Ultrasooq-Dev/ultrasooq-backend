import {
  IsString,
  IsOptional,
  IsInt,
  IsIn,
  IsObject,
  MaxLength,
  IsArray,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TrackEventDto {
  @ApiProperty({ example: 'abc-123-session' })
  @IsString()
  sessionId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  userId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceId?: string;

  @ApiProperty({ example: 'page_view' })
  @IsString()
  @MaxLength(100)
  eventName: string;

  @ApiProperty({ example: 'pageView', enum: ['pageView', 'interaction', 'transaction', 'navigation'] })
  @IsIn(['pageView', 'interaction', 'transaction', 'navigation'])
  eventType: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  referrer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  locale?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tradeRole?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requestId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  clockOffset?: number;
}

export class BatchTrackEventsDto {
  @ApiProperty({ type: [TrackEventDto], maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TrackEventDto)
  events: TrackEventDto[];
}
