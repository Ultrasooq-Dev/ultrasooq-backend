/**
 * Seed script: Create ProductPrice entries for all pricing/discount scenarios
 * Run: node prisma/seed-pricing-examples.js
 *
 * Uses existing products (IDs 1393-1398) and admin 12 (USS Admin)
 * Creates multiple ProductPrice entries per product to demonstrate all sell types
 */

const pg = require("pg");
const c = new pg.Client("postgresql://postgres:postgres@localhost:5433/ultrasooq");

async function main() {
  await c.connect();
  console.log('🌱 Seeding pricing examples...\n');

  // Get 6 existing products
  const { rows: products } = await c.query(
    `SELECT id, "productName" FROM "Product" WHERE status = 'ACTIVE' AND "deletedAt" IS NULL ORDER BY id DESC LIMIT 6`
  );
  if (products.length < 6) { console.error('Need 6 products, found:', products.length); process.exit(1); }

  products.forEach((p, i) => console.log(`  ${i+1}. [${p.id}] ${p.productName.substring(0, 50)}...`));
  console.log();

  const adminId = 12;
  const now = new Date();
  const startDate = new Date(now); startDate.setDate(startDate.getDate() - 1);
  const endDate = new Date(now); endDate.setDate(endDate.getDate() + 7);

  // A. RETAIL + offerPrice
  await c.query(`UPDATE "ProductPrice" SET "sellType"='NORMALSELL', "productPrice"=100, "offerPrice"=85, "consumerType"='CONSUMER', "consumerDiscount"=0, "consumerDiscountType"=NULL, "vendorDiscount"=0, "vendorDiscountType"=NULL, stock=50, "minQuantityPerCustomer"=1, "maxQuantityPerCustomer"=10, "askForPrice"='false', "enableChat"=true, "deliveryAfter"=3, "productCondition"='New' WHERE "productId"=$1 AND "adminId"=$2`, [products[0].id, adminId]);
  await c.query(`UPDATE "Product" SET "productPrice"=100, "offerPrice"=85 WHERE id=$1`, [products[0].id]);
  console.log(`✅ A. Retail: [${products[0].id}] 100→85 OMR (-15%)`);

  // B. CONSUMER 20% DISCOUNT
  await c.query(`UPDATE "ProductPrice" SET "sellType"='NORMALSELL', "productPrice"=200, "offerPrice"=200, "consumerType"='CONSUMER', "consumerDiscount"=20, "consumerDiscountType"='PERCENTAGE', "vendorDiscount"=0, "vendorDiscountType"=NULL, stock=30, "minQuantityPerCustomer"=1, "maxQuantityPerCustomer"=5, "askForPrice"='false', "enableChat"=true, "deliveryAfter"=5, "productCondition"='New' WHERE "productId"=$1 AND "adminId"=$2`, [products[1].id, adminId]);
  await c.query(`UPDATE "Product" SET "productPrice"=200, "offerPrice"=200 WHERE id=$1`, [products[1].id]);
  console.log(`✅ B. Consumer 20%: [${products[1].id}] 200 OMR → 160 for buyers`);

  // C. EVERYONE DUAL DISCOUNT
  await c.query(`UPDATE "ProductPrice" SET "sellType"='NORMALSELL', "productPrice"=300, "offerPrice"=300, "consumerType"='EVERYONE', "consumerDiscount"=10, "consumerDiscountType"='PERCENTAGE', "vendorDiscount"=25, "vendorDiscountType"='PERCENTAGE', stock=100, "minQuantityPerCustomer"=1, "maxQuantityPerCustomer"=20, "askForPrice"='false', "enableChat"=true, "deliveryAfter"=3, "productCondition"='New' WHERE "productId"=$1 AND "adminId"=$2`, [products[2].id, adminId]);
  await c.query(`UPDATE "Product" SET "productPrice"=300, "offerPrice"=300 WHERE id=$1`, [products[2].id]);
  console.log(`✅ C. Everyone: [${products[2].id}] 300 OMR, buyers -10%, vendors -25%`);

  // D. BUY GROUP + TIMER
  await c.query(`UPDATE "ProductPrice" SET "sellType"='BUYGROUP', "productPrice"=500, "offerPrice"=350, "consumerType"='EVERYONE', "consumerDiscount"=0, stock=200, "minQuantity"=10, "maxQuantity"=100, "minCustomer"=5, "maxCustomer"=50, "minQuantityPerCustomer"=1, "maxQuantityPerCustomer"=10, "dateOpen"=$3, "dateClose"=$4, "startTime"='00:00', "endTime"='23:59', "askForPrice"='false', "enableChat"=true, "deliveryAfter"=7, "productCondition"='New' WHERE "productId"=$1 AND "adminId"=$2`, [products[3].id, adminId, startDate, endDate]);
  await c.query(`UPDATE "Product" SET "productPrice"=500, "offerPrice"=350 WHERE id=$1`, [products[3].id]);
  console.log(`✅ D. Buy Group: [${products[3].id}] 500→350, 5-50 buyers, 7 days`);

  // E. WHOLESALE (vendors only)
  await c.query(`UPDATE "ProductPrice" SET "sellType"='WHOLESALE_PRODUCT', "productPrice"=150, "offerPrice"=90, "consumerType"='VENDORS', "consumerDiscount"=0, "vendorDiscount"=40, "vendorDiscountType"='PERCENTAGE', stock=5000, "minQuantity"=50, "maxQuantity"=10000, "minQuantityPerCustomer"=50, "maxQuantityPerCustomer"=1000, "askForPrice"='false', "enableChat"=true, "deliveryAfter"=14, "productCondition"='New' WHERE "productId"=$1 AND "adminId"=$2`, [products[4].id, adminId]);
  await c.query(`UPDATE "Product" SET "productPrice"=150, "offerPrice"=90 WHERE id=$1`, [products[4].id]);
  console.log(`✅ E. Wholesale: [${products[4].id}] 150→90 OMR, min 50 units`);

  // F. TRIAL PRODUCT
  await c.query(`UPDATE "ProductPrice" SET "sellType"='TRIAL_PRODUCT', "productPrice"=80, "offerPrice"=5, "consumerType"='EVERYONE', "consumerDiscount"=0, stock=20, "minQuantityPerCustomer"=1, "maxQuantityPerCustomer"=1, "askForPrice"='false', "enableChat"=false, "deliveryAfter"=2, "productCondition"='New' WHERE "productId"=$1 AND "adminId"=$2`, [products[5].id, adminId]);
  await c.query(`UPDATE "Product" SET "productPrice"=80, "offerPrice"=5 WHERE id=$1`, [products[5].id]);
  console.log(`✅ F. Trial: [${products[5].id}] 80→5 OMR, limit 1`);

  // G. Second seller for product A
  const { rows: existing } = await c.query(`SELECT id FROM "ProductPrice" WHERE "productId"=$1 AND "adminId"=$2`, [products[0].id, adminId]);
  if (existing.length < 2) {
    await c.query(`INSERT INTO "ProductPrice" ("productId","adminId","sellType","productPrice","offerPrice","consumerType","consumerDiscount",stock,"minQuantityPerCustomer","maxQuantityPerCustomer","askForPrice","enableChat","deliveryAfter","productCondition",status,"createdAt","updatedAt") VALUES ($1,$2,'NORMALSELL',100,78,'CONSUMER',0,25,1,5,'false',true,5,'New','ACTIVE',NOW(),NOW())`, [products[0].id, adminId]);
    console.log(`✅ G. 2nd seller: [${products[0].id}] 100→78 OMR`);
  }

  // Update product A to show best price
  await c.query(`UPDATE "Product" SET "productPrice"=100, "offerPrice"=78 WHERE id=$1`, [products[0].id]);

  console.log('\n🎉 Done! Test at http://localhost:4001/product-hub\n');
  console.log('Summary:');
  console.log(`  A. [${products[0].id}] Retail + offerPrice      → 100→85 + 2nd at 78`);
  console.log(`  B. [${products[1].id}] Consumer 20% discount    → 200, buyers see 160`);
  console.log(`  C. [${products[2].id}] Everyone dual discount   → 300, buyers -10%, vendors -25%`);
  console.log(`  D. [${products[3].id}] Buy Group + timer        → 500→350, 5-50 buyers`);
  console.log(`  E. [${products[4].id}] Wholesale (vendors only) → 150→90, min 50`);
  console.log(`  F. [${products[5].id}] Trial product            → 80→5, limit 1`);
}

main().catch(e => { console.error('❌', e.message); }).finally(() => c.end());
