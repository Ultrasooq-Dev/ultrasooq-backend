/**
 * @dto CreateSpecTemplateDto
 * @description DTO for creating a specification template linked to a category.
 */
import { IsString, IsInt, IsOptional, IsBoolean, IsEnum, IsArray, Min } from 'class-validator';

enum SpecDataType {
  TEXT = 'TEXT',
  NUMBER = 'NUMBER',
  SELECT = 'SELECT',
  MULTI_SELECT = 'MULTI_SELECT',
  BOOLEAN = 'BOOLEAN',
}

export class CreateSpecTemplateDto {
  @IsInt()
  categoryId: number;

  @IsString()
  name: string;

  @IsString()
  key: string;

  @IsEnum(SpecDataType)
  @IsOptional()
  dataType?: SpecDataType = SpecDataType.TEXT;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsArray()
  @IsOptional()
  options?: string[];

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean = false;

  @IsBoolean()
  @IsOptional()
  isFilterable?: boolean = true;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number = 0;

  @IsString()
  @IsOptional()
  groupName?: string;
}

export class UpdateSpecTemplateDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  key?: string;

  @IsEnum(SpecDataType)
  @IsOptional()
  dataType?: SpecDataType;

  @IsString()
  @IsOptional()
  unit?: string;

  @IsArray()
  @IsOptional()
  options?: string[];

  @IsBoolean()
  @IsOptional()
  isRequired?: boolean;

  @IsBoolean()
  @IsOptional()
  isFilterable?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @IsString()
  @IsOptional()
  groupName?: string;
}

export class BulkCreateSpecTemplateDto {
  @IsInt()
  categoryId: number;

  @IsArray()
  templates: Omit<CreateSpecTemplateDto, 'categoryId'>[];
}
