/**
 * @file strategy-lab.controller.ts
 * @intent REST API for Strategy Lab — run tests, view results, rank combos.
 * @usage Registered under `/strategy-lab` prefix. All endpoints require SuperAdmin auth.
 * @dataflow HTTP request -> guard -> controller -> service -> response envelope.
 */
import {
  Body, Controller, Delete, Get, Param, Post, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SuperAdminAuthGuard } from 'src/guards/SuperAdminAuthGuard';
import { StrategyLabService } from './strategy-lab.service';
import { RunTestDto } from './dto/run-test.dto';

@ApiTags('strategy-lab')
@ApiBearerAuth('JWT-auth')
@Controller('strategy-lab')
export class StrategyLabController {
  constructor(private readonly strategyLabService: StrategyLabService) {}

  /**
   * Start a new test run.
   * POST /strategy-lab/run
   */
  @UseGuards(SuperAdminAuthGuard)
  @Post('/run')
  runTest(@Body() dto: RunTestDto) {
    return this.strategyLabService.runTest(dto);
  }

  /**
   * Get available options for the UI selectors (assets, TFs, strategies).
   * GET /strategy-lab/options
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/options')
  getOptions() {
    return this.strategyLabService.getAvailableOptions();
  }

  /**
   * List all test runs (paginated).
   * GET /strategy-lab/runs?page=1&limit=20
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/runs')
  getRuns(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.strategyLabService.getRuns(
      parseInt(page || '1', 10),
      parseInt(limit || '20', 10),
    );
  }

  /**
   * Get a single run with its combos.
   * GET /strategy-lab/runs/:id
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/runs/:id')
  getRunById(@Param('id') id: string) {
    return this.strategyLabService.getRunById(parseInt(id, 10));
  }

  /**
   * Get trades for a specific combo.
   * GET /strategy-lab/combos/:comboId/trades?page=1&limit=50
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/combos/:comboId/trades')
  getComboTrades(
    @Param('comboId') comboId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.strategyLabService.getComboTrades(
      parseInt(comboId, 10),
      parseInt(page || '1', 10),
      parseInt(limit || '50', 10),
    );
  }

  /**
   * Global combo rankings across all runs (filterable).
   * GET /strategy-lab/rankings?asset=XAUUSD&strategy=MACD&timeframe=H1&minGrade=B
   */
  @UseGuards(SuperAdminAuthGuard)
  @Get('/rankings')
  getComboRankings(
    @Query('asset') asset?: string,
    @Query('strategy') strategy?: string,
    @Query('timeframe') timeframe?: string,
    @Query('minGrade') minGrade?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.strategyLabService.getComboRankings(
      asset, strategy, timeframe, minGrade,
      parseInt(page || '1', 10),
      parseInt(limit || '50', 10),
    );
  }

  /**
   * Soft-delete a test run.
   * DELETE /strategy-lab/runs/:id
   */
  @UseGuards(SuperAdminAuthGuard)
  @Delete('/runs/:id')
  deleteRun(@Param('id') id: string) {
    return this.strategyLabService.deleteRun(parseInt(id, 10));
  }
}
