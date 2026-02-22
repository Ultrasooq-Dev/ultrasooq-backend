-- Migration: Add WAITING_FOR_SUPER_ADMIN status
-- Date: 2024-12-19
-- Description: Add new status WAITING_FOR_SUPER_ADMIN to the Status enum

-- Step 1: Create a new enum with the additional status
CREATE TYPE "Status_new" AS ENUM (
  'WAITING',
  'ACTIVE', 
  'REJECT',
  'INACTIVE',
  'WAITING_FOR_SUPER_ADMIN',
  'DELETE',
  'HIDDEN'
);

-- Step 2: Update the User table to use the new enum
ALTER TABLE "User" 
  ALTER COLUMN "status" TYPE "Status_new" 
  USING ("status"::text::"Status_new");

-- Step 3: Drop the old enum
DROP TYPE "Status";

-- Step 4: Rename the new enum to the original name
ALTER TYPE "Status_new" RENAME TO "Status";

-- Step 5: Verify the migration
SELECT unnest(enum_range(NULL::"Status")) as status_values;
