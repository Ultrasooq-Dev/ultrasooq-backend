/**
 * @fileoverview Data Transfer Objects (DTOs) for the Service module.
 *
 * Intent:
 *   Define validation-decorated classes that enforce the shape and
 *   constraints of incoming HTTP request bodies for service creation
 *   and update operations.
 *
 * Idea:
 *   Each DTO uses `class-validator` decorators for runtime validation
 *   (triggered by NestJS's global ValidationPipe) and `class-transformer`
 *   for nested-object hydration. Prisma enum types are imported to
 *   constrain string-enum fields at the DTO level.
 *
 * Usage:
 *   - {@link CreateServiceDto} is used by `POST /service/create`.
 *   - {@link UpdateServiceDto} is used by `PATCH /service/:serviceid`.
 *   Both are referenced in {@link ServiceController} `@Body()` parameters.
 *
 * Data Flow:
 *   Raw JSON body -> class-transformer (hydration) -> class-validator
 *   (validation) -> Controller -> ServiceService
 *
 * Dependencies:
 *   - `class-validator` for declarative validation decorators.
 *   - `class-transformer` for `@Type()` nested-object deserialization.
 *   - `@prisma/client` enums: FileType, ServiceConfirmType, ServiceCostType,
 *     ServiceFor, ServiceType, ShippingType.
 *
 * Notes:
 *   - Update DTOs include an optional `id` field on nested items (tags,
 *     features, images) to distinguish existing records from new ones.
 *     Items WITH an `id` are kept; items WITHOUT an `id` are created; items
 *     whose IDs are absent from the payload are deleted by the service layer.
 *   - The `serviceName` field is required for creation but is NOT present
 *     in the update DTO (services cannot be renamed after creation).
 *   - `serviceType` is required on creation but absent from the update DTO
 *     (service type is immutable).
 */
import {
  FileType,
  ServiceConfirmType,
  ServiceCostType,
  ServiceFor,
  ServiceType,
  ShippingType,
} from '../../generated/prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

/**
 * DTO for creating a new service listing.
 *
 * Intent:
 *   Validate and type the full payload required to create a service,
 *   including all mandatory and optional scalar fields plus nested
 *   arrays for tags, features, and images.
 *
 * Idea:
 *   Every field is decorated with `class-validator` constraints. Nested
 *   arrays use `@ValidateNested` + `@Type()` to recursively validate
 *   each child DTO.
 *
 * Usage:
 *   `@Body() dto: CreateServiceDto` in `ServiceController.createService()`.
 *
 * Data Flow:
 *   JSON body -> CreateServiceDto (validated) -> ServiceService.createService
 *
 * Dependencies:
 *   - {@link ServiceTagDto}, {@link ServiceFeatureDto}, {@link ServiceImageDto}
 *     for nested validation.
 *   - Prisma enums for type-safe enum constraints.
 *
 * Notes:
 *   - `tags` and `features` are required (non-empty arrays).
 *   - `images` is optional.
 *   - `serviceType` must be 'BOOKING' or 'MOVING'.
 */
export class CreateServiceDto {
  /** @property {string} serviceName - Display name for the service listing. Required. */
  @IsNotEmpty()
  @IsString()
  serviceName: string;

  /** @property {string} [description] - Free-text description of the service. */
  @IsOptional()
  @IsString()
  description?: string;

  /** @property {number} categoryId - FK to the Category table. Must be a positive integer. */
  @IsNotEmpty()
  @IsInt()
  @IsPositive()
  categoryId: number;

  /** @property {string} [categoryLocation] - Human-readable location label for the service category. */
  @IsOptional()
  @IsString()
  categoryLocation?: string;

  /** @property {string} workingDays - Comma-separated or encoded string of working days. Required. */
  @IsNotEmpty()
  @IsString()
  workingDays: string;

  /** @property {string} [offDays] - Comma-separated or encoded string of off days. */
  @IsOptional()
  @IsString()
  offDays?: string;

  /** @property {boolean} [renewEveryWeek] - Whether the service schedule renews weekly. */
  @IsOptional()
  @IsBoolean()
  renewEveryWeek?: boolean;

  /** @property {boolean} [oneTime] - Whether the service is a one-time offering. */
  @IsOptional()
  @IsBoolean()
  oneTime?: boolean;

  /** @property {string} [openTime] - Daily opening time (e.g. "09:00"). */
  @IsOptional()
  @IsString()
  openTime?: string;

  /** @property {string} [closeTime] - Daily closing time (e.g. "17:00"). */
  @IsOptional()
  @IsString()
  closeTime?: string;

  /** @property {string} [breakTimeFrom] - Start of daily break period. */
  @IsOptional()
  @IsString()
  breakTimeFrom?: string;

