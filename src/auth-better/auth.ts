/**
 * @file auth.ts — Better Auth instance for the new auth stack.
 *
 * Lives at /api/auth/* on the NestJS backend. Mounted in main.ts BEFORE
 * the global JSON body parser so Better Auth can read raw bodies.
 *
 * Coexists with the legacy custom JWT/OTP auth at /api/v1/user/* during
 * the migration. See MIGRATION_TODO.mdx at repo root.
 */
// Load .env early — this module runs at import time, BEFORE Nest's
// ConfigModule has had a chance to populate process.env. Without this,
// process.env.DATABASE_URL is undefined and the underlying pg driver
// silently falls back to defaults, causing "table does not exist" errors.
import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer } from 'better-auth/plugins';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { sendVerificationMail, sendResetPasswordMail } from './mailer';

// Standalone Prisma client for Better Auth — runs at module load (before
// Nest DI), so we can't reuse the @Injectable PrismaService instance here.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const trustedOrigins = (process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [
  'http://localhost:4001',
]);

export const auth = betterAuth({
  appName: 'Ultrasooq',
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  trustedOrigins,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  user: {
    modelName: 'betterAuthUser',
    additionalFields: {
      tradeRole: {
        type: 'string',
        required: false,
        defaultValue: 'BUYER',
      },
      phoneNumber: { type: 'string', required: false },
      cc: { type: 'string', required: false },
      legacyUserId: { type: 'number', required: false },
      legacyMasterAccountId: { type: 'number', required: false },
      // Populated by PATCH /api/v1/user/me/trade-role at register Step 3.
      companyName: { type: 'string', required: false },
      companyAddress: { type: 'string', required: false },
      companyPhone: { type: 'string', required: false },
      companyWebsite: { type: 'string', required: false },
      companyTaxId: { type: 'string', required: false },
      accountName: { type: 'string', required: false },
    },
  },
  account: { modelName: 'betterAuthAccount' },
  verification: { modelName: 'betterAuthVerification' },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // flip to true once verification UX is wired
    password: {
      hash: async (password: string) => bcrypt.hash(password, 10),
      verify: async ({ hash, password }: { hash: string; password: string }) =>
        bcrypt.compare(password, hash),
    },
    sendResetPassword: async ({ user, url }) => {
      await sendResetPasswordMail({ to: user.email, name: user.name || '', url });
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationMail({ to: user.email, name: user.name || '', url });
    },
  },
  session: {
    modelName: 'betterAuthSession',
    expiresIn: 60 * 60 * 24 * 7, // 7 days, matches legacy JWT_EXPIRY
    updateAge: 60 * 60 * 24, // refresh sliding window every 24h
  },
  plugins: [bearer()],
  advanced: {
    cookiePrefix: 'ultrasooq',
  },
  // ──────────────────────────────────────────────────────────────────────────
  // databaseHooks — keeps a paired legacy User + MasterAccount in sync with
  // every NEW BetterAuthUser. The bridge is critical because the existing
  // ~60 business controllers all use the legacy `JwtAuthGuard` which expects
  // an integer `req.user.id` corresponding to `User.id`. Without this hook,
  // a fresh Better Auth signup would have no legacy User row, and the
  // bridge guard would 401 on every protected endpoint.
  //
  // For ALREADY-MIGRATED orphan rows (created by the Phase 5 script before
  // this hook existed), a one-shot backfill script at
  // `scripts/backfill-legacy-shadow.ts` runs the same logic.
  // ──────────────────────────────────────────────────────────────────────────
  databaseHooks: {
    user: {
      create: {
        after: async (baUser: any) => {
          // Skip if this row already has both links populated — the migration
          // script handled it, or a previous run of this hook did.
          if (baUser.legacyUserId) return;

          try {
            const emailLc = (baUser.email as string).toLowerCase();
            const [firstName = '', ...rest] = ((baUser.name as string) || '')
              .trim()
              .split(/\s+/);
            const lastName = rest.join(' ');

            const ALLOWED = new Set(['BUYER', 'FREELANCER', 'COMPANY']);
            const rawTradeRole = String(baUser.tradeRole ?? 'BUYER').toUpperCase();
            const tradeRole: any = ALLOWED.has(rawTradeRole)
              ? rawTradeRole
              : 'BUYER';

            // Either reuse an existing MasterAccount (legacy email match)
            // or create one. MasterAccount.email is UNIQUE.
            let ma = await prisma.masterAccount.findUnique({
              where: { email: emailLc },
            });
            if (!ma) {
              ma = await prisma.masterAccount.create({
                data: {
                  email: emailLc,
                  // MasterAccount has NOT-NULL String columns for these.
                  // Phase 4 dropped its `password` is still kept (per schema check).
                  password: '',
                  firstName: firstName || emailLc.split('@')[0],
                  lastName: lastName || '',
                  phoneNumber: (baUser.phoneNumber as string) ?? '',
                  cc: (baUser.cc as string) ?? '',
                },
              });
            }

            // Default-active BUYER User row. User.email is UNIQUE — if there
            // happens to be an existing one we re-use it; otherwise create.
            let legacy = await prisma.user.findUnique({
              where: { email: emailLc },
            });
            if (!legacy) {
              legacy = await prisma.user.create({
                data: {
                  masterAccountId: ma.id,
                  email: emailLc,
                  firstName: firstName || null,
                  lastName: lastName || null,
                  phoneNumber: (baUser.phoneNumber as string) ?? null,
                  cc: (baUser.cc as string) ?? null,
                  tradeRole,
                  isActive: true,
                  isCurrent: true,
                  status: 'ACTIVE',
                  loginType: 'MANUAL',
                },
              });
            }

            // Patch the back-link on the BetterAuthUser row.
            await prisma.betterAuthUser.update({
              where: { id: baUser.id },
              data: { legacyUserId: legacy.id, legacyMasterAccountId: ma.id },
            });

            // Update MasterAccount.lastActiveUserId so flows that depend on
            // it (e.g. legacy login resolution) see the correct primary.
            // lastActiveUserId is @unique — only set if not already pointing
            // to another User from the same master.
            if (ma.lastActiveUserId !== legacy.id) {
              try {
                await prisma.masterAccount.update({
                  where: { id: ma.id },
                  data: { lastActiveUserId: legacy.id },
                });
              } catch {
                // Unique constraint conflict — another User from this master
                // is already the lastActive. Leave it alone.
              }
            }
          } catch (err) {
            // We don't want a hook failure to block the signup; log instead.
            // The backfill script can heal any rows that slip through.
            // eslint-disable-next-line no-console
            console.error(
              '[better-auth] databaseHooks.user.create.after failed:',
              err,
            );
          }
        },
      },
    },
  },
});

export type Auth = typeof auth;
