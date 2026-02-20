/**
 * @file update-productPrice.dto.ts
 * @description Data Transfer Object for the single product-price update endpoint
 *   (`PATCH /product/updateProductPrice`).
 *   Validates and constrains every mutable field on a `productPrice` record.
 *
 * @module UpdatedProductPriceDto
 *
 * @idea Centralise the validation rules for a product-price update so the service layer
 *   can trust inbound data without ad-hoc checks.
 *
 * @usage
 *   ```ts
 *   @Patch('/updateProductPrice')
 *   updateProductPrice(@Body() updatedProductPriceDto: UpdatedProductPriceDto) { ... }
 *   ```
 *
 * @dataflow
 *   HTTP PATCH body (JSON) -> ValidationPipe -> UpdatedProductPriceDto
 *   -> ProductService.updateProductPrice() -> Prisma productPrice update
 *
 * @dependencies
 *   - class-validator -- decorator-based property validation (IsNumber, Min, Max, IsEnum, etc.)
 *
 * @notes
 *   - Prices accept up to 2 decimal places (`maxDecimalPlaces: 2`).
 *   - Discount fields are capped at 0-100 via `@Min(0)` / `@Max(100)`.
 *   - `status` is required (no `@IsOptional()`), unlike most other fields.
 *   - `askForSell`, `askForStock`, `askForPrice` are string-encoded booleans (`'true'`/`'false'`).
 */
import {
  IsNumber,
  IsString,
  IsOptional,
  IsEnum,
  Min,
  Max,
  IsInt,
  IsNotEmpty,
  IsBoolean,
} from 'class-validator';

/**
 * @enum ConsumerType
 * @description Target audience for a product-price entry.
 *   - CONSUMER  -- end consumers only
 *   - VENDORS   -- B2B vendor buyers only
 *   - EVERYONE  -- both audiences
 */
enum ConsumerType {
  CONSUMER = 'CONSUMER',
  VENDORS = 'VENDORS',
  EVERYONE = 'EVERYONE',
}

/**
 * @enum SellType
 * @description Sales channel classification for a product-price entry.
 *   - NORMALSELL         -- standard store listing
 *   - BUYGROUP           -- group-buy / collective purchasing
 *   - TRIAL_PRODUCT      -- trial / sample listing
 *   - WHOLESALE_PRODUCT  -- wholesale listing
 *   - OTHERS             -- catch-all
 */
enum SellType {
  NORMALSELL = 'NORMALSELL',
  BUYGROUP = 'BUYGROUP',
  TRIAL_PRODUCT = 'TRIAL_PRODUCT',
  WHOLESALE_PRODUCT = 'WHOLESALE_PRODUCT',
  OTHERS = 'OTHERS',
}

/**
 * @enum Status
 * @description Lifecycle status values for a product-price record.
 *   - ACTIVE   -- live and visible
 *   - INACTIVE -- draft / unpublished
 *   - DELETE   -- soft-deleted
 *   - HIDDEN   -- temporarily hidden from storefront
 */
enum Status {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DELETE = 'DELETE',
  HIDDEN = 'HIDDEN',
}

/**
 * @class UpdatedProductPriceDto
 * @description Validates the request body for `PATCH /product/updateProductPrice`.
 *   All fields except `productPriceId` and `status` are optional, enabling partial updates.
 *
 * @intent Allow sellers to modify any combination of pricing, stock, discount, sell-type,
 *   location, condition, quantity limits, and visibility settings on an existing price row.
 *
 * @usage Injected via `@Body()` in `ProductController.updateProductPrice()`.
 *
 * @dataflow Validated DTO -> `ProductService.updateProductPrice()` -> Prisma update with
 *   sell-country/state/city upsert side-effects.
 *
 * @dependencies class-validator enums {@link ConsumerType}, {@link SellType}, {@link Status}.
 *
 * @notes
 *   - `productPriceId` identifies the target record (required).
 *   - `hideAllSelected` is a UI toggle that controls bulk visibility.
 *   - `enableChat` toggles the buyer-seller chat widget on the product page.
 */
