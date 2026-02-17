-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "orderProductId" INTEGER,
ALTER COLUMN "rfqId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "orderProductId" INTEGER,
ALTER COLUMN "rfqId" DROP NOT NULL;
