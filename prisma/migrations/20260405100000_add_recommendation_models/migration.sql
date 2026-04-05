-- CreateTable
CREATE TABLE "recommendation_metrics" (
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

    CONSTRAINT "recommendation_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_feedback" (
    "id" TEXT NOT NULL,
    "recId" VARCHAR(100) NOT NULL,
    "userId" INTEGER,
    "deviceId" VARCHAR(100),
    "productId" INTEGER NOT NULL,
    "algorithm" VARCHAR(50) NOT NULL,
    "placement" VARCHAR(50) NOT NULL,
    "position" INTEGER NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "experiment" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommendation_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cross_sell_rules" (
    "id" TEXT NOT NULL,
    "sourceCategoryId" INTEGER NOT NULL,
    "targetCategoryId" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cross_sell_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_config" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommendation_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_metrics_date_algorithm_placement_segment_experiment_key" ON "recommendation_metrics"("date", "algorithm", "placement", "segment", "experiment");

-- CreateIndex
CREATE INDEX "recommendation_metrics_date_idx" ON "recommendation_metrics"("date");

-- CreateIndex
CREATE INDEX "recommendation_metrics_algorithm_idx" ON "recommendation_metrics"("algorithm");

-- CreateIndex
CREATE INDEX "recommendation_feedback_createdAt_idx" ON "recommendation_feedback"("createdAt");

-- CreateIndex
CREATE INDEX "recommendation_feedback_recId_idx" ON "recommendation_feedback"("recId");

-- CreateIndex
CREATE INDEX "recommendation_feedback_userId_idx" ON "recommendation_feedback"("userId");

-- CreateIndex
CREATE INDEX "recommendation_feedback_algorithm_placement_createdAt_idx" ON "recommendation_feedback"("algorithm", "placement", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "cross_sell_rules_sourceCategoryId_targetCategoryId_key" ON "cross_sell_rules"("sourceCategoryId", "targetCategoryId");

-- CreateIndex
CREATE INDEX "cross_sell_rules_sourceCategoryId_idx" ON "cross_sell_rules"("sourceCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_config_key_key" ON "recommendation_config"("key");

-- AddForeignKey
ALTER TABLE "recommendation_feedback" ADD CONSTRAINT "recommendation_feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_feedback" ADD CONSTRAINT "recommendation_feedback_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cross_sell_rules" ADD CONSTRAINT "cross_sell_rules_sourceCategoryId_fkey" FOREIGN KEY ("sourceCategoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cross_sell_rules" ADD CONSTRAINT "cross_sell_rules_targetCategoryId_fkey" FOREIGN KEY ("targetCategoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
