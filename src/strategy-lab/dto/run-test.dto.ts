import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsIn,
  Min,
  Max,
  ArrayMinSize,
} from 'class-validator';

/**
 * Available assets for strategy testing.
 */
export const AVAILABLE_ASSETS = [
  'XAUUSD', 'BTCUSD', 'ETHUSD', 'USOIL', 'EURUSD',
  'XAGUSD', 'GBPUSD', 'USDJPY', 'SOLUSD', 'BNBUSD',
  'ADAUSD', 'AUDUSD', 'NZDUSD', 'USDCHF', 'DOGEUSD',
  'DOTUSD', 'FILUSD', 'SNXUSD', 'ENJUSD', 'BATUSD',
] as const;

export const AVAILABLE_TIMEFRAMES = ['M5', 'M15', 'H1', 'H4'] as const;

export const AVAILABLE_STRATEGIES = [
  'Volume', 'FibGolden', 'Breakout', 'Momentum', 'MACD', 'RSI7',
] as const;

/**
 * DTO for starting a new strategy lab test run.
 */
export class RunTestDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  assets: string[];

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  timeframes: string[];

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  strategies: string[];

  @IsIn(['solo', 'combined', 'full'])
  mode: 'solo' | 'combined' | 'full';

  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(1000000)
  equity?: number;

  @IsOptional()
  @IsNumber()
  @Min(4)
  @Max(48)
  stages?: number;

  @IsOptional()
  @IsIn(['A', 'B', 'C'])
  minGrade?: 'A' | 'B' | 'C';
}
