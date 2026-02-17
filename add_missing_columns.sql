-- Add missing columns to ExistingProduct table
-- This script adds the columns that the backend code expects

-- Add new columns with default values to avoid data loss
ALTER TABLE "ExistingProduct" ADD COLUMN IF NOT EXISTS "skuNo" TEXT DEFAULT 'SKU_' || EXTRACT(EPOCH FROM NOW())::TEXT;
ALTER TABLE "ExistingProduct" ADD COLUMN IF NOT EXISTS "productPrice" DECIMAL(8,2) DEFAULT 0.00;
ALTER TABLE "ExistingProduct" ADD COLUMN IF NOT EXISTS "offerPrice" DECIMAL(8,2) DEFAULT 0.00;
ALTER TABLE "ExistingProduct" ADD COLUMN IF NOT EXISTS "productViewCount" INTEGER DEFAULT 0;
ALTER TABLE "ExistingProduct" ADD COLUMN IF NOT EXISTS "adminId" INTEGER;
ALTER TABLE "ExistingProduct" ADD COLUMN IF NOT EXISTS "userId" INTEGER;
ALTER TABLE "ExistingProduct" ADD COLUMN IF NOT EXISTS "categoryLocation" TEXT;

-- Create ExistingProductImages table if it doesn't exist
CREATE TABLE IF NOT EXISTS "ExistingProductImages" (
    "id" SERIAL NOT NULL,
    "existingProductId" INTEGER NOT NULL,
    "image" TEXT,
    "video" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "imageName" TEXT,
    "videoName" TEXT,
    "variant" JSONB,

    CONSTRAINT "ExistingProductImages_pkey" PRIMARY KEY ("id")
);

-- Update existing records to have unique SKUs
UPDATE "ExistingProduct" SET 
    "skuNo" = 'SKU_' || EXTRACT(EPOCH FROM NOW())::TEXT || '_' || id::TEXT
WHERE "skuNo" IS NULL;

-- Now make the required columns NOT NULL
ALTER TABLE "ExistingProduct" ALTER COLUMN "skuNo" SET NOT NULL;
ALTER TABLE "ExistingProduct" ALTER COLUMN "productPrice" SET NOT NULL;
ALTER TABLE "ExistingProduct" ALTER COLUMN "offerPrice" SET NOT NULL;

-- Add unique constraint on skuNo if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ExistingProduct_skuNo_key') THEN
        CREATE UNIQUE INDEX "ExistingProduct_skuNo_key" ON "ExistingProduct"("skuNo");
    END IF;
END $$;

-- Add foreign key constraints if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ExistingProduct_adminId_fkey') THEN
        ALTER TABLE "ExistingProduct" ADD CONSTRAINT "ExistingProduct_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ExistingProduct_userId_fkey') THEN
        ALTER TABLE "ExistingProduct" ADD CONSTRAINT "ExistingProduct_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ExistingProductImages_existingProductId_fkey') THEN
        ALTER TABLE "ExistingProductImages" ADD CONSTRAINT "ExistingProductImages_existingProductId_fkey" FOREIGN KEY ("existingProductId") REFERENCES "ExistingProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
