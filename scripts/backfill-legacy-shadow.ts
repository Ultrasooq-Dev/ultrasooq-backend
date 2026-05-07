/**
 * One-shot backfill: paired legacy User + MasterAccount for every
 * BetterAuthUser whose `legacyUserId` is NULL.
 *
 * Why this exists:
 *   - The Phase 5 migration script (`migrate-to-better-auth.ts`) handled the
 *     MasterAccount → BetterAuthUser direction. Some legacy MasterAccounts
 *     had no linked User row (orphans), so those BA rows were created with
 *     `legacyUserId = NULL`.
 *   - Beyond that, there are also pure Better-Auth signups (no MasterAccount
 *     at all) created during dev testing.
 *   - The new `databaseHooks.user.create.after` callback in `auth.ts` covers
 *     all FUTURE signups — this script covers the pre-hook orphans.
 *
 * What it does for each orphan BetterAuthUser:
 *   1. Find or create a MasterAccount (by lowercased email).
 *   2. Find or create a default-active BUYER User row linked to that
 *      MasterAccount.
 *   3. Patch BetterAuthUser.legacyUserId / .legacyMasterAccountId.
 *
 * Idempotent: re-running on a fully-bridged DB reports `migrated: 0`.
 *
 * Run: `npm run backfill:better-auth-shadow`
 */
import 'dotenv/config';
import pLimit from 'p-limit';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const CONCURRENCY = 5;
const ALLOWED_TRADE_ROLES = new Set(['BUYER', 'FREELANCER', 'COMPANY']);

function coerceTradeRole(legacy: string | null | undefined, emailLc: string): string {
  const v = String(legacy ?? '').toUpperCase();
  if (ALLOWED_TRADE_ROLES.has(v)) return v;
  console.warn(
    `[backfill] coerce ${emailLc}: tradeRole '${legacy}' -> 'BUYER' (not in enum)`,
  );
  return 'BUYER';
}

type Counts = {
  total: number;
  migrated: number;
  reused_master: number;
  reused_user: number;
  errors: number;
};

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  await prisma.$connect();

  const counts: Counts = {
    total: 0,
    migrated: 0,
    reused_master: 0,
    reused_user: 0,
    errors: 0,
  };
  const errors: { email: string; reason: string }[] = [];

  try {
    const orphans = await prisma.betterAuthUser.findMany({
      where: { legacyUserId: null },
      orderBy: { createdAt: 'asc' },
    });
    counts.total = orphans.length;
    console.log(`[backfill] Found ${counts.total} BA users without legacyUserId.`);

    if (counts.total === 0) {
      console.log('[backfill] Nothing to do. Done.');
      return;
    }

    const limit = pLimit(CONCURRENCY);
    await Promise.all(
      orphans.map((ba) =>
        limit(async () => {
          const emailLc = ba.email.toLowerCase();
          const [firstName = '', ...rest] = (ba.name || '').trim().split(/\s+/);
          const lastName = rest.join(' ');
          const tradeRole = coerceTradeRole(ba.tradeRole, emailLc) as
            | 'BUYER'
            | 'FREELANCER'
            | 'COMPANY';

          try {
            // 1. Find-or-create MasterAccount by email.
            let ma = await prisma.masterAccount.findUnique({
              where: { email: emailLc },
            });
            const reusedMaster = !!ma;
            if (!ma) {
              ma = await prisma.masterAccount.create({
                data: {
                  email: emailLc,
                  password: '',
                  firstName: firstName || emailLc.split('@')[0],
                  lastName: lastName || '',
                  phoneNumber: ba.phoneNumber ?? '',
                  cc: ba.cc ?? '',
                },
              });
            }

            // 2. Find-or-create User row.
            let user = await prisma.user.findUnique({
              where: { email: emailLc },
            });
            const reusedUser = !!user;
            if (!user) {
              user = await prisma.user.create({
                data: {
                  masterAccountId: ma.id,
                  email: emailLc,
                  firstName: firstName || null,
                  lastName: lastName || null,
                  phoneNumber: ba.phoneNumber ?? null,
                  cc: ba.cc ?? null,
                  tradeRole,
                  isActive: true,
                  isCurrent: true,
                  status: 'ACTIVE',
                  loginType: 'MANUAL',
                },
              });
            }

            // 3. Patch the back-link.
            await prisma.betterAuthUser.update({
              where: { id: ba.id },
              data: {
                legacyUserId: user.id,
                legacyMasterAccountId: ma.id,
              },
            });

            // 4. Best-effort lastActiveUserId. lastActiveUserId is @unique —
            //    swallow conflicts (someone else from the same master is the
            //    primary).
            if (ma.lastActiveUserId !== user.id) {
              try {
                await prisma.masterAccount.update({
                  where: { id: ma.id },
                  data: { lastActiveUserId: user.id },
                });
              } catch {
                /* keep existing primary */
              }
            }

            counts.migrated++;
            if (reusedMaster) counts.reused_master++;
            if (reusedUser) counts.reused_user++;
            console.log(
              `[backfill] linked ${emailLc} -> User#${user.id} (master#${ma.id})${
                reusedMaster ? ' [reused-MA]' : ''
              }${reusedUser ? ' [reused-User]' : ''}`,
            );
          } catch (err: any) {
            counts.errors++;
            errors.push({ email: emailLc, reason: err?.message ?? String(err) });
            console.error(
              `[backfill] ERROR ${emailLc}: ${err?.message ?? err}`,
            );
          }
        }),
      ),
    );

    console.log('\n[backfill] === Summary ===');
    console.log(
      `total: ${counts.total}, migrated: ${counts.migrated}, ` +
        `reused_master: ${counts.reused_master}, ` +
        `reused_user: ${counts.reused_user}, errors: ${counts.errors}`,
    );
    if (errors.length) {
      console.log('[backfill] Errors:');
      for (const e of errors) console.log(`  - ${e.email}: ${e.reason}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[backfill] fatal:', err);
  process.exit(1);
});
