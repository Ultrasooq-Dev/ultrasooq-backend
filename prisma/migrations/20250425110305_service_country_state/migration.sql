/*
  Warnings:

  - You are about to drop the column `fromCountryId` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `fromStateId` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `rangeCountryId` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `rangeStateId` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `toCountryId` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `toStateId` on the `Service` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Service" DROP CONSTRAINT "Service_fromCountryId_fkey";

-- DropForeignKey
ALTER TABLE "Service" DROP CONSTRAINT "Service_fromStateId_fkey";

-- DropForeignKey
ALTER TABLE "Service" DROP CONSTRAINT "Service_rangeCountryId_fkey";

-- DropForeignKey
ALTER TABLE "Service" DROP CONSTRAINT "Service_rangeStateId_fkey";

-- DropForeignKey
ALTER TABLE "Service" DROP CONSTRAINT "Service_toCountryId_fkey";

-- DropForeignKey
ALTER TABLE "Service" DROP CONSTRAINT "Service_toStateId_fkey";

-- AlterTable
ALTER TABLE "Service" DROP COLUMN "fromCountryId",
DROP COLUMN "fromStateId",
DROP COLUMN "rangeCountryId",
DROP COLUMN "rangeStateId",
DROP COLUMN "toCountryId",
DROP COLUMN "toStateId",
ADD COLUMN     "countryId" INTEGER,
ADD COLUMN     "stateId" INTEGER;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_stateId_fkey" FOREIGN KEY ("stateId") REFERENCES "States"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
