-- Create BannerPosition enum
CREATE TYPE "BannerPosition" AS ENUM ('MAIN', 'SIDE_TOP', 'SIDE_BOTTOM', 'FULL_WIDTH', 'POPUP');

-- Create Banner table
CREATE TABLE "banner" (
    "id" BIGSERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "image" VARCHAR(500) NOT NULL,
    "link" VARCHAR(500),
    "buttonText" VARCHAR(100) DEFAULT 'Shop Now',
    "position" "BannerPosition" NOT NULL DEFAULT 'MAIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "targetUrl" VARCHAR(500),
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banner_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX "banner_position_idx" ON "banner"("position");
CREATE INDEX "banner_isActive_idx" ON "banner"("isActive");
CREATE INDEX "banner_priority_idx" ON "banner"("priority");
CREATE INDEX "banner_startDate_endDate_idx" ON "banner"("startDate", "endDate");
CREATE INDEX "banner_isActive_position_idx" ON "banner"("isActive", "position");

