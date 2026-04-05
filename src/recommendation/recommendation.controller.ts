import {
  Controller, Get, Post, Body, Param, Query, Req,
  HttpCode, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { RecommendationService } from './services/recommendation.service';
import { FeedbackService } from './services/feedback.service';
import { SearchBoostService } from './services/search-boost.service';
import { FlowNudgeService, FlowNudge } from './services/flow-nudge.service';
import { AuthGuard } from '../guards/AuthGuard';
import {
  RecommendationQueryDto,
  ProductRecommendationQueryDto,
  TrendingQueryDto,
  SearchBoostQueryDto,
} from './dto/recommendation-query.dto';
import { RecommendationFeedbackDto } from './dto/recommendation-feedback.dto';

@ApiTags('recommendations')
@Controller('recommendations')
@SkipThrottle()
export class RecommendationController {
  constructor(
    private recommendation: RecommendationService,
    private feedback: FeedbackService,
    private searchBoost: SearchBoostService,
    private flowNudge: FlowNudgeService,
  ) {}

  @Get('personal')
  @ApiOperation({ summary: 'Get personalized recommendations' })
  async getPersonal(@Query() query: RecommendationQueryDto, @Req() req: any) {
    const userId = req.user?.sub || null;
    const locale =
      req.headers['accept-language']?.split(',')[0]?.split('-')[0] || 'en';
    const tradeRole = req.user?.tradeRole || 'BUYER';
    return this.recommendation.getPersonal(userId, locale, tradeRole, query.limit!);
  }

  @Get('product/:productId')
  @ApiOperation({ summary: 'Get product-based recommendations' })
  async getProductRecs(
    @Param('productId', ParseIntPipe) productId: number,
    @Query() query: ProductRecommendationQueryDto,
    @Req() req: any,
  ) {
    const locale =
      req.headers['accept-language']?.split(',')[0]?.split('-')[0] || 'en';
    const tradeRole = req.user?.tradeRole || 'BUYER';
    return this.recommendation.getProductRecs(
      productId,
      query.type! as 'similar' | 'cobought' | 'crosssell',
      locale,
      tradeRole,
      query.limit!,
    );
  }

  @Get('trending')
  @ApiOperation({ summary: 'Get trending products for segment' })
  async getTrending(@Query() query: TrendingQueryDto, @Req() req: any) {
    const locale =
      req.headers['accept-language']?.split(',')[0]?.split('-')[0] || 'en';
    const tradeRole = req.user?.tradeRole || 'BUYER';
    return this.recommendation.getTrending(
      locale, tradeRole, query.categoryId, query.limit!,
    );
  }

  @Post('feedback')
  @HttpCode(200)
  @ApiOperation({ summary: 'Track recommendation interaction' })
  async trackFeedback(@Body() dto: RecommendationFeedbackDto, @Req() req: any) {
    const userId = req.user?.sub || null;
    const deviceId = req.headers['x-device-id'] || null;
    await this.feedback.trackFeedback(dto, userId, deviceId);
    return { received: true };
  }

  @Get('cart')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get cart-based cross-sell recommendations' })
  async getCartRecs(@Query() query: RecommendationQueryDto, @Req() req: any) {
    const userId = req.user.sub;
    const locale = req.headers['accept-language']?.split(',')[0]?.split('-')[0] || 'en';
    const tradeRole = req.user?.tradeRole || 'BUYER';
    return this.recommendation.getCartRecs(userId, locale, tradeRole, query.limit!);
  }

  @Get('post-purchase/:orderId')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get post-purchase recommendations' })
  async getPostPurchaseRecs(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Query() query: RecommendationQueryDto,
    @Req() req: any,
  ) {
    const userId = req.user.sub;
    const locale = req.headers['accept-language']?.split(',')[0]?.split('-')[0] || 'en';
    const tradeRole = req.user?.tradeRole || 'BUYER';
    return this.recommendation.getPostPurchaseRecs(orderId, userId, locale, tradeRole, query.limit!);
  }

  @Get('search-boost')
  @ApiOperation({ summary: 'Get personalized search boost scores' })
  async getSearchBoost(@Query() query: SearchBoostQueryDto, @Req() req: any) {
    const userId = req.user?.sub || null;
    const locale = req.headers['accept-language']?.split(',')[0]?.split('-')[0] || 'en';
    const tradeRole = req.user?.tradeRole || 'BUYER';
    // Products to boost are passed by the search service internally
    // This endpoint returns empty for now — will be called internally
    return { boosts: [], query: query.query };
  }

  @Get('flow-nudge')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get cross-flow nudge suggestions' })
  async getFlowNudge(@Req() req: any): Promise<any[]> {
    const userId = req.user.sub;
    return this.flowNudge.getNudges(userId);
  }

  @Get('flow/:flow')
  @ApiOperation({ summary: 'Get flow-specific recommendations (dropship, services, rfq, wholesale)' })
  async getFlowRecs(
    @Param('flow') flow: string,
    @Query() query: RecommendationQueryDto,
    @Req() req: any,
  ) {
    const userId = req.user?.sub || null;
    const locale = req.headers['accept-language']?.split(',')[0]?.split('-')[0] || 'en';
    const tradeRole = req.user?.tradeRole || 'BUYER';
    const validFlows = ['dropship', 'services', 'rfq', 'wholesale'];
    const normalizedFlow = validFlows.includes(flow) ? flow : 'services';
    return this.recommendation.getFlowRecs(
      normalizedFlow as any,
      userId,
      locale,
      tradeRole,
      query.limit!,
    );
  }
}
