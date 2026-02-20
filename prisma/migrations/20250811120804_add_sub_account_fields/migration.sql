-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isSubAccount" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parentUserId" INTEGER;

-- AlterTable
ALTER TABLE "UserAccount" ADD COLUMN     "subAccountUserId" INTEGER;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_parentUserId_fkey" FOREIGN KEY ("parentUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccount" ADD CONSTRAINT "UserAccount_subAccountUserId_fkey" FOREIGN KEY ("subAccountUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
