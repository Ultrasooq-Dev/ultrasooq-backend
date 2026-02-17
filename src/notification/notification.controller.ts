import {
  Controller,
  Get,
  Put,
  Delete,
  UseGuards,
  Request,
  Query,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from 'src/guards/AuthGuard';
import { NotificationService } from './notification.service';

@ApiTags('notifications')
@ApiBearerAuth('JWT-auth')
@Controller('notification')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @UseGuards(AuthGuard)
  @Get()
  async getNotifications(
    @Request() req,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('type') type: string,
    @Query('read') read: string,
  ) {
    return this.notificationService.getNotifications(
      req,
      parseInt(page) || 1,
      parseInt(limit) || 10,
      type,
      read,
    );
  }

  @UseGuards(AuthGuard)
  @Get('/unread-count')
  async getUnreadCount(@Request() req) {
    return this.notificationService.getUnreadCount(req);
  }

  @UseGuards(AuthGuard)
  @Put('/:id/read')
  async markAsRead(@Request() req, @Param('id') id: string) {
    return this.notificationService.markAsRead(req, parseInt(id));
  }

  @UseGuards(AuthGuard)
  @Put('/read-all')
  async markAllAsRead(@Request() req) {
    return this.notificationService.markAllAsRead(req);
  }

  @UseGuards(AuthGuard)
  @Delete('/:id')
  async deleteNotification(@Request() req, @Param('id') id: string) {
    return this.notificationService.deleteNotification(req, parseInt(id));
  }

  @UseGuards(AuthGuard)
  @Delete()
  async deleteAllNotifications(@Request() req) {
    return this.notificationService.deleteAllNotifications(req);
  }
}

