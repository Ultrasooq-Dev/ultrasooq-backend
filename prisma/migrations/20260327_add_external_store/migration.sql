-- CreateTable
CREATE TABLE "ExternalStore" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT,
    "feedToken" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "settings" JSONB,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ExternalStore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalStoreSubscription" (
    "id" SERIAL NOT NULL,
    "externalStoreId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "externalProductId" TEXT,
    "externalSku" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalStoreSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalStore_feedToken_key" ON "ExternalStore"("feedToken");

-- CreateIndex
CREATE INDEX "ExternalStore_userId_status_idx" ON "ExternalStore"("userId", "status");

-- CreateIndex
CREATE INDEX "ExternalStore_feedToken_idx" ON "ExternalStore"("feedToken");

-- CreateIndex
CREATE INDEX "ExternalStoreSubscription_externalStoreId_status_idx" ON "ExternalStoreSubscription"("externalStoreId", "status");

-- CreateIndex
CREATE INDEX "ExternalStoreSubscription_productId_idx" ON "ExternalStoreSubscription"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalStoreSubscription_externalStoreId_productId_key" ON "ExternalStoreSubscription"("externalStoreId", "productId");

-- AddForeignKey
ALTER TABLE "ExternalStore" ADD CONSTRAINT "ExternalStore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalStoreSubscription" ADD CONSTRAINT "ExternalStoreSubscription_externalStoreId_fkey" FOREIGN KEY ("externalStoreId") REFERENCES "ExternalStore"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalStoreSubscription" ADD CONSTRAINT "ExternalStoreSubscription_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
