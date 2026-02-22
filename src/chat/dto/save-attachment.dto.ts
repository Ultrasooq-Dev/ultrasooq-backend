/**
 * @file save-attachment.dto.ts
 * @description Data Transfer Objects for chat file attachments in the Ultrasooq marketplace.
 * Contains both the single-attachment DTO ({@link SaveAttachmentDto}) and the
 * batch wrapper ({@link SaveAttachmentsDto}).
 *
 * @module SaveAttachmentDto / SaveAttachmentsDto
 *
 * @dependencies
 * - {@link AttachmentStatus} (Prisma enum) -- Tracks attachment lifecycle (e.g., PENDING, UPLOADED).
 * - class-validator -- Declarative validation decorators.
 * - class-transformer -- `@Type` decorator for nested DTO transformation.
 *
 * @usage
 * - `SaveAttachmentDto` is embedded in {@link CreateRoomDto}, {@link CreateRoomOrderDto},
 *   {@link SendMessageDto}, and {@link SendMessageForOrderDto} as a nested validated type.
 * - `SaveAttachmentsDto` is used by {@link ChatService#saveAttachmentMessage} to persist
 *   one or more attachment draft records.
 *
 * @dataflow
 * Client payload (nested in message DTO) --> class-transformer --> class-validator
 * --> ChatService.saveAttachmentMessage --> Prisma `chatAttachments.createMany`.
 */
import { AttachmentStatus } from '../../generated/prisma/client';
import { IsNotEmpty, IsString, IsInt, IsOptional, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * @class SaveAttachmentDto
 * @description Represents the metadata for a single file attachment associated with a
 * chat message. Created as a draft record before the actual binary is uploaded to S3.
 *
 * @idea Decouple file metadata persistence from the binary upload so that the message
 * and its attachment references can be saved immediately, with the file following
 * asynchronously.
 */
export class SaveAttachmentDto {
  /** @description Original file name as provided by the client. */
  @IsNotEmpty()
  @IsString()
  readonly fileName: string;

  /** @description S3 object key / path where the file will be stored. Optional at creation (set after upload). */
  @IsOptional()
  @IsString()
  readonly filePath: string;

  /** @description File size in bytes. */
  @IsNotEmpty()
  @IsInt()
  readonly fileSize: number;

  /** @description MIME type of the file (e.g., "image/png", "application/pdf"). */
  @IsNotEmpty()
  @IsString()
  readonly fileType: string;

  /** @description File extension without the dot (e.g., "png", "pdf"). */
  @IsNotEmpty()
  @IsString()
  readonly fileExtension: string;

  /** @description ID of the parent message this attachment belongs to. Set after message creation. */
  @IsNotEmpty()
  @IsNumber()
  readonly messageId?: number;

  /** @description Client-generated unique identifier for deduplication and status tracking. */
  @IsNotEmpty()
  @IsString()
  readonly uniqueId?: string;

  /** @description Current lifecycle status of the attachment (e.g., PENDING, UPLOADED). */
  @IsNotEmpty()
  @IsString()
  readonly status: AttachmentStatus;
}

/**
 * @class SaveAttachmentsDto
 * @description Wrapper DTO containing an array of {@link SaveAttachmentDto} instances.
 * Used for bulk-inserting multiple attachment records in a single service call.
 *
 * @idea Batch attachment creation into one DTO to reduce the number of service calls
 * when a message includes multiple files.
 */
export class SaveAttachmentsDto {
  /** @description Array of individual attachment metadata objects. */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveAttachmentDto)
  readonly attachments: SaveAttachmentDto[];
}
