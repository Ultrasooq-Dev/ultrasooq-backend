import {
  Controller, Get, Post, Body, Param, Query, Req,
  HttpCode, ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { RecommendationService } from './services/recommendation.service';
import { FeedbackService } from './services/feedback.service';
import {
  RecommendationQueryDto,
  ProductRecommendationQueryDto,
  TrendingQueryDto,
} from './dto/recommendation-query.dto';
import { RecommendationFeedbackDto } from './dto/recommendation-feedback.dto';

@ApiTags('recommendations')
@Controller('recommendations')
@SkipThrottle()
export class RecommendationController {
  constructor(
    private recommendation: RecommendationService,
    private feedback: FeedbackService,
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
}
