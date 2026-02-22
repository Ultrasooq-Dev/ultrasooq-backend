-- Migration: Add new statuses and update existing users
-- This script should be run after updating the Prisma schema

-- First, let's add the new statuses to the enum
-- Note: PostgreSQL doesn't support adding values to existing enums in the middle
-- We need to create a new enum and update the column

-- Step 1: Create new enum with all statuses
CREATE TYPE "Status_new" AS ENUM ('WAITING', 'ACTIVE', 'REJECT', 'INACTIVE', 'DELETE', 'HIDDEN');

-- Step 2: Update the User table to use the new enum
ALTER TABLE "User" ALTER COLUMN "status" TYPE "Status_new" USING "status"::text::"Status_new";

-- Step 3: Drop the old enum
DROP TYPE "Status";

-- Step 4: Rename the new enum to the original name
ALTER TYPE "Status_new" RENAME TO "Status";

-- Step 5: Add statusNote column if it doesn't exist
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "statusNote" TEXT;

-- Step 6: Update existing users with status 'INACTIVE' to 'WAITING' (new default)
UPDATE "User" SET "status" = 'WAITING' WHERE "status" = 'INACTIVE' AND "deletedAt" IS NULL;

-- Step 7: Add a comment to document the change
COMMENT ON COLUMN "User"."status" IS 'User status: WAITING (default), ACTIVE, REJECT, INACTIVE, DELETE, HIDDEN';
COMMENT ON COLUMN "User"."statusNote" IS 'Note/reason for status change';
