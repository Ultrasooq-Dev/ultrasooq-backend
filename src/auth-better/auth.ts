/**
 * @file auth.ts — Better Auth instance for the Ultrasooq auth stack.
 *
 * Lives at /api/auth/* on the NestJS backend. Mounted in main.ts BEFORE
 * the global JSON body parser so Better Auth can read raw bodies.
 *
 * Plugin set mirrors qitaff's setup, adapted for NestJS (Next.js-only
 * plugins like nextCookies and the @better-auth/infra dashboard are
 * intentionally omitted).
 */
// Load .env early — this module runs at import time, BEFORE Nest's
// ConfigModule has had a chance to populate process.env. Without this,
// process.env.DATABASE_URL is undefined and the underlying pg driver
// silently falls back to defaults, causing "table does not exist" errors.
import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError } from 'better-auth/api';
import {
  admin,
  bearer,
  lastLoginMethod,
  organization,
  twoFactor,
  username,
} from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import * as bcrypt from 'bcrypt';
import {
  PrismaClient,
  WalletReferenceType,
  WalletStatus,
  WalletTransactionStatus,
  WalletTransactionType,
} from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  sendVerificationMail,
  sendResetPasswordMail,
  sendOtpMail,
  sendInvitationMail,
} from './mailer';

if (process.env.NODE_ENV === 'production') {
  const required = [
    'BETTER_AUTH_SECRET',
    'BETTER_AUTH_URL',
    'DATABASE_URL',
    'FRONTEND_SERVER',
    'SENDGRID_API_KEY',
    'SENDGRID_SENDER',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
  ];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`${key} is required in production`);
    }
  }
  // CORS_ORIGINS must contain at least one non-empty origin.
  const corsOriginsList = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (corsOriginsList.length === 0) {
    throw new Error('CORS_ORIGINS is required in production');
  }
  // BETTER_AUTH_URL must be HTTPS in production — cookies are Secure.
  if (!process.env.BETTER_AUTH_URL!.startsWith('https://')) {
    throw new Error('BETTER_AUTH_URL must start with https:// in production');
  }
  // Cross-subdomain cookie domain must start with a leading dot.
  if (process.env.COOKIE_DOMAIN && !process.env.COOKIE_DOMAIN.startsWith('.')) {
    throw new Error('COOKIE_DOMAIN must start with a leading dot (e.g. .ultrasooq.com)');
  }
  // These are warnings — operationally useful but not fatal.
  if (!process.env.COOKIE_DOMAIN) {
    console.warn(
      '[auth] COOKIE_DOMAIN is unset in production — cross-subdomain session cookies will NOT work between api.* and app.* hosts.',
    );
  }
  const adminIdsRaw = (process.env.BETTER_AUTH_ADMIN_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (adminIdsRaw.length === 0) {
    console.warn(
      '[auth] BETTER_AUTH_ADMIN_USER_IDS is empty — no platform admins will be granted Better Auth admin permissions.',
    );
  }
}

// Standalone Prisma client for Better Auth — runs at module load (before
// Nest DI), so we can't reuse the @Injectable PrismaService instance here.
// Cap the connection pool here so this client + Nest's PrismaService don't
// jointly exhaust Postgres connections under load.
function withConnectionLimit(url: string, limit = 5): string {
  if (!url) return url;
  if (url.includes('connection_limit=')) return url;
  return url.includes('?') ? `${url}&connection_limit=${limit}` : `${url}?connection_limit=${limit}`;
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: withConnectionLimit(process.env.DATABASE_URL!) }),
});

const trustedOrigins = process.env.CORS_ORIGINS?.split(',')
  .map((s) => s.trim())
  .filter(Boolean) ?? ['http://localhost:4001'];

const appUrl = process.env.FRONTEND_SERVER || 'http://localhost:4001';
const isDevEnv = process.env.NODE_ENV !== 'production';
const signupSimulationCreditCurrency = (
  process.env.SIGNUP_SIMULATION_CREDIT_CURRENCY || 'OMR'
).toUpperCase();
// TODO: populate with the User.id of platform admins once known. Members
// listed here gain admin permissions via Better Auth's `admin` plugin
// regardless of their `role` column value.
const adminUserIds: string[] = (process.env.BETTER_AUTH_ADMIN_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isTruthyEnv(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value || '').toLowerCase());
}

