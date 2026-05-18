/**
 * @file support.controller.ts
 * @description User-facing endpoints for the "Talk to admin" feature.
 *
 * Route prefix: /support/widget/*
 *
 * The frontend's existing `apis/requests/support.requests.ts` already
 * targets these URLs — wiring them here is what makes "user sends a
 * message" land in the admin Support Dashboard at /admin/support.
 *
 * Auth: regular AuthGuard (any signed-in user, including WAITING /
 * INACTIVE / REJECTed accounts — that's the point).
 */
import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../guards/AuthGuard';
import { SupportService } from './support.service';

@ApiTags('support')
@ApiBearerAuth('JWT-auth')
@Controller('support/widget')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  /**
   * Open or reuse the user's support conversation.
   * Body: { metadata?, forceNew?, topic? }
   */
  @UseGuards(AuthGuard)
  @Post('/init')
  async init(
    @Request() req: any,
    @Body() body: { metadata?: any; forceNew?: boolean; topic?: string } = {},
  ) {
    return this.supportService.initWidget(req.user.id, {
      metadata: body?.metadata,
      forceNew: !!body?.forceNew,
      topic: body?.topic,
    });
  }

  /**
   * Append a message from the user to an existing conversation.
   * Throttle prevents accidental spam from auto-retry loops.
   */
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseGuards(AuthGuard)
  @Post('/message')
  async sendMessage(
    @Request() req: any,
    @Body() body: { conversationId: number; content: string },
  ) {
    return this.supportService.sendMessage(
      req.user.id,
      Number(body?.conversationId),
      String(body?.content ?? ''),
    );
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @UseGuards(AuthGuard)
  @Post('/menu')
  async menu(
    @Request() req: any,
    @Body() body: { conversationId: number; menuId: string; locale?: string },
  ) {
    return this.supportService.handleMenuClick(
      req.user.id,
      Number(body?.conversationId),
      String(body?.menuId ?? ''),
      body?.locale,
    );
  }

  @UseGuards(AuthGuard)
  @Patch('/feedback')
  async feedback(
    @Request() req: any,
    @Body() body: { messageId: number; positive: boolean },
  ) {
    return this.supportService.submitFeedback(
      req.user.id,
      Number(body?.messageId),
      !!body?.positive,
    );
  }

  /**
   * Fetch full history. With no conversationId, returns the user's
   * most-recent non-resolved conversation (matches `init` reuse rule).
   */
  @UseGuards(AuthGuard)
  @Get('/history')
  async history(
    @Request() req: any,
    @Query('conversationId') conversationId?: string,
  ) {
    const id = conversationId ? Number(conversationId) : undefined;
    return this.supportService.getHistory(req.user.id, id);
  }
}
