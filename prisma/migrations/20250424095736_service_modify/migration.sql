/*
  Warnings:

  - You are about to drop the column `serviceCost` on the `Service` table. All the data in the column will be lost.
  - You are about to drop the column `serviceCostType` on the `Service` table. All the data in the column will be lost.
  - Added the required column `serviceCost` to the `ServiceFeature` table without a default value. This is not possible if the table is not empty.
  - Added the required column `serviceCostType` to the `ServiceFeature` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Service" DROP COLUMN "serviceCost",
DROP COLUMN "serviceCostType",
ADD COLUMN     "customerPerPeiod" INTEGER,
ADD COLUMN     "eachCustomerTime" INTEGER;

-- AlterTable
ALTER TABLE "ServiceFeature" ADD COLUMN     "serviceCost" DECIMAL(65,30) NOT NULL,
ADD COLUMN     "serviceCostType" "ServiceCostType" NOT NULL;