  /** @property {string} [breakTimeTo] - End of daily break period. */
  @IsOptional()
  @IsString()
  breakTimeTo?: string;

  /** @property {ShippingType} [shippingType] - 'DIRECTION' for A-to-B or 'RANG' for within-range moves. */
  @IsOptional()
  @IsIn(['DIRECTION', 'RANG'])
  shippingType?: ShippingType;

  /** @property {number} [fromCityId] - FK to city for the origin of a DIRECTION shipping service. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  fromCityId?: number;

  /** @property {number} [toCityId] - FK to city for the destination of a DIRECTION shipping service. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  toCityId?: number;

  /** @property {number} [rangeCityId] - FK to city for a RANG (within-range) shipping service. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  rangeCityId?: number;

  /** @property {number} [stateId] - FK to state for geographic scoping. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  stateId?: number;

  /** @property {number} [countryId] - FK to country for geographic scoping. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  countryId?: number;

  /** @property {number} [eachCustomerTime] - Allocated time per customer in minutes. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  eachCustomerTime?: number;

  /** @property {number} [customerPerPeiod] - Maximum number of customers per scheduling period. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  customerPerPeiod?: number;

  /** @property {ServiceType} serviceType - 'BOOKING' for bookable services, 'MOVING' for shipping/moving. Required. */
  @IsNotEmpty()
  @IsIn(['BOOKING', 'MOVING'])
  serviceType: ServiceType;

  /** @property {ServiceConfirmType} [serviceConfirmType] - 'AUTO' for instant confirmation, 'MANUAL' for seller review. */
  @IsOptional()
  @IsIn(['AUTO', 'MANUAL'])
  serviceConfirmType?: ServiceConfirmType;

  /** @property {ServiceFor} [serviceFor] - 'OWNER' restricts to the owner's products, 'EVERYONE' is open. */
  @IsOptional()
  @IsIn(['OWNER', 'EVERYONE'])
  serviceFor?: ServiceFor;

  /** @property {ServiceTagDto[]} tags - Non-empty array of tag references to associate with the service. Required. */
  @IsNotEmpty()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ServiceTagDto)
  tags: ServiceTagDto[];

  /** @property {ServiceFeatureDto[]} features - Non-empty array of priced service features. Required. */
  @IsNotEmpty()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ServiceFeatureDto)
  features: ServiceFeatureDto[];

  /** @property {ServiceImageDto[]} [images] - Optional array of image/video attachments. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceImageDto)
  images?: ServiceImageDto[];
}

/**
 * Nested DTO for a service feature (priced capability) during creation.
 *
 * Intent:
 *   Validate each feature's name, cost type, and cost amount.
 *
 * Idea:
 *   A feature is a named offering with either a FLAT or HOURLY pricing model.
 *
 * Usage:
 *   Nested inside {@link CreateServiceDto.features}.
 *
 * Data Flow:
 *   JSON array element -> ServiceFeatureDto -> Prisma ServiceFeature createMany
 *
 * Dependencies:
 *   - Prisma enum `ServiceCostType` for cost-type validation.
 *
 * Notes:
 *   - All fields are required for creation.
 */
class ServiceFeatureDto {
  /** @property {string} name - Display name for this feature. */
  @IsNotEmpty()
  @IsString()
  name: string;

  /** @property {ServiceCostType} serviceCostType - 'FLAT' for fixed price, 'HOURLY' for per-hour rate. */
  @IsNotEmpty()
  @IsIn(['FLAT', 'HOURLY'])
  serviceCostType: ServiceCostType;

  /** @property {number} serviceCost - Monetary cost value (must be positive). */
  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  serviceCost: number;
}

/**
 * Nested DTO for a service tag reference during creation.
 *
 * Intent:
 *   Validate the tag reference ID used to associate a tag with a service.
 *
 * Idea:
 *   Tags are pre-existing records; the DTO only carries the FK reference.
 *
 * Usage:
 *   Nested inside {@link CreateServiceDto.tags}.
 *
 * Data Flow:
 *   JSON array element -> ServiceTagDto -> Prisma ServiceTag createMany
 *
 * Dependencies:
 *   - Assumes `tagId` references a valid Tag record.
 *
 * Notes:
 *   - Only the FK (`tagId`) is needed; the tag name lives in the Tag table.
 */
class ServiceTagDto {
  /** @property {number} tagId - FK to the Tag table. Must be a positive integer. */
  @IsNotEmpty()
  @IsInt()
  @IsPositive()
  tagId: number;
}

