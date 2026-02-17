/**
 * Notification Helper
 * 
 * This file provides helper functions and examples for creating notifications
 * from various services in the application.
 */

import { NotificationService } from './notification.service';

export enum NotificationType {
  ORDER = 'ORDER',
  MESSAGE = 'MESSAGE',
  RFQ = 'RFQ',
  REVIEW = 'REVIEW',
  SYSTEM = 'SYSTEM',
  PAYMENT = 'PAYMENT',
  SHIPMENT = 'SHIPMENT',
  ACCOUNT = 'ACCOUNT',
  PRODUCT = 'PRODUCT',
  BUYGROUP = 'BUYGROUP',
  STOCK = 'STOCK',
  PRICE = 'PRICE',
}

/**
 * Helper function to create order notifications
 */
export async function notifyOrderStatusChange(
  notificationService: NotificationService,
  userId: number,
  orderNumber: string,
  orderId: number,
  status: string,
  isSeller: boolean = false,
) {
  const title = isSeller
    ? 'Order Status Updated'
    : 'Your Order Status Updated';
  const message = isSeller
    ? `Order #${orderNumber} status changed to ${status}`
    : `Your order #${orderNumber} status changed to ${status}`;
  const link = isSeller ? `/orders/${orderId}` : `/my-orders/${orderId}`;

  return notificationService.createNotification({
    userId,
    type: NotificationType.ORDER,
    title,
    message,
    data: { orderId, orderNumber, status },
    link,
    icon: 'order',
  });
}

/**
 * Helper function to create message notifications
 */
export async function notifyNewMessage(
  notificationService: NotificationService,
  userId: number,
  senderName: string,
  messageId: number,
  roomId: number,
  productId?: number,
) {
  const link = productId
    ? `/trending/${productId}?chat=true`
    : `/chat?room=${roomId}`;

  return notificationService.createNotification({
    userId,
    type: NotificationType.MESSAGE,
    title: 'New Message',
    message: `You have a new message from ${senderName}`,
    data: { messageId, roomId, productId },
    link,
    icon: 'message',
  });
}

/**
 * Helper function to create RFQ notifications
 */
export async function notifyNewRFQQuote(
  notificationService: NotificationService,
  userId: number,
  rfqId: number,
  quoteId: number,
  sellerName: string,
) {
  return notificationService.createNotification({
    userId,
    type: NotificationType.RFQ,
    title: 'New Quote Received',
    message: `You have received a new quote from ${sellerName}`,
    data: { rfqId, quoteId },
    link: `/rfq/${rfqId}`,
    icon: 'rfq',
  });
}

/**
 * Helper function to create review notifications
 */
export async function notifyNewReview(
  notificationService: NotificationService,
  userId: number,
  productName: string,
  reviewId: number,
  productId: number,
) {
  return notificationService.createNotification({
    userId,
    type: NotificationType.REVIEW,
    title: 'New Review',
    message: `Your product "${productName}" received a new review`,
    data: { reviewId, productId },
    link: `/trending/${productId}`,
    icon: 'review',
  });
}

/**
 * Helper function to create payment notifications
 */
export async function notifyPaymentReceived(
  notificationService: NotificationService,
  userId: number,
  amount: number,
  orderId: number,
) {
  return notificationService.createNotification({
    userId,
    type: NotificationType.PAYMENT,
    title: 'Payment Received',
    message: `Payment of $${amount} received for order #${orderId}`,
    data: { orderId, amount },
    link: `/orders/${orderId}`,
    icon: 'payment',
  });
}

/**
 * Helper function to create shipment notifications
 */
