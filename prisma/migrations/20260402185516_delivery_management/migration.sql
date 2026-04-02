-- Delivery Management System
-- Adds DeliveryEvent and PickupCode models
-- Adds delivery tracking fields to OrderShipping

-- CreateTable
CREATE TABLE "DeliveryEvent" (
    "id" SERIAL NOT NULL,
    "orderProductId" INTEGER NOT NULL,
    "orderShippingId" INTEGER,
    "event" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "actorUserId" INTEGER,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickupCode" (
    "id" SERIAL NOT NULL,
    "orderProductId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "qrPayload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pickupWindowStart" TIMESTAMP(3),
    "pickupWindowEnd" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3),
    "collectedByUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickupCode_pkey" PRIMARY KEY ("id")
);

-- AlterTable OrderShipping - Add delivery management fields
ALTER TABLE "OrderShipping" ADD COLUMN "proofOfDeliveryUrl" TEXT;
ALTER TABLE "OrderShipping" ADD COLUMN "autoConfirmAt" TIMESTAMP(3);
ALTER TABLE "OrderShipping" ADD COLUMN "carrierCode" TEXT;
ALTER TABLE "OrderShipping" ADD COLUMN "carrierTrackingUrl" TEXT;

-- CreateIndex
CREATE INDEX "DeliveryEvent_orderProductId_idx" ON "DeliveryEvent"("orderProductId");
CREATE INDEX "DeliveryEvent_orderShippingId_idx" ON "DeliveryEvent"("orderShippingId");
CREATE INDEX "PickupCode_code_idx" ON "PickupCode"("code");
CREATE INDEX "PickupCode_status_idx" ON "PickupCode"("status");
CREATE INDEX "PickupCode_expiresAt_idx" ON "PickupCode"("expiresAt");
CREATE UNIQUE INDEX "PickupCode_orderProductId_key" ON "PickupCode"("orderProductId");
CREATE INDEX "OrderShipping_autoConfirmAt_idx" ON "OrderShipping"("autoConfirmAt");

-- AddForeignKey
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_orderProductId_fkey" FOREIGN KEY ("orderProductId") REFERENCES "OrderProducts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_orderShippingId_fkey" FOREIGN KEY ("orderShippingId") REFERENCES "OrderShipping"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PickupCode" ADD CONSTRAINT "PickupCode_orderProductId_fkey" FOREIGN KEY ("orderProductId") REFERENCES "OrderProducts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
