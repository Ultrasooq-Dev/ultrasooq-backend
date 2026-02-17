-- Add wallet system to the database
-- This script adds the wallet system tables to the existing database

-- First, create the enums
CREATE TYPE "WalletStatus" AS ENUM ('ACTIVE', 'FROZEN', 'SUSPENDED', 'CLOSED');

CREATE TYPE "WalletTransactionType" AS ENUM (
  'DEPOSIT', 
  'WITHDRAWAL', 
  'TRANSFER_IN', 
  'TRANSFER_OUT', 
  'PAYMENT', 
  'REFUND', 
  'COMMISSION', 
  'BONUS', 
  'FEE'
);

CREATE TYPE "WalletReferenceType" AS ENUM (
  'ORDER', 
  'PAYMENT', 
  'TRANSFER', 
  'COMMISSION', 
  'REFUND', 
  'BONUS'
);

CREATE TYPE "WalletTransactionStatus" AS ENUM (
  'PENDING', 
  'COMPLETED', 
  'FAILED', 
  'CANCELLED'
);

-- Create Wallet table
CREATE TABLE IF NOT EXISTS "Wallet" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "userAccountId" INTEGER,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "balance" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "frozenBalance" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "status" "WalletStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Wallet_userAccountId_fkey" FOREIGN KEY ("userAccountId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Wallet_userId_userAccountId_currencyCode_key" UNIQUE ("userId", "userAccountId", "currencyCode")
);

-- Create WalletTransaction table
CREATE TABLE IF NOT EXISTS "WalletTransaction" (
    "id" SERIAL PRIMARY KEY,
    "walletId" INTEGER NOT NULL,
    "transactionType" "WalletTransactionType" NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "balanceBefore" DECIMAL(15,2) NOT NULL,
    "balanceAfter" DECIMAL(15,2) NOT NULL,
    "referenceId" VARCHAR(100),
    "referenceType" "WalletReferenceType",
    "description" TEXT,
    "metadata" JSONB,
    "status" "WalletTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Create WalletTransfer table
CREATE TABLE IF NOT EXISTS "WalletTransfer" (
    "id" SERIAL PRIMARY KEY,
    "fromWalletId" INTEGER NOT NULL,
    "toWalletId" INTEGER NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "transferFee" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "description" TEXT,
    "status" "WalletTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "WalletTransfer_fromWalletId_fkey" FOREIGN KEY ("fromWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WalletTransfer_toWalletId_fkey" FOREIGN KEY ("toWalletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Create WalletSettings table
CREATE TABLE IF NOT EXISTS "WalletSettings" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL UNIQUE,
    "autoWithdraw" BOOLEAN NOT NULL DEFAULT false,
    "withdrawLimit" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "dailyLimit" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "monthlyLimit" DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    "notificationPreferences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "WalletSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "Wallet_userId_idx" ON "Wallet"("userId");
CREATE INDEX IF NOT EXISTS "Wallet_status_idx" ON "Wallet"("status");
CREATE INDEX IF NOT EXISTS "WalletTransaction_walletId_status_idx" ON "WalletTransaction"("walletId", "status");
CREATE INDEX IF NOT EXISTS "WalletTransaction_referenceType_referenceId_idx" ON "WalletTransaction"("referenceType", "referenceId");
CREATE INDEX IF NOT EXISTS "WalletTransaction_createdAt_idx" ON "WalletTransaction"("createdAt");
CREATE INDEX IF NOT EXISTS "WalletTransfer_fromWalletId_idx" ON "WalletTransfer"("fromWalletId");
CREATE INDEX IF NOT EXISTS "WalletTransfer_toWalletId_idx" ON "WalletTransfer"("toWalletId");
CREATE INDEX IF NOT EXISTS "WalletTransfer_createdAt_idx" ON "WalletTransfer"("createdAt");

-- Success message
SELECT 'Wallet system tables created successfully!' as message;
