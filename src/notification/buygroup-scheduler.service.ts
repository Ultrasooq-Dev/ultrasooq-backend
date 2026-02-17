import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';

@Injectable()
export class BuygroupSchedulerService {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Check for buygroup sales and send notifications
   * Runs every 5 minutes
   */
  @Cron('*/5 * * * *') // Every 5 minutes
  async checkBuygroupSales() {
    try {
      const now = new Date();
      const nowTimestamp = now.getTime();

      // Get all active buygroup sales
      const buygroupSales = await this.prisma.productPrice.findMany({
        where: {
          sellType: 'BUYGROUP',
          status: 'ACTIVE',
          dateOpen: { not: null },
          dateClose: { not: null },
        },
        include: {
          productPrice_product: {
            select: {
              id: true,
              productName: true,
            },
          },
        },
      });

      for (const sale of buygroupSales) {
        if (
          !sale.dateOpen ||
          !sale.dateClose ||
          !sale.startTime ||
          !sale.endTime
        ) {
          continue;
        }

        // Parse dates and times
        const startDate = new Date(sale.dateOpen);
        const [startHours, startMinutes] = sale.startTime
          .split(':')
          .map(Number);
        startDate.setHours(startHours || 0, startMinutes || 0, 0, 0);
        const startTimestamp = startDate.getTime();

        const endDate = new Date(sale.dateClose);
        const [endHours, endMinutes] = sale.endTime.split(':').map(Number);
        endDate.setHours(endHours || 0, endMinutes || 0, 0, 0);
        const endTimestamp = endDate.getTime();

        // Check if sale has already ended
        if (nowTimestamp > endTimestamp) {
          continue;
        }

        // Get users who should receive notifications
        // 1. Users who have product in wishlist
        const wishlistUsers = await this.prisma.wishlist.findMany({
          where: {
            productId: sale.productId,
            status: 'ACTIVE',
          },
          select: { userId: true },
          distinct: ['userId'],
        });

        // 2. Get all active buyers to ensure notifications reach potential customers
        // This is important for new buygroup sales where no one has added to wishlist yet
        const allBuyers = await this.prisma.user.findMany({
          where: {
            status: 'ACTIVE',
            userType: 'USER',
            tradeRole: 'BUYER', // BUYER is the main buyer role in TypeTrader enum
          },
          select: { id: true },
        });

        // Combine wishlist users and all buyers, remove duplicates
        const wishlistUserIds = new Set(
          wishlistUsers
            .map((u) => u.userId)
            .filter((id) => id !== null && id !== undefined),
        );
        const buyerIds = allBuyers.map((u) => u.id);
        const userIds = [
          ...new Set([...Array.from(wishlistUserIds), ...buyerIds]),
        ];

        if (userIds.length === 0) {
          continue;
        }

        const productName = sale.productPrice_product?.productName || 'Product';
        const productId = sale.productId;

        // Check for coming soon notifications (24h, 12h, 1h before start)
        const comingSoonTimes = [
          { time: 24 * 60 * 60 * 1000, label: '24 hours' }, // 24 hours
          { time: 12 * 60 * 60 * 1000, label: '12 hours' }, // 12 hours
          { time: 1 * 60 * 60 * 1000, label: '1 hour' }, // 1 hour
        ];

        for (const comingSoonTime of comingSoonTimes) {
          const notificationTime = startTimestamp - comingSoonTime.time;
          // Check if we're within 5 minutes of the notification time
          if (
            nowTimestamp >= notificationTime &&
            nowTimestamp < notificationTime + 5 * 60 * 1000 &&
            nowTimestamp < startTimestamp
          ) {
            const timeRemaining = startTimestamp - nowTimestamp;
            await this.sendBuygroupNotification(
              userIds,
              productName,
              productId,
              sale.id,
              'coming_soon',
              timeRemaining,
            );
            break; // Only send one notification per check cycle
          }
        }

        // Check for started (within 5 minutes of start)
        if (
          nowTimestamp >= startTimestamp &&
          nowTimestamp < startTimestamp + 5 * 60 * 1000
        ) {
          await this.sendBuygroupNotification(
            userIds,
            productName,
            productId,
            sale.id,
            'started',
          );
        }

        // Check for ending soon (1 hour, 30 minutes, 10 minutes before end)
        const endingTimes = [
          { time: 60 * 60 * 1000, type: 'ending_soon' as const }, // 1 hour
          { time: 30 * 60 * 1000, type: 'ending_soon' as const }, // 30 minutes
          { time: 10 * 60 * 1000, type: 'ending_soon' as const }, // 10 minutes
        ];

        for (const endingTime of endingTimes) {
          const notificationTime = endTimestamp - endingTime.time;
          if (
            nowTimestamp >= notificationTime &&
            nowTimestamp < notificationTime + 5 * 60 * 1000 &&
            nowTimestamp > startTimestamp
          ) {
            await this.sendBuygroupNotification(
              userIds,
              productName,
              productId,
              sale.id,
              endingTime.type,
              endingTime.time,
            );
          }
        }
      }
    } catch (error) {
    }
  }

  /**
   * Send buygroup sale notification to multiple users
   * Includes duplicate prevention to avoid sending same notification multiple times
   */
  private async sendBuygroupNotification(
    userIds: number[],
    productName: string,
    productId: number,
    productPriceId: number,
    saleType: 'coming_soon' | 'started' | 'ending_soon',
    timeRemaining?: number,
  ) {
    // Check if we've already sent this notification recently (within last hour)
    // to prevent duplicate notifications
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const existingNotifications = await this.prisma.notification.findMany({
      where: {
        userId: { in: userIds },
        type: 'BUYGROUP',
        data: {
          path: ['productPriceId'],
          equals: productPriceId,
        },
        createdAt: {
          gte: oneHourAgo,
        },
      },
      select: { userId: true },
    });

    const notifiedUserIds = new Set(existingNotifications.map((n) => n.userId));
    const usersToNotify = userIds.filter(
      (userId) => !notifiedUserIds.has(userId),
    );

    if (usersToNotify.length === 0) {
      return; // All users already notified recently
    }
    const formatTime = (ms: number): string => {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
      if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
      if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
      return `${seconds} second${seconds > 1 ? 's' : ''}`;
    };

    const notifications = {
      coming_soon: {
        title: 'Sale Starting Soon!',
        message: `A buygroup sale for ${productName} is starting in ${timeRemaining ? formatTime(timeRemaining) : 'soon'}. Don't miss out!`,
        icon: '🎉',
      },
      started: {
        title: 'Sale Started!',
        message: `The buygroup sale for ${productName} has started. Limited stock available!`,
        icon: '🔥',
      },
      ending_soon: {
        title: 'Sale Ending Soon!',
        message: `The buygroup sale for ${productName} is ending in ${timeRemaining ? formatTime(timeRemaining) : 'soon'}. Get it now!`,
        icon: '⏰',
      },
    };

    const notification = notifications[saleType];

    // Send notification to users who haven't been notified recently
    for (const userId of usersToNotify) {
      try {
        await this.notificationService.createNotification({
          userId,
          type: 'BUYGROUP',
          title: notification.title,
          message: notification.message,
          data: {
            productId,
            productPriceId,
            productName,
            saleType,
            timeRemaining,
          },
          link: `/trending/${productId}`,
          icon: notification.icon,
        });
      } catch (error) {
      }
    }
  }
}
