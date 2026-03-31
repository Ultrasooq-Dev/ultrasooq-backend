import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);

async function main() {
  const sellerId = 6; // seller@ultrasooq.com

  // 1. Find or create product
  let product = await prisma.product.findFirst({
    where: { skuNo: 'SKU-TEST-WH-1000', adminId: sellerId },
  });
  if (!product) {
    product = await prisma.product.create({
    data: {
      productName: 'Premium Wireless Headphones',
      description: 'Noise-cancelling Bluetooth headphones with 30h battery',
      status: 'ACTIVE',
      adminId: sellerId,
      userId: sellerId,
      skuNo: 'SKU-TEST-WH-1000',
      productPrice: 45.00,
      offerPrice: 39.99,
    },
    });
  }
  console.log('Product:', product.id, product.productName);

  // 2. Find or create ProductPrice
  let pp = await prisma.productPrice.findFirst({
    where: { productId: product.id, adminId: sellerId },
  });
  if (!pp) {
    pp = await prisma.productPrice.create({
    data: {
      productId: product.id,
      adminId: sellerId,
      productPrice: 45.00,
      offerPrice: 39.99,
      stock: 150,
      status: 'ACTIVE',
      sellType: 'NORMALSELL',
    },
    });
  }
  console.log('ProductPrice:', pp.id);

  // Valid user IDs we created
  const userIds = [2, 5, 6, 7]; // admin, buyer, seller, freelancer

  // 3. ProductViews (50)
  for (let i = 1; i <= 50; i++) {
    await prisma.productView.upsert({
      where: { deviceId_productId: { deviceId: `d-view-${i}`, productId: product.id } },
      update: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
      create: {
        productId: product.id,
        deviceId: `d-view-${i}`,
        userId: i <= 4 ? userIds[i - 1] : null,
        viewCount: Math.floor(Math.random() * 5) + 1,
        lastViewedAt: new Date(Date.now() - Math.random() * 30 * 86400000),
      },
    });
  }
  console.log('50 views');

  // 4. ProductClicks (30)
  const sources = ['search', 'homepage', 'category', 'recommendation'];
  for (let i = 1; i <= 30; i++) {
    await prisma.productClick.create({
      data: {
        productId: product.id,
        deviceId: `d-click-${i}`,
        userId: i <= 4 ? userIds[i - 1] : null,
        clickSource: sources[i % 4],
        createdAt: new Date(Date.now() - Math.random() * 30 * 86400000),
      },
    });
  }
  console.log('30 clicks');

  // 5. Cart items (4 from real users)
  for (let i = 0; i < userIds.length; i++) {
    await prisma.cart.create({
      data: {
        productId: product.id,
        productPriceId: pp.id,
        userId: userIds[i],
        quantity: (i % 3) + 1,
        cartType: 'DEFAULT',
        status: 'ACTIVE',
      },
    });
  }
  // Plus 8 guest carts
  for (let i = 1; i <= 8; i++) {
    await prisma.cart.create({
      data: {
        productId: product.id,
        productPriceId: pp.id,
        deviceId: `d-cart-${i}`,
        quantity: (i % 3) + 1,
        cartType: 'DEFAULT',
        status: 'ACTIVE',
      },
    });
  }
  console.log('12 cart adds');

  // 6. Orders (8)
  const buyerId = 5; // buyer@ultrasooq.com
  const statuses = ['DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED', 'SHIPPED', 'CONFIRMED', 'PLACED', 'CANCELLED'];
  for (let i = 0; i < 8; i++) {
    const order = await prisma.order.create({
      data: {
        userId: buyerId,
        orderNo: `ORD-TEST-${1000 + i}`,
        totalPrice: 39.99 * ((i % 3) + 1),
        orderStatus: 'PAID',
        orderDate: new Date(Date.now() - Math.random() * 25 * 86400000),
        orderType: 'DEFAULT',
      },
    });
    await prisma.orderProducts.create({
      data: {
        orderId: order.id,
        productId: product.id,
        productPriceId: pp.id,
        sellerId,
        userId: buyerId,
        orderQuantity: (i % 3) + 1,
        salePrice: 39.99,
        purchasePrice: 35.00,
        sellerReceives: 36.00,
        platformFee: 3.99,
        orderProductStatus: statuses[i] as any,
        orderNo: `ORD-TEST-${1000 + i}`,
        createdAt: new Date(Date.now() - Math.random() * 25 * 86400000),
        orderProductType: 'PRODUCT',
      },
    });
  }
  console.log('8 orders (4 delivered, 1 shipped, 1 confirmed, 1 placed, 1 cancelled)');

  // 7. Reviews (5 from buyer)
  const titles = ['Great sound!', 'Best purchase', 'Good value', 'Decent', 'Amazing quality'];
  const descs = ['Crystal clear audio', 'Battery lasts forever', 'Good for the price', 'Does the job', 'Exceeded expectations'];
  const ratings = [5, 5, 4, 3, 5];
  for (let i = 0; i < 5; i++) {
    await prisma.productPriceReview.create({
      data: {
        productPriceId: pp.id,
        productId: product.id,
        adminId: sellerId,
        userId: buyerId,
        title: titles[i],
        description: descs[i],
        rating: ratings[i],
        status: 'ACTIVE',
      },
    });
  }
  console.log('5 reviews (avg 4.4 stars)');
  console.log('\nDone! Login as seller@ultrasooq.com -> /analytics');
}

main()
  .catch((e) => { console.error(e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
