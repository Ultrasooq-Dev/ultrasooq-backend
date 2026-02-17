/**
 * @file updateProductType.dto.ts
 * @description Data Transfer Object used to validate the request body when an admin
 *   updates the type classification of a product (e.g. VENDORLOCAL vs BRAND).
 *
 * @module AdminDTO
 *
 * @dependencies
 *   - class-validator decorators for runtime payload validation in the NestJS validation pipe.
 *
 * @notes
 *   - Consumed by {@link AdminController.updateProductType} via `@Body()`.
 *   - The {@link TypeProduct} enum is file-scoped (not exported) because it is only
 *     relevant to this DTO.
 */
import { IsString, IsEmail, MinLength, IsNumber, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

/**
 * @enum TypeProduct
 * @description Enumerates the allowed product type classifications that an admin
 *   can assign to a product.
 *
 * **Intent:** Restrict the `typeProduct` field to a known, finite set of values.
 *
 * **Values:**
 *   - `VENDORLOCAL` -- product sourced from a local vendor.
 *   - `BRAND`       -- product directly associated with a brand.
 *
 * **Notes:** This enum is intentionally NOT exported; it is consumed only by
 *   {@link UpdateProductTypeDTO}.
 */
enum TypeProduct {
    VENDORLOCAL = 'VENDORLOCAL',
    BRAND = 'BRAND'
}

/**
 * @class UpdateProductTypeDTO
 * @description Validates the admin request body for the PATCH /admin/updateProductType
 *   endpoint.
 *
 * **Intent:** Ensure that the incoming payload contains a valid product ID and an
 *   optional product type value before it reaches the service layer.
 *
 * **Idea:** Leverages class-validator decorators so the NestJS ValidationPipe can
 *   automatically reject malformed requests with descriptive error messages.
 *
 * **Usage:**
 *   ```
 *   PATCH /admin/updateProductType
 *   Body: { "productId": 42, "typeProduct": "BRAND" }
 *   ```
 *
 * **Data Flow:**
 *   HTTP Body --> ValidationPipe --> UpdateProductTypeDTO --> AdminService.updateProductType()
 *
 * **Dependencies:** class-validator (`IsNotEmpty`, `IsNumber`, `IsOptional`, `IsEnum`).
 *
 * **Notes:**
 *   - `typeProduct` is optional; when omitted the service will retain the current value.
 */
export class UpdateProductTypeDTO {
    /** @property {number} productId - The unique identifier of the product to update. Required, must be a number. */
    @IsNotEmpty()
    @IsNumber()
    productId: number;

    /** @property {TypeProduct} [typeProduct] - The new product type classification. Optional; must be one of the {@link TypeProduct} enum values when provided. */
    @IsOptional()
    @IsEnum(TypeProduct)
    typeProduct?: TypeProduct;
}