export async function notifyShipmentUpdate(
  notificationService: NotificationService,
  userId: number,
  orderNumber: string,
  orderId: number,
  trackingNumber?: string,
) {
  const message = trackingNumber
    ? `Your order #${orderNumber} has been shipped. Tracking: ${trackingNumber}`
    : `Your order #${orderNumber} has been shipped`;

  return notificationService.createNotification({
    userId,
    type: NotificationType.SHIPMENT,
    title: 'Order Shipped',
    message,
    data: { orderId, orderNumber, trackingNumber },
    link: `/my-orders/${orderId}`,
    icon: 'shipment',
  });
}

/**
 * Helper function to create system notifications
 */
export async function notifySystemEvent(
  notificationService: NotificationService,
  userId: number,
  title: string,
  message: string,
  link?: string,
) {
  return notificationService.createNotification({
    userId,
    type: NotificationType.SYSTEM,
    title,
    message,
    link,
    icon: 'system',
  });
}

/**
 * Helper function to create stock notifications
 */
export async function notifyStockChange(
  notificationService: NotificationService,
  userId: number,
  productName: string,
  productId: number,
  productPriceId: number,
  stockLevel: number,
  changeType: 'out_of_stock' | 'back_in_stock' | 'low_stock',
) {
  const notifications = {
    out_of_stock: {
      title: 'Product Out of Stock',
      message: `${productName} is now out of stock. We'll notify you when it's back!`,
      icon: '📦',
    },
    back_in_stock: {
      title: 'Product Back in Stock',
      message: `Great news! ${productName} is back in stock. Order now!`,
      icon: '✅',
    },
    low_stock: {
      title: 'Low Stock Alert',
      message: `${productName} is running low on stock. Only ${stockLevel} left!`,
      icon: '⚠️',
    },
  };

  const notification = notifications[changeType];

  return notificationService.createNotification({
    userId,
    type: NotificationType.STOCK,
    title: notification.title,
    message: notification.message,
    data: {
      productId,
      productPriceId,
      productName,
      stockLevel,
      changeType,
    },
    link: `/trending/${productId}`,
    icon: notification.icon,
  });
}

/**
 * Helper function to create price change notifications
 */
export async function notifyPriceChange(
  notificationService: NotificationService,
  userId: number,
  productName: string,
  productId: number,
  productPriceId: number,
  oldPrice: number,
  newPrice: number,
  currency: string = 'USD',
) {
  const isPriceDrop = newPrice < oldPrice;
  const title = isPriceDrop ? 'Price Drop!' : 'Price Changed';
  const message = isPriceDrop
    ? `Great news! The price of ${productName} has dropped to ${currency} ${newPrice}`
    : `The price of ${productName} has changed from ${currency} ${oldPrice} to ${currency} ${newPrice}`;
  const icon = isPriceDrop ? '💰' : '📊';

  return notificationService.createNotification({
    userId,
    type: NotificationType.PRICE,
    title,
    message,
    data: {
      productId,
      productPriceId,
      productName,
      oldPrice,
      newPrice,
      currency,
      isPriceDrop,
    },
    link: `/trending/${productId}`,
    icon,
  });
}

/**
 * Helper function to create buygroup sale notifications
 */
