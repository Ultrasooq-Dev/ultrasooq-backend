/**
 * @file auth.ts — Better Auth instance for the new auth stack.
 *
 * Lives at /api/auth/* on the NestJS backend. Mounted in main.ts BEFORE
 * the global JSON body parser so Better Auth can read raw bodies.
 *
 * Coexists with the legacy custom JWT/OTP auth at /api/v1/user/* during
 * the migration. See MIGRATION_TODO.mdx at repo root.
 */
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer } from 'better-auth/plugins';
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
    },
  },
  account: { modelName: 'betterAuthAccount' },
  verification: { modelName: 'betterAuthVerification' },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // flip to true once verification UX is wired
    sendResetPassword: async ({ user, url }) => {
      await sendResetPasswordMail({ to: user.email, name: user.name || '', url });
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
});

export type Auth = typeof auth;
