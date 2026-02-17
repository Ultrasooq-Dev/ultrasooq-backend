-- Migration: Add RfqSuggestedProduct table for product suggestions in messages
-- Date: 2025-12-18
-- Description: Create table to store vendor-suggested alternative products for SIMILAR product type RFQ requests
-- SAFE: New table only, no existing data affected, no data loss possible

-- =============================================
-- 1. Create RfqSuggestedProduct table
-- =============================================
CREATE TABLE IF NOT EXISTS "RfqSuggestedProduct" (
    "id" SERIAL PRIMARY KEY,
    "messageId" INTEGER NOT NULL,
    "rfqQuoteProductId" INTEGER NOT NULL,
    "suggestedProductId" INTEGER NOT NULL,
    "vendorId" INTEGER NOT NULL,
    "rfqQuotesUserId" INTEGER NOT NULL,
    "offerPrice" DECIMAL(8, 2),
    "quantity" INTEGER,
    "isSelectedByBuyer" BOOLEAN NOT NULL DEFAULT false,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "RfqSuggestedProduct_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RfqSuggestedProduct_rfqQuoteProductId_fkey" FOREIGN KEY ("rfqQuoteProductId") REFERENCES "RfqQuotesProducts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RfqSuggestedProduct_suggestedProductId_fkey" FOREIGN KEY ("suggestedProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RfqSuggestedProduct_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RfqSuggestedProduct_rfqQuotesUserId_fkey" FOREIGN KEY ("rfqQuotesUserId") REFERENCES "RfqQuotesUsers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- =============================================
-- 2. Create indexes for performance
-- =============================================
CREATE INDEX IF NOT EXISTS "RfqSuggestedProduct_rfqQuoteProductId_idx" ON "RfqSuggestedProduct"("rfqQuoteProductId");
CREATE INDEX IF NOT EXISTS "RfqSuggestedProduct_vendorId_idx" ON "RfqSuggestedProduct"("vendorId");
CREATE INDEX IF NOT EXISTS "RfqSuggestedProduct_rfqQuotesUserId_idx" ON "RfqSuggestedProduct"("rfqQuotesUserId");
CREATE INDEX IF NOT EXISTS "RfqSuggestedProduct_messageId_idx" ON "RfqSuggestedProduct"("messageId");
CREATE INDEX IF NOT EXISTS "RfqSuggestedProduct_suggestedProductId_idx" ON "RfqSuggestedProduct"("suggestedProductId");
CREATE INDEX IF NOT EXISTS "RfqSuggestedProduct_status_idx" ON "RfqSuggestedProduct"("status");
CREATE INDEX IF NOT EXISTS "RfqSuggestedProduct_isSelectedByBuyer_idx" ON "RfqSuggestedProduct"("isSelectedByBuyer");

-- =============================================
-- 3. Add comments for documentation
-- =============================================
COMMENT ON TABLE "RfqSuggestedProduct" IS 'Stores vendor-suggested alternative products for SIMILAR product type RFQ requests, linked to chat messages';
COMMENT ON COLUMN "RfqSuggestedProduct"."messageId" IS 'Link to the message that contains this suggestion';
COMMENT ON COLUMN "RfqSuggestedProduct"."rfqQuoteProductId" IS 'The original RFQ product that allows similar products (must have productType = SIMILAR)';
COMMENT ON COLUMN "RfqSuggestedProduct"."suggestedProductId" IS 'The vendor product being suggested as alternative';
COMMENT ON COLUMN "RfqSuggestedProduct"."vendorId" IS 'The vendor suggesting the product';
COMMENT ON COLUMN "RfqSuggestedProduct"."rfqQuotesUserId" IS 'Link to the RFQ quote user (buyer-vendor relationship)';
COMMENT ON COLUMN "RfqSuggestedProduct"."offerPrice" IS 'Suggested price for this alternative product';
COMMENT ON COLUMN "RfqSuggestedProduct"."quantity" IS 'Suggested quantity (defaults to original product quantity)';
COMMENT ON COLUMN "RfqSuggestedProduct"."isSelectedByBuyer" IS 'Buyer selection for checkout - true if buyer selected this alternative';

-- =============================================
-- 4. Create unique constraint on messageId to ensure one message can have multiple suggestions
-- Actually, we want to allow multiple suggestions per message, so no unique constraint needed
-- =============================================

-- Migration completed successfully
-- This migration is SAFE: Creates new table only, no existing data is modified or deleted
