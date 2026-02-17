-- CreateEnum
CREATE TYPE "OrderProductType" AS ENUM ('PRODUCT', 'SERVICE');

-- AlterEnum
ALTER TYPE "CartType" ADD VALUE 'SERVICE';

-- AlterEnum
ALTER TYPE "OrderType" ADD VALUE 'SERVICE';

-- AlterTable
ALTER TABLE "Cart" ADD COLUMN     "serviceId" INTEGER;

-- AlterTable
ALTER TABLE "OrderProducts" ADD COLUMN     "orderProductType" "OrderProductType" NOT NULL DEFAULT 'PRODUCT',
ADD COLUMN     "serviceFeatures" JSONB,
ADD COLUMN     "serviceId" INTEGER;

-- CreateTable
CREATE TABLE "CartServiceFeature" (
    "id" SERIAL NOT NULL,
    "cartId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "serviceFeatureId" INTEGER NOT NULL,

    CONSTRAINT "CartServiceFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartProductService" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "cartId" INTEGER NOT NULL,

    CONSTRAINT "CartProductService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderProductService" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "orderProductId" INTEGER NOT NULL,

    CONSTRAINT "OrderProductService_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartServiceFeature" ADD CONSTRAINT "CartServiceFeature_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartServiceFeature" ADD CONSTRAINT "CartServiceFeature_serviceFeatureId_fkey" FOREIGN KEY ("serviceFeatureId") REFERENCES "ServiceFeature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartProductService" ADD CONSTRAINT "CartProductService_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartProductService" ADD CONSTRAINT "CartProductService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartProductService" ADD CONSTRAINT "CartProductService_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProducts" ADD CONSTRAINT "OrderProducts_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProductService" ADD CONSTRAINT "OrderProductService_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProductService" ADD CONSTRAINT "OrderProductService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderProductService" ADD CONSTRAINT "OrderProductService_orderProductId_fkey" FOREIGN KEY ("orderProductId") REFERENCES "OrderProducts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
