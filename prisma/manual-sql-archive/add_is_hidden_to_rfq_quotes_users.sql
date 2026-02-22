-- Add isHidden column to RfqQuotesUsers table
-- This migration adds a boolean field to track if a vendor has hidden an RFQ request
-- Default value is false to ensure no data loss for existing records

ALTER TABLE "RfqQuotesUsers" 
ADD COLUMN IF NOT EXISTS "isHidden" BOOLEAN NOT NULL DEFAULT false;

-- Create index for better query performance when filtering hidden requests
CREATE INDEX IF NOT EXISTS "RfqQuotesUsers_isHidden_idx" ON "RfqQuotesUsers"("isHidden");

