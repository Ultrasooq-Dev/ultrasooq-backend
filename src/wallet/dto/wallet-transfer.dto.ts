import { IsNumber, IsString, IsOptional, Min } from 'class-validator';

export class WalletTransferDto {
  @IsNumber()
  toUserId: number;

  @IsOptional()
  @IsNumber()
  toUserAccountId?: number;

  @IsNumber()
  @Min(0.01, { message: 'Amount must be greater than 0' })
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;
}
