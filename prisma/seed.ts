/**
 * @fileoverview Database Seed Script for Ultrasooq Marketplace
 *
 * Seeds the database with realistic test data for local development.
 * Run with: npx tsx prisma/seed.ts
 *
 * Set DATABASE_URL env var before running:
 *   $env:DATABASE_URL="postgresql://..."
 *   npx tsx prisma/seed.ts
 */

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ─── Helpers ──────────────────────────────────────────────────────────────

const SALT_ROUNDS = 10;

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

function randomDecimal(min: number, max: number, decimals = 2): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateSKU(prefix: string, idx: number): string {
  return `${prefix}-${String(idx).padStart(5, '0')}`;
}

function generateOrderNo(): string {
  return `ORD-${Date.now()}-${randomInt(1000, 9999)}`;
}

// ─── Main Seed ────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Starting database seed...\n');

  // ═══════════════════════════════════════════════════════════════════════
  // 1. GEOGRAPHIC DATA — Countries, States, Cities
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  📍 Seeding countries, states, cities...');

  const countriesData = [
    { name: 'Oman', sortname: 'OM', phoneCode: 968 },
    { name: 'United Arab Emirates', sortname: 'AE', phoneCode: 971 },
    { name: 'Saudi Arabia', sortname: 'SA', phoneCode: 966 },
    { name: 'Kuwait', sortname: 'KW', phoneCode: 965 },
    { name: 'Bahrain', sortname: 'BH', phoneCode: 973 },
    { name: 'Qatar', sortname: 'QA', phoneCode: 974 },
    { name: 'India', sortname: 'IN', phoneCode: 91 },
    { name: 'United States', sortname: 'US', phoneCode: 1 },
    { name: 'United Kingdom', sortname: 'GB', phoneCode: 44 },
    { name: 'Egypt', sortname: 'EG', phoneCode: 20 },
  ];

  const countries: any[] = [];
  for (const c of countriesData) {
    const country = await prisma.countries.upsert({
      where: { id: countriesData.indexOf(c) + 1 },
      update: {},
      create: c,
    });
    countries.push(country);
  }
  const oman = countries[0];
  const uae = countries[1];

  // States for Oman
  const omanStatesData = [
    'Muscat', 'Dhofar', 'Al Batinah North', 'Al Batinah South',
    'Al Dakhiliyah', 'Al Sharqiyah North', 'Al Sharqiyah South',
    'Al Dhahirah', 'Al Buraimi', 'Al Wusta', 'Musandam',
  ];

  const states: any[] = [];
  for (const sName of omanStatesData) {
    const state = await prisma.states.create({
      data: { name: sName, countryId: oman.id },
    });
    states.push(state);
  }
  const muscatState = states[0];
  const dhofarState = states[1];

  // States for UAE
  const uaeStatesData = ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'];
  const uaeStates: any[] = [];
  for (const sName of uaeStatesData) {
    const state = await prisma.states.create({
      data: { name: sName, countryId: uae.id },
    });
    uaeStates.push(state);
  }

  // Cities for Muscat governorate
  const muscatCitiesData = ['Muscat City', 'Seeb', 'Bawshar', 'Mutrah', 'Amerat', 'Quriyat'];
  const cities: any[] = [];
  for (const cName of muscatCitiesData) {
    const city = await prisma.cities.create({
      data: { name: cName, stateId: muscatState.id },
    });
    cities.push(city);
  }

  // Cities for Dhofar
  const dhofarCitiesData = ['Salalah', 'Taqah', 'Mirbat'];
  for (const cName of dhofarCitiesData) {
    const city = await prisma.cities.create({
      data: { name: cName, stateId: dhofarState.id },
    });
    cities.push(city);
  }

  // Cities for Dubai
  const dubaiCitiesData = ['Dubai City', 'Jebel Ali', 'Hatta'];
  for (const cName of dubaiCitiesData) {
    await prisma.cities.create({
      data: { name: cName, stateId: uaeStates[1].id },
    });
  }

  console.log(`    ✅ ${countries.length} countries, ${states.length + uaeStates.length} states, ${cities.length + 3} cities`);

  // ═══════════════════════════════════════════════════════════════════════
  // 2. CATEGORIES — Hierarchical product categories
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  📂 Seeding categories...');

  const rootCategories = [
    { name: 'Electronics', type: 'product', categoryType: 'PRODUCT' },
    { name: 'Fashion & Apparel', type: 'product', categoryType: 'PRODUCT' },
    { name: 'Home & Garden', type: 'product', categoryType: 'PRODUCT' },
    { name: 'Automotive', type: 'product', categoryType: 'PRODUCT' },
    { name: 'Industrial & Tools', type: 'product', categoryType: 'PRODUCT' },
    { name: 'Health & Beauty', type: 'product', categoryType: 'PRODUCT' },
    { name: 'Services', type: 'service', categoryType: 'SERVICE' },
  ];

  const createdRootCats: any[] = [];
  for (const rc of rootCategories) {
    const cat = await prisma.category.create({ data: rc });
    createdRootCats.push(cat);
  }

  // Sub-categories for Electronics
  const electronicsSubcats = [
    'Mobile Phones', 'Laptops & Computers', 'Tablets', 'Audio & Headphones',
    'Cameras & Photography', 'Smart Watches', 'Networking Equipment',
    'Storage & Memory', 'Printers & Scanners', 'Gaming',
  ];
  const electronicsSubs: any[] = [];
  for (const sub of electronicsSubcats) {
    const cat = await prisma.category.create({
      data: { name: sub, parentId: createdRootCats[0].id, type: 'product', categoryType: 'PRODUCT' },
    });
    electronicsSubs.push(cat);
  }

  // Sub-categories for Fashion
  const fashionSubcats = ['Men\'s Clothing', 'Women\'s Clothing', 'Kids\' Clothing', 'Shoes', 'Bags & Accessories', 'Watches & Jewelry'];
  const fashionSubs: any[] = [];
  for (const sub of fashionSubcats) {
    const cat = await prisma.category.create({
      data: { name: sub, parentId: createdRootCats[1].id, type: 'product', categoryType: 'PRODUCT' },
    });
    fashionSubs.push(cat);
  }

  // Sub-categories for Home & Garden
  const homeSubcats = ['Furniture', 'Kitchen Appliances', 'Lighting', 'Bedding & Linen', 'Garden Tools'];
  for (const sub of homeSubcats) {
    await prisma.category.create({
      data: { name: sub, parentId: createdRootCats[2].id, type: 'product', categoryType: 'PRODUCT' },
    });
  }

  // Sub-categories for Automotive
  const autoSubcats = ['Car Parts', 'Tires & Wheels', 'Car Electronics', 'Oil & Lubricants', 'Car Care'];
  for (const sub of autoSubcats) {
    await prisma.category.create({
      data: { name: sub, parentId: createdRootCats[3].id, type: 'product', categoryType: 'PRODUCT' },
    });
  }

  // Sub-categories for Industrial
  const industrialSubcats = ['Power Tools', 'Hand Tools', 'Safety Equipment', 'Machinery', 'Electrical Supplies'];
  for (const sub of industrialSubcats) {
    await prisma.category.create({
      data: { name: sub, parentId: createdRootCats[4].id, type: 'product', categoryType: 'PRODUCT' },
    });
  }

  // Sub-sub-categories for Mobile Phones
  const mobileSubsubs = ['Smartphones', 'Feature Phones', 'Phone Cases', 'Screen Protectors', 'Chargers & Cables'];
  for (const sub of mobileSubsubs) {
    await prisma.category.create({
      data: { name: sub, parentId: electronicsSubs[0].id, type: 'product', categoryType: 'PRODUCT' },
    });
  }

  const allCats = await prisma.category.count();
  console.log(`    ✅ ${allCats} categories (3 levels deep)`);

  // ═══════════════════════════════════════════════════════════════════════
  // 3. TAGS & BRANDS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  🏷️  Seeding tags & brands...');

  const tagNames = [
    'Wholesale', 'Retail', 'Manufacturer', 'Distributor', 'Importer',
    'Exporter', 'OEM', 'Electronics', 'Fashion', 'Luxury',
    'Eco-Friendly', 'Budget', 'Premium', 'New Arrival', 'Best Seller',
    'Free Shipping', 'Warranty', 'Limited Edition', 'Refurbished', 'Original',
  ];
  const tags: any[] = [];
  for (const t of tagNames) {
    const tag = await prisma.tags.create({ data: { tagName: t } });
    tags.push(tag);
  }

  const brandNames = [
    { brandName: 'Apple', brandType: 'INTERNATIONAL' },
    { brandName: 'Samsung', brandType: 'INTERNATIONAL' },
    { brandName: 'Sony', brandType: 'INTERNATIONAL' },
    { brandName: 'LG', brandType: 'INTERNATIONAL' },
    { brandName: 'Huawei', brandType: 'INTERNATIONAL' },
    { brandName: 'Dell', brandType: 'INTERNATIONAL' },
    { brandName: 'HP', brandType: 'INTERNATIONAL' },
    { brandName: 'Lenovo', brandType: 'INTERNATIONAL' },
    { brandName: 'Nike', brandType: 'INTERNATIONAL' },
    { brandName: 'Adidas', brandType: 'INTERNATIONAL' },
    { brandName: 'Zara', brandType: 'INTERNATIONAL' },
    { brandName: 'Omantel', brandType: 'LOCAL' },
    { brandName: 'Al Jazeera Electronics', brandType: 'LOCAL' },
    { brandName: 'Gulf Brands', brandType: 'REGIONAL' },
    { brandName: 'Bosch', brandType: 'INTERNATIONAL' },
  ];
  const brands: any[] = [];
  for (const b of brandNames) {
    const brand = await prisma.brand.create({ data: b });
    brands.push(brand);
  }

  console.log(`    ✅ ${tags.length} tags, ${brands.length} brands`);

  // ═══════════════════════════════════════════════════════════════════════
  // 4. PERMISSIONS & ADMIN ROLES
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  🔐 Seeding permissions & admin roles...');

  const permissionNames = [
    'view_dashboard', 'manage_users', 'manage_products', 'manage_orders',
    'manage_categories', 'manage_fees', 'manage_policies', 'manage_banners',
    'manage_reports', 'manage_payments', 'manage_notifications', 'manage_settings',
    'manage_rfq', 'manage_services', 'manage_wallets', 'view_analytics',
  ];
  const permissions: any[] = [];
  for (const pName of permissionNames) {
    const perm = await prisma.permission.create({ data: { name: pName } });
    permissions.push(perm);
  }

  // Admin roles
  const superAdminRole = await prisma.adminRole.create({
    data: { adminRoleName: 'Super Admin' },
  });
  const supportAdminRole = await prisma.adminRole.create({
    data: { adminRoleName: 'Support Agent' },
  });
  const financeAdminRole = await prisma.adminRole.create({
    data: { adminRoleName: 'Finance Manager' },
  });

  // Admin permissions (separate from user permissions — mapped to AdminRolePermission)
  const adminPermissions: any[] = [];
  for (const pName of permissionNames) {
    const ap = await prisma.adminPermission.create({ data: { name: pName } });
    adminPermissions.push(ap);
  }

  // Seller roles
  const sellerManagerRole = await prisma.userRole.create({
    data: { userRoleName: 'Store Manager' },
  });
  const sellerSalesRole = await prisma.userRole.create({
    data: { userRoleName: 'Sales Representative' },
  });
  const sellerWarehouseRole = await prisma.userRole.create({
    data: { userRoleName: 'Warehouse Staff' },
  });

  // Assign all admin permissions to Super Admin
  for (const ap of adminPermissions) {
    await prisma.adminRolePermission.create({
      data: { adminRoleId: superAdminRole.id, adminPermissionId: ap.id },
    });
  }

  // Assign selected permissions to seller manager role (UserRolePermission)
  for (const perm of permissions.slice(0, 8)) {
    await prisma.userRolePermission.create({
      data: { userRoleId: sellerManagerRole.id, permissionId: perm.id },
    });
  }

  console.log(`    ✅ ${permissions.length} permissions, 3 admin roles, 3 seller roles`);

  // ═══════════════════════════════════════════════════════════════════════
  // 5. USERS — Admin, Buyers, Sellers, Freelancers, Members
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  👤 Seeding users...');

  const defaultPassword = await hashPassword('Test@1234');

  // Super Admin user (upsert for idempotent seeding)
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@ultrasooq.com' },
    update: { password: defaultPassword, adminRoleId: superAdminRole.id },
    create: {
      email: 'admin@ultrasooq.com',
      firstName: 'Super',
      lastName: 'Admin',
      password: defaultPassword,
      phoneNumber: '96899001001',
      cc: '+968',
      tradeRole: 'ADMINMEMBER',
      userType: 'ADMIN',
      status: 'ACTIVE',
      loginType: 'MANUAL',
      adminRoleId: superAdminRole.id,
    },
  });

  // Support Agent
  const supportUser = await prisma.user.upsert({
    where: { email: 'support@ultrasooq.com' },
    update: { password: defaultPassword, adminRoleId: supportAdminRole.id },
    create: {
      email: 'support@ultrasooq.com',
      firstName: 'Support',
      lastName: 'Agent',
      password: defaultPassword,
      phoneNumber: '96899001002',
      cc: '+968',
      tradeRole: 'ADMINMEMBER',
      userType: 'SUBADMIN',
      status: 'ACTIVE',
      loginType: 'MANUAL',
      adminRoleId: supportAdminRole.id,
    },
  });

  // Admin members (skip if already exist)
  const existingAdminMember = await prisma.adminMember.findFirst({ where: { userId: adminUser.id } });
  if (!existingAdminMember) {
    await prisma.adminMember.create({
      data: { userId: adminUser.id, adminRoleId: superAdminRole.id, addedBy: adminUser.id },
    });
  }
  const existingSupportMember = await prisma.adminMember.findFirst({ where: { userId: supportUser.id } });
  if (!existingSupportMember) {
    await prisma.adminMember.create({
      data: { userId: supportUser.id, adminRoleId: supportAdminRole.id, addedBy: adminUser.id },
    });
  }

  // ── Seller users (Companies) ──
  const sellersData = [
    { email: 'seller1@ultrasooq.com', firstName: 'Ahmed', lastName: 'Al-Rashidi', phone: '96899002001', companyName: 'Rashidi Electronics LLC', companyAddress: 'Al Qurum, Muscat', companyPhone: '96824500100' },
    { email: 'seller2@ultrasooq.com', firstName: 'Fatima', lastName: 'Al-Hosni', phone: '96899002002', companyName: 'Al Hosni Trading Co', companyAddress: 'Ruwi, Muscat', companyPhone: '96824500200' },
    { email: 'seller3@ultrasooq.com', firstName: 'Mohammed', lastName: 'Al-Balushi', phone: '96899002003', companyName: 'Balushi Auto Parts', companyAddress: 'Seeb Industrial Area, Muscat', companyPhone: '96824500300' },
    { email: 'seller4@ultrasooq.com', firstName: 'Aisha', lastName: 'Al-Habsi', phone: '96899002004', companyName: 'Habsi Fashion House', companyAddress: 'Muscat Grand Mall', companyPhone: '96824500400' },
    { email: 'seller5@ultrasooq.com', firstName: 'Khalid', lastName: 'Al-Kindi', phone: '96899002005', companyName: 'Kindi Industrial Supplies', companyAddress: 'Rusayl Industrial Estate', companyPhone: '96824500500' },
  ];

  const sellers: any[] = [];
  for (const sd of sellersData) {
    const seller = await prisma.user.upsert({
      where: { email: sd.email },
      update: { password: defaultPassword },
      create: {
        email: sd.email,
        firstName: sd.firstName,
        lastName: sd.lastName,
        password: defaultPassword,
        phoneNumber: sd.phone,
        cc: '+968',
        tradeRole: 'COMPANY',
        userType: 'USER',
        status: 'ACTIVE',
        loginType: 'MANUAL',
        companyName: sd.companyName,
        companyAddress: sd.companyAddress,
        companyPhone: sd.companyPhone,
      },
    });
    sellers.push(seller);
  }

  // ── Buyer users ──
  const buyersData = [
    { email: 'buyer1@example.com', firstName: 'Omar', lastName: 'Al-Siyabi', phone: '96899003001' },
    { email: 'buyer2@example.com', firstName: 'Sara', lastName: 'Al-Rawahi', phone: '96899003002' },
    { email: 'buyer3@example.com', firstName: 'Hassan', lastName: 'Al-Farsi', phone: '96899003003' },
    { email: 'buyer4@example.com', firstName: 'Maryam', lastName: 'Al-Zadjali', phone: '96899003004' },
    { email: 'buyer5@example.com', firstName: 'Ali', lastName: 'Al-Lawati', phone: '96899003005' },
    { email: 'buyer6@example.com', firstName: 'Noura', lastName: 'Al-Wahaibi', phone: '96899003006' },
    { email: 'buyer7@example.com', firstName: 'Yusuf', lastName: 'Al-Maskari', phone: '96899003007' },
    { email: 'buyer8@example.com', firstName: 'Layla', lastName: 'Al-Busaidi', phone: '96899003008' },
    { email: 'buyer9@example.com', firstName: 'Tariq', lastName: 'Al-Amri', phone: '96899003009' },
    { email: 'buyer10@example.com', firstName: 'Zainab', lastName: 'Al-Ghafri', phone: '96899003010' },
  ];

  const buyers: any[] = [];
  for (const bd of buyersData) {
    const buyer = await prisma.user.upsert({
      where: { email: bd.email },
      update: { password: defaultPassword },
      create: {
        email: bd.email,
        firstName: bd.firstName,
        lastName: bd.lastName,
        password: defaultPassword,
        phoneNumber: bd.phone,
        cc: '+968',
        tradeRole: 'BUYER',
        userType: 'USER',
        status: 'ACTIVE',
        loginType: 'MANUAL',
      },
    });
    buyers.push(buyer);
  }

  // ── Freelancer user ──
  const freelancer = await prisma.user.upsert({
    where: { email: 'freelancer1@example.com' },
    update: { password: defaultPassword },
    create: {
      email: 'freelancer1@example.com',
      firstName: 'Saif',
      lastName: 'Al-Mamari',
      password: defaultPassword,
      phoneNumber: '96899004001',
      cc: '+968',
      tradeRole: 'FREELANCER',
      userType: 'USER',
      status: 'ACTIVE',
      loginType: 'MANUAL',
    },
  });

  // ── Team member user ──
  const teamMember = await prisma.user.upsert({
    where: { email: 'member1@ultrasooq.com' },
    update: { password: defaultPassword },
    create: {
      email: 'member1@ultrasooq.com',
      firstName: 'Hamad',
      lastName: 'Al-Harthi',
      password: defaultPassword,
      phoneNumber: '96899005001',
      cc: '+968',
      tradeRole: 'MEMBER',
      userType: 'USER',
      status: 'ACTIVE',
      loginType: 'MANUAL',
      userRoleId: sellerManagerRole.id,
      addedBy: sellers[0].id,
    },
  });

  const existingTeamMember = await prisma.teamMember.findFirst({ where: { userId: teamMember.id } });
  if (!existingTeamMember) {
    await prisma.teamMember.create({
      data: { userId: teamMember.id, userRoleId: sellerManagerRole.id, addedBy: sellers[0].id },
    });
  }

  console.log(`    ✅ ${2 + sellers.length + buyers.length + 2} users (2 admins, ${sellers.length} sellers, ${buyers.length} buyers, 1 freelancer, 1 team member)`);

  // ═══════════════════════════════════════════════════════════════════════
  // 6. USER ADDRESSES (skip if data already exists)
  // ═══════════════════════════════════════════════════════════════════════
  const existingAddresses = await prisma.userAddress.count();
  if (existingAddresses > 0) {
    console.log('  ⏩ Skipping remaining seed sections — data already exists');
    console.log('\n✅ Seed complete (users upserted, existing data preserved).');
    return;
  }
  console.log('  🏠 Seeding user addresses...');

  for (const buyer of buyers) {
    await prisma.userAddress.create({
      data: {
        userId: buyer.id,
        firstName: buyer.firstName,
        lastName: buyer.lastName,
        phoneNumber: buyer.phoneNumber,
        cc: '+968',
        address: `Building ${randomInt(1, 200)}, Street ${randomInt(1, 50)}, Way ${randomInt(100, 999)}`,
        city: randomPick(muscatCitiesData),
        province: 'Muscat',
        country: 'Oman',
        postCode: String(randomInt(100, 199)),
        countryId: oman.id,
        stateId: muscatState.id,
        cityId: cities[randomInt(0, cities.length - 1)].id,
      },
    });
  }

  console.log(`    ✅ ${buyers.length} addresses`);

  // ═══════════════════════════════════════════════════════════════════════
  // 7. USER PROFILES & BRANCHES (for sellers)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  🏢 Seeding seller profiles & branches...');

  for (const seller of sellers) {
    const profile = await prisma.userProfile.create({
      data: {
        userId: seller.id,
        profileType: 'company',
        companyName: seller.companyName,
        aboutUs: `${seller.companyName} is a leading provider of quality products in Oman, serving customers since ${randomInt(2005, 2020)}.`,
        address: seller.companyAddress,
        city: 'Muscat',
        province: 'Muscat',
        country: 'Oman',
        yearOfEstablishment: randomInt(2005, 2020),
        totalNoOfEmployee: String(randomInt(5, 200)),
        cc: '+968',
        phoneNumber: seller.companyPhone,
      },
    });

    // Branch
    await prisma.userBranch.create({
      data: {
        userId: seller.id,
        userProfileId: profile.id,
        profileType: 'company',
        mainOffice: 1,
        address: seller.companyAddress,
        city: 'Muscat',
        province: 'Muscat',
        country: 'Oman',
        countryId: oman.id,
        stateId: muscatState.id,
        cityId: cities[0].id,
        contactName: `${seller.firstName} ${seller.lastName}`,
        contactNumber: seller.companyPhone,
        cc: '+968',
        startTime: '09:00',
        endTime: '18:00',
        workingDays: 'Sun,Mon,Tue,Wed,Thu',
      },
    });
  }

  console.log(`    ✅ ${sellers.length} profiles, ${sellers.length} branches`);

  // ═══════════════════════════════════════════════════════════════════════
  // 8. PRODUCTS — 50 products across sellers and categories
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  📦 Seeding products...');

  const productTemplates = [
    // Electronics — Seller 1 (Rashidi Electronics)
    { name: 'iPhone 15 Pro Max 256GB', cat: electronicsSubs[0].id, brand: brands[0].id, seller: sellers[0].id, price: 499.99, offer: 479.99, desc: 'Latest Apple flagship with A17 Pro chip, titanium design, and 48MP camera system.' },
    { name: 'Samsung Galaxy S24 Ultra', cat: electronicsSubs[0].id, brand: brands[1].id, seller: sellers[0].id, price: 459.99, offer: 439.99, desc: 'Samsung premium smartphone with S Pen, 200MP camera, and Snapdragon 8 Gen 3.' },
    { name: 'MacBook Air M3 15-inch', cat: electronicsSubs[1].id, brand: brands[0].id, seller: sellers[0].id, price: 549.99, offer: 529.99, desc: 'Apple MacBook Air with M3 chip, 15-inch Liquid Retina display, and 18-hour battery.' },
    { name: 'Dell XPS 15 Laptop', cat: electronicsSubs[1].id, brand: brands[5].id, seller: sellers[0].id, price: 429.99, offer: 399.99, desc: 'Dell XPS 15 with Intel Core i7, 16GB RAM, 512GB SSD, OLED display.' },
    { name: 'Sony WH-1000XM5 Headphones', cat: electronicsSubs[3].id, brand: brands[2].id, seller: sellers[0].id, price: 139.99, offer: 124.99, desc: 'Premium noise-cancelling wireless headphones with 30-hour battery life.' },
    { name: 'iPad Pro 12.9-inch M4', cat: electronicsSubs[2].id, brand: brands[0].id, seller: sellers[0].id, price: 399.99, offer: 389.99, desc: 'Apple iPad Pro with M4 chip, OLED tandem display, and Apple Pencil Pro support.' },
    { name: 'Samsung 65" QLED 4K TV', cat: electronicsSubs[0].id, brand: brands[1].id, seller: sellers[0].id, price: 699.99, offer: 649.99, desc: 'Samsung Neo QLED 4K smart TV with Quantum HDR and Tizen OS.' },
    { name: 'Sony Alpha A7 IV Camera', cat: electronicsSubs[4].id, brand: brands[2].id, seller: sellers[0].id, price: 899.99, offer: 849.99, desc: 'Full-frame mirrorless camera with 33MP sensor and real-time eye AF.' },
    { name: 'Apple Watch Ultra 2', cat: electronicsSubs[5].id, brand: brands[0].id, seller: sellers[0].id, price: 299.99, offer: 289.99, desc: 'Rugged smartwatch with precision dual-frequency GPS and 36-hour battery.' },
    { name: 'HP LaserJet Pro Printer', cat: electronicsSubs[8].id, brand: brands[6].id, seller: sellers[0].id, price: 179.99, offer: 159.99, desc: 'HP wireless laser printer with duplex printing and mobile printing support.' },

    // Seller 2 (Al Hosni Trading) — Electronics & misc
    { name: 'Huawei MatePad Pro 13.2', cat: electronicsSubs[2].id, brand: brands[4].id, seller: sellers[1].id, price: 249.99, offer: 229.99, desc: 'Huawei premium tablet with OLED display, M-Pencil, and HarmonyOS.' },
    { name: 'Lenovo ThinkPad X1 Carbon', cat: electronicsSubs[1].id, brand: brands[7].id, seller: sellers[1].id, price: 579.99, offer: 549.99, desc: 'Ultra-thin business laptop with Intel Core i7, 14-inch 2.8K OLED display.' },
    { name: 'Samsung Galaxy Buds3 Pro', cat: electronicsSubs[3].id, brand: brands[1].id, seller: sellers[1].id, price: 89.99, offer: 79.99, desc: 'True wireless earbuds with intelligent ANC and 360 Audio.' },
    { name: 'LG 27" 4K Monitor', cat: electronicsSubs[1].id, brand: brands[3].id, seller: sellers[1].id, price: 199.99, offer: 179.99, desc: 'LG UHD 4K IPS monitor with USB-C, HDR10, and 99% sRGB color accuracy.' },
    { name: 'Sony PlayStation 5 Slim', cat: electronicsSubs[9].id, brand: brands[2].id, seller: sellers[1].id, price: 199.99, offer: 189.99, desc: 'Next-gen gaming console with SSD storage and ray tracing.' },

    // Seller 3 (Balushi Auto Parts) — Automotive
    { name: 'Bosch Car Battery 12V 70Ah', cat: createdRootCats[3].id, brand: brands[14].id, seller: sellers[2].id, price: 49.99, offer: 44.99, desc: 'High-performance automotive battery with 3-year warranty.' },
    { name: 'Michelin Pilot Sport 4 Tires (Set of 4)', cat: createdRootCats[3].id, brand: null, seller: sellers[2].id, price: 299.99, offer: 269.99, desc: 'Premium sport tires 225/45R17 for sedans and coupes.' },
    { name: 'Bosch Wiper Blades Set', cat: createdRootCats[3].id, brand: brands[14].id, seller: sellers[2].id, price: 12.99, offer: 10.99, desc: 'Aerotwin flat wiper blades with even pressure distribution.' },
    { name: 'LED Headlight Bulbs H7 (Pair)', cat: createdRootCats[3].id, brand: null, seller: sellers[2].id, price: 29.99, offer: 24.99, desc: '6000K white LED headlight bulbs with 200% brighter beam.' },
    { name: 'Castrol EDGE 5W-30 Full Synthetic Oil 4L', cat: createdRootCats[3].id, brand: null, seller: sellers[2].id, price: 19.99, offer: 17.99, desc: 'Advanced full synthetic motor oil for maximum engine protection.' },
    { name: 'Car Dash Camera 4K', cat: createdRootCats[3].id, brand: null, seller: sellers[2].id, price: 59.99, offer: 49.99, desc: '4K front and rear dash cam with night vision and parking mode.' },
    { name: 'Universal Car Phone Mount', cat: createdRootCats[3].id, brand: null, seller: sellers[2].id, price: 7.99, offer: 5.99, desc: 'Magnetic car phone holder with 360° rotation for dashboard.' },
    { name: 'Emergency Roadside Kit', cat: createdRootCats[3].id, brand: null, seller: sellers[2].id, price: 34.99, offer: 29.99, desc: 'Complete roadside assistance kit with jumper cables, flashlight, first aid.' },

    // Seller 4 (Habsi Fashion) — Fashion
    { name: 'Men\'s Premium Dishdasha (White)', cat: fashionSubs[0].id, brand: null, seller: sellers[3].id, price: 39.99, offer: 34.99, desc: 'Traditional Omani dishdasha in premium white cotton fabric.' },
    { name: 'Women\'s Abaya Embroidered (Black)', cat: fashionSubs[1].id, brand: null, seller: sellers[3].id, price: 59.99, offer: 49.99, desc: 'Elegant black abaya with gold embroidery and premium fabric.' },
    { name: 'Nike Air Max 270 Running Shoes', cat: fashionSubs[3].id, brand: brands[8].id, seller: sellers[3].id, price: 54.99, offer: 49.99, desc: 'Lightweight running shoes with Air Max cushioning and breathable mesh.' },
    { name: 'Adidas Ultraboost 22', cat: fashionSubs[3].id, brand: brands[9].id, seller: sellers[3].id, price: 69.99, offer: 59.99, desc: 'Premium running shoes with Boost midsole and Primeknit upper.' },
    { name: 'Leather Crossbody Bag', cat: fashionSubs[4].id, brand: null, seller: sellers[3].id, price: 29.99, offer: 24.99, desc: 'Genuine leather crossbody bag with adjustable strap and multiple compartments.' },
    { name: 'Casio G-Shock Watch', cat: fashionSubs[5].id, brand: null, seller: sellers[3].id, price: 44.99, offer: 39.99, desc: 'Shock-resistant digital watch with 200m water resistance and solar power.' },
    { name: 'Kumma Traditional Cap (Set of 3)', cat: fashionSubs[4].id, brand: null, seller: sellers[3].id, price: 14.99, offer: 12.99, desc: 'Hand-crafted Omani kumma cap set in traditional patterns.' },
    { name: 'Kids School Uniform Set', cat: fashionSubs[2].id, brand: null, seller: sellers[3].id, price: 19.99, offer: 16.99, desc: 'Complete school uniform set with shirt, trousers, and tie.' },

    // Seller 5 (Kindi Industrial) — Industrial & Tools
    { name: 'Bosch Professional Drill Set', cat: createdRootCats[4].id, brand: brands[14].id, seller: sellers[4].id, price: 89.99, offer: 79.99, desc: '18V cordless drill driver with 50-piece accessory set and carrying case.' },
    { name: 'Stanley 60-Piece Socket Set', cat: createdRootCats[4].id, brand: null, seller: sellers[4].id, price: 34.99, offer: 29.99, desc: 'Chrome vanadium socket set with ratchet handle in blow-molded case.' },
    { name: '3M Safety Helmet (White)', cat: createdRootCats[4].id, brand: null, seller: sellers[4].id, price: 9.99, offer: 7.99, desc: 'Industrial safety helmet with ventilation and adjustable suspension.' },
    { name: 'DeWalt Angle Grinder 9"', cat: createdRootCats[4].id, brand: null, seller: sellers[4].id, price: 59.99, offer: 54.99, desc: '2200W angle grinder with anti-vibration handle and dust ejection system.' },
    { name: 'Heavy Duty Work Gloves (12 Pairs)', cat: createdRootCats[4].id, brand: null, seller: sellers[4].id, price: 14.99, offer: 12.99, desc: 'Nitrile-coated industrial work gloves with cut resistance.' },
    { name: 'Portable Generator 3500W', cat: createdRootCats[4].id, brand: null, seller: sellers[4].id, price: 349.99, offer: 319.99, desc: 'Inverter generator with 3500W peak power, electric start, and low noise.' },
    { name: 'Welding Machine MIG 200A', cat: createdRootCats[4].id, brand: null, seller: sellers[4].id, price: 199.99, offer: 179.99, desc: 'MIG/MAG welding machine with digital display and wire feed system.' },
    { name: 'Air Compressor 50L', cat: createdRootCats[4].id, brand: null, seller: sellers[4].id, price: 149.99, offer: 134.99, desc: '2.5HP oil-free air compressor with 50L tank and quick-connect fittings.' },
    { name: 'Professional Tool Cabinet', cat: createdRootCats[4].id, brand: null, seller: sellers[4].id, price: 249.99, offer: 219.99, desc: '7-drawer rolling tool cabinet with ball-bearing slides and keyed lock.' },
    { name: 'Electrical Cable 2.5mm² (100m)', cat: createdRootCats[4].id, brand: null, seller: sellers[4].id, price: 24.99, offer: 21.99, desc: '100m roll of PVC-insulated copper electrical cable, 2.5mm².' },
  ];

  const products: any[] = [];
  for (let i = 0; i < productTemplates.length; i++) {
    const pt = productTemplates[i];
    const product = await prisma.product.create({
      data: {
        productName: pt.name,
        categoryId: pt.cat,
        skuNo: generateSKU('USQ', i + 1),
        productPrice: pt.price,
        offerPrice: pt.offer,
        description: pt.desc,
        status: 'ACTIVE',
        brandId: pt.brand,
        userId: pt.seller,
        adminId: adminUser.id,
        productType: 'P',
        categoryLocation: `Root > ${pt.cat}`,
      },
    });
    products.push(product);

    // Product images (placeholder URLs)
    await prisma.productImages.create({
      data: {
        productId: product.id,
        productImage: `https://placehold.co/600x600/EEE/31343C?text=${encodeURIComponent(pt.name.substring(0, 20))}`,
        status: 'ACTIVE',
      },
    });

    // Product tags (2-3 random tags per product)
    const numTags = randomInt(2, 3);
    const usedTagIds = new Set<number>();
    for (let t = 0; t < numTags; t++) {
      const tag = randomPick(tags);
      if (!usedTagIds.has(tag.id)) {
        usedTagIds.add(tag.id);
        await prisma.productTags.create({
          data: { productId: product.id, tagId: tag.id },
        });
      }
    }
  }

  console.log(`    ✅ ${products.length} products with images and tags`);

  // ═══════════════════════════════════════════════════════════════════════
  // 9. PRODUCT PRICES (seller listings with location-based pricing)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  💰 Seeding product prices...');

  for (const product of products) {
    const sellerIdx = sellers.findIndex(s => s.id === product.userId);
    const seller = sellers[sellerIdx >= 0 ? sellerIdx : 0];

    await prisma.productPrice.create({
      data: {
        productId: product.id,
        userId: seller.id,
        minQuantity: 1,
        maxQuantity: 100,
        unitPrice: product.offerPrice,
        sellType: 'NORMALSELL',
        consumerType: 'EVERYONE',
        status: 'ACTIVE',
        countryId: oman.id,
        stateId: muscatState.id,
        cityId: cities[0].id,
      },
    });

    // Wholesale price for some products
    if (Math.random() > 0.5) {
      await prisma.productPrice.create({
        data: {
          productId: product.id,
          userId: seller.id,
          minQuantity: 10,
          maxQuantity: 1000,
          unitPrice: Number((Number(product.offerPrice) * 0.85).toFixed(2)),
          sellType: 'WHOLESALE_PRODUCT',
          consumerType: 'VENDORS',
          status: 'ACTIVE',
          countryId: oman.id,
          stateId: muscatState.id,
          cityId: cities[0].id,
        },
      });
    }
  }

  console.log(`    ✅ Product prices seeded`);

  // ═══════════════════════════════════════════════════════════════════════
  // 10. WALLETS — One per user
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  💳 Seeding wallets...');

  const allUsers = [adminUser, supportUser, ...sellers, ...buyers, freelancer, teamMember];
  for (const user of allUsers) {
    await prisma.wallet.create({
      data: {
        userId: user.id,
        currencyCode: 'OMR',
        balance: user.tradeRole === 'COMPANY' ? randomDecimal(500, 5000) : randomDecimal(0, 500),
        frozenBalance: 0,
        status: 'ACTIVE',
      },
    });
  }

  console.log(`    ✅ ${allUsers.length} wallets`);

  // ═══════════════════════════════════════════════════════════════════════
  // 11. ORDERS — Sample orders for buyers
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  🛒 Seeding orders...');

  const orderStatuses: Array<'PENDING' | 'PAID' | 'COMPLETE'> = ['PENDING', 'PAID', 'COMPLETE'];
  const orderProductStatuses: Array<'PLACED' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED'> = ['PLACED', 'CONFIRMED', 'SHIPPED', 'DELIVERED'];

  let orderCount = 0;
  for (const buyer of buyers.slice(0, 7)) {
    const numOrders = randomInt(1, 3);
    for (let o = 0; o < numOrders; o++) {
      const orderProducts = [];
      const numItems = randomInt(1, 3);
      let totalPrice = 0;

      for (let p = 0; p < numItems; p++) {
        const product = randomPick(products);
        const qty = randomInt(1, 3);
        const itemPrice = Number(product.offerPrice) * qty;
        totalPrice += itemPrice;
        orderProducts.push({ product, qty, itemPrice });
      }

      const deliveryCharge = randomDecimal(1, 5);
      const orderStatus = randomPick(orderStatuses);

      const order = await prisma.order.create({
        data: {
          userId: buyer.id,
          orderNo: generateOrderNo(),
          paymentMethod: randomPick(['PAYMOB', 'WALLET', 'COD']),
          totalPrice: totalPrice + deliveryCharge,
          actualPrice: totalPrice,
          deliveryCharge: deliveryCharge,
          orderStatus: orderStatus,
          orderDate: new Date(Date.now() - randomInt(0, 90) * 24 * 60 * 60 * 1000),
          orderType: 'DEFAULT',
          totalCustomerPay: totalPrice + deliveryCharge,
          totalPlatformFee: totalPrice * 0.05,
          paymentType: 'DIRECT',
        },
      });

      // Order products
      for (const op of orderProducts) {
        const sellerIdx = sellers.findIndex(s => s.id === op.product.userId);
        await prisma.orderProducts.create({
          data: {
            orderId: order.id,
            productId: op.product.id,
            sellerId: op.product.userId,
            userId: buyer.id,
            quantity: op.qty,
            productPrice: op.product.offerPrice,
            totalPrice: op.itemPrice,
            productName: op.product.productName,
            productType: 'PRODUCT',
            orderProductStatus: orderStatus === 'COMPLETE' ? 'DELIVERED' : randomPick(orderProductStatuses),
          },
        });
      }

      // Order address
      await prisma.orderAddress.create({
        data: {
          orderId: order.id,
          firstName: buyer.firstName,
          lastName: buyer.lastName,
          phoneNumber: buyer.phoneNumber,
          cc: '+968',
          address: `Building ${randomInt(1, 200)}, Street ${randomInt(1, 50)}`,
          city: 'Muscat City',
          province: 'Muscat',
          country: 'Oman',
          postCode: String(randomInt(100, 199)),
          addressType: 'SHIPPING',
        },
      });

      orderCount++;
    }
  }

  console.log(`    ✅ ${orderCount} orders with products and addresses`);

  // ═══════════════════════════════════════════════════════════════════════
  // 12. CART ITEMS — Active carts for some buyers
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  🛒 Seeding cart items...');

  let cartCount = 0;
  for (const buyer of buyers.slice(5)) {
    const numItems = randomInt(1, 4);
    for (let c = 0; c < numItems; c++) {
      const product = randomPick(products);
      await prisma.cart.create({
        data: {
          userId: buyer.id,
          productId: product.id,
          quantity: randomInt(1, 3),
          cartType: 'DEFAULT',
          status: 'ACTIVE',
        },
      });
      cartCount++;
    }
  }

  console.log(`    ✅ ${cartCount} cart items`);

  // ═══════════════════════════════════════════════════════════════════════
  // 13. WISHLISTS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  ❤️  Seeding wishlists...');

  let wishlistCount = 0;
  for (const buyer of buyers) {
    const numWishlist = randomInt(2, 5);
    const usedProductIds = new Set<number>();
    for (let w = 0; w < numWishlist; w++) {
      const product = randomPick(products);
      if (!usedProductIds.has(product.id)) {
        usedProductIds.add(product.id);
        await prisma.wishlist.create({
          data: { userId: buyer.id, productId: product.id, status: 'ACTIVE' },
        });
        wishlistCount++;
      }
    }
  }

  console.log(`    ✅ ${wishlistCount} wishlist items`);

  // ═══════════════════════════════════════════════════════════════════════
  // 14. PRODUCT REVIEWS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  ⭐ Seeding product reviews...');

  const reviewTexts = [
    'Excellent product! Exactly as described.',
    'Great quality for the price. Fast delivery too.',
    'Good product but packaging could be better.',
    'Very satisfied with this purchase. Will buy again.',
    'Decent product. Works as expected.',
    'Outstanding! Exceeded my expectations.',
    'Product is okay but delivery was slow.',
    'Amazing quality. Best purchase this month.',
    'Not bad, but I expected better build quality.',
    'Perfect! Highly recommended to everyone.',
  ];

  let reviewCount = 0;
  for (const product of products.slice(0, 25)) {
    const numReviews = randomInt(1, 4);
    const usedBuyerIds = new Set<number>();
    for (let r = 0; r < numReviews; r++) {
      const buyer = randomPick(buyers);
      if (!usedBuyerIds.has(buyer.id)) {
        usedBuyerIds.add(buyer.id);
        await prisma.productReview.create({
          data: {
            productId: product.id,
            userId: buyer.id,
            reviewText: randomPick(reviewTexts),
            rating: randomInt(3, 5),
            status: 'ACTIVE',
          },
        });
        reviewCount++;
      }
    }
  }

  console.log(`    ✅ ${reviewCount} product reviews`);

  // ═══════════════════════════════════════════════════════════════════════
  // 15. NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  🔔 Seeding notifications...');

  const notificationTypes = ['ORDER', 'MESSAGE', 'RFQ', 'REVIEW', 'SYSTEM', 'PAYMENT'];
  const notificationTemplates = [
    { type: 'ORDER', title: 'Order Confirmed', message: 'Your order #ORD-{id} has been confirmed.' },
    { type: 'ORDER', title: 'Order Shipped', message: 'Your order #ORD-{id} has been shipped. Track it now!' },
    { type: 'PAYMENT', title: 'Payment Received', message: 'Payment of {amount} OMR received successfully.' },
    { type: 'REVIEW', title: 'New Review', message: 'A buyer left a {rating}-star review on your product.' },
    { type: 'SYSTEM', title: 'Welcome to Ultrasooq', message: 'Welcome! Your account has been verified.' },
    { type: 'MESSAGE', title: 'New Message', message: 'You have a new message from {name}.' },
    { type: 'RFQ', title: 'New RFQ Quote', message: 'You received a new quote for your RFQ request.' },
    { type: 'SYSTEM', title: 'Profile Approved', message: 'Your seller profile has been approved by admin.' },
  ];

  let notifCount = 0;
  for (const user of [...buyers, ...sellers]) {
    const numNotifs = randomInt(3, 6);
    for (let n = 0; n < numNotifs; n++) {
      const tmpl = randomPick(notificationTemplates);
      await prisma.notification.create({
        data: {
          userId: user.id,
          type: tmpl.type,
          title: tmpl.title,
          message: tmpl.message
            .replace('{id}', String(randomInt(10000, 99999)))
            .replace('{amount}', String(randomDecimal(10, 500)))
            .replace('{rating}', String(randomInt(3, 5)))
            .replace('{name}', randomPick(buyers).firstName),
          read: Math.random() > 0.5,
          readAt: Math.random() > 0.5 ? new Date() : null,
          link: tmpl.type === 'ORDER' ? `/orders/${randomInt(1, 100)}` : null,
        },
      });
      notifCount++;
    }
  }

  console.log(`    ✅ ${notifCount} notifications`);

  // ═══════════════════════════════════════════════════════════════════════
  // 16. FEES — Platform fee structure
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  💲 Seeding fees...');

  const feesData = [
    { feeName: 'Standard Seller Fee', feeDescription: 'Default fee applied to all product sales', feeType: 'PERCENTAGE', menuId: createdRootCats[0].id },
    { feeName: 'Fashion Category Fee', feeDescription: 'Fee for fashion and apparel category', feeType: 'PERCENTAGE', menuId: createdRootCats[1].id },
    { feeName: 'Premium Listing Fee', feeDescription: 'Fee for premium product listings', feeType: 'FLAT', menuId: createdRootCats[0].id },
    { feeName: 'RFQ Service Fee', feeDescription: 'Fee charged on RFQ quote completions', feeType: 'PERCENTAGE', menuId: createdRootCats[4].id },
  ];

  for (const fd of feesData) {
    const fee = await prisma.fees.create({
      data: {
        feeName: fd.feeName,
        feeDescription: fd.feeDescription,
        feeType: fd.feeType,
        menuId: fd.menuId,
        status: 'ACTIVE',
      },
    });

    // Fee details
    await prisma.feesDetail.create({
      data: {
        feesId: fee.id,
        min: 0,
        max: 99999,
        feeAmount: fd.feeType === 'PERCENTAGE' ? randomDecimal(3, 15) : randomDecimal(1, 10),
        feeType: fd.feeType,
        status: 'ACTIVE',
      },
    });
  }

  console.log(`    ✅ ${feesData.length} fee structures`);

  // ═══════════════════════════════════════════════════════════════════════
  // 17. BANNERS
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  🖼️  Seeding banners...');

  const bannerData = [
    { title: 'Summer Electronics Sale', subtitle: 'Up to 40% off on all electronics', position: 'MAIN' as const, link: '/electronics' },
    { title: 'New Arrivals', subtitle: 'Check out the latest products', position: 'SIDE_TOP' as const, link: '/new-arrivals' },
    { title: 'Free Shipping', subtitle: 'Free shipping on orders above 20 OMR', position: 'SIDE_BOTTOM' as const, link: '/deals' },
    { title: 'Ramadan Special', subtitle: 'Special offers for Ramadan season', position: 'FULL_WIDTH' as const, link: '/ramadan-deals' },
  ];

  for (const bd of bannerData) {
    await prisma.banner.create({
      data: {
        title: bd.title,
        subtitle: bd.subtitle,
        position: bd.position,
        link: bd.link,
        bannerImage: `https://placehold.co/1200x400/EEE/31343C?text=${encodeURIComponent(bd.title)}`,
        status: 'ACTIVE',
        addedBy: adminUser.id,
      },
    });
  }

  console.log(`    ✅ ${bannerData.length} banners`);

  // ═══════════════════════════════════════════════════════════════════════
  // 18. HELP CENTER ENTRIES
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  ❓ Seeding help center...');

  const helpCenterData = [
    { question: 'How do I create a seller account?', answer: 'Go to Register, select "Company" as your role, and fill in your business details. Your account will be reviewed within 24 hours.' },
    { question: 'How do I track my order?', answer: 'Go to My Orders in your dashboard. Click on the order to see real-time tracking information.' },
    { question: 'What payment methods are accepted?', answer: 'We accept Paymob (credit/debit cards), AmwalPay, wallet balance, and Cash on Delivery.' },
    { question: 'How do I request a refund?', answer: 'Contact the seller through the order chat. If unresolved, raise a dispute through the order details page.' },
    { question: 'How does the RFQ system work?', answer: 'Post your product requirements as an RFQ. Verified sellers will send you quotes. Compare and accept the best offer.' },
  ];

  for (const hc of helpCenterData) {
    await prisma.helpCenter.create({
      data: {
        question: hc.question,
        answer: hc.answer,
        userId: adminUser.id,
        status: 'ACTIVE',
      },
    });
  }

  console.log(`    ✅ ${helpCenterData.length} help center entries`);

  // ═══════════════════════════════════════════════════════════════════════
  // 19. SYSTEM LOGS (sample)
  // ═══════════════════════════════════════════════════════════════════════
  console.log('  📋 Seeding system logs...');

  const logActions = ['USER_LOGIN', 'USER_REGISTER', 'PRODUCT_CREATED', 'ORDER_PLACED', 'PAYMENT_RECEIVED', 'USER_APPROVED'];
  for (let l = 0; l < 20; l++) {
    const user = randomPick(allUsers);
    await prisma.systemLog.create({
      data: {
        userId: user.id,
        action: randomPick(logActions),
        description: `${randomPick(logActions).replace('_', ' ').toLowerCase()} by ${user.firstName} ${user.lastName}`,
        ipAddress: `192.168.${randomInt(1, 255)}.${randomInt(1, 255)}`,
      },
    });
  }

  console.log(`    ✅ 20 system logs`);

  // ═══════════════════════════════════════════════════════════════════════
  // DONE
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n🎉 Database seeding completed successfully!\n');

  console.log('═══════════════════════════════════════════════════');
  console.log('  Login Credentials (all use password: Test@1234)');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Admin:      admin@ultrasooq.com');
  console.log('  Support:    support@ultrasooq.com');
  console.log('  Seller 1:   seller1@ultrasooq.com');
  console.log('  Seller 2:   seller2@ultrasooq.com');
  console.log('  Seller 3:   seller3@ultrasooq.com');
  console.log('  Seller 4:   seller4@ultrasooq.com');
  console.log('  Seller 5:   seller5@ultrasooq.com');
  console.log('  Buyer 1:    buyer1@example.com');
  console.log('  Buyer 2:    buyer2@example.com');
  console.log('  ...         buyer10@example.com');
  console.log('  Freelancer: freelancer1@example.com');
  console.log('  Member:     member1@ultrasooq.com');
  console.log('═══════════════════════════════════════════════════');
}

// ─── Execute ──────────────────────────────────────────────────────────────

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Seed error:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
