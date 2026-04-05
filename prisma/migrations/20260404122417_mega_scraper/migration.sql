-- CreateEnum
CREATE TYPE "ScrapingJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'PAUSED', 'BLOCKED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ScrapedProductStatus" AS ENUM ('RAW', 'TRANSLATING', 'TRANSLATED', 'IMAGE_PROCESSING', 'MAPPED', 'READY', 'IMPORTED', 'FAILED', 'DUPLICATE');

-- CreateTable
CREATE TABLE "strategy_lab_run" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "mode" TEXT NOT NULL,
    "configJson" JSONB NOT NULL,
    "statusRun" TEXT NOT NULL DEFAULT 'pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "totalCombos" INTEGER NOT NULL DEFAULT 0,
    "qualifiedCombos" INTEGER NOT NULL DEFAULT 0,
    "totalTrades" INTEGER NOT NULL DEFAULT 0,
    "totalPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalEquity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startingEquity" DOUBLE PRECISION NOT NULL DEFAULT 10000,
    "returnPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "elapsedSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gradesJson" JSONB,
    "assetSummary" JSONB,
    "strategySummary" JSONB,
    "tfSummary" JSONB,
    "equityCurve" JSONB,
    "stageReports" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "strategy_lab_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategy_lab_combo" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "asset" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "comboKey" TEXT NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "totalTrades" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "profitFactor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxDrawdown" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bestTrade" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "worstTrade" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tp1Hits" INTEGER NOT NULL DEFAULT 0,
    "tp2Hits" INTEGER NOT NULL DEFAULT 0,
    "tp3Hits" INTEGER NOT NULL DEFAULT 0,
    "slHits" INTEGER NOT NULL DEFAULT 0,
    "expireHits" INTEGER NOT NULL DEFAULT 0,
    "grade" TEXT,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "finalRiskMult" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "stageHistory" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "strategy_lab_combo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "strategy_lab_trade" (
    "id" SERIAL NOT NULL,
    "runId" INTEGER NOT NULL,
    "comboId" INTEGER NOT NULL,
    "asset" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "exitPrice" DOUBLE PRECISION,
    "pnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "barsHeld" INTEGER NOT NULL DEFAULT 0,
    "entryTime" TEXT,
    "exitTime" TEXT,
    "day" TEXT,
    "hitsJson" JSONB,
    "stageNumber" INTEGER,
    "riskMult" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "strategy_lab_trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scraping_job" (
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

    CONSTRAINT "scraping_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scraped_product_raw" (
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
    "productId" INTEGER,
    "translatedData" JSONB,
    "imageTexts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scraped_product_raw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_mapping" (
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

    CONSTRAINT "category_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "strategy_lab_run_mode_statusRun_idx" ON "strategy_lab_run"("mode", "statusRun");

-- CreateIndex
CREATE INDEX "strategy_lab_run_createdAt_idx" ON "strategy_lab_run"("createdAt");

-- CreateIndex
CREATE INDEX "strategy_lab_combo_runId_idx" ON "strategy_lab_combo"("runId");

-- CreateIndex
CREATE INDEX "strategy_lab_combo_asset_timeframe_strategy_idx" ON "strategy_lab_combo"("asset", "timeframe", "strategy");

-- CreateIndex
CREATE INDEX "strategy_lab_combo_grade_idx" ON "strategy_lab_combo"("grade");

-- CreateIndex
CREATE INDEX "strategy_lab_combo_profitFactor_idx" ON "strategy_lab_combo"("profitFactor");

-- CreateIndex
CREATE INDEX "strategy_lab_trade_runId_idx" ON "strategy_lab_trade"("runId");

-- CreateIndex
CREATE INDEX "strategy_lab_trade_comboId_idx" ON "strategy_lab_trade"("comboId");

-- CreateIndex
CREATE INDEX "strategy_lab_trade_asset_strategy_timeframe_idx" ON "strategy_lab_trade"("asset", "strategy", "timeframe");

-- CreateIndex
CREATE UNIQUE INDEX "scraping_job_batchId_key" ON "scraping_job"("batchId");

-- CreateIndex
CREATE INDEX "scraping_job_platform_status_idx" ON "scraping_job"("platform", "status");

-- CreateIndex
CREATE INDEX "scraping_job_status_priority_idx" ON "scraping_job"("status", "priority");

-- CreateIndex
CREATE INDEX "scraping_job_batchId_idx" ON "scraping_job"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "scraped_product_raw_sourceUrl_key" ON "scraped_product_raw"("sourceUrl");

-- CreateIndex
CREATE INDEX "scraped_product_raw_jobId_status_idx" ON "scraped_product_raw"("jobId", "status");

-- CreateIndex
CREATE INDEX "scraped_product_raw_sourcePlatform_status_idx" ON "scraped_product_raw"("sourcePlatform", "status");

-- CreateIndex
CREATE INDEX "scraped_product_raw_productId_idx" ON "scraped_product_raw"("productId");

-- CreateIndex
CREATE INDEX "category_mapping_ultrasooqCategoryId_idx" ON "category_mapping"("ultrasooqCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "category_mapping_sourcePlatform_sourcePath_key" ON "category_mapping"("sourcePlatform", "sourcePath");

-- AddForeignKey
ALTER TABLE "strategy_lab_combo" ADD CONSTRAINT "strategy_lab_combo_runId_fkey" FOREIGN KEY ("runId") REFERENCES "strategy_lab_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_lab_trade" ADD CONSTRAINT "strategy_lab_trade_runId_fkey" FOREIGN KEY ("runId") REFERENCES "strategy_lab_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategy_lab_trade" ADD CONSTRAINT "strategy_lab_trade_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "strategy_lab_combo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scraping_job" ADD CONSTRAINT "scraping_job_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scraped_product_raw" ADD CONSTRAINT "scraped_product_raw_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "scraping_job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scraped_product_raw" ADD CONSTRAINT "scraped_product_raw_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_mapping" ADD CONSTRAINT "category_mapping_ultrasooqCategoryId_fkey" FOREIGN KEY ("ultrasooqCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
