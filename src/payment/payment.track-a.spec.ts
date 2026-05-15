import { PaymentService } from './payment.service';

describe('Payment Track A hardening', () => {
  const makeService = (prismaOverrides: any = {}) => {
    const prisma = {
      order: {
        findFirst: jest.fn(),
      },
      transactionPaymob: {
        findFirst: jest.fn(),
      },
      ...prismaOverrides,
    };

    return {
      service: new PaymentService({} as any, {} as any, {} as any, {} as any, prisma as any),
      prisma,
    };
  };

  afterEach(() => {
    delete process.env.PAYMOB_HMAC_SECRET;
  });

  it('rejects unauthenticated Paymob intention creation', async () => {
    const { service, prisma } = makeService();

    const result = await service.createIntention(
      {
        billing_data: {},
        extras: { orderId: 1, paymentType: 'DIRECT' },
        special_reference: 'ref',
      },
      {},
    );

    expect(result.status).toBe(false);
    expect(result.error).toBe('Authentication required');
    expect(prisma.order.findFirst).not.toHaveBeenCalled();
  });

  it('fails Paymob webhooks closed when signature material is missing', async () => {
    const { service, prisma } = makeService();

    const result = await service.paymobWebhook({}, { body: {}, query: {} });

    expect(result.status).toBe(false);
    expect(result.message).toContain('Invalid webhook');
    expect(prisma.transactionPaymob.findFirst).not.toHaveBeenCalled();
  });

  it('fails AmwalPay webhooks closed for malformed payloads', async () => {
    const { service, prisma } = makeService();

    const result = await service.amwalPayWebhook({}, { body: {} });

    expect(result.status).toBe(false);
    expect(result.message).toBe('Invalid AmwalPay webhook payload');
    expect(prisma.transactionPaymob.findFirst).not.toHaveBeenCalled();
  });
});
