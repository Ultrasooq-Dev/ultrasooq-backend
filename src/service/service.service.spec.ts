import { ServiceService } from './service.service';

describe('ServiceService tag creation flow', () => {
  const prisma: any = {
    tags: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    service: {
      create: jest.fn(),
    },
  };
  const helperService = {
    getAdminId: jest.fn(),
  };

  const service = new ServiceService(helperService as any, prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates missing tags by normalized name and omits non-numeric Better Auth addedBy', async () => {
    helperService.getAdminId.mockResolvedValue('seller-1');
    prisma.tags.findFirst.mockResolvedValue(null);
    prisma.tags.create.mockResolvedValue({ id: 12, tagName: 'Home Cleaning' });
    prisma.service.create.mockResolvedValue({ id: 5, serviceName: 'Cleaning' });

    const result = await service.createService(
      {
        serviceName: 'Cleaning',
        categoryId: 1,
        workingDays: 'MON',
        serviceType: 'BOOKING',
        tags: [{ tagName: '  Home   Cleaning  ' }],
        features: [{ name: 'Visit', serviceCostType: 'FLAT', serviceCost: 10 }],
      } as any,
      'usr_better_auth',
    );

    expect(result.success).toBe(true);
    expect(prisma.tags.create).toHaveBeenCalledWith({
      data: { tagName: 'Home Cleaning', addedBy: null },
    });
    expect(prisma.service.create.mock.calls[0][0].data.serviceTags.createMany.data).toEqual([
      { tagId: 12 },
    ]);
  });

  it('reuses an existing tag case-insensitively', async () => {
    helperService.getAdminId.mockResolvedValue('seller-1');
    prisma.tags.findFirst.mockResolvedValue({ id: 7, tagName: 'Moving' });
    prisma.service.create.mockResolvedValue({ id: 6, serviceName: 'Mover' });

    const result = await service.createService(
      {
        serviceName: 'Mover',
        categoryId: 1,
        workingDays: 'MON',
        serviceType: 'MOVING',
        tags: [{ tagName: 'moving' }],
        features: [{ name: 'Hour', serviceCostType: 'HOURLY', serviceCost: 15 }],
      } as any,
      '42',
    );

    expect(result.success).toBe(true);
    expect(prisma.tags.create).not.toHaveBeenCalled();
    expect(prisma.service.create.mock.calls[0][0].data.serviceTags.createMany.data).toEqual([
      { tagId: 7 },
    ]);
  });
});
