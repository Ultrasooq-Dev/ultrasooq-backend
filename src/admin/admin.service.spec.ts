import { AdminService } from './admin.service';

describe('AdminService marketplace envelopes', () => {
  const prisma: any = {
    rfqQuotes: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    service: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  const service = new AdminService({} as any, {} as any, prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a successful RFQ list envelope for an empty list', async () => {
    prisma.rfqQuotes.findMany.mockResolvedValue([]);
    prisma.rfqQuotes.count.mockResolvedValue(0);

    const result = await service.getAllRfqQuotes(1, 10, {}, 'desc');

    expect(result).toMatchObject({
      status: true,
      message: 'Fetched RFQ quotes successfully',
      data: [],
      totalCount: 0,
    });
  });

  it('returns a successful service list envelope for an empty list', async () => {
    prisma.service.findMany.mockResolvedValue([]);
    prisma.service.count.mockResolvedValue(0);

    const result = await service.getAllService(1, 10, { query: {} });

    expect(result).toMatchObject({
      status: true,
      message: 'Fetched services successfully',
      data: [],
      totalCount: 0,
    });
  });
});
