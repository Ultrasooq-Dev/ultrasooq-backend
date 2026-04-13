# Content Filter Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a non-AI, multi-layer text analysis system that detects and blocks inappropriate content across all user-generated text, with admin UI for rule management and violation tracking.

**Architecture:** 5-layer in-process pipeline (normalize → decode → transliterate → match → score) running at ~2-5ms per field. Rules in PostgreSQL + Redis cache. Async violation logging. NestJS pipe for automatic controller integration. Admin panel with TanStack Start for rule CRUD + violation dashboard.

**Tech Stack:** NestJS 11, Prisma 7, Redis (ioredis), class-validator, TanStack Start/Router/Query, shadcn/ui, Zod

---

## File Structure

### Backend (`backend/src/content-filter/`)

| File | Responsibility |
|------|---------------|
| `content-filter.module.ts` | NestJS module registration |
| `content-filter.service.ts` | Main API: `analyzeText()`, `analyzeFields()`, rule cache, violation logging |
| `content-filter.controller.ts` | Admin endpoints: CRUD rules, violations, risky users, test |
| `dto/create-filter-rule.dto.ts` | Validation for rule creation |
| `dto/update-filter-rule.dto.ts` | Validation for rule updates |
| `dto/filter-log-query.dto.ts` | Query params for violation logs |
| `decorators/filterable.decorator.ts` | `@Filterable()` field marker |
| `pipes/content-filter.pipe.ts` | NestJS pipe that auto-filters `@Filterable()` fields |
| `layers/normalizer.layer.ts` | Layer 1: Unicode normalization, zero-width char removal |
| `layers/leetspeak.layer.ts` | Layer 2: Leetspeak/symbol decoding |
| `layers/transliteration.layer.ts` | Layer 3: Arabic↔Latin mapping |
| `layers/pattern-matcher.layer.ts` | Layer 4: Trie-based term matching |
| `layers/severity-scorer.layer.ts` | Layer 5: Aggregate matches → severity + action |
| `data/base-rules-en.json` | ~2,000 English banned terms |
| `data/base-rules-ar.json` | ~500 Arabic banned terms |
| `data/leetspeak-map.json` | Character substitution map |

### Database (`backend/prisma/`)

| Change | Details |
|--------|---------|
| Add `ContentFilterRule` model | term, pattern, category, severity, language, isActive |
| Add `ContentFilterLog` model | userId, context, field, inputText, severity, action, matchedTerms |
| Add relation on `User` | `contentFilterLogs ContentFilterLog[]` |
| Migration | `npx prisma migrate dev --name content_filter` |
| Seed | `prisma/seed-filter-rules.ts` — base rules from JSON files |

### Admin (`admin/src/`)

| File | Responsibility |
|------|---------------|
| `apis/requests/content-filter.requests.ts` | Axios calls to admin endpoints |
| `apis/queries/content-filter.queries.ts` | TanStack Query hooks |
| `routes/_app/user/content-filter/index.tsx` | Rules list + add/edit + violation log tabs |
| `routes/_app/user/content-filter/$id.tsx` | Rule detail/edit page |
| Update `lib/permissions.ts` | Add `CONTENT_FILTER` permission |
| Update `components/layouts/app-sidebar.tsx` | Add sidebar item |

---

## Task 1: Prisma Schema + Migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: migration via `npx prisma migrate dev`

- [ ] **Step 1: Add ContentFilterRule model to schema**

Add after the `CategoryMapping` model (~line 3711):

```prisma
model ContentFilterRule {
  id        Int      @id @default(autoincrement())
  term      String
  pattern   String?
  category  String   // adult, profanity, hate_speech, drugs, scam, weapons
  severity  String   // MILD, MODERATE, SEVERE
  language  String   @default("en")
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([term, language])
  @@index([isActive, language])
  @@index([category])
}

model ContentFilterLog {
  id           Int      @id @default(autoincrement())
  userId       Int
  context      String
  field        String
  inputText    String
  severity     String
  action       String
  matchedTerms Json
  createdAt    DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([severity])
  @@index([createdAt])
  @@index([userId, severity])
}
```

- [ ] **Step 2: Add relation on User model**

In the `User` model, add:
```prisma
contentFilterLogs ContentFilterLog[]
```

- [ ] **Step 3: Run migration**

```bash
cd backend && npx prisma migrate dev --name content_filter
```

- [ ] **Step 4: Generate client**

