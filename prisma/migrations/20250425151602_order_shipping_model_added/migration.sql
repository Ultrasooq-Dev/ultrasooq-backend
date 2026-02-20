-- CreateEnum
CREATE TYPE "OrderShippingType" AS ENUM ('PICKUP', 'SELLERDROP', 'THIRDPARTY', 'PLATFORM');

-- CreateTable
CREATE TABLE "OrderShipping" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER,
    "sellerId" INTEGER,
    "orderShippingType" "OrderShippingType" NOT NULL,
    "serviceId" INTEGER,
    "status" TEXT NOT NULL,
    "shippingDate" TIMESTAMP(3),
    "shippingCharge" DECIMAL(10,2),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderShipping_pkey" PRIMARY KEY ("id")
);
