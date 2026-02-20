import { IsNotEmpty, IsInt, IsArray, IsNumber } from 'class-validator';

export class SelectSuggestedProductsDto {
  @IsNotEmpty()
  @IsArray()
  @IsNumber({}, { each: true })
  selectedSuggestionIds: number[]; // RfqSuggestedProduct IDs

  @IsNotEmpty()
  @IsInt()
  rfqQuoteProductId: number;

  @IsNotEmpty()
  @IsInt()
  rfqQuotesUserId: number;
}
