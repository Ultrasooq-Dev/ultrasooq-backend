-- Migration: Add RFQ location fields and product type
-- Date: 2025-11-24
-- Description: Add location IDs to RfqQuoteAddress and UserBranch, add productType to RFQCart and RfqQuotesProducts
-- SAFE: All new columns are nullable, no data loss

-- =============================================
-- 1. Add productType to RFQCart
-- =============================================
ALTER TABLE "RFQCart" 
ADD COLUMN IF NOT EXISTS "productType" VARCHAR(10);

-- Set default value for existing records (optional, can be done via application logic)
-- UPDATE "RFQCart" SET "productType" = 'SAME' WHERE "productType" IS NULL;

COMMENT ON COLUMN "RFQCart"."productType" IS 'Product type: SAME or SIMILAR';

-- =============================================
-- 2. Add location fields to RfqQuoteAddress
-- =============================================
ALTER TABLE "RfqQuoteAddress" 
ADD COLUMN IF NOT EXISTS "countryId" INTEGER,
ADD COLUMN IF NOT EXISTS "stateId" INTEGER,
ADD COLUMN IF NOT EXISTS "cityId" INTEGER;

-- Add foreign key constraints (optional, only if Countries/States/Cities tables exist)
-- ALTER TABLE "RfqQuoteAddress" 
-- ADD CONSTRAINT "RfqQuoteAddress_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ALTER TABLE "RfqQuoteAddress" 
-- ADD CONSTRAINT "RfqQuoteAddress_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "States"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ALTER TABLE "RfqQuoteAddress" 
-- ADD CONSTRAINT "RfqQuoteAddress_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "Cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS "RfqQuoteAddress_countryId_idx" ON "RfqQuoteAddress"("countryId");
CREATE INDEX IF NOT EXISTS "RfqQuoteAddress_stateId_idx" ON "RfqQuoteAddress"("stateId");
CREATE INDEX IF NOT EXISTS "RfqQuoteAddress_cityId_idx" ON "RfqQuoteAddress"("cityId");

COMMENT ON COLUMN "RfqQuoteAddress"."countryId" IS 'Foreign key to Countries table';
COMMENT ON COLUMN "RfqQuoteAddress"."stateId" IS 'Foreign key to States table';
COMMENT ON COLUMN "RfqQuoteAddress"."cityId" IS 'Foreign key to Cities table';

-- =============================================
-- 3. Add location fields to UserBranch
-- =============================================
ALTER TABLE "UserBranch" 
ADD COLUMN IF NOT EXISTS "countryId" INTEGER,
ADD COLUMN IF NOT EXISTS "stateId" INTEGER,
ADD COLUMN IF NOT EXISTS "cityId" INTEGER;

-- Add foreign key constraints (optional)
-- ALTER TABLE "UserBranch" 
-- ADD CONSTRAINT "UserBranch_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ALTER TABLE "UserBranch" 
-- ADD CONSTRAINT "UserBranch_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "States"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ALTER TABLE "UserBranch" 
-- ADD CONSTRAINT "UserBranch_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "Cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS "UserBranch_countryId_idx" ON "UserBranch"("countryId");
CREATE INDEX IF NOT EXISTS "UserBranch_stateId_idx" ON "UserBranch"("stateId");
CREATE INDEX IF NOT EXISTS "UserBranch_cityId_idx" ON "UserBranch"("cityId");

COMMENT ON COLUMN "UserBranch"."countryId" IS 'Foreign key to Countries table';
COMMENT ON COLUMN "UserBranch"."stateId" IS 'Foreign key to States table';
COMMENT ON COLUMN "UserBranch"."cityId" IS 'Foreign key to Cities table';

-- =============================================
-- 4. Add productType to RfqQuotesProducts
-- =============================================
ALTER TABLE "RfqQuotesProducts" 
ADD COLUMN IF NOT EXISTS "productType" VARCHAR(10);

-- Set default value for existing records (optional)
-- UPDATE "RfqQuotesProducts" SET "productType" = 'SAME' WHERE "productType" IS NULL;

COMMENT ON COLUMN "RfqQuotesProducts"."productType" IS 'Product type: SAME or SIMILAR';

-- =============================================
-- 5. Verification queries (run these to check)
-- =============================================
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'RFQCart' AND column_name = 'productType';

-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'RfqQuoteAddress' AND column_name IN ('countryId', 'stateId', 'cityId');

-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'UserBranch' AND column_name IN ('countryId', 'stateId', 'cityId');

-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'RfqQuotesProducts' AND column_name = 'productType';

-- =============================================
-- Migration completed successfully
-- =============================================

