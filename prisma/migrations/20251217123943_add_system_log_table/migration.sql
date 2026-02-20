-- CreateTable
CREATE TABLE "system_log" (
    "id" SERIAL NOT NULL,
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

    CONSTRAINT "system_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_log_level_idx" ON "system_log"("level");

-- CreateIndex
CREATE INDEX "system_log_createdAt_idx" ON "system_log"("createdAt");

-- CreateIndex
CREATE INDEX "system_log_userId_idx" ON "system_log"("userId");

-- CreateIndex
CREATE INDEX "system_log_requestId_idx" ON "system_log"("requestId");

-- CreateIndex
CREATE INDEX "system_log_context_idx" ON "system_log"("context");

-- AddForeignKey
ALTER TABLE "system_log" ADD CONSTRAINT "system_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

