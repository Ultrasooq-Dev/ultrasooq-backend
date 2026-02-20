# Scrap Markup Implementation Summary

## Overview
This implementation adds a separate `scrapMarkup` field to store markup amounts when admin users bulk add products from scrap. The markup field is only visible and used for admin users, while regular users (ADMINMEMBER) continue to use the price/offer price fields.

## Changes Made

### 1. Database Migration
**File:** `add_scrap_markup_field.sql`

- Added `scrapMarkup` column to `Product` table as `DECIMAL(8,2)` (nullable)
- Column is nullable to prevent data loss - existing products will have NULL values
- Safe migration using `IF NOT EXISTS` to prevent errors if column already exists

**To apply the migration:**
```sql
-- Run this SQL in your PostgreSQL database
\i add_scrap_markup_field.sql

-- Or copy and paste the contents of add_scrap_markup_field.sql into your database client
```

### 2. Prisma Schema Update
**File:** `prisma/schema.prisma`

- Added `scrapMarkup` field to Product model
- Field type: `Decimal?` with `@db.Decimal(8, 2)`

**After updating schema, run:**
```bash
npx prisma generate
```

### 3. Backend DTO Update
**File:** `src/product/dto/create-product.dto.ts`

- Added optional `scrapMarkup` field (markup amount)
- Added optional `scrapMarkupPercentage` field (markup percentage)

### 4. Backend Service Update
**File:** `src/product/product.service.ts`

- Updated product creation to save `scrapMarkup` when provided in payload
- Field is set to `null` if not provided (for user bulk add)

### 5. Frontend Component Update
**File:** `admin/src/views/user/Scrap/BulkAddProducts.tsx`

**Changes:**
- Added `useAuth` hook to detect user role
- Admin users (`tradeRole !== 'ADMINMEMBER'`):
  - See "Markup Percentage (%)" field
  - See price preview showing calculated final price
  - Markup is calculated and stored in database
- Regular users (`tradeRole === 'ADMINMEMBER'`):
  - See "Product Price" and "Offer Price" fields (existing behavior)
  - No markup calculation or storage

**Price Calculation:**
- Admin: `finalPrice = scrapedPrice + (scrapedPrice * markupPercentage / 100)`
- User: Uses provided prices or scraped prices directly

## Database Migration Instructions

### Option 1: Using psql command line
```bash
psql -U your_username -d your_database -f add_scrap_markup_field.sql
```

### Option 2: Using pgAdmin or other GUI
1. Open your database client
2. Connect to your database
3. Open the file `add_scrap_markup_field.sql`
4. Execute the SQL commands

### Option 3: Manual execution
Copy and paste this SQL into your database:
```sql
ALTER TABLE "Product" 
ADD COLUMN IF NOT EXISTS "scrapMarkup" DECIMAL(8,2);

COMMENT ON COLUMN "Product"."scrapMarkup" IS 'Markup amount applied when admin adds scraped product. NULL for products not added via scrap bulk add.';
```

## Verification Steps

1. **Database:**
   - Verify column exists: `SELECT column_name FROM information_schema.columns WHERE table_name = 'Product' AND column_name = 'scrapMarkup';`
   - Should return one row

2. **Backend:**
   - Restart backend server
   - Verify no errors on startup
   - Test product creation with `scrapMarkup` in payload

3. **Frontend:**
   - Login as admin user (not ADMINMEMBER)
   - Navigate to scrap bulk add page
   - Verify markup percentage field is visible
   - Login as regular user (ADMINMEMBER)
   - Verify price/offer price fields are visible (no markup field)

## Testing

### Admin User Test:
1. Login as admin
2. Go to `/user/scrap`
3. Import products
4. Go to bulk add page
5. Enter markup percentage (e.g., 25%)
6. Verify price preview shows calculated price
7. Click "Add All Products"
8. Verify products are created with `scrapMarkup` in database

### Regular User Test:
1. Login as ADMINMEMBER user
2. Go to `/user/scrap`
3. Import products
4. Go to bulk add page
5. Verify markup field is NOT visible
6. Verify price/offer price fields ARE visible
7. Enter prices and add products
8. Verify products are created WITHOUT `scrapMarkup` (NULL in database)

## Notes

- The `scrapMarkup` field is completely optional and nullable
- Existing products will have NULL for `scrapMarkup`
- Only admin users can set markup when bulk adding from scrap
- Regular users continue to use the existing price/offer price workflow
- No data loss will occur - all existing data remains intact

