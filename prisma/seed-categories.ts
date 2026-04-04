import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);

// ── Parse category-tree-unified.md ─────────────────────────────────────────
function parseCategoryTree(mdPath: string): Map<string, Set<string>> {
  const content = fs.readFileSync(mdPath, 'utf-8');
  const lines = content.split('\n');
  const tree = new Map<string, Set<string>>();
  tree.set('ROOT', new Set());

  for (const line of lines) {
    const match = line.match(/^- (.+)$/);
    if (!match) continue;
    const parts = match[1].split(' > ').map((p) => p.trim());
    if (parts.length < 2) continue;

    tree.get('ROOT')!.add(parts[0]);
    for (let i = 1; i < parts.length; i++) {
      const parentPath = parts.slice(0, i).join('/');
      if (!tree.has(parentPath)) tree.set(parentPath, new Set());
      tree.get(parentPath)!.add(parts[i]);
    }
  }
  return tree;
}

// ── Icon mapping — keys must match the L1 names parsed from the markdown ───
const ROOT_ICONS: Record<string, string> = {
  'Electronics':             'https://cdn-icons-png.flaticon.com/128/3659/3659899.png',
  'Fashion':                 'https://cdn-icons-png.flaticon.com/128/863/863684.png',
  'Home & Garden':           'https://cdn-icons-png.flaticon.com/128/1670/1670080.png',
  'Health & Beauty':         'https://cdn-icons-png.flaticon.com/128/2553/2553642.png',
  'Sports & Outdoors':       'https://cdn-icons-png.flaticon.com/128/857/857455.png',
  'Automotive':              'https://cdn-icons-png.flaticon.com/128/3202/3202926.png',
  'Baby & Kids':             'https://cdn-icons-png.flaticon.com/128/2857/2857732.png',
  'Food & Beverages':        'https://cdn-icons-png.flaticon.com/128/3595/3595455.png',
  'Home Appliances':         'https://cdn-icons-png.flaticon.com/128/2936/2936687.png',
  'Office & School':         'https://cdn-icons-png.flaticon.com/128/3145/3145765.png',
  'Books & Media':           'https://cdn-icons-png.flaticon.com/128/2702/2702134.png',
  'Pet Supplies':            'https://cdn-icons-png.flaticon.com/128/3460/3460335.png',
  'Industrial':              'https://cdn-icons-png.flaticon.com/128/2942/2942170.png',
  'Construction':            'https://cdn-icons-png.flaticon.com/128/2534/2534204.png',
  'Arts & Crafts':           'https://cdn-icons-png.flaticon.com/128/2950/2950651.png',
  'Gifts & Occasions':       'https://cdn-icons-png.flaticon.com/128/4213/4213958.png',
  'Chemicals & Raw Materials':'https://cdn-icons-png.flaticon.com/128/2913/2913106.png',
  'Packaging':               'https://cdn-icons-png.flaticon.com/128/685/685388.png',
  'Security':                'https://cdn-icons-png.flaticon.com/128/2889/2889676.png',
  'Agriculture':             'https://cdn-icons-png.flaticon.com/128/2228/2228877.png',
  'Textiles':                'https://cdn-icons-png.flaticon.com/128/3081/3081648.png',
  'Services & Digital':      'https://cdn-icons-png.flaticon.com/128/2010/2010990.png',
  'Real Estate':             'https://cdn-icons-png.flaticon.com/128/602/602275.png',
};

// ── Recursive seeder ───────────────────────────────────────────────────────
let totalCreated = 0;
const idCache = new Map<string, number>();

