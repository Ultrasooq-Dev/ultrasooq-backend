-- Update dropship product type to 'D'
-- This script adds 'D' to the ProductType enum and updates existing dropship products

-- Step 1: Add 'D' to the ProductType enum (if not already exists)
DO $$ 
BEGIN
    -- Check if 'D' already exists in the enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'D' 
        AND enumtypid = (
            SELECT oid FROM pg_type WHERE typname = 'ProductType'
        )
    ) THEN
        -- Add 'D' to the ProductType enum
        ALTER TYPE "ProductType" ADD VALUE 'D';
    END IF;
END $$;

-- Step 2: Update existing dropship products to use 'D' product type
UPDATE "Product" 
SET "productType" = 'D' 
WHERE "isDropshipped" = true 
AND "productType" = 'P';

-- Step 3: Verify the changes
SELECT 
    "productType",
    COUNT(*) as count,
    "isDropshipped"
FROM "Product" 
WHERE "isDropshipped" = true 
GROUP BY "productType", "isDropshipped";
