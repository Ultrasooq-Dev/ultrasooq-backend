import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

// PROD_DATABASE_URL takes precedence (explicit prod target). Falls back to DATABASE_URL.
const url = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL;
if (!url) { console.error('No DATABASE_URL set'); process.exit(1); }
const pool = new pg.Pool({ connectionString: url });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as any);

const SKU_PREFIX = 'HSEED-';
const ORDER_NO_PREFIX = 'HSEED-ORD-';

// Sellers + buyers (verified existing in DB - both local and prod)
const SELLERS = [13, 14, 15, 16, 17];
const BUYERS = [18, 19, 20, 21, 22, 23];

// Category targets matched to homepage section filters
const CONSUMER_ELECTRONICS = [13, 43, 74];     // Mobile Phones, Computers & Office, Audio & Video
const HOME_DECOR = [228, 214, 195];            // Home Decor, Kitchen & Dining, Furniture
const FASHION_BEAUTY = [107, 143, 256, 275, 290]; // Men's/Women's Clothing, Skincare, Makeup, Fragrances

// Brand IDs from existing DB (id 2-16: Apple, Samsung, Sony, LG, Huawei, Dell, HP, Lenovo, Nike, Adidas, Zara, ...)
const BRAND_BY_NAME: Record<string, number> = {
  Apple: 2, Samsung: 3, Sony: 4, LG: 5, Huawei: 6, Dell: 7, HP: 8, Lenovo: 9,
  Nike: 10, Adidas: 11, Zara: 12, Bosch: 16,
};

type SeedSpec = [string, string];
interface SeedProduct {
  name: string;
  desc: string;
  short: string;
  brand: string;
  catId: number;
  basePrice: number;
  offerPrice: number;
  stock: number;
  images: string[];
  specs: SeedSpec[];
  // Homepage flags
  isDeal?: boolean;          // gets BUYGROUP price + orders
  hotDealPct?: number;       // consumerDiscount % (0-100)
  reviewCount?: number;      // 0 = no reviews, default 5
  avgRating?: number;        // 1-5, default 4.5
  soldCount?: number;        // for best sellers (only used when isDeal)
}

