export interface ParsedSubQuery {
  raw: string;
  term: string;
  quantity: number | null;
  priceMin: number | null;
  priceMax: number | null;
  specs: Record<string, string>;
  intent: 'product' | 'spec_filter' | 'use_case' | 'compatibility' | 'natural_language' | 'direct_match';
  confidence: number;
}

export interface ParsedQuery {
  type: 'single' | 'multi' | 'shopping_list';
  subQueries: ParsedSubQuery[];
  originalQuery: string;
  language: string;
}
