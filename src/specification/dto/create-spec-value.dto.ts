/**
 * @dto CreateSpecValueDto
 * @description DTO for setting specification values on a product.
 */
import { IsString, IsInt, IsOptional, IsArray, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SpecValueInput {
  @IsInt()
  specTemplateId: number;

  @IsString()
  @IsOptional()
  value?: string;

  @IsNumber()
  @IsOptional()
  numericValue?: number;
}

export class CreateSpecValuesDto {
  @IsInt()
  productId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpecValueInput)
  values: SpecValueInput[];
}

export class UpdateSpecValueDto {
  @IsString()
  @IsOptional()
  value?: string;

  @IsNumber()
  @IsOptional()
  numericValue?: number;
}
