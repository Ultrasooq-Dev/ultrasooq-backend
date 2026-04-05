import { IsNotEmpty, IsString, IsUrl, IsInt, IsBoolean, IsOptional, IsArray, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ListProductDto {
  @ApiProperty({ 
    description: 'Product URL to scrape and list',
    example: 'https://amzn.in/d/61zYF5m'
  })
  @IsNotEmpty()
  @IsString()
  @IsUrl()
  url: string;

  @ApiProperty({ 
    description: 'Category ID for the product',
    example: 1
  })
  @IsNotEmpty()
  @IsInt()
  categoryId: number;

  @ApiProperty({ 
    description: 'Automatically list the product after scraping',
    example: true,
    required: false,
    default: false
  })
  @IsOptional()
  @IsBoolean()
  autolist?: boolean;

  @ApiProperty({ 
    description: 'Brand ID for the product',
    example: 1,
    required: false
  })
  @IsOptional()
  @IsInt()
  brandId?: number;

  @ApiProperty({ 
    description: 'Place of origin ID for the product',
    example: 1,
    required: false
  })
  @IsOptional()
  @IsInt()
  placeOfOriginId?: number;

  @ApiProperty({ 
    description: 'Product type (P: Product, R: RFQ, F: Factory, D: Dropship)',
    example: 'P',
    required: false,
    enum: ['P', 'R', 'F', 'D']
  })
  @IsOptional()
  @IsString()
  @IsIn(['P', 'R', 'F', 'D'])
  productType?: 'P' | 'R' | 'F' | 'D';

  @ApiProperty({ 
    description: 'Array of tag IDs to associate with the product',
    example: [1, 2, 3],
    required: false,
    type: [Number]
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  tagIds?: number[];
}
