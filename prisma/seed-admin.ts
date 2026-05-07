/**
 * seed-admin.ts — Creates a small set of canonical Better Auth users for dev:
 * super admin, test buyer, test seller, test freelancer.
 *
 * Each account gets a row in `user` (Better Auth core) plus a paired row in
 * `account` (providerId='credential') that holds the bcrypt password Better
 * Auth verifies on sign-in. ID values are explicit cuids so re-running is
 * idempotent (upsert by email).
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

const ACCOUNTS = [
  {
    email: 'admin@ultrasooq.com',
    firstName: 'Super',
    lastName: 'Admin',
    userName: 'superadmin',
    tradeRole: 'BUYER' as const, // platform admins still need a tradeRole; userType=ADMIN gates admin UI
    userType: 'ADMIN' as const,
    phoneNumber: '+96812345678',
    uniqueId: '0000001',
    accountName: 'Super Admin',
  },
  {
    email: 'buyer@ultrasooq.com',
    firstName: 'Test',
    lastName: 'Buyer',
    userName: 'testbuyer',
    tradeRole: 'BUYER' as const,
    userType: 'USER' as const,
    phoneNumber: '+96812345679',
    uniqueId: '0000002',
    accountName: 'Test Buyer',
  },
  {
    email: 'seller@ultrasooq.com',
    firstName: 'Test',
    lastName: 'Seller',
    userName: 'testseller',
    tradeRole: 'COMPANY' as const,
    userType: 'USER' as const,
    phoneNumber: '+96812345680',
    uniqueId: '0000003',
    accountName: 'Test Seller',
  },
  {
    email: 'freelancer@ultrasooq.com',
    firstName: 'Test',
    lastName: 'Freelancer',
    userName: 'testfreelancer',
    tradeRole: 'FREELANCER' as const,
    userType: 'USER' as const,
    phoneNumber: '+96812345681',
    uniqueId: '0000004',
    accountName: 'Test Freelancer',
  },
];

async function main() {
  const passwordHash = await bcrypt.hash('Password123!', 10);

  for (const acct of ACCOUNTS) {
    const user = await prisma.user.upsert({
      where: { email: acct.email },
      update: {
        firstName: acct.firstName,
        lastName: acct.lastName,
        name: `${acct.firstName} ${acct.lastName}`,
        userName: acct.userName,
        tradeRole: acct.tradeRole,
        userType: acct.userType,
        status: 'ACTIVE',
        isActive: true,
        phoneNumber: acct.phoneNumber,
        cc: '+968',
        uniqueId: acct.uniqueId,
        accountName: acct.accountName,
      },
      create: {
        id: randomUUID(),
        email: acct.email,
        emailVerified: true,
        name: `${acct.firstName} ${acct.lastName}`,
        firstName: acct.firstName,
        lastName: acct.lastName,
        userName: acct.userName,
        tradeRole: acct.tradeRole,
        userType: acct.userType,
        status: 'ACTIVE',
        isActive: true,
        phoneNumber: acct.phoneNumber,
        cc: '+968',
        uniqueId: acct.uniqueId,
        accountName: acct.accountName,
      },
    });

    // Better Auth credential row — password lives here, not on User.
    const existingAccount = await prisma.account.findFirst({
      where: { userId: user.id, providerId: 'credential' },
    });
    if (existingAccount) {
      await prisma.account.update({
        where: { id: existingAccount.id },
        data: { password: passwordHash },
      });
    } else {
      await prisma.account.create({
        data: {
          id: randomUUID(),
          userId: user.id,
          accountId: user.id,
          providerId: 'credential',
          password: passwordHash,
        },
      });
    }

    console.log(`${acct.tradeRole} → user:${user.id} ${acct.email}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
