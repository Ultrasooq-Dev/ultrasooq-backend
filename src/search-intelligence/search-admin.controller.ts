import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { SuperAdminAuthGuard } from '../guards/SuperAdminAuthGuard';
import { SearchMiningService } from './services/search-mining.service';

@ApiTags('admin-search')
@Controller('admin/search')
@UseGuards(SuperAdminAuthGuard)
@SkipThrottle()
export class SearchAdminController {
  constructor(private searchMining: SearchMiningService) {}

  @Get('top-searches')
  @ApiOperation({ summary: 'Get top search queries' })
  async getTopSearches(@Query('days') days?: string) {
    return this.searchMining.findTopConvertingQueries(parseInt(days || '30'));
  }

  @Get('zero-results')
  @ApiOperation({ summary: 'Get queries with no clicks (potential gaps)' })
  async getZeroResults(@Query('days') days?: string) {
    return this.searchMining.findZeroClickQueries(parseInt(days || '7'));
  }

  @Get('refresh')
  @ApiOperation({ summary: 'Trigger search index refresh' })
  async refreshIndex() {
    await this.searchMining.refreshPopularSearches();
    return { status: 'refreshed' };
  }
}
