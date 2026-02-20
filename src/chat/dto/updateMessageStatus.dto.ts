/**
 * @file updateMessageStatus.dto.ts
 * @description Data Transfer Object for marking chat messages as read within a specific
 * room for a given user in the Ultrasooq marketplace.
 *
 * @module UpdateMessageStatus
 *
 * @dependencies
 * - class-validator -- Declarative validation decorators.
 *
 * @usage Used by {@link ChatController#markMessagesAsRead} (REST `PATCH /chat/read-messages`).
 *
 * @dataflow
 * Client payload --> class-validator --> ChatService.markMessagesAsRead
 * --> Prisma `message.updateMany` (status: UNREAD -> READ).
 */
import { IsNotEmpty, IsInt, IsNumber } from 'class-validator';

/**
 * @class UpdateMessageStatus
 * @description Defines the shape and validation rules for a bulk message-status-update
 * request. Identifies which user's messages in which room should transition from
 * UNREAD to READ.
 *
 * @idea A minimal DTO with just userId and roomId is sufficient because the service
 * applies the status filter (UNREAD) internally.
 */
export class UpdateMessageStatus {
    /** @description ID of the user whose messages should be marked as read. */
    @IsNotEmpty()
    @IsNumber()
    readonly userId?: number;

    /** @description ID of the chat room containing the messages to update. */
    @IsNotEmpty()
    @IsInt()
    readonly roomId: number;
}