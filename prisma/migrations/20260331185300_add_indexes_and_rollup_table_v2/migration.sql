/*
  Warnings:

  - Made the column `dimension` on table `analytics_daily_rollup` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "analytics_daily_rollup" ALTER COLUMN "dimension" SET NOT NULL,
ALTER COLUMN "dimension" SET DEFAULT '';
