-- Fix scrapMarkup column precision to support larger values
-- This fixes the "numeric field overflow" error
-- DECIMAL(8,2) can only hold values up to 999,999.99
-- DECIMAL(10,2) can hold values up to 99,999,999.99

-- Check if column exists and alter its precision
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Product' 
        AND column_name = 'scrapMarkup'
    ) THEN
        -- Column exists, alter it to support larger values
        ALTER TABLE "Product" ALTER COLUMN "scrapMarkup" TYPE DECIMAL(10,2);
        RAISE NOTICE 'Column scrapMarkup precision updated to DECIMAL(10,2)';
    ELSE
        -- Column doesn't exist, create it with correct precision
        ALTER TABLE "Product" ADD COLUMN "scrapMarkup" DECIMAL(10,2);
        COMMENT ON COLUMN "Product"."scrapMarkup" IS 'Markup amount applied when admin adds scraped product. NULL for products not added via scrap bulk add.';
        RAISE NOTICE 'Column scrapMarkup created with DECIMAL(10,2)';
    END IF;
END $$;

