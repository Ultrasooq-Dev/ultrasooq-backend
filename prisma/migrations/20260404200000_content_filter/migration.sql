-- CreateTable
CREATE TABLE "ContentFilterRule" (
    "id" SERIAL NOT NULL,
    "term" TEXT NOT NULL,
    "pattern" TEXT,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentFilterRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentFilterLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "context" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "inputText" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "matchedTerms" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentFilterLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentFilterRule_term_language_key" ON "ContentFilterRule"("term", "language");

-- CreateIndex
CREATE INDEX "ContentFilterRule_isActive_language_idx" ON "ContentFilterRule"("isActive", "language");

-- CreateIndex
CREATE INDEX "ContentFilterRule_category_idx" ON "ContentFilterRule"("category");

-- CreateIndex
CREATE INDEX "ContentFilterLog_userId_idx" ON "ContentFilterLog"("userId");

-- CreateIndex
CREATE INDEX "ContentFilterLog_severity_idx" ON "ContentFilterLog"("severity");

-- CreateIndex
CREATE INDEX "ContentFilterLog_createdAt_idx" ON "ContentFilterLog"("createdAt");

-- CreateIndex
CREATE INDEX "ContentFilterLog_userId_severity_idx" ON "ContentFilterLog"("userId", "severity");

-- AddForeignKey
ALTER TABLE "ContentFilterLog" ADD CONSTRAINT "ContentFilterLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
