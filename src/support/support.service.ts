/**
 * @file support.service.ts
 * @description User-facing support widget service. Writes into the same
 * SupportConversation/SupportMessage tables that the admin Support
 * Dashboard reads — so a message sent here shows up in /admin/support
 * immediately.
 *
 * Public methods mirror the three frontend `support.requests.ts` calls:
 *   - initWidget    -> open/find a conversation
 *   - sendMessage   -> append a user-side message to a conversation
 *   - getHistory    -> fetch full message history for a conversation
 */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type InitWidgetOpts = {
  metadata?: Record<string, any> | null;
  forceNew?: boolean;
  topic?: string;
};

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  private widgetPayload(conversation: any, messages: any[] = [], created = false) {
    return {
      conversationId: conversation.id,
      status: conversation.status,
      topic: conversation.topic,
      created,
      conversation,
      messages,
    };
  }

  /**
   * Open the support conversation for the given user. By default we
   * reuse the most-recent non-resolved conversation so the user keeps
   * a continuous thread. `forceNew: true` always creates a fresh one.
   */
  async initWidget(userId: string, opts: InitWidgetOpts = {}) {
    const userExists = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!userExists) throw new NotFoundException('User not found');

    if (!opts.forceNew) {
      const existing = await this.prisma.supportConversation.findFirst({
        where: {
          userId,
          deletedAt: null,
          status: { not: 'resolved' },
        },
        orderBy: { updatedAt: 'desc' },
        include: {
          assignee: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      });
      if (existing) {
        return {
          status: true,
          message: 'Existing conversation reused',
          ...this.widgetPayload(existing, [], false),
          data: this.widgetPayload(existing, [], false),
        };
      }
    }

    const conversation = await this.prisma.supportConversation.create({
      data: {
        userId,
        userEmail: userExists.email ?? null,
        topic: opts.topic ?? 'general',
        priority: 'normal',
        status: 'open',
      },
      include: {
        assignee: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    return {
      status: true,
      message: 'Conversation created',
      ...this.widgetPayload(conversation, [], true),
      data: this.widgetPayload(conversation, [], true),
    };
  }

  /**
   * Append a user-side message. Verifies the conversation belongs to
   * the caller so people can't post into someone else's ticket by id.
   * Bumps `updatedAt` so the conversation floats to the top of the
   * admin's inbox, and resets `isRead` to false so the unread chip
   * lights up again.
   */
  async sendMessage(userId: string, conversationId: number, content: string) {
    const text = (content ?? '').toString().trim();
    if (!text) throw new BadRequestException('Message content is required');
    if (!conversationId || Number.isNaN(conversationId)) {
      throw new BadRequestException('conversationId is required');
    }

    const conversation = await this.prisma.supportConversation.findUnique({
      where: { id: conversationId },
      select: { id: true, userId: true, deletedAt: true, status: true },
    });
    if (!conversation || conversation.deletedAt) {
      throw new NotFoundException('Conversation not found');
    }
    if (conversation.userId !== userId) {
      throw new ForbiddenException('Not your conversation');
    }

    const message = await this.prisma.supportMessage.create({
      data: {
        conversationId,
        senderId: userId,
        senderType: 'user',
        content: text,
      },
    });

    // If admin had marked it resolved, reopen on new user message.
    const nextStatus =
      conversation.status === 'resolved' ? 'open' : conversation.status;

    await this.prisma.supportConversation.update({
      where: { id: conversationId },
      data: {
        isRead: false,
        status: nextStatus,
        updatedAt: new Date(),
      },
    });

    return { status: true, message: 'Sent', data: message };
  }

  /**
   * Fetch the message history for a conversation the caller owns.
   * If conversationId is omitted, falls back to the user's most-recent
   * non-resolved conversation (matches initWidget's reuse rule).
   */
  async getHistory(userId: string, conversationId?: number) {
    const target = conversationId
      ? await this.prisma.supportConversation.findUnique({
          where: { id: conversationId },
          select: { id: true, userId: true, deletedAt: true },
        })
      : await this.prisma.supportConversation.findFirst({
          where: {
            userId,
            deletedAt: null,
            status: { not: 'resolved' },
          },
          orderBy: { updatedAt: 'desc' },
          select: { id: true, userId: true, deletedAt: true },
        });

    if (!target || target.deletedAt) {
      return { status: true, message: 'No conversation yet', data: { conversation: null, messages: [] } };
    }
    if (target.userId !== userId) {
      throw new ForbiddenException('Not your conversation');
    }

    const [conversation, messages] = await Promise.all([
      this.prisma.supportConversation.findUnique({
        where: { id: target.id },
        include: {
          assignee: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.supportMessage.findMany({
        where: { conversationId: target.id },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (!conversation) {
      return { status: true, message: 'No conversation yet', data: { conversation: null, messages: [] } };
    }

    return {
      status: true,
      message: 'Fetched',
      ...this.widgetPayload(conversation, messages, false),
      data: { conversation, messages },
    };
  }

  async handleMenuClick(userId: string, conversationId: number, menuId: string, locale?: string) {
    const labels: Record<string, string> = {
      escalate: locale === 'ar' ? 'التحدث مع الدعم' : 'Talk to support',
      product_search: locale === 'ar' ? 'البحث عن منتج' : 'Product search',
      order_tracker: locale === 'ar' ? 'تتبع الطلب' : 'Order tracker',
      faq: locale === 'ar' ? 'الأسئلة الشائعة' : 'FAQ',
    };

    await this.sendMessage(userId, conversationId, labels[menuId] ?? menuId);

    return {
      status: true,
      message: 'Menu action recorded',
      botResponse: {
        content:
          locale === 'ar'
            ? 'تم إرسال طلبك إلى فريق الدعم.'
            : 'Your request has been sent to support.',
        contentType: 'status',
      },
    };
  }

  async submitFeedback(userId: string, messageId: number, positive: boolean) {
    if (!messageId || Number.isNaN(messageId)) {
      throw new BadRequestException('messageId is required');
    }

    const message = await this.prisma.supportMessage.findFirst({
      where: {
        id: messageId,
        conversation: { userId, deletedAt: null },
      },
      select: { id: true },
    });
    if (!message) throw new NotFoundException('Message not found');

    return {
      status: true,
      message: 'Feedback received',
      data: { messageId, positive },
    };
  }
}
