-- ============================================================================
-- Migration: Convert Product.id from Int autoincrement to String cuid
-- ============================================================================
-- Strategy:
--   1. Add new TEXT id columns to Product and all FK tables.
--   2. Populate Product.id_new with cuids (done via separate Node script
--      before applying this SQL — this file expects __cuid_map to be a JSON
--      column populated externally).
--   3. Update each FK table's productId_new from Product.id_new lookup.
--   4. Drop old FK constraints and old Int columns.
--   5. Rename new columns and re-add constraints.
--
-- This file is run via Prisma migrate, but requires the data conversion step
-- in `seed-cuid-ids.ts` to run first.
-- ============================================================================

-- Step 0: Capture old → new id mapping in a temp table seeded by the Node
--         conversion script. Created here as a regular table for safety.
CREATE TABLE IF NOT EXISTS "_product_id_map" (
  "old_id" INTEGER PRIMARY KEY,
  "new_id" TEXT NOT NULL UNIQUE
);

-- Note: rows in _product_id_map are inserted by the Node script (seed-cuid-ids)
-- BEFORE this migration runs. If the table is empty, the migration will fail
-- below at the NOT NULL constraint.

-- ─── Step 1: Add new id columns to Product ─────────────────────────────────
ALTER TABLE "Product" ADD COLUMN "id_new" TEXT;
ALTER TABLE "Product" ADD COLUMN "originalProductId_new" TEXT;

-- Populate Product.id_new from the map
UPDATE "Product" SET "id_new" = m."new_id"
  FROM "_product_id_map" m WHERE "Product"."id" = m."old_id";

-- Populate Product.originalProductId_new from the map (where not null)
UPDATE "Product" SET "originalProductId_new" = m."new_id"
  FROM "_product_id_map" m WHERE "Product"."originalProductId" = m."old_id";

-- ─── Step 2: Add productId_new to all FK tables and populate ──────────────
-- Tables with productId Int FK to Product.id
ALTER TABLE "Cart" ADD COLUMN "productId_new" TEXT;
UPDATE "Cart" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "Cart"."productId" = m."old_id";

ALTER TABLE "CartProductService" ADD COLUMN "productId_new" TEXT;
UPDATE "CartProductService" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "CartProductService"."productId" = m."old_id";

ALTER TABLE "CustomizeProduct" ADD COLUMN "productId_new" TEXT;
UPDATE "CustomizeProduct" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "CustomizeProduct"."productId" = m."old_id";

ALTER TABLE "FactoriesCart" ADD COLUMN "productId_new" TEXT;
UPDATE "FactoriesCart" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "FactoriesCart"."productId" = m."old_id";

ALTER TABLE "OrderProductService" ADD COLUMN "productId_new" TEXT;
UPDATE "OrderProductService" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "OrderProductService"."productId" = m."old_id";

ALTER TABLE "OrderProducts" ADD COLUMN "productId_new" TEXT;
UPDATE "OrderProducts" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "OrderProducts"."productId" = m."old_id";

ALTER TABLE "ProductClick" ADD COLUMN "productId_new" TEXT;
UPDATE "ProductClick" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "ProductClick"."productId" = m."old_id";

ALTER TABLE "ProductImages" ADD COLUMN "productId_new" TEXT;
UPDATE "ProductImages" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "ProductImages"."productId" = m."old_id";

ALTER TABLE "ProductPrice" ADD COLUMN "productId_new" TEXT;
UPDATE "ProductPrice" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "ProductPrice"."productId" = m."old_id";

ALTER TABLE "ProductReview" ADD COLUMN "productId_new" TEXT;
UPDATE "ProductReview" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "ProductReview"."productId" = m."old_id";

ALTER TABLE "ProductSearch" ADD COLUMN "productId_new" TEXT;
UPDATE "ProductSearch" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "ProductSearch"."productId" = m."old_id";

ALTER TABLE "ProductSellCity" ADD COLUMN "productId_new" TEXT;
UPDATE "ProductSellCity" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "ProductSellCity"."productId" = m."old_id";

ALTER TABLE "ProductSellCountry" ADD COLUMN "productId_new" TEXT;
UPDATE "ProductSellCountry" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "ProductSellCountry"."productId" = m."old_id";

