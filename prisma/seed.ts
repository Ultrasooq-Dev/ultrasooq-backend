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
// 3. SEED TAGS (bottom-up: leaf-specific first)
// ─────────────────────────────────────────────────────────

// All unique tag names used across all leaf categories
const ALL_TAG_NAMES: string[] = [
  // Electronics
  'smartphone', '5g', 'touchscreen', 'dual-sim', 'fast-charging', 'high-resolution',
  'phone-case', 'protective', 'shockproof',
  'charger', 'wireless-charging', 'usb-c', 'portable',
  'laptop', 'ultrabook', 'gaming', 'high-performance',
  'desktop', 'workstation',
  'tablet', 'lightweight',
  'headphones', 'wireless', 'noise-cancelling', 'bluetooth',
  'speaker', 'smart-home',
  'microphone', 'usb', 'condenser', 'studio', 'podcast',
  // Fashion
  't-shirt', 'cotton', 'casual', 'breathable',
  'shirt', 'formal', 'slim-fit',
  'pants', 'stretch',
  'jacket', 'winter', 'waterproof', 'windbreaker', 'leather',
  'dress', 'summer', 'elegant',
  'top',
  'skirt',
  'mens-shoes', 'comfortable',
  'womens-shoes', 'heels', 'flats',
  'sports-shoes', 'running', 'cushioned',
  // Home & Garden
  'sofa', 'furniture', 'modern',
  'bed',
  'dining', 'compact',
  'cookware', 'non-stick', 'stainless-steel', 'durable',
  'appliance', 'energy-efficient',
  'storage', 'organizer', 'airtight',
  // Beauty & Health
  'skincare', 'organic', 'anti-aging', 'sensitive-skin', 'spf',
  'haircare', 'moisturizing', 'repair',
  'makeup', 'cosmetics', 'vegan', 'cruelty-free',
  // Sports & Outdoors
  'fitness', 'dumbbell', 'yoga', 'resistance', 'adjustable',
  'camping', 'outdoor',
  'team-sports', 'ball', 'jersey', 'equipment',
  // Automotive
  'car-parts', 'replacement', 'OEM',
  'car-electronics', 'dashcam', 'GPS', 'LED',
  'car-accessory', 'comfort', 'protection',
  // Office & School
  'stationery', 'pen', 'notebook', 'writing',
  'office-supplies', 'filing',
  'office-furniture', 'ergonomic', 'standing-desk',
];

// Store tag IDs keyed by tagName
const tagIds: Record<string, number> = {};

async function seedTags(): Promise<void> {
  console.log('\n--- Seeding Tags ---');

  // Deduplicate tag names
  const uniqueNames = [...new Set(ALL_TAG_NAMES)];

  for (const tagName of uniqueNames) {
    // Tags model has NO unique constraint on tagName, so use findFirst + create
    let existing = await prisma.tags.findFirst({
      where: { tagName, deletedAt: null },
    });

    if (existing) {
      tagIds[tagName] = existing.id;
      console.log(`  [skip] Tag "${tagName}" (id=${existing.id})`);
    } else {
      const created = await prisma.tags.create({
        data: { tagName, status: Status.ACTIVE },
      });
      tagIds[tagName] = created.id;
      console.log(`  [new]  Tag "${tagName}" (id=${created.id})`);
    }
  }

  console.log(`  Total unique tags: ${Object.keys(tagIds).length}`);
}

// ─────────────────────────────────────────────────────────
// 4. SEED CATEGORY TAGS (bottom-up aggregation)
// ─────────────────────────────────────────────────────────

// Leaf category → its specific tags
interface LeafTagMap {
  [categoryPath: string]: string[];
}

