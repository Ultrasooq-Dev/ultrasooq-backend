/**
 * @file send-message-for-order.dto.ts
 * @description Data Transfer Object for sending a chat message within an order-product-linked
 * room in the Ultrasooq marketplace. This is the order-specific counterpart of
 * {@link SendMessageDto}.
 *
 * @module SendMessageForOrderDto
 *
 * @dependencies
 * - class-validator -- Declarative validation decorators.
 * - class-transformer -- `@Type` decorator for nested DTO transformation.
 * - {@link SaveAttachmentDto} -- Nested DTO for optional file attachments.
 *
 * @usage Used by {@link ChatGateway#handleSendMessageForOrder} and
 * {@link ChatGateway#handleCreatePrivateRoomForOrder} (WebSocket).
 *
 * @dataflow
 * Client payload --> class-transformer --> class-validator
 * --> ChatService.sendMessageForOrder --> Prisma `message.create`.
 *
 * @notes Omits all RFQ price-negotiation fields since order-product conversations
 * do not involve price requests.
 */
import { IsNotEmpty, IsString, IsInt, IsOptional, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SaveAttachmentDto } from './save-attachment.dto';

/**
 * @class SendMessageForOrderDto
 * @description Defines the shape and validation rules for an order-product chat message
 * payload. Contains only the fields relevant to post-purchase communication.
 *
 * @idea Separate DTO from {@link SendMessageDto} to enforce a clear domain boundary
 * between RFQ negotiation and order fulfilment communication.
 */
export class SendMessageForOrderDto {
  /** @description Text content of the chat message. */
  @IsNotEmpty()
  @IsString()
  readonly content: string;

  /** @description ID of the user sending the message. */
  @IsNotEmpty()
  @IsInt()
  readonly userId: number;

  /** @description ID of the chat room the message belongs to. */
  @IsNotEmpty()
  @IsInt()
  readonly roomId: number;

  /** @description The order-product ID this message is associated with. */
  @IsNotEmpty()
  @IsInt()
  readonly orderProductId: number;

  /** @description Client-generated unique identifier for idempotent / optimistic UI updates. */
  @IsOptional()
  @IsNumber()
  readonly uniqueId?: number;

  /**
   * @description Optional array of file attachment metadata to be saved as draft records
   * alongside this message. Actual binary upload happens separately via REST.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveAttachmentDto)
  readonly attachments: SaveAttachmentDto[];
}