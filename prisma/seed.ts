import { PrismaClient, Status, TypeTrader, LoginType, SpecDataType, ProductType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────
// Helper: upsert a category by name + parentId combo
// ─────────────────────────────────────────────────────────
async function upsertCategory(
  name: string,
  parentId: number | null,
  icon?: string,
): Promise<number> {
  // Look for an existing category with the same name and parentId
  const existing = await prisma.category.findFirst({
    where: { name, parentId, deletedAt: null },
  });

  if (existing) {
    console.log(`  [skip] Category "${name}" already exists (id=${existing.id})`);
    return existing.id;
  }

  const created = await prisma.category.create({
    data: {
      name,
      parentId,
      status: Status.ACTIVE,
      icon: icon ?? null,
    },
  });
  console.log(`  [new]  Category "${name}" created (id=${created.id})`);
  return created.id;
}

// ─────────────────────────────────────────────────────────
// 1. SEED CATEGORIES
// ─────────────────────────────────────────────────────────
interface CategoryTree {
  [rootName: string]: {
    icon?: string;
    children: {
      [midName: string]: string[]; // leaf names
    };
  };
}

const CATEGORY_TREE: CategoryTree = {
  Electronics: {
    icon: 'electronics',
    children: {
      'Phones & Accessories': ['Smartphones', 'Phone Cases', 'Chargers'],
      Computers: ['Laptops', 'Desktops', 'Tablets'],
      Audio: ['Headphones', 'Speakers', 'Microphones'],
    },
  },
  Fashion: {
    icon: 'fashion',
    children: {
      "Men's Clothing": ['T-Shirts', 'Shirts', 'Pants', 'Jackets'],
      "Women's Clothing": ['Dresses', 'Tops', 'Skirts'],
      Shoes: ["Men's Shoes", "Women's Shoes", 'Sports Shoes'],
    },
  },
  'Home & Garden': {
    icon: 'home',
    children: {
      Furniture: ['Living Room', 'Bedroom', 'Kitchen'],
      Kitchen: ['Cookware', 'Appliances', 'Storage'],
    },
  },
  'Beauty & Health': {
    icon: 'beauty',
    children: {
      Skincare: [],
      Haircare: [],
      Makeup: [],
    },
  },
  'Sports & Outdoors': {
    icon: 'sports',
    children: {
      Fitness: [],
      Camping: [],
      'Team Sports': [],
    },
  },
  Automotive: {
    icon: 'automotive',
    children: {
      'Car Parts': [],
      'Car Electronics': [],
      Accessories: [],
    },
  },
  'Office & School': {
    icon: 'office',
    children: {
      Stationery: [],
      Supplies: [],
      Furniture: [],
    },
  },
};

// Store category IDs by their full path for later reference
const categoryIds: Record<string, number> = {};

async function seedCategories(): Promise<void> {
  console.log('\n--- Seeding Categories ---');
  for (const [rootName, rootData] of Object.entries(CATEGORY_TREE)) {
    const rootId = await upsertCategory(rootName, null, rootData.icon);
    categoryIds[rootName] = rootId;

    for (const [midName, leaves] of Object.entries(rootData.children)) {
      const midId = await upsertCategory(midName, rootId);
      categoryIds[`${rootName}/${midName}`] = midId;

      if (leaves.length === 0) {
        // The mid-level IS the leaf (e.g. Beauty & Health > Skincare)
        categoryIds[`${rootName}/${midName}/__leaf`] = midId;
      }

      for (const leafName of leaves) {
        const leafId = await upsertCategory(leafName, midId);
        categoryIds[`${rootName}/${midName}/${leafName}`] = leafId;
      }
    }
  }
  console.log(`  Total category paths tracked: ${Object.keys(categoryIds).length}`);
}

// ─────────────────────────────────────────────────────────
// 2. SEED CATEGORY KEYWORDS
// ─────────────────────────────────────────────────────────
interface KeywordMap {
  [categoryPath: string]: string[];
}

const CATEGORY_KEYWORDS: KeywordMap = {
  // Electronics > Phones & Accessories > ...
  'Electronics/Phones & Accessories/Smartphones': [
    'smartphone', 'mobile phone', 'cell phone', 'android phone', 'iphone',
    'handset', '5G phone', 'unlocked phone',
  ],
  'Electronics/Phones & Accessories/Phone Cases': [
    'phone case', 'phone cover', 'mobile case', 'protective case',
    'silicone case', 'back cover', 'bumper case',
  ],
  'Electronics/Phones & Accessories/Chargers': [
    'phone charger', 'fast charger', 'wireless charger', 'USB charger',
    'type-c charger', 'charging cable', 'power adapter',
  ],
  // Electronics > Computers > ...
  'Electronics/Computers/Laptops': [
    'laptop', 'notebook', 'ultrabook', 'gaming laptop', 'chromebook',
    'macbook', 'business laptop', 'portable computer',
  ],
  'Electronics/Computers/Desktops': [
    'desktop computer', 'PC', 'tower PC', 'gaming PC', 'all-in-one',
    'workstation', 'mini PC',
  ],
  'Electronics/Computers/Tablets': [
    'tablet', 'iPad', 'android tablet', 'drawing tablet',
    'e-reader', 'tablet PC', 'convertible tablet',
  ],
  // Electronics > Audio > ...
  'Electronics/Audio/Headphones': [
    'headphones', 'earphones', 'earbuds', 'wireless headphones',
    'bluetooth headphones', 'noise cancelling', 'over-ear headphones', 'in-ear',
  ],
  'Electronics/Audio/Speakers': [
    'speaker', 'bluetooth speaker', 'portable speaker', 'smart speaker',
    'soundbar', 'wireless speaker', 'home speaker',
  ],
  'Electronics/Audio/Microphones': [
    'microphone', 'condenser mic', 'USB microphone', 'wireless mic',
    'lavalier mic', 'studio microphone', 'podcast mic',
  ],
  // Fashion > Men's Clothing > ...
  "Fashion/Men's Clothing/T-Shirts": [
    "men's t-shirt", 'graphic tee', 'cotton tshirt', 'crew neck',
    'v-neck shirt', 'casual tee', 'printed t-shirt',
  ],
  "Fashion/Men's Clothing/Shirts": [
    "men's shirt", 'dress shirt', 'button-down', 'formal shirt',
    'oxford shirt', 'casual shirt', 'flannel shirt',
  ],
  "Fashion/Men's Clothing/Pants": [
    "men's pants", 'trousers', 'chinos', 'jeans', 'cargo pants',
    'dress pants', 'casual pants',
  ],
  "Fashion/Men's Clothing/Jackets": [
    "men's jacket", 'bomber jacket', 'denim jacket', 'leather jacket',
    'windbreaker', 'blazer', 'winter jacket',
  ],
  // Fashion > Women's Clothing > ...
  "Fashion/Women's Clothing/Dresses": [
    "women's dress", 'maxi dress', 'mini dress', 'summer dress',
    'cocktail dress', 'casual dress', 'evening gown',
  ],
  "Fashion/Women's Clothing/Tops": [
    "women's top", 'blouse', 'crop top', 'tank top',
    'camisole', 'tunic', 'women shirt',
  ],
  "Fashion/Women's Clothing/Skirts": [
    'skirt', 'mini skirt', 'maxi skirt', 'pencil skirt',
    'pleated skirt', 'a-line skirt', 'denim skirt',
  ],
  // Fashion > Shoes > ...
  "Fashion/Shoes/Men's Shoes": [
    "men's shoes", 'oxford shoes', 'loafers', 'boots',
    'sneakers men', 'formal shoes', 'casual shoes men',
  ],
  "Fashion/Shoes/Women's Shoes": [
    "women's shoes", 'heels', 'flats', 'sandals women',
    'pumps', 'wedges', 'women boots',
  ],
  'Fashion/Shoes/Sports Shoes': [
    'sports shoes', 'running shoes', 'athletic shoes', 'training shoes',
    'gym shoes', 'sneakers', 'cross-training',
  ],
  // Home & Garden > Furniture > ...
  'Home & Garden/Furniture/Living Room': [
    'sofa', 'couch', 'coffee table', 'TV stand',
    'bookshelf', 'armchair', 'living room set',
  ],
  'Home & Garden/Furniture/Bedroom': [
    'bed frame', 'mattress', 'nightstand', 'wardrobe',
    'dresser', 'bed set', 'bedroom furniture',
  ],
  'Home & Garden/Furniture/Kitchen': [
    'dining table', 'kitchen island', 'bar stool',
    'kitchen cabinet', 'pantry shelf', 'kitchen cart',
  ],
  // Home & Garden > Kitchen > ...
  'Home & Garden/Kitchen/Cookware': [
    'cookware', 'frying pan', 'saucepan', 'pot set',
    'wok', 'baking sheet', 'cast iron',
  ],
  'Home & Garden/Kitchen/Appliances': [
    'kitchen appliance', 'blender', 'toaster', 'coffee maker',
    'air fryer', 'food processor', 'microwave',
  ],
  'Home & Garden/Kitchen/Storage': [
    'food storage', 'container set', 'spice rack', 'pantry organizer',
    'kitchen storage', 'jar set', 'airtight container',
  ],
  // Beauty & Health (mid-level is leaf)
  'Beauty & Health/Skincare': [
    'skincare', 'face cream', 'moisturizer', 'serum', 'sunscreen',
    'cleanser', 'face wash', 'anti-aging',
  ],
  'Beauty & Health/Haircare': [
    'shampoo', 'conditioner', 'hair mask', 'hair oil',
    'hair treatment', 'hair serum', 'haircare',
  ],
  'Beauty & Health/Makeup': [
    'makeup', 'lipstick', 'foundation', 'mascara',
    'eyeshadow', 'concealer', 'blush', 'cosmetics',
  ],
  // Sports & Outdoors
  'Sports & Outdoors/Fitness': [
    'dumbbells', 'yoga mat', 'resistance bands', 'treadmill',
    'fitness equipment', 'exercise bike', 'kettlebell',
  ],
  'Sports & Outdoors/Camping': [
    'tent', 'sleeping bag', 'camping stove', 'hiking backpack',
    'camping gear', 'lantern', 'camping chair',
  ],
  'Sports & Outdoors/Team Sports': [
    'soccer ball', 'basketball', 'volleyball', 'cricket bat',
    'team jersey', 'football', 'hockey stick',
  ],
  // Automotive
  'Automotive/Car Parts': [
    'brake pad', 'oil filter', 'spark plug', 'alternator',
    'car battery', 'radiator', 'auto parts',
  ],
  'Automotive/Car Electronics': [
    'dash cam', 'car stereo', 'GPS navigator', 'car camera',
    'car LED', 'OBD scanner', 'car electronics',
  ],
  'Automotive/Accessories': [
    'car seat cover', 'floor mat', 'steering wheel cover', 'car freshener',
    'phone mount', 'car organizer', 'car accessory',
  ],
  // Office & School
  'Office & School/Stationery': [
    'pen', 'notebook', 'pencil', 'marker', 'highlighter',
    'stationery set', 'writing supplies',
  ],
  'Office & School/Supplies': [
    'paper clips', 'stapler', 'tape dispenser', 'file folder',
    'binder', 'office supplies', 'desk organizer',
  ],
  'Office & School/Furniture': [
    'office desk', 'office chair', 'bookcase', 'filing cabinet',
    'standing desk', 'ergonomic chair', 'desk lamp',
  ],
};

async function seedCategoryKeywords(): Promise<void> {
  console.log('\n--- Seeding Category Keywords ---');
  let totalCreated = 0;

  for (const [path, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    // Resolve the category id. For mid-level-as-leaf, try with /__leaf suffix first
    let catId = categoryIds[path] ?? categoryIds[`${path}/__leaf`];
    if (!catId) {
      console.warn(`  [warn] Category path "${path}" not found, skipping keywords`);
      continue;
    }

    for (const keyword of keywords) {
      try {
        await prisma.categoryKeyword.upsert({
          where: { categoryId_keyword: { categoryId: catId, keyword } },
          update: {},
          create: { categoryId: catId, keyword, status: Status.ACTIVE },
        });
        totalCreated++;
      } catch (e: any) {
        // Skip duplicates silently
        if (!e.message?.includes('Unique constraint')) {
          console.warn(`  [warn] keyword "${keyword}" for path "${path}": ${e.message}`);
        }
      }
    }
    console.log(`  Keywords for "${path}": ${keywords.length}`);
  }
  console.log(`  Total keywords upserted: ${totalCreated}`);
}

// ─────────────────────────────────────────────────────────
// 3. SEED SPEC TEMPLATES
// ─────────────────────────────────────────────────────────
interface SpecDef {
  name: string;
  key: string;
  dataType: SpecDataType;
  unit?: string;
  options?: string[];
  isRequired?: boolean;
  groupName?: string;
}

interface SpecTemplateCfg {
  categoryPath: string;
  specs: SpecDef[];
}

const SPEC_TEMPLATES: SpecTemplateCfg[] = [
  {
    categoryPath: 'Electronics/Phones & Accessories/Smartphones',
    specs: [
      { name: 'Screen Size', key: 'screen_size', dataType: SpecDataType.NUMBER, unit: 'inches', isRequired: true, groupName: 'Display' },
      { name: 'RAM', key: 'ram', dataType: SpecDataType.SELECT, options: ['4GB', '6GB', '8GB', '12GB', '16GB'], isRequired: true, groupName: 'Performance' },
      { name: 'Storage', key: 'storage', dataType: SpecDataType.SELECT, options: ['64GB', '128GB', '256GB', '512GB', '1TB'], isRequired: true, groupName: 'Performance' },
      { name: 'Battery', key: 'battery', dataType: SpecDataType.NUMBER, unit: 'mAh', isRequired: true, groupName: 'Battery' },
      { name: 'OS', key: 'os', dataType: SpecDataType.SELECT, options: ['Android', 'iOS'], isRequired: true, groupName: 'Software' },
      { name: 'Camera', key: 'camera', dataType: SpecDataType.TEXT, groupName: 'Camera' },
      { name: 'Weight', key: 'weight', dataType: SpecDataType.NUMBER, unit: 'g', groupName: 'Physical' },
    ],
  },
  {
    categoryPath: 'Electronics/Computers/Laptops',
    specs: [
      { name: 'Screen Size', key: 'screen_size', dataType: SpecDataType.NUMBER, unit: 'inches', isRequired: true, groupName: 'Display' },
      { name: 'RAM', key: 'ram', dataType: SpecDataType.SELECT, options: ['8GB', '16GB', '32GB', '64GB'], isRequired: true, groupName: 'Performance' },
      { name: 'Storage', key: 'storage', dataType: SpecDataType.SELECT, options: ['256GB', '512GB', '1TB', '2TB'], isRequired: true, groupName: 'Performance' },
      { name: 'Processor', key: 'processor', dataType: SpecDataType.TEXT, isRequired: true, groupName: 'Performance' },
      { name: 'GPU', key: 'gpu', dataType: SpecDataType.TEXT, groupName: 'Performance' },
      { name: 'Battery Life', key: 'battery_life', dataType: SpecDataType.NUMBER, unit: 'hours', groupName: 'Battery' },
      { name: 'Weight', key: 'weight', dataType: SpecDataType.NUMBER, unit: 'kg', groupName: 'Physical' },
    ],
  },
  {
    categoryPath: 'Electronics/Audio/Headphones',
    specs: [
      { name: 'Type', key: 'type', dataType: SpecDataType.SELECT, options: ['Over-ear', 'On-ear', 'In-ear', 'Earbuds'], isRequired: true, groupName: 'Design' },
      { name: 'Connectivity', key: 'connectivity', dataType: SpecDataType.SELECT, options: ['Wired', 'Bluetooth', 'Both'], isRequired: true, groupName: 'Connectivity' },
      { name: 'Battery Life', key: 'battery_life', dataType: SpecDataType.NUMBER, unit: 'hours', groupName: 'Battery' },
      { name: 'Driver Size', key: 'driver_size', dataType: SpecDataType.NUMBER, unit: 'mm', groupName: 'Audio' },
      { name: 'Noise Cancellation', key: 'noise_cancellation', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
    ],
  },
];

// We store specTemplate IDs keyed by "categoryPath/key" for product spec values
const specTemplateIds: Record<string, number> = {};

async function seedSpecTemplates(): Promise<void> {
  console.log('\n--- Seeding Spec Templates ---');

  for (const cfg of SPEC_TEMPLATES) {
    const catId = categoryIds[cfg.categoryPath];
    if (!catId) {
      console.warn(`  [warn] Category "${cfg.categoryPath}" not found, skipping spec templates`);
      continue;
    }

    console.log(`  Spec templates for "${cfg.categoryPath}" (catId=${catId}):`);
    for (let i = 0; i < cfg.specs.length; i++) {
      const spec = cfg.specs[i];
      const template = await prisma.specTemplate.upsert({
        where: { categoryId_key: { categoryId: catId, key: spec.key } },
        update: {
          name: spec.name,
          dataType: spec.dataType,
          unit: spec.unit ?? null,
          options: spec.options ? JSON.parse(JSON.stringify(spec.options)) : undefined,
          isRequired: spec.isRequired ?? false,
          isFilterable: true,
          sortOrder: i,
          groupName: spec.groupName ?? null,
          status: Status.ACTIVE,
        },
        create: {
          categoryId: catId,
          name: spec.name,
          key: spec.key,
          dataType: spec.dataType,
          unit: spec.unit ?? null,
          options: spec.options ? JSON.parse(JSON.stringify(spec.options)) : undefined,
          isRequired: spec.isRequired ?? false,
          isFilterable: true,
          sortOrder: i,
          groupName: spec.groupName ?? null,
          status: Status.ACTIVE,
        },
      });
      specTemplateIds[`${cfg.categoryPath}/${spec.key}`] = template.id;
      console.log(`    [upsert] "${spec.name}" (key=${spec.key}, id=${template.id})`);
    }
  }
}

// ─────────────────────────────────────────────────────────
// 4. SEED TEST USERS
// ─────────────────────────────────────────────────────────
async function seedUsers(): Promise<{ sellerId: number; buyerId: number }> {
  console.log('\n--- Seeding Test Users ---');
  const passwordHash = await bcrypt.hash('Test123!', 10);

  // Create MasterAccount for seller
  const sellerMaster = await prisma.masterAccount.upsert({
    where: { email: 'seller@test.com' },
    update: { password: passwordHash },
    create: {
      email: 'seller@test.com',
      password: passwordHash,
      firstName: 'Test',
      lastName: 'Seller',
      phoneNumber: '+1234567890',
      cc: '+1',
    },
  });

  const seller = await prisma.user.upsert({
    where: { email: 'seller@test.com' },
    update: {
      firstName: 'Test',
      lastName: 'Seller',
      password: passwordHash,
      tradeRole: TypeTrader.COMPANY,
      loginType: LoginType.MANUAL,
      status: Status.ACTIVE,
      masterAccountId: sellerMaster.id,
      isCurrent: true,
    },
    create: {
      email: 'seller@test.com',
      firstName: 'Test',
      lastName: 'Seller',
      password: passwordHash,
      tradeRole: TypeTrader.COMPANY,
      loginType: LoginType.MANUAL,
      status: Status.ACTIVE,
      masterAccountId: sellerMaster.id,
      isCurrent: true,
    },
  });

  // Link MasterAccount to last active user
  await prisma.masterAccount.update({
    where: { id: sellerMaster.id },
    data: { lastActiveUserId: seller.id },
  });
  console.log(`  Seller: masterAccount=${sellerMaster.id}, user=${seller.id}, email=${seller.email}`);

  // Create MasterAccount for buyer
  const buyerMaster = await prisma.masterAccount.upsert({
    where: { email: 'buyer@test.com' },
    update: { password: passwordHash },
    create: {
      email: 'buyer@test.com',
      password: passwordHash,
      firstName: 'Test',
      lastName: 'Buyer',
      phoneNumber: '+1234567891',
      cc: '+1',
    },
  });

  const buyer = await prisma.user.upsert({
    where: { email: 'buyer@test.com' },
    update: {
      firstName: 'Test',
      lastName: 'Buyer',
      password: passwordHash,
      tradeRole: TypeTrader.BUYER,
      loginType: LoginType.MANUAL,
      status: Status.ACTIVE,
      masterAccountId: buyerMaster.id,
      isCurrent: true,
    },
    create: {
      email: 'buyer@test.com',
      firstName: 'Test',
      lastName: 'Buyer',
      password: passwordHash,
      tradeRole: TypeTrader.BUYER,
      loginType: LoginType.MANUAL,
      status: Status.ACTIVE,
      masterAccountId: buyerMaster.id,
      isCurrent: true,
    },
  });

  await prisma.masterAccount.update({
    where: { id: buyerMaster.id },
    data: { lastActiveUserId: buyer.id },
  });
  console.log(`  Buyer:  masterAccount=${buyerMaster.id}, user=${buyer.id}, email=${buyer.email}`);

  return { sellerId: seller.id, buyerId: buyer.id };
}

// ─────────────────────────────────────────────────────────
// 5. SEED SAMPLE PRODUCTS
// ─────────────────────────────────────────────────────────
interface ProductSeed {
  productName: string;
  skuNo: string;
  productPrice: number;
  offerPrice: number;
  description: string;
  categoryPath: string; // used to look up categoryId
  productType: ProductType;
  images: string[];
  specValues?: Record<string, { value: string; numericValue?: number }>;
}

const SAMPLE_PRODUCTS: ProductSeed[] = [
  {
    productName: 'ProMax Ultra Smartphone 256GB',
    skuNo: 'SEED-PHONE-001',
    productPrice: 999.99,
    offerPrice: 899.99,
    description: 'Flagship smartphone with 6.7" AMOLED display, 12GB RAM, 256GB storage, 5000mAh battery, and 108MP triple camera system.',
    categoryPath: 'Electronics/Phones & Accessories/Smartphones',
    productType: ProductType.P,
    images: [
      'https://placehold.co/600x400?text=Smartphone+Front',
      'https://placehold.co/600x400?text=Smartphone+Back',
      'https://placehold.co/600x400?text=Smartphone+Side',
    ],
    specValues: {
      screen_size: { value: '6.7', numericValue: 6.7 },
      ram: { value: '12GB' },
      storage: { value: '256GB' },
      battery: { value: '5000', numericValue: 5000 },
      os: { value: 'Android' },
      camera: { value: '108MP + 12MP + 5MP Triple Camera' },
      weight: { value: '195', numericValue: 195 },
    },
  },
  {
    productName: 'EcoLite Budget Smartphone 64GB',
    skuNo: 'SEED-PHONE-002',
    productPrice: 299.99,
    offerPrice: 249.99,
    description: 'Affordable smartphone with 6.1" LCD, 4GB RAM, 64GB storage, and all-day battery life.',
    categoryPath: 'Electronics/Phones & Accessories/Smartphones',
    productType: ProductType.P,
    images: [
      'https://placehold.co/600x400?text=Budget+Phone+Front',
      'https://placehold.co/600x400?text=Budget+Phone+Back',
    ],
    specValues: {
      screen_size: { value: '6.1', numericValue: 6.1 },
      ram: { value: '4GB' },
      storage: { value: '64GB' },
      battery: { value: '4000', numericValue: 4000 },
      os: { value: 'Android' },
      camera: { value: '48MP + 2MP Dual Camera' },
      weight: { value: '175', numericValue: 175 },
    },
  },
  {
    productName: 'SwiftBook Pro 15 Laptop',
    skuNo: 'SEED-LAPTOP-001',
    productPrice: 1499.99,
    offerPrice: 1349.99,
    description: 'Professional laptop with 15.6" 4K display, Intel i7 processor, 32GB RAM, 1TB SSD, and dedicated NVIDIA GPU.',
    categoryPath: 'Electronics/Computers/Laptops',
    productType: ProductType.P,
    images: [
      'https://placehold.co/600x400?text=Laptop+Open',
      'https://placehold.co/600x400?text=Laptop+Closed',
      'https://placehold.co/600x400?text=Laptop+Side',
    ],
    specValues: {
      screen_size: { value: '15.6', numericValue: 15.6 },
      ram: { value: '32GB' },
      storage: { value: '1TB' },
      processor: { value: 'Intel Core i7-13700H' },
      gpu: { value: 'NVIDIA RTX 4060 8GB' },
      battery_life: { value: '10', numericValue: 10 },
      weight: { value: '1.8', numericValue: 1.8 },
    },
  },
  {
    productName: 'SoundPro ANC Over-Ear Headphones',
    skuNo: 'SEED-AUDIO-001',
    productPrice: 249.99,
    offerPrice: 199.99,
    description: 'Premium wireless over-ear headphones with active noise cancellation, 40mm drivers, and 30-hour battery life.',
    categoryPath: 'Electronics/Audio/Headphones',
    productType: ProductType.P,
    images: [
      'https://placehold.co/600x400?text=Headphones+Front',
      'https://placehold.co/600x400?text=Headphones+Folded',
    ],
    specValues: {
      type: { value: 'Over-ear' },
      connectivity: { value: 'Bluetooth' },
      battery_life: { value: '30', numericValue: 30 },
      driver_size: { value: '40', numericValue: 40 },
      noise_cancellation: { value: 'true' },
    },
  },
  {
    productName: 'Classic Fit Cotton T-Shirt',
    skuNo: 'SEED-FASHION-001',
    productPrice: 29.99,
    offerPrice: 24.99,
    description: 'Comfortable 100% cotton crew neck t-shirt. Available in multiple colors. Perfect for everyday casual wear.',
    categoryPath: "Fashion/Men's Clothing/T-Shirts",
    productType: ProductType.P,
    images: [
      'https://placehold.co/600x400?text=T-Shirt+Front',
      'https://placehold.co/600x400?text=T-Shirt+Back',
    ],
  },
  {
    productName: 'Elegance Maxi Dress',
    skuNo: 'SEED-FASHION-002',
    productPrice: 89.99,
    offerPrice: 69.99,
    description: 'Flowing maxi dress with floral pattern, ideal for summer occasions. Lightweight breathable fabric.',
    categoryPath: "Fashion/Women's Clothing/Dresses",
    productType: ProductType.P,
    images: [
      'https://placehold.co/600x400?text=Dress+Front',
      'https://placehold.co/600x400?text=Dress+Side',
    ],
  },
  {
    productName: 'ErgoComfort Office Chair',
    skuNo: 'SEED-HOME-001',
    productPrice: 399.99,
    offerPrice: 349.99,
    description: 'Ergonomic office chair with lumbar support, adjustable armrests, breathable mesh back, and 360-degree swivel.',
    categoryPath: 'Office & School/Furniture',
    productType: ProductType.P,
    images: [
      'https://placehold.co/600x400?text=Office+Chair+Front',
      'https://placehold.co/600x400?text=Office+Chair+Side',
    ],
  },
  {
    productName: 'ProRunner Sports Shoes',
    skuNo: 'SEED-SHOES-001',
    productPrice: 129.99,
    offerPrice: 109.99,
    description: 'Lightweight running shoes with responsive cushioning, breathable mesh upper, and durable rubber outsole.',
    categoryPath: 'Fashion/Shoes/Sports Shoes',
    productType: ProductType.P,
    images: [
      'https://placehold.co/600x400?text=Sports+Shoes+Side',
      'https://placehold.co/600x400?text=Sports+Shoes+Top',
    ],
  },
  {
    productName: 'GlowUp Skincare Essentials Kit',
    skuNo: 'SEED-BEAUTY-001',
    productPrice: 59.99,
    offerPrice: 49.99,
    description: 'Complete skincare kit including cleanser, toner, moisturizer, and serum. Suitable for all skin types.',
    categoryPath: 'Beauty & Health/Skincare',
    productType: ProductType.P,
    images: [
      'https://placehold.co/600x400?text=Skincare+Kit',
      'https://placehold.co/600x400?text=Skincare+Products',
    ],
  },
  {
    productName: 'TurboAir 360 Digital Air Fryer',
    skuNo: 'SEED-KITCHEN-001',
    productPrice: 149.99,
    offerPrice: 119.99,
    description: 'Digital air fryer with 5.8QT capacity, 8 preset cooking programs, non-stick basket, and rapid air technology.',
    categoryPath: 'Home & Garden/Kitchen/Appliances',
    productType: ProductType.P,
    images: [
      'https://placehold.co/600x400?text=Air+Fryer+Front',
      'https://placehold.co/600x400?text=Air+Fryer+Open',
    ],
  },
];

async function seedProducts(sellerId: number): Promise<void> {
  console.log('\n--- Seeding Sample Products ---');

  for (const p of SAMPLE_PRODUCTS) {
    // Resolve category: try full path first, then mid-level leaf fallback
    let catId = categoryIds[p.categoryPath] ?? categoryIds[`${p.categoryPath}/__leaf`];
    if (!catId) {
      console.warn(`  [warn] Category "${p.categoryPath}" not found, skipping product "${p.productName}"`);
      continue;
    }

    // Upsert the product by unique skuNo
    let product = await prisma.product.findUnique({ where: { skuNo: p.skuNo } });
    if (product) {
      product = await prisma.product.update({
        where: { skuNo: p.skuNo },
        data: {
          productName: p.productName,
          categoryId: catId,
          productPrice: p.productPrice,
          offerPrice: p.offerPrice,
          description: p.description,
          status: Status.ACTIVE,
          userId: sellerId,
          productType: p.productType,
        },
      });
      console.log(`  [update] Product "${p.productName}" (id=${product.id})`);
    } else {
      product = await prisma.product.create({
        data: {
          productName: p.productName,
          skuNo: p.skuNo,
          categoryId: catId,
          productPrice: p.productPrice,
          offerPrice: p.offerPrice,
          description: p.description,
          status: Status.ACTIVE,
          userId: sellerId,
          productType: p.productType,
        },
      });
      console.log(`  [new]    Product "${p.productName}" (id=${product.id})`);
    }

    // Upsert product-category mapping (primary)
    await prisma.productCategoryMap.upsert({
      where: { productId_categoryId: { productId: product.id, categoryId: catId } },
      update: { isPrimary: true, source: 'manual', status: Status.ACTIVE },
      create: {
        productId: product.id,
        categoryId: catId,
        isPrimary: true,
        source: 'manual',
        status: Status.ACTIVE,
      },
    });

    // Seed product images
    // First delete existing seed images to avoid duplicates on re-run
    await prisma.productImages.deleteMany({
      where: {
        productId: product.id,
        image: { startsWith: 'https://placehold.co/' },
      },
    });
    for (const imgUrl of p.images) {
      await prisma.productImages.create({
        data: {
          productId: product.id,
          image: imgUrl,
          status: Status.ACTIVE,
        },
      });
    }
    console.log(`    Images: ${p.images.length}`);

    // Seed product spec values if applicable
    if (p.specValues) {
      for (const [specKey, specVal] of Object.entries(p.specValues)) {
        const templateKey = `${p.categoryPath}/${specKey}`;
        const templateId = specTemplateIds[templateKey];
        if (!templateId) {
          console.warn(`    [warn] SpecTemplate "${templateKey}" not found, skipping`);
          continue;
        }

        await prisma.productSpecValue.upsert({
          where: { productId_specTemplateId: { productId: product.id, specTemplateId: templateId } },
          update: {
            value: specVal.value,
            numericValue: specVal.numericValue ?? null,
            status: Status.ACTIVE,
          },
          create: {
            productId: product.id,
            specTemplateId: templateId,
            value: specVal.value,
            numericValue: specVal.numericValue ?? null,
            status: Status.ACTIVE,
          },
        });
      }
      console.log(`    Spec values: ${Object.keys(p.specValues).length}`);
    }
  }
}

// ─────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('========================================');
  console.log('  Ultrasooq Database Seed Script');
  console.log('========================================');

  // 1. Categories
  await seedCategories();

  // 2. Category Keywords
  await seedCategoryKeywords();

  // 3. Spec Templates
  await seedSpecTemplates();

  // 4. Users
  const { sellerId, buyerId } = await seedUsers();

  // 5. Products
  await seedProducts(sellerId);

  console.log('\n========================================');
  console.log('  Seed completed successfully!');
  console.log('========================================');
}

main()
  .catch((e) => {
    console.error('\nSeed failed with error:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
