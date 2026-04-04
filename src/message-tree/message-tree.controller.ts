import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '../guards/AuthGuard';
import { MessageTreeService } from './message-tree.service';

@ApiTags('message-tree')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard)
@Controller('message-tree')
export class MessageTreeController {
  constructor(private treeService: MessageTreeService) {}

  @Get('config')
  @ApiOperation({ summary: 'Get message tree configuration for current user role' })
  getConfig(@Req() req: any) {
    const userId = req.user?.id ?? req.user?.userId;
    const role = req.user?.tradeRole ?? 'BUYER';
    return this.treeService.getTreeConfig(role, userId);
  }
}
