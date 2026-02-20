-- Safe migration to add scrapMarkup field to Product table
-- This migration is safe and will not cause any data loss
-- The column is nullable, so existing records will have NULL values

-- Add scrapMarkup column if it doesn't exist (using DECIMAL(10,2) to support larger values)
ALTER TABLE "Product" 
ADD COLUMN IF NOT EXISTS "scrapMarkup" DECIMAL(10,2);

-- If column already exists with smaller precision, alter it to support larger values
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Product' 
        AND column_name = 'scrapMarkup' 
        AND numeric_precision = 8
    ) THEN
        ALTER TABLE "Product" ALTER COLUMN "scrapMarkup" TYPE DECIMAL(10,2);
    END IF;
END $$;

-- Add comment to document the field
COMMENT ON COLUMN "Product"."scrapMarkup" IS 'Markup amount applied when admin adds scraped product. NULL for products not added via scrap bulk add.';

