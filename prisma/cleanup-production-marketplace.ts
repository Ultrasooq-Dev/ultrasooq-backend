import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type CleanupArgs = {
  apply: boolean;
  backup?: string;
  qaTag?: string;
  repairCategories: boolean;
};

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

function parseArgs(argv: string[]): CleanupArgs {
  const args = new Map<string, string | boolean>();
  for (const arg of argv) {
    if (arg === '--apply') args.set('apply', true);
    else if (arg === '--repair-categories') args.set('repairCategories', true);
    else if (arg.startsWith('--backup=')) args.set('backup', arg.slice('--backup='.length));
    else if (arg.startsWith('--qa-tag=')) args.set('qaTag', arg.slice('--qa-tag='.length));
  }

  return {
    apply: args.get('apply') === true,
    backup: args.get('backup') as string | undefined,
    qaTag: (args.get('qaTag') as string | undefined) || 'qa',
    repairCategories: args.get('repairCategories') === true,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dryRun = !options.apply;

  if (options.apply && !options.backup) {
    throw new Error('Refusing to apply cleanup without --backup=/path/to/verified-backup.sql');
  }

  const qaTag = options.qaTag || 'qa';
  const qaProductWhere = {
    OR: [
      { skuNo: { contains: qaTag, mode: 'insensitive' as const } },
      { productName: { contains: qaTag, mode: 'insensitive' as const } },
      { searchTokens: { contains: qaTag, mode: 'insensitive' as const } },
      {
        productTags: {
          some: {
            productTagsTag: {
              tagName: { contains: qaTag, mode: 'insensitive' as const },
            },
          },
        },
      },
    ],
    deletedAt: null,
  };

  const orphanProductWhere = {
    deletedAt: null,
    OR: [{ categoryId: null }, { category: null }],
  };

  const [qaProducts, orphanProducts, inactivePrices] = await Promise.all([
    prisma.product.count({ where: qaProductWhere }),
    prisma.product.count({ where: orphanProductWhere }),
    prisma.productPrice.count({
      where: {
        deletedAt: null,
        status: { not: 'ACTIVE' },
        productPrice_product: { status: 'ACTIVE', deletedAt: null },
      },
    }),
  ]);

  const plan = {
    dryRun,
    backup: options.backup || null,
    qaTag,
    repairCategories: options.repairCategories,
    counts: {
      qaProductsToSoftDelete: qaProducts,
      productsNeedingCategoryRepair: orphanProducts,
      inactivePricesOnActiveProducts: inactivePrices,
    },
  };

  console.log(JSON.stringify(plan, null, 2));

  if (dryRun) return;

  await prisma.$transaction(async (tx) => {
    await tx.product.updateMany({
      where: qaProductWhere,
      data: { status: 'DELETE', deletedAt: new Date() },
    });

    if (options.repairCategories) {
      const fallbackCategory = await tx.category.findFirst({
        where: { status: 'ACTIVE', deletedAt: null },
        orderBy: { id: 'asc' },
        select: { id: true },
      });
      if (!fallbackCategory) {
        throw new Error('No active fallback category found for category/menu repair');
      }
      await tx.product.updateMany({
        where: orphanProductWhere,
        data: { categoryId: fallbackCategory.id },
      });
    }
  });
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
