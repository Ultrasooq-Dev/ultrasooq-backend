import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);

async function main() {
  const sellerId = 6; // seller@ultrasooq.com

  console.log('═══ Seeding Categories ═══');

  // ─── Categories (hierarchical) ───
  const categories = [
    { name: 'Electronics', children: ['Audio', 'Computers & Laptops', 'Mobile Phones', 'Monitors & Displays', 'Cameras', 'Accessories'] },
    { name: 'Auto Parts', children: ['Brakes', 'Engine Parts', 'Electrical & Lighting', 'Suspension & Steering', 'Cooling System', 'Body & Exterior', 'Transmission'] },
    { name: 'Office Equipment', children: ['Furniture', 'Printers', 'Networking', 'Peripherals'] },
    { name: 'Home & Garden', children: ['Lighting', 'Kitchen', 'Tools', 'Outdoor'] },
  ];

  const catMap: Record<string, number> = {};

  for (const cat of categories) {
    const parent = await prisma.category.upsert({
      where: { id: undefined } as any,
      update: {},
      create: { name: cat.name, status: 'ACTIVE' },
    }).catch(() => prisma.category.create({ data: { name: cat.name, status: 'ACTIVE' } }));
    catMap[cat.name] = parent.id;
    console.log(`  Category: ${cat.name} (id: ${parent.id})`);

    for (const child of cat.children) {
      const sub = await prisma.category.create({
        data: { name: child, parentId: parent.id, status: 'ACTIVE' },
      }).catch(() => prisma.category.findFirst({ where: { name: child, parentId: parent.id } }).then(c => c!));
      catMap[child] = sub.id;
    }
  }

  console.log('═══ Seeding Brands ═══');

  // ─── Brands ───
  const brandNames = ['Sony', 'JBL', 'Bose', 'Samsung', 'Apple', 'Dell', 'HP', 'Lenovo', 'Brembo', 'Bosch', 'NGK', 'Mann', 'KYB', 'Denso', 'TRW', 'Gates', 'K&N', 'Moog', 'LuK', 'GKN', 'Toyota OEM', 'Nissan OEM', 'Logitech', 'Corsair'];
  const brandMap: Record<string, number> = {};

  for (const name of brandNames) {
    const brand = await prisma.brand.create({ data: { brandName: name, status: 'ACTIVE' } })
      .catch(() => prisma.brand.findFirst({ where: { brandName: name } }).then(b => b!));
    brandMap[name] = brand.id;
    console.log(`  Brand: ${name} (id: ${brand.id})`);
  }

  console.log('═══ Seeding Products ═══');

  // ─── Products — Electronics ───
  const electronics = [
    { name: 'Sony WH-1000XM5', desc: 'Premium wireless noise-cancelling headphones with 30hr battery, LDAC, adaptive ANC', price: 95, offer: 85, stock: 120, brand: 'Sony', cat: 'Audio', sku: 'SONY-WH1000XM5', type: 'BRAND' as const, specs: [['Driver','30mm'],['ANC','Adaptive'],['Bluetooth','5.2 LDAC'],['Battery','30hrs'],['Weight','250g'],['Fold','Yes']] },
    { name: 'JBL Tune 770NC', desc: 'Wireless over-ear headphones with adaptive noise cancelling', price: 45, offer: 38, stock: 85, brand: 'JBL', cat: 'Audio', sku: 'JBL-TUNE770NC', type: 'BRAND' as const, specs: [['Driver','40mm'],['ANC','Adaptive'],['Bluetooth','5.3'],['Battery','44hrs'],['Weight','226g']] },
    { name: 'Bose QuietComfort Ultra', desc: 'Premium noise cancelling headphones with spatial audio', price: 120, offer: 110, stock: 45, brand: 'Bose', cat: 'Audio', sku: 'BOSE-QCULTRA', type: 'BRAND' as const, specs: [['Driver','35mm'],['ANC','CustomTune'],['Bluetooth','5.3 aptX'],['Battery','24hrs'],['Weight','250g']] },
    { name: 'Samsung Galaxy S24 Ultra', desc: '6.8" Dynamic AMOLED, Snapdragon 8 Gen 3, 200MP camera', price: 450, offer: 420, stock: 60, brand: 'Samsung', cat: 'Mobile Phones', sku: 'SAM-S24ULTRA', type: 'BRAND' as const, specs: [['Display','6.8" AMOLED'],['Processor','Snapdragon 8 Gen 3'],['RAM','12GB'],['Storage','256GB'],['Camera','200MP'],['Battery','5000mAh']] },
    { name: 'Dell XPS 15 (i7/16GB)', desc: '15.6" 4K OLED laptop, Intel i7, 16GB RAM, 512GB SSD', price: 650, offer: 600, stock: 30, brand: 'Dell', cat: 'Computers & Laptops', sku: 'DELL-XPS15-I7', type: 'BRAND' as const, specs: [['Display','15.6" 4K OLED'],['Processor','Intel i7-13700H'],['RAM','16GB'],['Storage','512GB SSD'],['GPU','Intel Iris Xe'],['Battery','86Wh']] },
    { name: 'Dell XPS 15 (i9/32GB)', desc: '15.6" 4K OLED laptop, Intel i9, 32GB RAM, 1TB SSD', price: 850, offer: 800, stock: 10, brand: 'Dell', cat: 'Computers & Laptops', sku: 'DELL-XPS15-I9', type: 'BRAND' as const, specs: [['Display','15.6" 4K OLED'],['Processor','Intel i9-13900H'],['RAM','32GB'],['Storage','1TB SSD'],['GPU','NVIDIA RTX 4050'],['Battery','86Wh']] },
    { name: 'iPad Pro 12.9 (256GB)', desc: 'M2 chip, 12.9" Liquid Retina XDR, Apple Pencil support', price: 420, offer: 400, stock: 45, brand: 'Apple', cat: 'Computers & Laptops', sku: 'APPLE-IPADPRO129-256', type: 'BRAND' as const, specs: [['Display','12.9" Liquid Retina XDR'],['Chip','M2'],['Storage','256GB'],['Camera','12MP Wide + 10MP Ultra Wide'],['Battery','10hrs']] },
    { name: 'iPad Pro 12.9 (512GB)', desc: 'M2 chip, 12.9" Liquid Retina XDR, 512GB storage', price: 520, offer: 500, stock: 20, brand: 'Apple', cat: 'Computers & Laptops', sku: 'APPLE-IPADPRO129-512', type: 'BRAND' as const, specs: [['Display','12.9" Liquid Retina XDR'],['Chip','M2'],['Storage','512GB'],['Camera','12MP Wide + 10MP Ultra Wide'],['Battery','10hrs']] },
    { name: 'iPad Air M2 (Similar)', desc: '10.9" Liquid Retina, M2 chip, all-day battery', price: 350, offer: 330, stock: 80, brand: 'Apple', cat: 'Computers & Laptops', sku: 'APPLE-IPADAIR-M2', type: 'BRAND' as const, specs: [['Display','10.9" Liquid Retina'],['Chip','M2'],['Storage','256GB'],['Camera','12MP Wide'],['Battery','10hrs']] },
    { name: 'Logitech MX Master 3S', desc: 'Wireless ergonomic mouse, 8000 DPI, USB-C, Bluetooth', price: 35, offer: 30, stock: 200, brand: 'Logitech', cat: 'Accessories', sku: 'LOGI-MXM3S', type: 'BRAND' as const, specs: [['Sensor','Darkfield 8000 DPI'],['Buttons','7'],['Connectivity','BT + USB'],['Battery','70 days'],['Weight','141g']] },
    { name: 'Corsair K70 RGB', desc: 'Mechanical gaming keyboard, Cherry MX Red, per-key RGB', price: 55, offer: 48, stock: 75, brand: 'Corsair', cat: 'Accessories', sku: 'COR-K70RGB', type: 'BRAND' as const, specs: [['Type','Mechanical'],['Switch','Cherry MX Red'],['Layout','Full'],['Backlight','Per-key RGB'],['Connectivity','USB'],['Weight','1.08kg']] },
    { name: 'LG UltraGear 27GP850', desc: '27" 4K IPS gaming monitor, 144Hz, 1ms, HDR600', price: 280, offer: 260, stock: 25, brand: 'Samsung', cat: 'Monitors & Displays', sku: 'LG-27GP850', type: 'BRAND' as const, specs: [['Size','27"'],['Resolution','4K UHD'],['Panel','Nano IPS'],['Refresh','165Hz'],['Response','1ms'],['HDR','HDR 600']] },
  ];

  // ─── Products — Auto Spare Parts ───
  const spareParts = [
    { name: 'Front Brake Pad Set', desc: 'High-performance front brake pads for Toyota Camry 2020-2024', price: 45, offer: 40, stock: 200, brand: 'Brembo', cat: 'Brakes', sku: 'BRK-F001-CAMRY', type: 'SPAREPART' as const, specs: [['Fitment','Toyota Camry 2020-2024'],['Position','Front'],['Material','Semi-Metallic'],['Thickness','12mm'],['Warranty','2 years']] },
    { name: 'Front Brake Disc Rotor', desc: 'OEM front brake disc for Toyota Camry', price: 65, offer: 58, stock: 100, brand: 'Toyota OEM', cat: 'Brakes', sku: 'BRK-D002-CAMRY', type: 'SPAREPART' as const, specs: [['Fitment','Toyota Camry 2020-2024'],['Position','Front'],['Diameter','296mm'],['Type','Vented'],['OEM','Yes']] },
    { name: 'Rear Brake Pad Set', desc: 'Premium rear brake pads for Toyota Camry', price: 38, offer: 34, stock: 150, brand: 'TRW', cat: 'Brakes', sku: 'BRK-R003-CAMRY', type: 'SPAREPART' as const, specs: [['Fitment','Toyota Camry 2020-2024'],['Position','Rear'],['Material','Ceramic'],['Warranty','18 months']] },
    { name: 'Oil Filter', desc: 'Engine oil filter for Toyota 2.5L engines', price: 8, offer: 7, stock: 500, brand: 'Mann', cat: 'Engine Parts', sku: 'ENG-OF01-TOYOTA', type: 'SPAREPART' as const, specs: [['Fitment','Toyota 2.5L 2018-2024'],['Type','Spin-on'],['Height','80mm'],['Thread','M20x1.5']] },
    { name: 'Air Filter', desc: 'High-flow air filter for Toyota Camry', price: 22, offer: 19, stock: 300, brand: 'K&N', cat: 'Engine Parts', sku: 'ENG-AF02-CAMRY', type: 'SPAREPART' as const, specs: [['Fitment','Toyota Camry 2018-2024'],['Type','Panel'],['Material','Cotton Gauze'],['Washable','Yes']] },
    { name: 'Spark Plug Set (4)', desc: 'Iridium spark plugs for Toyota 4-cylinder', price: 32, offer: 28, stock: 250, brand: 'NGK', cat: 'Engine Parts', sku: 'ENG-SP03-TOYOTA', type: 'SPAREPART' as const, specs: [['Fitment','Toyota 2.5L 2020-2024'],['Type','Iridium'],['Gap','0.8mm'],['Quantity','4 pcs'],['OEM','Yes']] },
    { name: 'Timing Belt Kit', desc: 'Complete timing belt kit with water pump and tensioner', price: 85, offer: 75, stock: 80, brand: 'Gates', cat: 'Engine Parts', sku: 'ENG-TB04-TOYOTA', type: 'SPAREPART' as const, specs: [['Fitment','Toyota 2.5L 2018-2024'],['Includes','Belt, Tensioner, Water Pump, Seals'],['Warranty','3 years']] },
    { name: 'Alternator', desc: '12V 100A alternator for Toyota Camry', price: 180, offer: 165, stock: 40, brand: 'Denso', cat: 'Electrical & Lighting', sku: 'ELC-AL01-CAMRY', type: 'SPAREPART' as const, specs: [['Fitment','Toyota Camry 2020-2024'],['Voltage','12V'],['Amperage','100A'],['OEM','Yes']] },
    { name: 'Front Shock Absorber', desc: 'Gas-filled front shock absorber for Toyota Camry', price: 55, offer: 48, stock: 120, brand: 'KYB', cat: 'Suspension & Steering', sku: 'SUS-SH01-CAMRY', type: 'SPAREPART' as const, specs: [['Fitment','Toyota Camry 2020-2024'],['Position','Front'],['Type','Gas-filled'],['Length','520mm']] },
    { name: 'Radiator', desc: 'Aluminum radiator for Toyota Camry 2.5L', price: 140, offer: 125, stock: 35, brand: 'Bosch', cat: 'Cooling System', sku: 'COL-RD01-CAMRY', type: 'SPAREPART' as const, specs: [['Fitment','Toyota Camry 2020-2024'],['Material','Aluminum'],['Core Size','650x400mm'],['Type','Crossflow']] },
    { name: 'Water Pump', desc: 'OEM water pump for Toyota 2.5L engine', price: 65, offer: 58, stock: 60, brand: 'Toyota OEM', cat: 'Cooling System', sku: 'COL-WP02-CAMRY', type: 'SPAREPART' as const, specs: [['Fitment','Toyota 2.5L 2020-2024'],['Type','Mechanical'],['OEM','Yes'],['Warranty','2 years']] },
    { name: 'Clutch Kit', desc: 'Complete clutch kit for Toyota Camry manual transmission', price: 250, offer: 220, stock: 25, brand: 'LuK', cat: 'Transmission', sku: 'TRN-CK01-CAMRY', type: 'SPAREPART' as const, specs: [['Fitment','Toyota Camry 2020-2024 MT'],['Includes','Disc, Pressure Plate, Release Bearing'],['Warranty','2 years']] },
  ];

  const allProducts = [...electronics, ...spareParts];

  for (const p of allProducts) {
    const catId = catMap[p.cat] ?? null;
    const brandId = brandMap[p.brand] ?? null;

    const product = await prisma.product.create({
      data: {
        productName: p.name,
        description: p.desc,
        specification: JSON.stringify(p.specs),
        status: 'ACTIVE',
        adminId: sellerId,
        userId: sellerId,
        skuNo: p.sku,
        productPrice: p.price,
        offerPrice: p.offer,
        categoryId: catId,
        brandId: brandId,
        typeOfProduct: p.type as any,
        productType: p.type === 'SPAREPART' ? 'P' : 'P',
      },
    });

    // ProductPrice (multi-seller)
    await prisma.productPrice.create({
      data: {
        productId: product.id,
        adminId: sellerId,
        productPrice: p.price,
        offerPrice: p.offer,
        stock: p.stock,
        status: 'ACTIVE',
        sellType: 'NORMALSELL',
      },
    });

    // Specs
    for (const [label, value] of p.specs) {
      await prisma.productSpecification.create({
        data: {
          productId: product.id,
          label,
          specification: value,
        },
      });
    }

    console.log(`  ✅ ${p.type === 'SPAREPART' ? '🔧' : '📦'} ${p.name} (id: ${product.id}, ${p.offer} OMR, stock: ${p.stock})`);
  }

  console.log(`\n═══ Seeding Complete ═══`);
  console.log(`  Categories: ${Object.keys(catMap).length}`);
  console.log(`  Brands: ${Object.keys(brandMap).length}`);
  console.log(`  Products: ${allProducts.length} (${electronics.length} electronics + ${spareParts.length} spare parts)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
