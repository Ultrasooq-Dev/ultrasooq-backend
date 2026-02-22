/**
 * seed-products.ts
 *
 * Seeds sample Product + ProductPrice rows for four marketplace flows:
 *   1. BuyGroup  -- productType=P, ProductPrice.sellType=BUYGROUP, dateClose in future
 *   2. Factory   -- productType=P, ProductPrice.isCustomProduct='true'
 *   3. RFQ       -- productType=P, typeOfProduct=BRAND, ProductPrice.sellType=NORMALSELL, isCustomProduct='false'
 *   4. Regular   -- productType=P, ProductPrice.sellType=NORMALSELL
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register prisma/seed-products.ts
 */

import 'dotenv/config';
import {
  PrismaClient,
  Status,
  ProductType,
  SellType,
  TypeOfProduct,
  TypeProduct,
  ConsumerType,
} from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ────────────────────────────────────────────────────────────────
// Configuration
// ────────────────────────────────────────────────────────────────
const SELLER_USER_ID = 1; // must already exist in User table

// We will dynamically look up category IDs in the 1-10 range
// (whatever the first 10 categories are from seed-categories)

// ────────────────────────────────────────────────────────────────
// Helper: find or create a brand
// ────────────────────────────────────────────────────────────────
async function ensureBrand(brandName: string): Promise<number> {
  let brand = await prisma.brand.findFirst({ where: { brandName } });
  if (!brand) {
    brand = await prisma.brand.create({
      data: { brandName, status: Status.ACTIVE },
    });
    console.log(`  [new]  Brand "${brandName}" (id=${brand.id})`);
  } else {
    console.log(`  [skip] Brand "${brandName}" already exists (id=${brand.id})`);
  }
  return brand.id;
}

// ────────────────────────────────────────────────────────────────
// Helper: upsert product + productPrice in one go
// ────────────────────────────────────────────────────────────────
interface ProductSeedInput {
  productName: string;
  skuNo: string;
  productPrice: number;
  offerPrice: number;
  description: string;
  shortDescription?: string;
  categoryId: number;
  brandId?: number;
  productType: ProductType;
  typeOfProduct?: TypeOfProduct;
  typeProduct?: TypeProduct;
  // ProductPrice fields
  sellType: SellType;
  isCustomProduct?: string;    // 'true' | 'false'
  consumerType?: ConsumerType;
  stock?: number;
  minQuantity?: number;
  maxQuantity?: number;
  dateOpen?: Date;
  dateClose?: Date;
  minCustomer?: number;
  maxCustomer?: number;
}

async function upsertProduct(input: ProductSeedInput): Promise<void> {
  // Upsert product by unique skuNo
  let product = await prisma.product.findUnique({ where: { skuNo: input.skuNo } });
  if (product) {
    product = await prisma.product.update({
      where: { skuNo: input.skuNo },
      data: {
        productName: input.productName,
        categoryId: input.categoryId,
        productPrice: input.productPrice,
        offerPrice: input.offerPrice,
        description: input.description,
        shortDescription: input.shortDescription ?? null,
        status: Status.ACTIVE,
        userId: SELLER_USER_ID,
        productType: input.productType,
        typeOfProduct: input.typeOfProduct ?? null,
        typeProduct: input.typeProduct ?? null,
        brandId: input.brandId ?? null,
      },
    });
    console.log(`  [update] Product "${input.productName}" (id=${product.id})`);
  } else {
    product = await prisma.product.create({
      data: {
        productName: input.productName,
        skuNo: input.skuNo,
        categoryId: input.categoryId,
        productPrice: input.productPrice,
        offerPrice: input.offerPrice,
        description: input.description,
        shortDescription: input.shortDescription ?? null,
        status: Status.ACTIVE,
        userId: SELLER_USER_ID,
        productType: input.productType,
        typeOfProduct: input.typeOfProduct ?? null,
        typeProduct: input.typeProduct ?? null,
        brandId: input.brandId ?? null,
      },
    });
    console.log(`  [new]    Product "${input.productName}" (id=${product.id})`);
  }

  // Upsert ProductPrice — check if one already exists for this product+admin+sellType
  const existingPP = await prisma.productPrice.findFirst({
    where: {
      productId: product.id,
      adminId: SELLER_USER_ID,
      sellType: input.sellType,
    },
  });

  const ppData = {
    productId: product.id,
    adminId: SELLER_USER_ID,
    productPrice: input.productPrice,
    offerPrice: input.offerPrice,
    sellType: input.sellType,
    isCustomProduct: input.isCustomProduct ?? 'false',
    consumerType: input.consumerType ?? ConsumerType.EVERYONE,
    stock: input.stock ?? 100,
    minQuantity: input.minQuantity ?? 1,
    maxQuantity: input.maxQuantity ?? 1000,
    status: Status.ACTIVE,
    dateOpen: input.dateOpen ?? null,
    dateClose: input.dateClose ?? null,
    minCustomer: input.minCustomer ?? null,
    maxCustomer: input.maxCustomer ?? null,
  };

  if (existingPP) {
    await prisma.productPrice.update({
      where: { id: existingPP.id },
      data: ppData,
    });
    console.log(`    [update] ProductPrice id=${existingPP.id} sellType=${input.sellType}`);
  } else {
    const pp = await prisma.productPrice.create({ data: ppData });
    console.log(`    [new]    ProductPrice id=${pp.id} sellType=${input.sellType}`);
  }
}