ALTER TABLE "ProductSellState" ADD COLUMN "productId_new" TEXT;
UPDATE "ProductSellState" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "ProductSellState"."productId" = m."old_id";

ALTER TABLE "ProductShortDescription" ADD COLUMN "productId_new" TEXT;
UPDATE "ProductShortDescription" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "ProductShortDescription"."productId" = m."old_id";

ALTER TABLE "ProductSpecification" ADD COLUMN "productId_new" TEXT;
UPDATE "ProductSpecification" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "ProductSpecification"."productId" = m."old_id";

ALTER TABLE "ProductTags" ADD COLUMN "productId_new" TEXT;
UPDATE "ProductTags" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "ProductTags"."productId" = m."old_id";

ALTER TABLE "ProductVariant" ADD COLUMN "productId_new" TEXT;
UPDATE "ProductVariant" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "ProductVariant"."productId" = m."old_id";

ALTER TABLE "ProductView" ADD COLUMN "productId_new" TEXT;
UPDATE "ProductView" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "ProductView"."productId" = m."old_id";

ALTER TABLE "RFQCart" ADD COLUMN "productId_new" TEXT;
UPDATE "RFQCart" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "RFQCart"."productId" = m."old_id";

ALTER TABLE "RFQProduct" ADD COLUMN "productId_new" TEXT;
UPDATE "RFQProduct" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "RFQProduct"."productId" = m."old_id";

ALTER TABLE "RfqQuotesProducts" ADD COLUMN "rfqProductId_new" TEXT;
UPDATE "RfqQuotesProducts" SET "rfqProductId_new" = m."new_id" FROM "_product_id_map" m WHERE "RfqQuotesProducts"."rfqProductId" = m."old_id";

ALTER TABLE "RfqSuggestedProduct" ADD COLUMN "suggestedProductId_new" TEXT;
UPDATE "RfqSuggestedProduct" SET "suggestedProductId_new" = m."new_id" FROM "_product_id_map" m WHERE "RfqSuggestedProduct"."suggestedProductId" = m."old_id";

ALTER TABLE "SellerReward" ADD COLUMN "productId_new" TEXT;
UPDATE "SellerReward" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "SellerReward"."productId" = m."old_id";

ALTER TABLE "SharedLink" ADD COLUMN "productId_new" TEXT;
UPDATE "SharedLink" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "SharedLink"."productId" = m."old_id";

ALTER TABLE "Wishlist" ADD COLUMN "productId_new" TEXT;
UPDATE "Wishlist" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "Wishlist"."productId" = m."old_id";

ALTER TABLE "compatibility_rules" ADD COLUMN "productId_new" TEXT;
UPDATE "compatibility_rules" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "compatibility_rules"."productId" = m."old_id";

ALTER TABLE "product_category_map" ADD COLUMN "productId_new" TEXT;
UPDATE "product_category_map" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "product_category_map"."productId" = m."old_id";

ALTER TABLE "product_spec_value" ADD COLUMN "productId_new" TEXT;
UPDATE "product_spec_value" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "product_spec_value"."productId" = m."old_id";

ALTER TABLE "recommendation_feedback" ADD COLUMN "productId_new" TEXT;
UPDATE "recommendation_feedback" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "recommendation_feedback"."productId" = m."old_id";

ALTER TABLE "scraped_auto_part" ADD COLUMN "productId_new" TEXT;
UPDATE "scraped_auto_part" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "scraped_auto_part"."productId" = m."old_id";

ALTER TABLE "scraped_product_raw" ADD COLUMN "productId_new" TEXT;
UPDATE "scraped_product_raw" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "scraped_product_raw"."productId" = m."old_id";

ALTER TABLE "ProductPriceReview" ADD COLUMN "productId_new" TEXT;
UPDATE "ProductPriceReview" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "ProductPriceReview"."productId" = m."old_id";

ALTER TABLE "ProductQuestion" ADD COLUMN "productId_new" TEXT;
UPDATE "ProductQuestion" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "ProductQuestion"."productId" = m."old_id";

ALTER TABLE "ProductQuestionAnswer" ADD COLUMN "productId_new" TEXT;
UPDATE "ProductQuestionAnswer" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "ProductQuestionAnswer"."productId" = m."old_id";

