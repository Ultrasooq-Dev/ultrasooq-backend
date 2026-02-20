import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

export class WalletSettingsDto {
  @IsOptional()
  @IsBoolean()
  autoWithdraw?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Withdraw limit must be greater than or equal to 0' })
  withdrawLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Daily limit must be greater than or equal to 0' })
  dailyLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Monthly limit must be greater than or equal to 0' })
  monthlyLimit?: number;

  @IsOptional()
  notificationPreferences?: any;
}