// ────────────────────────────────────────────────────────────────
// 1. BuyGroup Products
//    Filters: productType=P, status=ACTIVE, ProductPrice.sellType=BUYGROUP,
//             ProductPrice.status=ACTIVE, ProductPrice.dateClose > now
// ────────────────────────────────────────────────────────────────
async function seedBuyGroupProducts(categoryIds: number[], brandId: number) {
  console.log('\n--- Seeding BuyGroup Products ---');

  // dateClose 30 days in the future
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 30);
  const openDate = new Date();

  const products: ProductSeedInput[] = [
    {
      productName: 'Bulk Organic Arabica Coffee Beans 5kg',
      skuNo: 'SEED-BG-001',
      productPrice: 89.99,
      offerPrice: 69.99,
      description: 'Premium organic Arabica coffee beans sourced from Colombian highlands. Perfect for cafes and coffee enthusiasts. Group buy for best pricing.',
      shortDescription: 'Organic Colombian Arabica coffee in bulk',
      categoryId: categoryIds[0],
      brandId,
      productType: ProductType.P,
      typeOfProduct: TypeOfProduct.BRAND,
      sellType: SellType.BUYGROUP,
      stock: 500,
      minQuantity: 5,
      maxQuantity: 100,
      dateOpen: openDate,
      dateClose: futureDate,
      minCustomer: 3,
      maxCustomer: 50,
    },
    {
      productName: 'Smart Home Starter Kit Bundle',
      skuNo: 'SEED-BG-002',
      productPrice: 299.99,
      offerPrice: 219.99,
      description: 'Complete smart home kit including WiFi hub, 4 smart bulbs, 2 motion sensors, and 1 smart plug. Group buy discount: save up to 27%.',
      shortDescription: 'All-in-one smart home automation bundle',
      categoryId: categoryIds[1],
      brandId,
      productType: ProductType.P,
      typeOfProduct: TypeOfProduct.BRAND,
      sellType: SellType.BUYGROUP,
      stock: 200,
      minQuantity: 1,
      maxQuantity: 20,
      dateOpen: openDate,
      dateClose: futureDate,
      minCustomer: 5,
      maxCustomer: 100,
    },
    {
      productName: 'Professional Chef Knife Set (8 Pieces)',
      skuNo: 'SEED-BG-003',
      productPrice: 199.99,
      offerPrice: 149.99,
      description: 'German stainless steel chef knife set with ergonomic handles. Includes chef knife, santoku, bread knife, utility knife, paring knife, shears, sharpener, and wooden block.',
      shortDescription: '8-piece German steel chef knife collection',
      categoryId: categoryIds[2],
      brandId,
      productType: ProductType.P,
      typeOfProduct: TypeOfProduct.BRAND,
      sellType: SellType.BUYGROUP,
      stock: 150,
      minQuantity: 1,
      maxQuantity: 30,
      dateOpen: openDate,
      dateClose: futureDate,
      minCustomer: 10,
      maxCustomer: 200,
    },
    {
      productName: 'Wireless Noise-Cancelling Earbuds Pro',
      skuNo: 'SEED-BG-004',
      productPrice: 159.99,
      offerPrice: 119.99,
      description: 'True wireless earbuds with hybrid active noise cancellation, 36-hour battery life with case, IPX5 water resistance, and premium sound quality.',
      shortDescription: 'ANC earbuds with 36hr battery',
      categoryId: categoryIds[3],
      brandId,
      productType: ProductType.P,
      typeOfProduct: TypeOfProduct.BRAND,
      sellType: SellType.BUYGROUP,
      stock: 300,
      minQuantity: 1,
      maxQuantity: 50,
      dateOpen: openDate,
      dateClose: futureDate,
      minCustomer: 5,
      maxCustomer: 100,
    },
    {
      productName: 'Ergonomic Standing Desk Converter',
      skuNo: 'SEED-BG-005',
      productPrice: 349.99,
      offerPrice: 259.99,
      description: 'Height-adjustable standing desk converter with gas spring lift. Fits on existing desks. Two-tier design with keyboard tray. Group buy price for offices.',
      shortDescription: 'Adjustable standing desk riser',
      categoryId: categoryIds[4],
      brandId,
      productType: ProductType.P,
      typeOfProduct: TypeOfProduct.BRAND,
      sellType: SellType.BUYGROUP,
      stock: 100,
      minQuantity: 2,
      maxQuantity: 50,
      dateOpen: openDate,
      dateClose: futureDate,
      minCustomer: 3,
      maxCustomer: 30,
    },
  ];

  for (const p of products) {
    await upsertProduct(p);
  }
}

