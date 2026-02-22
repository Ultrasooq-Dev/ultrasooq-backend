import { PrismaClient, Status, TypeTrader, LoginType, SpecDataType, ProductType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────
// TYPES
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

interface CategoryNode {
  id: number;
  name: string;
  parentId: number | null;
  children: CategoryNode[];
  path: string; // e.g. "Products > Consumer Electronics > Smartphones"
}

// ─────────────────────────────────────────────────────────
// TAG DEFINITIONS — keyed by LOWERCASE category name
// Maps a leaf category name → tag names to attach
// ─────────────────────────────────────────────────────────
const TAG_MAP: Record<string, string[]> = {
  // ── Electronics / Phones ──
  'smartphones':           ['smartphone', '5g', 'touchscreen', 'dual-sim', 'fast-charging', 'high-resolution'],
  'feature phones':        ['feature-phone', 'basic', 'durable', 'long-battery'],
  'phone cases':           ['phone-case', 'protective', 'shockproof', 'slim-fit'],
  'phone accessories':     ['phone-accessory', 'cable', 'adapter', 'portable'],
  'chargers':              ['charger', 'fast-charging', 'wireless-charging', 'usb-c', 'portable'],
  'screen protectors':     ['screen-protector', 'tempered-glass', 'anti-scratch', 'protective'],
  'power banks':           ['power-bank', 'portable', 'fast-charging', 'high-capacity'],
  'cables & adapters':     ['cable', 'adapter', 'usb-c', 'lightning', 'hdmi'],

  // ── Electronics / Computers ──
  'laptops':               ['laptop', 'ultrabook', 'gaming', 'high-performance', 'portable'],
  'desktops':              ['desktop', 'gaming', 'workstation', 'high-performance'],
  'desktop computers':     ['desktop', 'gaming', 'workstation', 'high-performance'],
  'tablets':               ['tablet', 'touchscreen', 'portable', 'lightweight'],
  'monitors':              ['monitor', 'display', 'high-resolution', '4k', 'ultrawide'],
  'computer accessories':  ['keyboard', 'mouse', 'webcam', 'usb-hub'],
  'printers':              ['printer', 'inkjet', 'laser', 'scanner', 'wireless'],
  'networking':            ['router', 'wifi', 'networking', 'ethernet', 'mesh'],
  'storage devices':       ['storage', 'ssd', 'hdd', 'external-drive', 'flash-drive'],

  // ── Electronics / Audio & Video ──
  'headphones':            ['headphones', 'wireless', 'noise-cancelling', 'bluetooth'],
  'earbuds':               ['earbuds', 'wireless', 'bluetooth', 'in-ear'],
  'speakers':              ['speaker', 'wireless', 'bluetooth', 'portable', 'smart-home'],
  'microphones':           ['microphone', 'usb', 'condenser', 'studio', 'podcast'],
  'soundbars':             ['soundbar', 'home-theater', 'bluetooth', 'surround-sound'],
  'televisions':           ['tv', 'smart-tv', '4k', 'oled', 'led'],
  'projectors':            ['projector', 'portable', 'hd', 'home-theater'],

  // ── Electronics / Camera ──
  'cameras':               ['camera', 'dslr', 'mirrorless', 'digital', 'professional'],
  'camera accessories':    ['camera-accessory', 'lens', 'tripod', 'filter', 'bag'],
  'lenses':                ['lens', 'wide-angle', 'telephoto', 'macro', 'prime'],
  'drones':                ['drone', 'aerial', 'fpv', 'camera-drone', 'gps'],
  'action cameras':        ['action-camera', 'waterproof', 'gopro', 'adventure'],
  'digital cameras':       ['camera', 'digital', 'dslr', 'mirrorless', 'professional'],
  'camera & photography':  ['camera', 'photography', 'lens', 'digital'],
  'dslr & mirrorless':     ['camera', 'dslr', 'mirrorless', 'professional'],

  // ── Electronics / Gaming ──
  'gaming consoles':       ['console', 'gaming', 'playstation', 'xbox', 'nintendo'],
  'gaming accessories':    ['gaming', 'controller', 'headset', 'mouse', 'keyboard'],
  'video games':           ['game', 'gaming', 'digital', 'console-game', 'pc-game'],

  // ── Electronics / Wearables ──
  'smartwatches':          ['smartwatch', 'wearable', 'fitness-tracker', 'bluetooth'],
  'fitness trackers':      ['fitness-tracker', 'wearable', 'health', 'heart-rate'],
  'smart glasses':         ['smart-glasses', 'ar', 'wearable', 'bluetooth'],

  // ── Electronics / Intermediate Parents ──
  'mobile phones':         ['smartphone', 'mobile', '5g', 'touchscreen'],
  'android smartphones':   ['smartphone', 'android', '5g', 'touchscreen'],
  'ios smartphones':       ['smartphone', 'ios', 'iphone', 'touchscreen'],
  'mobile phones & accessories': ['smartphone', 'mobile', 'phone-accessory'],
  'keyboards':             ['keyboard', 'mechanical', 'wireless', 'gaming'],
  'mice':                  ['mouse', 'wireless', 'ergonomic', 'gaming'],
  'computers & office':    ['computer', 'laptop', 'desktop', 'office'],
  'gaming laptops':        ['laptop', 'gaming', 'high-performance', 'portable'],
  'business laptops':      ['laptop', 'business', 'ultrabook', 'portable'],
  'gaming desktops':       ['desktop', 'gaming', 'high-performance', 'custom'],
  'audio & video':         ['audio', 'headphones', 'speaker', 'video'],
  'home theater':          ['home-theater', 'soundbar', 'speaker', 'surround-sound'],
  'over-ear headphones':   ['headphones', 'over-ear', 'wireless', 'noise-cancelling'],
  'in-ear earbuds':        ['earbuds', 'in-ear', 'wireless', 'bluetooth'],
  'wearable technology':   ['wearable', 'smartwatch', 'fitness-tracker', 'bluetooth'],
  'gaming':                ['gaming', 'console', 'controller', 'pc-game'],

  // ── Fashion / Intermediate Parents ──
  "men's clothing":        ['mens', 'clothing', 'fashion', 'casual'],
  "women's clothing":      ['womens', 'clothing', 'fashion', 'casual'],
  'hoodies & sweatshirts': ['hoodie', 'sweatshirt', 'casual', 'cotton'],
  'coats':                 ['coat', 'winter', 'warm', 'outerwear'],
  'outerwear':             ['outerwear', 'jacket', 'coat', 'winter'],
  'shoes':                 ['shoes', 'footwear', 'comfortable'],
  "men's footwear":        ['mens-shoes', 'formal', 'leather', 'comfortable'],
  "women's footwear":      ['womens-shoes', 'heels', 'flats', 'comfortable'],
  'athletic shoes':        ['athletic', 'running', 'sports-shoes', 'breathable'],
  'fashion accessories':   ['accessory', 'fashion', 'style'],

  // ── Fashion / Men's Clothing ──
  't-shirts':              ['t-shirt', 'cotton', 'casual', 'breathable'],
  'shirts':                ['shirt', 'formal', 'cotton', 'slim-fit'],
  'pants':                 ['pants', 'casual', 'formal', 'slim-fit', 'stretch'],
  'jeans':                 ['jeans', 'denim', 'casual', 'stretch', 'slim-fit'],
  'jackets':               ['jacket', 'winter', 'waterproof', 'windbreaker', 'leather'],
  'suits':                 ['suit', 'formal', 'business', 'slim-fit', 'tailored'],
  'shorts':                ['shorts', 'casual', 'cotton', 'breathable', 'summer'],
  'sweaters':              ['sweater', 'knit', 'cotton', 'warm', 'casual'],
  'hoodies':               ['hoodie', 'casual', 'cotton', 'warm', 'zip-up'],
  'activewear':            ['activewear', 'sport', 'breathable', 'stretch', 'moisture-wicking'],
  'underwear':             ['underwear', 'cotton', 'comfortable', 'breathable'],
  'sleepwear':             ['sleepwear', 'pajama', 'cotton', 'comfortable'],

  // ── Fashion / Women's Clothing ──
  'dresses':               ['dress', 'casual', 'formal', 'summer', 'elegant'],
  'tops':                  ['top', 'casual', 'cotton', 'breathable'],
  'blouses':               ['blouse', 'formal', 'silk', 'chiffon', 'elegant'],
  'skirts':                ['skirt', 'casual', 'formal', 'cotton'],
  'leggings':              ['leggings', 'stretch', 'athletic', 'comfortable'],

  // ── Fashion / Shoes ──
  "men's shoes":           ['mens-shoes', 'formal', 'leather', 'comfortable'],
  "women's shoes":         ['womens-shoes', 'heels', 'flats', 'comfortable'],
  'sports shoes':          ['sports-shoes', 'running', 'lightweight', 'breathable', 'cushioned'],
  'running shoes':         ['running-shoes', 'lightweight', 'cushioned', 'breathable'],
  'sneakers':              ['sneakers', 'casual', 'comfortable', 'athletic'],
  'boots':                 ['boots', 'leather', 'winter', 'waterproof', 'durable'],
  'sandals':               ['sandals', 'summer', 'casual', 'comfortable', 'lightweight'],
  'formal shoes':          ['formal-shoes', 'leather', 'oxford', 'business'],
  'slippers':              ['slippers', 'indoor', 'comfortable', 'soft'],

  // ── Fashion / Accessories ──
  'watches':               ['watch', 'analog', 'digital', 'luxury', 'casual'],
  'sunglasses':            ['sunglasses', 'uv-protection', 'polarized', 'fashion'],
  'belts':                 ['belt', 'leather', 'casual', 'formal'],
  'wallets':               ['wallet', 'leather', 'compact', 'rfid-blocking'],
  'bags':                  ['bag', 'backpack', 'tote', 'leather', 'travel'],
  'handbags':              ['handbag', 'leather', 'designer', 'crossbody'],
  'backpacks':             ['backpack', 'travel', 'laptop', 'waterproof'],
  'jewelry':               ['jewelry', 'gold', 'silver', 'gemstone', 'fashion'],
  'hats & caps':           ['hat', 'cap', 'snapback', 'beanie', 'sun-hat'],
  'scarves':               ['scarf', 'silk', 'wool', 'winter', 'fashion'],
  'ties':                  ['tie', 'silk', 'formal', 'business'],

  // ── Home & Garden / Furniture ──
  'living room':           ['sofa', 'furniture', 'modern', 'comfortable'],
  'living room furniture': ['sofa', 'furniture', 'modern', 'comfortable'],
  'bedroom':               ['bed', 'furniture', 'modern', 'comfortable'],
  'bedroom furniture':     ['bed', 'furniture', 'modern', 'comfortable'],
  'kitchen':               ['dining', 'furniture', 'modern', 'compact'],
  'kitchen furniture':     ['dining', 'furniture', 'modern', 'compact'],
  'dining room':           ['dining', 'table', 'chairs', 'furniture'],
  'outdoor furniture':     ['outdoor', 'patio', 'weather-resistant', 'durable'],
  'office furniture':      ['office', 'desk', 'ergonomic', 'adjustable'],
  'sofas':                 ['sofa', 'comfortable', 'modern', 'sectional'],
  'beds':                  ['bed', 'mattress', 'comfortable', 'modern'],
  'tables':                ['table', 'dining', 'coffee', 'modern'],
  'chairs':                ['chair', 'ergonomic', 'comfortable', 'modern'],
  'shelves & storage':     ['shelf', 'bookcase', 'storage', 'organizer'],

  // ── Home & Garden / Kitchen ──
  'cookware':              ['cookware', 'non-stick', 'stainless-steel', 'durable'],
  'appliances':            ['appliance', 'energy-efficient', 'smart-home', 'compact'],
  'kitchen appliances':    ['appliance', 'energy-efficient', 'smart-home', 'compact'],
  'storage':               ['storage', 'organizer', 'compact', 'airtight'],
  'kitchen storage':       ['storage', 'organizer', 'compact', 'airtight'],
  'bakeware':              ['bakeware', 'non-stick', 'oven-safe', 'silicone'],
  'cutlery':               ['cutlery', 'stainless-steel', 'sharp', 'durable'],
  'kitchen tools':         ['kitchen-tool', 'utensil', 'stainless-steel', 'durable'],
  'drinkware':             ['drinkware', 'glass', 'mug', 'insulated'],
  'dinnerware':            ['dinnerware', 'ceramic', 'porcelain', 'elegant'],

  // ── Home & Garden / Decor ──
  'lighting':              ['lighting', 'led', 'modern', 'ambient'],
  'rugs & carpets':        ['rug', 'carpet', 'soft', 'decorative'],
  'curtains':              ['curtain', 'blackout', 'sheer', 'decorative'],
  'wall art':              ['wall-art', 'canvas', 'print', 'decorative'],
  'clocks':                ['clock', 'wall-clock', 'modern', 'decorative'],
  'candles':               ['candle', 'scented', 'decorative', 'soy-wax'],
  'vases':                 ['vase', 'ceramic', 'glass', 'decorative'],
  'cushions & pillows':    ['cushion', 'pillow', 'decorative', 'comfortable'],
  'mirrors':               ['mirror', 'wall-mirror', 'decorative', 'modern'],

  // ── Home & Garden / Garden ──
  'plants':                ['plant', 'indoor', 'outdoor', 'green'],
  'garden tools':          ['garden-tool', 'pruner', 'shovel', 'durable'],
  'pots & planters':       ['pot', 'planter', 'ceramic', 'modern'],
  'outdoor lighting':      ['outdoor-lighting', 'solar', 'led', 'waterproof'],
  'grills & bbq':          ['grill', 'bbq', 'charcoal', 'gas', 'portable'],

  // ── Home & Garden / Bedding & Bath ──
  'bedding':               ['bedding', 'sheet', 'cotton', 'comfortable'],
  'bed sheets':            ['bed-sheet', 'cotton', 'microfiber', 'soft'],
  'comforters':            ['comforter', 'warm', 'hypoallergenic', 'soft'],
  'pillows':               ['pillow', 'memory-foam', 'hypoallergenic', 'soft'],
  'towels':                ['towel', 'cotton', 'bath', 'absorbent'],
  'bath accessories':      ['bath-accessory', 'organizer', 'bathroom', 'modern'],
  'shower curtains':       ['shower-curtain', 'waterproof', 'decorative'],

  // ── Beauty & Health ──
  'skincare':              ['skincare', 'organic', 'anti-aging', 'sensitive-skin', 'spf'],
  'haircare':              ['haircare', 'organic', 'moisturizing', 'repair'],
  'makeup':                ['makeup', 'cosmetics', 'vegan', 'cruelty-free'],
  'fragrances':            ['fragrance', 'perfume', 'cologne', 'long-lasting'],
  'personal care':         ['personal-care', 'hygiene', 'organic', 'natural'],
  'nail care':             ['nail-care', 'polish', 'manicure', 'gel'],
  'hair tools':            ['hair-tool', 'dryer', 'straightener', 'curler'],
  'oral care':             ['oral-care', 'toothbrush', 'whitening', 'electric'],
  'supplements':           ['supplement', 'vitamin', 'mineral', 'organic'],
  'medical devices':       ['medical', 'thermometer', 'blood-pressure', 'health'],
  'body care':             ['body-care', 'lotion', 'moisturizer', 'organic'],
  'face care':             ['face-care', 'cleanser', 'moisturizer', 'serum'],
  'men grooming':          ['grooming', 'razor', 'aftershave', 'beard-care'],

  // ── Sports & Outdoors ──
  'fitness':               ['fitness', 'dumbbell', 'yoga', 'resistance', 'adjustable'],
  'fitness equipment':     ['fitness', 'dumbbell', 'yoga', 'resistance', 'adjustable'],
  'camping':               ['camping', 'outdoor', 'waterproof', 'portable', 'lightweight'],
  'camping gear':          ['camping', 'outdoor', 'waterproof', 'portable', 'lightweight'],
  'team sports':           ['team-sports', 'ball', 'jersey', 'equipment'],
  'hiking':                ['hiking', 'outdoor', 'boots', 'backpack', 'trail'],
  'cycling':               ['cycling', 'bike', 'helmet', 'lightweight'],
  'swimming':              ['swimming', 'goggles', 'waterproof', 'swimwear'],
  'yoga':                  ['yoga', 'mat', 'stretch', 'flexible', 'balance'],
  'running':               ['running', 'shoes', 'lightweight', 'breathable'],
  'fishing':               ['fishing', 'rod', 'reel', 'outdoor', 'waterproof'],
  'water sports':          ['water-sports', 'kayak', 'surfing', 'waterproof'],
  'exercise machines':     ['exercise-machine', 'treadmill', 'elliptical', 'stationary-bike'],
  'weights':               ['weights', 'dumbbell', 'barbell', 'kettlebell'],
  'resistance bands':      ['resistance-band', 'stretch', 'workout', 'portable'],
  'sports accessories':    ['sports-accessory', 'bottle', 'bag', 'towel'],

  // ── Automotive ──
  'car parts':             ['car-parts', 'replacement', 'durable', 'OEM'],
  'car electronics':       ['car-electronics', 'dashcam', 'GPS', 'LED'],
  'accessories':           ['car-accessory', 'organizer', 'comfort', 'protection'],
  'car accessories':       ['car-accessory', 'organizer', 'comfort', 'protection'],
  'tires & wheels':        ['tire', 'wheel', 'all-season', 'performance'],
  'car care':              ['car-care', 'wax', 'polish', 'cleaner'],
  'interior accessories':  ['interior', 'seat-cover', 'floor-mat', 'organizer'],
  'exterior accessories':  ['exterior', 'spoiler', 'decal', 'protection'],
  'oils & fluids':         ['oil', 'fluid', 'engine', 'coolant', 'brake-fluid'],
  'car audio':             ['car-audio', 'speaker', 'amplifier', 'subwoofer'],

  // ── Office & School ──
  'stationery':            ['stationery', 'pen', 'notebook', 'writing'],
  'supplies':              ['office-supplies', 'organizer', 'filing', 'compact'],
  'office supplies':       ['office-supplies', 'organizer', 'filing', 'compact'],
  'furniture':             ['office-furniture', 'ergonomic', 'standing-desk', 'adjustable'],
  'school supplies':       ['school-supply', 'notebook', 'backpack', 'pencil'],
  'art supplies':          ['art-supply', 'paint', 'brush', 'canvas'],
  'printers & scanners':   ['printer', 'scanner', 'inkjet', 'laser'],
  'office electronics':    ['office-electronics', 'calculator', 'shredder', 'laminator'],
  'desk organizers':       ['desk-organizer', 'tray', 'holder', 'compact'],
  'paper products':        ['paper', 'copy-paper', 'sticky-notes', 'notepad'],

  // ── Toys & Kids ──
  'toys':                  ['toy', 'educational', 'fun', 'creative'],
  'educational toys':      ['educational', 'stem', 'learning', 'interactive'],
  'action figures':        ['action-figure', 'collectible', 'toy', 'figurine'],
  'dolls':                 ['doll', 'toy', 'fashion', 'collectible'],
  'board games':           ['board-game', 'strategy', 'family', 'fun'],
  'puzzles':               ['puzzle', 'jigsaw', 'educational', 'brain-teaser'],
  'outdoor toys':          ['outdoor-toy', 'active', 'summer', 'fun'],
  'baby products':         ['baby', 'infant', 'safe', 'gentle'],
  'baby clothes':          ['baby-clothes', 'cotton', 'soft', 'comfortable'],
  'baby gear':             ['baby-gear', 'stroller', 'car-seat', 'safe'],

  // ── Books & Media ──
  'books':                 ['book', 'paperback', 'hardcover', 'bestseller'],
  'ebooks':                ['ebook', 'digital', 'kindle', 'instant-download'],
  'audiobooks':            ['audiobook', 'narrated', 'digital', 'bestseller'],
  'magazines':             ['magazine', 'subscription', 'monthly', 'print'],
  'music':                 ['music', 'vinyl', 'cd', 'digital'],
  'movies':                ['movie', 'dvd', 'blu-ray', 'digital'],

  // ── Pets ──
  'pet food':              ['pet-food', 'dog', 'cat', 'natural'],
  'pet accessories':       ['pet-accessory', 'collar', 'leash', 'bed'],
  'pet toys':              ['pet-toy', 'chew', 'interactive', 'durable'],
  'pet grooming':          ['pet-grooming', 'shampoo', 'brush', 'gentle'],
  'aquarium':              ['aquarium', 'fish', 'tank', 'filter'],
  'bird supplies':         ['bird-supply', 'cage', 'food', 'perch'],

  // ── Food & Grocery ──
  'snacks':                ['snack', 'healthy', 'organic', 'tasty'],
  'beverages':             ['beverage', 'drink', 'natural', 'organic'],
  'dairy':                 ['dairy', 'milk', 'cheese', 'fresh'],
  'bakery':                ['bakery', 'bread', 'pastry', 'fresh'],
  'fresh produce':         ['fresh', 'organic', 'vegetable', 'fruit'],
  'frozen food':           ['frozen', 'ready-to-eat', 'convenience'],
  'condiments':            ['condiment', 'sauce', 'spice', 'seasoning'],
  'organic food':          ['organic', 'natural', 'healthy', 'non-gmo'],
};

// ─────────────────────────────────────────────────────────
// SPEC TEMPLATE DEFINITIONS — keyed by LOWERCASE category name
// ─────────────────────────────────────────────────────────
const SPEC_MAP: Record<string, SpecDef[]> = {
  // ── Electronics / Phones ──
  'smartphones': [
    { name: 'Screen Size', key: 'screen_size', dataType: SpecDataType.NUMBER, unit: 'inches', isRequired: true, groupName: 'Display' },
    { name: 'RAM', key: 'ram', dataType: SpecDataType.SELECT, options: ['4GB', '6GB', '8GB', '12GB', '16GB'], isRequired: true, groupName: 'Performance' },
    { name: 'Storage', key: 'storage', dataType: SpecDataType.SELECT, options: ['64GB', '128GB', '256GB', '512GB', '1TB'], isRequired: true, groupName: 'Performance' },
    { name: 'Battery', key: 'battery', dataType: SpecDataType.NUMBER, unit: 'mAh', isRequired: true, groupName: 'Battery' },
    { name: 'OS', key: 'os', dataType: SpecDataType.SELECT, options: ['Android', 'iOS'], isRequired: true, groupName: 'Software' },
    { name: 'Camera', key: 'camera', dataType: SpecDataType.TEXT, groupName: 'Camera' },
    { name: 'Weight', key: 'weight', dataType: SpecDataType.NUMBER, unit: 'g', groupName: 'Physical' },
  ],
  'feature phones': [
    { name: 'Screen Size', key: 'screen_size', dataType: SpecDataType.NUMBER, unit: 'inches', groupName: 'Display' },
    { name: 'Battery', key: 'battery', dataType: SpecDataType.NUMBER, unit: 'mAh', isRequired: true, groupName: 'Battery' },
    { name: 'SIM Type', key: 'sim_type', dataType: SpecDataType.SELECT, options: ['Single SIM', 'Dual SIM'], groupName: 'Connectivity' },
    { name: 'Camera', key: 'camera', dataType: SpecDataType.BOOLEAN, groupName: 'Camera' },
    { name: 'FM Radio', key: 'fm_radio', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
  ],
  'phone cases': [
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Silicone', 'TPU', 'Leather', 'Plastic', 'Carbon Fiber'], isRequired: true, groupName: 'Material' },
    { name: 'Compatibility', key: 'compatibility', dataType: SpecDataType.TEXT, isRequired: true, groupName: 'Compatibility' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'Clear', 'Blue', 'Red', 'Pink'], groupName: 'Appearance' },
    { name: 'Shockproof', key: 'shockproof', dataType: SpecDataType.BOOLEAN, groupName: 'Protection' },
  ],
  'chargers': [
    { name: 'Wattage', key: 'wattage', dataType: SpecDataType.NUMBER, unit: 'W', isRequired: true, groupName: 'Power' },
    { name: 'Type', key: 'type', dataType: SpecDataType.SELECT, options: ['USB-C', 'Lightning', 'Micro-USB', 'Wireless'], isRequired: true, groupName: 'Connectivity' },
    { name: 'Fast Charging', key: 'fast_charging', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
    { name: 'Cable Length', key: 'cable_length', dataType: SpecDataType.NUMBER, unit: 'm', groupName: 'Physical' },
  ],
  'screen protectors': [
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Tempered Glass', 'PET Film', 'TPU', 'Nano'], isRequired: true, groupName: 'Material' },
    { name: 'Compatibility', key: 'compatibility', dataType: SpecDataType.TEXT, isRequired: true, groupName: 'Compatibility' },
    { name: 'Anti-Fingerprint', key: 'anti_fingerprint', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
    { name: 'Privacy', key: 'privacy', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
  ],
  'power banks': [
    { name: 'Capacity', key: 'capacity', dataType: SpecDataType.NUMBER, unit: 'mAh', isRequired: true, groupName: 'Power' },
    { name: 'Output Ports', key: 'output_ports', dataType: SpecDataType.NUMBER, groupName: 'Connectivity' },
    { name: 'Fast Charging', key: 'fast_charging', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
    { name: 'Weight', key: 'weight', dataType: SpecDataType.NUMBER, unit: 'g', groupName: 'Physical' },
  ],

  // ── Electronics / Computers ──
  'laptops': [
    { name: 'Screen Size', key: 'screen_size', dataType: SpecDataType.NUMBER, unit: 'inches', isRequired: true, groupName: 'Display' },
    { name: 'RAM', key: 'ram', dataType: SpecDataType.SELECT, options: ['8GB', '16GB', '32GB', '64GB'], isRequired: true, groupName: 'Performance' },
    { name: 'Storage', key: 'storage', dataType: SpecDataType.SELECT, options: ['256GB', '512GB', '1TB', '2TB'], isRequired: true, groupName: 'Performance' },
    { name: 'Processor', key: 'processor', dataType: SpecDataType.TEXT, isRequired: true, groupName: 'Performance' },
    { name: 'GPU', key: 'gpu', dataType: SpecDataType.TEXT, groupName: 'Performance' },
    { name: 'Battery Life', key: 'battery_life', dataType: SpecDataType.NUMBER, unit: 'hours', groupName: 'Battery' },
    { name: 'Weight', key: 'weight', dataType: SpecDataType.NUMBER, unit: 'kg', groupName: 'Physical' },
  ],
  'desktops': [
    { name: 'Processor', key: 'processor', dataType: SpecDataType.TEXT, isRequired: true, groupName: 'Performance' },
    { name: 'RAM', key: 'ram', dataType: SpecDataType.SELECT, options: ['8GB', '16GB', '32GB', '64GB', '128GB'], isRequired: true, groupName: 'Performance' },
    { name: 'Storage', key: 'storage', dataType: SpecDataType.SELECT, options: ['256GB', '512GB', '1TB', '2TB', '4TB'], isRequired: true, groupName: 'Performance' },
    { name: 'GPU', key: 'gpu', dataType: SpecDataType.TEXT, groupName: 'Performance' },
    { name: 'Form Factor', key: 'form_factor', dataType: SpecDataType.SELECT, options: ['Tower', 'Mini', 'All-in-One'], groupName: 'Design' },
  ],
  'desktop computers': [
    { name: 'Processor', key: 'processor', dataType: SpecDataType.TEXT, isRequired: true, groupName: 'Performance' },
    { name: 'RAM', key: 'ram', dataType: SpecDataType.SELECT, options: ['8GB', '16GB', '32GB', '64GB', '128GB'], isRequired: true, groupName: 'Performance' },
    { name: 'Storage', key: 'storage', dataType: SpecDataType.SELECT, options: ['256GB', '512GB', '1TB', '2TB', '4TB'], isRequired: true, groupName: 'Performance' },
    { name: 'GPU', key: 'gpu', dataType: SpecDataType.TEXT, groupName: 'Performance' },
    { name: 'Form Factor', key: 'form_factor', dataType: SpecDataType.SELECT, options: ['Tower', 'Mini', 'All-in-One'], groupName: 'Design' },
  ],
  'tablets': [
    { name: 'Screen Size', key: 'screen_size', dataType: SpecDataType.NUMBER, unit: 'inches', isRequired: true, groupName: 'Display' },
    { name: 'RAM', key: 'ram', dataType: SpecDataType.SELECT, options: ['4GB', '6GB', '8GB', '12GB'], groupName: 'Performance' },
    { name: 'Storage', key: 'storage', dataType: SpecDataType.SELECT, options: ['64GB', '128GB', '256GB', '512GB'], isRequired: true, groupName: 'Performance' },
    { name: 'OS', key: 'os', dataType: SpecDataType.SELECT, options: ['iOS', 'Android', 'Windows'], isRequired: true, groupName: 'Software' },
    { name: 'Weight', key: 'weight', dataType: SpecDataType.NUMBER, unit: 'g', groupName: 'Physical' },
  ],
  'monitors': [
    { name: 'Screen Size', key: 'screen_size', dataType: SpecDataType.NUMBER, unit: 'inches', isRequired: true, groupName: 'Display' },
    { name: 'Resolution', key: 'resolution', dataType: SpecDataType.SELECT, options: ['1080p', '1440p', '4K', '5K'], isRequired: true, groupName: 'Display' },
    { name: 'Panel Type', key: 'panel_type', dataType: SpecDataType.SELECT, options: ['IPS', 'VA', 'TN', 'OLED'], groupName: 'Display' },
    { name: 'Refresh Rate', key: 'refresh_rate', dataType: SpecDataType.NUMBER, unit: 'Hz', groupName: 'Performance' },
    { name: 'HDR', key: 'hdr', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
  ],

  // ── Electronics / Audio ──
  'headphones': [
    { name: 'Type', key: 'type', dataType: SpecDataType.SELECT, options: ['Over-ear', 'On-ear', 'In-ear', 'Earbuds'], isRequired: true, groupName: 'Design' },
    { name: 'Connectivity', key: 'connectivity', dataType: SpecDataType.SELECT, options: ['Wired', 'Bluetooth', 'Both'], isRequired: true, groupName: 'Connectivity' },
    { name: 'Battery Life', key: 'battery_life', dataType: SpecDataType.NUMBER, unit: 'hours', groupName: 'Battery' },
    { name: 'Driver Size', key: 'driver_size', dataType: SpecDataType.NUMBER, unit: 'mm', groupName: 'Audio' },
    { name: 'Noise Cancellation', key: 'noise_cancellation', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
  ],
  'earbuds': [
    { name: 'Connectivity', key: 'connectivity', dataType: SpecDataType.SELECT, options: ['Bluetooth 5.0', 'Bluetooth 5.2', 'Bluetooth 5.3'], isRequired: true, groupName: 'Connectivity' },
    { name: 'Battery Life', key: 'battery_life', dataType: SpecDataType.NUMBER, unit: 'hours', groupName: 'Battery' },
    { name: 'Noise Cancellation', key: 'noise_cancellation', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
    { name: 'Water Resistance', key: 'water_resistance', dataType: SpecDataType.SELECT, options: ['None', 'IPX4', 'IPX5', 'IPX7'], groupName: 'Protection' },
  ],
  'speakers': [
    { name: 'Connectivity', key: 'connectivity', dataType: SpecDataType.SELECT, options: ['Bluetooth', 'WiFi', 'Wired', 'Both'], isRequired: true, groupName: 'Connectivity' },
    { name: 'Battery Life', key: 'battery_life', dataType: SpecDataType.NUMBER, unit: 'hours', groupName: 'Battery' },
    { name: 'Waterproof', key: 'waterproof', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
    { name: 'Wattage', key: 'wattage', dataType: SpecDataType.NUMBER, unit: 'W', groupName: 'Power' },
  ],
  'microphones': [
    { name: 'Type', key: 'type', dataType: SpecDataType.SELECT, options: ['Condenser', 'Dynamic', 'Ribbon', 'USB'], isRequired: true, groupName: 'Type' },
    { name: 'Polar Pattern', key: 'polar_pattern', dataType: SpecDataType.SELECT, options: ['Cardioid', 'Omnidirectional', 'Bidirectional'], groupName: 'Audio' },
    { name: 'Connectivity', key: 'connectivity', dataType: SpecDataType.SELECT, options: ['USB', 'XLR', '3.5mm'], isRequired: true, groupName: 'Connectivity' },
    { name: 'Frequency Range', key: 'frequency_range', dataType: SpecDataType.TEXT, groupName: 'Audio' },
  ],

  // ── Fashion / Clothing ──
  't-shirts': [
    { name: 'Size', key: 'size', dataType: SpecDataType.SELECT, options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], isRequired: true, groupName: 'Sizing' },
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Cotton', 'Polyester', 'Blend', 'Linen'], isRequired: true, groupName: 'Material' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'White', 'Navy', 'Red', 'Grey', 'Green'], groupName: 'Appearance' },
    { name: 'Fit', key: 'fit', dataType: SpecDataType.SELECT, options: ['Regular', 'Slim', 'Oversized'], groupName: 'Fit' },
    { name: 'Sleeve Type', key: 'sleeve_type', dataType: SpecDataType.SELECT, options: ['Short', 'Long', 'Sleeveless'], groupName: 'Design' },
  ],
  'shirts': [
    { name: 'Size', key: 'size', dataType: SpecDataType.SELECT, options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], isRequired: true, groupName: 'Sizing' },
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Cotton', 'Linen', 'Polyester', 'Silk'], isRequired: true, groupName: 'Material' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['White', 'Blue', 'Black', 'Pink', 'Grey'], groupName: 'Appearance' },
    { name: 'Collar Type', key: 'collar_type', dataType: SpecDataType.SELECT, options: ['Spread', 'Button-Down', 'Mandarin', 'Point'], groupName: 'Design' },
    { name: 'Fit', key: 'fit', dataType: SpecDataType.SELECT, options: ['Regular', 'Slim', 'Tailored'], groupName: 'Fit' },
  ],
  'pants': [
    { name: 'Size', key: 'size', dataType: SpecDataType.SELECT, options: ['28', '30', '32', '34', '36', '38', '40'], isRequired: true, groupName: 'Sizing' },
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Cotton', 'Denim', 'Polyester', 'Chino'], isRequired: true, groupName: 'Material' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'Navy', 'Grey', 'Khaki', 'Blue'], groupName: 'Appearance' },
    { name: 'Fit', key: 'fit', dataType: SpecDataType.SELECT, options: ['Regular', 'Slim', 'Relaxed', 'Tapered'], groupName: 'Fit' },
  ],
  'jeans': [
    { name: 'Size', key: 'size', dataType: SpecDataType.SELECT, options: ['28', '30', '32', '34', '36', '38', '40'], isRequired: true, groupName: 'Sizing' },
    { name: 'Wash', key: 'wash', dataType: SpecDataType.SELECT, options: ['Light', 'Medium', 'Dark', 'Black', 'Distressed'], groupName: 'Appearance' },
    { name: 'Fit', key: 'fit', dataType: SpecDataType.SELECT, options: ['Slim', 'Regular', 'Relaxed', 'Skinny', 'Bootcut'], isRequired: true, groupName: 'Fit' },
    { name: 'Stretch', key: 'stretch', dataType: SpecDataType.BOOLEAN, groupName: 'Material' },
  ],
  'jackets': [
    { name: 'Size', key: 'size', dataType: SpecDataType.SELECT, options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], isRequired: true, groupName: 'Sizing' },
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Leather', 'Denim', 'Nylon', 'Polyester', 'Wool'], isRequired: true, groupName: 'Material' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'Brown', 'Navy', 'Grey', 'Green'], groupName: 'Appearance' },
    { name: 'Season', key: 'season', dataType: SpecDataType.SELECT, options: ['Winter', 'Spring', 'Fall', 'All-Season'], groupName: 'Usage' },
    { name: 'Waterproof', key: 'waterproof', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
  ],
  'dresses': [
    { name: 'Size', key: 'size', dataType: SpecDataType.SELECT, options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], isRequired: true, groupName: 'Sizing' },
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Cotton', 'Chiffon', 'Silk', 'Polyester', 'Linen'], isRequired: true, groupName: 'Material' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'Red', 'Blue', 'White', 'Floral', 'Pink'], groupName: 'Appearance' },
    { name: 'Length', key: 'length', dataType: SpecDataType.SELECT, options: ['Mini', 'Midi', 'Maxi'], groupName: 'Design' },
    { name: 'Sleeve Type', key: 'sleeve_type', dataType: SpecDataType.SELECT, options: ['Short', 'Long', 'Sleeveless', '3/4'], groupName: 'Design' },
  ],
  'tops': [
    { name: 'Size', key: 'size', dataType: SpecDataType.SELECT, options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], isRequired: true, groupName: 'Sizing' },
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Cotton', 'Polyester', 'Chiffon', 'Silk'], isRequired: true, groupName: 'Material' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'White', 'Pink', 'Blue', 'Red'], groupName: 'Appearance' },
    { name: 'Neckline', key: 'neckline', dataType: SpecDataType.SELECT, options: ['Crew', 'V-Neck', 'Scoop', 'Off-Shoulder'], groupName: 'Design' },
    { name: 'Fit', key: 'fit', dataType: SpecDataType.SELECT, options: ['Regular', 'Loose', 'Fitted'], groupName: 'Fit' },
  ],
  'skirts': [
    { name: 'Size', key: 'size', dataType: SpecDataType.SELECT, options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], isRequired: true, groupName: 'Sizing' },
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Cotton', 'Denim', 'Polyester', 'Silk'], isRequired: true, groupName: 'Material' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'Navy', 'Red', 'White', 'Floral'], groupName: 'Appearance' },
    { name: 'Length', key: 'length', dataType: SpecDataType.SELECT, options: ['Mini', 'Midi', 'Maxi'], groupName: 'Design' },
    { name: 'Pattern', key: 'pattern', dataType: SpecDataType.SELECT, options: ['Solid', 'Striped', 'Plaid', 'Floral'], groupName: 'Design' },
  ],

  // ── Fashion / Shoes ──
  "men's shoes": [
    { name: 'Size', key: 'size', dataType: SpecDataType.NUMBER, unit: 'US', isRequired: true, groupName: 'Sizing' },
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Leather', 'Suede', 'Canvas', 'Synthetic'], isRequired: true, groupName: 'Material' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'Brown', 'Tan', 'White', 'Navy'], groupName: 'Appearance' },
    { name: 'Type', key: 'type', dataType: SpecDataType.SELECT, options: ['Oxford', 'Loafer', 'Boot', 'Sneaker'], groupName: 'Style' },
    { name: 'Sole Type', key: 'sole_type', dataType: SpecDataType.SELECT, options: ['Rubber', 'Leather', 'EVA'], groupName: 'Construction' },
  ],
  "women's shoes": [
    { name: 'Size', key: 'size', dataType: SpecDataType.NUMBER, unit: 'US', isRequired: true, groupName: 'Sizing' },
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Leather', 'Suede', 'Canvas', 'Synthetic'], isRequired: true, groupName: 'Material' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'Nude', 'Red', 'White', 'Brown'], groupName: 'Appearance' },
    { name: 'Heel Height', key: 'heel_height', dataType: SpecDataType.SELECT, options: ['Flat', 'Low', 'Medium', 'High'], groupName: 'Design' },
    { name: 'Type', key: 'type', dataType: SpecDataType.SELECT, options: ['Pump', 'Flat', 'Sandal', 'Boot', 'Sneaker'], groupName: 'Style' },
  ],
  'sports shoes': [
    { name: 'Size', key: 'size', dataType: SpecDataType.NUMBER, unit: 'US', isRequired: true, groupName: 'Sizing' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'White', 'Blue', 'Red', 'Grey'], groupName: 'Appearance' },
    { name: 'Sole Type', key: 'sole_type', dataType: SpecDataType.SELECT, options: ['Rubber', 'EVA', 'Foam'], groupName: 'Construction' },
    { name: 'Closure', key: 'closure', dataType: SpecDataType.SELECT, options: ['Lace-up', 'Slip-on', 'Velcro'], groupName: 'Design' },
    { name: 'Weight', key: 'weight', dataType: SpecDataType.NUMBER, unit: 'g', groupName: 'Physical' },
  ],
  'sneakers': [
    { name: 'Size', key: 'size', dataType: SpecDataType.NUMBER, unit: 'US', isRequired: true, groupName: 'Sizing' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'White', 'Blue', 'Red', 'Grey', 'Multi'], groupName: 'Appearance' },
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Canvas', 'Leather', 'Mesh', 'Synthetic'], groupName: 'Material' },
    { name: 'Closure', key: 'closure', dataType: SpecDataType.SELECT, options: ['Lace-up', 'Slip-on', 'Velcro'], groupName: 'Design' },
  ],
  'boots': [
    { name: 'Size', key: 'size', dataType: SpecDataType.NUMBER, unit: 'US', isRequired: true, groupName: 'Sizing' },
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Leather', 'Suede', 'Rubber', 'Synthetic'], isRequired: true, groupName: 'Material' },
    { name: 'Waterproof', key: 'waterproof', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
    { name: 'Height', key: 'height', dataType: SpecDataType.SELECT, options: ['Ankle', 'Mid-Calf', 'Knee-High'], groupName: 'Design' },
  ],

  // ── Home & Garden / Furniture ──
  'living room': [
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Wood', 'Metal', 'Fabric', 'Leather'], isRequired: true, groupName: 'Material' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'Grey', 'Brown', 'White', 'Beige'], groupName: 'Appearance' },
    { name: 'Seats', key: 'seats', dataType: SpecDataType.NUMBER, groupName: 'Capacity' },
    { name: 'Weight Capacity', key: 'weight_capacity', dataType: SpecDataType.NUMBER, unit: 'kg', groupName: 'Specs' },
    { name: 'Assembly Required', key: 'assembly_required', dataType: SpecDataType.BOOLEAN, groupName: 'Setup' },
  ],
  'living room furniture': [
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Wood', 'Metal', 'Fabric', 'Leather'], isRequired: true, groupName: 'Material' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'Grey', 'Brown', 'White', 'Beige'], groupName: 'Appearance' },
    { name: 'Seats', key: 'seats', dataType: SpecDataType.NUMBER, groupName: 'Capacity' },
    { name: 'Weight Capacity', key: 'weight_capacity', dataType: SpecDataType.NUMBER, unit: 'kg', groupName: 'Specs' },
    { name: 'Assembly Required', key: 'assembly_required', dataType: SpecDataType.BOOLEAN, groupName: 'Setup' },
  ],
  'bedroom': [
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Wood', 'Metal', 'Upholstered', 'MDF'], isRequired: true, groupName: 'Material' },
    { name: 'Size', key: 'size', dataType: SpecDataType.SELECT, options: ['Twin', 'Full', 'Queen', 'King'], isRequired: true, groupName: 'Sizing' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['White', 'Black', 'Brown', 'Grey', 'Natural'], groupName: 'Appearance' },
    { name: 'Weight Capacity', key: 'weight_capacity', dataType: SpecDataType.NUMBER, unit: 'kg', groupName: 'Specs' },
    { name: 'Assembly Required', key: 'assembly_required', dataType: SpecDataType.BOOLEAN, groupName: 'Setup' },
  ],
  'bedroom furniture': [
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Wood', 'Metal', 'Upholstered', 'MDF'], isRequired: true, groupName: 'Material' },
    { name: 'Size', key: 'size', dataType: SpecDataType.SELECT, options: ['Twin', 'Full', 'Queen', 'King'], isRequired: true, groupName: 'Sizing' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['White', 'Black', 'Brown', 'Grey', 'Natural'], groupName: 'Appearance' },
    { name: 'Weight Capacity', key: 'weight_capacity', dataType: SpecDataType.NUMBER, unit: 'kg', groupName: 'Specs' },
    { name: 'Assembly Required', key: 'assembly_required', dataType: SpecDataType.BOOLEAN, groupName: 'Setup' },
  ],

  // ── Home & Garden / Kitchen ──
  'cookware': [
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Stainless Steel', 'Cast Iron', 'Aluminum', 'Ceramic', 'Non-Stick'], isRequired: true, groupName: 'Material' },
    { name: 'Size', key: 'size', dataType: SpecDataType.TEXT, groupName: 'Sizing' },
    { name: 'Compatible Heat Source', key: 'compatible_heat_source', dataType: SpecDataType.MULTI_SELECT, options: ['Gas', 'Electric', 'Induction', 'Oven'], groupName: 'Compatibility' },
    { name: 'Dishwasher Safe', key: 'dishwasher_safe', dataType: SpecDataType.BOOLEAN, groupName: 'Care' },
  ],
  'appliances': [
    { name: 'Wattage', key: 'wattage', dataType: SpecDataType.NUMBER, unit: 'W', isRequired: true, groupName: 'Power' },
    { name: 'Capacity', key: 'capacity', dataType: SpecDataType.TEXT, groupName: 'Specs' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'White', 'Silver', 'Red'], groupName: 'Appearance' },
    { name: 'Warranty', key: 'warranty', dataType: SpecDataType.SELECT, options: ['1 Year', '2 Years', '3 Years'], groupName: 'Support' },
    { name: 'Energy Rating', key: 'energy_rating', dataType: SpecDataType.SELECT, options: ['A+', 'A', 'B', 'C'], groupName: 'Efficiency' },
  ],
  'kitchen appliances': [
    { name: 'Wattage', key: 'wattage', dataType: SpecDataType.NUMBER, unit: 'W', isRequired: true, groupName: 'Power' },
    { name: 'Capacity', key: 'capacity', dataType: SpecDataType.TEXT, groupName: 'Specs' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'White', 'Silver', 'Red'], groupName: 'Appearance' },
    { name: 'Warranty', key: 'warranty', dataType: SpecDataType.SELECT, options: ['1 Year', '2 Years', '3 Years'], groupName: 'Support' },
    { name: 'Energy Rating', key: 'energy_rating', dataType: SpecDataType.SELECT, options: ['A+', 'A', 'B', 'C'], groupName: 'Efficiency' },
  ],
  'storage': [
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Plastic', 'Glass', 'Stainless Steel', 'Bamboo'], isRequired: true, groupName: 'Material' },
    { name: 'Capacity', key: 'capacity', dataType: SpecDataType.TEXT, groupName: 'Specs' },
    { name: 'Airtight', key: 'airtight', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
    { name: 'Dishwasher Safe', key: 'dishwasher_safe', dataType: SpecDataType.BOOLEAN, groupName: 'Care' },
  ],

  // ── Beauty & Health ──
  'skincare': [
    { name: 'Skin Type', key: 'skin_type', dataType: SpecDataType.MULTI_SELECT, options: ['Normal', 'Oily', 'Dry', 'Combination', 'Sensitive'], isRequired: true, groupName: 'Suitability' },
    { name: 'Volume', key: 'volume', dataType: SpecDataType.NUMBER, unit: 'ml', groupName: 'Packaging' },
    { name: 'Ingredients Type', key: 'ingredients_type', dataType: SpecDataType.SELECT, options: ['Natural', 'Synthetic', 'Organic'], groupName: 'Composition' },
    { name: 'SPF', key: 'spf', dataType: SpecDataType.SELECT, options: ['None', 'SPF 15', 'SPF 30', 'SPF 50'], groupName: 'Protection' },
    { name: 'Cruelty Free', key: 'cruelty_free', dataType: SpecDataType.BOOLEAN, groupName: 'Ethics' },
  ],
  'face care': [
    { name: 'Skin Type', key: 'skin_type', dataType: SpecDataType.MULTI_SELECT, options: ['Normal', 'Oily', 'Dry', 'Combination', 'Sensitive'], isRequired: true, groupName: 'Suitability' },
    { name: 'Volume', key: 'volume', dataType: SpecDataType.NUMBER, unit: 'ml', groupName: 'Packaging' },
    { name: 'Ingredients Type', key: 'ingredients_type', dataType: SpecDataType.SELECT, options: ['Natural', 'Synthetic', 'Organic'], groupName: 'Composition' },
    { name: 'Cruelty Free', key: 'cruelty_free', dataType: SpecDataType.BOOLEAN, groupName: 'Ethics' },
  ],
  'haircare': [
    { name: 'Hair Type', key: 'hair_type', dataType: SpecDataType.MULTI_SELECT, options: ['Straight', 'Wavy', 'Curly', 'Coily'], isRequired: true, groupName: 'Suitability' },
    { name: 'Volume', key: 'volume', dataType: SpecDataType.NUMBER, unit: 'ml', groupName: 'Packaging' },
    { name: 'Ingredients Type', key: 'ingredients_type', dataType: SpecDataType.SELECT, options: ['Natural', 'Synthetic', 'Organic'], groupName: 'Composition' },
    { name: 'Sulfate Free', key: 'sulfate_free', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
  ],
  'makeup': [
    { name: 'Finish', key: 'finish', dataType: SpecDataType.SELECT, options: ['Matte', 'Glossy', 'Satin', 'Shimmer'], groupName: 'Appearance' },
    { name: 'Coverage', key: 'coverage', dataType: SpecDataType.SELECT, options: ['Light', 'Medium', 'Full'], groupName: 'Performance' },
    { name: 'Shade Range', key: 'shade_range', dataType: SpecDataType.TEXT, groupName: 'Options' },
    { name: 'Cruelty Free', key: 'cruelty_free', dataType: SpecDataType.BOOLEAN, groupName: 'Ethics' },
    { name: 'Waterproof', key: 'waterproof', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
  ],
  'fragrances': [
    { name: 'Type', key: 'type', dataType: SpecDataType.SELECT, options: ['Eau de Parfum', 'Eau de Toilette', 'Cologne', 'Body Mist'], groupName: 'Type' },
    { name: 'Volume', key: 'volume', dataType: SpecDataType.NUMBER, unit: 'ml', groupName: 'Packaging' },
    { name: 'Gender', key: 'gender', dataType: SpecDataType.SELECT, options: ['Men', 'Women', 'Unisex'], groupName: 'Target' },
    { name: 'Longevity', key: 'longevity', dataType: SpecDataType.SELECT, options: ['2-4 hours', '4-6 hours', '6-8 hours', '8+ hours'], groupName: 'Performance' },
  ],

  // ── Sports & Outdoors ──
  'fitness': [
    { name: 'Weight Capacity', key: 'weight_capacity', dataType: SpecDataType.NUMBER, unit: 'kg', groupName: 'Specs' },
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Steel', 'Rubber', 'Foam', 'Neoprene'], isRequired: true, groupName: 'Material' },
    { name: 'Dimensions', key: 'dimensions', dataType: SpecDataType.TEXT, groupName: 'Size' },
    { name: 'Foldable', key: 'foldable', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
    { name: 'Weight', key: 'weight', dataType: SpecDataType.NUMBER, unit: 'kg', groupName: 'Physical' },
  ],
  'fitness equipment': [
    { name: 'Weight Capacity', key: 'weight_capacity', dataType: SpecDataType.NUMBER, unit: 'kg', groupName: 'Specs' },
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Steel', 'Rubber', 'Foam', 'Neoprene'], isRequired: true, groupName: 'Material' },
    { name: 'Dimensions', key: 'dimensions', dataType: SpecDataType.TEXT, groupName: 'Size' },
    { name: 'Foldable', key: 'foldable', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
    { name: 'Weight', key: 'weight', dataType: SpecDataType.NUMBER, unit: 'kg', groupName: 'Physical' },
  ],
  'camping': [
    { name: 'Capacity', key: 'capacity', dataType: SpecDataType.TEXT, groupName: 'Specs' },
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Nylon', 'Polyester', 'Canvas', 'Gore-Tex'], isRequired: true, groupName: 'Material' },
    { name: 'Weight', key: 'weight', dataType: SpecDataType.NUMBER, unit: 'kg', groupName: 'Physical' },
    { name: 'Waterproof', key: 'waterproof', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
    { name: 'Season Rating', key: 'season_rating', dataType: SpecDataType.SELECT, options: ['3-Season', '4-Season'], groupName: 'Usage' },
  ],
  'camping gear': [
    { name: 'Capacity', key: 'capacity', dataType: SpecDataType.TEXT, groupName: 'Specs' },
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Nylon', 'Polyester', 'Canvas', 'Gore-Tex'], isRequired: true, groupName: 'Material' },
    { name: 'Weight', key: 'weight', dataType: SpecDataType.NUMBER, unit: 'kg', groupName: 'Physical' },
    { name: 'Waterproof', key: 'waterproof', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
  ],
  'team sports': [
    { name: 'Sport', key: 'sport', dataType: SpecDataType.SELECT, options: ['Football', 'Basketball', 'Cricket', 'Volleyball', 'Hockey'], isRequired: true, groupName: 'Category' },
    { name: 'Size', key: 'size', dataType: SpecDataType.SELECT, options: ['3', '4', '5', 'Official'], groupName: 'Sizing' },
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Leather', 'Synthetic', 'Rubber'], isRequired: true, groupName: 'Material' },
    { name: 'Age Group', key: 'age_group', dataType: SpecDataType.SELECT, options: ['Youth', 'Adult'], groupName: 'Suitability' },
  ],

  // ── Automotive ──
  'car parts': [
    { name: 'Compatibility', key: 'compatibility', dataType: SpecDataType.TEXT, isRequired: true, groupName: 'Fitment' },
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Steel', 'Aluminum', 'Ceramic', 'Rubber'], groupName: 'Material' },
    { name: 'OEM', key: 'oem', dataType: SpecDataType.BOOLEAN, groupName: 'Quality' },
    { name: 'Warranty', key: 'warranty', dataType: SpecDataType.SELECT, options: ['6 Months', '1 Year', '2 Years', 'Lifetime'], groupName: 'Support' },
  ],
  'car electronics': [
    { name: 'Display Size', key: 'display_size', dataType: SpecDataType.NUMBER, unit: 'inches', groupName: 'Display' },
    { name: 'Resolution', key: 'resolution', dataType: SpecDataType.TEXT, groupName: 'Display' },
    { name: 'Connectivity', key: 'connectivity', dataType: SpecDataType.SELECT, options: ['WiFi', 'Bluetooth', 'USB', 'GPS'], groupName: 'Connectivity' },
    { name: 'Night Vision', key: 'night_vision', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
  ],
  'car accessories': [
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Leather', 'Fabric', 'Rubber', 'Neoprene'], groupName: 'Material' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'Grey', 'Beige', 'Brown'], groupName: 'Appearance' },
    { name: 'Universal Fit', key: 'universal_fit', dataType: SpecDataType.BOOLEAN, groupName: 'Compatibility' },
  ],

  // ── Office & School ──
  'stationery': [
    { name: 'Type', key: 'type', dataType: SpecDataType.SELECT, options: ['Ballpoint', 'Gel', 'Fountain', 'Mechanical'], groupName: 'Type' },
    { name: 'Pack Size', key: 'pack_size', dataType: SpecDataType.NUMBER, groupName: 'Quantity' },
    { name: 'Ink Color', key: 'ink_color', dataType: SpecDataType.SELECT, options: ['Black', 'Blue', 'Red', 'Multi'], groupName: 'Appearance' },
    { name: 'Refillable', key: 'refillable', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
  ],
  'supplies': [
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Plastic', 'Metal', 'Paper', 'Fabric'], groupName: 'Material' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'White', 'Blue', 'Multi'], groupName: 'Appearance' },
    { name: 'Pack Size', key: 'pack_size', dataType: SpecDataType.NUMBER, groupName: 'Quantity' },
  ],
  'office supplies': [
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Plastic', 'Metal', 'Paper', 'Fabric'], groupName: 'Material' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'White', 'Blue', 'Multi'], groupName: 'Appearance' },
    { name: 'Pack Size', key: 'pack_size', dataType: SpecDataType.NUMBER, groupName: 'Quantity' },
  ],
  'office furniture': [
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Wood', 'Metal', 'Mesh', 'Plastic'], isRequired: true, groupName: 'Material' },
    { name: 'Weight Capacity', key: 'weight_capacity', dataType: SpecDataType.NUMBER, unit: 'kg', groupName: 'Specs' },
    { name: 'Adjustable', key: 'adjustable', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'White', 'Grey', 'Brown'], groupName: 'Appearance' },
    { name: 'Ergonomic', key: 'ergonomic', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
  ],
  'furniture': [
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Wood', 'Metal', 'Mesh', 'Plastic', 'Fabric'], isRequired: true, groupName: 'Material' },
    { name: 'Weight Capacity', key: 'weight_capacity', dataType: SpecDataType.NUMBER, unit: 'kg', groupName: 'Specs' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'White', 'Grey', 'Brown', 'Natural'], groupName: 'Appearance' },
    { name: 'Assembly Required', key: 'assembly_required', dataType: SpecDataType.BOOLEAN, groupName: 'Setup' },
  ],

  // ── Watches (Fashion/Accessories) ──
  'watches': [
    { name: 'Movement', key: 'movement', dataType: SpecDataType.SELECT, options: ['Quartz', 'Automatic', 'Digital', 'Solar'], groupName: 'Mechanism' },
    { name: 'Case Material', key: 'case_material', dataType: SpecDataType.SELECT, options: ['Stainless Steel', 'Titanium', 'Gold', 'Plastic'], groupName: 'Material' },
    { name: 'Water Resistance', key: 'water_resistance', dataType: SpecDataType.SELECT, options: ['30m', '50m', '100m', '200m'], groupName: 'Protection' },
    { name: 'Diameter', key: 'diameter', dataType: SpecDataType.NUMBER, unit: 'mm', groupName: 'Size' },
  ],

  // ── Smartwatches (Electronics/Wearables) ──
  'smartwatches': [
    { name: 'Display', key: 'display', dataType: SpecDataType.SELECT, options: ['AMOLED', 'LCD', 'E-Ink'], groupName: 'Display' },
    { name: 'Battery Life', key: 'battery_life', dataType: SpecDataType.NUMBER, unit: 'days', groupName: 'Battery' },
    { name: 'Water Resistance', key: 'water_resistance', dataType: SpecDataType.SELECT, options: ['IP67', 'IP68', '5ATM', '10ATM'], groupName: 'Protection' },
    { name: 'OS', key: 'os', dataType: SpecDataType.SELECT, options: ['WearOS', 'watchOS', 'Tizen', 'Proprietary'], groupName: 'Software' },
    { name: 'GPS', key: 'gps', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
  ],

  // ── Intermediate Parent SPEC_MAP entries ──
  // These catch deep-leaf categories whose direct parents aren't mapped
  'mobile phones': [
    { name: 'Screen Size', key: 'screen_size', dataType: SpecDataType.NUMBER, unit: 'inches', isRequired: true, groupName: 'Display' },
    { name: 'RAM', key: 'ram', dataType: SpecDataType.SELECT, options: ['4GB', '6GB', '8GB', '12GB', '16GB'], groupName: 'Performance' },
    { name: 'Storage', key: 'storage', dataType: SpecDataType.SELECT, options: ['64GB', '128GB', '256GB', '512GB', '1TB'], groupName: 'Performance' },
    { name: 'Battery', key: 'battery', dataType: SpecDataType.NUMBER, unit: 'mAh', groupName: 'Battery' },
    { name: 'OS', key: 'os', dataType: SpecDataType.SELECT, options: ['Android', 'iOS'], groupName: 'Software' },
  ],
  'android smartphones': [
    { name: 'Screen Size', key: 'screen_size', dataType: SpecDataType.NUMBER, unit: 'inches', isRequired: true, groupName: 'Display' },
    { name: 'RAM', key: 'ram', dataType: SpecDataType.SELECT, options: ['4GB', '6GB', '8GB', '12GB', '16GB'], isRequired: true, groupName: 'Performance' },
    { name: 'Storage', key: 'storage', dataType: SpecDataType.SELECT, options: ['64GB', '128GB', '256GB', '512GB', '1TB'], isRequired: true, groupName: 'Performance' },
    { name: 'Battery', key: 'battery', dataType: SpecDataType.NUMBER, unit: 'mAh', isRequired: true, groupName: 'Battery' },
    { name: 'Camera', key: 'camera', dataType: SpecDataType.TEXT, groupName: 'Camera' },
    { name: 'Weight', key: 'weight', dataType: SpecDataType.NUMBER, unit: 'g', groupName: 'Physical' },
  ],
  'ios smartphones': [
    { name: 'Screen Size', key: 'screen_size', dataType: SpecDataType.NUMBER, unit: 'inches', isRequired: true, groupName: 'Display' },
    { name: 'Storage', key: 'storage', dataType: SpecDataType.SELECT, options: ['128GB', '256GB', '512GB', '1TB'], isRequired: true, groupName: 'Performance' },
    { name: 'Battery', key: 'battery', dataType: SpecDataType.NUMBER, unit: 'mAh', groupName: 'Battery' },
    { name: 'Camera', key: 'camera', dataType: SpecDataType.TEXT, groupName: 'Camera' },
    { name: 'Weight', key: 'weight', dataType: SpecDataType.NUMBER, unit: 'g', groupName: 'Physical' },
  ],
  'digital cameras': [
    { name: 'Sensor', key: 'sensor', dataType: SpecDataType.SELECT, options: ['Full Frame', 'APS-C', 'Micro 4/3', 'Medium Format'], isRequired: true, groupName: 'Sensor' },
    { name: 'Megapixels', key: 'megapixels', dataType: SpecDataType.NUMBER, unit: 'MP', isRequired: true, groupName: 'Image' },
    { name: 'ISO Range', key: 'iso_range', dataType: SpecDataType.TEXT, groupName: 'Performance' },
    { name: 'Video Resolution', key: 'video_resolution', dataType: SpecDataType.SELECT, options: ['1080p', '4K', '6K', '8K'], groupName: 'Video' },
    { name: 'Weight', key: 'weight', dataType: SpecDataType.NUMBER, unit: 'g', groupName: 'Physical' },
  ],
  'camera & photography': [
    { name: 'Type', key: 'type', dataType: SpecDataType.TEXT, groupName: 'General' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'Silver', 'White'], groupName: 'Appearance' },
    { name: 'Weight', key: 'weight', dataType: SpecDataType.NUMBER, unit: 'g', groupName: 'Physical' },
    { name: 'Brand', key: 'brand', dataType: SpecDataType.TEXT, groupName: 'General' },
  ],
  'gaming laptops': [
    { name: 'Screen Size', key: 'screen_size', dataType: SpecDataType.NUMBER, unit: 'inches', isRequired: true, groupName: 'Display' },
    { name: 'RAM', key: 'ram', dataType: SpecDataType.SELECT, options: ['16GB', '32GB', '64GB'], isRequired: true, groupName: 'Performance' },
    { name: 'Storage', key: 'storage', dataType: SpecDataType.SELECT, options: ['512GB', '1TB', '2TB'], isRequired: true, groupName: 'Performance' },
    { name: 'Processor', key: 'processor', dataType: SpecDataType.TEXT, isRequired: true, groupName: 'Performance' },
    { name: 'GPU', key: 'gpu', dataType: SpecDataType.TEXT, isRequired: true, groupName: 'Performance' },
    { name: 'Refresh Rate', key: 'refresh_rate', dataType: SpecDataType.NUMBER, unit: 'Hz', groupName: 'Display' },
    { name: 'Weight', key: 'weight', dataType: SpecDataType.NUMBER, unit: 'kg', groupName: 'Physical' },
  ],
  'business laptops': [
    { name: 'Screen Size', key: 'screen_size', dataType: SpecDataType.NUMBER, unit: 'inches', isRequired: true, groupName: 'Display' },
    { name: 'RAM', key: 'ram', dataType: SpecDataType.SELECT, options: ['8GB', '16GB', '32GB'], isRequired: true, groupName: 'Performance' },
    { name: 'Storage', key: 'storage', dataType: SpecDataType.SELECT, options: ['256GB', '512GB', '1TB'], isRequired: true, groupName: 'Performance' },
    { name: 'Processor', key: 'processor', dataType: SpecDataType.TEXT, isRequired: true, groupName: 'Performance' },
    { name: 'Battery Life', key: 'battery_life', dataType: SpecDataType.NUMBER, unit: 'hours', groupName: 'Battery' },
    { name: 'Weight', key: 'weight', dataType: SpecDataType.NUMBER, unit: 'kg', groupName: 'Physical' },
  ],
  'keyboards': [
    { name: 'Type', key: 'type', dataType: SpecDataType.SELECT, options: ['Mechanical', 'Membrane', 'Scissor', 'Optical'], isRequired: true, groupName: 'Type' },
    { name: 'Connectivity', key: 'connectivity', dataType: SpecDataType.SELECT, options: ['Wired', 'Wireless', 'Both'], isRequired: true, groupName: 'Connectivity' },
    { name: 'Layout', key: 'layout', dataType: SpecDataType.SELECT, options: ['Full', 'TKL', '75%', '65%', '60%'], groupName: 'Design' },
    { name: 'Backlight', key: 'backlight', dataType: SpecDataType.SELECT, options: ['None', 'White', 'RGB'], groupName: 'Features' },
  ],
  'mice': [
    { name: 'DPI', key: 'dpi', dataType: SpecDataType.NUMBER, groupName: 'Performance' },
    { name: 'Connectivity', key: 'connectivity', dataType: SpecDataType.SELECT, options: ['Wired', 'Wireless', 'Both'], isRequired: true, groupName: 'Connectivity' },
    { name: 'Buttons', key: 'buttons', dataType: SpecDataType.NUMBER, groupName: 'Features' },
    { name: 'Weight', key: 'weight', dataType: SpecDataType.NUMBER, unit: 'g', groupName: 'Physical' },
  ],
  'hoodies & sweatshirts': [
    { name: 'Size', key: 'size', dataType: SpecDataType.SELECT, options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], isRequired: true, groupName: 'Sizing' },
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Cotton', 'Polyester', 'Fleece', 'Blend'], isRequired: true, groupName: 'Material' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'Grey', 'Navy', 'White', 'Red'], groupName: 'Appearance' },
    { name: 'Type', key: 'type', dataType: SpecDataType.SELECT, options: ['Pullover', 'Zip-up', 'Crewneck'], groupName: 'Style' },
  ],
  'coats': [
    { name: 'Size', key: 'size', dataType: SpecDataType.SELECT, options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'], isRequired: true, groupName: 'Sizing' },
    { name: 'Material', key: 'material', dataType: SpecDataType.SELECT, options: ['Wool', 'Down', 'Polyester', 'Nylon'], isRequired: true, groupName: 'Material' },
    { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'Navy', 'Grey', 'Brown', 'Camel'], groupName: 'Appearance' },
    { name: 'Waterproof', key: 'waterproof', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
  ],
  'home theater': [
    { name: 'Channels', key: 'channels', dataType: SpecDataType.SELECT, options: ['2.0', '2.1', '5.1', '7.1', 'Atmos'], groupName: 'Audio' },
    { name: 'Wattage', key: 'wattage', dataType: SpecDataType.NUMBER, unit: 'W', groupName: 'Power' },
    { name: 'Connectivity', key: 'connectivity', dataType: SpecDataType.SELECT, options: ['HDMI', 'Bluetooth', 'WiFi', 'Optical'], groupName: 'Connectivity' },
    { name: 'Subwoofer', key: 'subwoofer', dataType: SpecDataType.BOOLEAN, groupName: 'Features' },
  ],
  'wearable technology': [
    { name: 'Display', key: 'display', dataType: SpecDataType.SELECT, options: ['AMOLED', 'LCD', 'E-Ink'], groupName: 'Display' },
    { name: 'Battery Life', key: 'battery_life', dataType: SpecDataType.NUMBER, unit: 'days', groupName: 'Battery' },
    { name: 'Water Resistance', key: 'water_resistance', dataType: SpecDataType.SELECT, options: ['IP67', 'IP68', '5ATM'], groupName: 'Protection' },
    { name: 'Connectivity', key: 'connectivity', dataType: SpecDataType.SELECT, options: ['Bluetooth', 'WiFi', 'LTE'], groupName: 'Connectivity' },
  ],
};

// ─────────────────────────────────────────────────────────
// GENERIC FALLBACK SPECS (for leaves not in SPEC_MAP)
// ─────────────────────────────────────────────────────────
const GENERIC_SPECS: SpecDef[] = [
  { name: 'Brand', key: 'brand', dataType: SpecDataType.TEXT, groupName: 'General' },
  { name: 'Color', key: 'color', dataType: SpecDataType.SELECT, options: ['Black', 'White', 'Red', 'Blue', 'Green', 'Grey', 'Brown'], groupName: 'Appearance' },
  { name: 'Material', key: 'material', dataType: SpecDataType.TEXT, groupName: 'Material' },
  { name: 'Weight', key: 'weight', dataType: SpecDataType.NUMBER, unit: 'g', groupName: 'Physical' },
];

// ─────────────────────────────────────────────────────────
// GENERIC FALLBACK TAGS
// ─────────────────────────────────────────────────────────
const GENERIC_TAGS: string[] = ['general', 'product'];

// ═══════════════════════════════════════════════════════════
// STEP 1: Build category tree from DB
// ═══════════════════════════════════════════════════════════
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

  console.log(`  Total active categories in DB: ${allCats.length}`);

  // Build lookup (also stored globally for ancestor resolution)
  const nodeMap = new Map<number, CategoryNode>();
  globalNodeMap = nodeMap;
  for (const cat of allCats) {
    nodeMap.set(cat.id, {
      id: cat.id,
      name: cat.name,
      parentId: cat.parentId,
      children: [],
      path: cat.name,
    });
  }

  // Link children
  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(node);
    }
  }

  // Build paths
  function buildPath(node: CategoryNode): string {
    if (node.parentId && nodeMap.has(node.parentId)) {
      return buildPath(nodeMap.get(node.parentId)!) + ' > ' + node.name;
    }
    return node.name;
  }
  for (const node of nodeMap.values()) {
    node.path = buildPath(node);
  }

  // Identify leaves (no children)
  const allCategories = [...nodeMap.values()];
  const leafCategories = allCategories.filter(n => n.children.length === 0);

  console.log(`  Leaf categories (no children): ${leafCategories.length}`);
  for (const leaf of leafCategories) {
    console.log(`    [leaf] id=${leaf.id} "${leaf.path}"`);
  }

  return { allCategories, leafCategories };
}

/**
 * Walk up ancestors to find the BEST matching key in TAG_MAP or SPEC_MAP.
 * e.g. "Budget Android Phones" → parent "Android Smartphones" → parent "Smartphones" → MATCH!
 * Returns the matched key (lowercase) or null.
 */
function findBestAncestorKey(
  leaf: CategoryNode,
  lookupMap: Record<string, any>,
  nodeMap: Map<number, CategoryNode>,
): string | null {
  // Try self first
  const selfKey = leaf.name.toLowerCase();
  if (lookupMap[selfKey]) return selfKey;

  // Walk up parent chain
  let currentId = leaf.parentId;
  while (currentId && nodeMap.has(currentId)) {
    const parent = nodeMap.get(currentId)!;
    const parentKey = parent.name.toLowerCase();
    if (lookupMap[parentKey]) return parentKey;
    currentId = parent.parentId;
  }
  return null;
}

// Build a global nodeMap accessible by other functions
let globalNodeMap: Map<number, CategoryNode> = new Map();

// ═══════════════════════════════════════════════════════════
// STEP 2: Seed tags for all leaf categories
// ═══════════════════════════════════════════════════════════
const tagIdCache: Record<string, number> = {};

async function getOrCreateTag(tagName: string): Promise<number> {
  if (tagIdCache[tagName]) return tagIdCache[tagName];

  let existing = await prisma.tags.findFirst({
    where: { tagName, deletedAt: null },
  });

  if (existing) {
    tagIdCache[tagName] = existing.id;
    return existing.id;
  }

  const created = await prisma.tags.create({
    data: { tagName, status: Status.ACTIVE },
  });
  tagIdCache[tagName] = created.id;
  return created.id;
}

async function seedTagsForLeaves(leafCategories: CategoryNode[]): Promise<void> {
  console.log('\n--- Seeding Tags for Leaf Categories ---');
  let totalLinks = 0;

  for (const leaf of leafCategories) {
    const matchedKey = findBestAncestorKey(leaf, TAG_MAP, globalNodeMap);
    const tagNames = matchedKey ? TAG_MAP[matchedKey] : GENERIC_TAGS;
    const matchInfo = matchedKey ? `matched="${matchedKey}"` : 'fallback=generic';

    console.log(`  [${leaf.id}] "${leaf.name}" (${matchInfo}) → ${tagNames.length} tags: [${tagNames.join(', ')}]`);

    for (const tagName of tagNames) {
      const tagId = await getOrCreateTag(tagName);
      try {
        await prisma.categoryTag.upsert({
          where: { categoryId_tagId: { categoryId: leaf.id, tagId } },
          update: { status: Status.ACTIVE },
          create: { categoryId: leaf.id, tagId, status: Status.ACTIVE },
        });
        totalLinks++;
      } catch (e: any) {
        if (!e.message?.includes('Unique constraint')) {
          console.warn(`    [warn] CategoryTag cat=${leaf.id} tag=${tagId}: ${e.message}`);
        }
      }
    }
  }

  console.log(`  Total tags created/found: ${Object.keys(tagIdCache).length}`);
  console.log(`  Total leaf category-tag links: ${totalLinks}`);
}

// ═══════════════════════════════════════════════════════════
// STEP 3: Bottom-up tag aggregation to parents
// ═══════════════════════════════════════════════════════════
async function aggregateTagsToParents(allCategories: CategoryNode[]): Promise<void> {
  console.log('\n--- Aggregating Tags Bottom-Up to Parents ---');

  // Build parent-to-children map
  const parentMap = new Map<number, CategoryNode[]>();
  for (const cat of allCategories) {
    if (cat.parentId) {
      if (!parentMap.has(cat.parentId)) parentMap.set(cat.parentId, []);
      parentMap.get(cat.parentId)!.push(cat);
    }
  }

  // Collect all tag IDs for each category (including inherited from children)
  const catTagSets = new Map<number, Set<number>>();

  // Initialize from DB existing category-tag links (just seeded for leaves)
  const existingLinks = await prisma.categoryTag.findMany({
    where: { status: Status.ACTIVE },
    select: { categoryId: true, tagId: true },
  });
  for (const link of existingLinks) {
    if (!catTagSets.has(link.categoryId)) catTagSets.set(link.categoryId, new Set());
    catTagSets.get(link.categoryId)!.add(link.tagId);
  }

  // Recursive function to collect all descendant tags
  function collectDescendantTags(catId: number): Set<number> {
    const myTags = catTagSets.get(catId) ?? new Set<number>();
    const children = parentMap.get(catId) ?? [];
    for (const child of children) {
      const childTags = collectDescendantTags(child.id);
      childTags.forEach(t => myTags.add(t));
    }
    catTagSets.set(catId, myTags);
    return myTags;
  }

  // Find root categories and process
  const roots = allCategories.filter(c => !c.parentId);
  for (const root of roots) {
    collectDescendantTags(root.id);
  }

  // Now write the aggregated tags to non-leaf categories
  let parentLinks = 0;
  for (const cat of allCategories) {
    if (cat.children.length === 0) continue; // skip leaves (already done)
    const tags = catTagSets.get(cat.id);
    if (!tags || tags.size === 0) continue;

    for (const tagId of tags) {
      try {
        await prisma.categoryTag.upsert({
          where: { categoryId_tagId: { categoryId: cat.id, tagId } },
          update: { status: Status.ACTIVE },
          create: { categoryId: cat.id, tagId, status: Status.ACTIVE },
        });
        parentLinks++;
      } catch {
        // ignore
      }
    }
    console.log(`  [parent] "${cat.name}" (id=${cat.id}): ${tags.size} aggregated tags`);
  }

  console.log(`  Parent category-tag links created: ${parentLinks}`);
}

// ═══════════════════════════════════════════════════════════
// STEP 4: Seed spec templates for all leaf categories
// ═══════════════════════════════════════════════════════════
async function seedSpecTemplatesForLeaves(leafCategories: CategoryNode[]): Promise<void> {
  console.log('\n--- Seeding Spec Templates for Leaf Categories ---');
  let totalSpecs = 0;

  for (const leaf of leafCategories) {
    const matchedKey = findBestAncestorKey(leaf, SPEC_MAP, globalNodeMap);
    const specs = matchedKey ? SPEC_MAP[matchedKey] : GENERIC_SPECS;
    const matchInfo = matchedKey ? `matched="${matchedKey}"` : 'fallback=generic';

    console.log(`  [${leaf.id}] "${leaf.name}" (${matchInfo}) → ${specs.length} specs`);

    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      try {
        await prisma.specTemplate.upsert({
          where: { categoryId_key: { categoryId: leaf.id, key: spec.key } },
          update: {
            name: spec.name,
            dataType: spec.dataType,
            unit: spec.unit ?? null,
            options: spec.options ? spec.options.join(',') : undefined,
            isRequired: spec.isRequired ?? false,
            isFilterable: true,
            sortOrder: i,
            groupName: spec.groupName ?? null,
            status: Status.ACTIVE,
          },
          create: {
            categoryId: leaf.id,
            name: spec.name,
            key: spec.key,
            dataType: spec.dataType,
            unit: spec.unit ?? null,
            options: spec.options ? spec.options.join(',') : undefined,
            isRequired: spec.isRequired ?? false,
            isFilterable: true,
            sortOrder: i,
            groupName: spec.groupName ?? null,
            status: Status.ACTIVE,
          },
        });
        totalSpecs++;
      } catch (e: any) {
        console.warn(`    [warn] spec "${spec.key}" for cat ${leaf.id}: ${e.message}`);
      }
    }
  }

  console.log(`  Total spec templates upserted: ${totalSpecs}`);
}

// ═══════════════════════════════════════════════════════════
// STEP 5: Seed test users
// ═══════════════════════════════════════════════════════════
async function seedUsers(): Promise<{ sellerId: number; buyerId: number }> {
  console.log('\n--- Seeding Test Users ---');
  const passwordHash = await bcrypt.hash('Test123!', 10);

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

  await prisma.masterAccount.update({
    where: { id: sellerMaster.id },
    data: { lastActiveUserId: seller.id },
  });
  console.log(`  Seller: masterAccount=${sellerMaster.id}, user=${seller.id}`);

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
  console.log(`  Buyer: masterAccount=${buyerMaster.id}, user=${buyer.id}`);

  return { sellerId: seller.id, buyerId: buyer.id };
}

// ─────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log('========================================');
  console.log('  Ultrasooq Database Seed Script');
  console.log('  (Reads EXISTING categories from DB)');
  console.log('========================================');

  // 1. Build category tree from actual DB data
  const { allCategories, leafCategories } = await buildCategoryTree();

  if (leafCategories.length === 0) {
    console.log('\n⚠️  No leaf categories found! Please create categories first via the admin panel.');
    return;
  }

  // 2. Seed tags for each leaf category
  await seedTagsForLeaves(leafCategories);

  // 3. Aggregate tags bottom-up to parent categories
  await aggregateTagsToParents(allCategories);

  // 4. Seed spec templates for each leaf category
  await seedSpecTemplatesForLeaves(leafCategories);

  // 5. Seed test users
  await seedUsers();

  // Summary
  const totalTags = await prisma.tags.count({ where: { deletedAt: null } });
  const totalCatTags = await prisma.categoryTag.count({ where: { status: Status.ACTIVE } });
  const totalSpecs = await prisma.specTemplate.count({ where: { status: Status.ACTIVE } });

  console.log('\n========================================');
  console.log('  Seed Summary:');
  console.log(`    Leaf categories processed: ${leafCategories.length}`);
  console.log(`    Total tags: ${totalTags}`);
  console.log(`    Total category-tag links: ${totalCatTags}`);
  console.log(`    Total spec templates: ${totalSpecs}`);
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
