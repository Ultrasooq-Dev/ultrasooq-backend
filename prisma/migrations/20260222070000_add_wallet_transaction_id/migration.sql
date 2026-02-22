-- AlterTable: Add walletTransactionId column to Order table
-- This is a safe migration: nullable field, no data loss

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "walletTransactionId" INTEGER;

-- Add comment for clarity
COMMENT ON COLUMN "Order"."walletTransactionId" IS 'Transaction ID for wallet payments (internal platform). Separate from transactionId which is for payment gateway (Paymob) transactions.';

