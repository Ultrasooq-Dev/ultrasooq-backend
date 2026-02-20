-- AlterTable
ALTER TABLE "CartProductService" ADD COLUMN     "cartType" TEXT,
ADD COLUMN     "relatedCartId" INTEGER,
ADD COLUMN     "relatedCartType" TEXT;