// ────────────────────────────────────────────────────────────────
// 2. Factory Products
//    Filters: productType=P, status=ACTIVE,
//             ProductPrice.isCustomProduct='true', ProductPrice.status=ACTIVE
// ────────────────────────────────────────────────────────────────
async function seedFactoryProducts(categoryIds: number[], brandId: number) {
  console.log('\n--- Seeding Factory Products ---');

  const products: ProductSeedInput[] = [
    {
      productName: 'Custom Logo Embossed Leather Wallet',
      skuNo: 'SEED-FC-001',
      productPrice: 24.99,
      offerPrice: 18.99,
      description: 'Genuine leather bifold wallet with custom logo embossing. MOQ 50 units. Available in black, brown, and tan. Factory direct pricing for brand customization.',
      shortDescription: 'Custom embossed leather wallet - factory direct',
      categoryId: categoryIds[5 % categoryIds.length],
      brandId,
      productType: ProductType.P,
      typeOfProduct: TypeOfProduct.OWNBRAND,
      sellType: SellType.NORMALSELL,
      isCustomProduct: 'true',
      stock: 5000,
      minQuantity: 50,
      maxQuantity: 10000,
    },
    {
      productName: 'OEM Stainless Steel Water Bottle 750ml',
      skuNo: 'SEED-FC-002',
      productPrice: 12.99,
      offerPrice: 8.49,
      description: 'Double-wall vacuum insulated stainless steel bottle. Custom printing/engraving available. BPA-free. Keeps drinks cold 24hrs or hot 12hrs. MOQ 100 units.',
      shortDescription: 'Custom branded insulated water bottle',
      categoryId: categoryIds[6 % categoryIds.length],
      brandId,
      productType: ProductType.P,
      typeOfProduct: TypeOfProduct.OWNBRAND,
      sellType: SellType.NORMALSELL,
      isCustomProduct: 'true',
      stock: 10000,
      minQuantity: 100,
      maxQuantity: 50000,
    },
    {
      productName: 'Private Label Vitamin C Serum 30ml',
      skuNo: 'SEED-FC-003',
      productPrice: 9.99,
      offerPrice: 5.99,
      description: 'Premium Vitamin C serum with hyaluronic acid. Private label ready with custom packaging and labeling. GMP certified facility. MOQ 200 units.',
      shortDescription: 'Private label Vitamin C skincare serum',
      categoryId: categoryIds[7 % categoryIds.length],
      brandId,
      productType: ProductType.P,
      typeOfProduct: TypeOfProduct.OWNBRAND,
      sellType: SellType.NORMALSELL,
      isCustomProduct: 'true',
      stock: 20000,
      minQuantity: 200,
      maxQuantity: 100000,
    },
    {
      productName: 'Custom Print Cotton Tote Bag',
      skuNo: 'SEED-FC-004',
      productPrice: 4.99,
      offerPrice: 2.99,
      description: 'Heavy-duty 12oz organic cotton tote bag with custom full-color printing. Eco-friendly alternative to plastic bags. MOQ 100 units. Great for promotional events.',
      shortDescription: 'Custom printed organic cotton tote bag',
      categoryId: categoryIds[8 % categoryIds.length],
      brandId,
      productType: ProductType.P,
      typeOfProduct: TypeOfProduct.OWNBRAND,
      sellType: SellType.NORMALSELL,
      isCustomProduct: 'true',
      stock: 50000,
      minQuantity: 100,
      maxQuantity: 100000,
    },
    {
      productName: 'OEM Bluetooth Speaker Module PCB',
      skuNo: 'SEED-FC-005',
      productPrice: 7.50,
      offerPrice: 4.99,
      description: 'Bluetooth 5.3 speaker module PCB assembly for OEM integration. Supports custom firmware. Includes amplifier, codec, and antenna. MOQ 500 units.',
      shortDescription: 'Bluetooth speaker module for OEM products',
      categoryId: categoryIds[9 % categoryIds.length],
      brandId,
      productType: ProductType.P,
      typeOfProduct: TypeOfProduct.OWNBRAND,
      sellType: SellType.NORMALSELL,
      isCustomProduct: 'true',
      stock: 30000,
      minQuantity: 500,
      maxQuantity: 200000,
    },
  ];

  for (const p of products) {
    await upsertProduct(p);
  }
}

