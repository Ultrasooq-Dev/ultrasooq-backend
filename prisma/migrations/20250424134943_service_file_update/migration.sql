/*
  Warnings:

  - Added the required column `fileName` to the `ServiceImage` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fileType` to the `ServiceImage` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('IMAGE', 'VIDEO');

-- AlterTable
ALTER TABLE "ServiceImage" ADD COLUMN     "fileName" TEXT NOT NULL,
ADD COLUMN     "fileType" "FileType" NOT NULL;
