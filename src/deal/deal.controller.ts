/**
 * @module DealController
 * @description REST API for Deal Operations (ادارة الصفقات)
 *   Unified endpoints for BuyGroup, Dropship, Service, and Retail deals
 *
 * All endpoints are vendor-protected via AuthGuard.
 * Vendor context resolved via req.user → helperService.getAdminId()
 *
 * @route /api/v1/deal
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Query,
  Body,
  Param,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '../guards/AuthGuard';
import { DealService } from './deal.service';
import {
  DealListQueryDto,
  ExtendDealDto,
  AcceptDealDto,
  CancelDealDto,
  NotifyBuyersDto,
  CancelOrderDto,
} from './dto/deal.dto';

@ApiTags('deal')
@ApiBearerAuth()
@Controller('deal')
@UseGuards(AuthGuard)
export class DealController {
  constructor(private readonly dealService: DealService) {}

  // ─── Stats ─────────────────────────────────────────────────

  @Get('/stats')
  @ApiOperation({ summary: 'Get deal statistics for vendor dashboard' })
  async getStats(@Request() req: any) {
    return this.dealService.getDealStats(req);
  }

  // ─── List Deals ────────────────────────────────────────────

  @Get('/list')
  @ApiOperation({ summary: 'List all deals with filtering and pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'dealType', required: false, enum: ['ALL', 'BUYGROUP', 'WHOLESALE_PRODUCT', 'SERVICE', 'NORMALSELL'] })
  @ApiQuery({ name: 'status', required: false, enum: ['all', 'ACTIVE', 'THRESHOLD_MET', 'EXPIRED', 'COMPLETED', 'CANCELLED'] })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'sort', required: false, enum: ['newest', 'oldest'] })
  async listDeals(@Request() req: any, @Query() query: DealListQueryDto) {
    return this.dealService.listDeals(req, query);
  }

  // ─── Deal Detail ───────────────────────────────────────────

  @Get('/:id')
  @ApiOperation({ summary: 'Get single deal detail with all orders' })
  async getDealDetail(
    @Request() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.dealService.getDealDetail(req, id);
  }

  // ─── Accept Deal ───────────────────────────────────────────

  @Patch('/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a deal (confirm all PLACED orders)' })
  async acceptDeal(@Request() req: any, @Body() dto: AcceptDealDto) {
    return this.dealService.acceptDeal(req, dto);
  }

  // ─── Extend Deal Time ─────────────────────────────────────

  @Patch('/extend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Extend deal closing date (max = half of original duration)' })
  async extendDeal(@Request() req: any, @Body() dto: ExtendDealDto) {
    return this.dealService.extendDeal(req, dto);
  }

  // ─── Cancel Deal ───────────────────────────────────────────

  @Patch('/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel entire deal and all its orders' })
  async cancelDeal(@Request() req: any, @Body() dto: CancelDealDto) {
    return this.dealService.cancelDeal(req, dto);
  }

  // ─── Cancel Single Order ───────────────────────────────────

  @Patch('/order/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a single order within a deal' })
  async cancelOrder(@Request() req: any, @Body() dto: CancelOrderDto) {
    return this.dealService.cancelOrder(req, dto);
  }

  // ─── Notify Buyers ─────────────────────────────────────────

  @Post('/notify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send notification to all buyers in a deal' })
  async notifyBuyers(@Request() req: any, @Body() dto: NotifyBuyersDto) {
    return this.dealService.notifyBuyers(req, dto);
  }
}