async function seedLevel(
  tree: Map<string, Set<string>>,
  treePath: string,
  parentId: number | null,
  menuId: number,
  depth: number,
): Promise<void> {
  const children = tree.get(treePath);
  if (!children) return;

  for (const childName of children) {
    const cacheKey = `${childName}@${parentId ?? 'null'}`;
    if (idCache.has(cacheKey)) {
      const existingId = idCache.get(cacheKey)!;
      const childPath = treePath === 'ROOT' ? childName : `${treePath}/${childName}`;
      if (tree.has(childPath)) {
        await seedLevel(tree, childPath, existingId, menuId, depth + 1);
      }
      continue;
    }

    const icon = depth === 0 ? (ROOT_ICONS[childName] ?? null) : null;
    const isService = childName === 'Services & Digital';

    const cat = await prisma.category.create({
      data: {
        name: childName,
        icon,
        type: isService ? 'service' : null,
        parentId,
        menuId: null,
        status: 'ACTIVE',
        blackList: 'NO',
        whiteList: 'NO',
      },
    });

    idCache.set(cacheKey, cat.id);
    totalCreated++;
    if (totalCreated % 100 === 0) {
      console.log(`  ... ${totalCreated} categories created`);
    }

    const childPath = treePath === 'ROOT' ? childName : `${treePath}/${childName}`;
    if (tree.has(childPath)) {
      await seedLevel(tree, childPath, cat.id, menuId, depth + 1);
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n=== Seeding Categories (6-Level, Alibaba+Amazon+eBay+Taobao) ===\n');

  // Wipe existing categories if any
  const existing = await prisma.category.count();
  if (existing > 0) {
    console.log(`Deleting ${existing} existing categories...`);
    await prisma.categoryKeyword.deleteMany({});
    await prisma.categoryTag.deleteMany({});
    await prisma.categoryConnectTo.deleteMany({});
    await prisma.productCategoryMap.deleteMany({});
    await prisma.serviceCategoryMap.deleteMany({});
    await prisma.category.deleteMany({});
    await prisma.$executeRawUnsafe(`ALTER SEQUENCE "Category_id_seq" RESTART WITH 1`);
    console.log('Deleted all existing categories and reset ID sequence.\n');
  }

  // ── Super-root IDs must match the constants used across all 3 repos ──────
  // frontend/utils/constants.ts:  PRODUCT=1042, SERVICE=1043, BUSINESS_TYPE=1044
  // admin/src/utils/constants.ts:  PRODUCT=1042, SERVICE=1043, BUSINESS_TYPE=1044
  // admin/src/apis/requests/category.requests.ts:  PRODUCT=1042, SERVICE=1043, CATEGORY=1044
  const PRODUCT_ROOT_ID = 1042;
  const SERVICE_ROOT_ID = 1043;
  const BUSINESS_TYPE_ROOT_ID = 1044;

  // Ensure sequence starts high enough for the super-roots
  await prisma.$executeRawUnsafe(
    `ALTER SEQUENCE "Category_id_seq" RESTART WITH ${PRODUCT_ROOT_ID}`,
  );

  // Create 3 super-roots with known IDs (1042, 1043, 1044)
  const productMenuRoot = await prisma.category.create({
    data: { name: 'Product Menu', status: 'ACTIVE', blackList: 'NO', whiteList: 'NO' },
  });
  console.log(`Created menu root: [${productMenuRoot.id}] Product Menu`);
  if (productMenuRoot.id !== PRODUCT_ROOT_ID) {
    console.error(`  ⚠ Expected id=${PRODUCT_ROOT_ID}, got id=${productMenuRoot.id}`);
  }

  const serviceMenuRoot = await prisma.category.create({
    data: { name: 'Service Menu', status: 'ACTIVE', blackList: 'NO', whiteList: 'NO' },
  });
  console.log(`Created service menu root: [${serviceMenuRoot.id}] Service Menu`);
  if (serviceMenuRoot.id !== SERVICE_ROOT_ID) {
    console.error(`  ⚠ Expected id=${SERVICE_ROOT_ID}, got id=${serviceMenuRoot.id}`);
  }

  const businessTypeRoot = await prisma.category.create({
    data: { name: 'Business Types', status: 'ACTIVE', blackList: 'NO', whiteList: 'NO' },
  });
  console.log(`Created business type root: [${businessTypeRoot.id}] Business Types`);
  if (businessTypeRoot.id !== BUSINESS_TYPE_ROOT_ID) {
    console.error(`  ⚠ Expected id=${BUSINESS_TYPE_ROOT_ID}, got id=${businessTypeRoot.id}`);
  }
  console.log('');

  // Find category-tree-unified.md
  const mdCandidates = [
    path.resolve(__dirname, 'category-tree-unified.md'),
    path.resolve(__dirname, '../../category-tree-unified.md'),
    path.resolve(process.cwd(), 'prisma/category-tree-unified.md'),
    path.resolve(process.cwd(), 'category-tree-unified.md'),
  ];

  let mdPath = '';
  for (const candidate of mdCandidates) {
    if (fs.existsSync(candidate)) { mdPath = candidate; break; }
  }
  if (!mdPath) {
    console.error('Could not find category-tree-unified.md in:', mdCandidates);
    process.exit(1);
  }

  console.log(`Parsing ${mdPath}...`);
  const tree = parseCategoryTree(mdPath);
  const rootCount = tree.get('ROOT')?.size ?? 0;
  const totalPaths = Array.from(tree.values()).reduce((sum, s) => sum + s.size, 0);
  console.log(`Found ${rootCount} root categories, ${totalPaths} total paths\n`);

  // Seed all categories from markdown
  console.log('Creating categories...');
  await seedLevel(tree, 'ROOT', null, 0, 0);

  // Assign L1 roots to the correct super-root
  const serviceNames = new Set(['Services & Digital']);
  const roots = await prisma.category.findMany({
    where: {
      parentId: null,
      deletedAt: null,
      id: { notIn: [productMenuRoot.id, serviceMenuRoot.id, businessTypeRoot.id] },
    },
  });

  for (const root of roots) {
    const isService = serviceNames.has(root.name);
    const targetRoot = isService ? serviceMenuRoot : productMenuRoot;
    await prisma.category.update({
      where: { id: root.id },
      data: { menuId: targetRoot.id, parentId: targetRoot.id },
    });
  }

  console.log(`Set menuId + parentId on ${roots.length} root categories`);
  console.log(`  Product Menu [${productMenuRoot.id}]: ${roots.filter((r) => !serviceNames.has(r.name)).length} L1 categories`);
  console.log(`  Service Menu [${serviceMenuRoot.id}]: ${roots.filter((r) => serviceNames.has(r.name)).length} L1 categories`);

  console.log(`\n=== Done! Created ${totalCreated} categories + 3 super-roots ===`);

  // Confirm IDs match the hardcoded constants
  console.log('\n┌─────────────────────────────────────────────────┐');
  console.log('│  Super-root IDs (match all 3 repos):            │');
  console.log('├─────────────────────────────────────────────────┤');
  console.log(`│  PRODUCT_CATEGORY_ID       = ${productMenuRoot.id}`);
  console.log(`│  SERVICE_CATEGORY_ID       = ${serviceMenuRoot.id}`);
  console.log(`│  BUSINESS_TYPE_CATEGORY_ID = ${businessTypeRoot.id}`);
  console.log('└─────────────────────────────────────────────────┘');

  // Summary
  const allRoots = await prisma.category.findMany({
    where: { parentId: null, deletedAt: null },
    orderBy: { id: 'asc' },
    select: { id: true, name: true, menuId: true },
  });
  console.log(`\nSuper-roots (${allRoots.length}):`);
  for (const r of allRoots) {
    const childCount = await prisma.category.count({ where: { parentId: r.id } });
    console.log(`  [${r.id}] ${r.name} (menuId=${r.menuId}, ${childCount} children)`);
  }

  console.log('\nDepth distribution:');
  const depthQuery: Array<{ depth: number; count: number }> = await prisma.$queryRawUnsafe(`
    WITH RECURSIVE cat_depth AS (
      SELECT id, name, "parentId", 0 as depth FROM "Category" WHERE "parentId" IS NULL AND "deletedAt" IS NULL
      UNION ALL
      SELECT c.id, c.name, c."parentId", cd.depth + 1
      FROM "Category" c JOIN cat_depth cd ON c."parentId" = cd.id WHERE c."deletedAt" IS NULL
    )
    SELECT depth, COUNT(*)::int as count FROM cat_depth GROUP BY depth ORDER BY depth
  `);
  for (const row of depthQuery) {
    console.log(`  Level ${row.depth}: ${row.count} categories`);
  }

  const totalInDb = await prisma.category.count({ where: { deletedAt: null } });
  console.log(`\nTotal categories in DB: ${totalInDb}\n`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