const LEAF_TAGS: LeafTagMap = {
  // Electronics leaves
  'Electronics/Phones & Accessories/Smartphones': ['smartphone', '5g', 'touchscreen', 'dual-sim', 'fast-charging', 'high-resolution'],
  'Electronics/Phones & Accessories/Phone Cases': ['phone-case', 'protective', 'shockproof', 'slim-fit'],
  'Electronics/Phones & Accessories/Chargers': ['charger', 'fast-charging', 'wireless-charging', 'usb-c', 'portable'],
  'Electronics/Computers/Laptops': ['laptop', 'ultrabook', 'gaming', 'high-performance', 'portable'],
  'Electronics/Computers/Desktops': ['desktop', 'gaming', 'workstation', 'high-performance'],
  'Electronics/Computers/Tablets': ['tablet', 'touchscreen', 'portable', 'lightweight'],
  'Electronics/Audio/Headphones': ['headphones', 'wireless', 'noise-cancelling', 'bluetooth'],
  'Electronics/Audio/Speakers': ['speaker', 'wireless', 'bluetooth', 'portable', 'smart-home'],
  'Electronics/Audio/Microphones': ['microphone', 'usb', 'condenser', 'studio', 'podcast'],
  // Fashion leaves
  "Fashion/Men's Clothing/T-Shirts": ['t-shirt', 'cotton', 'casual', 'breathable'],
  "Fashion/Men's Clothing/Shirts": ['shirt', 'formal', 'cotton', 'slim-fit'],
  "Fashion/Men's Clothing/Pants": ['pants', 'casual', 'formal', 'slim-fit', 'stretch'],
  "Fashion/Men's Clothing/Jackets": ['jacket', 'winter', 'waterproof', 'windbreaker', 'leather'],
  "Fashion/Women's Clothing/Dresses": ['dress', 'casual', 'formal', 'summer', 'elegant'],
  "Fashion/Women's Clothing/Tops": ['top', 'casual', 'cotton', 'breathable'],
  "Fashion/Women's Clothing/Skirts": ['skirt', 'casual', 'formal', 'cotton'],
  "Fashion/Shoes/Men's Shoes": ['mens-shoes', 'formal', 'leather', 'comfortable'],
  "Fashion/Shoes/Women's Shoes": ['womens-shoes', 'heels', 'flats', 'comfortable'],
  'Fashion/Shoes/Sports Shoes': ['sports-shoes', 'running', 'lightweight', 'breathable', 'cushioned'],
  // Home & Garden leaves
  'Home & Garden/Furniture/Living Room': ['sofa', 'furniture', 'modern', 'comfortable'],
  'Home & Garden/Furniture/Bedroom': ['bed', 'furniture', 'modern', 'comfortable'],
  'Home & Garden/Furniture/Kitchen': ['dining', 'furniture', 'modern', 'compact'],
  'Home & Garden/Kitchen/Cookware': ['cookware', 'non-stick', 'stainless-steel', 'durable'],
  'Home & Garden/Kitchen/Appliances': ['appliance', 'energy-efficient', 'smart-home', 'compact'],
  'Home & Garden/Kitchen/Storage': ['storage', 'organizer', 'compact', 'airtight'],
  // Beauty & Health leaves (mid-level-as-leaf)
  'Beauty & Health/Skincare': ['skincare', 'organic', 'anti-aging', 'sensitive-skin', 'spf'],
  'Beauty & Health/Haircare': ['haircare', 'organic', 'moisturizing', 'repair'],
  'Beauty & Health/Makeup': ['makeup', 'cosmetics', 'vegan', 'cruelty-free'],
  // Sports & Outdoors leaves (mid-level-as-leaf)
  'Sports & Outdoors/Fitness': ['fitness', 'dumbbell', 'yoga', 'resistance', 'adjustable'],
  'Sports & Outdoors/Camping': ['camping', 'outdoor', 'waterproof', 'portable', 'lightweight'],
  'Sports & Outdoors/Team Sports': ['team-sports', 'ball', 'jersey', 'equipment'],
  // Automotive leaves (mid-level-as-leaf)
  'Automotive/Car Parts': ['car-parts', 'replacement', 'durable', 'OEM'],
  'Automotive/Car Electronics': ['car-electronics', 'dashcam', 'GPS', 'LED'],
  'Automotive/Accessories': ['car-accessory', 'organizer', 'comfort', 'protection'],
  // Office & School leaves (mid-level-as-leaf)
  'Office & School/Stationery': ['stationery', 'pen', 'notebook', 'writing'],
  'Office & School/Supplies': ['office-supplies', 'organizer', 'filing', 'compact'],
  'Office & School/Furniture': ['office-furniture', 'ergonomic', 'standing-desk', 'adjustable'],
};

async function linkTagsToCategory(catId: number, tagNames: string[]): Promise<void> {
  for (const tagName of tagNames) {
    const tId = tagIds[tagName];
    if (!tId) {
      console.warn(`    [warn] Tag "${tagName}" not found in tagIds, skipping`);
      continue;
    }
    try {
      await prisma.categoryTag.upsert({
        where: { categoryId_tagId: { categoryId: catId, tagId: tId } },
        update: { status: Status.ACTIVE },
        create: { categoryId: catId, tagId: tId, status: Status.ACTIVE },
      });
    } catch (e: any) {
      if (!e.message?.includes('Unique constraint')) {
        console.warn(`    [warn] CategoryTag cat=${catId} tag=${tId}: ${e.message}`);
      }
    }
  }
}

async function seedCategoryTags(): Promise<void> {
  console.log('\n--- Seeding Category Tags (Bottom-Up) ---');

  // ── Step 1: Assign tags to every leaf category ──
  console.log('  Step 1: Linking tags to leaf categories...');
  // Collect which tag names each mid/root inherits
  // midTagSets: key = "Root/Mid", value = Set of tag names
  const midTagSets: Record<string, Set<string>> = {};
  // rootTagSets: key = "Root", value = Set of tag names
  const rootTagSets: Record<string, Set<string>> = {};

  for (const [leafPath, leafTagNames] of Object.entries(LEAF_TAGS)) {
    const catId = categoryIds[leafPath] ?? categoryIds[`${leafPath}/__leaf`];
    if (!catId) {
      console.warn(`  [warn] Leaf "${leafPath}" not found, skipping`);
      continue;
    }

    await linkTagsToCategory(catId, leafTagNames);
    console.log(`    Leaf "${leafPath}": ${leafTagNames.length} tags`);

    // Parse path to determine parent paths
    const parts = leafPath.split('/');
    const rootName = parts[0];
    const midPath = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;

    // Accumulate for mid-level parent
    if (midPath) {
      if (!midTagSets[midPath]) midTagSets[midPath] = new Set();
      leafTagNames.forEach(t => midTagSets[midPath].add(t));
    }

    // Accumulate for root
    if (!rootTagSets[rootName]) rootTagSets[rootName] = new Set();
    leafTagNames.forEach(t => rootTagSets[rootName].add(t));
  }

  // ── Step 2: Assign aggregated tags to mid-level parents ──
  console.log('  Step 2: Linking aggregated tags to mid-level categories...');
  for (const [midPath, tagSet] of Object.entries(midTagSets)) {
    const midCatId = categoryIds[midPath];
    if (!midCatId) {
      console.warn(`  [warn] Mid-level "${midPath}" not found, skipping`);
      continue;
    }

    const tagNames = [...tagSet];
    await linkTagsToCategory(midCatId, tagNames);
    console.log(`    Mid "${midPath}": ${tagNames.length} tags (aggregated)`);
  }

  // ── Step 3: Assign aggregated tags to root-level parents ──
  console.log('  Step 3: Linking aggregated tags to root categories...');
  for (const [rootName, tagSet] of Object.entries(rootTagSets)) {
    const rootCatId = categoryIds[rootName];
    if (!rootCatId) {
      console.warn(`  [warn] Root "${rootName}" not found, skipping`);
      continue;
    }

    const tagNames = [...tagSet];
    await linkTagsToCategory(rootCatId, tagNames);
    console.log(`    Root "${rootName}": ${tagNames.length} tags (aggregated)`);
  }

  // Count total links
  const totalLinks = await prisma.categoryTag.count({ where: { status: Status.ACTIVE } });
  console.log(`  Total category-tag links: ${totalLinks}`);
}

