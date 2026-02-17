-- CreateTable
CREATE TABLE "ProductView" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "deviceId" TEXT,
    "productId" INTEGER NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 1,
    "lastViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSearch" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "deviceId" TEXT,
    "searchTerm" TEXT NOT NULL,
    "productId" INTEGER,
    "clicked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductClick" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "deviceId" TEXT,
    "productId" INTEGER NOT NULL,
    "clickSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductView_userId_productId_key" ON "ProductView"("userId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductView_deviceId_productId_key" ON "ProductView"("deviceId", "productId");

-- CreateIndex
CREATE INDEX "ProductView_userId_idx" ON "ProductView"("userId");

-- CreateIndex
CREATE INDEX "ProductView_deviceId_idx" ON "ProductView"("deviceId");

-- CreateIndex
CREATE INDEX "ProductView_productId_idx" ON "ProductView"("productId");

-- CreateIndex
CREATE INDEX "ProductView_lastViewedAt_idx" ON "ProductView"("lastViewedAt");

-- CreateIndex
CREATE INDEX "ProductView_viewCount_idx" ON "ProductView"("viewCount");

-- CreateIndex
CREATE INDEX "ProductSearch_userId_idx" ON "ProductSearch"("userId");

-- CreateIndex
CREATE INDEX "ProductSearch_deviceId_idx" ON "ProductSearch"("deviceId");

-- CreateIndex
CREATE INDEX "ProductSearch_searchTerm_idx" ON "ProductSearch"("searchTerm");

-- CreateIndex
CREATE INDEX "ProductSearch_productId_idx" ON "ProductSearch"("productId");

-- CreateIndex
CREATE INDEX "ProductSearch_clicked_idx" ON "ProductSearch"("clicked");

-- CreateIndex
CREATE INDEX "ProductSearch_createdAt_idx" ON "ProductSearch"("createdAt");

-- CreateIndex
CREATE INDEX "ProductClick_userId_idx" ON "ProductClick"("userId");

-- CreateIndex
CREATE INDEX "ProductClick_deviceId_idx" ON "ProductClick"("deviceId");

-- CreateIndex
CREATE INDEX "ProductClick_productId_idx" ON "ProductClick"("productId");

-- CreateIndex
CREATE INDEX "ProductClick_clickSource_idx" ON "ProductClick"("clickSource");

-- CreateIndex
CREATE INDEX "ProductClick_createdAt_idx" ON "ProductClick"("createdAt");

-- AddForeignKey
ALTER TABLE "ProductView" ADD CONSTRAINT "ProductView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductView" ADD CONSTRAINT "ProductView_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSearch" ADD CONSTRAINT "ProductSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSearch" ADD CONSTRAINT "ProductSearch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductClick" ADD CONSTRAINT "ProductClick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductClick" ADD CONSTRAINT "ProductClick_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

