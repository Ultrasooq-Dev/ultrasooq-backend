-- Smart Search Migration: PostgreSQL Full-Text Search + Trigram
-- Run with: psql -f prisma/migrations/smart_search.sql

-- 1. Enable pg_trgm extension for fuzzy/typo matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Add search_vector column to Product table
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;

-- 3. Create GIN index for full-text search
CREATE INDEX IF NOT EXISTS "Product_search_vector_idx"
  ON "Product" USING GIN ("search_vector");

-- 4. Create trigram index for fuzzy matching on productName
CREATE INDEX IF NOT EXISTS "Product_productName_trgm_idx"
  ON "Product" USING GIN ("productName" gin_trgm_ops);

-- 5. Populate search_vector for existing products
-- Weight A = productName (highest priority)
-- Weight B = SKU
-- Weight C = shortDescription
-- Weight D = full description
UPDATE "Product" p SET "search_vector" = (
  setweight(to_tsvector('english', COALESCE(p."productName", '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(p."skuNo", '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(p."shortDescription", '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(p."description", '')), 'D')
);

-- 6. Create trigger function to auto-update search_vector on INSERT/UPDATE
CREATE OR REPLACE FUNCTION product_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."search_vector" :=
    setweight(to_tsvector('english', COALESCE(NEW."productName", '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW."skuNo", '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW."shortDescription", '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW."description", '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Create trigger (drop first if exists for idempotency)
DROP TRIGGER IF EXISTS product_search_vector_trigger ON "Product";
CREATE TRIGGER product_search_vector_trigger
  BEFORE INSERT OR UPDATE OF "productName", "skuNo", "shortDescription", "description"
  ON "Product"
  FOR EACH ROW
  EXECUTE FUNCTION product_search_vector_update();

-- 8. Create materialized view for popular searches (used by autocomplete)
DROP MATERIALIZED VIEW IF EXISTS popular_searches;
CREATE MATERIALIZED VIEW popular_searches AS
SELECT
  LOWER(TRIM("searchTerm")) as term,
  COUNT(*) as search_count,
  COUNT(DISTINCT "userId") as unique_users,
  MAX("createdAt") as last_searched
FROM "ProductSearch"
WHERE "deletedAt" IS NULL
  AND "createdAt" > NOW() - INTERVAL '30 days'
GROUP BY LOWER(TRIM("searchTerm"))
HAVING COUNT(*) >= 2
ORDER BY search_count DESC
LIMIT 500;

CREATE UNIQUE INDEX IF NOT EXISTS popular_searches_term_idx
  ON popular_searches (term);
