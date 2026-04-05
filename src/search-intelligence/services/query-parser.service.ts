import { Injectable, Logger } from '@nestjs/common';
import { CategoryIndexService } from './category-index.service';
import { ParsedQuery, ParsedSubQuery } from '../interfaces/parsed-query.interface';
import { extractSpecs } from '../constants/spec-patterns';
import { extractPrice } from '../constants/price-patterns';

// ─── Language detection ────────────────────────────────────────────────────────

function detectLanguage(text: string): string {
  // Arabic: U+0600–U+06FF
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  // Chinese: U+4E00–U+9FFF (CJK Unified Ideographs)
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh';
  // Japanese hiragana/katakana
  if (/[\u3040-\u30ff]/.test(text)) return 'ja';
  // Korean
  if (/[\uac00-\ud7af]/.test(text)) return 'ko';
  // Cyrillic (Russian etc.)
  if (/[\u0400-\u04ff]/.test(text)) return 'ru';
  // Devanagari (Hindi etc.)
  if (/[\u0900-\u097f]/.test(text)) return 'hi';
  return 'en';
}

// ─── Quantity extraction ───────────────────────────────────────────────────────

interface QuantityResult {
  quantity: number | null;
  cleanedTerm: string;
}

function extractQuantity(term: string): QuantityResult {
  // "10 USB cables", "buy 5 keyboards"
  const leadingQty = term.match(/^(\d+)\s+(.+)/);
  if (leadingQty) {
    return { quantity: parseInt(leadingQty[1], 10), cleanedTerm: leadingQty[2].trim() };
  }

  // "cables x10", "USB cable x 5"
  const trailingX = term.match(/^(.+?)\s*[xX]\s*(\d+)$/);
  if (trailingX) {
    return { quantity: parseInt(trailingX[2], 10), cleanedTerm: trailingX[1].trim() };
  }

  // "cables (10)", "USB cable (qty: 5)"
  const parenQty = term.match(/^(.+?)\s*\(?(?:qty[:\s]*)(\d+)\)?$/i);
  if (parenQty) {
    return { quantity: parseInt(parenQty[2], 10), cleanedTerm: parenQty[1].trim() };
  }

  return { quantity: null, cleanedTerm: term };
}

// ─── Intent classification ────────────────────────────────────────────────────

type Intent = ParsedSubQuery['intent'];

function classifyIntent(
  term: string,
  specs: Record<string, string>,
  hasPrice: boolean,
): Intent {
  const lower = term.toLowerCase();

  // Spec filter: has specs extracted or mentions specs explicitly
  if (Object.keys(specs).length > 0) return 'spec_filter';

  // Compatibility: "for", "compatible with", "fits"
  if (/\b(?:for|compatible\s+with|fits|works\s+with|connector\s+for)\b/.test(lower)) {
    return 'compatibility';
  }

  // Use-case: "best for", "good for", "used for", "gaming", "office"
  if (/\b(?:best\s+for|good\s+for|used\s+for|to\s+use|for\s+\w+ing|gaming|office|outdoor|travel)\b/.test(lower)) {
    return 'use_case';
  }

  // Natural language: question words or long phrases
  if (/\b(?:what|which|where|how|when|recommend|suggest|help|need|want|looking\s+for)\b/.test(lower)) {
    return 'natural_language';
  }

  return 'direct_match';
}

// ─── Numbered-list splitting ──────────────────────────────────────────────────

function splitNumberedList(query: string): string[] | null {
  // "1. apples 2. bananas 3. oranges"  or  "1) apples 2) bananas"
  const items = query.split(/\b\d+[\.\)]\s+/).map((s) => s.trim()).filter(Boolean);
  // Only treat as a numbered list if we got at least 2 items and it actually contained numbers
  if (items.length >= 2 && /\b\d+[\.\)]\s+/.test(query)) {
    return items;
  }
  return null;
}

// ─── Main service ─────────────────────────────────────────────────────────────

@Injectable()
export class QueryParserService {
  private readonly logger = new Logger(QueryParserService.name);

