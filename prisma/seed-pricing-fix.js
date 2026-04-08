const pg = require("pg");
const c = new pg.Client("postgresql://postgres:postgres@localhost:5433/ultrasooq");

async function main() {
  await c.connect();
  console.log('🌱 Fixing pricing — INSERT ProductPrice entries...\n');

  const { rows: products } = await c.query(
    `SELECT id, "productName" FROM "Product" WHERE status = 'ACTIVE' AND "deletedAt" IS NULL ORDER BY id DESC LIMIT 6`
  );
  products.forEach((p, i) => console.log(`  ${i+1}. [${p.id}] ${p.productName.substring(0, 50)}...`));
  console.log();

  const adminId = 12;
  const now = new Date();
  const startDate = new Date(now); startDate.setDate(startDate.getDate() - 1);
  const endDate = new Date(now); endDate.setDate(endDate.getDate() + 7);

  // Helper: upsert ProductPrice
  const upsertPP = async (productId, data) => {
    // Delete existing PPs for this product first
    await c.query(`DELETE FROM "ProductPrice" WHERE "productId"=$1`, [productId]);
    // Insert new
    const keys = Object.keys(data);
    const vals = Object.values(data);
    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
    await c.query(
      `INSERT INTO "ProductPrice" (${keys.map(k => `"${k}"`).join(', ')}) VALUES (${placeholders})`,
      vals
    );
  };

  // A. RETAIL + offerPrice
  await upsertPP(products[0].id, {
    productId: products[0].id, adminId, sellType: 'NORMALSELL',
    productPrice: 100, offerPrice: 85, consumerType: 'CONSUMER',
    consumerDiscount: 0, stock: 50, minQuantityPerCustomer: 1, maxQuantityPerCustomer: 10,
    askForPrice: 'false', enableChat: true, deliveryAfter: 3, productCondition: 'New',
    status: 'ACTIVE', createdAt: now, updatedAt: now,
  });
  // Add 2nd seller
  await c.query(`INSERT INTO "ProductPrice" ("productId","adminId","sellType","productPrice","offerPrice","consumerType","consumerDiscount",stock,"minQuantityPerCustomer","maxQuantityPerCustomer","askForPrice","enableChat","deliveryAfter","productCondition",status,"createdAt","updatedAt") VALUES ($1,$2,'NORMALSELL',100,78,'CONSUMER',0,25,1,5,'false',true,5,'Refurbished','ACTIVE',NOW(),NOW())`, [products[0].id, adminId]);
  await c.query(`UPDATE "Product" SET "productPrice"=100, "offerPrice"=78 WHERE id=$1`, [products[0].id]);
  console.log(`✅ A. Retail: [${products[0].id}] 100→85 + 2nd seller at 78`);

  // B. CONSUMER 20% DISCOUNT
  await upsertPP(products[1].id, {
    productId: products[1].id, adminId, sellType: 'NORMALSELL',
    productPrice: 200, offerPrice: 200, consumerType: 'CONSUMER',
    consumerDiscount: 20, consumerDiscountType: 'PERCENTAGE',
    stock: 30, minQuantityPerCustomer: 1, maxQuantityPerCustomer: 5,
    askForPrice: 'false', enableChat: true, deliveryAfter: 5, productCondition: 'New',
    status: 'ACTIVE', createdAt: now, updatedAt: now,
  });
  await c.query(`UPDATE "Product" SET "productPrice"=200, "offerPrice"=200 WHERE id=$1`, [products[1].id]);
  console.log(`✅ B. Consumer 20%: [${products[1].id}] 200 OMR`);

  // C. EVERYONE DUAL DISCOUNT
  await upsertPP(products[2].id, {
    productId: products[2].id, adminId, sellType: 'NORMALSELL',
    productPrice: 300, offerPrice: 300, consumerType: 'EVERYONE',
    consumerDiscount: 10, consumerDiscountType: 'PERCENTAGE',
    vendorDiscount: 25, vendorDiscountType: 'PERCENTAGE',
    stock: 100, minQuantityPerCustomer: 1, maxQuantityPerCustomer: 20,
    askForPrice: 'false', enableChat: true, deliveryAfter: 3, productCondition: 'New',
    status: 'ACTIVE', createdAt: now, updatedAt: now,
  });
  await c.query(`UPDATE "Product" SET "productPrice"=300, "offerPrice"=300 WHERE id=$1`, [products[2].id]);
  console.log(`✅ C. Everyone: [${products[2].id}] 300 OMR, -10% / -25%`);

  // D. BUY GROUP
  await upsertPP(products[3].id, {
    productId: products[3].id, adminId, sellType: 'BUYGROUP',
    productPrice: 500, offerPrice: 350, consumerType: 'EVERYONE',
    consumerDiscount: 0, stock: 200, minQuantity: 10, maxQuantity: 100,
    minCustomer: 5, maxCustomer: 50, minQuantityPerCustomer: 1, maxQuantityPerCustomer: 10,
    dateOpen: startDate, dateClose: endDate, startTime: '00:00', endTime: '23:59',
    askForPrice: 'false', enableChat: true, deliveryAfter: 7, productCondition: 'New',
    status: 'ACTIVE', createdAt: now, updatedAt: now,
  });
  await c.query(`UPDATE "Product" SET "productPrice"=500, "offerPrice"=350 WHERE id=$1`, [products[3].id]);
  console.log(`✅ D. Buy Group: [${products[3].id}] 500→350, 7 days`);

  // E. WHOLESALE
  await upsertPP(products[4].id, {
    productId: products[4].id, adminId, sellType: 'WHOLESALE_PRODUCT',
    productPrice: 150, offerPrice: 90, consumerType: 'VENDORS',
    vendorDiscount: 40, vendorDiscountType: 'PERCENTAGE',
    stock: 5000, minQuantity: 50, maxQuantity: 10000,
    minQuantityPerCustomer: 50, maxQuantityPerCustomer: 1000,
    askForPrice: 'false', enableChat: true, deliveryAfter: 14, productCondition: 'New',
    status: 'ACTIVE', createdAt: now, updatedAt: now,
  });
  await c.query(`UPDATE "Product" SET "productPrice"=150, "offerPrice"=90 WHERE id=$1`, [products[4].id]);
  console.log(`✅ E. Wholesale: [${products[4].id}] 150→90, min 50`);

  // F. TRIAL
  await upsertPP(products[5].id, {
    productId: products[5].id, adminId, sellType: 'TRIAL_PRODUCT',
    productPrice: 80, offerPrice: 5, consumerType: 'EVERYONE',
    stock: 20, minQuantityPerCustomer: 1, maxQuantityPerCustomer: 1,
    askForPrice: 'false', enableChat: false, deliveryAfter: 2, productCondition: 'New',
    status: 'ACTIVE', createdAt: now, updatedAt: now,
  });
  await c.query(`UPDATE "Product" SET "productPrice"=80, "offerPrice"=5 WHERE id=$1`, [products[5].id]);
  console.log(`✅ F. Trial: [${products[5].id}] 80→5, limit 1`);

  // Verify
  console.log('\nVerifying...');
  for (const p of products) {
    const { rows } = await c.query(`SELECT id, "sellType", "productPrice", "offerPrice", stock FROM "ProductPrice" WHERE "productId"=$1 AND status='ACTIVE'`, [p.id]);
    for (const r of rows) {
      console.log(`  [${p.id}] ppId=${r.id} sellType=${r.sellType} price=${r.productPrice}→${r.offerPrice} stock=${r.stock}`);
    }
  }

  console.log('\n🎉 Done!');
}

main().catch(e => { console.error('❌', e.message); }).finally(() => c.end());