// ─────────────────────────────────────────────────────────
// 5. SEED SPEC TEMPLATES (all leaf categories)
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
  // ── Electronics ──
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
    categoryPath: 'Electronics/Phones & Accessories/Phone Cases',
    specs: [
      { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Silicone', 'TPU', 'Leather', 'Plastic', 'Carbon Fiber'], isRequired: true, groupName: 'Material' },
      { name: 'Compatibility', key: 'compatibility', dataType: SpecDataType.TEXT, isRequired: true, groupName: 'Compatibility' },
      { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'Clear', 'Blue', 'Red', 'Pink'], groupName: 'Appearance' },
      { name: 'Shockproof', key: 'shockproof', dataType: SpecDataType.BOOLEAN, groupName: 'Protection' },
    ],
  },
  {
    categoryPath: 'Electronics/Phones & Accessories/Chargers',
    specs: [
      { name: 'Wattage', key: 'wattage', dataType: SpecDataType.NUMBER, unit: 'W', isRequired: true, groupName: 'Power' },
      { name: 'Type', key: 'type', dataType: SpecDataType.SELECT, options: ['USB-C', 'Lightning', 'Micro-USB', 'Wireless'], isRequired: true, groupName: 'Connectivity' },
      { name: 'Fast Charging', key: 'fast_charging', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
      { name: 'Cable Length', key: 'cable_length', dataType: SpecDataType.NUMBER, unit: 'm', groupName: 'Physical' },
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
    categoryPath: 'Electronics/Computers/Desktops',
    specs: [
      { name: 'Processor', key: 'processor', dataType: SpecDataType.TEXT, isRequired: true, groupName: 'Performance' },
      { name: 'RAM', key: 'ram', dataType: SpecDataType.SELECT, options: ['8GB', '16GB', '32GB', '64GB', '128GB'], isRequired: true, groupName: 'Performance' },
      { name: 'Storage', key: 'storage', dataType: SpecDataType.SELECT, options: ['256GB', '512GB', '1TB', '2TB', '4TB'], isRequired: true, groupName: 'Performance' },
      { name: 'GPU', key: 'gpu', dataType: SpecDataType.TEXT, groupName: 'Performance' },
      { name: 'Form Factor', key: 'form_factor', dataType: SpecDataType.SELECT, options: ['Tower', 'Mini', 'All-in-One'], groupName: 'Design' },
    ],
  },
  {
    categoryPath: 'Electronics/Computers/Tablets',
    specs: [
      { name: 'Screen Size', key: 'screen_size', dataType: SpecDataType.NUMBER, unit: 'inches', isRequired: true, groupName: 'Display' },
      { name: 'RAM', key: 'ram', dataType: SpecDataType.SELECT, options: ['4GB', '6GB', '8GB', '12GB'], groupName: 'Performance' },
      { name: 'Storage', key: 'storage', dataType: SpecDataType.SELECT, options: ['64GB', '128GB', '256GB', '512GB'], isRequired: true, groupName: 'Performance' },
      { name: 'OS', key: 'os', dataType: SpecDataType.SELECT, options: ['iOS', 'Android', 'Windows'], isRequired: true, groupName: 'Software' },
      { name: 'Weight', key: 'weight', dataType: SpecDataType.NUMBER, unit: 'g', groupName: 'Physical' },
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
  {
    categoryPath: 'Electronics/Audio/Speakers',
    specs: [
      { name: 'Driver Size', key: 'driver_size', dataType: SpecDataType.NUMBER, unit: 'inches', groupName: 'Audio' },
      { name: 'Connectivity', key: 'connectivity', dataType: SpecDataType.SELECT, options: ['Bluetooth', 'WiFi', 'Wired', 'Both'], isRequired: true, groupName: 'Connectivity' },
      { name: 'Battery Life', key: 'battery_life', dataType: SpecDataType.NUMBER, unit: 'hours', groupName: 'Battery' },
      { name: 'Waterproof', key: 'waterproof', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
      { name: 'Wattage', key: 'wattage', dataType: SpecDataType.NUMBER, unit: 'W', groupName: 'Power' },
    ],
  },
  {
    categoryPath: 'Electronics/Audio/Microphones',
    specs: [
      { name: 'Type', key: 'type', dataType: SpecDataType.SELECT, options: ['Condenser', 'Dynamic', 'Ribbon', 'USB'], isRequired: true, groupName: 'Type' },
      { name: 'Polar Pattern', key: 'polar_pattern', dataType: SpecDataType.SELECT, options: ['Cardioid', 'Omnidirectional', 'Bidirectional'], groupName: 'Audio' },
      { name: 'Connectivity', key: 'connectivity', dataType: SpecDataType.SELECT, options: ['USB', 'XLR', '3.5mm'], isRequired: true, groupName: 'Connectivity' },
      { name: 'Frequency Range', key: 'frequency_range', dataType: SpecDataType.TEXT, groupName: 'Audio' },
    ],
  },
  // ── Fashion ──
  {
    categoryPath: "Fashion/Men's Clothing/T-Shirts",
    specs: [
      { name: 'Size', key: 'size', dataType: SpecDataType.SELECT, options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], isRequired: true, groupName: 'Sizing' },
      { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Cotton', 'Polyester', 'Blend', 'Linen'], isRequired: true, groupName: 'Material' },
      { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'White', 'Navy', 'Red', 'Grey', 'Green'], groupName: 'Appearance' },
      { name: 'Fit', key: 'fit', dataType: SpecDataType.SELECT, options: ['Regular', 'Slim', 'Oversized'], groupName: 'Fit' },
      { name: 'Sleeve Type', key: 'sleeve_type', dataType: SpecDataType.SELECT, options: ['Short', 'Long', 'Sleeveless'], groupName: 'Design' },
    ],
  },
  {
    categoryPath: "Fashion/Men's Clothing/Shirts",
    specs: [
      { name: 'Size', key: 'size', dataType: SpecDataType.SELECT, options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], isRequired: true, groupName: 'Sizing' },
      { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Cotton', 'Linen', 'Polyester', 'Silk'], isRequired: true, groupName: 'Material' },
      { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['White', 'Blue', 'Black', 'Pink', 'Grey'], groupName: 'Appearance' },
      { name: 'Collar Type', key: 'collar_type', dataType: SpecDataType.SELECT, options: ['Spread', 'Button-Down', 'Mandarin', 'Point'], groupName: 'Design' },
      { name: 'Fit', key: 'fit', dataType: SpecDataType.SELECT, options: ['Regular', 'Slim', 'Tailored'], groupName: 'Fit' },
    ],
  },
  {
    categoryPath: "Fashion/Men's Clothing/Pants",
    specs: [
      { name: 'Size', key: 'size', dataType: SpecDataType.SELECT, options: ['28', '30', '32', '34', '36', '38', '40'], isRequired: true, groupName: 'Sizing' },
      { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Cotton', 'Denim', 'Polyester', 'Chino'], isRequired: true, groupName: 'Material' },
      { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'Navy', 'Grey', 'Khaki', 'Blue'], groupName: 'Appearance' },
      { name: 'Fit', key: 'fit', dataType: SpecDataType.SELECT, options: ['Regular', 'Slim', 'Relaxed', 'Tapered'], groupName: 'Fit' },
      { name: 'Length', key: 'length', dataType: SpecDataType.SELECT, options: ['Short', 'Regular', 'Long'], groupName: 'Sizing' },
    ],
  },
  {
    categoryPath: "Fashion/Men's Clothing/Jackets",
    specs: [
      { name: 'Size', key: 'size', dataType: SpecDataType.SELECT, options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], isRequired: true, groupName: 'Sizing' },
      { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Leather', 'Denim', 'Nylon', 'Polyester', 'Wool'], isRequired: true, groupName: 'Material' },
      { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'Brown', 'Navy', 'Grey', 'Green'], groupName: 'Appearance' },
      { name: 'Season', key: 'season', dataType: SpecDataType.SELECT, options: ['Winter', 'Spring', 'Fall', 'All-Season'], groupName: 'Usage' },
      { name: 'Waterproof', key: 'waterproof', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
    ],
  },
  {
    categoryPath: "Fashion/Women's Clothing/Dresses",
    specs: [
      { name: 'Size', key: 'size', dataType: SpecDataType.SELECT, options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], isRequired: true, groupName: 'Sizing' },
      { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Cotton', 'Chiffon', 'Silk', 'Polyester', 'Linen'], isRequired: true, groupName: 'Material' },
      { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'Red', 'Blue', 'White', 'Floral', 'Pink'], groupName: 'Appearance' },
      { name: 'Length', key: 'length', dataType: SpecDataType.SELECT, options: ['Mini', 'Midi', 'Maxi'], groupName: 'Design' },
      { name: 'Sleeve Type', key: 'sleeve_type', dataType: SpecDataType.SELECT, options: ['Short', 'Long', 'Sleeveless', '3/4'], groupName: 'Design' },
    ],
  },
  {
    categoryPath: "Fashion/Women's Clothing/Tops",
    specs: [
      { name: 'Size', key: 'size', dataType: SpecDataType.SELECT, options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], isRequired: true, groupName: 'Sizing' },
      { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Cotton', 'Polyester', 'Chiffon', 'Silk'], isRequired: true, groupName: 'Material' },
      { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'White', 'Pink', 'Blue', 'Red'], groupName: 'Appearance' },
      { name: 'Neckline', key: 'neckline', dataType: SpecDataType.SELECT, options: ['Crew', 'V-Neck', 'Scoop', 'Off-Shoulder'], groupName: 'Design' },
      { name: 'Fit', key: 'fit', dataType: SpecDataType.SELECT, options: ['Regular', 'Loose', 'Fitted'], groupName: 'Fit' },
    ],
  },
  {
    categoryPath: "Fashion/Women's Clothing/Skirts",
    specs: [
      { name: 'Size', key: 'size', dataType: SpecDataType.SELECT, options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], isRequired: true, groupName: 'Sizing' },
      { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Cotton', 'Denim', 'Polyester', 'Silk'], isRequired: true, groupName: 'Material' },
      { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'Navy', 'Red', 'White', 'Floral'], groupName: 'Appearance' },
      { name: 'Length', key: 'length', dataType: SpecDataType.SELECT, options: ['Mini', 'Midi', 'Maxi'], groupName: 'Design' },
      { name: 'Pattern', key: 'pattern', dataType: SpecDataType.SELECT, options: ['Solid', 'Striped', 'Plaid', 'Floral'], groupName: 'Design' },
    ],
  },
  {
    categoryPath: "Fashion/Shoes/Men's Shoes",
    specs: [
      { name: 'Size', key: 'size', dataType: SpecDataType.NUMBER, unit: 'US', isRequired: true, groupName: 'Sizing' },
      { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Leather', 'Suede', 'Canvas', 'Synthetic'], isRequired: true, groupName: 'Material' },
      { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'Brown', 'Tan', 'White', 'Navy'], groupName: 'Appearance' },
      { name: 'Type', key: 'type', dataType: SpecDataType.SELECT, options: ['Oxford', 'Loafer', 'Boot', 'Sneaker'], groupName: 'Style' },
      { name: 'Sole Type', key: 'sole_type', dataType: SpecDataType.SELECT, options: ['Rubber', 'Leather', 'EVA'], groupName: 'Construction' },
    ],
  },
  {
    categoryPath: "Fashion/Shoes/Women's Shoes",
    specs: [
      { name: 'Size', key: 'size', dataType: SpecDataType.NUMBER, unit: 'US', isRequired: true, groupName: 'Sizing' },
      { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Leather', 'Suede', 'Canvas', 'Synthetic'], isRequired: true, groupName: 'Material' },
      { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'Nude', 'Red', 'White', 'Brown'], groupName: 'Appearance' },
      { name: 'Heel Height', key: 'heel_height', dataType: SpecDataType.SELECT, options: ['Flat', 'Low', 'Medium', 'High'], groupName: 'Design' },
      { name: 'Type', key: 'type', dataType: SpecDataType.SELECT, options: ['Pump', 'Flat', 'Sandal', 'Boot', 'Sneaker'], groupName: 'Style' },
    ],
  },
  {
    categoryPath: 'Fashion/Shoes/Sports Shoes',
    specs: [
      { name: 'Size', key: 'size', dataType: SpecDataType.NUMBER, unit: 'US', isRequired: true, groupName: 'Sizing' },
      { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'White', 'Blue', 'Red', 'Grey'], groupName: 'Appearance' },
      { name: 'Sole Type', key: 'sole_type', dataType: SpecDataType.SELECT, options: ['Rubber', 'EVA', 'Foam'], groupName: 'Construction' },
      { name: 'Closure', key: 'closure', dataType: SpecDataType.SELECT, options: ['Lace-up', 'Slip-on', 'Velcro'], groupName: 'Design' },
      { name: 'Weight', key: 'weight', dataType: SpecDataType.NUMBER, unit: 'g', groupName: 'Physical' },
    ],
  },
  // ── Home & Garden ──
  {
    categoryPath: 'Home & Garden/Furniture/Living Room',
    specs: [
      { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Wood', 'Metal', 'Fabric', 'Leather'], isRequired: true, groupName: 'Material' },
      { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'Grey', 'Brown', 'White', 'Beige'], groupName: 'Appearance' },
      { name: 'Seats', key: 'seats', dataType: SpecDataType.NUMBER, groupName: 'Capacity' },
      { name: 'Weight Capacity', key: 'weight_capacity', dataType: SpecDataType.NUMBER, unit: 'kg', groupName: 'Specs' },
      { name: 'Assembly Required', key: 'assembly_required', dataType: SpecDataType.BOOLEAN, groupName: 'Setup' },
    ],
  },
  {
    categoryPath: 'Home & Garden/Furniture/Bedroom',
    specs: [
      { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Wood', 'Metal', 'Upholstered', 'MDF'], isRequired: true, groupName: 'Material' },
      { name: 'Size', key: 'size', dataType: SpecDataType.SELECT, options: ['Twin', 'Full', 'Queen', 'King'], isRequired: true, groupName: 'Sizing' },
      { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['White', 'Black', 'Brown', 'Grey', 'Natural'], groupName: 'Appearance' },
      { name: 'Weight Capacity', key: 'weight_capacity', dataType: SpecDataType.NUMBER, unit: 'kg', groupName: 'Specs' },
      { name: 'Assembly Required', key: 'assembly_required', dataType: SpecDataType.BOOLEAN, groupName: 'Setup' },
    ],
  },
  {
    categoryPath: 'Home & Garden/Furniture/Kitchen',
    specs: [
      { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Wood', 'Metal', 'Marble', 'Glass'], isRequired: true, groupName: 'Material' },
      { name: 'Seats', key: 'seats', dataType: SpecDataType.NUMBER, groupName: 'Capacity' },
      { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Natural', 'White', 'Black', 'Brown'], groupName: 'Appearance' },
      { name: 'Weight Capacity', key: 'weight_capacity', dataType: SpecDataType.NUMBER, unit: 'kg', groupName: 'Specs' },
    ],
  },
  {
    categoryPath: 'Home & Garden/Kitchen/Cookware',
    specs: [
      { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Stainless Steel', 'Cast Iron', 'Aluminum', 'Ceramic', 'Non-Stick'], isRequired: true, groupName: 'Material' },
      { name: 'Size', key: 'size', dataType: SpecDataType.TEXT, groupName: 'Sizing' },
      { name: 'Compatible Heat Source', key: 'compatible_heat_source', dataType: SpecDataType.MULTI_SELECT, options: ['Gas', 'Electric', 'Induction', 'Oven'], groupName: 'Compatibility' },
      { name: 'Dishwasher Safe', key: 'dishwasher_safe', dataType: SpecDataType.BOOLEAN, groupName: 'Care' },
    ],
  },
  {
    categoryPath: 'Home & Garden/Kitchen/Appliances',
    specs: [
      { name: 'Wattage', key: 'wattage', dataType: SpecDataType.NUMBER, unit: 'W', isRequired: true, groupName: 'Power' },
      { name: 'Capacity', key: 'capacity', dataType: SpecDataType.TEXT, groupName: 'Specs' },
      { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'White', 'Silver', 'Red'], groupName: 'Appearance' },
      { name: 'Warranty', key: 'warranty', dataType: SpecDataType.SELECT, options: ['1 Year', '2 Years', '3 Years'], groupName: 'Support' },
      { name: 'Energy Rating', key: 'energy_rating', dataType: SpecDataType.SELECT, options: ['A+', 'A', 'B', 'C'], groupName: 'Efficiency' },
    ],
  },
  {
    categoryPath: 'Home & Garden/Kitchen/Storage',
    specs: [
      { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Plastic', 'Glass', 'Stainless Steel', 'Bamboo'], isRequired: true, groupName: 'Material' },
      { name: 'Capacity', key: 'capacity', dataType: SpecDataType.TEXT, groupName: 'Specs' },
      { name: 'Airtight', key: 'airtight', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
      { name: 'Dishwasher Safe', key: 'dishwasher_safe', dataType: SpecDataType.BOOLEAN, groupName: 'Care' },
    ],
  },
  // ── Beauty & Health (mid-level-as-leaf) ──
  {
    categoryPath: 'Beauty & Health/Skincare',
    specs: [
      { name: 'Skin Type', key: 'skin_type', dataType: SpecDataType.MULTI_SELECT, options: ['Normal', 'Oily', 'Dry', 'Combination', 'Sensitive'], isRequired: true, groupName: 'Suitability' },
      { name: 'Volume', key: 'volume', dataType: SpecDataType.NUMBER, unit: 'ml', groupName: 'Packaging' },
      { name: 'Ingredients Type', key: 'ingredients_type', dataType: SpecDataType.SELECT, options: ['Natural', 'Synthetic', 'Organic'], groupName: 'Composition' },
      { name: 'SPF', key: 'spf', dataType: SpecDataType.SELECT, options: ['None', 'SPF 15', 'SPF 30', 'SPF 50'], groupName: 'Protection' },
      { name: 'Cruelty Free', key: 'cruelty_free', dataType: SpecDataType.BOOLEAN, groupName: 'Ethics' },
    ],
  },
  {
    categoryPath: 'Beauty & Health/Haircare',
    specs: [
      { name: 'Hair Type', key: 'hair_type', dataType: SpecDataType.MULTI_SELECT, options: ['Straight', 'Wavy', 'Curly', 'Coily'], isRequired: true, groupName: 'Suitability' },
      { name: 'Volume', key: 'volume', dataType: SpecDataType.NUMBER, unit: 'ml', groupName: 'Packaging' },
      { name: 'Ingredients Type', key: 'ingredients_type', dataType: SpecDataType.SELECT, options: ['Natural', 'Synthetic', 'Organic'], groupName: 'Composition' },
      { name: 'Sulfate Free', key: 'sulfate_free', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
    ],
  },
  {
    categoryPath: 'Beauty & Health/Makeup',
    specs: [
      { name: 'Finish', key: 'finish', dataType: SpecDataType.SELECT, options: ['Matte', 'Glossy', 'Satin', 'Shimmer'], groupName: 'Appearance' },
      { name: 'Coverage', key: 'coverage', dataType: SpecDataType.SELECT, options: ['Light', 'Medium', 'Full'], groupName: 'Performance' },
      { name: 'Shade Range', key: 'shade_range', dataType: SpecDataType.TEXT, groupName: 'Options' },
      { name: 'Cruelty Free', key: 'cruelty_free', dataType: SpecDataType.BOOLEAN, groupName: 'Ethics' },
      { name: 'Waterproof', key: 'waterproof', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
    ],
  },
  // ── Sports & Outdoors (mid-level-as-leaf) ──
  {
    categoryPath: 'Sports & Outdoors/Fitness',
    specs: [
      { name: 'Weight Capacity', key: 'weight_capacity', dataType: SpecDataType.NUMBER, unit: 'kg', groupName: 'Specs' },
      { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Steel', 'Rubber', 'Foam', 'Neoprene'], isRequired: true, groupName: 'Material' },
      { name: 'Dimensions', key: 'dimensions', dataType: SpecDataType.TEXT, groupName: 'Size' },
      { name: 'Foldable', key: 'foldable', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
      { name: 'Weight', key: 'weight', dataType: SpecDataType.NUMBER, unit: 'kg', groupName: 'Physical' },
    ],
  },
  {
    categoryPath: 'Sports & Outdoors/Camping',
    specs: [
      { name: 'Capacity', key: 'capacity', dataType: SpecDataType.TEXT, groupName: 'Specs' },
      { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Nylon', 'Polyester', 'Canvas', 'Gore-Tex'], isRequired: true, groupName: 'Material' },
      { name: 'Weight', key: 'weight', dataType: SpecDataType.NUMBER, unit: 'kg', groupName: 'Physical' },
      { name: 'Waterproof', key: 'waterproof', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
      { name: 'Season Rating', key: 'season_rating', dataType: SpecDataType.SELECT, options: ['3-Season', '4-Season'], groupName: 'Usage' },
    ],
  },
  {
    categoryPath: 'Sports & Outdoors/Team Sports',
    specs: [
      { name: 'Sport', key: 'sport', dataType: SpecDataType.SELECT, options: ['Football', 'Basketball', 'Cricket', 'Volleyball', 'Hockey'], isRequired: true, groupName: 'Category' },
      { name: 'Size', key: 'size', dataType: SpecDataType.SELECT, options: ['3', '4', '5', 'Official'], groupName: 'Sizing' },
      { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Leather', 'Synthetic', 'Rubber'], isRequired: true, groupName: 'Material' },
      { name: 'Age Group', key: 'age_group', dataType: SpecDataType.SELECT, options: ['Youth', 'Adult'], groupName: 'Suitability' },
    ],
  },
  // ── Automotive (mid-level-as-leaf) ──
  {
    categoryPath: 'Automotive/Car Parts',
    specs: [
      { name: 'Compatibility', key: 'compatibility', dataType: SpecDataType.TEXT, isRequired: true, groupName: 'Fitment' },
      { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Steel', 'Aluminum', 'Ceramic', 'Rubber'], groupName: 'Material' },
      { name: 'OEM', key: 'oem', dataType: SpecDataType.BOOLEAN, groupName: 'Quality' },
      { name: 'Warranty', key: 'warranty', dataType: SpecDataType.SELECT, options: ['6 Months', '1 Year', '2 Years', 'Lifetime'], groupName: 'Support' },
    ],
  },
  {
    categoryPath: 'Automotive/Car Electronics',
    specs: [
      { name: 'Display Size', key: 'display_size', dataType: SpecDataType.NUMBER, unit: 'inches', groupName: 'Display' },
      { name: 'Resolution', key: 'resolution', dataType: SpecDataType.TEXT, groupName: 'Display' },
      { name: 'Connectivity', key: 'connectivity', dataType: SpecDataType.SELECT, options: ['WiFi', 'Bluetooth', 'USB', 'GPS'], groupName: 'Connectivity' },
      { name: 'Night Vision', key: 'night_vision', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
    ],
  },
  {
    categoryPath: 'Automotive/Accessories',
    specs: [
      { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Leather', 'Fabric', 'Rubber', 'Neoprene'], groupName: 'Material' },
      { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'Grey', 'Beige', 'Brown'], groupName: 'Appearance' },
      { name: 'Universal Fit', key: 'universal_fit', dataType: SpecDataType.BOOLEAN, groupName: 'Compatibility' },
    ],
  },
  // ── Office & School (mid-level-as-leaf) ──
  {
    categoryPath: 'Office & School/Stationery',
    specs: [
      { name: 'Type', key: 'type', dataType: SpecDataType.SELECT, options: ['Ballpoint', 'Gel', 'Fountain', 'Mechanical'], groupName: 'Type' },
      { name: 'Pack Size', key: 'pack_size', dataType: SpecDataType.NUMBER, groupName: 'Quantity' },
      { name: 'Ink Color', key: 'ink_color', dataType: SpecDataType.SELECT, options: ['Black', 'Blue', 'Red', 'Multi'], groupName: 'Appearance' },
      { name: 'Refillable', key: 'refillable', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
    ],
  },
  {
    categoryPath: 'Office & School/Supplies',
    specs: [
      { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Plastic', 'Metal', 'Paper', 'Fabric'], groupName: 'Material' },
      { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'White', 'Blue', 'Multi'], groupName: 'Appearance' },
      { name: 'Pack Size', key: 'pack_size', dataType: SpecDataType.NUMBER, groupName: 'Quantity' },
    ],
  },
  {
    categoryPath: 'Office & School/Furniture',
    specs: [
      { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Wood', 'Metal', 'Mesh', 'Plastic'], isRequired: true, groupName: 'Material' },
      { name: 'Weight Capacity', key: 'weight_capacity', dataType: SpecDataType.NUMBER, unit: 'kg', groupName: 'Specs' },
      { name: 'Adjustable', key: 'adjustable', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
      { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'White', 'Grey', 'Brown'], groupName: 'Appearance' },
      { name: 'Ergonomic', key: 'ergonomic', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
    ],
  },
];

// We store specTemplate IDs keyed by "categoryPath/key" for product spec values
const specTemplateIds: Record<string, number> = {};

async function seedSpecTemplates(): Promise<void> {
  console.log('\n--- Seeding Spec Templates ---');

  for (const cfg of SPEC_TEMPLATES) {
    // Resolve category: try full path first, then mid-level leaf fallback
    const catId = categoryIds[cfg.categoryPath] ?? categoryIds[`${cfg.categoryPath}/__leaf`];
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
  console.log(`  Total spec template configs: ${SPEC_TEMPLATES.length}`);
}

// ─────────────────────────────────────────────────────────
// 6. SEED TEST USERS
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
// 7. SEED SAMPLE PRODUCTS
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
  // ── Electronics ──
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
  // ── Fashion (existing + spec values added) ──
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
    specValues: {
      size: { value: 'L' },
      material: { value: 'Cotton' },
      color: { value: 'Navy' },
      fit: { value: 'Regular' },
      sleeve_type: { value: 'Short' },
    },
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
    specValues: {
      size: { value: 'M' },
      material: { value: 'Chiffon' },
      color: { value: 'Floral' },
      length: { value: 'Maxi' },
      sleeve_type: { value: 'Sleeveless' },
    },
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
    specValues: {
      material: { value: 'Mesh' },
      weight_capacity: { value: '150', numericValue: 150 },
      adjustable: { value: 'true' },
      color: { value: 'Black' },
      ergonomic: { value: 'true' },
    },
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
    specValues: {
      size: { value: '10', numericValue: 10 },
      color: { value: 'Black' },
      sole_type: { value: 'Rubber' },
      closure: { value: 'Lace-up' },
      weight: { value: '280', numericValue: 280 },
    },
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
    specValues: {
      skin_type: { value: 'Normal,Dry' },
      volume: { value: '200', numericValue: 200 },
      ingredients_type: { value: 'Natural' },
      spf: { value: 'SPF 30' },
      cruelty_free: { value: 'true' },
    },
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
    specValues: {
      wattage: { value: '1700', numericValue: 1700 },
      capacity: { value: '5.8QT' },
      color: { value: 'Black' },
      warranty: { value: '2 Years' },
      energy_rating: { value: 'A+' },
    },
  },
  // ── NEW PRODUCTS ──
  {
    productName: 'Urban Slim Fit V-Neck Tee',
    skuNo: 'SEED-FASHION-003',
    productPrice: 34.99,
    offerPrice: 29.99,
    description: 'Modern slim fit v-neck t-shirt made from premium cotton-polyester blend. Soft feel with durable construction.',
    categoryPath: "Fashion/Men's Clothing/T-Shirts",
    productType: ProductType.P,
    images: [
      'https://placehold.co/600x400?text=V-Neck+Front',
      'https://placehold.co/600x400?text=V-Neck+Back',
    ],
    specValues: {
      size: { value: 'M' },
      material: { value: 'Blend' },
      color: { value: 'Grey' },
      fit: { value: 'Slim' },
      sleeve_type: { value: 'Short' },
    },
  },
  {
    productName: 'Classic Cocktail Evening Dress',
    skuNo: 'SEED-FASHION-004',
    productPrice: 149.99,
    offerPrice: 119.99,
    description: 'Stunning silk cocktail dress with elegant draping. Perfect for evening events and formal occasions.',
    categoryPath: "Fashion/Women's Clothing/Dresses",
    productType: ProductType.P,
    images: [
      'https://placehold.co/600x400?text=Cocktail+Dress+Front',
      'https://placehold.co/600x400?text=Cocktail+Dress+Back',
    ],
    specValues: {
      size: { value: 'S' },
      material: { value: 'Silk' },
      color: { value: 'Black' },
      length: { value: 'Midi' },
      sleeve_type: { value: 'Sleeveless' },
    },
  },
  {
    productName: 'TrailBlaze Hiking Sports Shoes',
    skuNo: 'SEED-SHOES-002',
    productPrice: 159.99,
    offerPrice: 139.99,
    description: 'All-terrain hiking shoes with EVA midsole, reinforced toe cap, and water-resistant upper for trail adventures.',
    categoryPath: 'Fashion/Shoes/Sports Shoes',
    productType: ProductType.P,
    images: [
      'https://placehold.co/600x400?text=Hiking+Shoes+Side',
      'https://placehold.co/600x400?text=Hiking+Shoes+Top',
    ],
    specValues: {
      size: { value: '9', numericValue: 9 },
      color: { value: 'Grey' },
      sole_type: { value: 'EVA' },
      closure: { value: 'Lace-up' },
      weight: { value: '340', numericValue: 340 },
    },
  },
  {
    productName: 'AquaPure Hyaluronic Serum',
    skuNo: 'SEED-BEAUTY-002',
    productPrice: 39.99,
    offerPrice: 34.99,
    description: 'Concentrated hyaluronic acid serum for deep hydration. Organic formula suitable for sensitive skin with SPF protection.',
    categoryPath: 'Beauty & Health/Skincare',
    productType: ProductType.P,
    images: [
      'https://placehold.co/600x400?text=Serum+Bottle',
      'https://placehold.co/600x400?text=Serum+Drop',
    ],
    specValues: {
      skin_type: { value: 'Sensitive,Dry,Combination' },
      volume: { value: '30', numericValue: 30 },
      ingredients_type: { value: 'Organic' },
      spf: { value: 'SPF 15' },
      cruelty_free: { value: 'true' },
    },
  },
  {
    productName: 'BrewMaster Pro Coffee Machine',
    skuNo: 'SEED-KITCHEN-002',
    productPrice: 299.99,
    offerPrice: 249.99,
    description: 'Professional-grade espresso and drip coffee machine with built-in grinder, milk frother, and programmable brewing.',
    categoryPath: 'Home & Garden/Kitchen/Appliances',
    productType: ProductType.P,
    images: [
      'https://placehold.co/600x400?text=Coffee+Machine+Front',
      'https://placehold.co/600x400?text=Coffee+Machine+Side',
    ],
    specValues: {
      wattage: { value: '1450', numericValue: 1450 },
      capacity: { value: '12 cups' },
      color: { value: 'Silver' },
      warranty: { value: '3 Years' },
      energy_rating: { value: 'A' },
    },
  },
  {
    productName: 'IronGrip Adjustable Dumbbell Set',
    skuNo: 'SEED-FITNESS-001',
    productPrice: 249.99,
    offerPrice: 219.99,
    description: 'Adjustable dumbbell set ranging from 5-52.5 lbs per dumbbell. Space-saving design replaces 15 sets of weights.',
    categoryPath: 'Sports & Outdoors/Fitness',
    productType: ProductType.P,
    images: [
      'https://placehold.co/600x400?text=Dumbbell+Set',
      'https://placehold.co/600x400?text=Dumbbell+Rack',
    ],
    specValues: {
      weight_capacity: { value: '23.8', numericValue: 23.8 },
      material: { value: 'Steel' },
      dimensions: { value: '43 x 21 x 23 cm' },
      foldable: { value: 'false' },
      weight: { value: '23.8', numericValue: 23.8 },
    },
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

  // 3. Tags
  await seedTags();

  // 4. Category Tags (bottom-up aggregation)
  await seedCategoryTags();

  // 5. Spec Templates (all leaf categories)
  await seedSpecTemplates();

  // 6. Users
  const { sellerId, buyerId } = await seedUsers();

  // 7. Products (with spec values)
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
