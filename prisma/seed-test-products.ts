/**
 * SEED: Test products for all sell types and conditions
 * Run: npx ts-node prisma/seed-test-products.ts
 *
 * Creates 5 test products to verify product-view page renders
 * correctly for each deal type and condition:
 * 1. Normal retail with discount
 * 2. BuyGroup deal
 * 3. Wholesale/Dropship product
 * 4. Used/Refurbished product
 * 5. Custom product (ask for price)
 */
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding test products for all sell types...\n');

  // Find a seller (admin user) to assign products to
  const seller = await prisma.user.findFirst({
    where: { tradeRole: { in: ['COMPANY', 'FREELANCER'] }, status: 'ACTIVE', deletedAt: null },
    select: { id: true, email: true, firstName: true },
  });

  if (!seller) {
    console.error('❌ No active seller found. Create a seller account first.');
    return;
  }
  console.log(`Using seller: ${seller.firstName} (ID: ${seller.id}, ${seller.email})\n`);

  // Find a category
  const category = await prisma.category.findFirst({
    where: { status: 'ACTIVE', deletedAt: null },
    select: { id: true, name: true },
  });
  const categoryId = category?.id || 1;

  const now = new Date();
  const futureDate = new Date(now.getTime() + 14 * 86400000); // 14 days from now
  const pastOpen = new Date(now.getTime() - 7 * 86400000); // 7 days ago

  // ═══════════════════════════════════════════════════════════
  // 1. NORMAL RETAIL WITH DISCOUNT
  // ═══════════════════════════════════════════════════════════
  const retail = await prisma.product.create({
    data: {
      productName: '[TEST] Premium Mechanical Keyboard RGB — Retail Sale',
      productType: 'P',
      status: 'ACTIVE',
      categoryId,
      userId: seller.id,
      productPrice: 120.00,
      offerPrice: 89.99,
      skuNo: `TEST-RETAIL-${Date.now()}`,
      description: JSON.stringify([{ type: 'p', children: [{ text: 'This is a test retail product with a 25% discount. Cherry MX switches, full RGB backlighting, USB-C connection, aircraft-grade aluminum frame.' }] }]),
    },
  });
  await prisma.productPrice.create({
    data: {
      productId: retail.id,
      adminId: seller.id,
      productPrice: 120.00,
      offerPrice: 89.99,
      stock: 50,
      sellType: 'NORMALSELL',
      status: 'ACTIVE',
      consumerType: 'CONSUMER',
      consumerDiscount: 10,
      consumerDiscountType: 'PERCENTAGE',
      deliveryAfter: 3,
      productCondition: 'New',
      minQuantity: 1,
      maxQuantity: 10,
    },
  });
  console.log(`✅ 1. Retail product created: ID ${retail.id}`);

  // ═══════════════════════════════════════════════════════════
  // 2. BUYGROUP DEAL
  // ═══════════════════════════════════════════════════════════
  const buygroup = await prisma.product.create({
    data: {
      productName: '[TEST] Wireless Noise-Cancelling Headphones — Group Buy',
      productType: 'P',
      status: 'ACTIVE',
      categoryId,
      userId: seller.id,
      productPrice: 250.00,
      offerPrice: 149.99,
      skuNo: `TEST-BUYGROUP-${Date.now()}`,
      description: JSON.stringify([{ type: 'p', children: [{ text: 'This is a test buygroup product. Join the group buy to get 40% off! Active noise cancellation, 30-hour battery life, premium audio quality.' }] }]),
    },
  });
  await prisma.productPrice.create({
    data: {
      productId: buygroup.id,
      adminId: seller.id,
      productPrice: 250.00,
      offerPrice: 149.99,
      stock: 200,
      sellType: 'BUYGROUP',
      status: 'ACTIVE',
      consumerType: 'CONSUMER',
      deliveryAfter: 7,
      productCondition: 'New',
      minCustomer: 10,
      maxCustomer: 50,
      minQuantityPerCustomer: 1,
      maxQuantityPerCustomer: 5,
      dateOpen: pastOpen,
      dateClose: futureDate,
      startTime: '00:00',
      endTime: '23:59',
    },
  });
  console.log(`✅ 2. BuyGroup product created: ID ${buygroup.id}`);

  // ═══════════════════════════════════════════════════════════
  // 3. WHOLESALE / DROPSHIP
  // ═══════════════════════════════════════════════════════════
  const wholesale = await prisma.product.create({
    data: {
      productName: '[TEST] Smart LED Bulb Pack x12 — Wholesale',
      productType: 'P',
      status: 'ACTIVE',
      categoryId,
      userId: seller.id,
      productPrice: 45.00,
      offerPrice: 28.99,
      skuNo: `TEST-WHOLESALE-${Date.now()}`,
      isDropshipable: true,
      dropshipCommission: 15.0,
      description: JSON.stringify([{ type: 'p', children: [{ text: 'This is a test wholesale/dropship product. Available for resellers at wholesale pricing. WiFi-enabled, works with Alexa & Google Home.' }] }]),
    },
  });
  await prisma.productPrice.create({
    data: {
      productId: wholesale.id,
      adminId: seller.id,
      productPrice: 45.00,
      offerPrice: 28.99,
      stock: 1000,
      sellType: 'WHOLESALE_PRODUCT',
      status: 'ACTIVE',
      consumerType: 'EVERYONE',
      deliveryAfter: 5,
      productCondition: 'New',
      minQuantity: 12,
      maxQuantity: 500,
    },
  });
  console.log(`✅ 3. Wholesale product created: ID ${wholesale.id}`);

  // ═══════════════════════════════════════════════════════════
  // 4. USED / REFURBISHED PRODUCT
  // ═══════════════════════════════════════════════════════════
  const used = await prisma.product.create({
    data: {
      productName: '[TEST] MacBook Pro 14" M3 — Certified Refurbished',
      productType: 'P',
      status: 'ACTIVE',
      categoryId,
      userId: seller.id,
      productPrice: 1800.00,
      offerPrice: 1299.00,
      skuNo: `TEST-REFURB-${Date.now()}`,
      description: JSON.stringify([{ type: 'p', children: [{ text: 'This is a test refurbished product. Professionally restored by certified technicians. 90-day warranty included. Minor cosmetic wear on bottom case.' }] }]),
    },
  });
  await prisma.productPrice.create({
    data: {
      productId: used.id,
      adminId: seller.id,
      productPrice: 1800.00,
      offerPrice: 1299.00,
      stock: 3,
      sellType: 'NORMALSELL',
      status: 'ACTIVE',
      consumerType: 'CONSUMER',
      deliveryAfter: 2,
      productCondition: 'refurbished',
    },
  });
  console.log(`✅ 4. Refurbished product created: ID ${used.id}`);

  // ═══════════════════════════════════════════════════════════
  // 5. CUSTOM / ASK FOR PRICE
  // ═══════════════════════════════════════════════════════════
  const custom = await prisma.product.create({
    data: {
      productName: '[TEST] Industrial CNC Machine — Custom Quote',
      productType: 'P',
      status: 'ACTIVE',
      categoryId,
      userId: seller.id,
      productPrice: 0,
      offerPrice: 0,
      skuNo: `TEST-CUSTOM-${Date.now()}`,
      description: JSON.stringify([{ type: 'p', children: [{ text: 'This is a test custom-priced product. Contact seller for pricing based on your specifications. Supports custom tooling and configurations.' }] }]),
    },
  });
  await prisma.productPrice.create({
    data: {
      productId: custom.id,
      adminId: seller.id,
      productPrice: 0,
      offerPrice: 0,
      stock: 5,
      sellType: 'NORMALSELL',
      status: 'ACTIVE',
      consumerType: 'CONSUMER',
      deliveryAfter: 30,
      productCondition: 'New',
      askForPrice: 'true',
    },
  });
  console.log(`✅ 5. Custom (ask for price) product created: ID ${custom.id}`);

  // ═══════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════════');
  console.log('TEST PRODUCTS CREATED:');
  console.log('══════════════════════════════════════════════');
  console.log(`  1. Retail (discount):    /product-view/${retail.id}`);
  console.log(`  2. BuyGroup:             /product-view/${buygroup.id}`);
  console.log(`  3. Wholesale/Dropship:   /product-view/${wholesale.id}`);
  console.log(`  4. Refurbished:          /product-view/${used.id}`);
  console.log(`  5. Custom (ask price):   /product-view/${custom.id}`);
  console.log('══════════════════════════════════════════════\n');
}

main()
  .catch((e) => { console.error('Seed error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