```bash
npx prisma generate
```

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(content-filter): add ContentFilterRule and ContentFilterLog models"
```

---

## Task 2: Leetspeak Map + Base Rule Data Files

**Files:**
- Create: `backend/src/content-filter/data/leetspeak-map.json`
- Create: `backend/src/content-filter/data/base-rules-en.json`
- Create: `backend/src/content-filter/data/base-rules-ar.json`

- [ ] **Step 1: Create leetspeak-map.json**

```json
{
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s",
  "7": "t", "8": "b", "9": "g", "@": "a", "$": "s",
  "!": "i", "|": "l", "(": "c", ")": "c", "{": "c",
  "+": "t", "^": "a", "~": "n", "€": "e", "£": "l",
  "¥": "y", "ü": "u", "ö": "o", "ä": "a", "ß": "ss",
  "ph": "f", "kk": "ck", "xx": "x"
}
```

- [ ] **Step 2: Create base-rules-en.json**

Structure — array of rule objects:
```json
[
  { "term": "porn", "category": "adult", "severity": "SEVERE" },
  { "term": "xxx", "category": "adult", "severity": "SEVERE" },
  { "term": "nude", "category": "adult", "severity": "SEVERE" },
  { "term": "sex toy", "category": "adult", "severity": "SEVERE" },
  { "term": "erotic", "category": "adult", "severity": "SEVERE" },
  { "term": "escort", "category": "adult", "severity": "SEVERE" },
  { "term": "prostitut", "category": "adult", "severity": "SEVERE" },
  { "term": "orgasm", "category": "adult", "severity": "SEVERE" },
  { "term": "fetish", "category": "adult", "severity": "SEVERE" },
  { "term": "hentai", "category": "adult", "severity": "SEVERE" },
  { "term": "milf", "category": "adult", "severity": "SEVERE" },
  { "term": "bdsm", "category": "adult", "severity": "SEVERE" },
  { "term": "threesome", "category": "adult", "severity": "SEVERE" },
  { "term": "stripper", "category": "adult", "severity": "SEVERE" },
  { "term": "anal", "category": "adult", "severity": "SEVERE" },
  { "term": "blowjob", "category": "adult", "severity": "SEVERE" },
  { "term": "dildo", "category": "adult", "severity": "SEVERE" },
  { "term": "vibrator", "category": "adult", "severity": "SEVERE" },
  { "term": "fuck", "category": "profanity", "severity": "MODERATE" },
  { "term": "shit", "category": "profanity", "severity": "MODERATE" },
  { "term": "bitch", "category": "profanity", "severity": "MODERATE" },
  { "term": "asshole", "category": "profanity", "severity": "MODERATE" },
  { "term": "bastard", "category": "profanity", "severity": "MODERATE" },
  { "term": "dick", "category": "profanity", "severity": "MODERATE" },
  { "term": "cunt", "category": "profanity", "severity": "SEVERE" },
  { "term": "nigger", "category": "hate_speech", "severity": "SEVERE" },
  { "term": "faggot", "category": "hate_speech", "severity": "SEVERE" },
  { "term": "retard", "category": "hate_speech", "severity": "SEVERE" },
  { "term": "cocaine", "category": "drugs", "severity": "SEVERE" },
  { "term": "heroin", "category": "drugs", "severity": "SEVERE" },
  { "term": "meth", "category": "drugs", "severity": "SEVERE" },
  { "term": "marijuana", "category": "drugs", "severity": "MODERATE" },
  { "term": "weed", "category": "drugs", "severity": "MODERATE" },
  { "term": "scam", "category": "scam", "severity": "MODERATE" },
  { "term": "fraud", "category": "scam", "severity": "MODERATE" },
  { "term": "counterfeit", "category": "scam", "severity": "MODERATE" },
  { "term": "fake product", "category": "scam", "severity": "MODERATE" },
  { "term": "gun", "category": "weapons", "severity": "SEVERE" },
  { "term": "firearm", "category": "weapons", "severity": "SEVERE" },
  { "term": "ammunition", "category": "weapons", "severity": "SEVERE" },
  { "term": "explosive", "category": "weapons", "severity": "SEVERE" },
  { "term": "damn", "category": "profanity", "severity": "MILD" },
  { "term": "hell", "category": "profanity", "severity": "MILD" },
  { "term": "crap", "category": "profanity", "severity": "MILD" },
  { "term": "ass", "category": "profanity", "severity": "MILD" },
  { "term": "suck", "category": "profanity", "severity": "MILD" },
  { "term": "piss", "category": "profanity", "severity": "MILD" }
]
```

Note: This is the starter set (~50 terms). The full file will contain ~2,000 terms covering all categories. Build the complete list by expanding each category systematically.

- [ ] **Step 3: Create base-rules-ar.json**

Arabic terms — same structure, `"language": "ar"` implied:
```json
[
  { "term": "شرموطة", "category": "profanity", "severity": "SEVERE" },
  { "term": "كلب", "category": "profanity", "severity": "MODERATE" },
  { "term": "حمار", "category": "profanity", "severity": "MILD" },
  { "term": "زنا", "category": "adult", "severity": "SEVERE" },
  { "term": "عاهرة", "category": "adult", "severity": "SEVERE" },
  { "term": "قحبة", "category": "profanity", "severity": "SEVERE" },
  { "term": "منيك", "category": "profanity", "severity": "SEVERE" },
  { "term": "طيز", "category": "profanity", "severity": "MODERATE" },
  { "term": "كس", "category": "profanity", "severity": "SEVERE" },
  { "term": "زب", "category": "profanity", "severity": "SEVERE" },
  { "term": "مخدرات", "category": "drugs", "severity": "SEVERE" },
  { "term": "حشيش", "category": "drugs", "severity": "SEVERE" },
  { "term": "سلاح", "category": "weapons", "severity": "SEVERE" },
  { "term": "احتيال", "category": "scam", "severity": "MODERATE" },
  { "term": "نصب", "category": "scam", "severity": "MODERATE" }
]
```

Note: Starter set (~15 terms). Full file will contain ~500 terms. Include transliterated variants (sharmouta, kos, zeb, etc.) for Layer 3 matching.

- [ ] **Step 4: Commit**

```bash
git add src/content-filter/data/
git commit -m "feat(content-filter): add base rule data files and leetspeak map"
```

---

## Task 3: Layer 1 — Unicode Normalizer

**Files:**
- Create: `backend/src/content-filter/layers/normalizer.layer.ts`
- Create: `backend/src/content-filter/layers/normalizer.layer.spec.ts`

- [ ] **Step 1: Write tests**

```typescript
// normalizer.layer.spec.ts
import { normalize } from './normalizer.layer';

