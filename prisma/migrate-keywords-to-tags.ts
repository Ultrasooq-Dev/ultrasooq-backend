/**
 * Migration Script: CategoryKeyword → CategoryTag
 *
 * For each CategoryKeyword record:
 * 1. Find or create a Tags record matching the keyword name (case-insensitive)
 * 2. Create a CategoryTag linking that tag to the category
 * 3. CategoryKeyword table is kept intact for rollback safety
 *
 * Usage: npx ts-node prisma/migrate-keywords-to-tags.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting migration: CategoryKeyword → CategoryTag');

  // Get all active keywords
  const keywords = await prisma.categoryKeyword.findMany({
    where: { status: 'ACTIVE', deletedAt: null },
    include: { category: { select: { id: true, name: true } } },
  });

  console.log(`Found ${keywords.length} active category keywords to migrate`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const keyword of keywords) {
    const normalizedName = keyword.keyword.trim();
    if (!normalizedName) {
      skipped++;
      continue;
    }

    try {
      // Find or create a tag with this name (case-insensitive match)
      let tag = await prisma.tags.findFirst({
        where: {
          tagName: { equals: normalizedName, mode: 'insensitive' },
          status: 'ACTIVE',
        },
      });

      if (!tag) {
        tag = await prisma.tags.create({
          data: { tagName: normalizedName },
        });
        console.log(`  Created new tag: "${normalizedName}" (id=${tag.id})`);
      }

      // Create CategoryTag linking
      await prisma.categoryTag.create({
        data: {
          categoryId: keyword.categoryId,
          tagId: tag.id,
        },
      });

      created++;
      console.log(
        `  Linked tag "${normalizedName}" (id=${tag.id}) → category "${keyword.category.name}" (id=${keyword.categoryId})`,
      );
    } catch (error: any) {
      if (error.code === 'P2002') {
        // Unique constraint violation — already linked
        skipped++;
      } else {
        errors++;
        console.error(
          `  Error migrating keyword "${normalizedName}" for category ${keyword.categoryId}:`,
          error.message,
        );
      }
    }
  }

  console.log('\nMigration complete!');
  console.log(`  Created: ${created} category-tag links`);
  console.log(`  Skipped: ${skipped} (already existed or empty)`);
  console.log(`  Errors:  ${errors}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((error) => {
    console.error('Migration failed:', error);
    prisma.$disconnect();
    process.exit(1);
  });
