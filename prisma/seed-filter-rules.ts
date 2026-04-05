import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

interface RuleEntry {
  term: string;
  category: string;
  severity: string;
}

async function seedRules(rules: RuleEntry[], language: string): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const rule of rules) {
    const existing = await prisma.contentFilterRule.findUnique({
      where: { term_language: { term: rule.term, language } },
    });

    if (existing) {
      await prisma.contentFilterRule.update({
        where: { term_language: { term: rule.term, language } },
        data: {
          category: rule.category,
          severity: rule.severity,
          isActive: true,
        },
      });
      updated++;
    } else {
      await prisma.contentFilterRule.create({
        data: {
          term: rule.term,
          category: rule.category,
          severity: rule.severity,
          language,
          isActive: true,
        },
      });
      created++;
    }
  }

  return { created, updated };
}

async function main() {
  console.log('Seeding content filter rules...\n');

  const dataDir = path.join(__dirname, '../src/content-filter/data');

  // Load English rules
  const enPath = path.join(dataDir, 'base-rules-en.json');
  const enRules: RuleEntry[] = JSON.parse(fs.readFileSync(enPath, 'utf-8'));

  // Load Arabic rules
  const arPath = path.join(dataDir, 'base-rules-ar.json');
  const arRules: RuleEntry[] = JSON.parse(fs.readFileSync(arPath, 'utf-8'));

  console.log(`Found ${enRules.length} English rules`);
  console.log(`Found ${arRules.length} Arabic rules`);
  console.log('');

  const enResult = await seedRules(enRules, 'en');
  console.log(`English (en): ${enResult.created} created, ${enResult.updated} updated`);

  const arResult = await seedRules(arRules, 'ar');
  console.log(`Arabic  (ar): ${arResult.created} created, ${arResult.updated} updated`);

  const totalCreated = enResult.created + arResult.created;
  const totalUpdated = enResult.updated + arResult.updated;

  console.log('');
  console.log(`Done! Total: ${totalCreated} created, ${totalUpdated} updated`);
}

main()
  .catch((err) => {
    console.error('Seeder failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
