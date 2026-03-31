-- CreateTable
CREATE TABLE "analytics_event" (
    "id" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "requestId" TEXT,
    "userId" INTEGER,
    "deviceId" TEXT,
    "eventName" VARCHAR(100) NOT NULL,
    "eventType" VARCHAR(20) NOT NULL,
    "pageUrl" VARCHAR(2000),
    "referrer" VARCHAR(2000),
    "locale" VARCHAR(10),
    "currency" VARCHAR(10),
    "tradeRole" VARCHAR(50),
    "metadata" JSONB,
    "source" VARCHAR(20) NOT NULL DEFAULT 'frontend',
    "ipAddress" VARCHAR(45),
    "userAgent" TEXT,
    "clockOffset" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_log" (
    "id" SERIAL NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "source" VARCHAR(20) NOT NULL,
    "level" VARCHAR(10) NOT NULL DEFAULT 'error',
    "count" INTEGER NOT NULL DEFAULT 1,
    "userId" INTEGER,
    "pageUrl" VARCHAR(2000),
    "endpoint" VARCHAR(500),
    "statusCode" INTEGER,
    "metadata" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "error_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_metric" (
    "id" SERIAL NOT NULL,
    "metricName" VARCHAR(30) NOT NULL,
    "metricValue" DOUBLE PRECISION NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "pageUrl" VARCHAR(2000),
    "endpoint" VARCHAR(500),
    "method" VARCHAR(10),
    "userId" INTEGER,
    "sessionId" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_metric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitor_session" (
    "id" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "deviceId" TEXT,
    "userId" INTEGER,
    "ipAddress" VARCHAR(45),
    "userAgent" TEXT,
    "locale" VARCHAR(10),
    "currency" VARCHAR(10),
    "tradeRole" VARCHAR(50),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "visitor_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_event_eventName_idx" ON "analytics_event"("eventName");

-- CreateIndex
CREATE INDEX "analytics_event_sessionId_idx" ON "analytics_event"("sessionId");

-- CreateIndex
CREATE INDEX "analytics_event_requestId_idx" ON "analytics_event"("requestId");

-- CreateIndex
CREATE INDEX "analytics_event_userId_idx" ON "analytics_event"("userId");

-- CreateIndex
CREATE INDEX "analytics_event_createdAt_idx" ON "analytics_event"("createdAt");

-- CreateIndex
CREATE INDEX "analytics_event_eventType_createdAt_idx" ON "analytics_event"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_event_deviceId_idx" ON "analytics_event"("deviceId");

-- CreateIndex
CREATE INDEX "analytics_event_source_createdAt_idx" ON "analytics_event"("source", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "error_log_fingerprint_key" ON "error_log"("fingerprint");

-- CreateIndex
CREATE INDEX "error_log_source_lastSeenAt_idx" ON "error_log"("source", "lastSeenAt");

-- CreateIndex
CREATE INDEX "error_log_level_idx" ON "error_log"("level");

-- CreateIndex
CREATE INDEX "error_log_resolvedAt_idx" ON "error_log"("resolvedAt");

-- CreateIndex
CREATE INDEX "error_log_count_idx" ON "error_log"("count");

-- CreateIndex
CREATE INDEX "performance_metric_metricName_createdAt_idx" ON "performance_metric"("metricName", "createdAt");

-- CreateIndex
CREATE INDEX "performance_metric_source_createdAt_idx" ON "performance_metric"("source", "createdAt");

-- CreateIndex
CREATE INDEX "performance_metric_endpoint_createdAt_idx" ON "performance_metric"("endpoint", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "visitor_session_sessionId_key" ON "visitor_session"("sessionId");

-- CreateIndex
CREATE INDEX "visitor_session_deviceId_idx" ON "visitor_session"("deviceId");

-- CreateIndex
CREATE INDEX "visitor_session_userId_idx" ON "visitor_session"("userId");

-- CreateIndex
CREATE INDEX "visitor_session_startedAt_idx" ON "visitor_session"("startedAt");

-- CreateIndex
CREATE INDEX "visitor_session_isActive_idx" ON "visitor_session"("isActive");

-- CreateIndex
CREATE INDEX "visitor_session_lastActiveAt_idx" ON "visitor_session"("lastActiveAt");

-- AddForeignKey
ALTER TABLE "analytics_event" ADD CONSTRAINT "analytics_event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "error_log" ADD CONSTRAINT "error_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_metric" ADD CONSTRAINT "performance_metric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitor_session" ADD CONSTRAINT "visitor_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
