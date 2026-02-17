-- Add dropshipping fields to Product table
ALTER TABLE "Product" ADD COLUMN "originalProductId" INTEGER;
ALTER TABLE "Product" ADD COLUMN "dropshipVendorId" INTEGER;
ALTER TABLE "Product" ADD COLUMN "dropshipMarkup" DECIMAL(8,2);
ALTER TABLE "Product" ADD COLUMN "originalVendorId" INTEGER;
ALTER TABLE "Product" ADD COLUMN "isDropshipped" BOOLEAN DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "customMarketingContent" JSONB;
ALTER TABLE "Product" ADD COLUMN "additionalMarketingImages" JSONB;

-- Add foreign key constraints
ALTER TABLE "Product" ADD CONSTRAINT "Product_originalProductId_fkey" 
  FOREIGN KEY ("originalProductId") REFERENCES "Product"("id") ON DELETE SET NULL;

ALTER TABLE "Product" ADD CONSTRAINT "Product_dropshipVendorId_fkey" 
  FOREIGN KEY ("dropshipVendorId") REFERENCES "User"("id") ON DELETE SET NULL;

ALTER TABLE "Product" ADD CONSTRAINT "Product_originalVendorId_fkey" 
  FOREIGN KEY ("originalVendorId") REFERENCES "User"("id") ON DELETE SET NULL;

-- Add indexes for better performance
CREATE INDEX "Product_originalProductId_idx" ON "Product"("originalProductId");
CREATE INDEX "Product_dropshipVendorId_idx" ON "Product"("dropshipVendorId");
CREATE INDEX "Product_originalVendorId_idx" ON "Product"("originalVendorId");
CREATE INDEX "Product_isDropshipped_idx" ON "Product"("isDropshipped");
