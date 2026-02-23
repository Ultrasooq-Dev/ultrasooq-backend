import 'dotenv/config';
import {
  PrismaClient,
  Status,
  ProductType,
  TypeOfProduct,
  TypeProduct,
  ConsumerType,
  SellType,
  TypeTrader,
} from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ─────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────
interface CategoryNode {
  id: number;
  name: string;
  parentId: number | null;
  children: number[];
  path: string;
}

interface ProductDef {
  productName: string;
  description: string;
  shortDescription: string;
  price: number;
  offerPrice: number;
  productType: ProductType;
  typeOfProduct: TypeOfProduct;
  typeProduct: TypeProduct;
  sellType: SellType;
  consumerType: ConsumerType;
  menuId: number;
  stock: number;
  minQuantity: number;
  maxQuantity: number;
  consumerDiscount: number;
  vendorDiscount: number;
  isCustomProduct: string;
  categoryId: number;
  categoryName: string;
  categoryPath: string;
}

// ─────────────────────────────────────────────────────────
// PRODUCT NAME TEMPLATES BY CATEGORY (lowercase key)
// ─────────────────────────────────────────────────────────
const PRODUCT_NAMES: Record<string, string[]> = {
  // ── Electronics ──
  'smartphones':           ['Galaxy S24 Ultra 256GB', 'iPhone 15 Pro Max 512GB', 'Pixel 8 Pro 128GB', 'OnePlus 12 256GB'],
  'feature phones':        ['Nokia 110 4G Dual SIM', 'Samsung Guru E1200'],
  'phone cases':           ['Premium Silicone Case iPhone 15', 'Rugged Armor Case Samsung S24'],
  'chargers':              ['65W GaN USB-C Fast Charger', '20W Apple MagSafe Charger'],
  'screen protectors':     ['Tempered Glass Screen Protector iPhone 15', '9H Hardness Samsung S24 Guard'],
  'power banks':           ['20000mAh Fast Charge Power Bank', '10000mAh Slim Portable Charger'],
  'cables & adapters':     ['USB-C to Lightning Cable 2m', 'HDMI to DisplayPort Adapter'],
  'phone accessories':     ['Magnetic Phone Ring Holder', 'Wireless Charging Pad 15W'],
  'laptops':               ['MacBook Pro 14" M3 Pro', 'Dell XPS 15 Intel i7', 'ThinkPad X1 Carbon Gen 11'],
  'desktops':              ['HP EliteDesk 800 G9', 'iMac 24" M3 2024'],
  'desktop computers':     ['Custom Gaming PC RTX 4070', 'Mac Mini M2 Pro'],
  'tablets':               ['iPad Air M2 256GB', 'Samsung Galaxy Tab S9 FE'],
  'monitors':              ['LG 27" 4K UltraFine Monitor', 'Dell 32" Curved QHD Display'],
  'computer accessories':  ['Mechanical Keyboard RGB', 'Ergonomic Wireless Mouse'],
  'printers':              ['HP LaserJet Pro M404dn', 'Canon PIXMA All-in-One'],
  'networking':            ['TP-Link Mesh WiFi 6 System', 'Netgear 5-Port Gigabit Switch'],
  'storage devices':       ['Samsung 1TB Portable SSD T7', 'WD 4TB External Hard Drive'],
  'headphones':            ['Sony WH-1000XM5', 'Apple AirPods Max', 'Bose QuietComfort Ultra'],
  'earbuds':               ['AirPods Pro 2 USB-C', 'Samsung Galaxy Buds3 Pro'],
  'speakers':              ['JBL Charge 5 Portable Speaker', 'Sonos Era 100 Smart Speaker'],
  'microphones':           ['Blue Yeti USB Condenser Mic', 'Rode NT-USB Mini'],
  'soundbars':             ['Samsung HW-Q990D Soundbar', 'Sony HT-A7000 Dolby Atmos'],
  'televisions':           ['Samsung 55" QLED 4K Smart TV', 'LG 65" OLED C3 4K'],
  'projectors':            ['Epson Home Cinema 4K Projector', 'BenQ Portable Mini Projector'],
  'cameras':               ['Canon EOS R6 Mark II Body', 'Sony Alpha A7 IV Kit'],
  'lenses':                ['Canon RF 50mm f/1.8 STM', 'Sony 24-70mm f/2.8 GM II'],
  'drones':                ['DJI Mini 4 Pro Drone', 'DJI Air 3 Fly More Combo'],
  'action cameras':        ['GoPro HERO12 Black', 'DJI Osmo Action 4'],
  'gaming consoles':       ['PlayStation 5 Slim Digital', 'Xbox Series X 1TB', 'Nintendo Switch OLED'],
  'gaming accessories':    ['PS5 DualSense Controller Black', 'Xbox Elite Controller Series 2'],
  'video games':           ['Elden Ring PS5', 'Zelda Tears of the Kingdom Switch'],
  'smartwatches':          ['Apple Watch Series 9 45mm', 'Samsung Galaxy Watch 6 Classic'],
  'fitness trackers':      ['Fitbit Charge 6', 'Xiaomi Smart Band 8 Pro'],
  'smart glasses':         ['Ray-Ban Meta Smart Glasses', 'Xreal Air 2 AR Glasses'],

  // ── Fashion ──
  't-shirts':              ['Premium Cotton Crew Neck T-Shirt', 'Athletic Fit Performance Tee'],
  'shirts':                ['Slim Fit Oxford Button-Down Shirt', 'Classic Linen Casual Shirt'],
  'pants':                 ['Slim Fit Chino Pants', 'Stretch Comfort Cargo Pants'],
  'jeans':                 ['Slim Fit Stretch Denim Jeans', 'Relaxed Fit Straight Leg Jeans'],
  'jackets':               ['Waterproof Windbreaker Jacket', 'Premium Leather Biker Jacket'],
  'suits':                 ['Classic Fit Wool Blend 2-Piece Suit', 'Modern Slim Charcoal Suit'],
  'shorts':                ['Quick-Dry Athletic Shorts', 'Casual Chino Shorts'],
  'sweaters':              ['Merino Wool V-Neck Sweater', 'Cable Knit Pullover Sweater'],
  'hoodies':               ['Fleece Pullover Hoodie', 'Zip-Up Athletic Hoodie'],
  'activewear':            ['Compression Training Set', 'Moisture-Wicking Sport Top'],
  'dresses':               ['Floral Midi Wrap Dress', 'Classic A-Line Cocktail Dress'],
  'tops':                  ['Casual Cotton Crop Top', 'Elegant Satin Blouse Top'],
  'blouses':               ['Silk Button-Front Blouse', 'Chiffon Ruffle Blouse'],
  'skirts':                ['High-Waist Pleated Midi Skirt', 'Denim A-Line Mini Skirt'],
  'leggings':              ['High-Waist Athletic Leggings', 'Fleece Lined Winter Leggings'],
  'sneakers':              ['Air Max 90 Running Sneakers', 'Ultraboost Light Running Shoes'],
  'boots':                 ['Classic Chelsea Leather Boots', 'Waterproof Hiking Boots'],
  'sandals':               ['Leather Slide Sandals', 'Comfort Cork Footbed Sandals'],
  'formal shoes':          ['Oxford Leather Dress Shoes', 'Patent Leather Derby Shoes'],
  'slippers':              ['Memory Foam House Slippers', 'Sheepskin Indoor Slippers'],
  'watches':               ['Classic Chronograph Steel Watch', 'Digital Sport Smart Watch'],
  'sunglasses':            ['Polarized Aviator Sunglasses UV400', 'Classic Wayfarer Sunglasses'],
  'belts':                 ['Genuine Leather Reversible Belt', 'Canvas Web Belt Adjustable'],
  'wallets':               ['RFID Blocking Leather Bifold Wallet', 'Slim Minimalist Card Holder'],
  'bags':                  ['Leather Laptop Messenger Bag', 'Travel Duffle Weekender Bag'],
  'handbags':              ['Leather Crossbody Shoulder Bag', 'Classic Tote Handbag'],
  'backpacks':             ['Anti-Theft Travel Backpack 30L', 'Lightweight Laptop Backpack'],
  'jewelry':               ['Sterling Silver Pendant Necklace', '14K Gold Hoop Earrings'],
  'scarves':               ['Cashmere Wool Winter Scarf', 'Silk Print Scarf Lightweight'],
  'ties':                  ['Silk Necktie Classic Stripe', 'Knit Tie Slim Modern'],

  // ── Home & Garden ──
  'sofas':                 ['L-Shape Sectional Sofa Grey', 'Mid-Century Modern 3-Seater Sofa'],
  'beds':                  ['King Size Platform Bed Frame', 'Queen Memory Foam Mattress'],
  'tables':                ['Extendable Dining Table 6-Seat', 'Glass Coffee Table Modern'],
  'chairs':                ['Ergonomic Office Chair Mesh', 'Velvet Accent Armchair'],
  'shelves & storage':     ['5-Tier Bookshelf Organizer', 'Floating Wall Shelves Set 3'],
  'cookware':              ['Non-Stick Cookware Set 12pc', 'Cast Iron Skillet 10-inch'],
  'kitchen appliances':    ['Air Fryer 5.5L Digital', 'Blender 1000W Smoothie Maker'],
  'kitchen storage':       ['Airtight Food Container Set 10pc', 'Spice Rack Organizer 20-Jar'],
  'bakeware':              ['Silicone Baking Mat Set', 'Non-Stick Cake Pan Set 3pc'],
  'cutlery':               ['Stainless Steel Knife Set 8pc', 'Japanese Chef Knife 8-inch'],
  'kitchen tools':         ['Silicone Cooking Utensil Set 12pc', 'Digital Kitchen Scale'],
  'drinkware':             ['Insulated Travel Mug 500ml', 'Crystal Wine Glass Set 4'],
  'dinnerware':            ['Porcelain Dinner Set 16pc', 'Stoneware Bowl Set 6pc'],
  'lighting':              ['LED Smart Ceiling Light Dimmable', 'Modern Floor Lamp Adjustable'],
  'rugs & carpets':        ['Persian Style Area Rug 5x7', 'Shag Fluffy Carpet'],
  'curtains':              ['Blackout Curtains Thermal 2-Pack', 'Sheer Linen Curtains'],
  'wall art':              ['Canvas Abstract Art Print 3-Set', 'Metal Wall Decor Modern'],
  'clocks':                ['Minimalist Wall Clock 30cm', 'Digital Smart Alarm Clock'],
  'candles':               ['Soy Wax Scented Candle Set 3', 'LED Flameless Candle Set'],
  'vases':                 ['Ceramic Flower Vase Modern', 'Glass Bud Vase Set 3'],
  'cushions & pillows':    ['Velvet Throw Pillow Cover Set 4', 'Memory Foam Support Cushion'],
  'mirrors':               ['Full-Length LED Mirror', 'Round Wall Mirror 60cm Gold'],
  'plants':                ['Monstera Deliciosa Indoor Plant', 'Snake Plant Sansevieria'],
  'garden tools':          ['Stainless Steel Garden Tool Set 5pc', 'Pruning Shears Professional'],
  'pots & planters':       ['Self-Watering Planter Set 3', 'Ceramic Plant Pot Large 30cm'],
  'outdoor lighting':      ['Solar Garden Path Lights 10-Pack', 'LED String Lights 20m'],
  'grills & bbq':          ['Charcoal BBQ Grill Portable', 'Gas Grill 4-Burner Stainless'],
  'bed sheets':            ['Egyptian Cotton 1000TC Sheet Set', 'Bamboo Cooling Bed Sheets'],
  'comforters':            ['Down Alternative Comforter Queen', 'Weighted Blanket 7kg'],
  'pillows':               ['Memory Foam Pillow Cervical', 'Goose Down Pillow King'],
  'towels':                ['Turkish Cotton Bath Towel Set 6', 'Quick-Dry Microfiber Towels'],
  'bath accessories':      ['Bamboo Bath Caddy Tray', 'Shower Organizer Wall Mount'],
  'shower curtains':       ['Waterproof Fabric Shower Curtain', 'Clear PEVA Shower Liner'],

  // ── Beauty & Health ──
  'skincare':              ['Hyaluronic Acid Serum 30ml', 'Vitamin C Brightening Moisturizer'],
  'haircare':              ['Argan Oil Repair Shampoo 500ml', 'Keratin Conditioner Deep Treatment'],
  'makeup':                ['Long-Wear Foundation SPF25', 'Matte Liquid Lipstick Set 6-Pack'],
  'fragrances':            ['Oud Wood Eau de Parfum 100ml', 'Fresh Aqua Cologne Spray 50ml'],
  'personal care':         ['Electric Toothbrush Sonic Pro', 'Water Flosser Cordless'],
  'nail care':             ['Gel Nail Polish Set 12 Colors', 'UV LED Nail Lamp 48W'],
  'hair tools':            ['Ionic Hair Dryer 2200W', 'Ceramic Flat Iron Straightener'],
  'oral care':             ['Whitening Toothpaste Charcoal', 'Electric Water Flosser'],
  'supplements':           ['Multivitamin Complex 90 Tablets', 'Omega-3 Fish Oil 1000mg'],
  'medical devices':       ['Digital Blood Pressure Monitor', 'Infrared Thermometer Non-Contact'],
  'body care':             ['Shea Butter Body Lotion 400ml', 'Exfoliating Body Scrub Coffee'],
  'face care':             ['Retinol Night Cream Anti-Aging', 'Charcoal Pore Cleanser Gel'],

  // ── Sports & Outdoors ──
  'fitness equipment':     ['Adjustable Dumbbell Set 25kg', 'Resistance Band Set 5-Pack'],
  'camping gear':          ['4-Person Waterproof Tent', 'Ultralight Sleeping Bag 0°C'],
  'team sports':           ['FIFA Pro Soccer Ball Size 5', 'Basketball Indoor/Outdoor Size 7'],
  'hiking':                ['Trekking Poles Carbon Fiber', 'Hydration Backpack 2L'],
  'cycling':               ['Carbon Fiber Road Bike Frame', 'LED Bike Light Set USB'],
  'swimming':              ['Anti-Fog Swim Goggles', 'Waterproof Swim Cap Silicone'],
  'yoga':                  ['Non-Slip Yoga Mat 6mm TPE', 'Yoga Block & Strap Set'],
  'running':               ['Lightweight Running Shoes Breathable', 'GPS Running Watch HR Monitor'],
  'fishing':               ['Spinning Fishing Rod & Reel Combo', 'Tackle Box 3-Tray Organizer'],
  'water sports':          ['Inflatable Kayak 2-Person', 'Snorkel Mask Full Face'],
  'exercise machines':     ['Folding Treadmill Electric', 'Magnetic Spin Bike Indoor'],
  'weights':               ['Olympic Barbell Set 100kg', 'Kettlebell Cast Iron 16kg'],
  'resistance bands':      ['Loop Resistance Band Set 5 Levels', 'Tube Band Set with Handles'],
  'sports accessories':    ['Gym Bag Waterproof Large', 'Protein Shaker Bottle 700ml'],

  // ── Automotive ──
  'car parts':             ['Brake Pad Set Ceramic Front', 'Air Filter High Performance'],
  'car electronics':       ['4K Dash Camera Front & Rear', 'Android Auto Head Unit 9"'],
  'car accessories':       ['Wireless Car Charger Mount', 'LED Interior Ambient Lights Kit'],
  'tires & wheels':        ['All-Season Radial Tire 205/55R16', '18" Alloy Wheel Set'],
  'car care':              ['Ceramic Coating Spray 500ml', 'Microfiber Detailing Towel Set'],
  'interior accessories':  ['Leather Seat Cover Set', 'Dashboard Phone Mount'],
  'exterior accessories':  ['Roof Rack Cross Bar Set', 'Mud Flap Guard Set 4pc'],
  'oils & fluids':         ['Full Synthetic Motor Oil 5W-30 5L', 'Brake Fluid DOT4 1L'],
  'car audio':             ['6.5" Coaxial Car Speakers Pair', 'Compact Powered Subwoofer 10"'],

  // ── Office & School ──
  'stationery':            ['Premium Gel Pen Set 12 Colors', 'A5 Leather Bound Journal'],
  'office supplies':       ['Desk Organizer Bamboo', 'Paper Shredder Cross-Cut'],
  'school supplies':       ['Student Backpack 30L Waterproof', 'Scientific Calculator FX-991'],
  'art supplies':          ['Acrylic Paint Set 24 Colors', 'Professional Sketch Pencil Set'],
  'desk organizers':       ['Monitor Stand with Drawer', 'Cable Management Box'],
  'paper products':        ['A4 Copy Paper 500 Sheets', 'Sticky Notes Assorted Colors'],

  // ── Toys & Kids ──
  'educational toys':      ['STEM Building Blocks 500pc Set', 'Interactive Globe Learning Toy'],
  'action figures':        ['Superhero Action Figure Collection', 'Dinosaur Figurine Set 12pc'],
  'dolls':                 ['Fashion Doll Dream House Set', 'Soft Baby Doll 40cm'],
  'board games':           ['Strategy Board Game Deluxe Edition', 'Family Trivia Game Night'],
  'puzzles':               ['1000-Piece Jigsaw Puzzle Landscape', 'Wooden Brain Teaser Set'],
  'outdoor toys':          ['Water Gun Super Soaker Large', 'Trampoline 10ft with Safety Net'],
  'baby products':         ['Organic Baby Wipes 12-Pack', 'Silicone Baby Feeding Set'],
  'baby clothes':          ['Organic Cotton Baby Onesie Set 5', 'Newborn Swaddle Blanket Set'],
  'baby gear':             ['Lightweight Stroller Compact Fold', 'Baby Car Seat Group 0+'],

  // ── Books & Media ──
  'books':                 ['Bestseller Novel Collection Box Set', 'Self-Help Guide Hardcover'],
  'ebooks':                ['Digital Cookbook Collection', 'Business Strategy eBook Bundle'],
  'magazines':             ['Monthly Tech Magazine Annual', 'Fashion Magazine Subscription'],

  // ── Pets ──
  'pet food':              ['Premium Dry Dog Food 10kg', 'Organic Cat Food Variety Pack'],
  'pet accessories':       ['Adjustable Dog Harness Large', 'Cat Tree Tower 150cm'],
  'pet toys':              ['Durable Chew Toy Pack 5', 'Interactive Cat Feather Wand'],
  'pet grooming':          ['Pet Grooming Kit Electric', 'Natural Pet Shampoo 500ml'],
  'aquarium':              ['LED Aquarium Light 60cm', 'External Fish Tank Filter'],
  'bird supplies':         ['Large Bird Cage 120cm', 'Premium Seed Mix Bird Food'],

  // ── Food & Grocery ──
  'snacks':                ['Organic Trail Mix Assorted 500g', 'Dark Chocolate Almonds 250g'],
  'beverages':             ['Cold Brew Coffee Concentrate 1L', 'Green Tea Matcha Powder 100g'],
  'dairy':                 ['Organic Greek Yogurt 1kg', 'Artisan Cheese Selection Box'],
  'bakery':                ['Sourdough Bread Artisan Loaf', 'Butter Croissant Box 6'],
  'fresh produce':         ['Organic Vegetable Box Weekly', 'Premium Fruit Basket Mixed'],
  'frozen food':           ['Premium Frozen Shrimp 500g', 'Organic Frozen Berry Mix 1kg'],
  'condiments':            ['Extra Virgin Olive Oil 1L', 'Hot Sauce Collection Set 4'],
  'organic food':          ['Organic Quinoa 1kg', 'Raw Organic Honey 500g'],
};

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────
function generateProductName(categoryName: string, index: number): string {
  const names = PRODUCT_NAMES[categoryName.toLowerCase()];
  if (names && names.length > 0) {
    return names[index % names.length];
  }
  const adjectives = ['Premium', 'Professional', 'Deluxe', 'Essential', 'Classic', 'Modern', 'Ultra', 'Elite'];
  const adj = adjectives[index % adjectives.length];
  return `${adj} ${categoryName} Item ${index + 1}`;
}

