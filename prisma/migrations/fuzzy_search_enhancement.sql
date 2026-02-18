-- Fuzzy Search Enhancement: Enable phonetic matching + additional indexes
-- Run with: psql -f prisma/migrations/fuzzy_search_enhancement.sql

-- 1. Enable fuzzystrmatch extension (provides levenshtein, metaphone, soundex)
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

-- 2. Create trigram index on Brand.brandName for fuzzy brand matching
CREATE INDEX IF NOT EXISTS "Brand_brandName_trgm_idx"
  ON "Brand" USING GIN ("brandName" gin_trgm_ops);

-- 3. Create trigram GIN index on productName for word_similarity queries
--    (the existing trgm index already supports this, but explicit is better)
CREATE INDEX IF NOT EXISTS "Product_productName_word_trgm_idx"
  ON "Product" USING GIN ("productName" gin_trgm_ops);