export class UpdatedProductPriceDto {
  // @IsNumber()
  // id: number;

  /** @description Primary key of the product-price record to update. */
  @IsNotEmpty()
  @IsNumber()
  productPriceId: number;

  // @IsNumber()
  // productId: number;

  /** @description Updated seller unit price (up to 2 decimal places, min 0). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  productPrice: number;

  /** @description Updated promotional / offer price (up to 2 decimal places, min 0). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  offerPrice: number;

  /** @description Base64-encoded barcode image data URL for the price entry. */
  @IsOptional()
  @IsString()
  productPriceBarcode?: string;

  /** @description Foreign key to the seller's location record. */
  @IsOptional()
  @IsNumber()
  productLocationId?: number;

  /** @description Available stock quantity (integer, min 0). */
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  /** @description String boolean -- 'true' if buyer must request price from seller. */
  @IsOptional()
  @IsString()
  askForPrice?: string;

  /** @description String boolean -- 'true' if buyer must request stock info from seller. */
  @IsOptional()
  @IsString()
  askForStock?: string;

  /** @description Delivery lead time in days (integer, min 0). */
  @IsOptional()
  @IsInt()
  @Min(0)
  deliveryAfter?: number;

  /** @description Opening time offset (integer representation, min 0). */
  @IsOptional()
  @IsInt()
  @Min(0)
  timeOpen?: number;

  /** @description Closing time offset (integer representation, min 0). */
  @IsOptional()
  @IsInt()
  @Min(0)
  timeClose?: number;

  /** @description Target audience for this price entry. */
  @IsOptional()
  @IsEnum(ConsumerType)
  consumerType?: ConsumerType;

  /** @description Sales channel type for this price entry. */
  @IsOptional()
  @IsEnum(SellType)
  sellType?: SellType;

  /** @description Discount percentage for vendor buyers (0-100). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  vendorDiscount?: number;

  /** @description Discount calculation type for vendors (e.g. 'PERCENTAGE', 'FLAT'). */
  @IsOptional()
  @IsString()
  vendorDiscountType?: string;

  /** @description Discount percentage for consumer buyers (0-100). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  consumerDiscount?: number;

  /** @description Discount calculation type for consumers (e.g. 'PERCENTAGE', 'FLAT'). */
  @IsOptional()
  @IsString()
  consumerDiscountType?: string;

  /** @description Minimum order quantity (integer, min 0). */
  @IsOptional()
  @IsInt()
  @Min(0)
  minQuantity?: number;

  /** @description Maximum order quantity (integer, min 0). */
  @IsOptional()
  @IsInt()
  @Min(0)
  maxQuantity?: number;

  /** @description Product condition label (e.g. 'NEW', 'USED', 'REFURBISHED'). */
  @IsOptional()
  @IsString()
  productCondition?: string;

  /** @description Minimum number of unique customers required (buy-group scenarios). */
  @IsOptional()
  @IsInt()
  @Min(0)
  minCustomer?: number;

  /** @description Maximum number of unique customers allowed (buy-group scenarios). */
  @IsOptional()
  @IsInt()
  @Min(0)
  maxCustomer?: number;

  /** @description Minimum quantity a single customer may order. */
  @IsOptional()
  @IsInt()
  @Min(0)
  minQuantityPerCustomer?: number;

  /** @description Maximum quantity a single customer may order. */
  @IsOptional()
  @IsInt()
  @Min(0)
  maxQuantityPerCustomer?: number;

  /** @description Lifecycle status (required for every update). */
  // @IsOptional()
  @IsEnum(Status)
  status?: Status;

  /** @description String boolean -- 'true' if buyer must request sell availability. */
  @IsOptional()
  @IsString()
  askForSell?: string;

  /** @description UI flag -- when true, the product is hidden from storefront listings. */
  @IsOptional()
  @IsBoolean()
  hideAllSelected?: boolean;

  /** @description UI flag -- when true, enables the buyer-seller chat widget on the product page. */
  @IsOptional()
  @IsBoolean()
  enableChat?: boolean;
}