function shouldGrantSignupSimulationCredit(): boolean {
  const enabled = process.env.ENABLE_SIGNUP_SIMULATION_CREDIT;
  if (enabled !== undefined && enabled.toLowerCase() !== 'auto') {
    return isTruthyEnv(enabled);
  }

  return isDevEnv;
}

function getSignupSimulationCreditAmount(): number {
  const amount = Number(process.env.SIGNUP_SIMULATION_CREDIT_AMOUNT ?? 1000);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

async function grantSignupSimulationCredit(user: { id?: string; email?: string }) {
  const amount = getSignupSimulationCreditAmount();
  if (!shouldGrantSignupSimulationCredit() || amount <= 0 || !user.id) {
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const existingWallet = await tx.wallet.findUnique({
        where: {
          userId_currencyCode: {
            userId: user.id!,
            currencyCode: signupSimulationCreditCurrency,
          },
        },
        select: { id: true },
      });

      if (existingWallet) {
        return;
      }

      const wallet = await tx.wallet.create({
        data: {
          userId: user.id!,
          currencyCode: signupSimulationCreditCurrency,
          balance: amount,
          frozenBalance: 0,
          status: WalletStatus.ACTIVE,
        },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          transactionType: WalletTransactionType.BONUS,
          amount,
          balanceBefore: 0,
          balanceAfter: amount,
          referenceType: WalletReferenceType.BONUS,
          referenceId: `signup-simulation-credit:${user.id}`,
          description: `Signup simulation credit (${amount} ${signupSimulationCreditCurrency})`,
          status: WalletTransactionStatus.COMPLETED,
          metadata: {
            reason: 'SIGNUP_SIMULATION_CREDIT',
            userId: user.id,
            email: user.email ?? null,
            amount,
            currencyCode: signupSimulationCreditCurrency,
          },
        },
      });

      await tx.walletSettings.upsert({
        where: { userId: user.id! },
        update: {},
        create: {
          userId: user.id!,
          autoWithdraw: false,
          withdrawLimit: 0,
          dailyLimit: 0,
          monthlyLimit: 0,
          notificationPreferences: {},
        },
      });
    });
  } catch (error) {
    console.error('[auth] Failed to grant signup simulation credit', {
      userId: user.id,
      email: user.email,
      error,
    });
  }
}

