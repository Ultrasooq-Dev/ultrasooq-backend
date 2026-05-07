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
  phoneNumber,
  twoFactor,
  username,
} from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  sendVerificationMail,
  sendResetPasswordMail,
  sendOtpMail,
  sendInvitationMail,
} from './mailer';

// Standalone Prisma client for Better Auth — runs at module load (before
// Nest DI), so we can't reuse the @Injectable PrismaService instance here.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const trustedOrigins = process.env.CORS_ORIGINS?.split(',')
  .map((s) => s.trim())
  .filter(Boolean) ?? ['http://localhost:4001'];

const appUrl = process.env.FRONTEND_SERVER || 'http://localhost:4001';
const isDevEnv = process.env.NODE_ENV !== 'production';
// TODO: populate with the User.id of platform admins once known. Members
// listed here gain admin permissions via Better Auth's `admin` plugin
// regardless of their `role` column value.
const adminUserIds: string[] = (process.env.BETTER_AUTH_ADMIN_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const auth = betterAuth({
  appName: 'Ultrasooq',
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  trustedOrigins,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  databaseHooks: {
    session: {
      create: {
        // Block sign-in for soft-deleted or inactive users. Mirrors qitaff's
        // hook so a user marked `deletedAt` or `isActive: false` directly in
        // the DB cannot establish a fresh session.
        before: async (session) => {
          const target = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { deletedAt: true, isActive: true, status: true },
          });
          if (target?.deletedAt) {
            throw new APIError('FORBIDDEN', {
              code: 'ACCOUNT_DELETED',
              message: 'This account has been deleted. Please contact support.',
            });
          }
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
  emailVerification: {
    sendOnSignUp: true,
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
    passkey({
      rpID: isDevEnv ? 'localhost' : new URL(appUrl).hostname,
      rpName: 'Ultrasooq',
    }),
    bearer(),
    phoneNumber({
      // TODO: wire up SMS provider (Twilio / SNS / local equivalent).
      // Until then this is a no-op and phone OTP auth will not work.
      sendOTP: ({ phoneNumber, code }) => {
        if (isDevEnv) {
          // eslint-disable-next-line no-console
          console.log(`[DEV-SMS] OTP for ${phoneNumber}: ${code}`);
        }
      },
    }),
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
  },
});

export type Auth = typeof auth;
