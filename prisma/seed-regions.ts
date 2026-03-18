/**
 * seed-regions.ts — Seeds Countries, States (Governorates), and Cities for Oman
 *
 * Run: npx ts-node prisma/seed-regions.ts
 */

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Oman Governorates and their major cities
const OMAN_DATA = {
  country: { name: 'Oman', sortname: 'OM', phoneCode: 968 },
  governorates: [
    {
      name: 'Muscat',
      cities: ['Muscat', 'Muttrah', 'Bawshar', 'Seeb', 'Al Amerat', 'Quriyat'],
    },
    {
      name: 'Dhofar',
      cities: ['Salalah', 'Taqah', 'Mirbat', 'Rakhyut', 'Thumrait', 'Sadah'],
    },
    {
      name: 'Musandam',
      cities: ['Khasab', 'Bukha', 'Diba Al-Bayah', 'Madha'],
    },
    {
      name: 'Al Buraimi',
      cities: ['Al Buraimi', 'Mahdah', 'Al Sunaynah'],
    },
    {
      name: 'Ad Dakhliyah',
      cities: ['Nizwa', 'Bahla', 'Al Hamra', 'Manah', 'Adam', 'Izki', 'Samail', 'Bid Bid'],
    },
    {
      name: 'Al Batinah North',
      cities: ['Sohar', 'Shinas', 'Liwa', 'Saham', 'Al Khaburah', 'Al Suwaiq'],
    },
    {
      name: 'Al Batinah South',
      cities: ['Rustaq', 'Al Awabi', 'Nakhal', 'Wadi Al Maawil', 'Barka', 'Al Musannah'],
    },
    {
      name: 'Ash Sharqiyah South',
      cities: ['Sur', 'Jalan Bani Bu Ali', 'Jalan Bani Bu Hassan', 'Kamil wal Wafi', 'Masirah'],
    },
    {
      name: 'Ash Sharqiyah North',
      cities: ['Ibra', 'Al Mudhaibi', 'Bidiyah', 'Al Qabil', 'Wadi Bani Khalid', 'Dima wa Al Tayin'],
    },
    {
      name: 'Ad Dhahirah',
      cities: ['Ibri', 'Yanqul', 'Dhank'],
    },
    {
      name: 'Al Wusta',
      cities: ['Haima', 'Duqm', 'Mahut', 'Al Jazer'],
    },
  ],
};

async function main() {
  console.log('🌍 Seeding regions for Oman...\n');

  // 1. Upsert Oman country
  let country = await prisma.countries.findFirst({
    where: { name: 'Oman' },
  });

  if (!country) {
    country = await prisma.countries.create({
      data: {
        name: OMAN_DATA.country.name,
        sortname: OMAN_DATA.country.sortname,
        phoneCode: OMAN_DATA.country.phoneCode,
        status: 'ACTIVE',
      },
    });
    console.log(`✅ Created country: Oman (ID: ${country.id})`);
  } else {
    // Ensure it's ACTIVE
    await prisma.countries.update({
      where: { id: country.id },
      data: { status: 'ACTIVE' },
    });
    console.log(`✅ Country already exists: Oman (ID: ${country.id})`);
  }

  // 2. Seed governorates (states) and cities
  for (const gov of OMAN_DATA.governorates) {
    let state = await prisma.states.findFirst({
      where: {
        name: gov.name,
        countryId: country.id,
      },
    });

    if (!state) {
      state = await prisma.states.create({
        data: {
          name: gov.name,
          countryId: country.id,
          status: 'ACTIVE',
        },
      });
      console.log(`  ✅ Created governorate: ${gov.name} (ID: ${state.id})`);
    } else {
      await prisma.states.update({
        where: { id: state.id },
        data: { status: 'ACTIVE' },
      });
      console.log(`  ✅ Governorate exists: ${gov.name} (ID: ${state.id})`);
    }

    // Seed cities
    for (const cityName of gov.cities) {
      const existingCity = await prisma.cities.findFirst({
        where: {
          name: cityName,
          stateId: state.id,
        },
      });

      if (!existingCity) {
        await prisma.cities.create({
          data: {
            name: cityName,
            stateId: state.id,
            status: 'ACTIVE',
          },
        });
        console.log(`    ✅ Created city: ${cityName}`);
      } else {
        console.log(`    ✅ City exists: ${cityName}`);
      }
    }
  }

  console.log('\n🎉 Region seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
