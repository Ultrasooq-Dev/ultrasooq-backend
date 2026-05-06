/**
 * One-shot migration: legacy MasterAccount + linked default User -> Better Auth.
 *
 * - Reads MasterAccount rows (deletedAt IS NULL, email NOT NULL).
 * - Skips if email already in BetterAuthUser, OR if a BetterAuthUser already
 *   has legacyMasterAccountId === MA.id (idempotent on re-run).
 * - For each survivor, resolves a "primary" linked User the same way the
 *   legacy login flow does (lastActiveUserId -> default-active BUYER).
 * - Inserts BetterAuthUser + BetterAuthAccount in one $transaction.
 * - Copies the bcrypt password hash unchanged into BetterAuthAccount.password
 *   so Better Auth's credential provider can authenticate without a reset.
 *
 * Run: `npm run migrate:better-auth`
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { compareSync } from 'bcrypt';
import pLimit from 'p-limit';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const CONCURRENCY = 5;

type Counts = {
  total: number;
  migrated: number;
  skipped_existing: number;
  skipped_no_primary: number;
  errors: number;
};

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  await prisma.$connect();

  const counts: Counts = {
    total: 0,
    migrated: 0,
    skipped_existing: 0,
    skipped_no_primary: 0,
    errors: 0,
  };
  const errors: { email: string; reason: string }[] = [];
  let firstMigratedHash: string | null = null;

  try {
    // MasterAccount.email is non-null in the schema; filter just on deletedAt.
    const masterAccounts = await prisma.masterAccount.findMany({
      where: { deletedAt: null },
      orderBy: { id: 'asc' },
    });
    counts.total = masterAccounts.length;
    console.log(`[migrate] Found ${counts.total} live MasterAccount rows.`);

    // Pre-load the existing BetterAuth state for fast idempotency checks.
    const [existingByEmail, existingByLegacyId] = await Promise.all([
      prisma.betterAuthUser.findMany({ select: { email: true } }),
      prisma.betterAuthUser.findMany({
        where: { legacyMasterAccountId: { not: null } },
        select: { legacyMasterAccountId: true },
      }),
    ]);
    const seenEmails = new Set(existingByEmail.map((u) => u.email.toLowerCase()));
    const seenLegacyIds = new Set(
      existingByLegacyId.map((u) => u.legacyMasterAccountId).filter((v): v is number => v != null),
    );

    const limit = pLimit(CONCURRENCY);
    await Promise.all(
      masterAccounts.map((ma) =>
        limit(async () => {
          const emailLc = ma.email!.toLowerCase();
          if (seenEmails.has(emailLc) || seenLegacyIds.has(ma.id)) {
            counts.skipped_existing++;
            return;
          }

          // Resolve primary user: lastActiveUserId (if active) else default BUYER.
          let primary = null as null | { id: number; tradeRole: string };
          if (ma.lastActiveUserId) {
            primary = (await prisma.user.findFirst({
              where: {
                id: ma.lastActiveUserId,
                masterAccountId: ma.id,
                deletedAt: null,
                isActive: true,
              },
              select: { id: true, tradeRole: true },
            })) as any;
          }
          if (!primary) {
            primary = (await prisma.user.findFirst({
              where: {
                masterAccountId: ma.id,
                tradeRole: 'BUYER',
                deletedAt: null,
                isActive: true,
              },
              select: { id: true, tradeRole: true },
            })) as any;
          }

          if (!primary) {
            counts.skipped_no_primary++;
            console.warn(`[migrate] skip ${emailLc}: no active linked User`);
            return;
          }

          const first = (ma.firstName ?? '').trim();
          const last = (ma.lastName ?? '').trim();
          const fullName = `${first} ${last}`.trim() || emailLc.split('@')[0];
          const userId = randomUUID();
          const accountId = randomUUID();
          const now = new Date();

          try {
            await prisma.$transaction([
              prisma.betterAuthUser.create({
                data: {
                  id: userId,
                  email: emailLc,
                  name: fullName,
                  emailVerified: true,
                  tradeRole: String(primary.tradeRole),
                  phoneNumber: ma.phoneNumber ?? null,
                  cc: ma.cc ?? null,
                  legacyUserId: primary.id,
                  legacyMasterAccountId: ma.id,
                  createdAt: ma.createdAt ?? now,
                  updatedAt: now,
                },
              }),
              prisma.betterAuthAccount.create({
                data: {
                  id: accountId,
                  userId,
                  accountId: userId,
                  providerId: 'credential',
                  password: ma.password,
                  createdAt: now,
                  updatedAt: now,
                },
              }),
            ]);
            counts.migrated++;
            if (!firstMigratedHash && ma.password) firstMigratedHash = ma.password;
          } catch (err: any) {
            counts.errors++;
            errors.push({ email: emailLc, reason: err?.message ?? String(err) });
            console.error(`[migrate] ERROR ${emailLc}: ${err?.message ?? err}`);
          }
        }),
      ),
    );

    console.log('\n[migrate] === Summary ===');
    console.log(
      `total: ${counts.total}, migrated: ${counts.migrated}, ` +
        `skipped_existing: ${counts.skipped_existing}, ` +
        `skipped_no_primary: ${counts.skipped_no_primary}, errors: ${counts.errors}`,
    );
    if (errors.length) {
      console.log('[migrate] Errors:');
      for (const e of errors) console.log(`  - ${e.email}: ${e.reason}`);
    }

    if (firstMigratedHash) {
      // bcrypt format sanity check on the FIRST migrated row's hash.
      // We don't know the plaintext, so this just confirms the hash wasn't mangled
      // and bcrypt.compareSync can parse it without throwing.
      const ok = compareSync('test', firstMigratedHash);
      console.log(`hash format check: ${ok}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[migrate] fatal:', err);
  process.exit(1);
});
