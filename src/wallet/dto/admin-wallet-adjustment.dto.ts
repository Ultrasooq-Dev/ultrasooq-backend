import { IsNumber, IsString, MaxLength } from 'class-validator';

export class AdminWalletAdjustmentDto {
  @IsString()
  targetUserId: string;

  @IsNumber()
  amount: number;

  @IsString()
  @MaxLength(3)
  currencyCode: string;

  @IsString()
  @MaxLength(500)
  reason: string;

  @IsString()
  @MaxLength(120)
  idempotencyKey: string;
}
