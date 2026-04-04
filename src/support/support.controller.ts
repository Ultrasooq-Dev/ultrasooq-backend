import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SuperAdminAuthGuard } from '../guards/SuperAdminAuthGuard';
import { SupportService } from './support.service';
import { SelfLearningService } from './bot/self-learning.service';
import { SupportTrackingService } from './tracking/support-tracking.service';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('admin-support')
@ApiBearerAuth('JWT-auth')
@UseGuards(SuperAdminAuthGuard)
@Controller('admin/support')
export class SupportController {
  constructor(
    private supportService: SupportService,
    private selfLearning: SelfLearningService,
    private tracking: SupportTrackingService,
    private prisma: PrismaService,
  ) {}

  // ─── Conversations ─────────────────────────────────────────────

  @Get('conversations')
  @ApiOperation({ summary: 'List support conversations (admin inbox)' })
  async listConversations(
    @Query('status') status = 'all',
    @Query('topic') topic?: string,
    @Query('priority') priority?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.supportService.listConversations({
      status,
      topic,
      priority,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 50),
    });
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get conversation detail with messages' })
  async getConversation(@Param('id', ParseIntPipe) id: number) {
    return this.supportService.getConversation(id);
  }

  @Post('conversations/:id/reply')
  @ApiOperation({ summary: 'Admin sends a reply to a conversation' })
  async reply(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
    @Body() body: { content: string; contentType?: string; metadata?: any },
  ) {
    const adminId = req.user?.id ?? req.user?.userId;
    const message = await this.supportService.addAdminMessage(
      id,
      adminId,
      body.content,
      body.contentType ?? 'text',
      body.metadata,
    );

    // Self-learning: find the customer's last question and learn from admin's answer
    const conversation = await this.supportService.getConversation(id);
    if (conversation?.messages) {
      const customerMessages = conversation.messages
        .filter((m) => m.senderType === 'customer' && m.contentType === 'text')
        .reverse();
      if (customerMessages.length > 0) {
        const lastQuestion = customerMessages[0].content;
        await this.selfLearning.learnFromAdmin(
          lastQuestion,
          body.content,
          conversation.topic ?? undefined,
          'en',
          adminId,
        );
      }
    }

    return message;
  }

  @Patch('conversations/:id/assign')
  @ApiOperation({ summary: 'Assign conversation to an agent' })
  async assign(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { assigneeId: number },
    @Req() req: any,
  ) {
    const adminId = req.user?.id ?? req.user?.userId;
    const result = await this.prisma.supportConversation.update({
      where: { id },
      data: { assigneeId: body.assigneeId, status: 'assigned' },
    });
    this.tracking.track('conversation_assigned', id, { assigneeId: body.assigneeId }, adminId);
    return result;
  }

  @Patch('conversations/:id/resolve')
  @ApiOperation({ summary: 'Resolve a conversation' })
  async resolve(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const adminId = req.user?.id ?? req.user?.userId;
    await this.supportService.resolve(id, adminId);
    return { ok: true };
  }

  @Patch('conversations/:id/read')
  @ApiOperation({ summary: 'Mark conversation as read by admin (resets unread count)' })
  async markRead(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const adminId = req.user?.id ?? req.user?.userId;
    // Insert a silent admin "read" marker — this makes unreadForAdmin = 0
    // because the count is "messages after last admin message"
    await this.prisma.supportMessage.create({
      data: {
        conversationId: id,
        senderType: 'admin',
        senderId: adminId,
        content: '',
        contentType: 'status',
        status: 'read',
      },
    });
    this.tracking.track('conversation_read', id, {}, adminId);
    return { ok: true };
  }

  @Patch('conversations/:id/priority')
  @ApiOperation({ summary: 'Change conversation priority' })
  async setPriority(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { priority: string },
    @Req() req: any,
  ) {
    const adminId = req.user?.id ?? req.user?.userId;
    const result = await this.prisma.supportConversation.update({
      where: { id },
      data: { priority: body.priority },
    });
    this.tracking.track('priority_changed', id, { priority: body.priority }, adminId);
    return result;
  }

  // ─── Dashboard ─────────────────────────────────────────────────

  @Get('dashboard')
  @ApiOperation({ summary: 'Support dashboard KPIs' })
  async dashboard() {
    return this.supportService.getDashboardKpis();
  }

  // ─── Knowledge Base ────────────────────────────────────────────

  @Get('knowledge-base')
  @ApiOperation({ summary: 'List knowledge base articles' })
  async listKB(
    @Query('category') category?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const where: any = { status: 'active' };
    if (category) where.category = category;
    const p = parseInt(page);
    const l = Math.min(parseInt(limit), 50);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.knowledgeBase.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: l,
        skip: (p - 1) * l,
      }),
      this.prisma.knowledgeBase.count({ where }),
    ]);

    return { items, total, page: p, pages: Math.ceil(total / l) };
  }

  @Post('knowledge-base')
  @ApiOperation({ summary: 'Create or update a KB article' })
  async upsertKB(
    @Req() req: any,
    @Body() body: {
      id?: number;
      shortCode: string;
      title: string;
      content: string;
      category: string;
      tags?: string[];
      locale?: string;
    },
  ) {
    const adminId = req.user?.id ?? req.user?.userId;
    if (body.id) {
      return this.prisma.knowledgeBase.update({
        where: { id: body.id },
        data: { ...body, createdBy: adminId },
      });
    }
    return this.prisma.knowledgeBase.create({
      data: {
        shortCode: body.shortCode,
        title: body.title,
        content: body.content,
        category: body.category,
        tags: body.tags ?? [],
        locale: body.locale ?? 'en',
        createdBy: adminId,
      },
    });
  }

  // ─── Bot Learning ──────────────────────────────────────────────

  @Get('learning')
  @ApiOperation({ summary: 'List bot learned answers' })
  async listLearning(
    @Query('status') status = 'all',
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.selfLearning.listLearnings({
      status,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 50),
    });
  }

  @Patch('learning/:id')
  @ApiOperation({ summary: 'Edit a learned answer' })
  async updateLearning(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { answer?: string; topic?: string; status?: string; confidence?: number },
  ) {
    return this.selfLearning.updateLearning(id, body);
  }

  // ─── Canned Responses ──────────────────────────────────────────

  @Get('canned-responses')
  @ApiOperation({ summary: 'List canned responses for agents' })
  async listCanned() {
    return this.prisma.cannedResponse.findMany({ orderBy: { shortCode: 'asc' } });
  }

  @Post('canned-responses')
  @ApiOperation({ summary: 'Create a canned response' })
  async createCanned(
    @Req() req: any,
    @Body() body: { shortCode: string; title: string; content: string; category?: string; locale?: string },
  ) {
    const adminId = req.user?.id ?? req.user?.userId;
    return this.prisma.cannedResponse.create({
      data: { ...body, createdBy: adminId },
    });
  }

  // ─── Tracking / Analytics ──────────────────────────────────────

  @Get('events')
  @ApiOperation({ summary: 'Support event counts for analytics' })
  async eventCounts(@Query('days') days = '7') {
    const since = new Date(Date.now() - parseInt(days) * 86400000);
    const [eventCounts, hourlyVolume] = await Promise.all([
      this.tracking.getEventCounts(since),
      this.tracking.getHourlyVolume(since),
    ]);
    return {
      eventCounts: (eventCounts as any[]).map((e) => ({ type: e.eventType, count: Number(e.count) })),
      hourlyVolume: (hourlyVolume as any[]).map((h) => ({ hour: h.hour, count: Number(h.count) })),
    };
  }
}
