import { IsNumber, IsString, IsOptional, IsEnum, Min } from 'class-validator';

export class WalletWithdrawDto {
  @IsNumber()
  @Min(0.01, { message: 'Amount must be greater than 0' })
  amount: number;

  @IsOptional()
  @IsString()
  bankAccountId?: string;

  @IsEnum(['BANK_TRANSFER', 'PAYPAL'])
  withdrawalMethod: string;
}
