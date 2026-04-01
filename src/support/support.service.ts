import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { SupportTrackingService } from './tracking/support-tracking.service';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
    private tracking: SupportTrackingService,
  ) {}

  // ─── Conversation Lifecycle ────────────────────────────────────

  /**
   * Start a new conversation (called from widget init).
   */
  async startConversation(contactId: number, metadata?: Record<string, any>) {
    // Check for existing active conversation
    const existing = await this.prisma.supportConversation.findFirst({
      where: {
        contactId,
        status: { in: ['bot', 'open', 'assigned', 'pending'] },
        deletedAt: null,
      },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 50 } },
    });

    if (existing) return existing;

    const conversation = await this.prisma.supportConversation.create({
      data: { contactId, metadata, status: 'bot' },
      include: { messages: true },
    });

    this.tracking.track('conversation_started', conversation.id, metadata, contactId);
    return conversation;
  }

  /**
   * Get conversation by ID (with messages).
   */
  async getConversation(conversationId: number) {
    return this.prisma.supportConversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        contact: { select: { id: true, firstName: true, lastName: true, email: true, tradeRole: true, profilePicture: true } },
        assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  /**
   * Get conversation history for a user.
   */
  async getConversationHistory(contactId: number) {
    return this.prisma.supportConversation.findMany({
      where: { contactId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
  }

  // ─── Messages ──────────────────────────────────────────────────

  /**
   * Add a customer message to a conversation.
   */
  async addCustomerMessage(
    conversationId: number,
    senderId: number,
    content: string,
    contentType = 'text',
    metadata?: any,
  ) {
    const message = await this.prisma.supportMessage.create({
      data: {
        conversationId,
        senderId,
        senderType: 'customer',
        content,
        contentType,
        metadata,
      },
    });

    await this.prisma.supportConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date(), humanMessagesCount: { increment: 1 } },
    });

    this.tracking.track('message_sent', conversationId, { contentType, senderType: 'customer' }, senderId);
    return message;
  }

  /**
   * Add a bot message.
   */
  async addBotMessage(
    conversationId: number,
    content: string,
    contentType = 'text',
    metadata?: any,
  ) {
    const message = await this.prisma.supportMessage.create({
      data: {
        conversationId,
        senderType: 'bot',
        content,
        contentType,
        metadata,
      },
    });

    await this.prisma.supportConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date(), botMessagesCount: { increment: 1 } },
    });

    this.tracking.track('bot_response', conversationId, { contentType });
    return message;
  }

  /**
   * Add an admin/agent message.
   */
  async addAdminMessage(
    conversationId: number,
    senderId: number,
    content: string,
    contentType = 'text',
    metadata?: any,
  ) {
    const conversation = await this.prisma.supportConversation.findUnique({
      where: { id: conversationId },
    });

    const message = await this.prisma.supportMessage.create({
      data: {
        conversationId,
        senderId,
        senderType: 'admin',
        content,
        contentType,
        metadata,
      },
    });

    // Track first response time
    const updateData: any = {
      updatedAt: new Date(),
      humanMessagesCount: { increment: 1 },
      status: 'assigned',
      assigneeId: senderId,
    };
    if (!conversation?.firstResponseAt) {
      updateData.firstResponseAt = new Date();
    }

    await this.prisma.supportConversation.update({
      where: { id: conversationId },
      data: updateData,
    });

    this.tracking.track('admin_response', conversationId, { contentType }, senderId);
    return message;
  }

  // ─── Escalation ────────────────────────────────────────────────

  /**
   * Escalate from bot to admin queue.
   */
  async escalate(conversationId: number, reason: string) {
    await this.prisma.supportConversation.update({
      where: { id: conversationId },
      data: {
        status: 'open',
        escalatedAt: new Date(),
        escalationReason: reason,
      },
    });

    this.tracking.track('escalated_to_admin', conversationId, { reason });
  }

  /**
   * Resolve a conversation.
   */
  async resolve(conversationId: number, adminId?: number) {
    await this.prisma.supportConversation.update({
      where: { id: conversationId },
      data: { status: 'resolved', resolvedAt: new Date() },
    });

    this.tracking.track('conversation_resolved', conversationId, {}, adminId);
  }

  // ─── Feedback ──────────────────────────────────────────────────

  /**
   * Save thumbs up/down on a bot message.
   */
  async saveFeedback(messageId: number, score: number) {
    await this.prisma.supportMessage.update({
      where: { id: messageId },
      data: { feedbackScore: score },
    });
  }

  /**
   * Save CSAT rating.
   */
  async saveCsat(conversationId: number, rating: number, comment?: string) {
    await this.prisma.supportConversation.update({
      where: { id: conversationId },
      data: { csatRating: rating, csatComment: comment },
    });

    this.tracking.track('csat_submitted', conversationId, { rating, comment });
  }

  // ─── Admin Queries ─────────────────────────────────────────────

  /**
   * List conversations for admin inbox (with filters).
   */
  async listConversations(filters: {
    status?: string;
    assigneeId?: number;
    topic?: string;
    priority?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, assigneeId, topic, priority, page = 1, limit = 20 } = filters;
    const where: any = { deletedAt: null };
    if (status && status !== 'all') where.status = status;
    if (assigneeId) where.assigneeId = assigneeId;
    if (topic) where.topic = topic;
    if (priority) where.priority = priority;

    const [conversations, total] = await this.prisma.$transaction([
      this.prisma.supportConversation.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        take: limit,
        skip: (page - 1) * limit,
        include: {
          contact: { select: { id: true, firstName: true, lastName: true, email: true, tradeRole: true } },
          assignee: { select: { id: true, firstName: true, lastName: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      }),
      this.prisma.supportConversation.count({ where }),
    ]);

    // Calculate unread count per conversation (messages after last admin reply)
    const enriched = await Promise.all(
      conversations.map(async (conv: any) => {
        const lastAdminMsg = await this.prisma.supportMessage.findFirst({
          where: { conversationId: conv.id, senderType: 'admin' },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });

        const unreadForAdmin = await this.prisma.supportMessage.count({
          where: {
            conversationId: conv.id,
            senderType: { in: ['customer', 'bot'] },
            ...(lastAdminMsg ? { createdAt: { gt: lastAdminMsg.createdAt } } : {}),
          },
        });

        return { ...conv, unreadForAdmin };
      }),
    );

    return { conversations: enriched, total, page, pages: Math.ceil(total / limit) };
  }

  /**
   * Dashboard KPIs for admin.
   */
  async getDashboardKpis() {
    const cacheKey = 'support:dashboard:kpis';
    return this.cache.getOrSet(cacheKey, async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [total, open, assigned, resolved, avgCsat, todayCount] = await this.prisma.$transaction([
        this.prisma.supportConversation.count({ where: { deletedAt: null } }),
        this.prisma.supportConversation.count({ where: { status: 'open', deletedAt: null } }),
        this.prisma.supportConversation.count({ where: { status: 'assigned', deletedAt: null } }),
        this.prisma.supportConversation.count({ where: { status: 'resolved', deletedAt: null } }),
        this.prisma.supportConversation.aggregate({ where: { csatRating: { not: null } }, _avg: { csatRating: true } }),
        this.prisma.supportConversation.count({ where: { createdAt: { gte: today }, deletedAt: null } }),
      ]);

      // Avg first response time (resolved conversations)
      const avgResponseTime = await this.prisma.$queryRaw<[{ avg_seconds: number }]>`
        SELECT AVG(EXTRACT(EPOCH FROM ("firstResponseAt" - "createdAt")))::int AS avg_seconds
        FROM support_conversation
        WHERE "firstResponseAt" IS NOT NULL AND "deletedAt" IS NULL
      `;

      return {
        total,
        open,
        assigned,
        resolved,
        todayCount,
        avgCsat: Math.round((avgCsat._avg.csatRating ?? 0) * 10) / 10,
        avgFirstResponseSeconds: avgResponseTime[0]?.avg_seconds ?? 0,
      };
    }, 30);
  }
}
