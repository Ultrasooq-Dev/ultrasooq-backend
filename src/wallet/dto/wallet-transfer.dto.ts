import { IsNumber, IsString, IsOptional, Min } from 'class-validator';

export class WalletTransferDto {
  @IsString()
  toUserId: string;

  // Multi-account hierarchy was dropped — kept for backward compat, ignored.
  @IsOptional()
  @IsString()
  toUserAccountId?: string;

  @IsNumber()
  @Min(0.01, { message: 'Amount must be greater than 0' })
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;
}
