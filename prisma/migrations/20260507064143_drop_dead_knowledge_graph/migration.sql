-- DropForeignKey
ALTER TABLE "AccessoryLink" DROP CONSTRAINT "AccessoryLink_accessoryCategoryId_fkey";

-- DropForeignKey
ALTER TABLE "AccessoryLink" DROP CONSTRAINT "AccessoryLink_sourceCategoryId_fkey";

-- DropForeignKey
ALTER TABLE "CompatibilityRule" DROP CONSTRAINT "CompatibilityRule_productId_fkey";

-- DropForeignKey
ALTER TABLE "UseCaseMapping" DROP CONSTRAINT "UseCaseMapping_categoryId_fkey";

-- DropTable
DROP TABLE "AccessoryLink";

-- DropTable
DROP TABLE "CompatibilityRule";

-- DropTable
DROP TABLE "UseCaseMapping";

