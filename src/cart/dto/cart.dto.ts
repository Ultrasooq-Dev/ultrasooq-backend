/**
 * @file cart.dto.ts
 * @description Data Transfer Object (DTO) definitions for the Cart module's service-related
 * endpoints. These DTOs are validated by NestJS's `ValidationPipe` (via `class-validator`
 * decorators) before reaching the controller handlers.
 *
 * Contains:
 * - {@link AddCartServiceDto} -- DTO for adding/updating a standalone service in the cart.
 * - {@link CartServiceFeatureDto} -- Nested DTO representing a single service feature line-item.
 * - {@link AddCartServiceProdDto} -- DTO for linking a product to an existing service cart entry.
 * - {@link JSONValue} -- Utility type for JSON-safe values used in the `object` field.
 *
 * @module CartDTO
 *
 * @dependencies
 * - `class-validator` -- Provides declarative validation decorators.
 * - `class-transformer` -- `@Type` decorator enables nested DTO transformation.
 * - `@prisma/client/runtime/library` -- `JsonObject` and `JsonArray` types for JSON column typing.
 *
 * @notes
 * - Only service-related cart operations use strongly-typed DTOs; standard product cart
 *   endpoints still use `payload: any` in the controller.
 * - Validation errors are automatically transformed into 400 Bad Request responses by the
 *   global ValidationPipe.
 */
import { Prisma } from '../../generated/prisma/client';
type JsonArray = Prisma.JsonArray;
type JsonObject = Prisma.JsonObject;
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsJSON,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  ValidateNested,
} from 'class-validator';

/**
 * @class AddCartServiceDto
 * @description DTO for the `PATCH /cart/updateservice` endpoint. Represents a request to
 * add or update a standalone service in the shopping cart with one or more feature selections.
 *
 * @intent Validate that the client sends a valid service ID and a non-empty array of
 * feature line-items before the request reaches the service layer.
 *
 * @idea The `features` array uses nested validation via `@ValidateNested` and `@Type`,
 * ensuring each element is itself validated against {@link CartServiceFeatureDto}.
 *
 * @usage Applied as `@Body() dto: AddCartServiceDto` in `CartController.updateService`.
 *
 * @dataflow HTTP body -> ValidationPipe (class-validator) -> AddCartServiceDto instance
 * -> CartController -> CartService.updateCartService.
 *
 * @dependencies {@link CartServiceFeatureDto} for nested feature validation.
 *
 * @notes The `serviceId` must be a positive integer matching an existing Service record in
 * the database (referential integrity is checked at the Prisma layer, not the DTO layer).
 */
export class AddCartServiceDto {
  /**
   * @property serviceId
   * @description The unique identifier of the Service to add to the cart.
   * Must be a non-empty, positive integer.
   */
  @IsNotEmpty()
  @IsInt()
  @IsPositive()
  serviceId: number;

  /**
   * @property features
   * @description Array of feature line-items to associate with this service cart entry.
   * Must contain at least one element. Each element is validated against
   * {@link CartServiceFeatureDto}.
   */
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CartServiceFeatureDto)
  features: CartServiceFeatureDto[];
}

/**
 * @class CartServiceFeatureDto
 * @description Nested DTO representing a single service feature selection within an
 * {@link AddCartServiceDto} request.
 *
 * @intent Validate each feature line-item: the feature reference, quantity, and optional
 * booking date-time.
 *
 * @idea Each feature maps to a `CartServiceFeature` row in the database, linking a Cart
 * entry to a specific `ServiceFeature` with a quantity and optional appointment slot.
 *
 * @usage Nested inside `AddCartServiceDto.features[]`. Not exported -- only used internally
 * by the cart DTO module.
 *
 * @dataflow Part of `AddCartServiceDto` -> validated per-element by `@ValidateNested`.
 *
 * @dependencies None (leaf DTO).
 *
 * @notes `bookingDateTime` is optional and validated as ISO 8601 format when provided.
 */
class CartServiceFeatureDto {
  /**
   * @property serviceFeatureId
   * @description FK referencing the `ServiceFeature` record to add. Must be a non-empty,
   * positive integer.
   */
  @IsNotEmpty()
  @IsInt()
  @IsPositive()
  serviceFeatureId: number;

