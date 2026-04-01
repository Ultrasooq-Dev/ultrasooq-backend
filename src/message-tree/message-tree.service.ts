import { Injectable } from '@nestjs/common';

/**
 * Tree node definition sent to frontend.
 * The frontend DynamicTree component uses this to render + lazy-load children.
 */
export interface TreeNodeConfig {
  id: string;
  label: string;
  labelAr: string;
  icon?: string;          // lucide icon name
  color?: string;         // tailwind color class
  type: 'category' | 'data' | 'person' | 'action';
  childrenEndpoint?: string;   // API to call for children (lazy load)
  childrenParams?: Record<string, any>;
  action?: {
    type: 'expand' | 'navigate' | 'open_chat' | 'open_review' | 'open_support';
    url?: string;
    roomId?: number;
    chatType?: 'support' | 'room';
    context?: Record<string, any>;
  };
  defaultExpanded?: boolean;
  roles?: string[];       // filter by role
  badge?: string;
  children?: TreeNodeConfig[];  // static children (no lazy load needed)
}

@Injectable()
export class MessageTreeService {
  /**
   * Build the tree configuration for a given user role.
   * This returns the STRUCTURE — not the data.
   * Each node with childrenEndpoint will be lazy-loaded by the frontend.
   */
  getTreeConfig(role: string, userId: number): TreeNodeConfig[] {
    const isSeller = role === 'COMPANY' || role === 'FREELANCER';
    const isBuyer = role === 'BUYER';
    const isAdmin = role === 'MEMBER' || role === 'ADMINMEMBER';

    const nodes: TreeNodeConfig[] = [];

    // ── Unread Messages (always first) ──
    nodes.push({
      id: 'unread',
      label: 'Unread Messages',
      labelAr: 'رسائل غير مقروءة',
      icon: 'Bell',
      color: 'text-red-500',
      type: 'category',
      childrenEndpoint: '/message-tree/unread',
      action: { type: 'expand' },
    });

    // ── Admin & Support ──
    nodes.push({
      id: 'support',
      label: 'Admin & Support',
      labelAr: 'الدعم والإدارة',
      icon: 'Shield',
      color: 'text-green-600',
      type: 'category',
      children: [
        { id: 'support.bot', label: 'Bot Support', labelAr: 'دعم المساعد', icon: 'MessageSquare', type: 'category', childrenEndpoint: '/support/widget/history', action: { type: 'expand' } },
        { id: 'support.admin', label: 'Admin Support', labelAr: 'دعم الإدارة', icon: 'Shield', type: 'category', childrenEndpoint: '/support/widget/history', action: { type: 'expand' } },
        { id: 'support.notifications', label: 'Notifications', labelAr: 'الإشعارات', icon: 'Bell', type: 'category', childrenEndpoint: '/notification', action: { type: 'expand' } },
      ],
    });

    // ── Vendor Operations (sellers only) ──
    if (isSeller) {
      nodes.push({
        id: 'vendor_ops',
        label: 'Vendor Operations',
        labelAr: 'عمليات البائع',
        icon: 'Store',
        color: 'text-orange-600',
        type: 'category',
        children: [
          {
            id: 'vendor_ops.questions', label: 'Questions & Comments', labelAr: 'أسئلة وتعليقات', icon: 'MessagesSquare', type: 'category',
            childrenEndpoint: '/chat/products/messages',
            childrenParams: { sellerId: userId },
            action: { type: 'expand' },
          },
          {
            id: 'vendor_ops.reviews', label: 'Rate & Review', labelAr: 'التقييمات', icon: 'Star', type: 'category',
            childrenEndpoint: `/product/getAllProductPriceReviewBySellerId`,
            childrenParams: { sellerId: userId },
            action: { type: 'expand' },
          },
          {
            id: 'vendor_ops.complaints', label: 'Complaints', labelAr: 'الشكاوى', icon: 'AlertTriangle', type: 'category',
            childrenEndpoint: '/admin/support/conversations',
            childrenParams: { topic: 'complaint' },
            action: { type: 'expand' },
          },
          {
            id: 'vendor_ops.rfq', label: 'RFQ', labelAr: 'طلبات الأسعار', icon: 'FileText', type: 'category',
            childrenEndpoint: `/product/getAllRfqQuotesUsersBySellerID`,
            action: { type: 'expand' },
          },
          {
            id: 'vendor_ops.product', label: 'Product', labelAr: 'المنتجات', icon: 'ShoppingBag', type: 'category',
            childrenEndpoint: '/chat/products/messages',
            childrenParams: { sellerId: userId },
            action: { type: 'expand' },
          },
          {
            id: 'vendor_ops.service', label: 'Service', labelAr: 'الخدمات', icon: 'Wrench', type: 'category',
            childrenEndpoint: '/service/getAllServiceBySeller',
            action: { type: 'expand' },
          },
          {
            id: 'vendor_ops.buygroup', label: 'Buy Group', labelAr: 'مجموعات الشراء', icon: 'ShoppingCart', type: 'category',
            childrenEndpoint: '/product/getAllBuyGroupProduct',
            childrenParams: { sellerId: userId },
            action: { type: 'expand' },
          },
          {
            id: 'vendor_ops.dropship', label: 'Dropship', labelAr: 'دروبشيب', icon: 'Truck', type: 'category',
            childrenEndpoint: '/external-dropship/stores/list',
            action: { type: 'expand' },
          },
        ],
      });
    }

    // ── Customer Operations ──
    nodes.push({
      id: 'customer_ops',
      label: isSeller ? 'Customer Operations' : 'My Shopping',
      labelAr: isSeller ? 'عمليات العملاء' : 'مشترياتي',
      icon: 'UserCheck',
      color: 'text-blue-600',
      type: 'category',
      children: [
        {
          id: 'customer_ops.questions', label: 'Questions & Comments', labelAr: 'أسئلة وتعليقات', icon: 'MessagesSquare', type: 'category',
          childrenEndpoint: isBuyer ? '/product/getAllQuestion' : '/chat/products/messages',
          childrenParams: isBuyer ? { userId } : { sellerId: userId },
          action: { type: 'expand' },
        },
        {
          id: 'customer_ops.reviews', label: 'Rate & Review', labelAr: 'التقييمات', icon: 'Star', type: 'category',
          childrenEndpoint: '/product/getAllProductReview',
          childrenParams: isBuyer ? { userId } : { sellerId: userId },
          action: { type: 'expand' },
        },
        {
          id: 'customer_ops.complaints', label: 'Complaints', labelAr: 'الشكاوى', icon: 'AlertTriangle', type: 'category',
          childrenEndpoint: '/admin/support/conversations',
          childrenParams: { topic: 'complaint' },
          action: { type: 'expand' },
        },
        {
          id: 'customer_ops.rfq', label: 'RFQ', labelAr: 'طلبات الأسعار', icon: 'FileText', type: 'category',
          childrenEndpoint: isBuyer ? '/product/getAllRfqQuotesByBuyerID' : '/product/getAllRfqQuotesUsersBySellerID',
          action: { type: 'expand' },
        },
        {
          id: 'customer_ops.product', label: 'Product', labelAr: 'المنتجات', icon: 'ShoppingBag', type: 'category',
          childrenEndpoint: '/chat/products/messages',
          childrenParams: isBuyer ? {} : { sellerId: userId },
          action: { type: 'expand' },
        },
        {
          id: 'customer_ops.service', label: 'Service', labelAr: 'الخدمات', icon: 'Wrench', type: 'category',
          childrenEndpoint: '/service/list',
          action: { type: 'expand' },
        },
        {
          id: 'customer_ops.buygroup', label: 'Buy Group', labelAr: 'مجموعات الشراء', icon: 'ShoppingCart', type: 'category',
          childrenEndpoint: '/product/getAllBuyGroupProduct',
          action: { type: 'expand' },
        },
      ],
    });

    // ── Order Operations ──
    nodes.push({
      id: 'order_ops',
      label: 'Order Operations',
      labelAr: 'عمليات الطلبات',
      icon: 'Package',
      color: 'text-purple-600',
      type: 'category',
      children: [
        {
          id: 'order_ops.active', label: 'Active Orders', labelAr: 'الطلبات النشطة', icon: 'Package', type: 'category',
          childrenEndpoint: isSeller ? '/order/getAllOrderProductBySellerId' : '/order/getAllOrderByUserId',
          childrenParams: { status: 'ACTIVE' },
          action: { type: 'expand' },
        },
        {
          id: 'order_ops.shipping', label: 'Shipping & Delivery', labelAr: 'الشحن والتوصيل', icon: 'Truck', type: 'category',
          childrenEndpoint: isSeller ? '/order/getAllOrderProductBySellerId' : '/order/getAllOrderByUserId',
          childrenParams: { orderProductStatus: 'SHIPPED' },
          action: { type: 'expand' },
        },
        {
          id: 'order_ops.returns', label: 'Returns & Refunds', labelAr: 'الإرجاع والاسترداد', icon: 'RotateCcw', type: 'category',
          childrenEndpoint: isSeller ? '/order/getAllOrderProductBySellerId' : '/order/getAllOrderByUserId',
          childrenParams: { orderProductStatus: 'CANCELLED' },
          action: { type: 'expand' },
        },
        {
          id: 'order_ops.disputes', label: 'Disputes', labelAr: 'النزاعات', icon: 'Scale', type: 'category',
          childrenEndpoint: '/admin/support/conversations',
          childrenParams: { topic: 'dispute' },
          action: { type: 'expand' },
        },
      ],
    });

    // ── Payment & Wallet ──
    nodes.push({
      id: 'payment',
      label: 'Payment & Wallet',
      labelAr: 'الدفع والمحفظة',
      icon: 'CreditCard',
      color: 'text-emerald-600',
      type: 'category',
      children: [
        { id: 'payment.issues', label: 'Payment Issues', labelAr: 'مشاكل الدفع', icon: 'CreditCard', type: 'category', action: { type: 'open_support', context: { topic: 'payment' } } },
        { id: 'payment.wallet', label: 'Wallet', labelAr: 'المحفظة', icon: 'Wallet', type: 'category', childrenEndpoint: '/wallet/transactions', action: { type: 'expand' } },
        { id: 'payment.invoices', label: 'Invoices', labelAr: 'الفواتير', icon: 'Receipt', type: 'category', action: { type: 'navigate', url: '/transactions' } },
      ],
    });

    // ── Team (sellers only) ──
    if (isSeller) {
      nodes.push({
        id: 'team',
        label: 'Team',
        labelAr: 'الفريق',
        icon: 'Users',
        color: 'text-cyan-600',
        type: 'category',
        children: [
          {
            id: 'team.chat', label: 'Team Chat', labelAr: 'محادثة الفريق', icon: 'MessagesSquare', type: 'category',
            childrenEndpoint: '/team-member/getAllTeamMember',
            action: { type: 'expand' },
          },
          { id: 'team.notes', label: 'Internal Notes', labelAr: 'ملاحظات داخلية', icon: 'StickyNote', type: 'category', action: { type: 'navigate', url: '/team-members' } },
        ],
      });
    }

    return nodes;
  }
}