function generateDescription(productName: string, categoryName: string): string {
  return `High-quality ${productName} from the ${categoryName} collection. Designed for durability and performance with premium materials. Perfect for everyday use with a modern design aesthetic. Ships from Oman warehouse with fast delivery across GCC.`;
}

function generateShortDescription(productName: string): string {
  return `Premium ${productName} — fast shipping and quality guarantee.`;
}

function generateSKU(index: number): string {
  const ts = Date.now().toString(36).toUpperCase();
  return `SEED-${ts}-${index.toString().padStart(4, '0')}`;
}

function getRandomPrice(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const BRAND_NAMES = [
  'TechPro', 'EliteGear', 'AquaFresh', 'GreenLeaf', 'UrbanStyle',
  'SwiftMotion', 'PureEssence', 'MetalCraft', 'SilkWave', 'CozyHome',
  'BrightStar', 'OceanBreeze', 'MountainPeak', 'GoldenTouch', 'IronClad',
];

function getRandomBrand(): string {
  return BRAND_NAMES[Math.floor(Math.random() * BRAND_NAMES.length)];
}

// ─────────────────────────────────────────────────────────
// CATEGORY TREE BUILDER (same pattern as seed.ts)
// ─────────────────────────────────────────────────────────
async function buildCategoryTree(): Promise<{
  allCategories: CategoryNode[];
  leafCategories: CategoryNode[];
}> {
  console.log('\n--- Loading categories from database ---');
  const allCats = await prisma.category.findMany({
    where: { deletedAt: null, status: Status.ACTIVE },
    select: { id: true, name: true, parentId: true },
    orderBy: { id: 'asc' },
  });
  console.log(`  Total active categories: ${allCats.length}`);

  const nodeMap = new Map<number, CategoryNode>();
  for (const cat of allCats) {
    nodeMap.set(cat.id, {
      id: cat.id,
      name: cat.name,
      parentId: cat.parentId,
      children: [],
      path: cat.name,
    });
  }

  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(node.id);
    }
  }

  function buildPath(node: CategoryNode): string {
    if (node.parentId && nodeMap.has(node.parentId)) {
      return buildPath(nodeMap.get(node.parentId)!) + ' > ' + node.name;
    }
    return node.name;
  }
  for (const node of nodeMap.values()) {
    node.path = buildPath(node);
  }

  const allCategories = [...nodeMap.values()];
  const leafCategories = allCategories.filter(n => n.children.length === 0);
  console.log(`  Leaf categories: ${leafCategories.length}`);
  return { allCategories, leafCategories };
}