// ─── Realistic catalog ────────────────────────────────────────────
const PRODUCTS: SeedProduct[] = [
  // ─── Consumer Electronics ─────────────────────────────────────
  // Mobile Phones (cat 13)
  { name: 'iPhone 15 Pro Max 256GB', desc: 'Titanium design, A17 Pro chip, 5x Telephoto camera, USB-C, Action Button.', short: 'Flagship iPhone with titanium body and pro camera system', brand: 'Apple', catId: 13, basePrice: 1199, offerPrice: 1099, stock: 35,
    images: ['https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=900&q=80','https://images.unsplash.com/photo-1592286927505-1def25115558?w=900&q=80','https://images.unsplash.com/photo-1605236453806-6ff36851218e?w=900&q=80'],
    specs: [['Display','6.7" Super Retina XDR'],['Chip','A17 Pro'],['Storage','256GB'],['Camera','48MP Main + 12MP UW + 12MP 5x Tele'],['Battery','4422 mAh'],['Material','Titanium']],
    isDeal: true, hotDealPct: 10, reviewCount: 18, avgRating: 4.8, soldCount: 142 },
  { name: 'Samsung Galaxy S24 Ultra 512GB', desc: 'Snapdragon 8 Gen 3, Galaxy AI, S Pen, 200MP camera, 5000 mAh battery.', short: 'Premium Galaxy with AI features and built-in S Pen', brand: 'Samsung', catId: 13, basePrice: 1299, offerPrice: 1149, stock: 22,
    images: ['https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=900&q=80','https://images.unsplash.com/photo-1565849904461-04a58ad377e0?w=900&q=80'],
    specs: [['Display','6.8" Dynamic AMOLED 2X 120Hz'],['Chip','Snapdragon 8 Gen 3'],['Storage','512GB'],['Camera','200MP + 50MP + 12MP + 10MP'],['Battery','5000 mAh']],
    isDeal: true, hotDealPct: 12, reviewCount: 24, avgRating: 4.7, soldCount: 98 },
  { name: 'Google Pixel 8 Pro', desc: 'Google Tensor G3, Magic Editor, 50MP triple camera, 7-year update promise.', short: 'AI-powered Pixel with computational photography', brand: 'Samsung', catId: 13, basePrice: 999, offerPrice: 899, stock: 40,
    images: ['https://images.unsplash.com/photo-1598327105666-5b89351aff97?w=900&q=80','https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=900&q=80'],
    specs: [['Display','6.7" LTPO OLED'],['Chip','Tensor G3'],['Storage','256GB'],['Battery','5050 mAh']],
    hotDealPct: 15, reviewCount: 9, avgRating: 4.5 },
  { name: 'Apple AirPods Pro (2nd Gen)', desc: 'Active Noise Cancellation, Adaptive Audio, USB-C charging case.', short: 'True wireless earbuds with adaptive ANC', brand: 'Apple', catId: 13, basePrice: 249, offerPrice: 219, stock: 180,
    images: ['https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=900&q=80','https://images.unsplash.com/photo-1606220838315-056192d5e927?w=900&q=80'],
    specs: [['Type','In-ear true wireless'],['ANC','Adaptive'],['Battery','6h + 30h case'],['Connector','USB-C']],
    isDeal: true, reviewCount: 32, avgRating: 4.8, soldCount: 215 },
  { name: 'Anker 100W USB-C Charger', desc: 'GaN II tech, 4-port fast charger for laptop, phone and tablet.', short: 'Compact 4-port GaN charger for travel', brand: 'Sony', catId: 13, basePrice: 79, offerPrice: 59, stock: 250,
    images: ['https://images.unsplash.com/photo-1583394838336-acd977736f90?w=900&q=80'],
    specs: [['Power','100W'],['Ports','3x USB-C + 1x USB-A'],['Tech','GaN II']],
    hotDealPct: 25, reviewCount: 14, avgRating: 4.6 },
  { name: 'Belkin BoostCharge MagSafe Stand', desc: '15W wireless charger optimized for iPhone with MagSafe.', short: 'MagSafe wireless charger for desk', brand: 'Apple', catId: 13, basePrice: 65, offerPrice: 49, stock: 120,
    images: ['https://images.unsplash.com/photo-1611605698335-8b1569810432?w=900&q=80'],
    specs: [['Power','15W MagSafe'],['Material','Aluminum + silicone']],
    hotDealPct: 18, reviewCount: 6, avgRating: 4.4 },

  // Computers & Office (cat 43)
  { name: 'MacBook Pro 14" M3 Pro', desc: 'M3 Pro chip, 18GB unified memory, 512GB SSD, Liquid Retina XDR display.', short: 'Pro laptop for creative workflows', brand: 'Apple', catId: 43, basePrice: 2499, offerPrice: 2299, stock: 18,
    images: ['https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=900&q=80','https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=900&q=80'],
    specs: [['Display','14" Liquid Retina XDR 120Hz'],['Chip','M3 Pro 11-core'],['Memory','18GB'],['Storage','512GB SSD'],['Battery','Up to 18h']],
    isDeal: true, hotDealPct: 8, reviewCount: 22, avgRating: 4.9, soldCount: 56 },
  { name: 'Dell XPS 15 (Core i7, 16GB)', desc: '15.6" 4K OLED, Intel i7-13700H, 16GB RAM, 512GB SSD, NVIDIA RTX 4050.', short: 'Premium Windows ultrabook with OLED display', brand: 'Dell', catId: 43, basePrice: 1899, offerPrice: 1699, stock: 14,
    images: ['https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=900&q=80','https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=900&q=80'],
    specs: [['Display','15.6" 4K OLED'],['CPU','Intel i7-13700H'],['RAM','16GB'],['Storage','512GB SSD'],['GPU','RTX 4050']],
    hotDealPct: 11, reviewCount: 11, avgRating: 4.5 },
  { name: 'Lenovo ThinkPad X1 Carbon Gen 11', desc: 'Business ultrabook with 13th Gen Intel, 14" 2.8K OLED, MIL-STD durability.', short: 'Lightweight business laptop', brand: 'Lenovo', catId: 43, basePrice: 1799, offerPrice: 1599, stock: 12,
    images: ['https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=900&q=80'],
    specs: [['Display','14" 2.8K OLED'],['CPU','Intel i7-1365U vPro'],['RAM','16GB'],['Storage','512GB SSD'],['Weight','1.12 kg']],
    reviewCount: 8, avgRating: 4.6 },
  { name: 'Logitech MX Master 3S', desc: 'Wireless ergonomic mouse, 8000 DPI, quiet clicks, MagSpeed scroll.', short: 'Productivity mouse for power users', brand: 'HP', catId: 43, basePrice: 119, offerPrice: 89, stock: 220,
    images: ['https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=900&q=80','https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?w=900&q=80'],
    specs: [['Sensor','Darkfield 8000 DPI'],['Buttons','7'],['Battery','70 days'],['Connectivity','BT + USB']],
    hotDealPct: 25, reviewCount: 28, avgRating: 4.7 },
  { name: 'LG UltraFine 27" 4K Monitor', desc: '27" 4K IPS panel, USB-C 96W power delivery, P3 99% color.', short: '4K USB-C monitor for Mac and PC', brand: 'LG', catId: 43, basePrice: 749, offerPrice: 649, stock: 24,
    images: ['https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=900&q=80'],
    specs: [['Size','27"'],['Resolution','4K UHD'],['Panel','IPS'],['Color','P3 99%'],['USB-C','96W PD']],
    hotDealPct: 14, reviewCount: 7, avgRating: 4.4 },

  // Audio & Video (cat 74)
  { name: 'Sony WH-1000XM5', desc: 'Industry-leading noise cancellation, 30hr battery, multipoint Bluetooth, LDAC.', short: 'Reference noise-cancelling headphones', brand: 'Sony', catId: 74, basePrice: 399, offerPrice: 329, stock: 90,
    images: ['https://images.unsplash.com/photo-1583394838336-acd977736f90?w=900&q=80','https://images.unsplash.com/photo-1545127398-14699f92334b?w=900&q=80','https://images.unsplash.com/photo-1546435770-a3e426bf472b?w=900&q=80'],
    specs: [['Driver','30mm'],['ANC','Adaptive'],['Bluetooth','5.2 LDAC'],['Battery','30hr'],['Weight','250g']],
    isDeal: true, hotDealPct: 18, reviewCount: 41, avgRating: 4.8, soldCount: 178 },
  { name: 'Bose QuietComfort Ultra Earbuds', desc: 'Immersive Audio with head-tracking, CustomTune ANC, IPX4 rated.', short: 'Premium spatial-audio earbuds', brand: 'Sony', catId: 74, basePrice: 299, offerPrice: 269, stock: 80,
    images: ['https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=900&q=80'],
    specs: [['Type','True wireless'],['ANC','CustomTune'],['Audio','Immersive head-tracked'],['Battery','6h + 18h case']],
    hotDealPct: 10, reviewCount: 13, avgRating: 4.6 },
  { name: 'JBL Flip 6 Bluetooth Speaker', desc: 'Portable IP67 speaker with PartyBoost, 12hr battery and racetrack driver.', short: 'Waterproof portable Bluetooth speaker', brand: 'Sony', catId: 74, basePrice: 129, offerPrice: 99, stock: 200,
    images: ['https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=900&q=80'],
    specs: [['Battery','12 hours'],['Waterproof','IP67'],['Bluetooth','5.1'],['Power','30W']],
    isDeal: true, hotDealPct: 23, reviewCount: 19, avgRating: 4.5, soldCount: 92 },
  { name: 'Sonos Beam Gen 2 Soundbar', desc: 'Compact Dolby Atmos soundbar with HDMI eARC, AirPlay 2 and voice control.', short: 'Compact Atmos soundbar for the living room', brand: 'Sony', catId: 74, basePrice: 499, offerPrice: 449, stock: 30,
    images: ['https://images.unsplash.com/photo-1545454675-3531b543be5d?w=900&q=80'],
    specs: [['Audio','Dolby Atmos virtualized'],['Connectivity','HDMI eARC, Wi-Fi'],['Voice','Alexa + Google'],['Drivers','5']],
    reviewCount: 6, avgRating: 4.4 },
  { name: 'Sennheiser HD 660S2', desc: 'Open-back audiophile headphones with refined 38mm transducers.', short: 'Audiophile open-back headphones', brand: 'Sony', catId: 74, basePrice: 599, offerPrice: 499, stock: 18,
    images: ['https://images.unsplash.com/photo-1599669454699-248893623440?w=900&q=80'],
    specs: [['Type','Open-back over-ear'],['Driver','38mm'],['Impedance','300 Ω'],['Connector','Detachable']],
    hotDealPct: 17, reviewCount: 15, avgRating: 4.7 },

  // ─── Home & Decor ─────────────────────────────────────────────
  // Home Decor (cat 228)
  { name: 'Modern Wall Art Set (3-piece)', desc: 'Abstract framed canvas trio for living room, 40x60cm each, ready to hang.', short: '3-piece framed canvas wall art', brand: 'Bosch', catId: 228, basePrice: 129, offerPrice: 89, stock: 120,
    images: ['https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=900&q=80','https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=900&q=80'],
    specs: [['Pieces','3'],['Size','40x60cm each'],['Material','Canvas + wood frame'],['Style','Modern abstract']],
    hotDealPct: 31, reviewCount: 22, avgRating: 4.6 },
  { name: 'Round Decorative Mirror 80cm', desc: 'Brushed gold finish iron-frame mirror, perfect for hallway or living room.', short: 'Gold-frame round wall mirror', brand: 'Bosch', catId: 228, basePrice: 159, offerPrice: 119, stock: 60,
    images: ['https://images.unsplash.com/photo-1595428774223-ef52624120d2?w=900&q=80','https://images.unsplash.com/photo-1542219550-37153d387c27?w=900&q=80'],
    specs: [['Diameter','80cm'],['Frame','Brushed gold metal'],['Mounting','Wall hook included']],
    isDeal: true, hotDealPct: 25, reviewCount: 11, avgRating: 4.5, soldCount: 64 },
  { name: 'Soy Wax Scented Candle Trio', desc: 'Hand-poured soy candles in amber, sandalwood and oud, 220g each.', short: 'Set of 3 hand-poured soy candles', brand: 'Bosch', catId: 228, basePrice: 65, offerPrice: 49, stock: 240,
    images: ['https://images.unsplash.com/photo-1503602642458-232111445657?w=900&q=80','https://images.unsplash.com/photo-1603006905003-be475563bc59?w=900&q=80'],
    specs: [['Set','3 candles'],['Wax','100% soy'],['Burn time','40 hours each'],['Scents','Amber, Sandalwood, Oud']],
    hotDealPct: 24, reviewCount: 18, avgRating: 4.7 },
  { name: 'Standing Floor Lamp - Black Tripod', desc: 'Mid-century tripod floor lamp with linen drum shade, 160cm tall.', short: 'Mid-century tripod floor lamp', brand: 'Bosch', catId: 228, basePrice: 189, offerPrice: 149, stock: 55,
    images: ['https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=900&q=80'],
    specs: [['Height','160cm'],['Material','Wood + metal'],['Bulb','E27 (not included)'],['Shade','Linen drum']],
    reviewCount: 5, avgRating: 4.3 },

  // Kitchen & Dining (cat 214)
  { name: 'Stoneware Dinnerware Set (16-piece)', desc: '16-piece glazed stoneware set for 4, dishwasher and microwave safe.', short: 'Stoneware dinnerware for 4', brand: 'Bosch', catId: 214, basePrice: 199, offerPrice: 149, stock: 70,
    images: ['https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?w=900&q=80','https://images.unsplash.com/photo-1610375461246-83df859d849d?w=900&q=80'],
    specs: [['Pieces','16'],['Service','4 settings'],['Material','Stoneware'],['Dishwasher','Yes']],
    isDeal: true, hotDealPct: 25, reviewCount: 17, avgRating: 4.5, soldCount: 88 },
  { name: 'Copper-Bottom 10pc Cookware Set', desc: 'Tri-ply stainless steel with copper core, induction compatible.', short: '10-piece tri-ply cookware set', brand: 'Bosch', catId: 214, basePrice: 449, offerPrice: 349, stock: 28,
    images: ['https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=900&q=80'],
    specs: [['Pieces','10'],['Material','Tri-ply stainless'],['Core','Copper'],['Induction','Yes']],
    hotDealPct: 22, reviewCount: 14, avgRating: 4.7 },
  { name: 'De\'Longhi La Specialista Espresso Machine', desc: 'Dual-heater semi-automatic espresso machine with active temperature control.', short: 'Semi-automatic espresso machine', brand: 'Bosch', catId: 214, basePrice: 899, offerPrice: 749, stock: 16,
    images: ['https://images.unsplash.com/photo-1610889556528-9a770e32642f?w=900&q=80','https://images.unsplash.com/photo-1572119865084-43c285814d63?w=900&q=80'],
    specs: [['Type','Semi-automatic'],['Pressure','15 bar'],['Heaters','Dual'],['Tank','2L']],
    reviewCount: 12, avgRating: 4.8 },
  { name: 'Modern 24-piece Cutlery Set', desc: 'Brushed stainless steel flatware for 6, dishwasher safe.', short: 'Stainless flatware for 6', brand: 'Bosch', catId: 214, basePrice: 89, offerPrice: 59, stock: 140,
    images: ['https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=900&q=80'],
    specs: [['Pieces','24'],['Service','6'],['Material','18/10 stainless'],['Finish','Brushed']],
    hotDealPct: 30, reviewCount: 8, avgRating: 4.4 },

  // Furniture (cat 195)
  { name: 'Mid-century Velvet Sofa - Forest Green', desc: '3-seater velvet sofa with solid beech legs, 210cm wide.', short: '3-seater velvet sofa', brand: 'Bosch', catId: 195, basePrice: 1499, offerPrice: 1199, stock: 8,
    images: ['https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=900&q=80','https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=900&q=80'],
    specs: [['Seats','3'],['Width','210cm'],['Upholstery','Velvet'],['Frame','Solid beech']],
    isDeal: true, hotDealPct: 20, reviewCount: 9, avgRating: 4.6, soldCount: 23 },
  { name: 'Solid Oak Dining Table 180cm', desc: 'FSC-certified solid oak dining table, seats 6 comfortably.', short: 'Solid oak dining table', brand: 'Bosch', catId: 195, basePrice: 999, offerPrice: 799, stock: 12,
    images: ['https://images.unsplash.com/photo-1530018607912-eff2daa1bac4?w=900&q=80'],
    specs: [['Length','180cm'],['Seats','6'],['Material','FSC oak'],['Finish','Natural oil']],
    hotDealPct: 20, reviewCount: 6, avgRating: 4.5 },
  { name: 'Linen Upholstered Bed Frame - Queen', desc: 'Queen-size bed with channel-tufted headboard, slatted base, no box spring needed.', short: 'Queen platform bed with tufted headboard', brand: 'Bosch', catId: 195, basePrice: 899, offerPrice: 699, stock: 18,
    images: ['https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=900&q=80'],
    specs: [['Size','Queen'],['Headboard','Channel-tufted linen'],['Base','Slatted (no box spring)']],
    reviewCount: 4, avgRating: 4.3 },
  { name: 'Walnut Bookshelf - 5 Tier', desc: 'Open 5-tier walnut bookshelf, 180cm tall, anti-tip kit included.', short: '5-tier walnut bookshelf', brand: 'Bosch', catId: 195, basePrice: 449, offerPrice: 349, stock: 32,
    images: ['https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&q=80'],
    specs: [['Tiers','5'],['Height','180cm'],['Material','Walnut veneer'],['Safety','Anti-tip kit']],
    hotDealPct: 22, reviewCount: 7, avgRating: 4.4 },

  // ─── Fashion & Beauty ─────────────────────────────────────────
  // Men's Clothing (cat 107)
  { name: 'Wool Blend Tailored Blazer - Navy', desc: 'Slim-fit blazer in Italian wool blend with single-breasted notch lapel.', short: 'Slim-fit navy wool blazer', brand: 'Zara', catId: 107, basePrice: 299, offerPrice: 219, stock: 60,
    images: ['https://images.unsplash.com/photo-1542362567-b07e54358753?w=900&q=80','https://images.unsplash.com/photo-1617137968427-85924c800a22?w=900&q=80'],
    specs: [['Fit','Slim'],['Material','70% wool, 30% poly'],['Lining','Full'],['Care','Dry clean']],
    isDeal: true, hotDealPct: 27, reviewCount: 14, avgRating: 4.5, soldCount: 47 },
  { name: 'Premium Linen Shirt - White', desc: 'Breathable European linen shirt with mother-of-pearl buttons.', short: 'Long-sleeve white linen shirt', brand: 'Zara', catId: 107, basePrice: 89, offerPrice: 65, stock: 220,
    images: ['https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=900&q=80'],
    specs: [['Material','100% European linen'],['Fit','Regular'],['Buttons','Mother-of-pearl']],
    hotDealPct: 27, reviewCount: 11, avgRating: 4.4 },

  // Women's Clothing (cat 143)
  { name: 'Silk Slip Midi Dress', desc: '100% silk bias-cut slip dress with adjustable straps and side slit.', short: 'Bias-cut silk midi dress', brand: 'Zara', catId: 143, basePrice: 249, offerPrice: 199, stock: 80,
    images: ['https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=900&q=80','https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&q=80'],
    specs: [['Material','100% silk'],['Length','Midi'],['Care','Dry clean']],
    isDeal: true, hotDealPct: 20, reviewCount: 21, avgRating: 4.6, soldCount: 73 },
  { name: 'Cashmere Crewneck Sweater', desc: 'Pure Mongolian cashmere crewneck, 14-gauge knit, ribbed trims.', short: '100% cashmere crewneck', brand: 'Zara', catId: 143, basePrice: 229, offerPrice: 179, stock: 95,
    images: ['https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=900&q=80'],
    specs: [['Material','100% cashmere'],['Gauge','14'],['Care','Hand wash cold']],
    hotDealPct: 22, reviewCount: 17, avgRating: 4.7 },
  { name: 'Wide-leg Tailored Trousers', desc: 'High-waist wide-leg trousers in stretch wool blend, ankle length.', short: 'Wide-leg high-waist trousers', brand: 'Zara', catId: 143, basePrice: 149, offerPrice: 109, stock: 130,
    images: ['https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=900&q=80'],
    specs: [['Material','Wool blend stretch'],['Fit','High-waist wide leg'],['Length','Ankle']],
    hotDealPct: 27, reviewCount: 9, avgRating: 4.3 },

  // Skincare (cat 256)
  { name: 'Vitamin C 15% Brightening Serum', desc: 'L-ascorbic acid serum with vitamin E and ferulic acid for radiance.', short: 'Brightening vitamin C facial serum', brand: 'Zara', catId: 256, basePrice: 75, offerPrice: 55, stock: 320,
    images: ['https://images.unsplash.com/photo-1556228720-195a672e8a03?w=900&q=80','https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=900&q=80'],
    specs: [['Volume','30ml'],['Active','15% L-ascorbic acid'],['Skin type','All']],
    isDeal: true, hotDealPct: 27, reviewCount: 38, avgRating: 4.7, soldCount: 156 },
  { name: 'Hyaluronic Acid Daily Moisturizer', desc: 'Lightweight gel-cream moisturizer with multi-weight hyaluronic acid.', short: 'Daily HA moisturizer', brand: 'Zara', catId: 256, basePrice: 49, offerPrice: 35, stock: 410,
    images: ['https://images.unsplash.com/photo-1573461160327-b450ce3d8e7f?w=900&q=80'],
    specs: [['Volume','50ml'],['Active','Hyaluronic acid'],['Texture','Gel-cream']],
    hotDealPct: 28, reviewCount: 16, avgRating: 4.5 },
  { name: 'Retinol 0.5% Night Treatment', desc: 'Time-released retinol with squalane to renew skin overnight.', short: 'Retinol night treatment', brand: 'Zara', catId: 256, basePrice: 89, offerPrice: 69, stock: 180,
    images: ['https://images.unsplash.com/photo-1612817288484-6f916006741a?w=900&q=80'],
    specs: [['Volume','30ml'],['Active','0.5% Retinol'],['Use','PM only']],
    reviewCount: 13, avgRating: 4.6 },

  // Makeup (cat 275)
  { name: 'Luxury Lipstick Set (3 shades)', desc: 'Trio of satin-finish lipsticks in everyday nudes, vegan formula.', short: 'Set of 3 satin lipsticks', brand: 'Zara', catId: 275, basePrice: 79, offerPrice: 55, stock: 240,
    images: ['https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=900&q=80','https://images.unsplash.com/photo-1568772585407-9361f9bf3a87?w=900&q=80'],
    specs: [['Set','3 lipsticks'],['Finish','Satin'],['Vegan','Yes']],
    hotDealPct: 30, reviewCount: 19, avgRating: 4.6 },
  { name: '24H Liquid Foundation - Medium Coverage', desc: 'Long-wear liquid foundation, 30 shades, oil-free, dermatologically tested.', short: 'Long-wear liquid foundation', brand: 'Zara', catId: 275, basePrice: 65, offerPrice: 49, stock: 300,
    images: ['https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=900&q=80'],
    specs: [['Volume','30ml'],['Coverage','Medium-buildable'],['Wear','24h']],
    isDeal: true, hotDealPct: 25, reviewCount: 24, avgRating: 4.5, soldCount: 119 },
  { name: 'Pro Eyeshadow Palette - 18 shades', desc: 'Highly pigmented matte and shimmer shades in a magnetic case.', short: '18-shade pro eyeshadow palette', brand: 'Zara', catId: 275, basePrice: 75, offerPrice: 59, stock: 210,
    images: ['https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?w=900&q=80'],
    specs: [['Shades','18'],['Finishes','Matte + shimmer'],['Cruelty-free','Yes']],
    hotDealPct: 21, reviewCount: 12, avgRating: 4.5 },

  // Fragrances (cat 290)
  { name: 'Oud Royal Eau de Parfum - 100ml', desc: 'Luxurious oud and amber composition with rose and sandalwood notes.', short: 'Oud and amber parfum 100ml', brand: 'Zara', catId: 290, basePrice: 249, offerPrice: 189, stock: 75,
    images: ['https://images.unsplash.com/photo-1594035910387-fea47794261f?w=900&q=80','https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=900&q=80'],
    specs: [['Volume','100ml'],['Concentration','Eau de Parfum'],['Top notes','Bergamot, rose'],['Base','Oud, amber, sandalwood']],
    isDeal: true, hotDealPct: 24, reviewCount: 26, avgRating: 4.8, soldCount: 95 },
  { name: 'Citrus Bloom Cologne - Men 75ml', desc: 'Fresh citrus and woody fougère for daytime wear.', short: 'Fresh citrus cologne 75ml', brand: 'Zara', catId: 290, basePrice: 129, offerPrice: 95, stock: 110,
    images: ['https://images.unsplash.com/photo-1541643600914-78b084683601?w=900&q=80'],
    specs: [['Volume','75ml'],['Concentration','EDT'],['Notes','Citrus, vetiver, cedar']],
    hotDealPct: 26, reviewCount: 10, avgRating: 4.4 },
];

