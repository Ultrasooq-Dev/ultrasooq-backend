/**
 * Seeds 5 trending real-world products into PRODUCTION.
 * Idempotent: cleans up by SKU prefix `PROD-TREND-` and reinserts.
 *
 * Run:
 *   PROD_DATABASE_URL="postgresql://..." npm run seed:prod-trending
 */
import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const url = process.env.PROD_DATABASE_URL;
if (!url) {
  console.error('PROD_DATABASE_URL is required for this script. Refusing to run against default DATABASE_URL for safety.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);

const SKU_PREFIX = 'PROD-TREND-';

const SELLERS = [13, 14, 15, 16, 17];
const BUYERS = [18, 19, 20, 21, 22, 23];

interface Spec { label: string; value: string }
interface Trend {
  name: string;
  desc: string;
  short: string;
  brandId: number;
  catId: number;
  basePrice: number;
  offerPrice: number;
  stock: number;
  images: string[];
  specs: Spec[];
  hotDealPct: number;
  reviewCount: number;
  avgRating: number;
}

// Five real, currently trending products (as of mid-2025 → early 2026 window).
const TRENDING: Trend[] = [
  {
    name: 'iPhone 16 Pro Max 256GB - Titanium Black',
    desc: 'A18 Pro chip, 6.9" Super Retina XDR display with ProMotion, 48MP Fusion camera, Camera Control button, Apple Intelligence ready.',
    short: 'Apple\'s flagship iPhone with A18 Pro and Apple Intelligence',
    brandId: 2,
    catId: 13,
    basePrice: 1199,
    offerPrice: 1099,
    stock: 50,
    images: [
      'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=900&q=80',
      'https://images.unsplash.com/photo-1592286927505-1def25115558?w=900&q=80',
      'https://images.unsplash.com/photo-1605236453806-6ff36851218e?w=900&q=80',
    ],
    specs: [
      { label: 'Display', value: '6.9" Super Retina XDR ProMotion' },
      { label: 'Chip', value: 'Apple A18 Pro' },
      { label: 'Storage', value: '256GB' },
      { label: 'Camera', value: '48MP Fusion + 48MP UW + 12MP 5x Tele' },
      { label: 'Battery', value: 'Up to 33 hours video playback' },
      { label: 'Connector', value: 'USB-C (USB 3)' },
    ],
    hotDealPct: 8,
    reviewCount: 47,
    avgRating: 4.8,
  },
  {
    name: 'Samsung Galaxy S25 Ultra 512GB - Titanium Silverblue',
    desc: 'Snapdragon 8 Elite for Galaxy, Galaxy AI features, integrated S Pen, 200MP camera with ProVisual Engine, 6.9" QHD+ Dynamic AMOLED 2X.',
    short: 'Galaxy AI flagship with built-in S Pen and 200MP camera',
    brandId: 3,
    catId: 13,
    basePrice: 1419,
    offerPrice: 1249,
    stock: 32,
    images: [
      'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=900&q=80',
      'https://images.unsplash.com/photo-1565849904461-04a58ad377e0?w=900&q=80',
    ],
    specs: [
      { label: 'Display', value: '6.9" QHD+ Dynamic AMOLED 2X 120Hz' },
      { label: 'Chip', value: 'Snapdragon 8 Elite for Galaxy' },
      { label: 'Storage', value: '512GB' },
      { label: 'Camera', value: '200MP + 50MP + 50MP + 10MP' },
      { label: 'Battery', value: '5000 mAh, 45W fast charge' },
      { label: 'AI', value: 'Galaxy AI with Now Brief' },
    ],
    hotDealPct: 12,
    reviewCount: 36,
    avgRating: 4.7,
  },
  {
    name: 'MacBook Pro 14" M4 Pro - 24GB / 512GB SSD',
    desc: 'Apple M4 Pro chip with up to 14-core CPU and 20-core GPU, Liquid Retina XDR display, up to 24 hours battery, Thunderbolt 5.',
    short: 'Pro laptop powered by the new Apple M4 Pro',
    brandId: 2,
    catId: 43,
    basePrice: 2499,
    offerPrice: 2299,
    stock: 18,
    images: [
      'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=900&q=80',
      'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=900&q=80',
    ],
    specs: [
      { label: 'Display', value: '14.2" Liquid Retina XDR 120Hz' },
      { label: 'Chip', value: 'Apple M4 Pro (12-core CPU)' },
      { label: 'Memory', value: '24GB Unified Memory' },
      { label: 'Storage', value: '512GB SSD' },
      { label: 'Ports', value: '3x Thunderbolt 5, HDMI, MagSafe 3' },
      { label: 'Battery', value: 'Up to 22 hours' },
    ],
    hotDealPct: 8,
    reviewCount: 22,
    avgRating: 4.9,
  },
  {
    name: 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones',
    desc: 'Industry-leading noise cancellation with eight microphones, 30-hour battery, multipoint Bluetooth, LDAC hi-res audio, lightweight 250g design.',
    short: 'Reference noise-cancelling headphones',
    brandId: 4,
    catId: 74,
    basePrice: 399,
    offerPrice: 329,
    stock: 90,
    images: [
      'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=900&q=80',
      'https://images.unsplash.com/photo-1545127398-14699f92334b?w=900&q=80',
      'https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=900&q=80',
    ],
    specs: [
      { label: 'Driver', value: '30mm carbon fiber composite' },
      { label: 'Noise Cancel', value: 'Adaptive (8 mics, 2 processors)' },
      { label: 'Bluetooth', value: '5.2 with LDAC' },
      { label: 'Battery', value: '30 hours' },
      { label: 'Weight', value: '250g' },
    ],
    hotDealPct: 18,
    reviewCount: 84,
    avgRating: 4.8,
  },
  {
    name: 'Apple Watch Series 10 - 46mm Aluminium GPS',
    desc: 'Largest, thinnest Apple Watch ever with wide-angle OLED display, S10 SiP, sleep apnea notifications, Depth and Water Temperature sensors, 18-hour battery.',
    short: 'The thinnest Apple Watch with wide-angle OLED',
    brandId: 2,
    catId: 74,
    basePrice: 429,
    offerPrice: 379,
    stock: 65,
    images: [
      'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=900&q=80',
      'https://images.unsplash.com/photo-1524805444758-089113d48a6d?w=900&q=80',
    ],
    specs: [
      { label: 'Case Size', value: '46mm Aluminium' },
      { label: 'Display', value: 'Wide-angle OLED Always-On Retina' },
      { label: 'Chip', value: 'S10 SiP' },
      { label: 'Health', value: 'Sleep apnea, ECG, blood oxygen' },
      { label: 'Battery', value: 'Up to 18 hours' },
      { label: 'Water', value: '50m + Depth & Water Temp sensors' },
    ],
    hotDealPct: 12,
    reviewCount: 31,
    avgRating: 4.6,
  },
];

const REVIEW_TITLES = [
  'Excellent quality', 'Worth every penny', 'Loving it so far', 'Fast shipping',
  'Highly recommend', 'Better than expected', 'Solid build', 'Beautiful design',
];
const REVIEW_BODIES = [
  'Arrived quickly and quality is outstanding. Will order again.',
  'Exactly as described — performance has been flawless.',
  'A bit pricey but you really get what you pay for.',
  'Used it daily for weeks now and still impressed.',
  'Customer service was excellent and the product is great.',
  'Sleek design, great features. Highly recommended.',
  'Five stars from me — does exactly what is promised.',
  'Premium feel right out of the box. Very happy.',
];

const pick = <T,>(arr: T[], i: number) => arr[i % arr.length];

async function cleanup() {
  console.log('═══ Cleaning previous prod-trending seed ═══');
  const old = await prisma.product.findMany({
    where: { skuNo: { startsWith: SKU_PREFIX } },
    select: { id: true },
  });
  const ids = old.map((p) => p.id);
  console.log(`  Found ${ids.length} previously-seeded products`);
  if (ids.length === 0) return;
  const prices = await prisma.productPrice.findMany({ where: { productId: { in: ids } }, select: { id: true } });
  const priceIds = prices.map((p) => p.id);
  await prisma.productSellerImage.deleteMany({ where: { productPriceId: { in: priceIds } } });
  await prisma.productPriceReview.deleteMany({ where: { productPriceId: { in: priceIds } } });
  await prisma.productPrice.deleteMany({ where: { productId: { in: ids } } });
  await prisma.productImages.deleteMany({ where: { productId: { in: ids } } });
  await prisma.productReview.deleteMany({ where: { productId: { in: ids } } });
  await prisma.productSpecification.deleteMany({ where: { productId: { in: ids } } });
  await prisma.productShortDescription.deleteMany({ where: { productId: { in: ids } } });
  await prisma.productTags.deleteMany({ where: { productId: { in: ids } } });
  await prisma.product.deleteMany({ where: { id: { in: ids } } });
}

async function seedAllBulk() {
  console.log(`═══ Seeding ${TRENDING.length} trending products (bulk) ═══`);

  // 1) Bulk insert products and capture IDs
  const productRows = TRENDING.map((t, i) => {
    const sellerId = pick(SELLERS, i);
    return {
      productName: t.name,
      description: t.desc,
      shortDescription: t.short,
      specification: JSON.stringify(t.specs.map((s) => [s.label, s.value])),
      status: 'ACTIVE' as const,
      adminId: sellerId,
      userId: sellerId,
      skuNo: `${SKU_PREFIX}${String(i + 1).padStart(3, '0')}`,
      productPrice: t.basePrice,
      offerPrice: t.offerPrice,
      categoryId: t.catId,
      brandId: t.brandId,
      productType: 'P' as any,
      typeOfProduct: 'BRAND' as any,
      productViewCount: Math.floor(Math.random() * 500) + 200,
    };
  });
  await prisma.product.createMany({ data: productRows });
  const products = await prisma.product.findMany({
    where: { skuNo: { startsWith: SKU_PREFIX } },
    select: { id: true, skuNo: true },
    orderBy: { skuNo: 'asc' },
  });
  console.log(`  ✓ Inserted ${products.length} products`);

  // 2) Build child rows in memory
  const imageRows: any[] = [];
  const shortDescRows: any[] = [];
  const specRows: any[] = [];
  const priceRows: any[] = [];
  const reviewRows: any[] = [];

  for (let i = 0; i < TRENDING.length; i++) {
    const t = TRENDING[i];
    const p = products[i];
    const sellerId = pick(SELLERS, i);

    for (const img of t.images) {
      imageRows.push({ productId: p.id, image: img, imageName: `${p.skuNo}-img`, status: 'ACTIVE' });
    }
    shortDescRows.push({ productId: p.id, adminId: sellerId, shortDescription: t.short, status: 'ACTIVE' });
    for (const s of t.specs) {
      specRows.push({ productId: p.id, adminId: sellerId, label: s.label, specification: s.value, status: 'ACTIVE' });
    }
    priceRows.push({
      productId: p.id,
      adminId: sellerId,
      productPrice: t.basePrice,
      offerPrice: t.offerPrice,
      stock: t.stock,
      status: 'ACTIVE',
      sellType: 'NORMALSELL',
      consumerType: 'EVERYONE',
      consumerDiscount: t.hotDealPct,
      consumerDiscountType: 'PERCENTAGE',
      askForPrice: 'false',
      isCustomProduct: 'false',
    });
    for (let r = 0; r < t.reviewCount; r++) {
      const jitter = (r % 5) - 2;
      const rating = Math.max(1, Math.min(5, Math.round(t.avgRating + jitter * 0.4)));
      reviewRows.push({
        userId: pick(BUYERS, r + i),
        productId: p.id,
        title: pick(REVIEW_TITLES, r + i),
        description: pick(REVIEW_BODIES, r + i * 3),
        rating,
        status: 'ACTIVE',
      });
    }
  }

  // 3) Bulk insert children in parallel
  await Promise.all([
    prisma.productImages.createMany({ data: imageRows }),
    prisma.productShortDescription.createMany({ data: shortDescRows }),
    prisma.productSpecification.createMany({ data: specRows }),
    prisma.productPrice.createMany({ data: priceRows }),
    prisma.productReview.createMany({ data: reviewRows }),
  ]);
  console.log(`  ✓ Inserted ${imageRows.length} images, ${specRows.length} specs, ${priceRows.length} prices, ${reviewRows.length} reviews`);
}

async function main() {
  console.log('Target host:', new URL(url!).host);
  await cleanup();
  await seedAllBulk();
  console.log(`\n═══ Done — ${TRENDING.length} products seeded ═══`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
