-- Complaint & RefundRequest models for order management

-- CreateTable
CREATE TABLE IF NOT EXISTS "Complaint" (
    "id" SERIAL NOT NULL,
    "orderProductId" INTEGER NOT NULL,
    "buyerId" INTEGER NOT NULL,
    "sellerId" INTEGER,
    "reason" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "RefundRequest" (
    "id" SERIAL NOT NULL,
    "orderProductId" INTEGER NOT NULL,
    "buyerId" INTEGER NOT NULL,
    "amount" DECIMAL(10,2),
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Complaint_orderProductId_idx" ON "Complaint"("orderProductId");
CREATE INDEX IF NOT EXISTS "Complaint_buyerId_idx" ON "Complaint"("buyerId");
CREATE INDEX IF NOT EXISTS "Complaint_status_idx" ON "Complaint"("status");

CREATE INDEX IF NOT EXISTS "RefundRequest_orderProductId_idx" ON "RefundRequest"("orderProductId");
CREATE INDEX IF NOT EXISTS "RefundRequest_buyerId_idx" ON "RefundRequest"("buyerId");
CREATE INDEX IF NOT EXISTS "RefundRequest_status_idx" ON "RefundRequest"("status");

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_orderProductId_fkey" FOREIGN KEY ("orderProductId") REFERENCES "OrderProducts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_orderProductId_fkey" FOREIGN KEY ("orderProductId") REFERENCES "OrderProducts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
