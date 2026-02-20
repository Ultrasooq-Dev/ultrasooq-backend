import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController, AdminWalletController } from './wallet.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [WalletController, AdminWalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
