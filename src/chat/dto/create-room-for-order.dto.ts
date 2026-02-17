/**
 * @file create-room-for-order.dto.ts
 * @description Data Transfer Object for creating a new private chat room linked to an
 * order-product in the Ultrasooq marketplace. This DTO supports post-purchase
 * communication between buyers and sellers about a specific ordered item.
 *
 * @module CreateRoomOrderDto
 *
 * @dependencies
 * - class-validator -- Declarative validation decorators.
 * - class-transformer -- `@Type` decorator for nested DTO transformation.
 * - {@link SaveAttachmentDto} -- Nested DTO for optional file attachments.
 *
 * @usage Used by {@link ChatGateway#handleCreatePrivateRoomForOrder}.
 *
 * @dataflow
 * Client payload --> class-transformer --> class-validator
 * --> ChatService.createRoomForOrder / sendMessageForOrder.
 *
 * @notes Mirrors {@link CreateRoomDto} but references `orderProductId` instead of `rfqId`,
 * and omits the RFQ price-negotiation fields (requestedPrice, rfqQuoteProductId, etc.).
 */
import { IsNotEmpty, IsInt, IsArray, ArrayNotEmpty, IsString, IsOptional, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SaveAttachmentDto } from './save-attachment.dto';

/**
 * @class CreateRoomOrderDto
 * @description Defines the shape and validation rules for creating an order-product
 * chat room with an initial message and optional attachments.
 *
 * @idea Keeps order-based chat creation separate from RFQ-based creation to maintain
 * clear domain boundaries while sharing the same structural pattern.
 */
export class CreateRoomOrderDto {
    /** @description Array of user IDs to add as room participants (must include the creator). */
    @IsArray()
    @ArrayNotEmpty()
    readonly participants: number[];

    /** @description User ID of the room creator. */
    @IsNotEmpty()
    @IsInt()
    readonly creatorId: number;

    /** @description Client-generated unique identifier for idempotent message deduplication. */
    @IsOptional()
    @IsNumber()
    readonly uniqueId?: number;

    /** @description The order-product ID this chat room is associated with. */
    @IsNotEmpty()
    @IsInt()
    readonly orderProductId: number;

    /** @description Text content of the initial message sent when the room is created. */
    @IsNotEmpty()
    @IsString()
    readonly content: string;

    /**
     * @description Optional array of file attachment metadata to be saved as draft records
     * alongside the initial message. Actual binary upload happens separately.
     */
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SaveAttachmentDto)
    readonly attachments: SaveAttachmentDto[];
}