const REVIEW_TITLES = [
  'Excellent quality', 'Exactly as described', 'Worth every penny', 'Loving it so far',
  'Fast shipping, great product', 'Highly recommend', 'Better than expected',
  'Solid build', 'Beautiful design', 'Top-notch packaging',
];
const REVIEW_BODIES = [
  'Arrived quickly and the quality is outstanding. Will buy again.',
  'Great product for the price — does exactly what is promised.',
  'Surprised by the build quality. Definitely a keeper.',
  'My partner loves it. Five stars from both of us!',
  'Used it daily for a couple of weeks now and still impressed.',
  'Perfect gift. The packaging alone made it feel premium.',
  'Performance has been flawless, no complaints whatsoever.',
  'A bit pricey but you really get what you pay for here.',
  'Sleek look, great features. Highly recommended.',
  'Customer service was excellent and the product is great.',
];

const pick = <T,>(arr: T[], i: number) => arr[i % arr.length];
const futureDate = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
};

async function cleanup() {
  console.log('═══ Cleaning previous homepage seed ═══');
  // Find all seeded products
  const old = await prisma.product.findMany({
    where: { skuNo: { startsWith: SKU_PREFIX } },
    select: { id: true },
  });
  const ids = old.map((p) => p.id);
  console.log(`  Found ${ids.length} previously-seeded products to remove`);
  if (ids.length === 0) {
    // Also clean any old orders by orderNo prefix
    await prisma.orderProducts.deleteMany({ where: { orderNo: { startsWith: ORDER_NO_PREFIX } } });
    await prisma.order.deleteMany({ where: { orderNo: { startsWith: ORDER_NO_PREFIX } } });
    return;
  }
  // Delete child records that have FK to product or productPrice
  const prices = await prisma.productPrice.findMany({ where: { productId: { in: ids } }, select: { id: true } });
  const priceIds = prices.map((p) => p.id);

  await prisma.orderProducts.deleteMany({ where: { productId: { in: ids } } });
  await prisma.order.deleteMany({ where: { orderNo: { startsWith: ORDER_NO_PREFIX } } });
  await prisma.productSellerImage.deleteMany({ where: { productPriceId: { in: priceIds } } });
  await prisma.productPriceReview.deleteMany({ where: { productPriceId: { in: priceIds } } });
  await prisma.productPrice.deleteMany({ where: { productId: { in: ids } } });
  await prisma.productImages.deleteMany({ where: { productId: { in: ids } } });
  await prisma.productReview.deleteMany({ where: { productId: { in: ids } } });
  await prisma.productSpecification.deleteMany({ where: { productId: { in: ids } } });
  await prisma.productShortDescription.deleteMany({ where: { productId: { in: ids } } });
  await prisma.productTags.deleteMany({ where: { productId: { in: ids } } });
  // Optional FKs — only delete if model exists (skip silently if it doesn't)
  try { await (prisma as any).productView.deleteMany({ where: { productId: { in: ids } } }); } catch {}
  try { await (prisma as any).productClick.deleteMany({ where: { productId: { in: ids } } }); } catch {}
  try { await (prisma as any).productSearch.deleteMany({ where: { productId: { in: ids } } }); } catch {}
  try { await (prisma as any).wishlist.deleteMany({ where: { productId: { in: ids } } }); } catch {}
  try { await (prisma as any).cart.deleteMany({ where: { productId: { in: ids } } }); } catch {}
  await prisma.product.deleteMany({ where: { id: { in: ids } } });
  console.log('  Cleanup complete.');
}

