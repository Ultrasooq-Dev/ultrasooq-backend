/**
 * @file create-room.dto.ts
 * @description Data Transfer Object for creating a new private chat room linked to an
 * RFQ (Request for Quotation) in the Ultrasooq marketplace. Validated via class-validator
 * decorators when received through REST or WebSocket endpoints.
 *
 * @module CreateRoomDto
 *
 * @dependencies
 * - class-validator -- Declarative validation decorators.
 * - class-transformer -- `@Type` decorator for nested DTO transformation.
 * - {@link SaveAttachmentDto} -- Nested DTO for optional file attachments.
 *
 * @usage Used by {@link ChatController#createRoom} and {@link ChatGateway#handleCreateRoom}.
 *
 * @dataflow
 * Client payload --> class-transformer (type coercion) --> class-validator (validation)
 * --> ChatService.createRoom / sendMessage.
 */
import { IsNotEmpty, IsInt, IsArray, ArrayNotEmpty, IsString, IsOptional, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SaveAttachmentDto } from './save-attachment.dto';
import { SuggestedProductItemDto } from './send-message.dto';

/**
 * @class CreateRoomDto
 * @description Defines the shape and validation rules for a create-room request.
 * Includes fields for the initial message content, RFQ reference, optional
 * price-negotiation parameters, and optional file attachments.
 *
 * @idea Combines room creation parameters with the first message payload so both
 * can be processed in a single WebSocket round-trip.
 */
export class CreateRoomDto {
    /** @description Array of user IDs to add as room participants (must include the creator). */
    @IsArray()
    @ArrayNotEmpty()
    readonly participants: number[];

    /** @description User ID of the room creator. */
    @IsNotEmpty()
    @IsInt()
    readonly creatorId: number;

    /** @description Text content of the initial message sent when the room is created. */
    @IsOptional()
    @IsString()
    readonly content?: string;

    /** @description The RFQ ID this chat room is associated with. */
    @IsNotEmpty()
    @IsInt()
    readonly rfqId: number;

    /** @description Optional negotiated price requested by the buyer or seller. */
    @IsOptional()
    @IsNumber()
    readonly requestedPrice?: number;

    /** @description Optional ID of the specific RFQ quote product being negotiated. */
    @IsOptional()
    @IsNumber()
    readonly rfqQuoteProductId?: number;

    /** @description Optional buyer user ID involved in the negotiation. */
    @IsOptional()
    @IsNumber()
    readonly buyerId?: number;

    /** @description Optional seller user ID involved in the negotiation. */
    @IsOptional()
    @IsNumber()
    readonly sellerId?: number;

    /** @description Optional ID of the RFQ quotes user (seller's quote submission). */
    @IsOptional()
    @IsNumber()
    readonly rfqQuotesUserId?: number;

    /** @description Client-generated unique identifier for idempotent message deduplication. */
    @IsOptional()
    @IsNumber()
    readonly uniqueId?: number;

    // NEW: For product suggestions
    @IsOptional()
    @IsNumber()
    readonly suggestForRfqQuoteProductId?: number;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SuggestedProductItemDto)
    readonly suggestedProducts?: SuggestedProductItemDto[];

    /**
     * @description Optional array of file attachment metadata to be saved as draft records
     * alongside the initial message. The actual binary upload happens separately.
     */
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SaveAttachmentDto)
    readonly attachments: SaveAttachmentDto[];
}