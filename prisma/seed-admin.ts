import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@ultrasooq.com';
  const plainPassword = 'Admin123!';
  const saltRounds = 10;

  // Hash the password
  const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);
  console.log('Password hashed successfully.');

  // Check if admin user already exists
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    console.log('Admin user already exists with id:', existingUser.id);
    console.log('Updating password and ensuring userType=ADMIN, status=ACTIVE...');
    await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        password: hashedPassword,
        userType: 'ADMIN',
        status: 'ACTIVE',
        isCurrent: true,
      },
    });
    console.log('Admin user updated successfully.');
    await prisma.$disconnect();
    return;
  }

  // Create MasterAccount first
  const masterAccount = await prisma.masterAccount.create({
    data: {
      email,
      password: hashedPassword,
      firstName: 'Super',
      lastName: 'Admin',
      phoneNumber: '0000000000',
      cc: '+1',
    },
  });
  console.log('MasterAccount created with id:', masterAccount.id);

  // Create User linked to MasterAccount
  const user = await prisma.user.create({
    data: {
      email,
      firstName: 'Super',
      lastName: 'Admin',
      password: hashedPassword,
      userType: 'ADMIN',
      tradeRole: 'BUYER',
      status: 'ACTIVE',
      loginType: 'MANUAL',
      isCurrent: true,
      masterAccountId: masterAccount.id,
    },
  });
  console.log('User created with id:', user.id);

  // Update MasterAccount to link lastActiveUserId
  await prisma.masterAccount.update({
    where: { id: masterAccount.id },
    data: { lastActiveUserId: user.id },
  });
  console.log('MasterAccount.lastActiveUserId updated to:', user.id);

  console.log('\n--- Admin Seed Complete ---');
  console.log('Email:    admin@ultrasooq.com');
  console.log('Password: Admin123!');
  console.log('UserType: ADMIN');
  console.log('Status:   ACTIVE');

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Seed error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
