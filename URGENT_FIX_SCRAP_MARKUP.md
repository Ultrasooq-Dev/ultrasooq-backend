# URGENT: Fix Scrap Markup Database Error

## Problem
You're getting a "numeric field overflow" error because the `scrapMarkup` column in the database is still `DECIMAL(8,2)` which can only hold values up to 999,999.99.

## Quick Fix - Run This SQL NOW

**Connect to your PostgreSQL database and run this single command:**

```sql
ALTER TABLE "Product" ALTER COLUMN "scrapMarkup" TYPE DECIMAL(10,2);
```

**If the column doesn't exist yet, run this instead:**

```sql
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "scrapMarkup" DECIMAL(10,2);
COMMENT ON COLUMN "Product"."scrapMarkup" IS 'Markup amount applied when admin adds scraped product. NULL for products not added via scrap bulk add.';
```

## Steps to Fix

### Option 1: Using psql command line
```bash
psql -U your_username -d your_database_name
```
Then paste and run:
```sql
ALTER TABLE "Product" ALTER COLUMN "scrapMarkup" TYPE DECIMAL(10,2);
```

### Option 2: Using pgAdmin or DBeaver
1. Connect to your database
2. Open Query Tool / SQL Editor
3. Paste this SQL:
   ```sql
   ALTER TABLE "Product" ALTER COLUMN "scrapMarkup" TYPE DECIMAL(10,2);
   ```
4. Execute the query

### Option 3: Using the fix script
```bash
cd backend
psql -U your_username -d your_database_name -f fix_scrap_markup_precision.sql
```

## After Running the SQL

1. **Regenerate Prisma client:**
   ```bash
   cd backend
   npx prisma generate
   ```

2. **Restart your backend server**

3. **Test the bulk add functionality again**

## Verification

To verify the fix worked, run this SQL:
```sql
SELECT column_name, data_type, numeric_precision, numeric_scale 
FROM information_schema.columns 
WHERE table_name = 'Product' 
AND column_name = 'scrapMarkup';
```

You should see:
- `data_type`: numeric
- `numeric_precision`: 10
- `numeric_scale`: 2

## Why This Happened

The `scrapMarkup` field was created with `DECIMAL(8,2)` precision, which can only store values up to 999,999.99. When the markup amount exceeds this (e.g., large scraped prices with high markup percentages), it causes an overflow error.

Changing to `DECIMAL(10,2)` allows values up to 99,999,999.99, which should be sufficient for most use cases.

