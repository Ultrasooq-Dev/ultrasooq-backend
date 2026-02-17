import { 
  Body, 
  Controller, 
  Get, 
  Post, 
  UseGuards, 
  Request, 
  Query, 
  Param, 
  Delete, 
  Patch,
  ParseIntPipe,
  DefaultValuePipe
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BannerService } from './banner.service';
import { AuthGuard } from 'src/guards/AuthGuard';
import { SuperAdminAuthGuard } from 'src/guards/SuperAdminAuthGuard';

@ApiTags('banners')
@ApiBearerAuth('JWT-auth')
@Controller('banner')
export class BannerController {
  constructor(
    private readonly bannerService: BannerService,
  ) {}

  // Public endpoint - Get active banners
  @Get('/active')
  getActiveBanners(@Query('position') position?: string) {
    return this.bannerService.getActiveBanners(position);
  }

  // Admin endpoints
  @UseGuards(SuperAdminAuthGuard)
  @Get()
  getAllBanners(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('position') position?: string,
  ) {
    return this.bannerService.getAllBanners(page, limit, position);
  }

  @UseGuards(SuperAdminAuthGuard)
  @Get('/:id')
  getBannerById(@Param('id', ParseIntPipe) id: number) {
    return this.bannerService.getBannerById(id);
  }

  @UseGuards(SuperAdminAuthGuard)
  @Post()
  async createBanner(@Request() req, @Body() payload: any) {
    try {
      return await this.bannerService.createBanner(payload, req);
    } catch (error: any) {
      return {
        status: false,
        message: 'Internal server error',
        error: error.message || 'Unknown error',
      };
    }
  }

  @UseGuards(SuperAdminAuthGuard)
  @Patch('/:id')
  updateBanner(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body() payload: any,
  ) {
    return this.bannerService.updateBanner(id, payload, req);
  }

  @UseGuards(SuperAdminAuthGuard)
  @Delete('/:id')
  deleteBanner(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.bannerService.deleteBanner(id, req);
  }

  @UseGuards(SuperAdminAuthGuard)
  @Patch('/:id/status')
  toggleBannerStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: { isActive: boolean },
  ) {
    return this.bannerService.toggleBannerStatus(id, payload.isActive);
  }

  @UseGuards(SuperAdminAuthGuard)
  @Patch('/:id/priority')
  updateBannerPriority(
    @Param('id', ParseIntPipe) id: number,
    @Body() payload: { priority: number },
  ) {
    return this.bannerService.updateBannerPriority(id, payload.priority);
  }

  // Public tracking endpoints
  @Post('/:id/track-click')
  trackBannerClick(@Param('id', ParseIntPipe) id: number) {
    return this.bannerService.trackBannerClick(id);
  }

  @Post('/:id/track-view')
  trackBannerView(@Param('id', ParseIntPipe) id: number) {
    return this.bannerService.trackBannerView(id);
  }

  // Admin analytics
  @UseGuards(SuperAdminAuthGuard)
  @Get('/analytics')
  getBannerAnalytics() {
    return this.bannerService.getBannerAnalytics();
  }
}

