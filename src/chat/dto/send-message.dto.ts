/**
 * @file send-message.dto.ts
 * @description Data Transfer Object for sending a chat message within an RFQ-linked
 * room in the Ultrasooq marketplace. Supports optional RFQ price-negotiation fields
 * and file attachments.
 *
 * @module SendMessageDto
 *
 * @dependencies
 * - class-validator -- Declarative validation decorators.
 * - class-transformer -- `@Type` decorator for nested DTO transformation.
 * - {@link SaveAttachmentDto} -- Nested DTO for optional file attachments.
 *
 * @usage Used by {@link ChatController#sendMessage} (REST) and
 * {@link ChatGateway#handleMessage} / {@link ChatGateway#handleCreateRoom} (WebSocket).
 *
 * @dataflow
 * Client payload --> class-transformer --> class-validator
 * --> ChatService.sendMessage --> Prisma `message.create`.
 */
import { IsNotEmpty, IsString, IsInt, IsOptional, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SaveAttachmentDto } from './save-attachment.dto';

export class SuggestedProductItemDto {
  @IsNotEmpty()
  @IsNumber()
  suggestedProductId: number;

  @IsOptional()
  @IsNumber()
  offerPrice?: number;

  @IsOptional()
  @IsNumber()
  quantity?: number;
}

/**
 * @class SendMessageDto
 * @description Defines the shape and validation rules for an RFQ chat message payload.
 * Includes the core message fields (content, userId, roomId, rfqId) and optional
 * price-negotiation and attachment fields.
 *
 * @idea A single DTO covers both plain text messages and price-request messages,
 * determined by the presence or absence of the optional negotiation fields.
 */
export class SendMessageDto {
  /** @description Text content of the chat message. */
  @IsOptional()
  @IsString()
  readonly content?: string;

  /** @description ID of the user sending the message. */
  @IsNotEmpty()
  @IsInt()
  readonly userId: number;

  /** @description ID of the chat room the message belongs to. */
  @IsNotEmpty()
  @IsInt()
  readonly roomId: number;

  /** @description RFQ ID associated with this message / room. */
  @IsNotEmpty()
  @IsInt()
  readonly rfqId: number;

  /** @description Optional negotiated price proposed by the sender. */
  @IsOptional()
  @IsNumber()
  readonly requestedPrice?: number;

  /** @description Optional RFQ quote product ID being negotiated. */
  @IsOptional()
  @IsNumber()
  readonly rfqQuoteProductId?: number;

  /** @description Optional RFQ quotes user ID (seller's quote submission). */
  @IsOptional()
  @IsNumber()
  readonly rfqQuotesUserId?: number;

  /** @description Optional buyer user ID in the negotiation. */
  @IsOptional()
  @IsNumber()
  readonly buyerId?: number;

  /** @description Optional seller user ID in the negotiation. */
  @IsOptional()
  @IsNumber()
  readonly sellerId?: number;

  /** @description Client-generated unique identifier for idempotent / optimistic UI updates. */
  @IsOptional()
  @IsNumber()
  readonly uniqueId?: number;

  // NEW: For product suggestions (only for SIMILAR product type)
  @IsOptional()
  @IsNumber()
  readonly suggestForRfqQuoteProductId?: number; // The original RFQ product to suggest alternatives for

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SuggestedProductItemDto)
  readonly suggestedProducts?: SuggestedProductItemDto[]; // Array of suggested products

  /**
   * @description Optional array of file attachment metadata to be saved as draft records
   * alongside this message. The actual binary upload happens separately via REST.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveAttachmentDto)
  readonly attachments: SaveAttachmentDto[];
}