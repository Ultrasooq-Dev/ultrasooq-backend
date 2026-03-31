import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProductTrackingService {
  private readonly logger = new Logger(ProductTrackingService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Route an analytics event to the appropriate product tracking table.
   */
  async routeEvent(event: Record<string, any>): Promise<void> {
    const { eventName, userId, metadata } = event;
    const deviceId = event.deviceId || null;
    const productId = metadata?.productId;

    switch (eventName) {
      case 'product_view':
        if (productId) await this.trackView(userId, deviceId, productId);
        break;
      case 'product_search':
        await this.trackSearch(
          userId,
          deviceId,
          metadata?.searchTerm,
          metadata?.productId,
          metadata?.clicked,
        );
        break;
      case 'product_click':
        if (productId)
          await this.trackClick(userId, deviceId, productId, metadata?.clickSource);
        break;
    }
  }

  /**
   * Upsert a product view. Increments viewCount if already exists.
   */
  async trackView(
    userId: number | null,
    deviceId: string | null,
    productId: number,
  ): Promise<void> {
    try {
      if (userId) {
        await this.prisma.productView.upsert({
          where: { userId_productId: { userId, productId } },
          update: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
          create: { userId, deviceId, productId, viewCount: 1 },
        });
      } else if (deviceId) {
        await this.prisma.productView.upsert({
          where: { deviceId_productId: { deviceId, productId } },
          update: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
          create: { deviceId, productId, viewCount: 1 },
        });
      }
    } catch (error) {
      this.logger.warn(`trackView failed: ${error.message}`);
    }
  }

  /**
   * Record a search event.
   */
  async trackSearch(
    userId: number | null,
    deviceId: string | null,
    searchTerm: string | undefined,
    productId: number | null = null,
    clicked: boolean = false,
  ): Promise<void> {
    if (!searchTerm) return;
    try {
      await this.prisma.productSearch.create({
        data: { userId, deviceId, searchTerm, productId, clicked },
      });
    } catch (error) {
      this.logger.warn(`trackSearch failed: ${error.message}`);
    }
  }

  /**
   * Record a product click with source attribution.
   */
  async trackClick(
    userId: number | null,
    deviceId: string | null,
    productId: number,
    clickSource: string | null = null,
  ): Promise<void> {
    try {
      await this.prisma.productClick.create({
        data: { userId, deviceId, productId, clickSource },
      });

      // Mark the most recent search for this product as clicked
      if (clickSource === 'search') {
        const recentSearch = await this.prisma.productSearch.findFirst({
          where: {
            OR: [
              userId ? { userId } : undefined,
              deviceId ? { deviceId } : undefined,
            ].filter(Boolean),
            productId: null,
            clicked: false,
            createdAt: { gte: new Date(Date.now() - 30000) }, // Last 30 seconds
          },
          orderBy: { createdAt: 'desc' },
        });

        if (recentSearch) {
          await this.prisma.productSearch.update({
            where: { id: recentSearch.id },
            data: { clicked: true, productId },
          });
        }
      }
    } catch (error) {
      this.logger.warn(`trackClick failed: ${error.message}`);
    }
  }

  /**
   * Get top products by views.
   */
  async getTopProducts(days: number, limit: number = 20) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.prisma.productView.groupBy({
      by: ['productId'],
      where: { createdAt: { gte: since }, deletedAt: null },
      _sum: { viewCount: true },
      _count: { id: true },
      orderBy: { _sum: { viewCount: 'desc' } },
      take: limit,
    });
  }

  /**
   * Get search trends.
   */
  async getSearchTrends(days: number, limit: number = 50) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.prisma.productSearch.groupBy({
      by: ['searchTerm'],
      where: { createdAt: { gte: since }, deletedAt: null },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: limit,
    });
  }
}