  constructor(private readonly categoryIndex: CategoryIndexService) {}

  /**
   * Parse a raw search query into a structured ParsedQuery.
   */
  parse(rawQuery: string): ParsedQuery {
    const trimmed = rawQuery.trim();
    const language = detectLanguage(trimmed);

    // Non-Latin scripts: skip splitting, treat as single query
    if (language !== 'en') {
      return {
        type: 'single',
        subQueries: [this.buildSubQuery(trimmed)],
        originalQuery: rawQuery,
        language,
      };
    }

    // --- Try to split into multiple sub-queries ---

    // 1. Numbered list: "1. apples 2. bananas"
    const numbered = splitNumberedList(trimmed);
    if (numbered && numbered.length >= 2) {
      const subQueries = numbered.map((t) => this.buildSubQuery(t));
      return { type: 'multi', subQueries, originalQuery: rawQuery, language };
    }

    // 2. Comma-separated — check if any part has a leading quantity (shopping list)
    const commaParts = trimmed.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
    if (commaParts.length >= 2) {
      const hasQuantities = commaParts.some((p) => /^\d+\s+\S/.test(p));
      const subQueries = commaParts.map((p) => this.buildSubQuery(p));
      return {
        type: hasQuantities ? 'shopping_list' : 'multi',
        subQueries,
        originalQuery: rawQuery,
        language,
      };
    }

    // 3. "and" separator — but only if none of the parts look like a compound product
    //    e.g. "cables and keyboards and monitors" → split
    //    but "bread and butter" might be a compound — use index to check
    const andParts = trimmed.split(/\s+and\s+/i).map((s) => s.trim()).filter(Boolean);
    if (andParts.length >= 2) {
      // Reject split if the full phrase is a known compound / brand-product pattern
      const fullWords = trimmed.split(/\s+/);
      const isKnownPhrase =
        this.categoryIndex.isBrandProductPattern(fullWords) ||
        this.categoryIndex.isCompoundProduct(trimmed.toLowerCase());

      if (!isKnownPhrase) {
        const subQueries = andParts.map((p) => this.buildSubQuery(p));
        return { type: 'multi', subQueries, originalQuery: rawQuery, language };
      }
    }

    // 4. Single query — but first check for compound / brand patterns
    return {
      type: 'single',
      subQueries: [this.buildSubQuery(trimmed)],
      originalQuery: rawQuery,
      language,
    };
  }

  // ─── Build a single ParsedSubQuery ─────────────────────────────────────────

  private buildSubQuery(raw: string): ParsedSubQuery {
    let term = raw.trim();

    // 1. Extract quantity
    const { quantity, cleanedTerm: afterQty } = extractQuantity(term);
    term = afterQty;

    // 2. Extract price
    const { price, cleanedTerm: afterPrice } = extractPrice(term);
    term = afterPrice;

    // 3. Extract specs
    const { specs, cleanedTerm: afterSpecs } = extractSpecs(term);
    term = afterSpecs;

    // 4. Classify intent
    const intent = classifyIntent(term, specs, price !== null);

    // 5. Confidence: simple heuristic
    const confidence = this.calcConfidence(term, specs, price);

    return {
      raw,
      term: term.trim(),
      quantity,
      priceMin: price?.min ?? null,
      priceMax: price?.max ?? null,
      specs,
      intent,
      confidence,
    };
  }

  private calcConfidence(
    term: string,
    specs: Record<string, string>,
    price: { min: number | null; max: number | null } | null,
  ): number {
    let score = 0.5;

    // Longer, more specific terms get higher confidence
    const words = term.split(/\s+/).filter(Boolean);
    if (words.length >= 2) score += 0.1;
    if (words.length >= 3) score += 0.05;

    // Specs extracted → more structured
    if (Object.keys(specs).length > 0) score += 0.15;

    // Price constraint
    if (price !== null) score += 0.1;

    // Category match
    if (this.categoryIndex.resolveCategory(term).length > 0) score += 0.1;

    return Math.min(score, 1.0);
  }
}
