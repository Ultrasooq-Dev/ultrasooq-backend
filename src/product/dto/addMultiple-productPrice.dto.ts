/**
 * @file addMultiple-productPrice.dto.ts
 * @description Data Transfer Objects for the bulk product-price creation endpoint
 *   (`POST /product/addMultiplePriceForProduct`).
 *   Allows a seller to add their own pricing rows for multiple existing products in a
 *   single HTTP request.
 *
 * @module AddMultiplePriceForProductDTO
 *
 * @idea Enable batch onboarding of seller prices so that vendors can quickly list prices
 *   for many catalogue products without repeated API calls.
 *
 * @usage
 *   Used as the `@Body()` type in `ProductController.addMultiplePriceForProduct()`.
 *   ```ts
 *   @Post('/addMultiplePriceForProduct')
 *   addMultiplePriceForProduct(@Body() payload: AddMultiplePriceForProductDTO) { ... }
 *   ```
 *
 * @dataflow
 *   Client JSON -> ValidationPipe -> AddMultiplePriceForProductDTO
 *   -> ProductService.addMultiplePriceForProduct() -> Prisma productPrice inserts
 *
 * @dependencies
 *   - class-validator  -- decorator-based property validation
 *   - class-transformer -- `@Type()` for nested DTO hydration
 *
 * @notes
 *   - Each entry in the `productPrice` array targets a different `productId`.
 *   - The commented-out `AddMultiplePriceForProductResponseDTO` was a planned response
 *     envelope DTO that is not currently in use.
 */
import { IsNotEmpty, IsOptional, IsNumber, IsArray, ValidateNested, IsInt, IsPositive, IsBoolean, IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * @enum Status
 * @description Lifecycle status values for a product price record.
 *
 * @notes Maps directly to the `status` column on the `productPrice` table.
 *   - ACTIVE  -- visible and purchasable
 *   - INACTIVE -- draft / not yet published
 *   - DELETE  -- soft-deleted (retained for audit)
 *   - HIDDEN  -- temporarily hidden from storefront
 */
enum Status {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DELETE = 'DELETE',
  HIDDEN = 'HIDDEN'
}

/**
 * @class ProductPriceDTO
 * @description Nested DTO representing a single product-price entry to be created.
 *
 * @intent Validate the minimum required fields (productId) and optional pricing / status
 *   fields for one seller-price row.
 *
 * @usage Included as elements of `AddMultiplePriceForProductDTO.productPrice`.
 *
 * @dataflow Validated array item -> `ProductService.addMultiplePriceForProduct()` iterates
 *   and creates a `productPrice` record per entry.
 *
 * @dependencies None beyond class-validator.
 *
 * @notes
 *   - `askForStock` / `askForPrice` are string booleans (`'true'` / `'false'`) controlling
 *     whether the buyer must request stock or price information from the seller.
 */
// ProductPriceDTO
export class ProductPriceDTO {
  /** @description Primary key of the product this price entry belongs to. */
  @IsNotEmpty()
  @IsInt()
  @IsPositive()
  productId: number;

  /** @description Seller's listed unit price. */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  productPrice?: number;

  /** @description Seller's promotional / offer price. */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  offerPrice?: number;

  /** @description Lifecycle status for this price entry (default determined server-side). */
  @IsOptional()
  @IsEnum(Status)
  status?: Status;

  /** @description String boolean flag -- 'true' means the buyer must ask the seller for stock availability. */
  @IsOptional()
  @IsString()
  askForStock?: string;

  /** @description String boolean flag -- 'true' means the buyer must ask the seller for the price. */
  @IsOptional()
  @IsString()
  askForPrice?: string;
}

/**
 * @class AddMultiplePriceForProductDTO
 * @description Top-level DTO wrapping an array of {@link ProductPriceDTO} entries for
 *   the bulk price-addition endpoint.
 *
 * @intent Provide a validated container so the service layer receives a guaranteed
 *   non-empty array of well-formed price entries.
 *
 * @usage
 *   ```ts
 *   @Post('/addMultiplePriceForProduct')
 *   addMultiplePriceForProduct(@Body() payload: AddMultiplePriceForProductDTO) { ... }
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
export class AddMultiplePriceForProductDTO {
  /** @description Non-empty array of product price entries to create in bulk. */
  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductPriceDTO)
  productPrice: ProductPriceDTO[];
}

