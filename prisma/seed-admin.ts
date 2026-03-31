import 'dotenv/config';
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
    tradeRole: 'MEMBER' as const,
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
  const password = await bcrypt.hash('Password123!', 10);

  for (const acct of ACCOUNTS) {
    // 1. Upsert MasterAccount (frontend login queries this table)
    const master = await prisma.masterAccount.upsert({
      where: { email: acct.email },
      update: {
        password,
        firstName: acct.firstName,
        lastName: acct.lastName,
        phoneNumber: acct.phoneNumber,
        cc: '+968',
      },
      create: {
        email: acct.email,
        password,
        firstName: acct.firstName,
        lastName: acct.lastName,
        phoneNumber: acct.phoneNumber,
        cc: '+968',
      },
    });

    // 2. Upsert User (linked to MasterAccount)
    const user = await prisma.user.upsert({
      where: { email: acct.email },
      update: {
        password,
        firstName: acct.firstName,
        lastName: acct.lastName,
        userName: acct.userName,
        tradeRole: acct.tradeRole,
        userType: acct.userType,
        status: 'ACTIVE',
        isActive: true,
        isCurrent: true,
        loginType: 'MANUAL',
        masterAccountId: master.id,
      },
      create: {
        email: acct.email,
        password,
        firstName: acct.firstName,
        lastName: acct.lastName,
        userName: acct.userName,
        tradeRole: acct.tradeRole,
        userType: acct.userType,
        status: 'ACTIVE',
        isActive: true,
        isCurrent: true,
        loginType: 'MANUAL',
        phoneNumber: acct.phoneNumber,
        cc: '+968',
        uniqueId: acct.uniqueId,
        accountName: acct.accountName,
        masterAccountId: master.id,
      },
    });

    // 3. Link MasterAccount.lastActiveUserId → User
    await prisma.masterAccount.update({
      where: { id: master.id },
      data: { lastActiveUserId: user.id },
    });

    console.log(`${acct.tradeRole} → user:${user.id} master:${master.id} ${acct.email}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
