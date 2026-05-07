/**
 * @file auth.ts — Better Auth instance for the Ultrasooq auth stack.
 *
 * Lives at /api/auth/* on the NestJS backend. Mounted in main.ts BEFORE
 * the global JSON body parser so Better Auth can read raw bodies.
 *
 * Better Auth's `User` model is the only user model in this codebase — see
 * prisma/schema.prisma. All FK relations across the schema point at it.
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
      phoneNumber: { type: 'string', required: false },
      cc: { type: 'string', required: false },
      firstName: { type: 'string', required: false },
      lastName: { type: 'string', required: false },
      userName: { type: 'string', required: false },
      // Populated by PATCH /api/v1/user/me/trade-role at register Step 3.
      companyName: { type: 'string', required: false },
      companyAddress: { type: 'string', required: false },
      companyPhone: { type: 'string', required: false },
      companyWebsite: { type: 'string', required: false },
      companyTaxId: { type: 'string', required: false },
      accountName: { type: 'string', required: false },
    },
  },
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
    expiresIn: 60 * 60 * 24 * 7, // 7 days, matches legacy JWT_EXPIRY
    updateAge: 60 * 60 * 24, // refresh sliding window every 24h
  },
  plugins: [bearer()],
  advanced: {
    cookiePrefix: 'ultrasooq',
  },
});

export type Auth = typeof auth;