// ─────────────────────────────────────────────────────────
// DB HELPERS
// ─────────────────────────────────────────────────────────
async function getSellerId(): Promise<number> {
  for (const email of ['ultrasooq@gmail.com', 'seller@test.com']) {
    const user = await prisma.user.findFirst({
      where: { email, status: Status.ACTIVE },
      select: { id: true },
    });
    if (user) return user.id;
  }
  const company = await prisma.user.findFirst({
    where: { tradeRole: TypeTrader.COMPANY, status: Status.ACTIVE },
    select: { id: true },
  });
  if (company) return company.id;
  throw new Error('No seller/company user found! Run seed.ts first.');
}

const brandCache: Record<string, number> = {};
async function getOrCreateBrand(brandName: string, addedBy: number): Promise<number> {
  if (brandCache[brandName]) return brandCache[brandName];
  let brand = await prisma.brand.findFirst({ where: { brandName, deletedAt: null } });
  if (!brand) {
    brand = await prisma.brand.create({
      data: { brandName, status: Status.ACTIVE, addedBy, brandType: 'ADMIN' },
    });
  }
  brandCache[brandName] = brand.id;
  return brand.id;
}

async function getCountryListId(countryName: string): Promise<number | null> {
  const c = await prisma.countryList.findFirst({ where: { countryName, status: Status.ACTIVE } });
  return c?.id ?? null;
}

