import { Injectable } from '@nestjs/common';

interface RankedItem {
  id: number;
  score: number;
  source: string;
}

@Injectable()
export class RankFusionService {
  /**
   * Reciprocal Rank Fusion — merges results from multiple search signals.
   * score(product) = Σ weight_i * 1/(k + rank_i) for each signal
   *
   * @param signals Array of ranked result lists with weights and names
   * @param k Smoothing constant (default 60, standard RRF value)
   * @returns Merged and re-ranked items sorted by fused score descending
   */
  fuse(
    signals: Array<{
      results: Array<{ id: number; [key: string]: any }>;
      weight: number;
      name: string;
    }>,
    k = 60,
  ): RankedItem[] {
    const scoreMap = new Map<number, RankedItem>();

    for (const signal of signals) {
      for (let i = 0; i < signal.results.length; i++) {
        const item = signal.results[i];
        const rrf = signal.weight * (1 / (k + i + 1));
        const existing = scoreMap.get(item.id);
        if (existing) {
          existing.score += rrf;
          existing.source += `,${signal.name}`;
        } else {
          scoreMap.set(item.id, {
            id: item.id,
            score: rrf,
            source: signal.name,
          });
        }
      }
    }

    return Array.from(scoreMap.values()).sort((a, b) => b.score - a.score);
  }
}
