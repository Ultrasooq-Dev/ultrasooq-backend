/**
 * DEAL SERVICE TESTS
 * Covers: stats, listing, detail, extend, accept, cancel, notify
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DealService } from './deal.service';
import { PrismaService } from '../prisma/prisma.service';
import { HelperService } from '../helper/helper.service';

const mockPrisma = {
  productPrice: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  orderProducts: {
    groupBy: jest.fn(),
    aggregate: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
  },
  service: { count: jest.fn() },
  user: { findMany: jest.fn() },
  notification: { createMany: jest.fn() },
};

const mockHelper = {
  getAdminId: jest.fn().mockResolvedValue(1),
};

describe('DealService', () => {
  let service: DealService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DealService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: HelperService, useValue: mockHelper },
      ],
    }).compile();

    service = module.get<DealService>(DealService);
    jest.clearAllMocks();
    mockHelper.getAdminId.mockResolvedValue(1);
  });

  const req = { user: { id: 1, email: 'vendor@test.com' } };

  // ═══════════════════════════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════════════════════════

  describe('getDealStats', () => {
    it('returns aggregated stats', async () => {
      mockPrisma.productPrice.findMany.mockResolvedValue([
        { id: 1, sellType: 'BUYGROUP', stock: 100, minCustomer: 10, dateClose: new Date(Date.now() + 86400000) },
      ]);
      mockPrisma.orderProducts.groupBy.mockResolvedValue([]);
      mockPrisma.orderProducts.aggregate.mockResolvedValue({ _sum: { salePrice: 500 } });
      mockPrisma.service.count.mockResolvedValue(2);

      const result = await service.getDealStats(req);

      expect(result.status).toBe(true);
      expect(result.data).toHaveProperty('totalDeals');
      expect(result.data).toHaveProperty('totalRevenue');
      expect(result.data.byType).toHaveProperty('SERVICE', 2);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // LIST DEALS
  // ═══════════════════════════════════════════════════════════

  describe('listDeals', () => {
    it('returns paginated deals', async () => {
      mockPrisma.productPrice.findMany.mockResolvedValue([
        {
          id: 1, sellType: 'BUYGROUP', productPrice: 50, offerPrice: 40,
          stock: 100, minCustomer: 10, dateOpen: new Date(), dateClose: new Date(Date.now() + 86400000),
          productPrice_product: { id: 1, productName_en: 'Test', productName_ar: 'تست', productImages: [] },
        },
      ]);
      mockPrisma.orderProducts.groupBy.mockResolvedValue([]);

      const result = await service.listDeals(req, { page: 1, limit: 20 });

      expect(result.status).toBe(true);
      expect(result.data.deals).toHaveLength(1);
      expect(result.data.deals[0].dealType).toBe('BUYGROUP');
    });

    it('filters by deal type', async () => {
      mockPrisma.productPrice.findMany.mockResolvedValue([]);
      mockPrisma.orderProducts.groupBy.mockResolvedValue([]);

      const result = await service.listDeals(req, { dealType: 'BUYGROUP' });

      expect(mockPrisma.productPrice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sellType: 'BUYGROUP' }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════
  // EXTEND DEAL
  // ═══════════════════════════════════════════════════════════

  describe('extendDeal', () => {
    it('extends deal within allowed limit', async () => {
      const openDate = new Date('2026-04-01');
      const closeDate = new Date('2026-04-15'); // 14 days → max 7 days extension
      mockPrisma.productPrice.findFirst.mockResolvedValue({
        id: 1, adminId: 1, dateOpen: openDate, dateClose: closeDate, status: 'ACTIVE',
      });
      mockPrisma.productPrice.update.mockResolvedValue({});

      const result = await service.extendDeal(req, { productPriceId: 1, extendDays: 5 });

      expect(result.status).toBe(true);
      expect(result.data.extendedDays).toBe(5);
      expect(mockPrisma.productPrice.update).toHaveBeenCalled();
    });

    it('rejects extension exceeding half of original duration', async () => {
      mockPrisma.productPrice.findFirst.mockResolvedValue({
        id: 1, adminId: 1,
        dateOpen: new Date('2026-04-01'),
        dateClose: new Date('2026-04-11'), // 10 days → max 5
        status: 'ACTIVE',
      });

      await expect(
        service.extendDeal(req, { productPriceId: 1, extendDays: 8 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects if deal not found', async () => {
      mockPrisma.productPrice.findFirst.mockResolvedValue(null);

      await expect(
        service.extendDeal(req, { productPriceId: 999, extendDays: 3 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // ACCEPT DEAL
  // ═══════════════════════════════════════════════════════════

  describe('acceptDeal', () => {
    it('confirms all PLACED orders when threshold met', async () => {
      mockPrisma.productPrice.findFirst.mockResolvedValue({ id: 1, adminId: 1, minCustomer: 5 });
      mockPrisma.orderProducts.count.mockResolvedValue(7);
      mockPrisma.orderProducts.updateMany.mockResolvedValue({ count: 7 });

      const result = await service.acceptDeal(req, { productPriceId: 1 });

      expect(result.status).toBe(true);
      expect(result.data.confirmedOrders).toBe(7);
    });

    it('rejects when minimum not met without bypass', async () => {
      mockPrisma.productPrice.findFirst.mockResolvedValue({ id: 1, adminId: 1, minCustomer: 10 });
      mockPrisma.orderProducts.count.mockResolvedValue(3);

      await expect(
        service.acceptDeal(req, { productPriceId: 1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows bypass when bypassMinimum is true', async () => {
      mockPrisma.productPrice.findFirst.mockResolvedValue({ id: 1, adminId: 1, minCustomer: 10 });
      mockPrisma.orderProducts.count.mockResolvedValue(3);
      mockPrisma.orderProducts.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.acceptDeal(req, { productPriceId: 1, bypassMinimum: true });

      expect(result.status).toBe(true);
      expect(result.data.bypassedMinimum).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // CANCEL DEAL
  // ═══════════════════════════════════════════════════════════

  describe('cancelDeal', () => {
    it('cancels all active orders', async () => {
      mockPrisma.productPrice.findFirst.mockResolvedValue({ id: 1, adminId: 1 });
      mockPrisma.orderProducts.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.cancelDeal(req, { productPriceId: 1, reason: 'Out of stock' });

      expect(result.status).toBe(true);
      expect(result.data.cancelledOrders).toBe(5);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // CANCEL SINGLE ORDER
  // ═══════════════════════════════════════════════════════════

  describe('cancelOrder', () => {
    it('cancels a single order', async () => {
      mockPrisma.orderProducts.findFirst.mockResolvedValue({ id: 10, sellerId: 1 });
      mockPrisma.orderProducts.update.mockResolvedValue({});

      const result = await service.cancelOrder(req, { orderProductId: 10 });

      expect(result.status).toBe(true);
    });

    it('rejects if order not owned by vendor', async () => {
      mockPrisma.orderProducts.findFirst.mockResolvedValue(null);

      await expect(
        service.cancelOrder(req, { orderProductId: 999 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // NOTIFY BUYERS
  // ═══════════════════════════════════════════════════════════

  describe('notifyBuyers', () => {
    it('sends notifications to all active buyers', async () => {
      mockPrisma.productPrice.findFirst.mockResolvedValue({ id: 1, adminId: 1 });
      mockPrisma.orderProducts.findMany.mockResolvedValue([
        { userId: 10 }, { userId: 20 }, { userId: 30 },
      ]);
      mockPrisma.notification.createMany.mockResolvedValue({ count: 3 });

      const result = await service.notifyBuyers(req, {
        productPriceId: 1,
        message: 'Deal is about to close!',
      });

      expect(result.status).toBe(true);
      expect(result.data.notifiedBuyers).toBe(3);
      expect(mockPrisma.notification.createMany).toHaveBeenCalled();
    });
  });
});
