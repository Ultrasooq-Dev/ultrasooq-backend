/**
 * @file updateRfqPriceRequest.dto.ts
 * @description Data Transfer Object for updating the status of an RFQ quote-product
 * price request in the Ultrasooq marketplace chat module. Supports approve, reject,
 * and pending status transitions.
 *
 * @module UpdateRfqPriceRequest
 *
 * @dependencies
 * - class-validator -- Declarative validation decorators.
 *
 * @usage Used by {@link ChatController#updateStatus} (REST) and
 * {@link ChatGateway#handleUpdateRfqRequestPrice} (WebSocket).
 *
 * @dataflow
 * Client payload --> class-validator --> ChatService.updateRfqPriceRequestStatus
 * (and optionally ChatService.updateRfqQuotesProductsOfferPrice when approved)
 * --> Prisma update(s).
 */
import { IsNotEmpty, IsString, IsInt, IsOptional, IsNumber } from 'class-validator';

/**
 * @class UpdateRfqPriceRequest
 * @description Defines the shape and validation rules for an RFQ price-request status
 * update. Includes the price-request record ID, the new status code, the acting user,
 * and contextual IDs required for recalculating totals on approval.
 *
 * @idea Carries all the information needed for both the status update AND the
 * offer-price recalculation so the gateway handler can perform both operations
 * in a single round-trip.
 */
export class UpdateRfqPriceRequest {
    /** @description Primary key of the rfqQuoteProductPriceRequest record to update. */
    @IsNotEmpty()
    @IsInt()
    readonly id: number;

    /**
     * @description New status code. Expected values:
     * - "A" = Approved
     * - "R" = Rejected
     * - "P" = Pending
     */
    @IsNotEmpty()
    @IsString()
    readonly status: string;

    /** @description ID of the user performing the approval or rejection action. */
    @IsNotEmpty()
    @IsNumber()
    readonly userId?: number;

    /** @description ID of the chat room for broadcasting the update event. */
    @IsNotEmpty()
    @IsInt()
    readonly roomId: number;

    /** @description ID of the RFQ quotes user whose total offer price may be recalculated on approval. */
    @IsNotEmpty()
    @IsInt()
    readonly rfqUserId: number;

    /** @description The price that was requested / negotiated. */
    @IsNotEmpty()
    @IsInt()
    readonly requestedPrice: number;

    /** @description ID of the RFQ quote product whose offer price is being updated. */
    @IsNotEmpty()
    @IsInt()
    readonly rfqQuoteProductId: number;
}