export const auth = betterAuth({
  appName: 'Ultrasooq',
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  trustedOrigins,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  databaseHooks: {
    user: {
      create: {
        // Auto-activate new accounts: mark every newly created user as
        // email-verified so signup → session → Step 3 works without the
        // email verification round-trip. Re-enable the verification flow
        // by removing this hook and flipping requireEmailVerification /
        // sendOnSignUp back to true below.
        before: async (user) => ({ data: { ...user, emailVerified: true } }),
        after: grantSignupSimulationCredit,
      },
    },
    session: {
      create: {
        // Block sign-in for inactive users. The User model uses `isActive: false`
        // or `status: INACTIVE` to gate accounts (soft-delete uses the same path —
        // there is no separate `deletedAt` column on this schema).
        before: async (session) => {
          const target = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { isActive: true, status: true },
          });
          if (target?.isActive === false || target?.status === 'INACTIVE') {
            throw new APIError('FORBIDDEN', {
              code: 'ACCOUNT_INACTIVE',
              message: 'This account is inactive. Please contact support.',
            });
          }
        },
      },
    },
  },
  user: {
    // `username` is provided by the username() plugin — do not declare a duplicate additionalField.
    additionalFields: {
      // Profile / business fields that the frontend reads through
      // `auth.api.getSession()`. The rest (userType, status, dateOfBirth,
      // etc.) live on User as plain Prisma columns — backend code reads
      // them via `prisma.user.findUnique`, not through Better Auth.
      tradeRole: {
        type: 'string',
        required: false,
        defaultValue: 'BUYER',
      },
      cc: { type: 'string', required: false },
      phoneNumber: { type: 'string', required: false },
      firstName: { type: 'string', required: false },
      lastName: { type: 'string', required: false },
      // Populated by PATCH /api/v1/user/me/trade-role at register Step 3.
      companyName: { type: 'string', required: false },
      companyAddress: { type: 'string', required: false },
      companyPhone: { type: 'string', required: false },
      companyWebsite: { type: 'string', required: false },
      companyTaxId: { type: 'string', required: false },
      accountName: { type: 'string', required: false },
    },
  },
  account: {
    accountLinking: {
      // Google verifies the email address before issuing the OAuth flow,
      // so it's safe to auto-link a Google sign-in to an existing local
      // account with the same email.
      trustedProviders: ['google'],
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Auto-activated via databaseHooks.user.create.before — flip back to true to re-enable verification gating.
    password: {
      // Cost 12 for new hashes. verify() still works against legacy 10-cost hashes since bcrypt encodes cost in the hash itself.
      hash: async (password: string) => bcrypt.hash(password, 12),
      verify: async ({ hash, password }: { hash: string; password: string }) =>
        bcrypt.compare(password, hash),
    },
    sendResetPassword: async ({ user, url }) => {
      await sendResetPasswordMail({ to: user.email, name: user.name || '', url });
    },
  },
  emailVerification: {
    // Accounts are auto-verified on creation, so no signup mail is sent. The
    // sendVerificationEmail handler stays wired for manual /send-verification-email
    // calls (e.g. resend flow if verification is re-enabled later).
    sendOnSignUp: false,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationMail({ to: user.email, name: user.name || '', url });
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24, // 24h
    updateAge: 60 * 60 * 12, // 12h sliding window refresh
    freshAge: 60 * 60 * 1, // 1h — used for sensitive operations (e.g. password change)
  },
  plugins: [
    organization({
      // COMPANY/FREELANCER sellers can spawn organizations to host their
      // team. Buyers cannot; admins can do it on anyone's behalf elsewhere.
      allowUserToCreateOrganization: async (user: any) =>
        ['COMPANY', 'FREELANCER'].includes(user.tradeRole),
      sendInvitationEmail: async (data) => {
        await sendInvitationMail({
          to: data.email,
          orgName: data.organization.name,
          inviterName: data.inviter.user.name || data.inviter.user.email,
          link: `${appUrl}/accept-invitation/${data.id}`,
        });
      },
    }),
    twoFactor({
      issuer: 'Ultrasooq',
      otpOptions: {
        async sendOTP({ user, otp }) {
          await sendOtpMail({
            to: user.email,
            otp,
            label: 'Your Ultrasooq two-factor code',
          });
        },
      },
    }),
    // WebAuthn rpID must be a registrable parent domain shared by both the
    // frontend (e.g. app.ultrasooq.com) and the API (api.ultrasooq.com).
    // Deriving it from the frontend hostname alone breaks cross-subdomain
    // passkey usage — set WEBAUTHN_RP_ID=ultrasooq.com explicitly in prod.
    passkey({
      rpID: process.env.WEBAUTHN_RP_ID || (isDevEnv ? 'localhost' : new URL(appUrl).hostname),
      rpName: 'Ultrasooq',
    }),
    bearer(),
    // phoneNumber plugin removed — no SMS provider wired. Re-enable once
    // Twilio (or equivalent) integration is in place.
    admin({
      defaultRole: 'user',
      adminRoles: ['admin'],
      adminUserIds,
    }),
    username(),
    lastLoginMethod(),
  ],
  advanced: {
    cookiePrefix: 'ultrasooq',
    // Cross-subdomain session cookie. Set COOKIE_DOMAIN=.ultrasooq.com (with
    // leading dot) in prod so the session cookie set by the api subdomain is
    // also sent to the app subdomain. In dev (localhost), leave unset.
    ...(process.env.COOKIE_DOMAIN
      ? {
          crossSubDomainCookies: {
            enabled: true,
            domain: process.env.COOKIE_DOMAIN,
          },
        }
      : {}),
    defaultCookieAttributes: {
      secure: !isDevEnv,
      sameSite: isDevEnv ? 'lax' : 'none',
      httpOnly: true,
    },
    useSecureCookies: !isDevEnv,
  },
});

export type Auth = typeof auth;