ALTER TABLE "FactoriesRequest" ADD COLUMN "productId_new" TEXT;
UPDATE "FactoriesRequest" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "FactoriesRequest"."productId" = m."old_id";

ALTER TABLE "ProductDuplicateFactories" ADD COLUMN "productId_new" TEXT;
UPDATE "ProductDuplicateFactories" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "ProductDuplicateFactories"."productId" = m."old_id";

ALTER TABLE "ProductDuplicateRfq" ADD COLUMN "productId_new" TEXT;
UPDATE "ProductDuplicateRfq" SET "productId_new" = m."new_id" FROM "_product_id_map" m WHERE "ProductDuplicateRfq"."productId" = m."old_id";

-- ─── Step 3: Drop FK constraints from all dependent tables ─────────────────
-- Discover and drop existing FK constraints dynamically.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tc.table_name, tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'Product'
      AND ccu.column_name = 'id'
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.table_name, r.constraint_name);
  END LOOP;
END $$;

-- ─── Step 4: Drop old Int productId columns and rename new columns ────────
ALTER TABLE "Cart" DROP COLUMN "productId"; ALTER TABLE "Cart" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "CartProductService" DROP COLUMN "productId"; ALTER TABLE "CartProductService" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "CustomizeProduct" DROP COLUMN "productId"; ALTER TABLE "CustomizeProduct" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "FactoriesCart" DROP COLUMN "productId"; ALTER TABLE "FactoriesCart" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "OrderProductService" DROP COLUMN "productId"; ALTER TABLE "OrderProductService" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "OrderProducts" DROP COLUMN "productId"; ALTER TABLE "OrderProducts" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "ProductClick" DROP COLUMN "productId"; ALTER TABLE "ProductClick" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "ProductImages" DROP COLUMN "productId"; ALTER TABLE "ProductImages" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "ProductPrice" DROP COLUMN "productId"; ALTER TABLE "ProductPrice" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "ProductReview" DROP COLUMN "productId"; ALTER TABLE "ProductReview" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "ProductSearch" DROP COLUMN "productId"; ALTER TABLE "ProductSearch" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "ProductSellCity" DROP COLUMN "productId"; ALTER TABLE "ProductSellCity" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "ProductSellCountry" DROP COLUMN "productId"; ALTER TABLE "ProductSellCountry" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "ProductSellState" DROP COLUMN "productId"; ALTER TABLE "ProductSellState" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "ProductShortDescription" DROP COLUMN "productId"; ALTER TABLE "ProductShortDescription" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "ProductSpecification" DROP COLUMN "productId"; ALTER TABLE "ProductSpecification" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "ProductTags" DROP COLUMN "productId"; ALTER TABLE "ProductTags" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "ProductVariant" DROP COLUMN "productId"; ALTER TABLE "ProductVariant" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "ProductView" DROP COLUMN "productId"; ALTER TABLE "ProductView" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "RFQCart" DROP COLUMN "productId"; ALTER TABLE "RFQCart" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "RFQProduct" DROP COLUMN "productId"; ALTER TABLE "RFQProduct" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "RfqQuotesProducts" DROP COLUMN "rfqProductId"; ALTER TABLE "RfqQuotesProducts" RENAME COLUMN "rfqProductId_new" TO "rfqProductId";
ALTER TABLE "RfqSuggestedProduct" DROP COLUMN "suggestedProductId"; ALTER TABLE "RfqSuggestedProduct" RENAME COLUMN "suggestedProductId_new" TO "suggestedProductId";
ALTER TABLE "SellerReward" DROP COLUMN "productId"; ALTER TABLE "SellerReward" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "SharedLink" DROP COLUMN "productId"; ALTER TABLE "SharedLink" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "Wishlist" DROP COLUMN "productId"; ALTER TABLE "Wishlist" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "compatibility_rules" DROP COLUMN "productId"; ALTER TABLE "compatibility_rules" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "product_category_map" DROP COLUMN "productId"; ALTER TABLE "product_category_map" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "product_spec_value" DROP COLUMN "productId"; ALTER TABLE "product_spec_value" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "recommendation_feedback" DROP COLUMN "productId"; ALTER TABLE "recommendation_feedback" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "scraped_auto_part" DROP COLUMN "productId"; ALTER TABLE "scraped_auto_part" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "scraped_product_raw" DROP COLUMN "productId"; ALTER TABLE "scraped_product_raw" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "ProductPriceReview" DROP COLUMN "productId"; ALTER TABLE "ProductPriceReview" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "ProductQuestion" DROP COLUMN "productId"; ALTER TABLE "ProductQuestion" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "ProductQuestionAnswer" DROP COLUMN "productId"; ALTER TABLE "ProductQuestionAnswer" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "FactoriesRequest" DROP COLUMN "productId"; ALTER TABLE "FactoriesRequest" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "ProductDuplicateFactories" DROP COLUMN "productId"; ALTER TABLE "ProductDuplicateFactories" RENAME COLUMN "productId_new" TO "productId";
ALTER TABLE "ProductDuplicateRfq" DROP COLUMN "productId"; ALTER TABLE "ProductDuplicateRfq" RENAME COLUMN "productId_new" TO "productId";

