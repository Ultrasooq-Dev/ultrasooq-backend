-- CreateTable
CREATE TABLE "analytics_daily_rollup" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "metric" VARCHAR(50) NOT NULL,
    "dimension" VARCHAR(255),
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "analytics_daily_rollup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_daily_rollup_date_idx" ON "analytics_daily_rollup"("date");

-- CreateIndex
CREATE INDEX "analytics_daily_rollup_metric_date_idx" ON "analytics_daily_rollup"("metric", "date");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_daily_rollup_date_metric_dimension_key" ON "analytics_daily_rollup"("date", "metric", "dimension");

-- CreateIndex
CREATE INDEX "analytics_event_country_idx" ON "analytics_event"("country");

-- CreateIndex
CREATE INDEX "visitor_session_country_idx" ON "visitor_session"("country");
