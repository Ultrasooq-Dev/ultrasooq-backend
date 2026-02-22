-- Sync migration: Creates all tables that were added via manual SQL or loose migration files.
-- This migration captures: Banner, CategoryKeyword, CategoryTag, Notification,
-- ProductCategoryMap, SpecTemplate, ProductSpecValue, RfqSuggestedProduct,
-- ServiceCategoryMap, SystemHealthLog, SystemLog, Wallet, WalletSettings,
-- WalletTransaction, WalletTransfer, RefreshToken
-- Plus enums: BannerPosition, SpecDataType, WalletStatus, WalletTransactionType,
-- WalletReferenceType, WalletTransactionStatus

-- Enums
DO $$ BEGIN CREATE TYPE "BannerPosition" AS ENUM ('MAIN', 'SIDEBAR', 'FOOTER', 'POPUP', 'CATEGORY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SpecDataType" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'SELECT', 'MULTI_SELECT', 'RANGE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "WalletStatus" AS ENUM ('ACTIVE', 'FROZEN', 'SUSPENDED', 'CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "WalletTransactionType" AS ENUM ('CREDIT', 'DEBIT', 'FREEZE', 'UNFREEZE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "WalletReferenceType" AS ENUM ('ORDER', 'REFUND', 'TRANSFER', 'TOPUP', 'WITHDRAWAL', 'COMMISSION', 'BONUS'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "WalletTransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REVERSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RefreshToken
CREATE TABLE IF NOT EXISTS "RefreshToken" (
    "id" SERIAL PRIMARY KEY,
    "token" TEXT NOT NULL UNIQUE,
    "userId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "replacedBy" TEXT,
    CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- Banner
CREATE TABLE IF NOT EXISTS "banner" (
    "id" BIGSERIAL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "image" VARCHAR(500) NOT NULL,
    "link" VARCHAR(500),
    "buttonText" VARCHAR(100) DEFAULT 'Shop Now',
    "position" "BannerPosition" NOT NULL DEFAULT 'MAIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "targetUrl" VARCHAR(500),
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CategoryKeyword
CREATE TABLE IF NOT EXISTS "category_keyword" (
    "id" SERIAL PRIMARY KEY,
    "categoryId" INTEGER NOT NULL,
    "keyword" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "category_keyword_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE,
    UNIQUE("categoryId", "keyword")
);

-- CategoryTag
CREATE TABLE IF NOT EXISTS "category_tag" (
    "id" SERIAL PRIMARY KEY,
    "categoryId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "category_tag_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE,
    CONSTRAINT "category_tag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tags"("id") ON DELETE CASCADE,
    UNIQUE("categoryId", "tagId")
);

-- Notification
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "link" VARCHAR(500),
    "icon" VARCHAR(100),
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- ProductCategoryMap
CREATE TABLE IF NOT EXISTS "product_category_map" (
    "id" SERIAL PRIMARY KEY,
    "productId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_category_map_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE,
    CONSTRAINT "product_category_map_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE,
    UNIQUE("productId", "categoryId")
);

-- SpecTemplate
CREATE TABLE IF NOT EXISTS "spec_template" (
    "id" SERIAL PRIMARY KEY,
    "categoryId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "dataType" "SpecDataType" NOT NULL DEFAULT 'TEXT',
    "unit" TEXT,
    "options" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isFilterable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "groupName" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "spec_template_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE,
    UNIQUE("categoryId", "key")
);

-- ProductSpecValue
CREATE TABLE IF NOT EXISTS "product_spec_value" (
    "id" SERIAL PRIMARY KEY,
    "productId" INTEGER NOT NULL,
    "specTemplateId" INTEGER NOT NULL,
    "value" TEXT,
    "numericValue" DECIMAL(12, 4),
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_spec_value_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE,
    CONSTRAINT "product_spec_value_specTemplateId_fkey" FOREIGN KEY ("specTemplateId") REFERENCES "spec_template"("id") ON DELETE CASCADE,
    UNIQUE("productId", "specTemplateId")
);

-- RfqSuggestedProduct
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
    CONSTRAINT "RfqSuggestedProduct_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE,
    CONSTRAINT "RfqSuggestedProduct_rfqQuoteProductId_fkey" FOREIGN KEY ("rfqQuoteProductId") REFERENCES "RfqQuotesProducts"("id"),
    CONSTRAINT "RfqSuggestedProduct_suggestedProductId_fkey" FOREIGN KEY ("suggestedProductId") REFERENCES "Product"("id"),
    CONSTRAINT "RfqSuggestedProduct_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "User"("id"),
    CONSTRAINT "RfqSuggestedProduct_rfqQuotesUserId_fkey" FOREIGN KEY ("rfqQuotesUserId") REFERENCES "RfqQuotesUsers"("id")
);

-- ServiceCategoryMap
CREATE TABLE IF NOT EXISTS "service_category_map" (
    "id" SERIAL PRIMARY KEY,
    "serviceId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_category_map_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE,
    CONSTRAINT "service_category_map_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE,
    UNIQUE("serviceId", "categoryId")
);

-- SystemHealthLog
CREATE TABLE IF NOT EXISTS "system_health_log" (
    "id" SERIAL PRIMARY KEY,
    "component" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "responseMs" INTEGER,
    "details" JSONB,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- SystemLog
CREATE TABLE IF NOT EXISTS "system_log" (
    "id" SERIAL PRIMARY KEY,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" TEXT,
    "userId" INTEGER,
    "requestId" TEXT,
    "method" TEXT,
    "path" TEXT,
    "statusCode" INTEGER,
    "errorStack" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "system_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id")
);

-- Wallet
CREATE TABLE IF NOT EXISTS "Wallet" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "userAccountId" INTEGER,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "balance" DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    "frozenBalance" DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    "status" "WalletStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id"),
    CONSTRAINT "Wallet_userAccountId_fkey" FOREIGN KEY ("userAccountId") REFERENCES "User"("id"),
    UNIQUE("userId", "userAccountId", "currencyCode")
);

-- WalletSettings
CREATE TABLE IF NOT EXISTS "WalletSettings" (
    "id" SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL UNIQUE,
    "autoWithdraw" BOOLEAN NOT NULL DEFAULT false,
    "withdrawLimit" DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    "dailyLimit" DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    "monthlyLimit" DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    "notificationPreferences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "WalletSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id")
);

-- WalletTransaction
CREATE TABLE IF NOT EXISTS "WalletTransaction" (
    "id" SERIAL PRIMARY KEY,
    "walletId" INTEGER NOT NULL,
    "transactionType" "WalletTransactionType" NOT NULL,
    "amount" DECIMAL(15, 2) NOT NULL,
    "balanceBefore" DECIMAL(15, 2) NOT NULL,
    "balanceAfter" DECIMAL(15, 2) NOT NULL,
    "referenceId" TEXT,
    "referenceType" "WalletReferenceType",
    "description" TEXT,
    "metadata" JSONB,
    "status" "WalletTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id")
);

-- WalletTransfer
CREATE TABLE IF NOT EXISTS "WalletTransfer" (
    "id" SERIAL PRIMARY KEY,
    "fromWalletId" INTEGER NOT NULL,
    "toWalletId" INTEGER NOT NULL,
    "amount" DECIMAL(15, 2) NOT NULL,
    "transferFee" DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    "description" TEXT,
    "status" "WalletTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "WalletTransfer_fromWalletId_fkey" FOREIGN KEY ("fromWalletId") REFERENCES "Wallet"("id"),
    CONSTRAINT "WalletTransfer_toWalletId_fkey" FOREIGN KEY ("toWalletId") REFERENCES "Wallet"("id")
);
