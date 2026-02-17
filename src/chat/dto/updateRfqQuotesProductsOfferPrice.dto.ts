/**
 * @file updateRfqQuotesProductsOfferPrice.dto.ts
 * @description Data Transfer Object for updating the offer price of an RFQ quote product
 * and recalculating the parent RFQ user's total offer price in the Ultrasooq marketplace.
 *
 * @module UpdateRfqQuotesProductsOfferPrice
 *
 * @dependencies
 * - class-validator -- Declarative validation decorators.
 *
 * @usage Used internally by {@link ChatService#updateRfqQuotesProductsOfferPrice}. The DTO
 * is constructed in {@link ChatGateway#handleUpdateRfqRequestPrice} from fields extracted
 * from the {@link UpdateRfqPriceRequest} payload when the status is "A" (Approved).
 *
 * @dataflow
 * Gateway handler (approval path) --> construct DTO --> ChatService.updateRfqQuotesProductsOfferPrice
 * --> Prisma `rfqQuotesProducts.findUnique` + `rfqQuotesUsers.update`.
 */
import { IsNotEmpty, IsInt, IsNumber } from 'class-validator';

/**
 * @class UpdateRfqQuotesProductsOfferPrice
 * @description Defines the shape and validation rules for an RFQ product offer-price
 * update. Contains the quote-product ID, the RFQ user ID (for aggregate total recalc),
 * and the newly approved offer price.
 *
 * @idea Isolate the offer-price update payload into its own DTO so the service method
 * has a clear, typed contract distinct from the broader price-request DTO.
 */
export class UpdateRfqQuotesProductsOfferPrice {
    /** @description Primary key of the rfqQuotesProducts record to look up. */
    @IsNotEmpty()
    @IsInt()
    readonly id: number;

    /** @description ID of the rfqQuotesUsers record whose aggregate offerPrice will be recalculated. */
    @IsNotEmpty()
    @IsInt()
    readonly rfqUserId: number;

    /** @description The newly approved per-unit offer price for the product. */
    @IsNotEmpty()
    @IsNumber()
    readonly offerPrice: number;
}