/**
 * Nested DTO for a service image/video attachment during creation.
 *
 * Intent:
 *   Validate the URL, file type, and file name of each media attachment.
 *
 * Idea:
 *   Media files are uploaded separately; this DTO captures their metadata
 *   (URL pointing to a storage bucket, file type, and original file name).
 *
 * Usage:
 *   Nested inside {@link CreateServiceDto.images}.
 *
 * Data Flow:
 *   JSON array element -> ServiceImageDto -> Prisma ServiceImage createMany
 *
 * Dependencies:
 *   - Prisma enum `FileType` for image/video discrimination.
 *
 * Notes:
 *   - The `url` field is expected to point to an already-uploaded asset.
 */
class ServiceImageDto {
  /** @property {string} url - Full URL to the uploaded media file. */
  @IsNotEmpty()
  @IsString()
  url: string;

  /** @property {FileType} fileType - 'IMAGE' or 'VIDEO'. */
  @IsNotEmpty()
  @IsIn(['IMAGE', 'VIDEO'])
  fileType: FileType;

  /** @property {string} fileName - Original file name of the uploaded media. */
  @IsNotEmpty()
  @IsString()
  fileName: string;
}

/**
 * DTO for updating an existing service listing.
 *
 * Intent:
 *   Validate the partial-update payload for modifying a service's scalar
 *   fields and reconciling its nested tags, features, and images.
 *
 * Idea:
 *   All fields are optional (partial update semantics). Nested arrays use
 *   "Update" variants of the sub-DTOs that include an optional `id` field,
 *   enabling the service layer to distinguish between existing records
 *   (keep) and new records (create), and to delete records whose IDs are
 *   absent from the payload.
 *
 * Usage:
 *   `@Body() dto: UpdateServiceDto` in `ServiceController.updateService()`.
 *
 * Data Flow:
 *   JSON body -> UpdateServiceDto (validated) -> ServiceService.updateService
 *   -> Prisma $transaction (update + delete-stale + create-new)
 *
 * Dependencies:
 *   - {@link UpdateServiceTagDto}, {@link UpdateServiceFeatureDto},
 *     {@link UpdateServiceImageDto} for nested validation.
 *   - Prisma enums for type-safe enum constraints.
 *
 * Notes:
 *   - `serviceName` and `serviceType` are NOT included; they are immutable
 *     after creation.
 *   - Nested items with an `id` are kept in the DB; items without an `id`
 *     are created; items whose IDs were previously stored but are not
 *     present in the payload are deleted.
 */
export class UpdateServiceDto {
  /** @property {string} [description] - Updated free-text description. */
  @IsOptional()
  @IsString()
  description?: string;

  /** @property {string} [workingDays] - Updated working days string. */
  @IsOptional()
  @IsString()
  workingDays?: string;

  /** @property {number} [categoryId] - Updated FK to the Category table. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  categoryId: number;

  /** @property {string} [categoryLocation] - Updated location label. */
  @IsOptional()
  @IsString()
  categoryLocation?: string;

  /** @property {string} [offDays] - Updated off days string. */
  @IsOptional()
  @IsString()
  offDays?: string;

  /** @property {boolean} [renewEveryWeek] - Updated weekly renewal flag. */
  @IsOptional()
  @IsBoolean()
  renewEveryWeek?: boolean;

  /** @property {boolean} [oneTime] - Updated one-time offering flag. */
  @IsOptional()
  @IsBoolean()
  oneTime?: boolean;

  /** @property {string} [openTime] - Updated daily opening time. */
  @IsOptional()
  @IsString()
  openTime?: string;

  /** @property {string} [closeTime] - Updated daily closing time. */
  @IsOptional()
  @IsString()
  closeTime?: string;

  /** @property {string} [breakTimeFrom] - Updated break start time. */
  @IsOptional()
  @IsString()
  breakTimeFrom?: string;

  /** @property {string} [breakTimeTo] - Updated break end time. */
  @IsOptional()
  @IsString()
  breakTimeTo?: string;

  /** @property {ShippingType} [shippingType] - Updated shipping type ('DIRECTION' or 'RANG'). */
  @IsOptional()
  @IsIn(['DIRECTION', 'RANG'])
  shippingType?: ShippingType;

  /** @property {number} [fromCityId] - Updated origin city FK. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  fromCityId?: number;

  /** @property {number} [toCityId] - Updated destination city FK. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  toCityId?: number;

  /** @property {number} [rangeCityId] - Updated within-range city FK. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  rangeCityId?: number;

  /** @property {number} [stateId] - Updated state FK. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  stateId?: number;

  /** @property {number} [countryId] - Updated country FK. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  countryId?: number;

  /** @property {number} [eachCustomerTime] - Updated time-per-customer in minutes. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  eachCustomerTime?: number;

  /** @property {number} [customerPerPeiod] - Updated max customers per period. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  customerPerPeiod?: number;

  /** @property {ServiceConfirmType} [serviceConfirmType] - Updated confirmation type ('AUTO' or 'MANUAL'). */
  @IsOptional()
  @IsIn(['AUTO', 'MANUAL'])
  serviceConfirmType?: ServiceConfirmType;

