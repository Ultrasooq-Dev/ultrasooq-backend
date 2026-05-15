import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { assertWalletCurrency, getWalletDefaultCurrency } from './wallet-currency.config';

describe('Wallet Track A hardening', () => {
  const makeService = (prismaOverrides: any = {}) => {
    const prisma = {
      wallet: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      walletSettings: {
        upsert: jest.fn(),
      },
      walletTransaction: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      order: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(async (handler) => handler(prisma)),
      ...prismaOverrides,
    };

    return { service: new WalletService(prisma as any), prisma };
  };

  afterEach(() => {
    delete process.env.WALLET_DEFAULT_CURRENCY;
  });

  it('rejects buyer /wallet/deposit without increasing balance', async () => {
    const { service, prisma } = makeService();
    prisma.wallet.findFirst.mockResolvedValue({
      id: 1,
      userId: 'buyer-1',
      currencyCode: 'OMR',
      balance: { toNumber: () => 0 },
      status: 'ACTIVE',
    });

    await expect(
      service.depositToWallet('buyer-1', { amount: 10, paymentMethod: 'CARD' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.wallet.update).not.toHaveBeenCalled();
    expect(prisma.walletTransaction.create).not.toHaveBeenCalled();
  });

  it('rejects negative /wallet/payment amounts before any wallet mutation', async () => {
    const { service, prisma } = makeService();

    await expect(service.processWalletPayment('buyer-1', -25, 123)).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.wallet.findFirst).not.toHaveBeenCalled();
    expect(prisma.wallet.update).not.toHaveBeenCalled();
  });

  it('uses the authenticated user order amount for /wallet/payment instead of the client amount', async () => {
    const { service, prisma } = makeService();
    prisma.order.findFirst.mockResolvedValue({
      id: 123,
      userId: 'buyer-1',
      totalCustomerPay: 12,
    });
    prisma.wallet.findFirst.mockResolvedValue({
      id: 1,
      userId: 'buyer-1',
      currencyCode: 'OMR',
      balance: { toNumber: () => 100 },
      status: 'ACTIVE',
    });
    prisma.wallet.update.mockResolvedValue({ id: 1, balance: 88 });
    prisma.walletTransaction.create.mockResolvedValue({ id: 55 });

    await service.processWalletPayment('buyer-1', 1, 123);

    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: { id: 123, userId: 'buyer-1', deletedAt: null },
    });
    expect(prisma.wallet.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { balance: { decrement: 12 } },
    });
  });

  it('returns an existing admin adjustment for repeated idempotency keys', async () => {
    const existingTransaction = {
      id: 99,
      walletId: 1,
      referenceId: 'admin-adjust:idem-1',
      wallet: { id: 1, userId: 'target-1', currencyCode: 'OMR' },
    };
    const { service, prisma } = makeService();
    prisma.walletTransaction.findFirst.mockResolvedValue(existingTransaction);

    const result = await service.adjustWalletByAdmin(
      {
        targetUserId: 'target-1',
        amount: 5,
        currencyCode: 'OMR',
        reason: 'QA correction',
        idempotencyKey: 'idem-1',
      },
      { actorUserId: 'admin-1' },
    );

    expect(result.idempotent).toBe(true);
    expect(result.transaction).toBe(existingTransaction);
    expect(prisma.wallet.update).not.toHaveBeenCalled();
  });

  it('defaults wallet currency to OMR and rejects unsupported configured currencies', () => {
    expect(getWalletDefaultCurrency()).toBe('OMR');
    expect(assertWalletCurrency('omr')).toBe('OMR');

    process.env.WALLET_DEFAULT_CURRENCY = 'USD';
    expect(() => getWalletDefaultCurrency()).toThrow('Invalid WALLET_DEFAULT_CURRENCY configuration');
  });
});
