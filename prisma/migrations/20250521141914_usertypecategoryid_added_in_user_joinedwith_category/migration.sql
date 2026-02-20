-- AlterTable
ALTER TABLE "User" ADD COLUMN     "userTypeCategoryId" INTEGER;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_userTypeCategoryId_fkey" FOREIGN KEY ("userTypeCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
