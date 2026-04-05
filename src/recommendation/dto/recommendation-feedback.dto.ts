import { IsString, IsInt, IsIn, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecommendationFeedbackDto {
  @ApiProperty({ example: 'rec_a3f8b2_personal_2026-04-05' })
  @IsString()
  @MaxLength(100)
  recId: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  productId: number;

  @ApiProperty({ enum: ['impression', 'click', 'cart', 'purchase', 'dismiss'] })
  @IsIn(['impression', 'click', 'cart', 'purchase', 'dismiss'])
  action: string;

  @ApiPropertyOptional({ example: 'homepage' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  placement?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  position?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  algorithm?: string;
}
