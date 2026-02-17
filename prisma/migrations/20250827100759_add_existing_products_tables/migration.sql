/*
  Warnings:

  - You are about to drop the column `addedBy` on the `ExistingProduct` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[skuNo]` on the `ExistingProduct` table will be added. If there are existing duplicate values, this will fail.
  - Default values will be provided for existing records in the `offerPrice`, `productPrice`, and `skuNo` columns.

*/
-- DropForeignKey
ALTER TABLE "ExistingProduct" DROP CONSTRAINT "ExistingProduct_addedBy_fkey";

-- AlterTable
ALTER TABLE "ExistingProduct" DROP COLUMN "addedBy",
ADD COLUMN     "adminId" INTEGER,
ADD COLUMN     "categoryLocation" TEXT,
ADD COLUMN     "offerPrice" DECIMAL(8,2) DEFAULT 0.00,
ADD COLUMN     "productPrice" DECIMAL(8,2) DEFAULT 0.00,
ADD COLUMN     "productViewCount" INTEGER DEFAULT 0,
ADD COLUMN     "skuNo" TEXT DEFAULT 'SKU_' || EXTRACT(EPOCH FROM NOW())::TEXT,
ADD COLUMN     "userId" INTEGER;

-- Update existing records to have proper values
UPDATE "ExistingProduct" SET 
    "offerPrice" = 0.00,
    "productPrice" = 0.00,
    "skuNo" = 'SKU_' || EXTRACT(EPOCH FROM NOW())::TEXT || '_' || id::TEXT
WHERE "offerPrice" IS NULL OR "productPrice" IS NULL OR "skuNo" IS NULL;

-- Now make the columns NOT NULL
ALTER TABLE "ExistingProduct" ALTER COLUMN "offerPrice" SET NOT NULL;
ALTER TABLE "ExistingProduct" ALTER COLUMN "productPrice" SET NOT NULL;
ALTER TABLE "ExistingProduct" ALTER COLUMN "skuNo" SET NOT NULL;

-- CreateTable
CREATE TABLE "ExistingProductImages" (
    "id" SERIAL NOT NULL,
    "existingProductId" INTEGER NOT NULL,
    "image" TEXT,
    "video" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "imageName" TEXT,
    "videoName" TEXT,
    "variant" JSONB,

    CONSTRAINT "ExistingProductImages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExistingProduct_skuNo_key" ON "ExistingProduct"("skuNo");

-- AddForeignKey
ALTER TABLE "ExistingProduct" ADD CONSTRAINT "ExistingProduct_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExistingProduct" ADD CONSTRAINT "ExistingProduct_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExistingProductImages" ADD CONSTRAINT "ExistingProductImages_existingProductId_fkey" FOREIGN KEY ("existingProductId") REFERENCES "ExistingProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