async function getCountryId(name: string): Promise<number | null> {
  const c = await prisma.countries.findFirst({ where: { name, status: Status.ACTIVE } });
  return c?.id ?? null;
}

// ═══════════════════════════════════════════════════════════
// MAIN SEED FUNCTION
// ═══════════════════════════════════════════════════════════
async function seedProducts(): Promise<void> {
  console.log('========================================');
  console.log('  Ultrasooq Product Seed Script');
  console.log('  100 Products · All Categories · All Types');
  console.log('========================================');

  // 1. Load categories
  const { leafCategories } = await buildCategoryTree();
  if (leafCategories.length === 0) {
    console.error('No leaf categories found! Seed categories first.');
    return;
  }

  // 2. Get seller
  const sellerId = await getSellerId();
  console.log(`\n  Seller userId: ${sellerId}`);

  // 3. Get Oman IDs (may be null if countries not seeded yet)
  const omanCountryListId = await getCountryListId('Oman');
  const omanCountryId = await getCountryId('Oman');
  console.log(`  Oman CountryList ID: ${omanCountryListId ?? 'not found'}`);
  console.log(`  Oman Countries ID: ${omanCountryId ?? 'not found'}`);

  // 4. Shuffle leaves for variety
  const shuffled = [...leafCategories].sort(() => Math.random() - 0.5);
  let catIdx = 0;
  const pickCat = () => shuffled[catIdx++ % shuffled.length];

  // ──────────────────────────────────────────────────────
  // BUILD 100 PRODUCT DEFINITIONS
  // Distribution:
  //   50 NORMALSELL (Store, menu=8)
  //   20 BUYGROUP   (BuyGroup, menu=9)
  //   10 WHOLESALE   (Store, menu=8)
  //    5 TRIAL       (Store, menu=8)
  //   10 FACTORY     (Factories, menu=10, productType=F)
  //    5 RFQ         (productType=R)
  // ──────────────────────────────────────────────────────
  const products: ProductDef[] = [];
  let nameIdx = 0;

  // ── 50 NORMALSELL ──
  console.log('\n--- 50 NORMALSELL (Store) ---');
  for (let i = 0; i < 50; i++) {
    const cat = pickCat();
    const name = generateProductName(cat.name, nameIdx++);
    const price = getRandomPrice(5, 500);
    const disc = getRandomInt(0, 30);
    const offer = Math.round(price * (1 - disc / 100) * 100) / 100;
    products.push({
      productName: name,
      description: generateDescription(name, cat.name),
      shortDescription: generateShortDescription(name),
      price, offerPrice: offer,
      productType: ProductType.P,
      typeOfProduct: TypeOfProduct.BRAND,
      typeProduct: TypeProduct.VENDORLOCAL,
      sellType: SellType.NORMALSELL,
      consumerType: ConsumerType.EVERYONE,
      menuId: 8,
      stock: getRandomInt(10, 500),
      minQuantity: 1,
      maxQuantity: getRandomInt(10, 100),
      consumerDiscount: disc,
      vendorDiscount: Math.min(disc + 5, 50),
      isCustomProduct: 'no',
      categoryId: cat.id, categoryName: cat.name, categoryPath: cat.path,
    });
  }

  // ── 20 BUYGROUP ──
  console.log('--- 20 BUYGROUP ---');
  for (let i = 0; i < 20; i++) {
    const cat = pickCat();
    const name = `[Group Buy] ${generateProductName(cat.name, nameIdx++)}`;
    const price = getRandomPrice(20, 800);
    const disc = getRandomInt(15, 40);
    const offer = Math.round(price * (1 - disc / 100) * 100) / 100;
    products.push({
      productName: name,
      description: `Group buying deal! ${generateDescription(name, cat.name)}`,
      shortDescription: `Group buy — up to ${disc}% off.`,
      price, offerPrice: offer,
      productType: ProductType.P,
      typeOfProduct: TypeOfProduct.BRAND,
      typeProduct: TypeProduct.VENDORLOCAL,
      sellType: SellType.BUYGROUP,
      consumerType: ConsumerType.EVERYONE,
      menuId: 9,
      stock: getRandomInt(50, 1000),
      minQuantity: getRandomInt(5, 20),
      maxQuantity: getRandomInt(50, 200),
      consumerDiscount: disc,
      vendorDiscount: disc + 5,
      isCustomProduct: 'no',
      categoryId: cat.id, categoryName: cat.name, categoryPath: cat.path,
    });
  }

  // ── 10 WHOLESALE ──
  console.log('--- 10 WHOLESALE ---');
  for (let i = 0; i < 10; i++) {
    const cat = pickCat();
    const name = `[Wholesale] ${generateProductName(cat.name, nameIdx++)}`;
    const price = getRandomPrice(50, 1000);
    const offer = Math.round(price * 0.7 * 100) / 100;
    products.push({
      productName: name,
      description: `Wholesale bulk pricing. ${generateDescription(name, cat.name)}`,
      shortDescription: `Wholesale pricing — bulk discount.`,
      price, offerPrice: offer,
      productType: ProductType.P,
      typeOfProduct: TypeOfProduct.BRAND,
      typeProduct: TypeProduct.BRAND,
      sellType: SellType.WHOLESALE_PRODUCT,
      consumerType: ConsumerType.VENDORS,
      menuId: 8,
      stock: getRandomInt(100, 5000),
      minQuantity: getRandomInt(10, 50),
      maxQuantity: getRandomInt(500, 2000),
      consumerDiscount: 0,
      vendorDiscount: 30,
      isCustomProduct: 'no',
      categoryId: cat.id, categoryName: cat.name, categoryPath: cat.path,
    });
  }

  // ── 5 TRIAL ──
  console.log('--- 5 TRIAL ---');
  for (let i = 0; i < 5; i++) {
    const cat = pickCat();
    const name = `[Trial] ${generateProductName(cat.name, nameIdx++)}`;
    const price = getRandomPrice(5, 50);
    const offer = Math.round(price * 0.1 * 100) / 100;
    products.push({
      productName: name,
      description: `Try before you buy! ${generateDescription(name, cat.name)}`,
      shortDescription: `Trial product — introductory price.`,
      price, offerPrice: offer,
      productType: ProductType.P,
      typeOfProduct: TypeOfProduct.OWNBRAND,
      typeProduct: TypeProduct.VENDORLOCAL,
      sellType: SellType.TRIAL_PRODUCT,
      consumerType: ConsumerType.EVERYONE,
      menuId: 8,
      stock: getRandomInt(5, 50),
      minQuantity: 1,
      maxQuantity: 2,
      consumerDiscount: 90,
      vendorDiscount: 0,
      isCustomProduct: 'no',
      categoryId: cat.id, categoryName: cat.name, categoryPath: cat.path,
    });
  }

  // ── 10 FACTORY / CUSTOM (productType=F) ──
  console.log('--- 10 FACTORY/CUSTOM ---');
  for (let i = 0; i < 10; i++) {
    const cat = pickCat();
    const name = `[Custom] ${generateProductName(cat.name, nameIdx++)}`;
    const price = getRandomPrice(100, 2000);
    products.push({
      productName: name,
      description: `Customizable to your specs. ${generateDescription(name, cat.name)}`,
      shortDescription: `Custom made to order.`,
      price, offerPrice: price,
      productType: ProductType.F,
      typeOfProduct: TypeOfProduct.OWNBRAND,
      typeProduct: TypeProduct.VENDORLOCAL,
      sellType: SellType.NORMALSELL,
      consumerType: ConsumerType.EVERYONE,
      menuId: 10,
      stock: getRandomInt(1, 100),
      minQuantity: getRandomInt(1, 10),
      maxQuantity: getRandomInt(50, 500),
      consumerDiscount: 0,
      vendorDiscount: 0,
      isCustomProduct: 'yes',
      categoryId: cat.id, categoryName: cat.name, categoryPath: cat.path,
    });
  }

  // ── 5 RFQ (productType=R) ──
  console.log('--- 5 RFQ ---');
  for (let i = 0; i < 5; i++) {
    const cat = pickCat();
    const name = `[RFQ] ${generateProductName(cat.name, nameIdx++)}`;
    const price = getRandomPrice(500, 5000);
    products.push({
      productName: name,
      description: `Request for Quote. ${generateDescription(name, cat.name)}`,
      shortDescription: `RFQ — contact seller for pricing.`,
      price, offerPrice: price,
      productType: ProductType.R,
      typeOfProduct: TypeOfProduct.BRAND,
      typeProduct: TypeProduct.BRAND,
      sellType: SellType.NORMALSELL,
      consumerType: ConsumerType.EVERYONE,
      menuId: 8,
      stock: getRandomInt(1, 50),
      minQuantity: 1,
      maxQuantity: getRandomInt(10, 100),
      consumerDiscount: 0,
      vendorDiscount: 0,
      isCustomProduct: 'no',
      categoryId: cat.id, categoryName: cat.name, categoryPath: cat.path,
    });
  }

  console.log(`\n  Total product definitions: ${products.length}`);

  // ──────────────────────────────────────────────────────
  // INSERT INTO DATABASE
  // ──────────────────────────────────────────────────────
  console.log('\n--- Inserting products into database ---');
  let created = 0;
  let skipped = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const sku = generateSKU(i);

    try {
      // Skip if same-name product already exists for this seller
      const existing = await prisma.product.findFirst({
        where: { productName: p.productName, userId: sellerId, deletedAt: null },
      });
      if (existing) {
        console.log(`  [skip] "${p.productName}" exists (id=${existing.id})`);
        skipped++;
        continue;
      }

      // Brand
      const brandId = await getOrCreateBrand(getRandomBrand(), sellerId);

      // Product
      const product = await prisma.product.create({
        data: {
          productName: p.productName,
          categoryId: p.categoryId,
          skuNo: sku,
          productPrice: p.price,
          offerPrice: p.offerPrice,
          description: p.description,
          shortDescription: p.shortDescription,
          status: Status.ACTIVE,
          brandId,
          placeOfOriginId: omanCountryListId,
          userId: sellerId,
          adminId: sellerId,
          categoryLocation: p.categoryPath,
          productType: p.productType,
          typeOfProduct: p.typeOfProduct,
          typeProduct: p.typeProduct,
        },
      });

      // ProductPrice
      const dateOpen = new Date();
      const dateClose = new Date();
      dateClose.setFullYear(dateClose.getFullYear() + 1);

      await prisma.productPrice.create({
        data: {
          productId: product.id,
          adminId: sellerId,
          productPrice: p.price,
          offerPrice: p.offerPrice,
          status: Status.ACTIVE,
          sellType: p.sellType,
          consumerType: p.consumerType,
          stock: p.stock,
          minQuantity: p.minQuantity,
          maxQuantity: p.maxQuantity,
          minQuantityPerCustomer: p.minQuantity,
          maxQuantityPerCustomer: p.stock,
          consumerDiscount: p.consumerDiscount,
          vendorDiscount: p.vendorDiscount,
          consumerDiscountType: p.consumerDiscount > 0 ? 'percentage' : null,
          vendorDiscountType: p.vendorDiscount > 0 ? 'percentage' : null,
          productCondition: 'new',
          dateOpen,
          dateClose,
          startTime: '00:00',
          endTime: '23:59',
          menuId: p.menuId,
          isCustomProduct: p.isCustomProduct,
          productCountryId: omanCountryId,
          enableChat: p.productType === ProductType.F || p.productType === ProductType.R,
          askForPrice: p.productType === ProductType.R ? 'yes' : 'no',
          askForStock: p.productType === ProductType.R ? 'yes' : 'no',
          askForSell: 'no',
          hideAllSelected: false,
        },
      });

      // ProductImages (3 placeholder images)
      const imageUrls = [
        `https://placehold.co/600x600/EEE/31343C?text=${encodeURIComponent(p.productName.substring(0, 20))}`,
        `https://placehold.co/600x600/DDD/31343C?text=Image+2`,
        `https://placehold.co/600x600/CCC/31343C?text=Image+3`,
      ];
      for (const imgUrl of imageUrls) {
        await prisma.productImages.create({
          data: {
            productId: product.id,
            image: imgUrl,
            imageName: `product-${product.id}-img`,
            status: Status.ACTIVE,
          },
        });
      }

      // ProductShortDescription
      await prisma.productShortDescription.create({
        data: {
          productId: product.id,
          adminId: sellerId,
          shortDescription: p.shortDescription,
          status: Status.ACTIVE,
        },
      });

      // ProductSellCountry (sell in Oman)
      if (omanCountryId) {
        await prisma.productSellCountry.create({
          data: {
            productId: product.id,
            countryId: omanCountryId,
            countryName: 'Oman',
            status: Status.ACTIVE,
          },
        });
      }

      // ProductSpecification (3 generic specs)
      const specs = [
        { label: 'Brand', specification: BRAND_NAMES[Math.floor(Math.random() * BRAND_NAMES.length)] },
        { label: 'Condition', specification: 'New' },
        { label: 'Warranty', specification: '1 Year Manufacturer Warranty' },
      ];
      for (const spec of specs) {
        await prisma.productSpecification.create({
          data: {
            productId: product.id,
            adminId: sellerId,
            label: spec.label,
            specification: spec.specification,
            status: Status.ACTIVE,
          },
        });
      }

      created++;
      const typeLabel =
        p.sellType === SellType.BUYGROUP         ? 'BUYGROUP'  :
        p.sellType === SellType.WHOLESALE_PRODUCT ? 'WHOLESALE' :
        p.sellType === SellType.TRIAL_PRODUCT     ? 'TRIAL'     :
        p.productType === ProductType.F           ? 'FACTORY'   :
        p.productType === ProductType.R           ? 'RFQ'       :
        'NORMALSELL';

      console.log(`  [${created}/${products.length}] "${p.productName}" (${typeLabel}) cat="${p.categoryName}" menu=${p.menuId}`);
    } catch (error: any) {
      console.error(`  [ERR] "${p.productName}": ${error.message}`);
    }
  }

  // ── SUMMARY ──
  const totalProducts = await prisma.product.count({ where: { deletedAt: null, status: Status.ACTIVE } });
  const totalPrices   = await prisma.productPrice.count({ where: { deletedAt: null, status: Status.ACTIVE } });
  const totalImages   = await prisma.productImages.count({ where: { deletedAt: null, status: Status.ACTIVE } });

  console.log('\n========================================');
  console.log('  Product Seed Summary');
  console.log(`    Created: ${created}`);
  console.log(`    Skipped: ${skipped}`);
  console.log(`    Total products in DB: ${totalProducts}`);
  console.log(`    Total product prices:  ${totalPrices}`);
  console.log(`    Total product images:  ${totalImages}`);
  console.log('  Done!');
  console.log('========================================');
}

// ─────────────────────────────────────────────────────────
// RUN
// ─────────────────────────────────────────────────────────
seedProducts()
  .catch((e) => {
    console.error('\nProduct seed failed:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
