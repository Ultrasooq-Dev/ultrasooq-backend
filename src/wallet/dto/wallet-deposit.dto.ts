import { IsNumber, IsString, IsOptional, IsEnum, Min } from 'class-validator';

export class WalletDepositDto {
  @IsNumber()
  @Min(0.01, { message: 'Amount must be greater than 0' })
  amount: number;

  @IsEnum(['CARD', 'BANK_TRANSFER', 'PAYPAL', 'STRIPE'])
  paymentMethod: string;

  @IsOptional()
  @IsString()
  paymentIntentId?: string;
}