async function seedAllBulk() {
  console.log(`═══ Seeding ${PRODUCTS.length} homepage products (bulk) ═══`);

  // 1) Bulk insert products and capture IDs
  const productRows = PRODUCTS.map((p, i) => {
    const sellerId = pick(SELLERS, i);
    const brandId = BRAND_BY_NAME[p.brand] ?? 2;
    return {
      productName: p.name,
      description: p.desc,
      shortDescription: p.short,
      specification: JSON.stringify(p.specs),
      status: 'ACTIVE' as const,
      adminId: sellerId,
      userId: sellerId,
      skuNo: `${SKU_PREFIX}${String(i + 1).padStart(3, '0')}`,
      productPrice: p.basePrice,
      offerPrice: p.offerPrice,
      categoryId: p.catId,
      brandId,
      productType: 'P' as any,
      typeOfProduct: 'BRAND' as any,
      productViewCount: Math.floor(Math.random() * 800) + 100,
    };
  });
  await prisma.product.createMany({ data: productRows });
  const products = await prisma.product.findMany({
    where: { skuNo: { startsWith: SKU_PREFIX } },
    select: { id: true, skuNo: true },
    orderBy: { skuNo: 'asc' },
  });
  console.log(`  ✓ ${products.length} products inserted`);

  // 2) Build all child rows (images, short desc, specs, prices, reviews)
  const imageRows: any[] = [];
  const shortDescRows: any[] = [];
  const specRows: any[] = [];
  const normalPriceRows: any[] = [];
  const buyGroupPriceRows: any[] = [];
  const reviewRows: any[] = [];

  for (let i = 0; i < PRODUCTS.length; i++) {
    const p = PRODUCTS[i];
    const product = products[i];
    const sellerId = pick(SELLERS, i);

    for (const img of p.images) {
      imageRows.push({ productId: product.id, image: img, imageName: `${product.skuNo}-img`, status: 'ACTIVE' });
    }
    shortDescRows.push({ productId: product.id, adminId: sellerId, shortDescription: p.short, status: 'ACTIVE' });
    for (const [label, value] of p.specs) {
      specRows.push({ productId: product.id, adminId: sellerId, label, specification: value, status: 'ACTIVE' });
    }
    normalPriceRows.push({
      productId: product.id, adminId: sellerId,
      productPrice: p.basePrice, offerPrice: p.offerPrice, stock: p.stock,
      status: 'ACTIVE', sellType: 'NORMALSELL', consumerType: 'EVERYONE',
      consumerDiscount: p.hotDealPct ?? null,
      consumerDiscountType: p.hotDealPct ? 'PERCENTAGE' : null,
      askForPrice: 'false', isCustomProduct: 'false',
    });
    if (p.isDeal) {
      const dealPrice = Math.round(p.offerPrice * 0.82 * 100) / 100;
      // Stock MUST exceed soldCount so the deal isn't shown as "out of stock".
      // Aim for a healthy "sold X / stock Y" progress bar that looks active but available.
      const sold = p.soldCount ?? 0;
      const buygroupStock = Math.max(p.stock, sold * 2 + 100);
      buyGroupPriceRows.push({
        productId: product.id, adminId: sellerId,
        productPrice: p.basePrice, offerPrice: dealPrice,
        stock: buygroupStock,
        status: 'ACTIVE', sellType: 'BUYGROUP', consumerType: 'EVERYONE',
        consumerDiscount: Math.max(p.hotDealPct ?? 18, 18),
        consumerDiscountType: 'PERCENTAGE',
        dateOpen: futureDate(-2), dateClose: futureDate(30),
        startTime: '00:00', endTime: '23:59',
        minCustomer: 1, maxCustomer: 500,
        minQuantityPerCustomer: 1, maxQuantityPerCustomer: 5,
        askForPrice: 'false', isCustomProduct: 'false',
      });
    }

    const reviewCount = p.reviewCount ?? 5;
    const avg = p.avgRating ?? 4.5;
    for (let r = 0; r < reviewCount; r++) {
      const jitter = (r % 5) - 2;
      const rating = Math.max(1, Math.min(5, Math.round(avg + jitter * 0.4)));
      reviewRows.push({
        userId: pick(BUYERS, r + i),
        productId: product.id,
        title: pick(REVIEW_TITLES, r + i),
        description: pick(REVIEW_BODIES, r + i * 3),
        rating,
        status: 'ACTIVE',
      });
    }
  }

  // 3) Insert children in parallel
  await Promise.all([
    prisma.productImages.createMany({ data: imageRows }),
    prisma.productShortDescription.createMany({ data: shortDescRows }),
    prisma.productSpecification.createMany({ data: specRows }),
    prisma.productPrice.createMany({ data: normalPriceRows }),
    prisma.productPrice.createMany({ data: buyGroupPriceRows }),
    prisma.productReview.createMany({ data: reviewRows }),
  ]);
  console.log(`  ✓ ${imageRows.length} images, ${specRows.length} specs, ${normalPriceRows.length + buyGroupPriceRows.length} prices (${buyGroupPriceRows.length} deals), ${reviewRows.length} reviews`);

  // 4) Build orders for products marked isDeal+soldCount → fuels Best Sellers section
  const buyGroupPrices = await prisma.productPrice.findMany({
    where: { sellType: 'BUYGROUP', productId: { in: products.map((p) => p.id) } },
    select: { id: true, productId: true },
  });
  const bgByProduct = new Map(buyGroupPrices.map((bp) => [bp.productId, bp.id]));

  const orderRows: any[] = [];
  const orderProductRows: any[] = []; // We'll resolve orderId after inserting orders
  const ordersToInsert: { key: string; data: any; opData: any }[] = [];

  for (let i = 0; i < PRODUCTS.length; i++) {
    const p = PRODUCTS[i];
    if (!(p.isDeal && p.soldCount)) continue;
    const product = products[i];
    const sellerId = pick(SELLERS, i);
    const bgPriceId = bgByProduct.get(product.id);
    if (!bgPriceId) continue;
    const splits = [0.35, 0.25, 0.2, 0.12, 0.08];
    const sold = p.soldCount;
    let remaining = sold;
    for (let s = 0; s < splits.length && remaining > 0; s++) {
      const qty = s === splits.length - 1 ? remaining : Math.floor(sold * splits[s]);
      remaining -= qty;
      if (qty <= 0) continue;
      const buyerId = pick(BUYERS, i + s);
      const orderNo = `${ORDER_NO_PREFIX}${product.id}-${s + 1}`;
      ordersToInsert.push({
        key: orderNo,
        data: {
          userId: buyerId, orderNo, paymentMethod: 'CARD',
          totalPrice: Number(p.offerPrice) * qty,
          actualPrice: Number(p.offerPrice) * qty,
          orderStatus: 'PAID', orderType: 'DEFAULT',
          orderDate: new Date(Date.now() - (s + 1) * 86400000 * 3),
        },
        opData: {
          userId: buyerId, productId: product.id,
          productPriceId: bgPriceId, sellerId,
          orderQuantity: qty,
          salePrice: Number(p.offerPrice),
          purchasePrice: Number(p.offerPrice),
          orderProductStatus: 'DELIVERED',
          orderNo,
          status: 'ACTIVE',
        },
      });
    }
  }

  if (ordersToInsert.length) {
    await prisma.order.createMany({ data: ordersToInsert.map((x) => x.data) });
    const orders = await prisma.order.findMany({
      where: { orderNo: { in: ordersToInsert.map((x) => x.key) } },
      select: { id: true, orderNo: true },
    });
    const byOrderNo = new Map(orders.map((o) => [o.orderNo, o.id]));
    const opData = ordersToInsert.map((x) => ({ ...x.opData, orderId: byOrderNo.get(x.key)! }));
    await prisma.orderProducts.createMany({ data: opData });
    console.log(`  ✓ ${orders.length} orders + ${opData.length} order-products → Best Sellers data`);
  }
}

async function main() {
  console.log('Target host:', new URL(url!).host);
  await cleanup();
  await seedAllBulk();
  console.log(`\n═══ Done — ${PRODUCTS.length} products seeded ═══`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
