import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFilterRuleDto {
  @ApiProperty({ example: 'porn' })
  @IsString()
  term: string;

  @ApiPropertyOptional({ example: 'p[o0]rn' })
  @IsOptional()
  @IsString()
  pattern?: string;

  @ApiProperty({ example: 'adult', enum: ['adult', 'profanity', 'hate_speech', 'drugs', 'scam', 'weapons'] })
  @IsString()
  category: string;

  @ApiProperty({ example: 'SEVERE', enum: ['MILD', 'MODERATE', 'SEVERE'] })
  @IsString()
  severity: string;

  @ApiPropertyOptional({ example: 'en', default: 'en' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