// ────────────────────────────────────────────────────────────────
// 3. RFQ Products
//    Filters: status=ACTIVE, typeOfProduct=BRAND,
//             (productType=P) OR (productType=R AND userId=caller),
//             ProductPrice.sellType=NORMALSELL, ProductPrice.isCustomProduct='false',
//             ProductPrice.status=ACTIVE
// ────────────────────────────────────────────────────────────────
async function seedRfqProducts(categoryIds: number[], brandId: number) {
  console.log('\n--- Seeding RFQ Products ---');

  const products: ProductSeedInput[] = [
    {
      productName: 'Industrial Grade Hydraulic Press 50-Ton',
      skuNo: 'SEED-RFQ-001',
      productPrice: 12500.00,
      offerPrice: 11000.00,
      description: 'Heavy-duty 50-ton hydraulic press for metal forming, stamping, and compression molding. Electric pump, adjustable stroke, safety guard included. Request quote for volume pricing.',
      shortDescription: '50-ton hydraulic press for industrial use',
      categoryId: categoryIds[0],
      brandId,
      productType: ProductType.P,
      typeOfProduct: TypeOfProduct.BRAND,
      typeProduct: TypeProduct.BRAND,
      sellType: SellType.NORMALSELL,
      isCustomProduct: 'false',
      stock: 10,
      minQuantity: 1,
      maxQuantity: 20,
    },
    {
      productName: 'Commercial HVAC System 5-Ton Split Unit',
      skuNo: 'SEED-RFQ-002',
      productPrice: 8500.00,
      offerPrice: 7800.00,
      description: 'Commercial grade 5-ton split HVAC system. Energy Star rated, R-410A refrigerant, smart thermostat compatible. Installation available. Request quote for project pricing.',
      shortDescription: 'Commercial 5-ton HVAC split system',
      categoryId: categoryIds[1],
      brandId,
      productType: ProductType.P,
      typeOfProduct: TypeOfProduct.BRAND,
      typeProduct: TypeProduct.BRAND,
      sellType: SellType.NORMALSELL,
      isCustomProduct: 'false',
      stock: 25,
      minQuantity: 1,
      maxQuantity: 50,
    },
    {
      productName: 'Solar Panel Array Kit 10kW Residential',
      skuNo: 'SEED-RFQ-003',
      productPrice: 15000.00,
      offerPrice: 13500.00,
      description: 'Complete 10kW residential solar panel kit with 25 monocrystalline panels, micro-inverters, mounting hardware, and monitoring system. 25-year warranty. RFQ for installation packages.',
      shortDescription: '10kW residential solar panel complete kit',
      categoryId: categoryIds[2],
      brandId,
      productType: ProductType.P,
      typeOfProduct: TypeOfProduct.BRAND,
      typeProduct: TypeProduct.BRAND,
      sellType: SellType.NORMALSELL,
      isCustomProduct: 'false',
      stock: 15,
      minQuantity: 1,
      maxQuantity: 100,
    },
    {
      productName: 'CNC Milling Machine 3-Axis VMC',
      skuNo: 'SEED-RFQ-004',
      productPrice: 45000.00,
      offerPrice: 42000.00,
      description: '3-axis vertical machining center with 24-tool ATC, 10,000 RPM spindle, Fanuc control system. Table size 1000x500mm. Request quote for tooling packages and delivery.',
      shortDescription: '3-axis CNC vertical machining center',
      categoryId: categoryIds[3],
      brandId,
      productType: ProductType.P,
      typeOfProduct: TypeOfProduct.BRAND,
      typeProduct: TypeProduct.BRAND,
      sellType: SellType.NORMALSELL,
      isCustomProduct: 'false',
      stock: 5,
      minQuantity: 1,
      maxQuantity: 10,
    },
    {
      productName: 'Commercial Coffee Roaster 15kg Batch',
      skuNo: 'SEED-RFQ-005',
      productPrice: 18000.00,
      offerPrice: 16500.00,
      description: 'Professional drum coffee roaster with 15kg batch capacity. Digital profile control, chaff collector, cooling tray. Gas or electric models. Request quote for customization options.',
      shortDescription: '15kg commercial coffee drum roaster',
      categoryId: categoryIds[4],
      brandId,
      productType: ProductType.P,
      typeOfProduct: TypeOfProduct.BRAND,
      typeProduct: TypeProduct.BRAND,
      sellType: SellType.NORMALSELL,
      isCustomProduct: 'false',
      stock: 8,
      minQuantity: 1,
      maxQuantity: 20,
    },
  ];

  for (const p of products) {
    await upsertProduct(p);
  }
}

