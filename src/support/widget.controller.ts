import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '../guards/AuthGuard';
import { SupportService } from './support.service';
import { BotService } from './bot/bot.service';
import { SelfLearningService } from './bot/self-learning.service';

@ApiTags('support-widget')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard)
@Controller('support/widget')
export class WidgetController {
  constructor(
    private supportService: SupportService,
    private botService: BotService,
    private selfLearning: SelfLearningService,
  ) {}

  /**
   * Initialize or resume a support conversation.
   */
  @Post('init')
  @HttpCode(200)
  @ApiOperation({ summary: 'Start or resume a support conversation' })
  async init(@Req() req: any, @Body() body: { metadata?: any; forceNew?: boolean }) {
    const userId = req.user?.id ?? req.user?.userId;
    const conversation = body.forceNew
      ? await this.supportService.createNewConversation(userId, body.metadata)
      : await this.supportService.startConversation(userId, body.metadata);

    // Get menu items for this user's role
    const tradeRole = req.user?.tradeRole ?? 'BUYER';
    const menuItems = this.botService.getMenuItems(tradeRole);

    return {
      conversationId: conversation.id,
      status: conversation.status,
      messages: conversation.messages ?? [],
      menuItems,
    };
  }

  /**
   * Send a text message from the customer.
   */
  @Post('message')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a message to the bot' })
  async sendMessage(
    @Req() req: any,
    @Body() body: {
      conversationId: number;
      content: string;
      contentType?: string;
      metadata?: any;
    },
  ) {
    const userId = req.user?.id ?? req.user?.userId;
    const tradeRole = req.user?.tradeRole ?? 'BUYER';
    const locale = body.metadata?.locale ?? 'en';

    // Save customer message
    const customerMessage = await this.supportService.addCustomerMessage(
      body.conversationId,
      userId,
      body.content,
      body.contentType ?? 'text',
      body.metadata,
    );

    // Check conversation status — if already escalated, don't process with bot
    const conversation = await this.supportService.getConversation(body.conversationId);
    if (conversation?.status === 'open' || conversation?.status === 'assigned') {
      return { customerMessage, botResponse: null, status: conversation.status };
    }

    // Bot processes the message
    const botResponse = await this.botService.processMessage(
      body.conversationId,
      body.content,
      {
        userId,
        tradeRole,
        locale,
        currentPage: body.metadata?.currentPage,
        conversationId: body.conversationId,
      },
    );

    return { customerMessage, botResponse, status: 'bot' };
  }

  /**
   * Handle a menu button click.
   */
  @Post('menu')
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle a menu item click' })
  async menuClick(
    @Req() req: any,
    @Body() body: { conversationId: number; menuId: string; locale?: string },
  ) {
    const userId = req.user?.id ?? req.user?.userId;
    const tradeRole = req.user?.tradeRole ?? 'BUYER';

    // Save the menu selection as a customer message
    await this.supportService.addCustomerMessage(
      body.conversationId,
      userId,
      body.menuId,
      'text',
    );

    const botResponse = await this.botService.handleMenuClick(
      body.conversationId,
      body.menuId,
      {
        userId,
        tradeRole,
        locale: body.locale ?? 'en',
        conversationId: body.conversationId,
      },
    );

    return { botResponse, status: botResponse.contentType === 'status' ? 'open' : 'bot' };
  }

  /**
   * Submit feedback on a bot message (thumbs up/down).
   */
  @Patch('feedback')
  @HttpCode(200)
  @ApiOperation({ summary: 'Submit feedback on a bot message' })
  async feedback(@Body() body: { messageId: number; positive: boolean }) {
    const score = body.positive ? 5 : 1;
    await this.supportService.saveFeedback(body.messageId, score);
    return { ok: true };
  }

  /**
   * Get conversation history for the current user.
   */
  @Get('history')
  @ApiOperation({ summary: 'Get conversation history' })
  async history(@Req() req: any, @Query('conversationId') conversationId?: string) {
    const userId = req.user?.id ?? req.user?.userId;

    if (conversationId) {
      return this.supportService.getConversation(parseInt(conversationId));
    }

    return this.supportService.getConversationHistory(userId);
  }
}