-- ─── Step 5: Swap Product.id and Product.originalProductId ─────────────────
-- Drop primary key on old id
ALTER TABLE "Product" DROP CONSTRAINT "Product_pkey";
-- Drop the old originalProductId Int column and old id column
ALTER TABLE "Product" DROP COLUMN "originalProductId";
ALTER TABLE "Product" DROP COLUMN "id";
-- Rename new columns
ALTER TABLE "Product" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "Product" RENAME COLUMN "originalProductId_new" TO "originalProductId";
-- Make id NOT NULL and primary key
ALTER TABLE "Product" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "Product" ADD CONSTRAINT "Product_pkey" PRIMARY KEY ("id");

-- ─── Step 6: Re-add FK constraints ─────────────────────────────────────────
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "CartProductService" ADD CONSTRAINT "CartProductService_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "CustomizeProduct" ADD CONSTRAINT "CustomizeProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "FactoriesCart" ADD CONSTRAINT "FactoriesCart_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "OrderProductService" ADD CONSTRAINT "OrderProductService_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "OrderProducts" ADD CONSTRAINT "OrderProducts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ProductClick" ADD CONSTRAINT "ProductClick_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ProductImages" ADD CONSTRAINT "ProductImages_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ProductSearch" ADD CONSTRAINT "ProductSearch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ProductSellCity" ADD CONSTRAINT "ProductSellCity_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ProductSellCountry" ADD CONSTRAINT "ProductSellCountry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ProductSellState" ADD CONSTRAINT "ProductSellState_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ProductShortDescription" ADD CONSTRAINT "ProductShortDescription_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ProductSpecification" ADD CONSTRAINT "ProductSpecification_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ProductTags" ADD CONSTRAINT "ProductTags_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductView" ADD CONSTRAINT "ProductView_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "RFQCart" ADD CONSTRAINT "RFQCart_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "RFQProduct" ADD CONSTRAINT "RFQProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "RfqQuotesProducts" ADD CONSTRAINT "RfqQuotesProducts_rfqProductId_fkey" FOREIGN KEY ("rfqProductId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "RfqSuggestedProduct" ADD CONSTRAINT "RfqSuggestedProduct_suggestedProductId_fkey" FOREIGN KEY ("suggestedProductId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "SellerReward" ADD CONSTRAINT "SellerReward_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "SharedLink" ADD CONSTRAINT "SharedLink_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Wishlist" ADD CONSTRAINT "Wishlist_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "compatibility_rules" ADD CONSTRAINT "compatibility_rules_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "product_category_map" ADD CONSTRAINT "product_category_map_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "product_spec_value" ADD CONSTRAINT "product_spec_value_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "recommendation_feedback" ADD CONSTRAINT "recommendation_feedback_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "scraped_auto_part" ADD CONSTRAINT "scraped_auto_part_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "scraped_product_raw" ADD CONSTRAINT "scraped_product_raw_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_originalProductId_fkey" FOREIGN KEY ("originalProductId") REFERENCES "Product"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ─── Step 7: Cleanup ────────────────────────────────────────────────────────
DROP TABLE "_product_id_map";
