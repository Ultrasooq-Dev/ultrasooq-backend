/**
 * @file getOne-productPrice.dto.ts
 * @description Data Transfer Object for endpoints that operate on a single product-price
 *   record identified by its primary key:
 *   - `GET  /product/getOneProductPrice`
 *   - `DELETE /product/deleteOneProductPrice`
 *
 * @module GetOneProductPriceDto
 *
 * @idea Provide a reusable, validated query-parameter container wherever a single
 *   `productPriceId` is the only required input.
 *
 * @usage
 *   ```ts
 *   @Get('/getOneProductPrice')
 *   getOneProductPrice(@Query() query: GetOneProductPriceDto) { ... }
 *   ```
 *
 * @dataflow
 *   HTTP query string `?productPriceId=123` -> class-transformer `@Type(() => Number)` coercion
 *   -> class-validator `@IsInt()` check -> service method receives a validated number.
 *
 * @dependencies
 *   - class-validator   -- `@IsInt()` constraint
 *   - class-transformer -- `@Type()` for query-string-to-number coercion
 *
 * @notes
 *   - Query parameters arrive as strings; `@Type(() => Number)` converts them before validation.
 *   - The same DTO is shared by both the GET (fetch) and DELETE (soft-delete) endpoints.
 */
import { IsInt } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * @class GetOneProductPriceDto
 * @description Validates that the caller supplies a valid integer `productPriceId`
 *   query parameter.
 *
 * @intent Prevent invalid or missing product-price IDs from reaching the database layer.
 *
 * @usage Bound via `@Query()` decorator on controller methods.
 *
 * @dataflow Query string -> DTO instance -> `ProductService.getOneProductPrice()` or
 *   `ProductService.deleteOneProductPrice()`.
 *
 * @dependencies class-validator, class-transformer.
 *
 * @notes The `@Type(() => Number)` decorator is essential because NestJS query params
 *   are natively strings; without it, `@IsInt()` would always fail.
 */
export class GetOneProductPriceDto {
  /** @description Primary key of the product-price record to fetch or delete. */
  @IsInt()
  @Type(() => Number)
  productPriceId: number;
}
