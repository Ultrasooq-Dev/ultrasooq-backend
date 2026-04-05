import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { normalize } from './layers/normalizer.layer';
import { decodeLeetspeak } from './layers/leetspeak.layer';
import { transliterate } from './layers/transliteration.layer';
import { TrieMatcher, MatchResult, TermMeta } from './layers/pattern-matcher.layer';
import { scoreSeverity, ScoredResult } from './layers/severity-scorer.layer';

const CACHE_KEY = 'content-filter:rules';
const CACHE_TTL = 3600; // 1 hour

interface AnalyzeContext {
  userId?: number;
  context?: string;
  field?: string;
}

interface CachedRule {
  term: string;
  category: string;
  severity: string;
  language: string;
}

@Injectable()
export class ContentFilterService implements OnModuleInit {
  private readonly logger = new Logger(ContentFilterService.name);
  private readonly trie = new TrieMatcher();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  // ── Lifecycle ──

  async onModuleInit(): Promise<void> {
    await this.loadRules();
  }

  // ── Public API ──

  async analyzeText(
    text: string,
    context?: AnalyzeContext,
  ): Promise<ScoredResult> {
    if (!text) {
      return scoreSeverity([]);
    }

    // Step 1: normalize
    const normalized = normalize(text);

    // Step 2: decode leetspeak from normalized text
    const decoded = decodeLeetspeak(normalized);

    // Step 3: transliterate normalized text to get Arabic variants
    const variants = transliterate(normalized);

    // Step 4-6: match normalized, decoded, and transliterated variants
    const normalizedMatches = this.trie.match(normalized);
    const decodedMatches = this.trie.match(decoded);

    const variantMatches: MatchResult[] = [];
    for (const variant of variants) {
      // Skip the first variant if it equals the normalized text (already matched)
      if (variant === normalized) continue;
      variantMatches.push(...this.trie.match(variant));
    }

    // Step 7: merge and deduplicate by term+position
    const allMatches = [...normalizedMatches, ...decodedMatches, ...variantMatches];
    const merged = this.deduplicateMatches(allMatches);

    // Step 8: score
    const result = scoreSeverity(merged);

    // Step 9: log violation async if not clean and userId provided
    if (!result.clean && context?.userId) {
      this.logViolation(
        context.userId,
        context.context ?? 'unknown',
        context.field ?? 'unknown',
        text,
        result,
      ).catch((err) =>
        this.logger.warn(`Failed to log violation: ${err.message}`),
      );
    }

    return result;
  }

  async analyzeFields(
    fields: Record<string, string>,
    context?: { userId?: number; context?: string },
  ): Promise<Record<string, ScoredResult>> {
    const results: Record<string, ScoredResult> = {};

    for (const [field, text] of Object.entries(fields)) {
      const result = await this.analyzeText(text, {
        ...context,
        field,
      });

      results[field] = result;

      // Short-circuit: if any field is REJECT, stop early
      if (result.action === 'REJECT') {
        break;
      }
    }

    return results;
  }

  async reloadRules(): Promise<void> {
    this.trie.clear();
    await this.cache.del(CACHE_KEY);
    await this.loadRules();
    this.logger.log('Content filter rules reloaded');
  }

  async logViolation(
    userId: number,
    context: string,
    field: string,
    text: string,
    result: ScoredResult,
  ): Promise<void> {
    await this.prisma.contentFilterLog.create({
      data: {
        userId,
        context,
        field,
        inputText: text,
        severity: result.severity,
        action: result.action,
        matchedTerms: result.matches.map((m) => m.term),
      },
    });
  }

  // ── Private ──

  private async loadRules(): Promise<void> {
    const start = Date.now();

    // Try cache first
    let rules = await this.cache.get<CachedRule[]>(CACHE_KEY);

    if (!rules) {
      // Load from DB
      const dbRules = await this.prisma.contentFilterRule.findMany({
        where: { isActive: true },
        select: {
          term: true,
          category: true,
          severity: true,
          language: true,
        },
      });

      rules = dbRules;

      // Cache the rules
      await this.cache.set(CACHE_KEY, rules, CACHE_TTL);
    }

    // Build the trie
    for (const rule of rules) {
      const meta: TermMeta = {
        category: rule.category,
        severity: rule.severity,
      };
      this.trie.addTerm(rule.term, meta);
    }

    const elapsed = Date.now() - start;
    this.logger.log(
      `Loaded ${rules.length} content filter rules into trie (${elapsed}ms)`,
    );
  }

  private deduplicateMatches(matches: MatchResult[]): MatchResult[] {
    const seen = new Set<string>();
    const unique: MatchResult[] = [];

    for (const match of matches) {
      const key = `${match.term}@${match.position.start}:${match.position.end}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(match);
      }
    }

    return unique;
  }
}