  /** @property {ServiceFor} [serviceFor] - Updated audience scope ('OWNER' or 'EVERYONE'). */
  @IsOptional()
  @IsIn(['OWNER', 'EVERYONE'])
  serviceFor?: ServiceFor;

  /** @property {UpdateServiceTagDto[]} [tags] - Reconciliation payload for service tags. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => UpdateServiceTagDto)
  tags: UpdateServiceTagDto[];

  /** @property {UpdateServiceFeatureDto[]} [features] - Reconciliation payload for service features. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => UpdateServiceFeatureDto)
  features: UpdateServiceFeatureDto[];

  /** @property {UpdateServiceImageDto[]} [images] - Reconciliation payload for service images. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateServiceImageDto)
  images?: UpdateServiceImageDto[];
}

/**
 * Nested DTO for a service tag reference during updates.
 *
 * Intent:
 *   Validate tag references with an optional `id` so the service layer
 *   can distinguish existing tags from new ones.
 *
 * Idea:
 *   If `id` is present, the tag already exists in the DB and should be
 *   kept. If `id` is absent, a new ServiceTag row will be created.
 *
 * Usage:
 *   Nested inside {@link UpdateServiceDto.tags}.
 *
 * Data Flow:
 *   JSON array element -> UpdateServiceTagDto -> reconciliation logic in ServiceService.updateService
 *
 * Dependencies:
 *   - Assumes `tagId` references a valid Tag record.
 *
 * Notes:
 *   - Tags whose existing IDs are absent from the payload array are deleted
 *     by the service layer.
 */
class UpdateServiceTagDto {
  /** @property {number} [id] - Existing ServiceTag PK. Present = keep; absent = new tag. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  id?: number;

  /** @property {number} tagId - FK to the Tag table. */
  @IsNotEmpty()
  @IsInt()
  @IsPositive()
  tagId: number;
}

/**
 * Nested DTO for a service feature during updates.
 *
 * Intent:
 *   Validate feature data with an optional `id` for reconciliation.
 *
 * Idea:
 *   If `id` is present, the feature exists and is kept (but NOT updated
 *   in place). If absent, a new ServiceFeature row is created.
 *
 * Usage:
 *   Nested inside {@link UpdateServiceDto.features}.
 *
 * Data Flow:
 *   JSON array element -> UpdateServiceFeatureDto -> reconciliation logic in ServiceService.updateService
 *
 * Dependencies:
 *   - Prisma enum `ServiceCostType` for cost-type validation.
 *
 * Notes:
 *   - Existing features whose IDs are absent from the payload are deleted.
 *   - Existing features whose IDs ARE present are kept but their fields are
 *     NOT updated (only new features get their field values persisted).
 */
class UpdateServiceFeatureDto {
  /** @property {number} [id] - Existing ServiceFeature PK. Present = keep; absent = new feature. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  id?: number;

  /** @property {string} name - Display name for this feature. */
  @IsNotEmpty()
  @IsString()
  name: string;

  /** @property {ServiceCostType} serviceCostType - 'FLAT' or 'HOURLY'. */
  @IsNotEmpty()
  @IsIn(['FLAT', 'HOURLY'])
  serviceCostType: ServiceCostType;

  /** @property {number} serviceCost - Monetary cost value (must be positive). */
  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  serviceCost: number;
}

/**
 * Nested DTO for a service image/video attachment during updates.
 *
 * Intent:
 *   Validate image metadata with an optional `id` for reconciliation.
 *
 * Idea:
 *   If `id` is present, the image exists and is kept. If absent, a new
 *   ServiceImage row is created. Images whose existing IDs are absent
 *   from the payload are deleted.
 *
 * Usage:
 *   Nested inside {@link UpdateServiceDto.images}.
 *
 * Data Flow:
 *   JSON array element -> UpdateServiceImageDto -> reconciliation logic in ServiceService.updateService
 *
 * Dependencies:
 *   - Prisma enum `FileType` for image/video discrimination.
 *
 * Notes:
 *   - The `url` field is expected to point to an already-uploaded asset.
 */
class UpdateServiceImageDto {
  /** @property {number} [id] - Existing ServiceImage PK. Present = keep; absent = new image. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  id?: number;

  /** @property {string} url - Full URL to the uploaded media file. */
  @IsNotEmpty()
  @IsString()
  url: string;

  /** @property {FileType} fileType - 'IMAGE' or 'VIDEO'. */
  @IsNotEmpty()
  @IsIn(['IMAGE', 'VIDEO'])
  fileType: FileType;

  /** @property {string} fileName - Original file name of the uploaded media. */
  @IsNotEmpty()
  @IsString()
  fileName: string;
}
