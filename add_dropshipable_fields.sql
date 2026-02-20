-- Add dropshipable fields to Product table
ALTER TABLE "Product" 
ADD COLUMN IF NOT EXISTS "isDropshipable" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "dropshipCommission" DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS "dropshipMinMarkup" DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS "dropshipMaxMarkup" DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS "dropshipSettings" JSONB;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS "Product_isDropshipable_idx" ON "Product"("isDropshipable");
CREATE INDEX IF NOT EXISTS "Product_isDropshipable_status_idx" ON "Product"("isDropshipable", "status") WHERE "isDropshipable" = true AND "status" = 'ACTIVE';

-- Add comment to describe the fields
COMMENT ON COLUMN "Product"."isDropshipable" IS 'Indicates if vendor allows this product to be dropshipped by others';
COMMENT ON COLUMN "Product"."dropshipCommission" IS 'Commission percentage vendor receives from each dropship sale';
COMMENT ON COLUMN "Product"."dropshipMinMarkup" IS 'Minimum markup percentage allowed for dropshipping';
COMMENT ON COLUMN "Product"."dropshipMaxMarkup" IS 'Maximum markup percentage allowed for dropshipping';
COMMENT ON COLUMN "Product"."dropshipSettings" IS 'Additional dropship configuration settings';