// ────────────────────────────────────────────────────────────────
// 4. Regular Products (with standard NORMALSELL ProductPrice)
//    Standard marketplace products visible in normal browse/search.
// ────────────────────────────────────────────────────────────────
async function seedRegularProducts(categoryIds: number[], brandId: number) {
  console.log('\n--- Seeding Regular Products ---');

  const products: ProductSeedInput[] = [
    {
      productName: 'Ultra HD 4K Action Camera Waterproof',
      skuNo: 'SEED-REG-001',
      productPrice: 179.99,
      offerPrice: 149.99,
      description: '4K Ultra HD action camera with electronic image stabilization, 170-degree wide angle lens, 40m waterproof housing, WiFi remote control, and 64GB micro SD card included.',
      shortDescription: '4K waterproof action camera with EIS',
      categoryId: categoryIds[5 % categoryIds.length],
      brandId,
      productType: ProductType.P,
      typeOfProduct: TypeOfProduct.BRAND,
      typeProduct: TypeProduct.BRAND,
      sellType: SellType.NORMALSELL,
      isCustomProduct: 'false',
      stock: 200,
      minQuantity: 1,
      maxQuantity: 50,
      consumerType: ConsumerType.EVERYONE,
    },
    {
      productName: 'Bamboo Wireless Charging Pad Duo',
      skuNo: 'SEED-REG-002',
      productPrice: 49.99,
      offerPrice: 39.99,
      description: 'Eco-friendly bamboo dual wireless charging pad. Charges two devices simultaneously at 15W each. Compatible with all Qi-enabled devices. LED indicator. Anti-slip base.',
      shortDescription: 'Dual 15W bamboo wireless charger',
      categoryId: categoryIds[6 % categoryIds.length],
      brandId,
      productType: ProductType.P,
      typeOfProduct: TypeOfProduct.BRAND,
      typeProduct: TypeProduct.BRAND,
      sellType: SellType.NORMALSELL,
      isCustomProduct: 'false',
      stock: 500,
      minQuantity: 1,
      maxQuantity: 100,
      consumerType: ConsumerType.EVERYONE,
    },
    {
      productName: 'Memory Foam Travel Neck Pillow',
      skuNo: 'SEED-REG-003',
      productPrice: 34.99,
      offerPrice: 27.99,
      description: 'Premium memory foam travel pillow with adjustable clasp, removable washable velour cover, and compact carrying bag. Provides 360-degree neck support for flights and road trips.',
      shortDescription: 'Adjustable memory foam travel pillow',
      categoryId: categoryIds[7 % categoryIds.length],
      brandId,
      productType: ProductType.P,
      typeOfProduct: TypeOfProduct.BRAND,
      typeProduct: TypeProduct.BRAND,
      sellType: SellType.NORMALSELL,
      isCustomProduct: 'false',
      stock: 800,
      minQuantity: 1,
      maxQuantity: 200,
      consumerType: ConsumerType.EVERYONE,
    },
    {
      productName: 'Stainless Steel Insulated Lunch Box Set',
      skuNo: 'SEED-REG-004',
      productPrice: 42.99,
      offerPrice: 35.99,
      description: 'Three-tier stackable stainless steel lunch box with insulated carry bag. Leak-proof silicone seals. BPA-free. Keeps food hot for 6 hours. Includes cutlery set.',
      shortDescription: '3-tier insulated stainless lunch box',
      categoryId: categoryIds[8 % categoryIds.length],
      brandId,
      productType: ProductType.P,
      typeOfProduct: TypeOfProduct.BRAND,
      typeProduct: TypeProduct.BRAND,
      sellType: SellType.NORMALSELL,
      isCustomProduct: 'false',
      stock: 350,
      minQuantity: 1,
      maxQuantity: 100,
      consumerType: ConsumerType.EVERYONE,
    },
    {
      productName: 'LED Desk Lamp with Wireless Charger',
      skuNo: 'SEED-REG-005',
      productPrice: 59.99,
      offerPrice: 47.99,
      description: 'Modern LED desk lamp with built-in 10W wireless charger, USB-A port, 5 color temperatures, 7 brightness levels, and 60-minute auto-off timer. Touch control. Foldable design.',
      shortDescription: 'LED lamp with wireless charging base',
      categoryId: categoryIds[9 % categoryIds.length],
      brandId,
      productType: ProductType.P,
      typeOfProduct: TypeOfProduct.BRAND,
      typeProduct: TypeProduct.BRAND,
      sellType: SellType.NORMALSELL,
      isCustomProduct: 'false',
      stock: 250,
      minQuantity: 1,
      maxQuantity: 50,
      consumerType: ConsumerType.EVERYONE,
    },
  ];

  for (const p of products) {
    await upsertProduct(p);
  }
}

