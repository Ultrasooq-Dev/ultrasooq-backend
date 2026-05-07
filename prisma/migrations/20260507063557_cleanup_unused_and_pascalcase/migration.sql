/*
  Warnings:

  - You are about to drop the column `RequestNo` on the `FactoriesRequest` table. All the data in the column will be lost.
  - You are about to drop the `CustomField` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CustomFieldValue` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OrderProductService` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PaymentErrorLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `accessory_links` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `account` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `banner` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `category_keyword` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `category_mapping` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `category_tag` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `compatibility_rules` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `cross_sell_rules` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `parts_diagram` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `policy` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `product_category_map` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `product_spec_value` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `recommendation_config` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `recommendation_feedback` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `recommendation_metrics` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `scraped_auto_part` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `scraped_product_raw` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `scraping_job` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `service_category_map` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `session` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `spec_template` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `strategy_lab_combo` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `strategy_lab_run` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `strategy_lab_trade` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `system_health_log` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `system_log` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `term_disambiguations` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `use_case_mappings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `verification` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AdminMember" DROP CONSTRAINT "AdminMember_userId_fkey";

-- DropForeignKey
ALTER TABLE "Cart" DROP CONSTRAINT "Cart_userId_fkey";

-- DropForeignKey
ALTER TABLE "Category" DROP CONSTRAINT "Category_policy_fkey";

-- DropForeignKey
ALTER TABLE "Complaint" DROP CONSTRAINT "Complaint_buyerId_fkey";

-- DropForeignKey
ALTER TABLE "ContentFilterLog" DROP CONSTRAINT "ContentFilterLog_userId_fkey";

-- DropForeignKey
ALTER TABLE "ExistingProduct" DROP CONSTRAINT "ExistingProduct_adminId_fkey";

-- DropForeignKey
ALTER TABLE "ExistingProduct" DROP CONSTRAINT "ExistingProduct_userId_fkey";

-- DropForeignKey
ALTER TABLE "Fees" DROP CONSTRAINT "Fees_policyId_fkey";

-- DropForeignKey
ALTER TABLE "HelpCenter" DROP CONSTRAINT "HelpCenter_userId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_userId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_userId_fkey";

-- DropForeignKey
ALTER TABLE "OrderProductService" DROP CONSTRAINT "OrderProductService_orderProductId_fkey";

-- DropForeignKey
ALTER TABLE "OrderProductService" DROP CONSTRAINT "OrderProductService_productId_fkey";

-- DropForeignKey
ALTER TABLE "OrderProductService" DROP CONSTRAINT "OrderProductService_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "OrderProducts" DROP CONSTRAINT "OrderProducts_sellerId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_adminId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_dropshipVendorId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_originalVendorId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_userId_fkey";

-- DropForeignKey
ALTER TABLE "ProductClick" DROP CONSTRAINT "ProductClick_userId_fkey";

-- DropForeignKey
ALTER TABLE "ProductPrice" DROP CONSTRAINT "ProductPrice_adminId_fkey";

-- DropForeignKey
ALTER TABLE "ProductPriceReview" DROP CONSTRAINT "ProductPriceReview_userId_fkey";

-- DropForeignKey
ALTER TABLE "ProductQuestion" DROP CONSTRAINT "ProductQuestion_answerByuserId_fkey";

-- DropForeignKey
ALTER TABLE "ProductQuestion" DROP CONSTRAINT "ProductQuestion_questionByuserId_fkey";

-- DropForeignKey
ALTER TABLE "ProductQuestionAnswer" DROP CONSTRAINT "ProductQuestionAnswer_answerByuserId_fkey";

-- DropForeignKey
ALTER TABLE "ProductReview" DROP CONSTRAINT "ProductReview_userId_fkey";

-- DropForeignKey
ALTER TABLE "ProductSearch" DROP CONSTRAINT "ProductSearch_userId_fkey";

-- DropForeignKey
ALTER TABLE "ProductView" DROP CONSTRAINT "ProductView_userId_fkey";

-- DropForeignKey
ALTER TABLE "RefundRequest" DROP CONSTRAINT "RefundRequest_buyerId_fkey";

-- DropForeignKey
ALTER TABLE "RfqQuoteProductPriceRequest" DROP CONSTRAINT "RfqQuoteProductPriceRequest_approvedById_fkey";

-- DropForeignKey
ALTER TABLE "RfqQuoteProductPriceRequest" DROP CONSTRAINT "RfqQuoteProductPriceRequest_buyerId_fkey";

-- DropForeignKey
ALTER TABLE "RfqQuoteProductPriceRequest" DROP CONSTRAINT "RfqQuoteProductPriceRequest_rejectedById_fkey";

-- DropForeignKey
ALTER TABLE "RfqQuoteProductPriceRequest" DROP CONSTRAINT "RfqQuoteProductPriceRequest_requestedById_fkey";

-- DropForeignKey
ALTER TABLE "RfqQuoteProductPriceRequest" DROP CONSTRAINT "RfqQuoteProductPriceRequest_sellerId_fkey";

-- DropForeignKey
ALTER TABLE "RfqQuotesUsers" DROP CONSTRAINT "RfqQuotesUsers_buyerID_fkey";

-- DropForeignKey
ALTER TABLE "RfqQuotesUsers" DROP CONSTRAINT "RfqQuotesUsers_sellerID_fkey";

-- DropForeignKey
ALTER TABLE "RfqSuggestedProduct" DROP CONSTRAINT "RfqSuggestedProduct_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "Room" DROP CONSTRAINT "Room_creatorId_fkey";

-- DropForeignKey
ALTER TABLE "RoomParticipants" DROP CONSTRAINT "RoomParticipants_userId_fkey";

-- DropForeignKey
ALTER TABLE "Service" DROP CONSTRAINT "Service_sellerId_fkey";

-- DropForeignKey
ALTER TABLE "SharedLink" DROP CONSTRAINT "SharedLink_linkGeneratedBy_fkey";

-- DropForeignKey
ALTER TABLE "SupportConversation" DROP CONSTRAINT "SupportConversation_assigneeId_fkey";

-- DropForeignKey
ALTER TABLE "SupportConversation" DROP CONSTRAINT "SupportConversation_userId_fkey";

-- DropForeignKey
ALTER TABLE "TeamMember" DROP CONSTRAINT "TeamMember_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserAddress" DROP CONSTRAINT "UserAddress_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserBranch" DROP CONSTRAINT "UserBranch_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserPhone" DROP CONSTRAINT "UserPhone_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserProfile" DROP CONSTRAINT "UserProfile_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserProfileBusinessType" DROP CONSTRAINT "UserProfileBusinessType_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserSocialLink" DROP CONSTRAINT "UserSocialLink_userId_fkey";

-- DropForeignKey
ALTER TABLE "Wallet" DROP CONSTRAINT "Wallet_userId_fkey";

-- DropForeignKey
ALTER TABLE "WalletSettings" DROP CONSTRAINT "WalletSettings_userId_fkey";

-- DropForeignKey
ALTER TABLE "accessory_links" DROP CONSTRAINT "accessory_links_accessoryCategoryId_fkey";

-- DropForeignKey
ALTER TABLE "accessory_links" DROP CONSTRAINT "accessory_links_sourceCategoryId_fkey";

-- DropForeignKey
ALTER TABLE "account" DROP CONSTRAINT "account_userId_fkey";

-- DropForeignKey
ALTER TABLE "category_keyword" DROP CONSTRAINT "category_keyword_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "category_mapping" DROP CONSTRAINT "category_mapping_ultrasooqCategoryId_fkey";

-- DropForeignKey
ALTER TABLE "category_tag" DROP CONSTRAINT "category_tag_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "category_tag" DROP CONSTRAINT "category_tag_tagId_fkey";

-- DropForeignKey
ALTER TABLE "compatibility_rules" DROP CONSTRAINT "compatibility_rules_productId_fkey";

-- DropForeignKey
ALTER TABLE "cross_sell_rules" DROP CONSTRAINT "cross_sell_rules_sourceCategoryId_fkey";

-- DropForeignKey
ALTER TABLE "cross_sell_rules" DROP CONSTRAINT "cross_sell_rules_targetCategoryId_fkey";

-- DropForeignKey
ALTER TABLE "policy" DROP CONSTRAINT "policy_parentId_fkey";

-- DropForeignKey
ALTER TABLE "product_category_map" DROP CONSTRAINT "product_category_map_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "product_category_map" DROP CONSTRAINT "product_category_map_productId_fkey";

-- DropForeignKey
ALTER TABLE "product_spec_value" DROP CONSTRAINT "product_spec_value_productId_fkey";

-- DropForeignKey
ALTER TABLE "product_spec_value" DROP CONSTRAINT "product_spec_value_specTemplateId_fkey";

-- DropForeignKey
ALTER TABLE "recommendation_feedback" DROP CONSTRAINT "recommendation_feedback_productId_fkey";

-- DropForeignKey
ALTER TABLE "recommendation_feedback" DROP CONSTRAINT "recommendation_feedback_userId_fkey";

-- DropForeignKey
ALTER TABLE "scraped_auto_part" DROP CONSTRAINT "scraped_auto_part_jobId_fkey";

-- DropForeignKey
ALTER TABLE "scraped_auto_part" DROP CONSTRAINT "scraped_auto_part_productId_fkey";

-- DropForeignKey
ALTER TABLE "scraped_product_raw" DROP CONSTRAINT "scraped_product_raw_jobId_fkey";

-- DropForeignKey
ALTER TABLE "scraped_product_raw" DROP CONSTRAINT "scraped_product_raw_productId_fkey";

-- DropForeignKey
ALTER TABLE "scraping_job" DROP CONSTRAINT "scraping_job_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "service_category_map" DROP CONSTRAINT "service_category_map_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "service_category_map" DROP CONSTRAINT "service_category_map_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "session" DROP CONSTRAINT "session_userId_fkey";

-- DropForeignKey
ALTER TABLE "spec_template" DROP CONSTRAINT "spec_template_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "strategy_lab_combo" DROP CONSTRAINT "strategy_lab_combo_runId_fkey";

-- DropForeignKey
ALTER TABLE "strategy_lab_trade" DROP CONSTRAINT "strategy_lab_trade_comboId_fkey";

-- DropForeignKey
ALTER TABLE "strategy_lab_trade" DROP CONSTRAINT "strategy_lab_trade_runId_fkey";

-- DropForeignKey
ALTER TABLE "system_log" DROP CONSTRAINT "system_log_userId_fkey";

-- DropForeignKey
ALTER TABLE "term_disambiguations" DROP CONSTRAINT "term_disambiguations_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "use_case_mappings" DROP CONSTRAINT "use_case_mappings_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "user" DROP CONSTRAINT "user_adminRoleId_fkey";

-- DropForeignKey
ALTER TABLE "user" DROP CONSTRAINT "user_userRoleId_fkey";

-- DropForeignKey
ALTER TABLE "user" DROP CONSTRAINT "user_userTypeCategoryId_fkey";

-- AlterTable
ALTER TABLE "FactoriesRequest" DROP COLUMN "RequestNo",
ADD COLUMN     "requestNo" TEXT;

-- DropTable
DROP TABLE "CustomField";

-- DropTable
DROP TABLE "CustomFieldValue";

-- DropTable
DROP TABLE "OrderProductService";

-- DropTable
DROP TABLE "PaymentErrorLog";

-- DropTable
DROP TABLE "accessory_links";

-- DropTable
DROP TABLE "account";

-- DropTable
DROP TABLE "banner";

-- DropTable
DROP TABLE "category_keyword";

-- DropTable
DROP TABLE "category_mapping";

-- DropTable
DROP TABLE "category_tag";

-- DropTable
DROP TABLE "compatibility_rules";

-- DropTable
DROP TABLE "cross_sell_rules";

-- DropTable
DROP TABLE "parts_diagram";

-- DropTable
DROP TABLE "policy";

-- DropTable
DROP TABLE "product_category_map";

-- DropTable
DROP TABLE "product_spec_value";

-- DropTable
DROP TABLE "recommendation_config";

-- DropTable
DROP TABLE "recommendation_feedback";

-- DropTable
DROP TABLE "recommendation_metrics";

-- DropTable
DROP TABLE "scraped_auto_part";

-- DropTable
DROP TABLE "scraped_product_raw";

-- DropTable
DROP TABLE "scraping_job";

-- DropTable
DROP TABLE "service_category_map";

-- DropTable
DROP TABLE "session";

-- DropTable
DROP TABLE "spec_template";

-- DropTable
DROP TABLE "strategy_lab_combo";

-- DropTable
DROP TABLE "strategy_lab_run";

-- DropTable
DROP TABLE "strategy_lab_trade";

-- DropTable
DROP TABLE "system_health_log";

-- DropTable
DROP TABLE "system_log";

-- DropTable
DROP TABLE "term_disambiguations";

-- DropTable
DROP TABLE "use_case_mappings";

-- DropTable
DROP TABLE "user";

-- DropTable
DROP TABLE "verification";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL DEFAULT '',
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "cc" TEXT,
    "phoneNumber" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" "Gender",
    "profilePicture" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "tradeRole" "TypeTrader" NOT NULL DEFAULT 'BUYER',
    "uniqueId" TEXT,
    "identityProof" TEXT,
    "identityProofBack" TEXT,
    "onlineOffline" TEXT,
    "onlineOfflineDateStatus" TIMESTAMP(3),
    "userType" "UserType",
    "userName" TEXT,
    "employeeId" TEXT,
    "userRoleId" INTEGER,
    "userRoleName" TEXT,
    "customerId" TEXT,
    "stripeAccountId" TEXT,
    "addedBy" TEXT,
    "adminRoleId" INTEGER,
    "userTypeCategoryId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "statusNote" TEXT,
    "companyName" TEXT,
    "companyAddress" TEXT,
    "companyPhone" TEXT,
    "companyWebsite" TEXT,
    "companyTaxId" TEXT,
    "accountName" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" SERIAL NOT NULL,
    "ruleName" TEXT,
    "rule" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "categoryName" TEXT,
    "parentId" INTEGER,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Banner" (
    "id" BIGSERIAL NOT NULL,
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemLog" (
    "id" SERIAL NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" TEXT,
    "userId" TEXT,
    "requestId" TEXT,
    "method" TEXT,
    "path" TEXT,
    "statusCode" INTEGER,
    "errorStack" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategoryMap" (
    "id" SERIAL NOT NULL,
    "productId" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCategoryMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryKeyword" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "keyword" TEXT NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryTag" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceCategoryMap" (
    "id" SERIAL NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCategoryMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecTemplate" (
    "id" SERIAL NOT NULL,
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSpecValue" (
    "id" SERIAL NOT NULL,
    "productId" TEXT NOT NULL,
    "specTemplateId" INTEGER NOT NULL,
    "value" TEXT,
    "numericValue" DECIMAL(12,4),
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSpecValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapingJob" (
    "id" SERIAL NOT NULL,
    "platform" TEXT NOT NULL,
    "region" TEXT,
    "categorySource" TEXT NOT NULL,
    "categoryId" INTEGER,
    "status" "ScrapingJobStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "totalProducts" INTEGER NOT NULL DEFAULT 0,
    "scrapedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "translatedCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "blockedAt" TIMESTAMP(3),
    "cooldownUntil" TIMESTAMP(3),
    "nodeId" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "sourcePageStart" INTEGER NOT NULL DEFAULT 1,
    "sourcePageEnd" INTEGER,
    "exportFilePath" TEXT,
    "batchId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ScrapingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapedProductRaw" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "rawData" JSONB NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourcePlatform" TEXT NOT NULL,
    "productName" TEXT,
    "productNameEn" TEXT,
    "priceOriginal" DECIMAL(10,2),
    "priceCurrency" TEXT,
    "priceUsd" DECIMAL(10,2),
    "status" "ScrapedProductStatus" NOT NULL DEFAULT 'RAW',
    "translatedAt" TIMESTAMP(3),
    "mappedAt" TIMESTAMP(3),
    "importedAt" TIMESTAMP(3),
    "productId" TEXT,
    "translatedData" JSONB,
    "imageTexts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapedProductRaw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryMapping" (
    "id" SERIAL NOT NULL,
    "sourcePlatform" TEXT NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "sourceId" TEXT,
    "ultrasooqCategoryId" INTEGER,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "aiReasoning" TEXT,
    "productCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapedAutoPart" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER,
    "partNumber" TEXT NOT NULL,
    "partNumberAlt" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "name" TEXT NOT NULL,
    "nameOriginal" TEXT,
    "description" TEXT,
    "price" DECIMAL(10,2),
    "currency" TEXT,
    "msrp" DECIMAL(10,2),
    "category" TEXT NOT NULL,
    "subcategory" TEXT,
    "partGroup" TEXT,
    "vehicles" JSONB NOT NULL DEFAULT '[]',
    "fitmentNotes" TEXT,
    "images" JSONB DEFAULT '[]',
    "diagramId" TEXT,
    "diagramPosition" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "sourcePlatform" TEXT NOT NULL,
    "brand" TEXT,
    "isGenuine" BOOLEAN NOT NULL DEFAULT true,
    "inStock" BOOLEAN,
    "stockQuantity" INTEGER,
    "leadTime" TEXT,
    "crossReferences" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supersededBy" TEXT,
    "interchangeWith" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "ScrapedProductStatus" NOT NULL DEFAULT 'RAW',
    "translatedAt" TIMESTAMP(3),
    "importedAt" TIMESTAMP(3),
    "productId" TEXT,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapedAutoPart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationMetric" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "algorithm" VARCHAR(50) NOT NULL,
    "placement" VARCHAR(50) NOT NULL,
    "segment" VARCHAR(50) NOT NULL,
    "experiment" VARCHAR(100),
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "cartAdds" INTEGER NOT NULL DEFAULT 0,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationFeedback" (
    "id" TEXT NOT NULL,
    "recId" VARCHAR(100) NOT NULL,
    "userId" TEXT,
    "deviceId" VARCHAR(100),
    "productId" TEXT NOT NULL,
    "algorithm" VARCHAR(50) NOT NULL,
    "placement" VARCHAR(50) NOT NULL,
    "position" INTEGER NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "experiment" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrossSellRule" (
    "id" TEXT NOT NULL,
    "sourceCategoryId" INTEGER NOT NULL,
    "targetCategoryId" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrossSellRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationConfig" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UseCaseMapping" (
    "id" SERIAL NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "useCase" VARCHAR(100) NOT NULL,
    "impliedSpecs" JSONB NOT NULL,
    "impliedTags" JSONB,
    "weight" DECIMAL(3,2) NOT NULL DEFAULT 0.8,
    "source" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UseCaseMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompatibilityRule" (
    "id" SERIAL NOT NULL,
    "productId" TEXT NOT NULL,
    "vehicleMake" VARCHAR(100),
    "vehicleModel" VARCHAR(100),
    "yearFrom" INTEGER,
    "yearTo" INTEGER,
    "deviceBrand" VARCHAR(100),
    "deviceModel" VARCHAR(100),
    "compatType" VARCHAR(20) NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompatibilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessoryLink" (
    "id" SERIAL NOT NULL,
    "sourceCategoryId" INTEGER NOT NULL,
    "accessoryCategoryId" INTEGER NOT NULL,
    "strength" DECIMAL(3,2) NOT NULL DEFAULT 0.8,
    "bidirectional" BOOLEAN NOT NULL DEFAULT false,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessoryLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TermDisambiguation" (
    "id" SERIAL NOT NULL,
    "term" VARCHAR(100) NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "resolvedMeaning" VARCHAR(200) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TermDisambiguation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_userRoleId_idx" ON "User"("userRoleId");

-- CreateIndex
CREATE INDEX "User_adminRoleId_idx" ON "User"("adminRoleId");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_tradeRole_idx" ON "User"("tradeRole");

-- CreateIndex
CREATE INDEX "Banner_position_idx" ON "Banner"("position");

-- CreateIndex
CREATE INDEX "Banner_isActive_idx" ON "Banner"("isActive");

-- CreateIndex
CREATE INDEX "Banner_priority_idx" ON "Banner"("priority");

-- CreateIndex
CREATE INDEX "Banner_startDate_endDate_idx" ON "Banner"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "Banner_isActive_position_idx" ON "Banner"("isActive", "position");

-- CreateIndex
CREATE INDEX "SystemLog_level_idx" ON "SystemLog"("level");

-- CreateIndex
CREATE INDEX "SystemLog_createdAt_idx" ON "SystemLog"("createdAt");

-- CreateIndex
CREATE INDEX "SystemLog_userId_idx" ON "SystemLog"("userId");

-- CreateIndex
CREATE INDEX "SystemLog_requestId_idx" ON "SystemLog"("requestId");

-- CreateIndex
CREATE INDEX "SystemLog_context_idx" ON "SystemLog"("context");

-- CreateIndex
CREATE INDEX "ProductCategoryMap_productId_idx" ON "ProductCategoryMap"("productId");

-- CreateIndex
CREATE INDEX "ProductCategoryMap_categoryId_idx" ON "ProductCategoryMap"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategoryMap_productId_categoryId_key" ON "ProductCategoryMap"("productId", "categoryId");

-- CreateIndex
CREATE INDEX "CategoryKeyword_keyword_idx" ON "CategoryKeyword"("keyword");

-- CreateIndex
CREATE INDEX "CategoryKeyword_categoryId_idx" ON "CategoryKeyword"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryKeyword_categoryId_keyword_key" ON "CategoryKeyword"("categoryId", "keyword");

-- CreateIndex
CREATE INDEX "CategoryTag_categoryId_idx" ON "CategoryTag"("categoryId");

-- CreateIndex
CREATE INDEX "CategoryTag_tagId_idx" ON "CategoryTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryTag_categoryId_tagId_key" ON "CategoryTag"("categoryId", "tagId");

-- CreateIndex
CREATE INDEX "ServiceCategoryMap_serviceId_idx" ON "ServiceCategoryMap"("serviceId");

-- CreateIndex
CREATE INDEX "ServiceCategoryMap_categoryId_idx" ON "ServiceCategoryMap"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCategoryMap_serviceId_categoryId_key" ON "ServiceCategoryMap"("serviceId", "categoryId");

-- CreateIndex
CREATE INDEX "SpecTemplate_categoryId_isFilterable_idx" ON "SpecTemplate"("categoryId", "isFilterable");

-- CreateIndex
CREATE INDEX "SpecTemplate_categoryId_sortOrder_idx" ON "SpecTemplate"("categoryId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "SpecTemplate_categoryId_key_key" ON "SpecTemplate"("categoryId", "key");

-- CreateIndex
CREATE INDEX "ProductSpecValue_specTemplateId_value_idx" ON "ProductSpecValue"("specTemplateId", "value");

-- CreateIndex
CREATE INDEX "ProductSpecValue_specTemplateId_numericValue_idx" ON "ProductSpecValue"("specTemplateId", "numericValue");

-- CreateIndex
CREATE INDEX "ProductSpecValue_productId_idx" ON "ProductSpecValue"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSpecValue_productId_specTemplateId_key" ON "ProductSpecValue"("productId", "specTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapingJob_batchId_key" ON "ScrapingJob"("batchId");

-- CreateIndex
CREATE INDEX "ScrapingJob_platform_status_idx" ON "ScrapingJob"("platform", "status");

-- CreateIndex
CREATE INDEX "ScrapingJob_status_priority_idx" ON "ScrapingJob"("status", "priority");

-- CreateIndex
CREATE INDEX "ScrapingJob_batchId_idx" ON "ScrapingJob"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapedProductRaw_sourceUrl_key" ON "ScrapedProductRaw"("sourceUrl");

-- CreateIndex
CREATE INDEX "ScrapedProductRaw_jobId_status_idx" ON "ScrapedProductRaw"("jobId", "status");

-- CreateIndex
CREATE INDEX "ScrapedProductRaw_sourcePlatform_status_idx" ON "ScrapedProductRaw"("sourcePlatform", "status");

-- CreateIndex
CREATE INDEX "ScrapedProductRaw_productId_idx" ON "ScrapedProductRaw"("productId");

-- CreateIndex
CREATE INDEX "CategoryMapping_ultrasooqCategoryId_idx" ON "CategoryMapping"("ultrasooqCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryMapping_sourcePlatform_sourcePath_key" ON "CategoryMapping"("sourcePlatform", "sourcePath");

-- CreateIndex
CREATE UNIQUE INDEX "ScrapedAutoPart_sourceUrl_key" ON "ScrapedAutoPart"("sourceUrl");

-- CreateIndex
CREATE INDEX "ScrapedAutoPart_partNumber_idx" ON "ScrapedAutoPart"("partNumber");

-- CreateIndex
CREATE INDEX "ScrapedAutoPart_sourcePlatform_status_idx" ON "ScrapedAutoPart"("sourcePlatform", "status");

-- CreateIndex
CREATE INDEX "ScrapedAutoPart_category_subcategory_idx" ON "ScrapedAutoPart"("category", "subcategory");

-- CreateIndex
CREATE INDEX "ScrapedAutoPart_jobId_idx" ON "ScrapedAutoPart"("jobId");

-- CreateIndex
CREATE INDEX "ScrapedAutoPart_productId_idx" ON "ScrapedAutoPart"("productId");

-- CreateIndex
CREATE INDEX "RecommendationMetric_date_idx" ON "RecommendationMetric"("date");

-- CreateIndex
CREATE INDEX "RecommendationMetric_algorithm_idx" ON "RecommendationMetric"("algorithm");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationMetric_date_algorithm_placement_segment_exper_key" ON "RecommendationMetric"("date", "algorithm", "placement", "segment", "experiment");

-- CreateIndex
CREATE INDEX "RecommendationFeedback_createdAt_idx" ON "RecommendationFeedback"("createdAt");

-- CreateIndex
CREATE INDEX "RecommendationFeedback_recId_idx" ON "RecommendationFeedback"("recId");

-- CreateIndex
CREATE INDEX "RecommendationFeedback_userId_idx" ON "RecommendationFeedback"("userId");

-- CreateIndex
CREATE INDEX "RecommendationFeedback_algorithm_placement_createdAt_idx" ON "RecommendationFeedback"("algorithm", "placement", "createdAt");

-- CreateIndex
CREATE INDEX "CrossSellRule_sourceCategoryId_idx" ON "CrossSellRule"("sourceCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CrossSellRule_sourceCategoryId_targetCategoryId_key" ON "CrossSellRule"("sourceCategoryId", "targetCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationConfig_key_key" ON "RecommendationConfig"("key");

-- CreateIndex
CREATE INDEX "UseCaseMapping_categoryId_idx" ON "UseCaseMapping"("categoryId");

-- CreateIndex
CREATE INDEX "UseCaseMapping_useCase_idx" ON "UseCaseMapping"("useCase");

-- CreateIndex
CREATE UNIQUE INDEX "UseCaseMapping_categoryId_useCase_key" ON "UseCaseMapping"("categoryId", "useCase");

-- CreateIndex
CREATE INDEX "CompatibilityRule_productId_idx" ON "CompatibilityRule"("productId");

-- CreateIndex
CREATE INDEX "CompatibilityRule_vehicleMake_vehicleModel_idx" ON "CompatibilityRule"("vehicleMake", "vehicleModel");

-- CreateIndex
CREATE INDEX "CompatibilityRule_deviceBrand_deviceModel_idx" ON "CompatibilityRule"("deviceBrand", "deviceModel");

-- CreateIndex
CREATE INDEX "AccessoryLink_sourceCategoryId_idx" ON "AccessoryLink"("sourceCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessoryLink_sourceCategoryId_accessoryCategoryId_key" ON "AccessoryLink"("sourceCategoryId", "accessoryCategoryId");

-- CreateIndex
CREATE INDEX "TermDisambiguation_term_idx" ON "TermDisambiguation"("term");

-- CreateIndex
CREATE INDEX "TermDisambiguation_categoryId_idx" ON "TermDisambiguation"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_adminRoleId_fkey" FOREIGN KEY ("adminRoleId") REFERENCES "AdminRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_userRoleId_fkey" FOREIGN KEY ("userRoleId") REFERENCES "UserRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_userTypeCategoryId_fkey" FOREIGN KEY ("userTypeCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAddress" ADD CONSTRAINT "UserAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPhone" ADD CONSTRAINT "UserPhone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSocialLink" ADD CONSTRAINT "UserSocialLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserProfileBusinessType" ADD CONSTRAINT "UserProfileBusinessType_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranch" ADD CONSTRAINT "UserBranch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_policy_fkey" FOREIGN KEY ("policy") REFERENCES "Policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fees" ADD CONSTRAINT "Fees_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_dropshipVendorId_fkey" FOREIGN KEY ("dropshipVendorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_originalVendorId_fkey" FOREIGN KEY ("originalVendorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPrice" ADD CONSTRAINT "ProductPrice_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedLink" ADD CONSTRAINT "SharedLink_linkGeneratedBy_fkey" FOREIGN KEY ("linkGeneratedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPriceReview" ADD CONSTRAINT "ProductPriceReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductView" ADD CONSTRAINT "ProductView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSearch" ADD CONSTRAINT "ProductSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductClick" ADD CONSTRAINT "ProductClick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductQuestion" ADD CONSTRAINT "ProductQuestion_answerByuserId_fkey" FOREIGN KEY ("answerByuserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductQuestion" ADD CONSTRAINT "ProductQuestion_questionByuserId_fkey" FOREIGN KEY ("questionByuserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductQuestionAnswer" ADD CONSTRAINT "ProductQuestionAnswer_answerByuserId_fkey" FOREIGN KEY ("answerByuserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProducts" ADD CONSTRAINT "OrderProducts_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuotesUsers" ADD CONSTRAINT "RfqQuotesUsers_buyerID_fkey" FOREIGN KEY ("buyerID") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuotesUsers" ADD CONSTRAINT "RfqQuotesUsers_sellerID_fkey" FOREIGN KEY ("sellerID") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuoteProductPriceRequest" ADD CONSTRAINT "RfqQuoteProductPriceRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuoteProductPriceRequest" ADD CONSTRAINT "RfqQuoteProductPriceRequest_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuoteProductPriceRequest" ADD CONSTRAINT "RfqQuoteProductPriceRequest_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuoteProductPriceRequest" ADD CONSTRAINT "RfqQuoteProductPriceRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqQuoteProductPriceRequest" ADD CONSTRAINT "RfqQuoteProductPriceRequest_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqSuggestedProduct" ADD CONSTRAINT "RfqSuggestedProduct_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomParticipants" ADD CONSTRAINT "RoomParticipants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminMember" ADD CONSTRAINT "AdminMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpCenter" ADD CONSTRAINT "HelpCenter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletSettings" ADD CONSTRAINT "WalletSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExistingProduct" ADD CONSTRAINT "ExistingProduct_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExistingProduct" ADD CONSTRAINT "ExistingProduct_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemLog" ADD CONSTRAINT "SystemLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategoryMap" ADD CONSTRAINT "ProductCategoryMap_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCategoryMap" ADD CONSTRAINT "ProductCategoryMap_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryKeyword" ADD CONSTRAINT "CategoryKeyword_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryTag" ADD CONSTRAINT "CategoryTag_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryTag" ADD CONSTRAINT "CategoryTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCategoryMap" ADD CONSTRAINT "ServiceCategoryMap_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceCategoryMap" ADD CONSTRAINT "ServiceCategoryMap_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecTemplate" ADD CONSTRAINT "SpecTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSpecValue" ADD CONSTRAINT "ProductSpecValue_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSpecValue" ADD CONSTRAINT "ProductSpecValue_specTemplateId_fkey" FOREIGN KEY ("specTemplateId") REFERENCES "SpecTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapingJob" ADD CONSTRAINT "ScrapingJob_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapedProductRaw" ADD CONSTRAINT "ScrapedProductRaw_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ScrapingJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapedProductRaw" ADD CONSTRAINT "ScrapedProductRaw_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryMapping" ADD CONSTRAINT "CategoryMapping_ultrasooqCategoryId_fkey" FOREIGN KEY ("ultrasooqCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapedAutoPart" ADD CONSTRAINT "ScrapedAutoPart_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ScrapingJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScrapedAutoPart" ADD CONSTRAINT "ScrapedAutoPart_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentFilterLog" ADD CONSTRAINT "ContentFilterLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationFeedback" ADD CONSTRAINT "RecommendationFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationFeedback" ADD CONSTRAINT "RecommendationFeedback_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossSellRule" ADD CONSTRAINT "CrossSellRule_sourceCategoryId_fkey" FOREIGN KEY ("sourceCategoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrossSellRule" ADD CONSTRAINT "CrossSellRule_targetCategoryId_fkey" FOREIGN KEY ("targetCategoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UseCaseMapping" ADD CONSTRAINT "UseCaseMapping_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompatibilityRule" ADD CONSTRAINT "CompatibilityRule_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessoryLink" ADD CONSTRAINT "AccessoryLink_sourceCategoryId_fkey" FOREIGN KEY ("sourceCategoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessoryLink" ADD CONSTRAINT "AccessoryLink_accessoryCategoryId_fkey" FOREIGN KEY ("accessoryCategoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermDisambiguation" ADD CONSTRAINT "TermDisambiguation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportConversation" ADD CONSTRAINT "SupportConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportConversation" ADD CONSTRAINT "SupportConversation_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