  /**
   * @property quantity
   * @description Number of units of this service feature. Must be a non-empty, positive integer.
   */
  @IsNotEmpty()
  @IsInt()
  @IsPositive()
  quantity: number;

  /**
   * @property bookingDateTime
   * @description Optional appointment or booking date-time for this service feature.
   * When provided, must be a valid ISO 8601 date string (e.g., "2025-06-15T10:00:00Z").
   */
  @IsOptional()
  @IsISO8601()
  bookingDateTime?: string;
}

/**
 * @class AddCartServiceProdDto
 * @description DTO for the `PATCH /cart/updateservice/product` endpoint. Represents a request
 * to create a product cart entry linked to an existing service cart entry via the
 * `CartProductService` join table.
 *
 * @intent Validate that the client provides all required IDs (cart, service, product,
 * productPrice), the correct cart type labels, and a valid quantity before creating the
 * transactional service-product link.
 *
 * @idea Enforces fixed values for `cartType` ('SERVICE') and `relatedCartType` ('PRODUCT')
 * via `@IsIn` validators, ensuring the join record direction is always correct.
 *
 * @usage Applied as `@Body() dto: AddCartServiceProdDto` in `CartController.updateServiceProduct`.
 *
 * @dataflow HTTP body -> ValidationPipe -> AddCartServiceProdDto instance
 * -> CartController -> CartService.updateServiceProduct -> Prisma $transaction.
 *
 * @dependencies None (leaf DTO). Uses `JSONValue` type alias for the `object` field.
 *
 * @notes The `object` field stores arbitrary JSON (product variant data) and is validated
 * with `@IsJSON` when provided.
 */
export class AddCartServiceProdDto {
  /**
   * @property cartId
   * @description The primary key of the existing **service** Cart row to which the product
   * will be linked. Must be a non-empty, positive integer.
   */
  @IsNotEmpty()
  @IsInt()
  @IsPositive()
  cartId: number;

  /**
   * @property serviceId
   * @description FK referencing the Service associated with this cart bundle.
   * Must be a non-empty, positive integer.
   */
  @IsNotEmpty()
  @IsInt()
  @IsPositive()
  serviceId: number;

  /**
   * @property relatedCartType
   * @description Type label for the **related** (product) side of the CartProductService
   * join. Must be exactly 'PRODUCT'.
   */
  @IsNotEmpty()
  @IsIn(['PRODUCT'])
  relatedCartType: 'PRODUCT';

  /**
   * @property productId
   * @description FK referencing the Product to add. Must be a non-empty, positive integer.
   */
  @IsNotEmpty()
  @IsInt()
  @IsPositive()
  productId: number;

  /**
   * @property productPriceId
   * @description FK referencing the specific ProductPrice variant. Must be a non-empty,
   * positive integer.
   */
  @IsNotEmpty()
  @IsInt()
  @IsPositive()
  productPriceId: number;

  /**
   * @property quantity
   * @description Number of units of the product to add. Must be a non-empty, positive integer.
   */
  @IsNotEmpty()
  @IsInt()
  @IsPositive()
  quantity: number;

  /**
   * @property cartType
   * @description Type label for the **owning** (service) side of the CartProductService
   * join. Must be exactly 'SERVICE'.
   */
  @IsNotEmpty()
  @IsIn(['SERVICE'])
  cartType: 'SERVICE';

  /**
   * @property object
   * @description Optional JSON payload storing product variant data (e.g., selected colour,
   * size). Validated as a JSON string when provided. Stored in the Cart `object` column.
   */
  @IsOptional()
  @IsJSON()
  object?: {
    [key: string]: JSONValue;
  };
}

/**
 * @typedef {string | number | boolean | null | JsonObject | JsonArray} JSONValue
 * @description Recursive type representing any valid JSON-serialisable value. Used to type
 * the `object` property in {@link AddCartServiceProdDto} for product variant data storage.
 */
type JSONValue = string | number | boolean | null | JsonObject | JsonArray;
