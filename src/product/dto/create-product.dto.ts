/**
 * @file create-product.dto.ts
 * @description Data Transfer Objects for the product creation endpoint (`POST /product/create`).
 *   Contains the main {@link CreateProductDto} and its nested sub-DTOs that validate
 *   tags, images, pricing entries, and short descriptions sent in the request body.
 *
 * @module CreateProductDto
 *
 * @idea Enforce structural and type-level validation on the inbound JSON payload
 *   before the service layer touches the database, using class-validator decorators.
 *
 * @usage
 *   Used as the `@Body()` type in `ProductController.create()`.
 *   NestJS's global `ValidationPipe` triggers the class-validator checks automatically.
 *
 * @dataflow
 *   HTTP POST body (JSON) -> ValidationPipe -> CreateProductDto instance -> ProductService.create()
 *
 * @dependencies
 *   - class-validator  -- decorator-based property validation
 *   - class-transformer -- `@Type()` for nested DTO hydration
 *
 * @notes
 *   - The controller currently types the payload as `any`, so this DTO may not be
 *     actively enforced at runtime unless the ValidationPipe is configured globally.
 *   - `productType` defaults to `'P'` (physical product).
 *   - `status` defaults to `'INACTIVE'`; products are activated explicitly after review.
 */
import { IsNotEmpty, IsOptional, IsString, IsNumber, IsArray, ValidateNested, IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * @class ProductTagDto
 * @description Nested DTO representing a single tag association for a product.
 *
 * @intent Map an existing tag (by its primary key) to the product being created.
 *
 * @usage Included as elements of `CreateProductDto.productTagList`.
 *
 * @dataflow Validated array item -> persisted to `productTags` table with the new product's ID.
 *
 * @dependencies None beyond class-validator.
 *
 * @notes The referenced `tagId` must exist in the `Tag` table; referential integrity
 *   is enforced at the database level, not here.
 */
class ProductTagDto {
  /** @description Primary key of the tag to associate with the product. */
  @IsNotEmpty()
  @IsInt()
  tagId: number;
}

/**
 * @class ProductImageDto
 * @description Nested DTO representing a single image or video asset for a product.
 *
 * @intent Carry image/video S3 keys and display names from the client to the service layer.
 *
 * @usage Included as elements of `CreateProductDto.productImagesList`.
 *
 * @dataflow Validated array item -> persisted to `productImages` table.
 *
 * @dependencies None beyond class-validator.
 *
 * @notes All fields are optional so that a record may contain only an image, only a video,
 *   or both.
 */
class ProductImageDto {
  /** @description Human-readable file name for the image. */
  @IsOptional()
  @IsString()
  imageName?: string;

  /** @description S3 key or URL for the product image. */
  @IsOptional()
  @IsString()
  image?: string;

  /** @description Human-readable file name for the video. */
  @IsOptional()
  @IsString()
  videoName?: string;

  /** @description S3 key or URL for the product video. */
  @IsOptional()
  @IsString()
  video?: string;
}

/**
 * @class ProductPriceDto
 * @description Nested DTO representing a single seller-specific price entry for a product.
 *
 * @intent Capture pricing, stock, delivery, discount, and sell-type details that are
 *   unique to the seller adding the product to their catalogue.
 *
 * @usage Included as elements of `CreateProductDto.productPriceList`.
 *
 * @dataflow Validated array item -> persisted to `productPrice` table with a generated barcode.
 *
 * @dependencies None beyond class-validator.
 *
 * @notes
 *   - `consumerType` distinguishes CONSUMER / VENDORS / EVERYONE audiences.
 *   - `sellType` distinguishes NORMALSELL / BUYGROUP / TRIAL_PRODUCT / WHOLESALE_PRODUCT / OTHERS.
 *   - Discount fields are percentages (0-100).
 */
class ProductPriceDto {
  /** @description Seller's listed price for the product. */
  @IsNotEmpty()
  @IsNumber()
  productPrice: number;

  /** @description Discounted offer price; may be lower than productPrice. */
  @IsOptional()
  @IsNumber()
  offerPrice?: number;

  /** @description Foreign key to the seller's product location record. */
  @IsOptional()
  @IsInt()
  productLocationId?: number;

  /** @description Available stock quantity. */
  @IsOptional()
  @IsInt()
  stock?: number;

  /** @description Estimated delivery time description (e.g. "3 days"). */
  @IsOptional()
  @IsString()
  deliveryAfter?: string;

  /** @description Opening time for availability window. */
  @IsOptional()
  @IsString()
  timeOpen?: string;

  /** @description Closing time for availability window. */
  @IsOptional()
  @IsString()
  timeClose?: string;

  /** @description Target consumer audience: CONSUMER | VENDORS | EVERYONE. */
  @IsOptional()
  @IsString()
  consumerType?: string;

  /** @description Sell channel type: NORMALSELL | BUYGROUP | TRIAL_PRODUCT | WHOLESALE_PRODUCT | OTHERS. */
  @IsOptional()
  @IsString()
  sellType?: string;

  /** @description Discount percentage offered to vendor buyers. */
  @IsOptional()
  @IsNumber()
  vendorDiscount?: number;

  /** @description Discount percentage offered to consumer buyers. */
  @IsOptional()
  @IsNumber()
  consumerDiscount?: number;

  /** @description Minimum order quantity. */
  @IsOptional()
  @IsInt()
  minQuantity?: number;

  /** @description Maximum order quantity. */
  @IsOptional()
  @IsInt()
  maxQuantity?: number;
}

/**
 * @class ProductShortDescriptionDto
 * @description Nested DTO for a single short-description bullet or blurb.
 *
 * @intent Allow multiple short descriptions / feature highlights to be attached to a product.
 *
 * @usage Included as elements of `CreateProductDto.productShortDescriptionList`.
 *
 * @dataflow Validated array item -> persisted to `productShortDescription` table.
 *
 * @dependencies None beyond class-validator.
 *
 * @notes Each entry is a standalone text block; ordering is implicit by array index.
 */
class ProductShortDescriptionDto {
  /** @description The short description text content. */
  @IsNotEmpty()
  @IsString()
  shortDescription: string;
}

/**
 * @class CreateProductDto
 * @description Top-level DTO for the `POST /product/create` endpoint.
 *
 * @intent Validate and type-check the full product creation payload, including nested
 *   arrays for tags, images, price entries, and short descriptions.
 *
 * @usage
 *   ```ts
 *   @Post('/create')
 *   create(@Body() payload: CreateProductDto) { ... }
 *   ```
 *
 * @dataflow
 *   Client JSON -> NestJS ValidationPipe -> CreateProductDto -> ProductService.create()
 *   -> Prisma product + related records
 *
 * @dependencies
 *   - {@link ProductTagDto}              -- tag associations
 *   - {@link ProductImageDto}            -- image/video assets
 *   - {@link ProductPriceDto}            -- seller pricing entries
 *   - {@link ProductShortDescriptionDto} -- short description blurbs
 *
 * @notes
 *   - `productType` defaults to `'P'` (physical product); other values include `'S'` (service).
 *   - `status` defaults to `'INACTIVE'` so new products require explicit activation.
 *   - `skuNo` uniqueness is enforced by the service layer, not the DTO.
 */
export class CreateProductDto {
  /** @description Display name of the product. */
  @IsNotEmpty()
  @IsString()
  productName: string;

  /** @description Product type code; defaults to 'P' (physical). */
  @IsOptional()
  @IsString()
  productType?: string = 'P';

  /** @description Foreign key to the product's category. */
  @IsNotEmpty()
  @IsInt()
  categoryId: number;

  /** @description Foreign key to the product's brand (optional). */
  @IsOptional()
  @IsInt()
  brandId?: number;

  /** @description Foreign key to the country of origin (optional). */
  @IsOptional()
  @IsInt()
  placeOfOriginId?: number;

  /** @description Stock Keeping Unit number; must be unique across all products. */
  @IsNotEmpty()
  @IsString()
  skuNo: string;

  /** @description Base product price; defaults to 0. */
  @IsOptional()
  @IsNumber()
  productPrice?: number = 0;

  /** @description Base offer / sale price; defaults to 0. */
  @IsOptional()
  @IsNumber()
  offerPrice?: number = 0;

  /** @description Brief summary text for the product. */
  @IsOptional()
  @IsString()
  shortDescription?: string;

  /** @description Full HTML or plain-text description. */
  @IsOptional()
  @IsString()
  description?: string;

  /** @description Technical specification text. */
  @IsOptional()
  @IsString()
  specification?: string;

  /** @description Serialised category-location breadcrumb or path. */
  @IsOptional()
  @IsString()
  categoryLocation?: string;

  /** @description Lifecycle status; defaults to 'INACTIVE'. Values: ACTIVE | INACTIVE | DELETE | HIDDEN. */
  @IsOptional()
  @IsString()
  status?: string = 'INACTIVE';

  /** @description Admin/owner user ID; resolved server-side via HelperService if omitted. */
  @IsOptional()
  @IsInt()
  adminId?: number;

  /** @description Array of tag associations to link with this product. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductTagDto)
  productTagList?: ProductTagDto[];

  /** @description Array of image/video assets to attach to this product. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageDto)
  productImagesList?: ProductImageDto[];

  /** @description Array of seller-specific price entries for this product. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductPriceDto)
  productPriceList?: ProductPriceDto[];

  /** @description Array of short description blurbs / feature highlights. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductShortDescriptionDto)
  productShortDescriptionList?: ProductShortDescriptionDto[];

  @IsOptional()
  @IsNumber()
  scrapMarkup?: number;

  @IsOptional()
  @IsNumber()
  scrapMarkupPercentage?: number;
}