export async function notifyBuygroupSale(
  notificationService: NotificationService,
  userId: number,
  productName: string,
  productId: number,
  productPriceId: number,
  saleType: 'coming_soon' | 'started' | 'ending_soon',
  timeRemaining?: number,
) {
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

  return notificationService.createNotification({
    userId,
    type: NotificationType.BUYGROUP,
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
}

/**
 * Helper function to create RFQ quote status notifications
 */
export async function notifyRfqQuoteStatus(
  notificationService: NotificationService,
  userId: number,
  rfqId: number,
  status: 'submitted' | 'accepted' | 'rejected',
) {
  const notifications = {
    submitted: {
      title: 'RFQ Quote Submitted',
      message: 'Your RFQ quote has been submitted successfully',
      icon: '📝',
    },
    accepted: {
      title: 'RFQ Quote Accepted',
      message: 'Your RFQ quote has been accepted by the buyer',
      icon: '✅',
    },
    rejected: {
      title: 'RFQ Quote Rejected',
      message: 'Your RFQ quote has been rejected',
      icon: '❌',
    },
  };

  const notification = notifications[status];

  return notificationService.createNotification({
    userId,
    type: NotificationType.RFQ,
    title: notification.title,
    message: notification.message,
    data: { rfqId, status },
    link: `/rfq-quotes`,
    icon: notification.icon,
  });
}

/**
 * Admin Notification Helper Functions
 * These functions notify all admin users about platform events
 */

import { PrismaService } from '../prisma/prisma.service';

/**
 * Get all admin user IDs
 */
async function getAllAdminUserIds(prisma: PrismaService): Promise<number[]> {
  const admins = await prisma.user.findMany({
    where: {
      userType: 'ADMIN',
      status: 'ACTIVE',
    },
    select: {
      id: true,
    },
  });
  return admins.map((admin) => admin.id);
}

/**
 * Notify all admins about a new product
 */
export async function notifyAdminsNewProduct(
  notificationService: NotificationService,
  productId: number,
  productName: string,
  userId: number,
  prisma: PrismaService,
) {
  try {
    const adminIds = await getAllAdminUserIds(prisma);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        companyName: true,
        email: true,
      },
    });

    const userName = user?.companyName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Unknown';

    for (const adminId of adminIds) {
      await notificationService.createNotification({
        userId: adminId,
        type: NotificationType.PRODUCT,
        title: 'New Product Added',
        message: `A new product "${productName}" has been added by ${userName}`,
        data: { productId, productName, userId, userName },
        link: `/user/products/${productId}`,
        icon: '📦',
      });
    }
  } catch (error) {
  }
}

/**
 * Notify all admins about a new user registration
 */
export async function notifyAdminsNewUser(
  notificationService: NotificationService,
  userId: number,
  userName: string,
  email: string,
  tradeRole: string,
  prisma: PrismaService,
) {
  try {
    const adminIds = await getAllAdminUserIds(prisma);

    for (const adminId of adminIds) {
      await notificationService.createNotification({
        userId: adminId,
        type: NotificationType.ACCOUNT,
        title: 'New User Registered',
        message: `A new ${tradeRole} user "${userName}" (${email}) has registered`,
        data: { userId, userName, email, tradeRole },
        link: `/user/user-lists`,
        icon: '👤',
      });
    }
  } catch (error) {
  }
}

/**
 * Notify all admins about identity proof upload
 */
export async function notifyAdminsIdentityProofUpload(
  notificationService: NotificationService,
  userId: number,
  userName: string,
  prisma: PrismaService,
) {
  try {
    const adminIds = await getAllAdminUserIds(prisma);

    for (const adminId of adminIds) {
      await notificationService.createNotification({
        userId: adminId,
        type: NotificationType.ACCOUNT,
        title: 'Identity Proof Uploaded',
        message: `User "${userName}" has uploaded their identity proof for verification`,
        data: { userId, userName },
        link: `/user/user-lists`,
        icon: '🆔',
      });
    }
  } catch (error) {
  }
}

/**
 * Notify all admins about a new dropshipable product
 */
export async function notifyAdminsDropshipableProduct(
  notificationService: NotificationService,
  productId: number,
  productName: string,
  userId: number,
  prisma: PrismaService,
) {
  try {
    const adminIds = await getAllAdminUserIds(prisma);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true,
        lastName: true,
        companyName: true,
      },
    });

    const userName = user?.companyName || `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Unknown';

    for (const adminId of adminIds) {
      await notificationService.createNotification({
        userId: adminId,
        type: NotificationType.PRODUCT,
        title: 'New Dropshipable Product Added',
        message: `A new dropshipable product "${productName}" has been added by ${userName}`,
        data: { productId, productName, userId, userName },
        link: `/user/products/${productId}`,
        icon: '🚚',
      });
    }
  } catch (error) {
  }
}

