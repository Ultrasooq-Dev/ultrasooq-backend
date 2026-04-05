import { IsOptional, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RecommendationQueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;
}

export class ProductRecommendationQueryDto extends RecommendationQueryDto {
  @ApiPropertyOptional({ enum: ['similar', 'cobought', 'crosssell'] })
  @IsOptional()
  @IsIn(['similar', 'cobought', 'crosssell'])
  type?: string = 'similar';
}

export class TrendingQueryDto extends RecommendationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;
}