// ────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('========================================');
  console.log('  Ultrasooq Product Seed Script');
  console.log('========================================');

  // Verify seller user exists
  const seller = await prisma.user.findUnique({ where: { id: SELLER_USER_ID } });
  if (!seller) {
    console.error(`ERROR: User with id=${SELLER_USER_ID} not found. Run the main seed.ts first.`);
    process.exit(1);
  }
  console.log(`Seller user found: id=${seller.id}, email=${seller.email}`);

  // Fetch first 10 category IDs that are ACTIVE
  const categories = await prisma.category.findMany({
    where: { status: Status.ACTIVE },
    orderBy: { id: 'asc' },
    take: 10,
    select: { id: true, name: true },
  });

  if (categories.length === 0) {
    console.error('ERROR: No categories found. Run seed-categories.ts first.');
    process.exit(1);
  }

  const categoryIds = categories.map((c) => c.id);
  console.log(`Using ${categoryIds.length} categories: ${categoryIds.join(', ')}`);
  categories.forEach((c) => console.log(`  cat ${c.id}: ${c.name}`));

  // Ensure a brand exists
  const brandId = await ensureBrand('SeedBrand');

  // Seed all four product types
  await seedBuyGroupProducts(categoryIds, brandId);
  await seedFactoryProducts(categoryIds, brandId);
  await seedRfqProducts(categoryIds, brandId);
  await seedRegularProducts(categoryIds, brandId);

  // Summary counts
  const totalProducts = await prisma.product.count({
    where: { skuNo: { startsWith: 'SEED-' } },
  });
  const totalPrices = await prisma.productPrice.count({
    where: {
      productPrice_product: { skuNo: { startsWith: 'SEED-' } },
    },
  });

  console.log('\n========================================');
  console.log(`  Seed completed!`);
  console.log(`  Total seeded products: ${totalProducts}`);
  console.log(`  Total ProductPrice rows: ${totalPrices}`);
  console.log('========================================');
}

main()
  .catch((e) => {
    console.error('\nSeed failed with error:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
