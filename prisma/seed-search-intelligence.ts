/**
 * Seed script for Search Intelligence — brand aliases, and search_vector rebuild.
 * Uses `pg` directly (NOT Prisma) to avoid ESM issues.
 * Run: node prisma/seed-search-intelligence.ts
 */

const pg = require('pg');

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5433/ultrasooq';

// ---------------------------------------------------------------------------
// Brand aliases (canonical name → locale alias arrays)
// The seed flattens all locale arrays into a single JSON array of strings
// and stores them in Brand.aliases (jsonb).
// ---------------------------------------------------------------------------

const brandAliases: Record<string, Record<string, string[]>> = {
  Sony: { ar: ['سوني'], zh: ['索尼'], ja: ['ソニー'] },
  Samsung: { ar: ['سامسونج'], zh: ['三星'], ja: ['サムスン'] },
  Apple: { ar: ['ابل', 'آبل'], zh: ['苹果'] },
  Nike: { ar: ['نايكي'], zh: ['耐克'] },
  Adidas: { ar: ['اديداس'], zh: ['阿迪达斯'] },
  HP: { ar: ['اتش بي'], zh: ['惠普'] },
  Dell: { ar: ['ديل'], zh: ['戴尔'] },
  Lenovo: { ar: ['لينوفو'], zh: ['联想'] },
  Huawei: { ar: ['هواوي'], zh: ['华为'] },
  Toyota: { ar: ['تويوتا'], zh: ['丰田'] },
  Honda: { ar: ['هوندا'], zh: ['本田'] },
  BMW: { ar: ['بي ام دبليو'], zh: ['宝马'] },
  Dyson: { ar: ['دايسون'], zh: ['戴森'] },
  Bose: { ar: ['بوز'] },
  Canon: { ar: ['كانون'], zh: ['佳能'] },
};

async function main() {
  const client = new pg.Client(DATABASE_URL);

  try {
    await client.connect();
    console.log('Connected to database.');

    // ------------------------------------------------------------------
    // 1. Update Brand.aliases for known brands
    // ------------------------------------------------------------------
    console.log('\n--- Seeding brand aliases ---');

    let brandUpdated = 0;
    let brandNotFound = 0;

    for (const [brandName, locales] of Object.entries(brandAliases)) {
      // Flatten all locale alias arrays into one deduplicated list
      const allAliases = Array.from(
        new Set(Object.values(locales).flat()),
      );

      const result = await client.query(
        `UPDATE "Brand"
         SET aliases = $1::jsonb
         WHERE "brandName" = $2
           AND "deletedAt" IS NULL
           AND status != 'DELETE'`,
        [JSON.stringify(allAliases), brandName],
      );

      if (result.rowCount && result.rowCount > 0) {
        console.log(
          `  ✓ ${brandName} — ${allAliases.length} aliases: ${allAliases.join(', ')}`,
        );
        brandUpdated++;
      } else {
        console.log(`  ⚠  ${brandName} — not found in DB (skipped)`);
        brandNotFound++;
      }
    }

    console.log(
      `\nBrand aliases: ${brandUpdated} updated, ${brandNotFound} not found.`,
    );

    // ------------------------------------------------------------------
    // 2. Rebuild search_vector for all active products
    // ------------------------------------------------------------------
    console.log('\n--- Rebuilding search_vector for active products ---');

    const svResult = await client.query(`
      UPDATE "Product"
      SET search_vector = to_tsvector('simple',
        COALESCE("productName", '') || ' ' ||
        COALESCE(description, '') || ' ' ||
        COALESCE("shortDescription", '') || ' ' ||
        COALESCE("skuNo", '')
      )
      WHERE status = 'ACTIVE'
        AND "deletedAt" IS NULL
    `);

    console.log(
      `search_vector rebuilt for ${svResult.rowCount ?? 0} active products.`,
    );

    console.log('\nSeed complete.');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
