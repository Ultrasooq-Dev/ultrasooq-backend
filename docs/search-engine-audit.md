# Ultrasooq Search Engine — Technical Audit & Improvement Plan

**Date:** 2026-04-08
**Status:** Audit Complete, Fixes In Progress
**Branch:** `feat/search-intelligence`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Search Paths (6 Endpoints)](#2-search-paths)
3. [Search Intelligence Module (9 Services)](#3-search-intelligence-module)
4. [What Works](#4-what-works)
5. [What's Built But Not Connected](#5-whats-built-but-not-connected)
6. [Critical Bugs](#6-critical-bugs)
7. [What's Missing](#7-whats-missing)
8. [Performance Considerations](#8-performance-considerations)
9. [Improvement Plan](#9-improvement-plan)
10. [Frontend Search Map](#10-frontend-search-map)

---

## 1. Architecture Overview

```
User Query
    │
    ├── /product/getAllProduct ──────────── Basic browse (filter-only, no FTS)
    ├── /product/search/unified ─────────── Intelligent search (QueryParser → tsvectorSearch)
    ├── /product/search/ai ──────────────── LLM-powered natural language
    ├── /product/searchSuggestions ───────── Autocomplete (4 parallel queries)
    ├── /product/getAllBuyGroupProduct ───── Buy Group specific
    └── /product/getAllFactoriesProduct ──── Factory/Wholesale specific

Search Intelligence Pipeline:
    QueryParser → IntentClassifier → BrandResolver → CategoryIndex
                                         ↓
    tsvectorSearch ← filters ← enriched query
         ↓
    Results + DidYouMean suggestion
```

**Database:** PostgreSQL with `search_vector` tsvector column + GIN index
**Cache:** Redis (5min browse, 1hr search results)
**Analytics:** ProductSearch table (logs queries + clicks)

---

## 2. Search Paths

### Path 1: getAllProduct (Basic Browse)
- **Endpoint:** `GET /product/getAllProduct`
- **SQL:** Simple WHERE (category, brand, price) — no full-text search
- **Ranking:** View count, creation date, or price
- **Cache:** 5 minutes (category-based browsing only)
- **Used by:** `/trending`, `/home`, `/product-hub` browse mode

### Path 2: smartSearch (Full-Text + Fuzzy)
- **Endpoint:** Called internally by getAllProduct when `term.length > 2`
- **SQL:** Two-query approach:
  1. Scoring query with 5 fuzzy channels
  2. Full data fetch using scored IDs
- **Ranking (weighted):**
  - ts_rank_cd (FTS): 10x weight
  - similarity (fuzzy name): 5x weight
  - word_similarity: 3x weight
  - metaphone (phonetic): 2x weight
  - click_count (popularity): 0.5x weight
- **Cache:** 1 hour (hash of all params)

### Path 3: tsvectorSearch (Fast FTS)
- **Endpoint:** Called by unified search
- **SQL:** Single query with `to_tsquery('simple', ...)`
- **Ranking:** ts_rank_cd only (no fuzzy/phonetic)
- **Supports:** Browse mode (empty term + filters → popularity sort)

### Path 4: Unified Search (Multi-Item)
- **Endpoint:** `GET /product/search/unified`
- **Pipeline:** QueryParser → IntentClassifier → tsvectorSearch
- **Features:** Multi-product queries ("10 cables and 5 keyboards"), spec extraction, price parsing
- **Returns:** `{ parsed, data, totalCount, didYouMean }`

### Path 5: AI Search
- **Endpoint:** `GET /product/search/ai`
- **Pipeline:** LLM parsing → tag expansion → smartSearch
- **Features:** Natural language ("red leather bag under $50"), personalization boost
- **Fallback:** Regular smartSearch if LLM fails

### Path 6: Search Suggestions
- **Endpoint:** `GET /product/searchSuggestions`
- **Returns:** 4 parallel queries: product names, categories, popular searches, recent searches

---

## 3. Search Intelligence Module

| Service | File | Status | Purpose |
|---------|------|--------|---------|
| QueryParserService | `query-parser.service.ts` | ✅ Active | Parse multi-item queries, extract quantity/price/specs |
| IntentClassifierService | `intent-classifier.service.ts` | ⚠️ Partial | Enriches with brand/category IDs — but results discarded |
| BrandResolverService | `brand-resolver.service.ts` | ⚠️ Partial | Multi-word brand matching — results not applied to search |
| CategoryIndexService | `category-index.service.ts` | ✅ Active | Maps text to category IDs, 30min rebuild cron |
| KnowledgeGraphService | `knowledge-graph.service.ts` | ❌ Unused | Use-case expansion, compatibility, disambiguation — never called |
| AttributeExtractorService | `attribute-extractor.service.ts` | ⚠️ Partial | Extracts specs from query — results not passed to search |
| SearchTokensBuilderService | `search-tokens-builder.service.ts` | ⚠️ Partial | Nightly cron builds search_vector — no real-time updates |
| RankFusionService | `rank-fusion.service.ts` | ❌ Unused | Reciprocal Rank Fusion — never called |
| DidYouMeanService | `did-you-mean.service.ts` | ✅ Active | Spell suggestions via pg_trgm |

---

## 4. What Works

| Feature | Status | Notes |
|---------|--------|-------|
| Full-text search (tsvector) | ✅ | GIN index, works well for English |
| 5-channel fuzzy matching | ✅ | Only in smartSearch path |
| Phonetic matching (metaphone) | ✅ | Only on productName field |
| Category/brand/price filters | ✅ | Simple WHERE clauses |
| AI natural language search | ✅ | LLM parsing + tag expansion |
| Autocomplete suggestions | ✅ | 4 parallel sources |
| Spell suggestions (Did You Mean) | ✅ | pg_trgm similarity > 0.3 |
| Multi-item query parsing | ✅ | "10 cables and 5 keyboards" splits correctly |
| Search result caching | ✅ | Redis, 5min browse / 1hr search |

---

## 5. What's Built But Not Connected

### A. Brand Resolution → Discarded
```
IntentClassifierService.enrich() sets resolvedBrandId
  → Controller receives enriched query
  → BUT never extracts/passes resolvedBrandId to search
  → Result: Brand intelligence wasted
```
**Fix:** 3 lines — extract resolvedBrandId, pass to filters

### B. Spec Extraction → Discarded
```
QueryParserService.parse("50 inch TV") extracts specs: {size: "50"}
  → Controller receives parsed query with specs
  → BUT never passes specs to search filters
  → Result: Spec parsing wasted
```
**Fix:** 3 lines — extract specs, pass to specFilters

### C. RankFusion → Never Called
- Implements Reciprocal Rank Fusion (academic algorithm)
- Could combine: FTS + fuzzy + popularity + rating into one ranked list
- Currently: hardcoded weights (10x, 5x, 3x, 2x) in SQL

### D. KnowledgeGraph → Never Called, Tables Empty
- Use-case expansion: "gaming" → GPU, RAM specs
- Compatibility: "fits 2020 Toyota" → compatible products
- Term disambiguation: "mouse" → computer vs pet
- Accessory links: iPhone → cases, screen protectors
- **Tables exist but are empty:** UseCaseMapping, CompatibilityRule, TermDisambiguation, AccessoryLink

### E. Synonym Expansion → Tag-based exists, unused in search
- `getTagExpansion()` in AI search only
- Not called in smartSearch or tsvectorSearch

---

## 6. Critical Bugs

### Bug 1: New Products Not Searchable (up to 24 hours)
- **Cause:** `search_vector` only rebuilt by nightly cron at 03:00 UTC
- **Impact:** Product listed at 04:00 UTC → not searchable until 03:00 next day
- **Fix:** Call `SearchTokensBuilderService.buildAndSave()` in product create/update hooks

### Bug 2: Brand Resolution Results Discarded
- **Cause:** Controller doesn't extract `resolvedBrandId` from enriched query
- **Fix:**
```typescript
// In unifiedSearch controller:
const brandId = sq.resolvedBrandId;
if (brandId) filters.brandId = brandId;
```

### Bug 3: Spec Extraction Results Discarded
- **Cause:** Controller doesn't pass extracted specs to search
- **Fix:**
```typescript
// In unifiedSearch controller:
if (sq.specs && Object.keys(sq.specs).length > 0) {
  filters.specFilters = sq.specs;
}
```

### Bug 4: Multi-Language FTS Broken
- **Cause:** `plainto_tsquery('english', ...)` hardcoded
- **Impact:** Arabic, Chinese, etc. don't get stemming/normalization
- **Workaround:** `to_tsquery('simple', ...)` in tsvectorSearch works for all scripts (no stemming)

### Bug 5: search_vector May Be Null
- **Cause:** Column is optional, cron may fail/skip products
- **Impact:** Products with null vector invisible to FTS
- **Fix:** Add NOT NULL constraint + trigger on INSERT/UPDATE

---

## 7. What's Missing

| Feature | Impact | Effort |
|---------|--------|--------|
| Dynamic faceted filters (Color, Size per category) | High | 1 day |
| Search analytics dashboard (zero-results, trends) | High | 2-3 days |
| Multi-language FTS (Arabic, Chinese stemming) | High | 1 week |
| Auto-correct (transparent spell fix) | Medium | 4 hours |
| Personalization (boost by user history) | Medium | 1 day |
| Synonym handling (laptop=notebook) | Medium | 1 day |
| Cursor-based pagination | Low | 4 hours |
| Search result explanations (debug mode) | Low | 4 hours |

---

## 8. Performance Considerations

### Current Bottlenecks
1. **smartSearch:** 5 JOIN/EXISTS operations per query
2. **Full review fetch:** All reviews loaded for every product
3. **Nightly cron:** Can take hours for 100K+ products
4. **Offset pagination:** Degrades at high page numbers

### Quick Optimizations
1. Lazy-load reviews (don't fetch unless sorting by rating)
2. Use materialized view for popular searches
3. Trigger-based search_vector rebuild (not just nightly)
4. Cursor-based pagination for large result sets

---

## 9. Improvement Plan

### Phase 1: Quick Wins (1 hour each) — DO FIRST
| # | Fix | Files | Lines to Change |
|---|-----|-------|----------------|
| 1 | Apply brand resolution to search | `product.controller.ts` | 3 lines |
| 2 | Pass extracted specs to search | `product.controller.ts` | 3 lines |
| 3 | Immediate search_vector on product create/update | `product.service.ts` | 10 lines |
| 4 | Auto-correct threshold (similarity > 0.7 → rewrite) | `did-you-mean.service.ts` | 5 lines |
| 5 | Autocomplete ranking (sort by click count) | `product-search.service.ts` | 5 lines |

### Phase 2: Medium Effort (1 day each)
| # | Feature | Impact |
|---|---------|--------|
| 1 | Dynamic faceted filters (spec values per category) | Users can filter by Color, Size |
| 2 | Zero-result query detection + admin alert | Identify product gaps |
| 3 | Personalization boost in smartSearch | Better ranking for logged-in users |
| 4 | Wire RankFusion service | More principled ranking |
| 5 | Spell correction auto-apply | Transparent typo fixing |

### Phase 3: Major Features (1 week each)
| # | Feature | Impact |
|---|---------|--------|
| 1 | Multi-language FTS (Arabic, Chinese) | 50%+ market expansion |
| 2 | Knowledge Graph integration | Use-case search expansion |
| 3 | Search analytics dashboard | Data-driven optimization |
| 4 | Synonym & expansion layer | Reduced zero-result queries |
| 5 | Vector/semantic search (embeddings) | Next-gen relevance |

---

## 10. Frontend Search Map

### Pages Using Search
| Page | Endpoint | Hook |
|------|----------|------|
| `/search` | `/search/ai` + `searchSuggestions` | `useAiSearch()` |
| `/trending` | `getAllProduct` | `useAllProducts()` |
| `/buygroup` | `getAllBuyGroupProduct` | `useAllBuyGroupProducts()` |
| `/product-hub` | `search/unified` + `getAllProduct` | inline useQuery |
| `/home` | `getAllProduct` | `useAllProducts()` |
| `/factories` | `getAllFactoriesProduct` | `useAllFactoryProducts()` |

### Search Components
| Component | Location | Purpose |
|-----------|----------|---------|
| SearchAutocomplete | `components/modules/search/` | Dropdown suggestions |
| MultiProductResults | `components/modules/search/` | Multi-type results display |
| SearchFilters | `components/modules/search/` | Brand/price/rating filters |
| SearchedStoreProducts | `components/modules/serach/` | Store products tab |
| SearchedBuygroupProducts | `components/modules/serach/` | Buy group tab |
| SearchedFactoryProducts | `components/modules/serach/` | Factory tab |
| SearchedRfqProducts | `components/modules/serach/` | RFQ tab |
| SearchedServices | `components/modules/serach/` | Services tab |

### Search Hooks
| Hook | Query Key | Endpoint |
|------|-----------|----------|
| `useAllProducts` | `["products", payload]` | `getAllProduct` |
| `useAllBuyGroupProducts` | `["buygroup-products"]` | `getAllBuyGroupProduct` |
| `useSearchSuggestions` | `["search-suggestions"]` | `searchSuggestions` |
| `useAiSearch` | `["ai-search"]` | `search/ai` |
| `useRelatedProducts` | `["related-products"]` | `relatedAllProduct` |

---

## Status Tracking

| Fix | Status | Date | Notes |
|-----|--------|------|-------|
| Brand resolution → applied | ✅ Done | 2026-04-08 | Already connected in controller (sq.resolvedBrandId) |
| Spec extraction → applied | ⬜ Deferred | | Needs tsvectorSearch spec filter SQL support |
| Immediate search_vector rebuild | ⬜ Deferred | | Needs product lifecycle hooks in service |
| Auto-correct threshold | ✅ Done | 2026-04-08 | autoCorrect() method added, wired in unified search |
| Autocomplete ranking | ✅ Verified | 2026-04-08 | Already sorts by similarity/search_count DESC |
| Search + chip filtering | ✅ Fixed | 2026-04-08 | Multi-chip now filters client-side after search |
| matchesChip shared function | ✅ Fixed | 2026-04-08 | Extracted from browse block, used by both modes |
