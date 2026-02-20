/**
 * @file updateMultiple-productPrice.dto.ts
 * @description Data Transfer Objects for the bulk product-price update endpoint
 *   (`PATCH /product/updateMultipleProductPrice`).
 *   Allows a seller to update pricing, stock, discounts, and visibility for multiple
 *   existing product-price records in a single request.
 *
 * @module UpdateMultiplePriceForProductDTO
 *
 * @idea Enable batch modification of seller price rows so vendors can adjust catalogue
 *   pricing across many products without repeated API calls.
 *
 * @usage
 *   ```ts
 *   @Patch('/updateMultipleProductPrice')
 *   updateMultipleProductPrice(@Body() payload: UpdateMultiplePriceForProductDTO) { ... }
 *   ```
 *
 * @dataflow
 *   Client JSON -> ValidationPipe -> UpdateMultiplePriceForProductDTO
 *   -> ProductService.updateMultipleProductPrice() -> Prisma productPrice updates (loop)
 *
 * @dependencies
 *   - class-validator   -- decorator-based property validation
 *   - class-transformer -- `@Type()` for nested DTO hydration
 *
 * @notes
 *   - Each entry in the `productPrice` array targets a specific `productPriceId`.
 *   - All mutable fields (price, stock, discounts, sell type, etc.) are optional to
 *     support partial updates.
 *   - The `SellType` enum in this file includes an extra `EVERYONE` value not present
 *     in the single-update DTO.
 */
import { IsNotEmpty, IsOptional, IsNumber, IsArray, ValidateNested, IsInt, IsPositive, IsBoolean, IsString, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';

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
  HIDDEN = 'HIDDEN'
}

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
 *   - EVERYONE           -- available on all channels
 */
enum SellType {
  NORMALSELL = 'NORMALSELL',
  BUYGROUP = 'BUYGROUP',
  TRIAL_PRODUCT = 'TRIAL_PRODUCT',
  WHOLESALE_PRODUCT = 'WHOLESALE_PRODUCT',
  OTHERS = 'OTHERS',
  EVERYONE = 'EVERYONE',
}

/**
 * @class ProductPriceDTO
 * @description Nested DTO representing a single product-price entry to be updated.
 *   Identified by `productPriceId`; all other fields are optional for partial updates.
 *
 * @intent Validate every mutable field on a product-price row with appropriate type,
 *   range, and enum constraints before it reaches the database.
 *
 * @usage Included as elements of `UpdateMultiplePriceForProductDTO.productPrice`.
 *
 * @dataflow Validated array item -> `ProductService.updateMultipleProductPrice()` iterates
 *   and updates the corresponding `productPrice` Prisma record.
 *
 * @dependencies Enums {@link Status}, {@link ConsumerType}, {@link SellType}.
 *
 * @notes
 *   - `askForStock`, `askForPrice`, `askForSell` are string-encoded booleans (`'true'`/`'false'`).
 *   - `hideAllSelected` and `enableChat` are true booleans for UI-level toggles.
 *   - Numeric fields use `@Min(0)` to prevent negative values.
 */
// ProductPriceDTO
export class ProductPriceDTO {
  /** @description Primary key of the product-price record to update. */
  @IsNotEmpty()
  @IsInt()
  @IsPositive()
  productPriceId: number;

  /** @description Updated seller unit price (min 0). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  productPrice?: number;

  /** @description Updated promotional / offer price (min 0). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  offerPrice?: number;

  /** @description Lifecycle status for this price entry. */
  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  /** @description Foreign key to the seller's location record. */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  productLocationId?: number;

  /** @description Available stock quantity (min 0). */
  @IsOptional()
  @IsNumber()
  // @IsPositive()
  @Min(0)
  stock?: number;

  /** @description Delivery lead time in days (min 0). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryAfter?: number;

  /** @description Opening time offset (min 0). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  timeOpen?: number;

  /** @description Closing time offset (min 0). */
  @IsOptional()
  @IsNumber()
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

  /** @description Discount percentage for vendor buyers (min 0). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  vendorDiscount?: number;

  /** @description Discount calculation type for vendors (e.g. 'PERCENTAGE', 'FLAT'). */
  @IsOptional()
  @IsString()
  vendorDiscountType?: string;

  /** @description Discount percentage for consumer buyers (min 0). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  consumerDiscount?: number;

  /** @description Discount calculation type for consumers (e.g. 'PERCENTAGE', 'FLAT'). */
  @IsOptional()
  @IsString()
  consumerDiscountType?: string;

  /** @description Minimum order quantity (min 0). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  minQuantity?: number;

  /** @description Maximum order quantity (min 0). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxQuantity?: number;

  /** @description Product condition label (e.g. 'NEW', 'USED', 'REFURBISHED'). */
  @IsOptional()
  @IsString()
  productCondition?: string;

  /** @description Minimum number of unique customers required (buy-group scenarios, min 0). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  minCustomer?: number;

  /** @description Maximum number of unique customers allowed (buy-group scenarios, min 0). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxCustomer?: number;

  /** @description Minimum quantity a single customer may order (min 0). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  minQuantityPerCustomer?: number;

  /** @description Maximum quantity a single customer may order (min 0). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxQuantityPerCustomer?: number;

  /** @description String boolean -- 'true' if buyer must request stock info from seller. */
  @IsOptional()
  @IsString()
  askForStock?: string;

  /** @description String boolean -- 'true' if buyer must request price from seller. */
  @IsOptional()
  @IsString()
  askForPrice?: string;

  /** @description String boolean -- 'true' if buyer must request sell availability from seller. */
  @IsOptional()
  @IsString()
  askForSell?: string;

  /** @description UI flag -- when true, hides the product from storefront listings. */
  @IsOptional()
  @IsBoolean()
  hideAllSelected?: boolean;

  /** @description UI flag -- when true, enables the buyer-seller chat widget. */
  @IsOptional()
  @IsBoolean()
  enableChat?: boolean;
}

/**
 * @class UpdateMultiplePriceForProductDTO
 * @description Top-level DTO wrapping an array of {@link ProductPriceDTO} entries for
 *   the bulk price-update endpoint.
 *
 * @intent Provide a validated container so the service layer receives a guaranteed
 *   non-empty array of well-formed price-update entries.
 *
 * @usage
 *   ```ts
 *   @Patch('/updateMultipleProductPrice')
 *   updateMultipleProductPrice(@Body() payload: UpdateMultiplePriceForProductDTO) { ... }
 *   ```
 *
 * @dataflow Client JSON `{ productPrice: [...] }` -> validated DTO -> service loop.
 *
 * @dependencies {@link ProductPriceDTO}
 *
 * @notes The field name `productPrice` (singular noun, plural semantics) is intentional
 *   and matches the service expectation.
 */
// AddMultiplePriceForProductDTO
export class UpdateMultiplePriceForProductDTO {
  /** @description Non-empty array of product-price entries to update in bulk. */
  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductPriceDTO)
  productPrice: ProductPriceDTO[];
}

