-- AddForeignKey
ALTER TABLE "UserBusinessCategory" ADD CONSTRAINT "UserBusinessCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
