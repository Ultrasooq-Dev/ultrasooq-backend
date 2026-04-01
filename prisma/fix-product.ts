import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);

async function main() {
  // Check current state
  const p = await prisma.product.findUnique({
    where: { id: 1 },
    select: { id: true, productName: true, productType: true, status: true, adminId: true },
  });
  console.log('Before:', JSON.stringify(p));

  // Fix: set productType=P
  await prisma.product.update({
    where: { id: 1 },
    data: { productType: 'P' },
  });

  const after = await prisma.product.findUnique({
    where: { id: 1 },
    select: { productType: true, status: true },
  });
  console.log('After:', JSON.stringify(after));

  // Verify via same query the API uses
  const count = await prisma.productPrice.count({
    where: {
      adminId: 6,
      status: { not: 'DELETE' },
      productPrice_product: { productType: 'P' },
    },
  });
  console.log('Products matching API query:', count);
}

main()
  .catch((e) => { console.error(e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
