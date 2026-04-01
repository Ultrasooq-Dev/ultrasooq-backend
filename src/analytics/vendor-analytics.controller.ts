import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '../guards/AuthGuard';
import { VendorAnalyticsService } from './vendor-analytics.service';

@ApiTags('vendor-analytics')
@ApiBearerAuth('JWT-auth')
@UseGuards(AuthGuard)
@Controller('vendor/analytics')
export class VendorAnalyticsController {
  constructor(private vendorAnalytics: VendorAnalyticsService) {}

  @Get('mini-stats')
  @ApiOperation({ summary: 'Vendor mini stats: lightweight batch stats for product list badges' })
  async getMiniStats(@Req() req: any) {
    const sellerId = req.user?.id ?? req.user?.userId;
    return this.vendorAnalytics.getMiniStats(sellerId);
  }

  @Get('overview')
  @ApiOperation({ summary: 'Vendor overview: KPIs and sales trend' })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  async getOverview(@Query('days') days = '30', @Req() req: any) {
    const sellerId = req.user?.id ?? req.user?.userId;
    const d = Math.min(Math.max(parseInt(days) || 30, 1), 365);
    return this.vendorAnalytics.getOverview(sellerId, d);
  }

  @Get('products')
  @ApiOperation({ summary: 'Vendor top products with views, clicks, orders, revenue' })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  async getProducts(
    @Query('days') days = '30',
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Req() req: any,
  ) {
    const sellerId = req.user?.id ?? req.user?.userId;
    const d = Math.min(Math.max(parseInt(days) || 30, 1), 365);
    const p = Math.max(parseInt(page) || 1, 1);
    const l = Math.min(parseInt(limit) || 20, 100);
    return this.vendorAnalytics.getProducts(sellerId, d, p, l);
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Vendor single product detail: views trend, orders, reviews, click sources' })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  async getProductDetail(
    @Param('id', ParseIntPipe) productPriceId: number,
    @Query('days') days = '30',
    @Req() req: any,
  ) {
    const sellerId = req.user?.id ?? req.user?.userId;
    const d = Math.min(Math.max(parseInt(days) || 30, 1), 365);
    const result = await this.vendorAnalytics.getProductDetail(sellerId, productPriceId, d);
    if (!result) throw new NotFoundException('Product not found or not owned by you');
    return result;
  }

  @Get('funnel')
  @ApiOperation({ summary: 'Vendor conversion funnel: views → clicks → cart → orders → delivered' })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  async getFunnel(@Query('days') days = '30', @Req() req: any) {
    const sellerId = req.user?.id ?? req.user?.userId;
    const d = Math.min(Math.max(parseInt(days) || 30, 1), 365);
    return this.vendorAnalytics.getFunnel(sellerId, d);
  }

  @Get('reviews')
  @ApiOperation({ summary: 'Vendor reviews: summary, distribution, paginated list' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  async getReviews(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Req() req: any,
  ) {
    const sellerId = req.user?.id ?? req.user?.userId;
    const p = Math.max(parseInt(page) || 1, 1);
    const l = Math.min(parseInt(limit) || 20, 100);
    return this.vendorAnalytics.getReviews(sellerId, p, l);
  }
}
