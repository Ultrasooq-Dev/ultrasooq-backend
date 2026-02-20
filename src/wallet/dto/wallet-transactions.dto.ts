import { IsNumber, IsString, IsOptional, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';

export class WalletTransactionsDto {
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  page: number;

  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  limit: number;

  @IsOptional()
  @IsString()
  transactionType?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
