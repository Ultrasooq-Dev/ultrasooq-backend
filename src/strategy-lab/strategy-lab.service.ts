/**
 * @file strategy-lab.service.ts
 * @intent Business logic for Strategy Lab — run tests, store results, query history.
 *         Delegates actual backtesting to the Python engine via child_process.
 * @dataflow Controller -> Service -> Python engine -> Prisma (store results).
 * @depends PrismaService, child_process (spawn Python).
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { getErrorMessage } from 'src/common/utils/get-error-message';
import { RunTestDto } from './dto/run-test.dto';
import { spawn } from 'child_process';
import * as path from 'path';

@Injectable()
export class StrategyLabService {
  private readonly logger = new Logger(StrategyLabService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Start a new test run. Creates the DB record, spawns the Python engine,
   * and updates the record when done.
   */
  async runTest(dto: RunTestDto) {
    try {
      // Create the run record
      const run = await this.prisma.strategyLabRun.create({
        data: {
          name: dto.name || `${dto.mode} - ${dto.assets.join(',')}`,
          mode: dto.mode === 'full' ? 'solo' : dto.mode, // full starts as solo
          configJson: {
            assets: dto.assets,
            timeframes: dto.timeframes,
            strategies: dto.strategies,
            equity: dto.equity || 10000,
            stages: dto.stages || 24,
            minGrade: dto.minGrade || 'B',
            mode: dto.mode,
          },
          statusRun: 'running',
          startingEquity: dto.equity || 10000,
        },
      });

      // Spawn Python engine in background (non-blocking)
      this.spawnPythonEngine(run.id, dto).catch((err) => {
        this.logger.error(`Python engine failed for run ${run.id}: ${err}`);
      });

      return {
        status: true,
        message: 'Test run started',
        data: { runId: run.id, statusRun: 'running' },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to start test run',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Spawn the Python strategy lab engine and process results.
   */
  private async spawnPythonEngine(runId: number, dto: RunTestDto): Promise<void> {
    return new Promise((resolve, reject) => {
      const tradingAiPath = path.resolve(
        __dirname, '..', '..', '..', '..', 'OneDrive', 'Desktop', 'trading 3', 'trading-ai-v3', 'backend',
      );

      const pythonArgs = ['-c', this.buildPythonScript(dto)];
      const proc = spawn('python', pythonArgs, { cwd: tradingAiPath });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', async (code) => {
        if (code !== 0) {
          this.logger.error(`Python exited with code ${code}: ${stderr}`);
          await this.prisma.strategyLabRun.update({
            where: { id: runId },
            data: { statusRun: 'failed' },
          });
          reject(new Error(stderr));
          return;
        }

        try {
          const result = JSON.parse(stdout);
          await this.saveResults(runId, result, dto);
          resolve();
        } catch (err) {
          this.logger.error(`Failed to parse Python output: ${err}`);
          await this.prisma.strategyLabRun.update({
            where: { id: runId },
            data: { statusRun: 'failed' },
          });
          reject(err);
        }
      });

      // Timeout after 10 minutes
      setTimeout(() => {
        proc.kill();
        reject(new Error('Python engine timed out'));
      }, 600000);
    });
  }

  /**
   * Build the Python script string for the strategy lab engine.
   */
  private buildPythonScript(dto: RunTestDto): string {
    const soloOnly = dto.mode === 'solo' ? 'True' : 'False';
    const combinedOnly = dto.mode === 'combined' ? 'True' : 'False';

    return `
import sys, json
sys.path.insert(0, '.')
from app.boxes.strategy_lab.lab import run_lab

result = run_lab(
    assets=${JSON.stringify(dto.assets)},
    timeframes=${JSON.stringify(dto.timeframes)},
    strategies=${JSON.stringify(dto.strategies)},
    solo_equity=${dto.equity || 10000},
    combined_equity=${dto.equity || 10000},
    num_stages=${dto.stages || 24},
    min_grade="${dto.minGrade || 'B'}",
    solo_only=${soloOnly},
    combined_only=${combinedOnly},
    verbose=False,
)

# Strip trade details for JSON output
if result.get("solo_result"):
    for c in result["solo_result"].get("combos", []):
        c.pop("trades", None)
if result.get("combined_result"):
    for r in result["combined_result"].get("combo_rankings", []):
        r.pop("stage_history", None)

print(json.dumps(result, default=str))
`;
  }

  /**
   * Save Python engine results into the database.
   */
  private async saveResults(runId: number, result: any, dto: RunTestDto) {
    const soloResult = result.solo_result;
    const combinedResult = result.combined_result;

    // Determine which result to use for aggregates
    const mainResult = combinedResult || soloResult;
    if (!mainResult) {
      await this.prisma.strategyLabRun.update({
        where: { id: runId },
        data: { statusRun: 'failed' },
      });
      return;
    }

    // Update the run record
    const summary = mainResult.summary || {};
    await this.prisma.strategyLabRun.update({
      where: { id: runId },
      data: {
        statusRun: 'done',
        progress: 100,
        mode: dto.mode === 'full' ? 'full' : dto.mode,
        totalCombos: summary.total_combos || 0,
        qualifiedCombos: summary.qualified_combos || soloResult?.summary?.qualified_combos || 0,
        totalTrades: summary.total_trades || 0,
        totalPnl: summary.total_pnl || 0,
        finalEquity: summary.final_equity || dto.equity || 10000,
        returnPct: summary.return_pct || 0,
        elapsedSeconds: result.elapsed_seconds || 0,
        gradesJson: soloResult?.summary?.grades || null,
        assetSummary: soloResult?.asset_summary || null,
        strategySummary: soloResult?.strategy_summary || null,
        tfSummary: soloResult?.tf_summary || null,
        equityCurve: combinedResult?.equity_curve || null,
        stageReports: combinedResult?.stage_reports || null,
      },
    });

    // Save combo results
    const combos = soloResult?.combos || combinedResult?.combo_rankings || [];
    for (const combo of combos) {
      const metrics = combo.metrics || {};
      await this.prisma.strategyLabCombo.create({
        data: {
          runId,
          asset: combo.asset,
          timeframe: combo.tf,
          strategy: combo.strategy,
          comboKey: combo.combo_key || `${combo.asset}_${combo.strategy}_${combo.tf}`,
          tier: combo.tier || 1,
          totalTrades: metrics.trades || 0,
          wins: metrics.wins || 0,
          losses: metrics.losses || 0,
          winRate: metrics.wr || 0,
          profitFactor: metrics.pf || 0,
          totalPnl: metrics.pnl || 0,
          maxDrawdown: metrics.max_dd || 0,
          avgPnl: metrics.avg_pnl || 0,
          bestTrade: metrics.best_trade || 0,
          worstTrade: metrics.worst_trade || 0,
          tp1Hits: metrics.tp1_hits || 0,
          tp2Hits: metrics.tp2_hits || 0,
          tp3Hits: metrics.tp3_hits || 0,
          slHits: metrics.sl_hits || 0,
          expireHits: metrics.expire_hits || 0,
          grade: combo.grade || null,
          paused: combo.paused || false,
          finalRiskMult: combo.final_risk_mult || 1.0,
          stageHistory: combo.stage_history || null,
        },
      });
    }

    this.logger.log(`Run ${runId} completed: ${combos.length} combos saved`);
  }

  /**
   * Get all test runs (paginated).
   */
  async getRuns(page: number = 1, limit: number = 20) {
    try {
      const skip = (page - 1) * limit;
      const [runs, total] = await Promise.all([
        this.prisma.strategyLabRun.findMany({
          where: { deletedAt: null, status: { not: 'DELETE' } },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: { _count: { select: { combos: true, trades: true } } },
        }),
        this.prisma.strategyLabRun.count({
          where: { deletedAt: null, status: { not: 'DELETE' } },
        }),
      ]);

      return {
        status: true,
        message: 'Runs fetched',
        data: { runs, total, page, limit },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to fetch runs',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Get a single run with its combos.
   */
  async getRunById(id: number) {
    try {
      const run = await this.prisma.strategyLabRun.findUnique({
        where: { id },
        include: {
          combos: {
            where: { deletedAt: null, status: { not: 'DELETE' } },
            orderBy: { profitFactor: 'desc' },
          },
        },
      });

      if (!run) {
        return { status: false, message: 'Run not found' };
      }

      return { status: true, message: 'Run fetched', data: run };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to fetch run',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Get trades for a specific combo.
   */
  async getComboTrades(comboId: number, page: number = 1, limit: number = 50) {
    try {
      const skip = (page - 1) * limit;
      const [trades, total] = await Promise.all([
        this.prisma.strategyLabTrade.findMany({
          where: { comboId, deletedAt: null, status: { not: 'DELETE' } },
          orderBy: { createdAt: 'asc' },
          skip,
          take: limit,
        }),
        this.prisma.strategyLabTrade.count({
          where: { comboId, deletedAt: null, status: { not: 'DELETE' } },
        }),
      ]);

      return {
        status: true,
        message: 'Trades fetched',
        data: { trades, total, page, limit },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to fetch trades',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Get available assets, timeframes, and strategies for the UI selectors.
   */
  async getAvailableOptions() {
    return {
      status: true,
      message: 'Options fetched',
      data: {
        assets: [
          { symbol: 'XAUUSD', name: 'Gold', tier: 1 },
          { symbol: 'BTCUSD', name: 'Bitcoin', tier: 1 },
          { symbol: 'ETHUSD', name: 'Ethereum', tier: 1 },
          { symbol: 'USOIL', name: 'Crude Oil', tier: 1 },
          { symbol: 'EURUSD', name: 'EUR/USD', tier: 1 },
          { symbol: 'XAGUSD', name: 'Silver', tier: 2 },
          { symbol: 'GBPUSD', name: 'GBP/USD', tier: 2 },
          { symbol: 'USDJPY', name: 'USD/JPY', tier: 2 },
          { symbol: 'SOLUSD', name: 'Solana', tier: 2 },
          { symbol: 'BNBUSD', name: 'BNB', tier: 2 },
          { symbol: 'ADAUSD', name: 'Cardano', tier: 2 },
          { symbol: 'AUDUSD', name: 'AUD/USD', tier: 3 },
          { symbol: 'NZDUSD', name: 'NZD/USD', tier: 3 },
          { symbol: 'USDCHF', name: 'USD/CHF', tier: 3 },
          { symbol: 'DOGEUSD', name: 'Dogecoin', tier: 3 },
          { symbol: 'DOTUSD', name: 'Polkadot', tier: 3 },
          { symbol: 'FILUSD', name: 'Filecoin', tier: 3 },
          { symbol: 'SNXUSD', name: 'Synthetix', tier: 3 },
          { symbol: 'ENJUSD', name: 'Enjin', tier: 3 },
          { symbol: 'BATUSD', name: 'BAT', tier: 3 },
        ],
        timeframes: [
          { value: 'M5', label: '5 Minutes' },
          { value: 'M15', label: '15 Minutes' },
          { value: 'H1', label: '1 Hour' },
          { value: 'H4', label: '4 Hours' },
        ],
        strategies: [
          { value: 'Volume', label: 'Volume Breakout', description: 'Volume > 2x avg with price continuation' },
          { value: 'FibGolden', label: 'Fib Golden', description: 'Fibonacci 50%-61.8% retracement in trend' },
          { value: 'Breakout', label: 'Breakout', description: 'Donchian channel breakout' },
          { value: 'Momentum', label: 'Momentum', description: 'ROC threshold cross with EMA alignment' },
          { value: 'MACD', label: 'MACD', description: 'MACD histogram zero-cross with EMA alignment' },
          { value: 'RSI7', label: 'RSI7', description: 'RSI(7) oversold/overbought reversal' },
        ],
      },
    };
  }

  /**
   * Delete a run (soft delete).
   */
  async deleteRun(id: number) {
    try {
      await this.prisma.strategyLabRun.update({
        where: { id },
        data: { status: 'DELETE', deletedAt: new Date() },
      });

      return { status: true, message: 'Run deleted' };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to delete run',
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Get global combo rankings across all runs.
   */
  async getComboRankings(
    asset?: string,
    strategy?: string,
    timeframe?: string,
    minGrade?: string,
    page: number = 1,
    limit: number = 50,
  ) {
    try {
      const where: any = {
        deletedAt: null,
        status: { not: 'DELETE' },
        totalTrades: { gt: 0 },
      };
      if (asset) where.asset = asset;
      if (strategy) where.strategy = strategy;
      if (timeframe) where.timeframe = timeframe;
      if (minGrade) where.grade = { in: this.getPassingGrades(minGrade) };

      const skip = (page - 1) * limit;
      const [combos, total] = await Promise.all([
        this.prisma.strategyLabCombo.findMany({
          where,
          orderBy: { profitFactor: 'desc' },
          skip,
          take: limit,
          include: { run: { select: { id: true, name: true, mode: true, createdAt: true } } },
        }),
        this.prisma.strategyLabCombo.count({ where }),
      ]);

      return {
        status: true,
        message: 'Rankings fetched',
        data: { combos, total, page, limit },
      };
    } catch (error) {
      return {
        status: false,
        message: 'Failed to fetch rankings',
        error: getErrorMessage(error),
      };
    }
  }

  private getPassingGrades(minGrade: string): string[] {
    const order = ['A', 'B', 'C', 'D', 'F'];
    const idx = order.indexOf(minGrade);
    return idx >= 0 ? order.slice(0, idx + 1) : ['A', 'B'];
  }
}