describe('NormalizerLayer', () => {
  it('removes zero-width characters', () => {
    expect(normalize('p\u200Born')).toBe('porn');
    expect(normalize('he\u200Dllo')).toBe('hello');
    expect(normalize('te\uFEFFst')).toBe('test');
  });

  it('normalizes unicode confusables to ASCII', () => {
    expect(normalize('ℎ𝑒𝑙𝑙𝑜')).toContain('hello');
    expect(normalize('ⓕⓤⓒⓚ')).toBe('fuck');
  });

  it('lowercases text', () => {
    expect(normalize('HELLO World')).toBe('hello world');
  });

  it('collapses repeated characters', () => {
    expect(normalize('fuuuuuck')).toBe('fuuck');
    expect(normalize('shiiiit')).toBe('shiit');
  });

  it('strips diacritics/accents', () => {
    expect(normalize('fùçk')).toBe('fuck');
    expect(normalize('shît')).toBe('shit');
  });

  it('normalizes whitespace', () => {
    expect(normalize('f  u  c  k')).toBe('f u c k');
    expect(normalize('p\to\tr\tn')).toBe('p o r n');
  });

  it('handles empty/null input', () => {
    expect(normalize('')).toBe('');
    expect(normalize(null as any)).toBe('');
    expect(normalize(undefined as any)).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx jest src/content-filter/layers/normalizer.layer.spec.ts --no-coverage
```

- [ ] **Step 3: Implement normalizer**

```typescript
// normalizer.layer.ts

// Zero-width characters to strip
const ZERO_WIDTH_RE = /[\u200B\u200C\u200D\u200E\u200F\uFEFF\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u2060\u2061\u2062\u2063\u2064\u206A-\u206F\uFFA0]/g;

// Unicode confusables → ASCII (common ones used for evasion)
const CONFUSABLES: Record<string, string> = {
  '\u24D0': 'a', '\u24D1': 'b', '\u24D2': 'c', '\u24D3': 'd', '\u24D4': 'e',
  '\u24D5': 'f', '\u24D6': 'g', '\u24D7': 'h', '\u24D8': 'i', '\u24D9': 'j',
  '\u24DA': 'k', '\u24DB': 'l', '\u24DC': 'm', '\u24DD': 'n', '\u24DE': 'o',
  '\u24DF': 'p', '\u24E0': 'q', '\u24E1': 'r', '\u24E2': 's', '\u24E3': 't',
  '\u24E4': 'u', '\u24E5': 'v', '\u24E6': 'w', '\u24E7': 'x', '\u24E8': 'y',
  '\u24E9': 'z',
  // Fullwidth Latin
  '\uFF41': 'a', '\uFF42': 'b', '\uFF43': 'c', '\uFF44': 'd', '\uFF45': 'e',
  '\uFF46': 'f', '\uFF47': 'g', '\uFF48': 'h', '\uFF49': 'i', '\uFF4A': 'j',
  '\uFF4B': 'k', '\uFF4C': 'l', '\uFF4D': 'm', '\uFF4E': 'n', '\uFF4F': 'o',
  '\uFF50': 'p', '\uFF51': 'q', '\uFF52': 'r', '\uFF53': 's', '\uFF54': 't',
  '\uFF55': 'u', '\uFF56': 'v', '\uFF57': 'w', '\uFF58': 'x', '\uFF59': 'y',
  '\uFF5A': 'z',
  // Mathematical italic/bold
  '\uD835\uDC89': 'h', '\uD835\uDC8E': 'e', '\uD835\uDC8F': 'l', '\uD835\uDC90': 'l',
  '\uD835\uDC91': 'o',
};

const CONFUSABLE_RE = new RegExp(
  `[${Object.keys(CONFUSABLES).join('')}]`, 'g',
);

export function normalize(text: string): string {
  if (!text) return '';

  let result = text;

  // Step 1: Remove zero-width characters
  result = result.replace(ZERO_WIDTH_RE, '');

  // Step 2: Replace known confusables
  result = result.replace(CONFUSABLE_RE, (ch) => CONFUSABLES[ch] || ch);

  // Step 3: NFD decompose → strip combining marks (diacritics) → NFC
  result = result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Step 4: Lowercase
  result = result.toLowerCase();

  // Step 5: Collapse repeated chars (3+ → 2)
  result = result.replace(/(.)\1{2,}/g, '$1$1');

  // Step 6: Normalize whitespace (tabs, multiple spaces → single space)
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest src/content-filter/layers/normalizer.layer.spec.ts --no-coverage
```

- [ ] **Step 5: Commit**

```bash
git add src/content-filter/layers/normalizer.layer.ts src/content-filter/layers/normalizer.layer.spec.ts
git commit -m "feat(content-filter): add Layer 1 — Unicode normalizer"
```

---

## Task 4: Layer 2 — Leetspeak Decoder

**Files:**
- Create: `backend/src/content-filter/layers/leetspeak.layer.ts`
- Create: `backend/src/content-filter/layers/leetspeak.layer.spec.ts`

- [ ] **Step 1: Write tests**

```typescript
import { decodeLeetspeak } from './leetspeak.layer';

describe('LeetspeakLayer', () => {
  it('decodes number substitutions', () => {
    expect(decodeLeetspeak('p0rn')).toBe('porn');
    expect(decodeLeetspeak('s3x')).toBe('sex');
    expect(decodeLeetspeak('a55')).toBe('ass');
  });

  it('decodes symbol substitutions', () => {
    expect(decodeLeetspeak('$h!t')).toBe('shit');
    expect(decodeLeetspeak('f@ck')).toBe('fack');
    expect(decodeLeetspeak('a$$')).toBe('ass');
  });

  it('handles mixed normal and leet', () => {
    expect(decodeLeetspeak('n1ce product')).toBe('nice product');
  });

  it('preserves normal text', () => {
    expect(decodeLeetspeak('hello world')).toBe('hello world');
  });

  it('returns both original and decoded for multi-pass matching', () => {
    const result = decodeLeetspeak('p0rn');
    expect(result).toBe('porn');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Implement leetspeak decoder**

```typescript
// leetspeak.layer.ts
import leetspeakMap from '../data/leetspeak-map.json';

const LEET_MAP: Record<string, string> = leetspeakMap;

// Build regex from map keys, longest first for multi-char substitutions
const sortedKeys = Object.keys(LEET_MAP).sort((a, b) => b.length - a.length);
const LEET_RE = new RegExp(
  sortedKeys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'gi',
);

export function decodeLeetspeak(text: string): string {
  if (!text) return '';
  return text.replace(LEET_RE, (match) => LEET_MAP[match.toLowerCase()] || match);
}
```

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Commit**

```bash
git add src/content-filter/layers/leetspeak.*
git commit -m "feat(content-filter): add Layer 2 — Leetspeak decoder"
```

---

## Task 5: Layer 3 — Arabic Transliteration

**Files:**
- Create: `backend/src/content-filter/layers/transliteration.layer.ts`
- Create: `backend/src/content-filter/layers/transliteration.layer.spec.ts`

- [ ] **Step 1: Write tests**

```typescript
import { transliterate } from './transliteration.layer';

describe('TransliterationLayer', () => {
  it('converts common Arabic profanity transliterations to matchable form', () => {
    expect(transliterate('sharmouta')).toContain('شرموطة');
    expect(transliterate('sharmota')).toContain('شرموطة');
    expect(transliterate('kos')).toContain('كس');
  });

  it('returns both original and transliterated for matching', () => {
    const results = transliterate('sharmouta');
    expect(Array.isArray(results)).toBe(true);
    expect(results).toContain('sharmouta');
  });

  it('handles non-transliterable text', () => {
    const results = transliterate('hello world');
    expect(results).toContain('hello world');
  });
});
```

- [ ] **Step 2: Run tests**
- [ ] **Step 3: Implement transliteration layer**

The layer maintains a map of known Latin→Arabic transliterations for banned terms. It returns an array of variants (original + transliterated) so the pattern matcher can check both.

```typescript
// transliteration.layer.ts

// Known Latin-written Arabic profanity → Arabic script equivalents
const TRANSLIT_MAP: Record<string, string[]> = {
  'sharmouta': ['شرموطة', 'شرموطه'],
  'sharmota': ['شرموطة', 'شرموطه'],
  'sharmout': ['شرموط'],
  'kos': ['كس'],
  'koss': ['كس'],
  'zeb': ['زب'],
  'zebi': ['زبي'],
  'manyak': ['منيك', 'منياك'],
  'manyok': ['منيوك'],
  'teez': ['طيز'],
  'tiz': ['طيز'],
  'a7a': ['احا'],
  'aha': ['احا'],
  'ibn el sharmouta': ['ابن الشرموطة'],
  'ya kalb': ['يا كلب'],
  'ya 7mar': ['يا حمار'],
  'ya hmar': ['يا حمار'],
  'khara': ['خرا', 'خره'],
  'khra': ['خرا'],
  'hashish': ['حشيش'],
  '7ashish': ['حشيش'],
  'mokhadarat': ['مخدرات'],
};

// Normalize input for lookup (lowercase, collapse repeated chars)
function normalizeForLookup(text: string): string {
  return text.toLowerCase().replace(/(.)\1{2,}/g, '$1$1');
}

export function transliterate(text: string): string[] {
  if (!text) return [''];

  const normalized = normalizeForLookup(text);
  const variants: string[] = [text];

  // Check for known transliterations as substrings
  for (const [latin, arabicVariants] of Object.entries(TRANSLIT_MAP)) {
    if (normalized.includes(latin)) {
      variants.push(...arabicVariants);
    }
  }

  return variants;
}
```

- [ ] **Step 4: Run tests**
- [ ] **Step 5: Commit**

```bash
git add src/content-filter/layers/transliteration.*
git commit -m "feat(content-filter): add Layer 3 — Arabic transliteration"
```

---

## Task 6: Layer 4 — Trie-Based Pattern Matcher

**Files:**
- Create: `backend/src/content-filter/layers/pattern-matcher.layer.ts`
- Create: `backend/src/content-filter/layers/pattern-matcher.layer.spec.ts`

- [ ] **Step 1: Write tests**

```typescript
import { TrieMatcher, type MatchResult } from './pattern-matcher.layer';

describe('PatternMatcher', () => {
  let matcher: TrieMatcher;

  beforeEach(() => {
    matcher = new TrieMatcher();
    matcher.addTerm('porn', { category: 'adult', severity: 'SEVERE' });
    matcher.addTerm('fuck', { category: 'profanity', severity: 'MODERATE' });
    matcher.addTerm('sex toy', { category: 'adult', severity: 'SEVERE' });
    matcher.addTerm('damn', { category: 'profanity', severity: 'MILD' });
  });

  it('finds exact matches', () => {
    const results = matcher.match('this is porn');
    expect(results).toHaveLength(1);
    expect(results[0].term).toBe('porn');
    expect(results[0].category).toBe('adult');
  });

  it('finds multi-word terms', () => {
    const results = matcher.match('selling a sex toy here');
    expect(results).toHaveLength(1);
    expect(results[0].term).toBe('sex toy');
  });

  it('finds multiple matches', () => {
    const results = matcher.match('fuck this damn thing');
    expect(results).toHaveLength(2);
  });

  it('does not match partial words (word boundary)', () => {
    const results = matcher.match('the pornography of essays');
    // 'porn' should still match as a substring within 'pornography'
    expect(results).toHaveLength(1);
  });

  it('returns positions', () => {
    const results = matcher.match('this is porn here');
    expect(results[0].position.start).toBe(8);
    expect(results[0].position.end).toBe(12);
  });

  it('returns empty for clean text', () => {
    const results = matcher.match('beautiful high quality headphones');
    expect(results).toHaveLength(0);
  });

  it('handles empty input', () => {
    expect(matcher.match('')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests**
- [ ] **Step 3: Implement Trie matcher**

```typescript
// pattern-matcher.layer.ts

export interface TermMeta {
  category: string;
  severity: string;
}

export interface MatchResult {
  term: string;
  category: string;
  severity: string;
  position: { start: number; end: number };
}

interface TrieNode {
  children: Map<string, TrieNode>;
  isEnd: boolean;
  meta?: TermMeta;
  term?: string; // original term stored at leaf
}

export class TrieMatcher {
  private root: TrieNode = { children: new Map(), isEnd: false };

  addTerm(term: string, meta: TermMeta): void {
    const normalized = term.toLowerCase();
    let node = this.root;
    for (const char of normalized) {
      if (!node.children.has(char)) {
        node.children.set(char, { children: new Map(), isEnd: false });
      }
      node = node.children.get(char)!;
    }
    node.isEnd = true;
    node.meta = meta;
    node.term = normalized;
  }

  match(text: string): MatchResult[] {
    if (!text) return [];

    const normalized = text.toLowerCase();
    const results: MatchResult[] = [];
    const seen = new Set<string>(); // deduplicate overlapping matches

    for (let i = 0; i < normalized.length; i++) {
      let node = this.root;
      for (let j = i; j < normalized.length; j++) {
        const char = normalized[j];
        if (!node.children.has(char)) break;
        node = node.children.get(char)!;

        if (node.isEnd && node.meta && node.term) {
          const key = `${node.term}@${i}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push({
              term: node.term,
              category: node.meta.category,
              severity: node.meta.severity,
              position: { start: i, end: j + 1 },
            });
          }
        }
      }
    }

    return results;
  }

  get size(): number {
    let count = 0;
    const walk = (node: TrieNode) => {
      if (node.isEnd) count++;
      for (const child of node.children.values()) walk(child);
    };
    walk(this.root);
    return count;
  }
}
```

- [ ] **Step 4: Run tests**
- [ ] **Step 5: Commit**

```bash
git add src/content-filter/layers/pattern-matcher.*
git commit -m "feat(content-filter): add Layer 4 — Trie-based pattern matcher"
```

---

## Task 7: Layer 5 — Severity Scorer

**Files:**
- Create: `backend/src/content-filter/layers/severity-scorer.layer.ts`
- Create: `backend/src/content-filter/layers/severity-scorer.layer.spec.ts`

- [ ] **Step 1: Write tests**

```typescript
import { scoreSeverity, type ScoredResult } from './severity-scorer.layer';
import { type MatchResult } from './pattern-matcher.layer';

describe('SeverityScorer', () => {
  it('returns NONE/ALLOW for no matches', () => {
    const result = scoreSeverity([]);
    expect(result.severity).toBe('NONE');
    expect(result.action).toBe('ALLOW');
    expect(result.clean).toBe(true);
  });

  it('returns SEVERE/REJECT for severe matches', () => {
    const matches: MatchResult[] = [
      { term: 'porn', category: 'adult', severity: 'SEVERE', position: { start: 0, end: 4 } },
    ];
    const result = scoreSeverity(matches);
    expect(result.severity).toBe('SEVERE');
    expect(result.action).toBe('REJECT');
    expect(result.clean).toBe(false);
    expect(result.userMessage).toBe('Content violates our community guidelines. Please revise.');
  });

  it('returns MODERATE/FLAG for moderate matches', () => {
    const matches: MatchResult[] = [
      { term: 'fuck', category: 'profanity', severity: 'MODERATE', position: { start: 0, end: 4 } },
    ];
    const result = scoreSeverity(matches);
    expect(result.severity).toBe('MODERATE');
    expect(result.action).toBe('FLAG');
    expect(result.userMessage).toContain('under review');
  });

  it('returns MILD/ALLOW for mild matches', () => {
    const matches: MatchResult[] = [
      { term: 'damn', category: 'profanity', severity: 'MILD', position: { start: 0, end: 4 } },
    ];
    const result = scoreSeverity(matches);
    expect(result.severity).toBe('MILD');
    expect(result.action).toBe('ALLOW');
  });

  it('escalates to highest severity when mixed', () => {
    const matches: MatchResult[] = [
      { term: 'damn', category: 'profanity', severity: 'MILD', position: { start: 0, end: 4 } },
      { term: 'porn', category: 'adult', severity: 'SEVERE', position: { start: 10, end: 14 } },
    ];
    const result = scoreSeverity(matches);
    expect(result.severity).toBe('SEVERE');
    expect(result.action).toBe('REJECT');
  });
});
```

- [ ] **Step 2: Run tests**
- [ ] **Step 3: Implement scorer**

```typescript
// severity-scorer.layer.ts
import { type MatchResult } from './pattern-matcher.layer';

export interface ScoredResult {
  clean: boolean;
  severity: 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE';
  action: 'ALLOW' | 'FLAG' | 'REJECT';
  matches: MatchResult[];
  userMessage: string;
}

const SEVERITY_ORDER = { NONE: 0, MILD: 1, MODERATE: 2, SEVERE: 3 } as const;

const SEVERITY_TO_ACTION: Record<string, 'ALLOW' | 'FLAG' | 'REJECT'> = {
  NONE: 'ALLOW',
  MILD: 'ALLOW',
  MODERATE: 'FLAG',
  SEVERE: 'REJECT',
};

const USER_MESSAGES: Record<string, string> = {
  NONE: '',
  MILD: '',
  MODERATE: 'Your submission is under review and will be visible after approval.',
  SEVERE: 'Content violates our community guidelines. Please revise.',
};

export function scoreSeverity(matches: MatchResult[]): ScoredResult {
  if (matches.length === 0) {
    return { clean: true, severity: 'NONE', action: 'ALLOW', matches: [], userMessage: '' };
  }

  // Highest severity wins
  let maxSeverity: keyof typeof SEVERITY_ORDER = 'MILD';
  for (const m of matches) {
    const sev = m.severity as keyof typeof SEVERITY_ORDER;
    if ((SEVERITY_ORDER[sev] || 0) > SEVERITY_ORDER[maxSeverity]) {
      maxSeverity = sev;
    }
  }

  const action = SEVERITY_TO_ACTION[maxSeverity];

  // For SEVERE: strip matched terms from userMessage (don't reveal filter rules)
  // For MODERATE: tell user which general category was flagged
  // For MILD: no message
  let userMessage = USER_MESSAGES[maxSeverity];
  if (maxSeverity === 'MODERATE') {
    const categories = [...new Set(matches.filter(m => m.severity === 'MODERATE').map(m => m.category))];
    userMessage = `Your submission contains content flagged as "${categories.join(', ')}". It will be reviewed before publishing.`;
  }

  return {
    clean: false,
    severity: maxSeverity as ScoredResult['severity'],
    action,
    matches,
    userMessage,
  };
}
```

- [ ] **Step 4: Run tests**
- [ ] **Step 5: Commit**

```bash
git add src/content-filter/layers/severity-scorer.*
git commit -m "feat(content-filter): add Layer 5 — Severity scorer"
```

---

## Task 8: Content Filter Service (orchestrator)

**Files:**
- Create: `backend/src/content-filter/content-filter.service.ts`
- Create: `backend/src/content-filter/content-filter.service.spec.ts`

- [ ] **Step 1: Write tests**

Test the main `analyzeText()` method end-to-end through all 5 layers:

```typescript
import { Test } from '@nestjs/testing';
import { ContentFilterService } from './content-filter.service';

describe('ContentFilterService', () => {
  let service: ContentFilterService;
  let mockPrisma: any;
  let mockCache: any;

  beforeEach(async () => {
    mockPrisma = {
      contentFilterRule: { findMany: jest.fn().mockResolvedValue([
        { id: 1, term: 'porn', category: 'adult', severity: 'SEVERE', language: 'en', isActive: true },
        { id: 2, term: 'fuck', category: 'profanity', severity: 'MODERATE', language: 'en', isActive: true },
        { id: 3, term: 'damn', category: 'profanity', severity: 'MILD', language: 'en', isActive: true },
      ]) },
      contentFilterLog: { create: jest.fn().mockResolvedValue({}) },
    };
    mockCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        ContentFilterService,
        { provide: 'PrismaService', useValue: mockPrisma },
        { provide: 'CacheService', useValue: mockCache },
      ],
    }).compile();

    service = module.get(ContentFilterService);
    await service.onModuleInit(); // loads rules
  });

  it('allows clean text', async () => {
    const result = await service.analyzeText('Beautiful wireless headphones');
    expect(result.clean).toBe(true);
    expect(result.action).toBe('ALLOW');
  });

  it('rejects severe content', async () => {
    const result = await service.analyzeText('selling porn here');
    expect(result.clean).toBe(false);
    expect(result.severity).toBe('SEVERE');
    expect(result.action).toBe('REJECT');
  });

  it('catches leetspeak evasion', async () => {
    const result = await service.analyzeText('p0rn for sale');
    expect(result.action).toBe('REJECT');
  });

  it('catches unicode evasion', async () => {
    const result = await service.analyzeText('p\u200Born');
    expect(result.action).toBe('REJECT');
  });

  it('flags moderate content', async () => {
    const result = await service.analyzeText('what the fuck');
    expect(result.action).toBe('FLAG');
  });

  it('allows mild content silently', async () => {
    const result = await service.analyzeText('damn good product');
    expect(result.action).toBe('ALLOW');
    expect(result.clean).toBe(false);
    expect(result.severity).toBe('MILD');
  });

  it('logs violations asynchronously', async () => {
    await service.analyzeText('selling porn', { userId: 1, context: 'product_create', field: 'description' });
    // wait for async log
    await new Promise(r => setTimeout(r, 50));
    expect(mockPrisma.contentFilterLog.create).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests**
- [ ] **Step 3: Implement service**

The service orchestrates the 5 layers, manages the rule cache, and handles async logging. Key methods:

- `onModuleInit()` — load rules from DB → build Trie → cache in Redis
- `analyzeText(text, context?)` — run pipeline, return result, log async
- `analyzeFields(fields: Record<string, string>, context?)` — batch analyze multiple fields
- `reloadRules()` — called when admin updates rules, invalidates cache
- `logViolation()` — async fire-and-forget DB write

- [ ] **Step 4: Run tests**
- [ ] **Step 5: Commit**

```bash
git add src/content-filter/content-filter.service.*
git commit -m "feat(content-filter): add main ContentFilterService orchestrator"
```

---

## Task 9: Filterable Decorator + Content Filter Pipe

**Files:**
- Create: `backend/src/content-filter/decorators/filterable.decorator.ts`
- Create: `backend/src/content-filter/pipes/content-filter.pipe.ts`

- [ ] **Step 1: Implement @Filterable() decorator**

```typescript
// decorators/filterable.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const FILTERABLE_KEY = 'content-filter:filterable';

export function Filterable(): PropertyDecorator {
  return (target, propertyKey) => {
    const existing: string[] = Reflect.getMetadata(FILTERABLE_KEY, target.constructor) || [];
    Reflect.defineMetadata(FILTERABLE_KEY, [...existing, propertyKey as string], target.constructor);
  };
}

export function getFilterableFields(dto: object): string[] {
  return Reflect.getMetadata(FILTERABLE_KEY, dto.constructor) || [];
}
```

- [ ] **Step 2: Implement ContentFilterPipe**

```typescript
// pipes/content-filter.pipe.ts
import { PipeTransform, Injectable, BadRequestException, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { ContentFilterService } from '../content-filter.service';
import { getFilterableFields } from '../decorators/filterable.decorator';

@Injectable()
export class ContentFilterPipe implements PipeTransform {
  constructor(
    private readonly filterService: ContentFilterService,
    @Inject(REQUEST) private readonly request: any,
  ) {}

  async transform(value: any) {
    if (!value || typeof value !== 'object') return value;

    const fields = getFilterableFields(value);
    if (fields.length === 0) return value;

    const userId = this.request?.user?.id;
    const context = this.request?.route?.path || 'unknown';

    for (const field of fields) {
      const text = value[field];
      if (!text || typeof text !== 'string') continue;

      const result = await this.filterService.analyzeText(text, {
        userId,
        context,
        field,
      });

      if (result.action === 'REJECT') {
        throw new BadRequestException({
          statusCode: 400,
          message: result.userMessage,
          field,
          severity: result.severity,
        });
      }

      // Attach filter metadata for service layer to check
      if (!value.__contentFilter) value.__contentFilter = {};
      value.__contentFilter[field] = result;
    }

    return value;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/content-filter/decorators/ src/content-filter/pipes/
git commit -m "feat(content-filter): add @Filterable decorator and ContentFilterPipe"
```

---

## Task 10: DTOs + Controller (Admin Endpoints)

**Files:**
- Create: `backend/src/content-filter/dto/create-filter-rule.dto.ts`
- Create: `backend/src/content-filter/dto/update-filter-rule.dto.ts`
- Create: `backend/src/content-filter/dto/filter-log-query.dto.ts`
- Create: `backend/src/content-filter/content-filter.controller.ts`

- [ ] **Step 1: Create DTOs**

- [ ] **Step 2: Implement controller with these endpoints:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/content-filter/rules` | List rules (paginated, filterable by category/language/severity) |
| POST | `/admin/content-filter/rules` | Create rule |
| PATCH | `/admin/content-filter/rules/:id` | Update rule |
| DELETE | `/admin/content-filter/rules/:id` | Delete rule |
| POST | `/admin/content-filter/test` | Test text against filter (dry run, no logging) |
| GET | `/admin/content-filter/violations` | List violations (paginated, filterable) |
| GET | `/admin/content-filter/users/risky` | Users ranked by risk score |
| GET | `/admin/content-filter/users/:userId/violations` | User violation history |
| GET | `/admin/content-filter/stats` | Dashboard stats (total rules, violations today, top categories) |

All endpoints protected by `@UseGuards(SuperAdminAuthGuard)`.

- [ ] **Step 3: Commit**

```bash
git add src/content-filter/dto/ src/content-filter/content-filter.controller.ts
git commit -m "feat(content-filter): add admin controller with CRUD + violation endpoints"
```

---

## Task 11: Module Registration + Rule Seeder

**Files:**
- Create: `backend/src/content-filter/content-filter.module.ts`
- Modify: `backend/src/app.module.ts`
- Create: `backend/prisma/seed-filter-rules.ts`

- [ ] **Step 1: Create module**

```typescript
@Module({
  imports: [AuthModule],
  controllers: [ContentFilterController],
  providers: [ContentFilterService],
  exports: [ContentFilterService, ContentFilterPipe],
})
export class ContentFilterModule {}
```

- [ ] **Step 2: Register in app.module.ts**

Add `ContentFilterModule` to the imports array.

- [ ] **Step 3: Create seed-filter-rules.ts**

Reads `base-rules-en.json` and `base-rules-ar.json`, upserts all rules into `ContentFilterRule` table.

- [ ] **Step 4: Run seed**

```bash
cd backend && npx ts-node --project prisma/tsconfig.seed.json prisma/seed-filter-rules.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/content-filter/content-filter.module.ts src/app.module.ts prisma/seed-filter-rules.ts
git commit -m "feat(content-filter): register module + seed base filter rules"
```

---

## Task 12: Integrate Pipe Into Existing Controllers

**Files:**
- Modify: `backend/src/product/dto/create-product.dto.ts` — add `@Filterable()`
- Modify: `backend/src/product/product.controller.ts` — add pipe to create/update/review/Q&A
- Modify: `backend/src/chat/chat.gateway.ts` — add direct service call
- Modify: `backend/src/user/user.controller.ts` — add pipe to profile update
- Modify: `backend/src/service/dto/` — add `@Filterable()`

- [ ] **Step 1: Add @Filterable() to product DTOs**
- [ ] **Step 2: Add ContentFilterPipe to product controller methods**
- [ ] **Step 3: Add direct filter call in chat gateway**
- [ ] **Step 4: Add @Filterable() to user profile and service DTOs**
- [ ] **Step 5: Test each integration point manually via Swagger**
- [ ] **Step 6: Commit**

```bash
git add src/product/ src/chat/ src/user/ src/service/
git commit -m "feat(content-filter): integrate pipe into product, chat, user, service modules"
```

---

## Task 13: Admin Panel — API Layer

**Files:**
- Create: `admin/src/apis/requests/content-filter.requests.ts`
- Create: `admin/src/apis/queries/content-filter.queries.ts`

- [ ] **Step 1: Create request functions**

All calls to `/admin/content-filter/*` endpoints.

- [ ] **Step 2: Create query hooks**

`useFilterRules()`, `useCreateFilterRule()`, `useUpdateFilterRule()`, `useDeleteFilterRule()`, `useFilterViolations()`, `useRiskyUsers()`, `useUserViolations()`, `useFilterStats()`, `useTestFilter()`

- [ ] **Step 3: Commit**

```bash
cd admin && git add src/apis/requests/content-filter.requests.ts src/apis/queries/content-filter.queries.ts
git commit -m "feat(content-filter): add admin API layer for content filter"
```

---

## Task 14: Admin Panel — Content Filter Page (Rules Tab)

**Files:**
- Create: `admin/src/routes/_app/user/content-filter/index.tsx`
- Modify: `admin/src/lib/permissions.ts`
- Modify: `admin/src/components/layouts/app-sidebar.tsx`

- [ ] **Step 1: Add permission and sidebar entry**

Add `CONTENT_FILTER: 'manage_content_filter'` to permissions. Add sidebar item under "System" group with `ShieldAlert` icon.

- [ ] **Step 2: Create content filter page with 3 tabs**

**Tab 1: Rules** — DataTable of all rules with:
- Columns: Term, Category (badge), Severity (badge color), Language, Status toggle, Actions
- Add Rule dialog (inline form)
- Edit/Delete actions
- Filter by category, severity, language
- Search by term

**Tab 2: Violations** — DataTable of violation logs:
- Columns: Date, User, Context, Field, Severity (badge), Action, Matched Terms
- Click row to see full input text
- Filter by severity, date range, context

**Tab 3: Risky Users** — Risk score leaderboard:
- Columns: User, Email, Total Violations, Severe Count, Risk Score, Last Violation
- Click to see user's violation history

- [ ] **Step 3: Add test filter dialog**

A "Test Filter" button that opens a dialog where admin can paste text and see the filter result in real-time (calls `/admin/content-filter/test`).

- [ ] **Step 4: Commit**

```bash
cd admin && git add src/routes/_app/user/content-filter/ src/lib/permissions.ts src/components/layouts/app-sidebar.tsx
git commit -m "feat(content-filter): add admin panel with rules, violations, risky users tabs"
```

---

## Task 15: Admin Panel — Rule Detail/Edit Page

**Files:**
- Create: `admin/src/routes/_app/user/content-filter/$id.tsx`

- [ ] **Step 1: Create rule detail page**

Form with: term, pattern (regex, optional), category (select), severity (select), language (select), isActive (switch).

Create mode (`id === 'new'`) and edit mode.

- [ ] **Step 2: Commit**

```bash
cd admin && git add src/routes/_app/user/content-filter/$id.tsx
git commit -m "feat(content-filter): add rule detail/edit page"
```

---

## Task 16: End-to-End Testing

- [ ] **Step 1: Test via Swagger** — POST a product with profanity, verify rejection
- [ ] **Step 2: Test leetspeak evasion** — POST "p0rn" in product name, verify caught
- [ ] **Step 3: Test Unicode evasion** — POST text with zero-width chars, verify caught
- [ ] **Step 4: Test admin panel** — Add rule, edit rule, delete rule, view violations
- [ ] **Step 5: Test risk scoring** — Create multiple violations for one user, check risky users endpoint
- [ ] **Step 6: Commit any fixes**

```bash
git commit -m "test(content-filter): end-to-end verification complete"
```
