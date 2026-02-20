-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('PRODUCT', 'SERVICE');

-- AlterTable
ALTER TABLE "ProductQuestion" ADD COLUMN     "questionType" "QuestionType",
ADD COLUMN     "serviceId" INTEGER;
