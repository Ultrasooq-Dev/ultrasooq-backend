import { Injectable, Logger } from '@nestjs/common';
import { CategoryIndexService } from './category-index.service';
import { ParsedQuery, ParsedSubQuery } from '../interfaces/parsed-query.interface';

export interface EnrichedSubQuery extends ParsedSubQuery {
  resolvedBrandId: number | null;
  resolvedCategoryIds: number[];
  useCaseHint: string | null;
}

export interface EnrichedQuery extends Omit<ParsedQuery, 'subQueries'> {
  subQueries: EnrichedSubQuery[];
}

@Injectable()
export class IntentClassifierService {
  private readonly logger = new Logger(IntentClassifierService.name);

  constructor(private categoryIndex: CategoryIndexService) {}

  enrich(parsed: ParsedQuery): EnrichedQuery {
    const enrichedSubs = parsed.subQueries.map(sq => this.enrichSubQuery(sq));
    return { ...parsed, subQueries: enrichedSubs };
  }

  private enrichSubQuery(sq: ParsedSubQuery): EnrichedSubQuery {
    const words = sq.term.split(/\s+/);

    // Try to resolve brand from each word
    let resolvedBrandId: number | null = null;
    for (const word of words) {
      const brandId = this.categoryIndex.resolveBrand(word);
      if (brandId) {
        resolvedBrandId = brandId;
        break;
      }
    }

    // Try to resolve categories from the term
    const categoryMatches = this.categoryIndex.resolveCategory(sq.term);
    const resolvedCategoryIds = categoryMatches.map(m => m.categoryId);

    // Extract use-case hint
    let useCaseHint: string | null = null;
    if (sq.intent === 'use_case') {
      const match = sq.term.match(/\b(?:for|good for|best for)\s+(\w+(?:\s+\w+)?)/i);
      useCaseHint = match ? match[1].toLowerCase() : null;
    }

    return {
      ...sq,
      resolvedBrandId,
      resolvedCategoryIds,
      useCaseHint,
    };
  }
}
