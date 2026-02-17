# Migration Instructions: Add isHidden Field to RfqQuotesUsers

## Overview
This migration adds an `isHidden` boolean field to the `RfqQuotesUsers` table to allow vendors to hide RFQ requests they don't want to see.

## Migration Steps

### Option 1: Using Prisma Migrate (Recommended)
```bash
cd C:\Users\sahaa\Desktop\ultrasooq\backend
npx prisma migrate dev --name add_is_hidden_to_rfq_quotes_users
```

### Option 2: Manual SQL Migration
If you prefer to run the SQL directly:

1. Connect to your PostgreSQL database
2. Run the following SQL:

```sql
-- Add isHidden column to RfqQuotesUsers table
ALTER TABLE "RfqQuotesUsers" 
ADD COLUMN IF NOT EXISTS "isHidden" BOOLEAN NOT NULL DEFAULT false;

-- Create index for better query performance when filtering hidden requests
CREATE INDEX IF NOT EXISTS "RfqQuotesUsers_isHidden_idx" ON "RfqQuotesUsers"("isHidden");
```

### Option 3: Using the provided SQL file
```bash
cd C:\Users\sahaa\Desktop\ultrasooq\backend
psql -U your_username -d your_database_name -f prisma/migrations/add_is_hidden_to_rfq_quotes_users.sql
```

## Verification
After running the migration, verify it was successful:

```sql
-- Check if column exists
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'RfqQuotesUsers' AND column_name = 'isHidden';

-- Check if index exists
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'RfqQuotesUsers' AND indexname = 'RfqQuotesUsers_isHidden_idx';
```

## Notes
- The `isHidden` field defaults to `false` to ensure no data loss for existing records
- All existing RFQ requests will remain visible (not hidden) after migration
- The migration is safe to run on production as it only adds a new column with a default value

