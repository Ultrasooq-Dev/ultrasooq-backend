import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { WalletStatus, WalletTransactionType, WalletTransactionStatus, WalletReferenceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletDepositDto } from './dto/wallet-deposit.dto';
import { WalletWithdrawDto } from './dto/wallet-withdraw.dto';
import { WalletTransferDto } from './dto/wallet-transfer.dto';
import { WalletSettingsDto } from './dto/wallet-settings.dto';
import { WalletTransactionsDto } from './dto/wallet-transactions.dto';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}
  
  /**
   * Get or create wallet for user
   */
  async getOrCreateWallet(userId: number, userAccountId?: number, currencyCode: string = 'USD') {
    let wallet = await this.prisma.wallet.findFirst({
      where: {
        userId,
        userAccountId: userAccountId || null,
        currencyCode,
        deletedAt: null,
      },
    });

    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: {
          userId,
          userAccountId: userAccountId || null,
          currencyCode,
          balance: 0,
          frozenBalance: 0,
          status: WalletStatus.ACTIVE,
        },
      });

      // Create default wallet settings
      await this.prisma.walletSettings.create({
        data: {
          userId,
          autoWithdraw: false,
          withdrawLimit: 0,
          dailyLimit: 0,
          monthlyLimit: 0,
          notificationPreferences: {},
        },
      });
    }

    return wallet;
  }

  /**
   * Get wallet balance
   */
  async getWalletBalance(userId: number, userAccountId?: number) {
    const wallet = await this.getOrCreateWallet(userId, userAccountId);
    
    return {
      message: 'Wallet balance retrieved successfully',
      status: true,
      data: wallet,
    };
  }

  /**
   * Deposit funds to wallet
   */
  async depositToWallet(userId: number, depositDto: WalletDepositDto, userAccountId?: number) {
    const wallet = await this.getOrCreateWallet(userId, userAccountId);
    
    if (wallet.status !== WalletStatus.ACTIVE) {
      throw new BadRequestException('Wallet is not active');
    }

    const transaction = await this.prisma.$transaction(async (tx) => {
      // Update wallet balance
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: {
            increment: depositDto.amount,
          },
        },
      });

      // Create transaction record
      const walletTransaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          transactionType: WalletTransactionType.DEPOSIT,
          amount: depositDto.amount,
          balanceBefore: wallet.balance,
          balanceAfter: updatedWallet.balance,
          referenceType: WalletReferenceType.PAYMENT,
          referenceId: depositDto.paymentIntentId,
          description: `Deposit via ${depositDto.paymentMethod}`,
          status: WalletTransactionStatus.COMPLETED,
          metadata: {
            paymentMethod: depositDto.paymentMethod,
            paymentIntentId: depositDto.paymentIntentId,
          },
        },
      });

      return { wallet: updatedWallet, transaction: walletTransaction };
    });

    return {
      message: 'Funds deposited successfully',
      status: true,
      data: transaction.wallet,
    };
  }

  /**
   * Withdraw funds from wallet
   */
  async withdrawFromWallet(userId: number, withdrawDto: WalletWithdrawDto, userAccountId?: number) {
    const wallet = await this.getOrCreateWallet(userId, userAccountId);
    
    if (wallet.status !== WalletStatus.ACTIVE) {
      throw new BadRequestException('Wallet is not active');
    }

    if (wallet.balance.toNumber() < withdrawDto.amount) {
      throw new BadRequestException('Insufficient balance');
    }

    // Check daily and monthly limits
    await this.checkWithdrawalLimits(userId, withdrawDto.amount);

    const transaction = await this.prisma.$transaction(async (tx) => {
      // Update wallet balance
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: {
            decrement: withdrawDto.amount,
          },
        },
      });

      // Create transaction record
      const walletTransaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          transactionType: WalletTransactionType.WITHDRAWAL,
          amount: withdrawDto.amount,
          balanceBefore: wallet.balance,
          balanceAfter: updatedWallet.balance,
          referenceType: WalletReferenceType.PAYMENT,
          description: `Withdrawal via ${withdrawDto.withdrawalMethod}`,
          status: WalletTransactionStatus.PENDING,
          metadata: {
            withdrawalMethod: withdrawDto.withdrawalMethod,
            bankAccountId: withdrawDto.bankAccountId,
          },
        },
      });

      return { wallet: updatedWallet, transaction: walletTransaction };
    });

    return {
      message: 'Withdrawal request submitted successfully',
      status: true,
      data: transaction.wallet,
    };
  }

  /**
   * Transfer funds to another user
   */
  async transferToUser(userId: number, transferDto: WalletTransferDto, userAccountId?: number) {
    const fromWallet = await this.getOrCreateWallet(userId, userAccountId);
    
    if (fromWallet.status !== WalletStatus.ACTIVE) {
      throw new BadRequestException('Your wallet is not active');
    }

    if (fromWallet.balance.toNumber() < transferDto.amount) {
      throw new BadRequestException('Insufficient balance');
    }

    // Get or create recipient wallet
    const toWallet = await this.getOrCreateWallet(transferDto.toUserId, transferDto.toUserAccountId);

    if (toWallet.status !== WalletStatus.ACTIVE) {
      throw new BadRequestException('Recipient wallet is not active');
    }

    const transferFee = 0; // You can implement fee calculation logic here

    const transaction = await this.prisma.$transaction(async (tx) => {
      // Update sender wallet
      const updatedFromWallet = await tx.wallet.update({
        where: { id: fromWallet.id },
        data: {
          balance: {
            decrement: transferDto.amount + transferFee,
          },
        },
      });

      // Update recipient wallet
      const updatedToWallet = await tx.wallet.update({
        where: { id: toWallet.id },
        data: {
          balance: {
            increment: transferDto.amount,
          },
        },
      });

      // Create transfer record
      const walletTransfer = await tx.walletTransfer.create({
        data: {
          fromWalletId: fromWallet.id,
          toWalletId: toWallet.id,
          amount: transferDto.amount,
          transferFee,
          description: transferDto.description,
          status: WalletTransactionStatus.COMPLETED,
        },
      });

      // Create transaction records for both wallets
      await tx.walletTransaction.create({
        data: {
          walletId: fromWallet.id,
          transactionType: WalletTransactionType.TRANSFER_OUT,
          amount: transferDto.amount + transferFee,
          balanceBefore: fromWallet.balance,
          balanceAfter: updatedFromWallet.balance,
          referenceType: WalletReferenceType.TRANSFER,
          referenceId: walletTransfer.id.toString(),
          description: `Transfer to user ${transferDto.toUserId}`,
          status: WalletTransactionStatus.COMPLETED,
          metadata: {
            transferId: walletTransfer.id,
            recipientUserId: transferDto.toUserId,
            transferFee,
          },
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: toWallet.id,
          transactionType: WalletTransactionType.TRANSFER_IN,
          amount: transferDto.amount,
          balanceBefore: toWallet.balance,
          balanceAfter: updatedToWallet.balance,
          referenceType: WalletReferenceType.TRANSFER,
          referenceId: walletTransfer.id.toString(),
          description: `Transfer from user ${userId}`,
          status: WalletTransactionStatus.COMPLETED,
          metadata: {
            transferId: walletTransfer.id,
            senderUserId: userId,
          },
        },
      });

      return { fromWallet: updatedFromWallet, toWallet: updatedToWallet, transfer: walletTransfer };
    });

    return {
      message: 'Transfer completed successfully',
      status: true,
      data: transaction.fromWallet,
    };
  }

  /**
   * Get wallet transactions
   */
  async getWalletTransactions(userId: number, query: WalletTransactionsDto, userAccountId?: number) {
    const wallet = await this.getOrCreateWallet(userId, userAccountId);
    
    const where: any = {
      walletId: wallet.id,
      deletedAt: null,
    };

    if (query.transactionType) {
      where.transactionType = query.transactionType;
    }

    if (query.startDate && query.endDate) {
      where.createdAt = {
        gte: new Date(query.startDate),
        lte: new Date(query.endDate),
      };
    }

    const [transactions, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);

    return {
      message: 'Transactions retrieved successfully',
      status: true,
      data: {
        data: transactions,
        total,
        page: query.page,
        limit: query.limit,
      },
    };
  }

  /**
   * Get wallet settings
   */
  async getWalletSettings(userId: number) {
    let settings = await this.prisma.walletSettings.findFirst({
      where: {
        userId,
        deletedAt: null,
      },
    });

    if (!settings) {
      settings = await this.prisma.walletSettings.create({
        data: {
          userId,
          autoWithdraw: false,
          withdrawLimit: 0,
          dailyLimit: 0,
          monthlyLimit: 0,
          notificationPreferences: {},
        },
      });
    }

    return {
      message: 'Wallet settings retrieved successfully',
      status: true,
      data: settings,
    };
  }

  /**
   * Update wallet settings
   */
  async updateWalletSettings(userId: number, settingsDto: WalletSettingsDto) {
    const settings = await this.prisma.walletSettings.upsert({
      where: { userId },
      update: settingsDto,
      create: {
        userId,
        ...settingsDto,
      },
    });

    return {
      message: 'Wallet settings updated successfully',
      status: true,
      data: settings,
    };
  }

  /**
   * Process payment with wallet
   */
  async processWalletPayment(userId: number, amount: number, orderId: number, userAccountId?: number) {
    const wallet = await this.getOrCreateWallet(userId, userAccountId);
    
    if (wallet.status !== WalletStatus.ACTIVE) {
      throw new BadRequestException('Wallet is not active');
    }

    if (wallet.balance.toNumber() < amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }

    const transaction = await this.prisma.$transaction(async (tx) => {
      // Update wallet balance
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: {
            decrement: amount,
          },
        },
      });

      // Create transaction record
      const walletTransaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          transactionType: WalletTransactionType.PAYMENT,
          amount,
          balanceBefore: wallet.balance,
          balanceAfter: updatedWallet.balance,
          referenceType: WalletReferenceType.ORDER,
          referenceId: orderId.toString(),
          description: `Payment for order #${orderId}`,
          status: WalletTransactionStatus.COMPLETED,
          metadata: {
            orderId,
            paymentType: 'WALLET',
          },
        },
      });

      return { wallet: updatedWallet, transaction: walletTransaction };
    });

    return {
      message: 'Payment processed successfully',
      status: true,
      data: transaction.wallet,
      transactionId: transaction.transaction.id, // Return wallet transaction ID
      walletTransaction: transaction.transaction, // Optional: full transaction object
    };
  }

  /**
   * Process refund to wallet
   */
  async processWalletRefund(userId: number, amount: number, orderId: number, userAccountId?: number) {
    const wallet = await this.getOrCreateWallet(userId, userAccountId);
    
    if (wallet.status !== WalletStatus.ACTIVE) {
      throw new BadRequestException('Wallet is not active');
    }

    const transaction = await this.prisma.$transaction(async (tx) => {
      // Update wallet balance
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: {
            increment: amount,
          },
        },
      });

      // Create transaction record
      const walletTransaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          transactionType: WalletTransactionType.REFUND,
          amount,
          balanceBefore: wallet.balance,
          balanceAfter: updatedWallet.balance,
          referenceType: WalletReferenceType.ORDER,
          referenceId: orderId.toString(),
          description: `Refund for order #${orderId}`,
          status: WalletTransactionStatus.COMPLETED,
          metadata: {
            orderId,
            refundType: 'ORDER_REFUND',
          },
        },
      });

      return { wallet: updatedWallet, transaction: walletTransaction };
    });

    return {
      message: 'Refund processed successfully',
      status: true,
      data: transaction.wallet,
      transaction: transaction.transaction,
    };
  }

  /**
   * Check withdrawal limits
   */
  private async checkWithdrawalLimits(userId: number, amount: number) {
    const settings = await this.prisma.walletSettings.findFirst({
      where: { userId, deletedAt: null },
    });

    if (!settings) return;

    // Check daily limit
    if (settings.dailyLimit.toNumber() > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todayWithdrawals = await this.prisma.walletTransaction.aggregate({
        where: {
          wallet: { userId },
          transactionType: WalletTransactionType.WITHDRAWAL,
          status: WalletTransactionStatus.COMPLETED,
          createdAt: { gte: today },
        },
        _sum: { amount: true },
      });

      const todayTotal = todayWithdrawals._sum.amount?.toNumber() || 0;
      if (todayTotal + amount > settings.dailyLimit.toNumber()) {
        throw new BadRequestException('Daily withdrawal limit exceeded');
      }
    }

    // Check monthly limit
    if (settings.monthlyLimit.toNumber() > 0) {
      const thisMonth = new Date();
      thisMonth.setDate(1);
      thisMonth.setHours(0, 0, 0, 0);
      
      const monthWithdrawals = await this.prisma.walletTransaction.aggregate({
        where: {
          wallet: { userId },
          transactionType: WalletTransactionType.WITHDRAWAL,
          status: WalletTransactionStatus.COMPLETED,
          createdAt: { gte: thisMonth },
        },
        _sum: { amount: true },
      });

      const monthTotal = monthWithdrawals._sum.amount?.toNumber() || 0;
      if (monthTotal + amount > settings.monthlyLimit.toNumber()) {
        throw new BadRequestException('Monthly withdrawal limit exceeded');
      }
    }
  }

  /**
   * Admin: Get all wallets
   */
  async getAllWallets(query: any) {
    const where: any = {
      deletedAt: null,
    };

    if (query.userId) {
      where.userId = parseInt(query.userId);
    }

    if (query.status) {
      where.status = query.status;
    }

    const [wallets, total] = await Promise.all([
      this.prisma.wallet.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.wallet.count({ where }),
    ]);

    return {
      message: 'Wallets retrieved successfully',
      status: true,
      data: {
        data: wallets,
        total,
        page: query.page,
        limit: query.limit,
      },
    };
  }

  /**
   * Admin: Update wallet status
   */
  async updateWalletStatus(walletId: number, status: WalletStatus) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const updatedWallet = await this.prisma.wallet.update({
      where: { id: walletId },
      data: { status },
    });

    return {
      message: 'Wallet status updated successfully',
      status: true,
      data: updatedWallet,
    };
  }

  /**
   * Admin: Get all transactions
   */
  async getAllTransactions(query: any) {
    const where: any = {
      deletedAt: null,
    };

    if (query.userId) {
      where.wallet = { userId: parseInt(query.userId) };
    }

    if (query.transactionType) {
      where.transactionType = query.transactionType;
    }

    if (query.startDate && query.endDate) {
      where.createdAt = {
        gte: new Date(query.startDate),
        lte: new Date(query.endDate),
      };
    }

    const [transactions, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        include: {
          wallet: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);

    return {
      message: 'Transactions retrieved successfully',
      status: true,
      data: {
        data: transactions,
        total,
        page: query.page,
        limit: query.limit,
      },
    };
  }
}
