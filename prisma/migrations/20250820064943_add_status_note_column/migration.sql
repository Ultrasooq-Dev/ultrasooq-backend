/*
  Warnings:

  - You are about to drop the column `userAccountId` on the `AccountSession` table. All the data in the column will be lost.
  - You are about to drop the `UserAccount` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Status" ADD VALUE 'WAITING';
ALTER TYPE "Status" ADD VALUE 'WAITING_FOR_SUPER_ADMIN';
ALTER TYPE "Status" ADD VALUE 'REJECT';

-- DropForeignKey
ALTER TABLE "AccountSession" DROP CONSTRAINT "AccountSession_userAccountId_fkey";

-- DropForeignKey
ALTER TABLE "UserAccount" DROP CONSTRAINT "UserAccount_subAccountUserId_fkey";

-- DropForeignKey
ALTER TABLE "UserAccount" DROP CONSTRAINT "UserAccount_userId_fkey";

-- AlterTable
ALTER TABLE "AccountSession" DROP COLUMN "userAccountId";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accountName" TEXT,
ADD COLUMN     "companyAddress" TEXT,
ADD COLUMN     "companyName" TEXT,
ADD COLUMN     "companyPhone" TEXT,
ADD COLUMN     "companyTaxId" TEXT,
ADD COLUMN     "companyWebsite" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isCurrent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "masterAccountId" INTEGER,
ADD COLUMN     "statusNote" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- DropTable
DROP TABLE "UserAccount";

-- CreateTable
CREATE TABLE "MasterAccount" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "cc" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "gender" "Gender" DEFAULT 'MALE',
    "profilePicture" TEXT,
    "lastActiveUserId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "otp" INTEGER,
    "otpValidTime" TIMESTAMP(3),

    CONSTRAINT "MasterAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MasterAccount_email_key" ON "MasterAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "MasterAccount_lastActiveUserId_key" ON "MasterAccount"("lastActiveUserId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_masterAccountId_fkey" FOREIGN KEY ("masterAccountId") REFERENCES "MasterAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasterAccount" ADD CONSTRAINT "MasterAccount_lastActiveUserId_fkey" FOREIGN KEY ("lastActiveUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
