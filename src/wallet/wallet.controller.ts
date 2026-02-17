import { Controller, Get, Post, Put, Body, Query, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { WalletDepositDto } from './dto/wallet-deposit.dto';
import { WalletWithdrawDto } from './dto/wallet-withdraw.dto';
import { WalletTransferDto } from './dto/wallet-transfer.dto';
import { WalletSettingsDto } from './dto/wallet-settings.dto';
import { WalletTransactionsDto } from './dto/wallet-transactions.dto';
import { AuthGuard } from '../guards/AuthGuard';

@ApiTags('wallet')
@ApiBearerAuth('JWT-auth')
@Controller('wallet')
@UseGuards(AuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  /**
   * Get wallet balance
   */
  @Get('balance')
  async getWalletBalance(@Req() req: any) {
    const userId = req.user.id;
    const userAccountId = req.user.userAccountId;
    return this.walletService.getWalletBalance(userId, userAccountId);
  }

  /**
   * Deposit funds to wallet
   */
  @Post('deposit')
  async depositToWallet(@Req() req: any, @Body() depositDto: WalletDepositDto) {
    const userId = req.user.id;
    const userAccountId = req.user.userAccountId;
    return this.walletService.depositToWallet(userId, depositDto, userAccountId);
  }

  /**
   * Withdraw funds from wallet
   */
  @Post('withdraw')
  async withdrawFromWallet(@Req() req: any, @Body() withdrawDto: WalletWithdrawDto) {
    const userId = req.user.id;
    const userAccountId = req.user.userAccountId;
    return this.walletService.withdrawFromWallet(userId, withdrawDto, userAccountId);
  }

  /**
   * Transfer funds to another user
   */
  @Post('transfer')
  async transferToUser(@Req() req: any, @Body() transferDto: WalletTransferDto) {
    const userId = req.user.id;
    const userAccountId = req.user.userAccountId;
    return this.walletService.transferToUser(userId, transferDto, userAccountId);
  }

  /**
   * Get wallet transactions
   */
  @Get('transactions')
  async getWalletTransactions(@Req() req: any, @Query() query: WalletTransactionsDto) {
    const userId = req.user.id;
    const userAccountId = req.user.userAccountId;
    return this.walletService.getWalletTransactions(userId, query, userAccountId);
  }

  /**
   * Get specific transaction
   */
  @Get('transactions/:id')
  async getWalletTransactionById(@Param('id') id: string) {
    // Implementation for getting specific transaction
    return {
      message: 'Transaction retrieved successfully',
      status: true,
      data: { id },
    };
  }

  /**
   * Get wallet settings
   */
  @Get('settings')
  async getWalletSettings(@Req() req: any) {
    const userId = req.user.id;
    return this.walletService.getWalletSettings(userId);
  }

  /**
   * Update wallet settings
   */
  @Put('settings')
  async updateWalletSettings(@Req() req: any, @Body() settingsDto: WalletSettingsDto) {
    const userId = req.user.id;
    return this.walletService.updateWalletSettings(userId, settingsDto);
  }

  /**
   * Process wallet payment (internal use)
   */
  @Post('payment')
  async processWalletPayment(@Req() req: any, @Body() body: { amount: number; orderId: number }) {
    const userId = req.user.id;
    const userAccountId = req.user.userAccountId;
    return this.walletService.processWalletPayment(userId, body.amount, body.orderId, userAccountId);
  }

  /**
   * Process wallet refund (internal use)
   */
  @Post('refund')
  async processWalletRefund(@Req() req: any, @Body() body: { amount: number; orderId: number }) {
    const userId = req.user.id;
    const userAccountId = req.user.userAccountId;
    return this.walletService.processWalletRefund(userId, body.amount, body.orderId, userAccountId);
  }
}

/**
 * Admin wallet controller
 */
@Controller('admin/wallets')
@UseGuards(AuthGuard)
export class AdminWalletController {
  constructor(private readonly walletService: WalletService) {}

  /**
   * Get all wallets (admin)
   */
  @Get()
  async getAllWallets(@Query() query: any) {
    return this.walletService.getAllWallets(query);
  }

  /**
   * Update wallet status (admin)
   */
  @Put(':id/status')
  async updateWalletStatus(@Param('id') id: string, @Body() body: { status: string }) {
    const walletId = parseInt(id);
    return this.walletService.updateWalletStatus(walletId, body.status as any);
  }

  /**
   * Get all transactions (admin)
   */
  @Get('transactions')
  async getAllTransactions(@Query() query: any) {
    return this.walletService.getAllTransactions(query);
  }
}
