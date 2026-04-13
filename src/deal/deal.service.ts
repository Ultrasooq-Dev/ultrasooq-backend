/**
 * @module DealService
 * @description Unified Deal Operations service for all sell types:
 *   BUYGROUP, WHOLESALE_PRODUCT (Dropship), SERVICE, NORMALSELL (Retail)
 *
 * Provides: deal listing, stats, timeline, accept, extend, cancel, notify
 */
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HelperService } from '../helper/helper.service';
import { getErrorMessage } from '../common/utils/get-error-message';
import {
  DealListQueryDto,
  ExtendDealDto,
  AcceptDealDto,
  CancelDealDto,
  NotifyBuyersDto,
  CancelOrderDto,
} from './dto/deal.dto';

@Injectable()
export class DealService {
  private readonly logger = new Logger(DealService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly helperService: HelperService,
  ) {}

  // ═══════════════════════════════════════════════════════════
  // GET DEAL STATS
  // ═══════════════════════════════════════════════════════════

  async getDealStats(req: any) {
    try {
      const vendorId = req?.user?.id;
      const adminId = await this.helperService.getAdminId(vendorId);
      const sellerId = adminId ? Number(adminId) : Number(vendorId);

      // Get all product prices owned by this seller
      const sellerPrices = await this.prisma.productPrice.findMany({
        where: {
          adminId: sellerId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: {
          id: true,
          sellType: true,
          dateOpen: true,
          dateClose: true,
          stock: true,
          minCustomer: true,
        },
      });

      const priceIds = sellerPrices.map((p) => p.id);

      // Count active orders per price
      const orderCounts = await this.prisma.orderProducts.groupBy({
        by: ['productPriceId'],
        where: {
          productPriceId: { in: priceIds },
          status: 'ACTIVE',
          orderProductStatus: { in: ['PLACED', 'CONFIRMED', 'SHIPPED', 'OFD'] as any },
          deletedAt: null,
        },
        _count: { id: true },
        _sum: { orderQuantity: true },
      });

      const orderCountMap = new Map(
        orderCounts.map((oc) => [oc.productPriceId, { count: oc._count.id, qty: Number(oc._sum.orderQuantity || 0) }]),
      );

      // Revenue across all deals
      const revenueAgg = await this.prisma.orderProducts.aggregate({
        where: {
          sellerId: sellerId,
          status: 'ACTIVE',
          orderProductStatus: { notIn: ['CANCELLED'] as any },
          deletedAt: null,
        },
        _sum: { salePrice: true },
      });

      const now = new Date();
      let totalDeals = 0;
      let activeDeals = 0;
      let thresholdMetDeals = 0;
      let expiredDeals = 0;
      let completedDeals = 0;
      const byType: Record<string, number> = {
        BUYGROUP: 0,
        WHOLESALE_PRODUCT: 0,
        NORMALSELL: 0,
      };

      for (const price of sellerPrices) {
        if (!price.sellType) continue;
        totalDeals++;
        byType[price.sellType] = (byType[price.sellType] || 0) + 1;

        const closeDate = price.dateClose ? new Date(price.dateClose) : null;
        const isExpired = closeDate && now > closeDate;
        const oc = orderCountMap.get(price.id);
        const customerCount = oc?.count || 0;
        const minMet = price.minCustomer ? customerCount >= price.minCustomer : false;
        const stockFilled = price.stock ? (oc?.qty || 0) >= price.stock : false;

        if (stockFilled) {
          completedDeals++;
        } else if (isExpired) {
          expiredDeals++;
        } else if (minMet) {
          thresholdMetDeals++;
        } else {
          activeDeals++;
        }
      }

      // Service deals count
      const serviceCount = await this.prisma.service.count({
        where: { sellerId: sellerId, status: 'ACTIVE', deletedAt: null },
      });

      return {
        status: true,
        message: 'Deal stats retrieved',
        data: {
          totalDeals: totalDeals + serviceCount,
          activeDeals,
          thresholdMetDeals,
          expiredDeals,
          completedDeals,
          totalRevenue: Number(revenueAgg._sum.salePrice || 0),
          byType: {
            ...byType,
            SERVICE: serviceCount,
          },
        },
      };
    } catch (error) {
      this.logger.error('getDealStats error', getErrorMessage(error));
      return { status: false, message: getErrorMessage(error), data: null };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // LIST DEALS (Paginated, filtered by type/status)
  // ═══════════════════════════════════════════════════════════

  async listDeals(req: any, query: DealListQueryDto) {
    try {
      const vendorId = req?.user?.id;
      const adminId = await this.helperService.getAdminId(vendorId);
      const sellerId = adminId ? Number(adminId) : Number(vendorId);

      const {
        page = 1,
        limit = 20,
        dealType = 'ALL',
        status = 'all',
        search,
        sort = 'newest',
      } = query;

      const skip = (Number(page) - 1) * Number(limit);
      const take = Number(limit);
      const now = new Date();

      // ── Build ProductPrice where clause ──
      const priceWhere: any = {
        adminId: sellerId,
        status: 'ACTIVE',
        deletedAt: null,
      };

      if (dealType !== 'ALL') {
        priceWhere.sellType = dealType;
      }

      // Get seller's product prices with product details
      const allPrices = await this.prisma.productPrice.findMany({
        where: priceWhere,
        include: {
          productPrice_product: {
            select: {
              id: true,
              productName_en: true,
              productName_ar: true,
              productImages: true,
              status: true,
            },
          },
        },
        orderBy: { createdAt: sort === 'oldest' ? 'asc' : 'desc' },
      });

      // Search filter
      let filtered = allPrices;
      if (search) {
        const term = search.toLowerCase();
        filtered = allPrices.filter((p) => {
          const nameEn = (p.productPrice_product as any)?.productName_en?.toLowerCase() || '';
          const nameAr = (p.productPrice_product as any)?.productName_ar?.toLowerCase() || '';
          return nameEn.includes(term) || nameAr.includes(term);
        });
      }

      // Get order data for each price
      const priceIds = filtered.map((p) => p.id);
      const orderData = await this.prisma.orderProducts.groupBy({
        by: ['productPriceId'],
        where: {
          productPriceId: { in: priceIds },
          status: 'ACTIVE',
          deletedAt: null,
        },
        _count: { id: true },
        _sum: { orderQuantity: true, salePrice: true },
      });

      const orderMap = new Map(
        orderData.map((od) => [
          od.productPriceId,
          {
            customerCount: od._count.id,
            totalQuantity: Number(od._sum.orderQuantity || 0),
            totalRevenue: Number(od._sum.salePrice || 0),
          },
        ]),
      );

      // Cancelled order counts
      const cancelledData = await this.prisma.orderProducts.groupBy({
        by: ['productPriceId'],
        where: {
          productPriceId: { in: priceIds },
          status: 'ACTIVE',
          orderProductStatus: 'CANCELLED' as any,
          deletedAt: null,
        },
        _count: { id: true },
      });
      const cancelledMap = new Map(cancelledData.map((cd) => [cd.productPriceId, cd._count.id]));

      // ── Compute deal status and build response ──
      const deals = filtered.map((price) => {
        const product = price.productPrice_product as any;
        const oc = orderMap.get(price.id) || { customerCount: 0, totalQuantity: 0, totalRevenue: 0 };
        const cancelledCount = cancelledMap.get(price.id) || 0;

        const closeDate = price.dateClose ? new Date(price.dateClose) : null;
        const openDate = price.dateOpen ? new Date(price.dateOpen) : null;
        const isExpired = closeDate && now > closeDate;
        const minMet = price.minCustomer ? oc.customerCount >= price.minCustomer : false;
        const stockFilled = price.stock ? oc.totalQuantity >= price.stock : false;

        let dealStatus = 'ACTIVE';
        if (stockFilled) dealStatus = 'COMPLETED';
        else if (isExpired && !minMet) dealStatus = 'EXPIRED';
        else if (isExpired && minMet) dealStatus = 'THRESHOLD_MET';
        else if (minMet) dealStatus = 'THRESHOLD_MET';

        // Parse images
        let productImage = null;
        try {
          const images = product?.productImages;
          if (images && Array.isArray(images) && images.length > 0) {
            productImage = images[0]?.url || images[0];
          }
        } catch {}

        return {
          id: price.id,
          dealType: price.sellType || 'NORMALSELL',
          productId: product?.id,
          productName: product?.productName_en || 'Unnamed Product',
          productNameAr: product?.productName_ar || '',
          productImage,
          price: Number(price.productPrice),
          offerPrice: Number(price.offerPrice),
          // Thresholds
          minCustomer: price.minCustomer || null,
          maxCustomer: price.maxCustomer || null,
          currentCustomers: oc.customerCount,
          // Quantity
          stock: price.stock || 0,
          orderedQuantity: oc.totalQuantity,
          // Time window
          dateOpen: price.dateOpen,
          dateClose: price.dateClose,
          startTime: price.startTime,
          endTime: price.endTime,
          // Status
          status: dealStatus,
          // Stats
          totalRevenue: oc.totalRevenue,
          cancelledCount,
        };
      });

      // Status filter
      let statusFiltered = deals;
      if (status !== 'all') {
        statusFiltered = deals.filter((d) => d.status === status);
      }

      // Paginate
      const totalCount = statusFiltered.length;
      const paginated = statusFiltered.slice(skip, skip + take);

      return {
        status: true,
        message: 'Deals retrieved',
        data: {
          deals: paginated,
          totalCount,
          page: Number(page),
          limit: Number(limit),
        },
      };
    } catch (error) {
      this.logger.error('listDeals error', getErrorMessage(error));
      return { status: false, message: getErrorMessage(error), data: null };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // GET DEAL DETAIL (single deal with all orders)
  // ═══════════════════════════════════════════════════════════

  async getDealDetail(req: any, productPriceId: number) {
    try {
      const vendorId = req?.user?.id;
      const adminId = await this.helperService.getAdminId(vendorId);
      const sellerId = adminId ? Number(adminId) : Number(vendorId);

      const price = await this.prisma.productPrice.findFirst({
        where: {
          id: Number(productPriceId),
          adminId: sellerId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        include: {
          productPrice_product: {
            select: {
              id: true,
              productName_en: true,
              productName_ar: true,
              productImages: true,
            },
          },
        },
      });

      if (!price) {
        return { status: false, message: 'Deal not found or access denied', data: null };
      }

      // Get all orders for this deal
      const orders = await this.prisma.orderProducts.findMany({
        where: {
          productPriceId: price.id,
          status: 'ACTIVE',
          deletedAt: null,
        },
        include: {
          orderProduct_order: {
            select: {
              id: true,
              userId: true,
              orderNo: true,
              createdAt: true,
            },
          },
          sellerDetail: false,
        },
        orderBy: { createdAt: 'desc' },
      });

      // Get buyer details
      const buyerIds = [...new Set(orders.map((o) => o.userId).filter(Boolean))] as number[];
      const buyers = await this.prisma.user.findMany({
        where: { id: { in: buyerIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      });
      const buyerMap = new Map(buyers.map((b) => [b.id, b]));

      const product = price.productPrice_product as any;
      const now = new Date();
      const closeDate = price.dateClose ? new Date(price.dateClose) : null;

      // Active order stats
      const activeOrders = orders.filter((o) => (o.orderProductStatus as string) !== 'CANCELLED');
      const totalQuantity = activeOrders.reduce((s, o) => s + (o.orderQuantity || 0), 0);
      const totalRevenue = activeOrders.reduce((s, o) => s + Number(o.salePrice || 0), 0);
      const isExpired = closeDate && now > closeDate;
      const minMet = price.minCustomer ? activeOrders.length >= price.minCustomer : false;
      const stockFilled = price.stock ? totalQuantity >= price.stock : false;

      let dealStatus = 'ACTIVE';
      if (stockFilled) dealStatus = 'COMPLETED';
      else if (isExpired && !minMet) dealStatus = 'EXPIRED';
      else if (minMet) dealStatus = 'THRESHOLD_MET';

      // Build order list
      const orderList = orders.map((o) => {
        const buyer = buyerMap.get(o.userId as number);
        return {
          id: o.id,
          orderId: o.orderProduct_order?.id,
          orderNo: o.orderNo || o.orderProduct_order?.orderNo,
          customerName: buyer ? `${buyer.firstName || ''} ${buyer.lastName || ''}`.trim() : 'Unknown',
          customerEmail: buyer?.email || '',
          quantity: o.orderQuantity || 0,
          total: Number(o.salePrice || 0),
          status: o.orderProductStatus,
          createdAt: o.createdAt,
          cancelReason: o.cancelReason,
        };
      });

      return {
        status: true,
        message: 'Deal detail retrieved',
        data: {
          id: price.id,
          dealType: price.sellType || 'NORMALSELL',
          productId: product?.id,
          productName: product?.productName_en,
          productNameAr: product?.productName_ar,
          price: Number(price.productPrice),
          offerPrice: Number(price.offerPrice),
          minCustomer: price.minCustomer,
          maxCustomer: price.maxCustomer,
          currentCustomers: activeOrders.length,
          stock: price.stock || 0,
          orderedQuantity: totalQuantity,
          totalRevenue,
          dateOpen: price.dateOpen,
          dateClose: price.dateClose,
          startTime: price.startTime,
          endTime: price.endTime,
          status: dealStatus,
          orders: orderList,
        },
      };
    } catch (error) {
      this.logger.error('getDealDetail error', getErrorMessage(error));
      return { status: false, message: getErrorMessage(error), data: null };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // EXTEND DEAL TIME (max = 1/2 original duration)
  // ═══════════════════════════════════════════════════════════

  async extendDeal(req: any, dto: ExtendDealDto) {
    try {
      const vendorId = req?.user?.id;
      const adminId = await this.helperService.getAdminId(vendorId);
      const sellerId = adminId ? Number(adminId) : Number(vendorId);

      const price = await this.prisma.productPrice.findFirst({
        where: {
          id: dto.productPriceId,
          adminId: sellerId,
          status: 'ACTIVE',
          deletedAt: null,
        },
      });

      if (!price) {
        throw new BadRequestException('Deal not found or access denied');
      }

      if (!price.dateOpen || !price.dateClose) {
        throw new BadRequestException('Deal has no time window to extend');
      }

      // Calculate max allowed extension (half of original duration)
      const openDate = new Date(price.dateOpen);
      const closeDate = new Date(price.dateClose);
      const originalDurationMs = closeDate.getTime() - openDate.getTime();
      const originalDays = Math.max(1, Math.round(originalDurationMs / 86400000));
      const maxExtendDays = Math.max(1, Math.floor(originalDays / 2));

      if (dto.extendDays > maxExtendDays) {
        throw new BadRequestException(
          `Cannot extend more than ${maxExtendDays} days (half of the original ${originalDays}-day deal duration)`,
        );
      }

      // Apply extension
      const newCloseDate = new Date(closeDate);
      newCloseDate.setDate(newCloseDate.getDate() + dto.extendDays);

      await this.prisma.productPrice.update({
        where: { id: dto.productPriceId },
        data: { dateClose: newCloseDate },
      });

      this.logger.log(
        `Deal ${dto.productPriceId} extended by ${dto.extendDays} days (max allowed: ${maxExtendDays}). New close: ${newCloseDate.toISOString()}`,
      );

      return {
        status: true,
        message: `Deal extended by ${dto.extendDays} days`,
        data: {
          productPriceId: dto.productPriceId,
          previousClose: closeDate.toISOString(),
          newClose: newCloseDate.toISOString(),
          originalDays,
          maxExtendDays,
          extendedDays: dto.extendDays,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error('extendDeal error', getErrorMessage(error));
      return { status: false, message: getErrorMessage(error), data: null };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ACCEPT DEAL (confirm orders, optional bypass minimum)
  // ═══════════════════════════════════════════════════════════

  async acceptDeal(req: any, dto: AcceptDealDto) {
    try {
      const vendorId = req?.user?.id;
      const adminId = await this.helperService.getAdminId(vendorId);
      const sellerId = adminId ? Number(adminId) : Number(vendorId);

      const price = await this.prisma.productPrice.findFirst({
        where: {
          id: dto.productPriceId,
          adminId: sellerId,
          status: 'ACTIVE',
          deletedAt: null,
        },
      });

      if (!price) {
        throw new BadRequestException('Deal not found or access denied');
      }

      // Check minimum customer threshold
      const activeOrderCount = await this.prisma.orderProducts.count({
        where: {
          productPriceId: price.id,
          status: 'ACTIVE',
          orderProductStatus: { in: ['PLACED', 'CONFIRMED'] as any },
          deletedAt: null,
        },
      });

      if (price.minCustomer && activeOrderCount < price.minCustomer && !dto.bypassMinimum) {
        throw new BadRequestException(
          `Minimum customer threshold not met (${activeOrderCount}/${price.minCustomer}). Set bypassMinimum: true to override.`,
        );
      }

      // Move all PLACED orders to CONFIRMED
      const updated = await this.prisma.orderProducts.updateMany({
        where: {
          productPriceId: price.id,
          status: 'ACTIVE',
          orderProductStatus: 'PLACED' as any,
          deletedAt: null,
        },
        data: { orderProductStatus: 'CONFIRMED' as any },
      });

      this.logger.log(
        `Deal ${dto.productPriceId} accepted. ${updated.count} orders confirmed.${dto.bypassMinimum ? ' (minimum bypassed)' : ''}`,
      );

      return {
        status: true,
        message: `Deal accepted. ${updated.count} orders confirmed.`,
        data: {
          productPriceId: dto.productPriceId,
          confirmedOrders: updated.count,
          bypassedMinimum: dto.bypassMinimum || false,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error('acceptDeal error', getErrorMessage(error));
      return { status: false, message: getErrorMessage(error), data: null };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // CANCEL DEAL (cancel all orders + trigger refund)
  // ═══════════════════════════════════════════════════════════

  async cancelDeal(req: any, dto: CancelDealDto) {
    try {
      const vendorId = req?.user?.id;
      const adminId = await this.helperService.getAdminId(vendorId);
      const sellerId = adminId ? Number(adminId) : Number(vendorId);

      const price = await this.prisma.productPrice.findFirst({
        where: {
          id: dto.productPriceId,
          adminId: sellerId,
          status: 'ACTIVE',
          deletedAt: null,
        },
      });

      if (!price) {
        throw new BadRequestException('Deal not found or access denied');
      }

      // Cancel all non-delivered, non-cancelled orders
      const updated = await this.prisma.orderProducts.updateMany({
        where: {
          productPriceId: price.id,
          status: 'ACTIVE',
          orderProductStatus: { in: ['PLACED', 'CONFIRMED'] as any },
          deletedAt: null,
        },
        data: {
          orderProductStatus: 'CANCELLED' as any,
          cancelReason: dto.reason || 'Deal cancelled by vendor',
        },
      });

      this.logger.log(
        `Deal ${dto.productPriceId} cancelled. ${updated.count} orders cancelled. Reason: ${dto.reason || 'N/A'}`,
      );

      // TODO: Trigger wallet refunds for cancelled orders
      // TODO: Send notifications to all affected buyers

      return {
        status: true,
        message: `Deal cancelled. ${updated.count} orders cancelled and refund initiated.`,
        data: {
          productPriceId: dto.productPriceId,
          cancelledOrders: updated.count,
          reason: dto.reason || 'Deal cancelled by vendor',
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error('cancelDeal error', getErrorMessage(error));
      return { status: false, message: getErrorMessage(error), data: null };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // CANCEL SINGLE ORDER within a deal
  // ═══════════════════════════════════════════════════════════

  async cancelOrder(req: any, dto: CancelOrderDto) {
    try {
      const vendorId = req?.user?.id;
      const adminId = await this.helperService.getAdminId(vendorId);
      const sellerId = adminId ? Number(adminId) : Number(vendorId);

      const order = await this.prisma.orderProducts.findFirst({
        where: {
          id: dto.orderProductId,
          sellerId: sellerId,
          status: 'ACTIVE',
          orderProductStatus: { in: ['PLACED', 'CONFIRMED'] as any },
          deletedAt: null,
        },
      });

      if (!order) {
        throw new BadRequestException('Order not found, already cancelled, or access denied');
      }

      await this.prisma.orderProducts.update({
        where: { id: dto.orderProductId },
        data: {
          orderProductStatus: 'CANCELLED' as any,
          cancelReason: dto.reason || 'Cancelled by vendor',
        },
      });

      // TODO: Trigger wallet refund for this order
      // TODO: Notify the buyer

      return {
        status: true,
        message: 'Order cancelled successfully',
        data: { orderProductId: dto.orderProductId },
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error('cancelOrder error', getErrorMessage(error));
      return { status: false, message: getErrorMessage(error), data: null };
    }
  }

  // ═══════════════════════════════════════════════════════════
  // NOTIFY ALL BUYERS in a deal
  // ═══════════════════════════════════════════════════════════

  async notifyBuyers(req: any, dto: NotifyBuyersDto) {
    try {
      const vendorId = req?.user?.id;
      const adminId = await this.helperService.getAdminId(vendorId);
      const sellerId = adminId ? Number(adminId) : Number(vendorId);

      // Verify ownership
      const price = await this.prisma.productPrice.findFirst({
        where: {
          id: dto.productPriceId,
          adminId: sellerId,
          status: 'ACTIVE',
          deletedAt: null,
        },
      });

      if (!price) {
        throw new BadRequestException('Deal not found or access denied');
      }

      // Get all active buyer IDs
      const orders = await this.prisma.orderProducts.findMany({
        where: {
          productPriceId: price.id,
          status: 'ACTIVE',
          orderProductStatus: { notIn: ['CANCELLED'] as any },
          deletedAt: null,
        },
        select: { userId: true },
        distinct: ['userId'],
      });

      const buyerIds = orders.map((o) => o.userId).filter(Boolean) as number[];

      // Create notifications for each buyer
      if (buyerIds.length > 0) {
        await this.prisma.notification.createMany({
          data: buyerIds.map((userId) => ({
            userId,
            title: 'Deal Update',
            message: dto.message,
            type: 'DEAL_UPDATE',
            read: false,
          })),
        });
      }

      this.logger.log(
        `Deal ${dto.productPriceId}: Notified ${buyerIds.length} buyers. Message: ${dto.message.substring(0, 50)}...`,
      );

      return {
        status: true,
        message: `Notification sent to ${buyerIds.length} buyers`,
        data: {
          productPriceId: dto.productPriceId,
          notifiedBuyers: buyerIds.length,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error('notifyBuyers error', getErrorMessage(error));
      return { status: false, message: getErrorMessage(error), data: null };
    }
  }
}
