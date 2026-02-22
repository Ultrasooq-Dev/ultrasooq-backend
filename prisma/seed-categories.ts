import 'dotenv/config';
import { PrismaClient, Status } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

interface CatNode {
  name: string;
  children?: CatNode[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Alibaba-style 6-level deep category tree — 12 root categories, ~400+ total
// ═══════════════════════════════════════════════════════════════════════════════

const TREE: CatNode[] = [
  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Consumer Electronics
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'Consumer Electronics',
    children: [
      {
        name: 'Mobile Phones & Accessories',
        children: [
          {
            name: 'Mobile Phones',
            children: [
              {
                name: 'Smartphones',
                children: [
                  {
                    name: 'Android Smartphones',
                    children: [
                      { name: 'Budget Android Phones' },
                      { name: 'Mid-Range Android Phones' },
                      { name: 'Flagship Android Phones' },
                    ],
                  },
                  {
                    name: 'iOS Smartphones',
                    children: [
                      { name: 'iPhone Standard' },
                      { name: 'iPhone Pro' },
                      { name: 'iPhone SE Series' },
                    ],
                  },
                ],
              },
              {
                name: 'Feature Phones',
                children: [
                  { name: 'Bar Phones' },
                  { name: 'Flip Phones' },
                  { name: 'Slider Phones' },
                ],
              },
            ],
          },
          {
            name: 'Phone Accessories',
            children: [
              {
                name: 'Cases & Covers',
                children: [
                  { name: 'Silicone Cases' },
                  { name: 'Leather Cases' },
                  { name: 'Clear Cases' },
                  { name: 'Wallet Cases' },
                ],
              },
              {
                name: 'Screen Protectors',
                children: [
                  { name: 'Tempered Glass' },
                  { name: 'Privacy Screen' },
                  { name: 'Anti-Glare Film' },
                ],
              },
              {
                name: 'Chargers & Cables',
                children: [
                  { name: 'USB-C Chargers' },
                  { name: 'Wireless Chargers' },
                  { name: 'Car Chargers' },
                  { name: 'Lightning Cables' },
                ],
              },
            ],
          },
        ],
      },
      {
        name: 'Computers & Office',
        children: [
          {
            name: 'Laptops',
            children: [
              {
                name: 'Gaming Laptops',
                children: [
                  { name: 'Entry Gaming Laptops' },
                  { name: 'Mid-Range Gaming Laptops' },
                  { name: 'High-End Gaming Laptops' },
                ],
              },
              {
                name: 'Business Laptops',
                children: [
                  { name: 'Ultrabooks' },
                  { name: 'Workstations' },
                  { name: '2-in-1 Laptops' },
                ],
              },
            ],
          },
          {
            name: 'Desktops',
            children: [
              { name: 'All-in-One PCs' },
              { name: 'Tower PCs' },
              { name: 'Mini PCs' },
            ],
          },
          {
            name: 'Tablets',
            children: [
              { name: 'Android Tablets' },
              { name: 'iPads' },
              { name: 'Windows Tablets' },
            ],
          },
          {
            name: 'Computer Peripherals',
            children: [
              {
                name: 'Keyboards',
                children: [
                  { name: 'Mechanical Keyboards' },
                  { name: 'Membrane Keyboards' },
                  { name: 'Wireless Keyboards' },
                ],
              },
              {
                name: 'Mice',
                children: [
                  { name: 'Gaming Mice' },
                  { name: 'Ergonomic Mice' },
                  { name: 'Wireless Mice' },
                ],
              },
              {
                name: 'Monitors',
                children: [
                  { name: 'Gaming Monitors' },
                  { name: 'Ultrawide Monitors' },
                  { name: '4K Monitors' },
                ],
              },
            ],
          },
        ],
      },
      {
        name: 'Audio & Video',
        children: [
          {
            name: 'Headphones & Earphones',
            children: [
              {
                name: 'Over-Ear Headphones',
                children: [
                  { name: 'Wireless Over-Ear' },
                  { name: 'Wired Over-Ear' },
                  { name: 'Studio Headphones' },
                ],
              },
              {
                name: 'In-Ear Earphones',
                children: [
                  { name: 'True Wireless Earbuds' },
                  { name: 'Wired Earbuds' },
                  { name: 'Sports Earbuds' },
                ],
              },
            ],
          },
          {
            name: 'Speakers',
            children: [
              { name: 'Bluetooth Speakers' },
              { name: 'Smart Speakers' },
              { name: 'Soundbars' },
              { name: 'Portable Speakers' },
            ],
          },
          {
            name: 'Home Theater',
            children: [
              { name: 'Projectors' },
              { name: 'AV Receivers' },
              { name: 'Surround Sound Systems' },
            ],
          },
        ],
      },
      {
        name: 'Camera & Photography',
        children: [
          {
            name: 'Digital Cameras',
            children: [
              { name: 'DSLR Cameras' },
              { name: 'Mirrorless Cameras' },
              { name: 'Point-and-Shoot Cameras' },
            ],
          },
          {
            name: 'Camera Accessories',
            children: [
              { name: 'Camera Lenses' },
              { name: 'Tripods' },
              { name: 'Camera Bags' },
            ],
          },
          {
            name: 'Action Cameras',
            children: [
              { name: 'Sports Cameras' },
              { name: '360 Cameras' },
              { name: 'Underwater Cameras' },
            ],
          },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Fashion & Apparel
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'Fashion & Apparel',
    children: [
      {
        name: "Men's Clothing",
        children: [
          {
            name: 'Tops',
            children: [
              {
                name: 'T-Shirts',
                children: [
                  { name: 'Graphic Tees' },
                  { name: 'Plain Tees' },
                  { name: 'Polo Shirts' },
                ],
              },
              {
                name: 'Shirts',
                children: [
                  { name: 'Dress Shirts' },
                  { name: 'Casual Shirts' },
                  { name: 'Flannel Shirts' },
                ],
              },
              {
                name: 'Hoodies & Sweatshirts',
                children: [
                  { name: 'Pullover Hoodies' },
                  { name: 'Zip Hoodies' },
                  { name: 'Crewneck Sweatshirts' },
                ],
              },
            ],
          },
          {
            name: 'Bottoms',
            children: [
              {
                name: 'Jeans',
                children: [
                  { name: 'Slim Fit Jeans' },
                  { name: 'Regular Fit Jeans' },
                  { name: 'Relaxed Fit Jeans' },
                ],
              },
              {
                name: 'Pants',
                children: [
                  { name: 'Chinos' },
                  { name: 'Cargo Pants' },
                  { name: 'Dress Pants' },
                ],
              },
              {
                name: 'Shorts',
                children: [
                  { name: 'Casual Shorts' },
                  { name: 'Athletic Shorts' },
                  { name: 'Cargo Shorts' },
                ],
              },
            ],
          },
          {
            name: 'Outerwear',
            children: [
              {
                name: 'Jackets',
                children: [
                  { name: 'Leather Jackets' },
                  { name: 'Bomber Jackets' },
                  { name: 'Denim Jackets' },
                ],
              },
              {
                name: 'Coats',
                children: [
                  { name: 'Winter Coats' },
                  { name: 'Trench Coats' },
                  { name: 'Parkas' },
                ],
              },
            ],
          },
        ],
      },
      {
        name: "Women's Clothing",
        children: [
          {
            name: 'Dresses',
            children: [
              { name: 'Casual Dresses' },
              { name: 'Evening Dresses' },
              { name: 'Maxi Dresses' },
              { name: 'Mini Dresses' },
            ],
          },
          {
            name: 'Tops',
            children: [
              { name: 'Blouses' },
              { name: 'Tank Tops' },
              { name: 'Crop Tops' },
            ],
          },
          {
            name: 'Bottoms',
            children: [
              { name: "Women's Jeans" },
              { name: 'Skirts' },
              { name: 'Leggings' },
            ],
          },
          {
            name: 'Outerwear',
            children: [
              { name: "Women's Jackets" },
              { name: 'Cardigans' },
              { name: 'Blazers' },
            ],
          },
        ],
      },
      {
        name: 'Shoes',
        children: [
          {
            name: "Men's Shoes",
            children: [
              { name: "Men's Sneakers" },
              { name: 'Dress Shoes' },
              { name: "Men's Boots" },
              { name: "Men's Sandals" },
            ],
          },
          {
            name: "Women's Shoes",
            children: [
              { name: 'Heels' },
              { name: 'Flats' },
              { name: "Women's Sneakers" },
              { name: "Women's Boots" },
            ],
          },
          {
            name: 'Sports Shoes',
            children: [
              { name: 'Running Shoes' },
              { name: 'Basketball Shoes' },
              { name: 'Training Shoes' },
            ],
          },
        ],
      },
      {
        name: 'Bags & Accessories',
        children: [
          {
            name: 'Handbags',
            children: [
              { name: 'Tote Bags' },
              { name: 'Crossbody Bags' },
              { name: 'Clutches' },
            ],
          },
          {
            name: 'Backpacks',
            children: [
              { name: 'Laptop Backpacks' },
              { name: 'Travel Backpacks' },
              { name: 'School Backpacks' },
            ],
          },
          {
            name: 'Wallets',
            children: [
              { name: "Men's Wallets" },
              { name: "Women's Wallets" },
              { name: 'Card Holders' },
            ],
          },
          {
            name: 'Jewelry',
            children: [
              { name: 'Necklaces' },
              { name: 'Bracelets' },
              { name: 'Earrings' },
              { name: 'Rings' },
            ],
          },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Home & Garden
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'Home & Garden',
    children: [
      {
        name: 'Furniture',
        children: [
          {
            name: 'Living Room Furniture',
            children: [
              { name: 'Sofas' },
              { name: 'Coffee Tables' },
              { name: 'TV Stands' },
              { name: 'Bookshelves' },
            ],
          },
          {
            name: 'Bedroom Furniture',
            children: [
              { name: 'Beds' },
              { name: 'Mattresses' },
              { name: 'Wardrobes' },
              { name: 'Nightstands' },
            ],
          },
          {
            name: 'Office Furniture',
            children: [
              { name: 'Office Desks' },
              { name: 'Office Chairs' },
              { name: 'Filing Cabinets' },
            ],
          },
          {
            name: 'Dining Room Furniture',
            children: [
              { name: 'Dining Tables' },
              { name: 'Dining Chairs' },
              { name: 'Sideboards' },
            ],
          },
        ],
      },
      {
        name: 'Kitchen & Dining',
        children: [
          {
            name: 'Cookware',
            children: [
              { name: 'Pots & Pans' },
              { name: 'Baking Tools' },
              { name: 'Knife Sets' },
            ],
          },
          {
            name: 'Kitchen Appliances',
            children: [
              { name: 'Blenders' },
              { name: 'Air Fryers' },
              { name: 'Coffee Makers' },
              { name: 'Toasters' },
            ],
          },
          {
            name: 'Tableware',
            children: [
              { name: 'Dinner Sets' },
              { name: 'Glassware' },
              { name: 'Cutlery Sets' },
            ],
          },
        ],
      },
      {
        name: 'Home Decor',
        children: [
          {
            name: 'Lighting',
            children: [
              { name: 'Ceiling Lights' },
              { name: 'Table Lamps' },
              { name: 'LED Strips' },
              { name: 'Floor Lamps' },
            ],
          },
          {
            name: 'Wall Decor',
            children: [
              { name: 'Wall Art' },
              { name: 'Mirrors' },
              { name: 'Wall Clocks' },
            ],
          },
          {
            name: 'Textiles',
            children: [
              { name: 'Curtains' },
              { name: 'Rugs' },
              { name: 'Throw Pillows' },
            ],
          },
        ],
      },
      {
        name: 'Garden & Outdoor',
        children: [
          {
            name: 'Garden Tools',
            children: [
              { name: 'Pruning Tools' },
              { name: 'Lawn Mowers' },
              { name: 'Garden Hoses' },
            ],
          },
          {
            name: 'Outdoor Furniture',
            children: [
              { name: 'Patio Sets' },
              { name: 'Hammocks' },
              { name: 'Garden Benches' },
            ],
          },
          {
            name: 'Plants & Seeds',
            children: [
              { name: 'Indoor Plants' },
              { name: 'Outdoor Plants' },
              { name: 'Seeds & Bulbs' },
            ],
          },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Beauty & Personal Care
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'Beauty & Personal Care',
    children: [
      {
        name: 'Skincare',
        children: [
          {
            name: 'Face Care',
            children: [
              { name: 'Cleansers' },
              { name: 'Moisturizers' },
              { name: 'Serums' },
              { name: 'Sunscreen' },
            ],
          },
          {
            name: 'Body Care',
            children: [
              { name: 'Body Lotion' },
              { name: 'Body Wash' },
              { name: 'Exfoliators' },
            ],
          },
        ],
      },
      {
        name: 'Hair Care',
        children: [
          {
            name: 'Shampoo & Conditioner',
            children: [
              { name: 'Anti-Dandruff' },
              { name: 'Color Protection' },
              { name: 'Volumizing' },
            ],
          },
          {
            name: 'Hair Styling Tools',
            children: [
              { name: 'Hair Dryers' },
              { name: 'Straighteners' },
              { name: 'Curling Irons' },
            ],
          },
        ],
      },
      {
        name: 'Makeup',
        children: [
          {
            name: 'Face Makeup',
            children: [
              { name: 'Foundation' },
              { name: 'Concealer' },
              { name: 'Setting Powder' },
              { name: 'Blush' },
            ],
          },
          {
            name: 'Eye Makeup',
            children: [
              { name: 'Eyeshadow Palettes' },
              { name: 'Mascara' },
              { name: 'Eyeliner' },
              { name: 'Eyebrow Products' },
            ],
          },
          {
            name: 'Lip Products',
            children: [
              { name: 'Lipstick' },
              { name: 'Lip Gloss' },
              { name: 'Lip Liner' },
            ],
          },
        ],
      },
      {
        name: 'Fragrances',
        children: [
          { name: "Men's Perfume" },
          { name: "Women's Perfume" },
          { name: 'Unisex Fragrances' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Sports & Outdoors
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'Sports & Outdoors',
    children: [
      {
        name: 'Fitness Equipment',
        children: [
          {
            name: 'Cardio Equipment',
            children: [
              { name: 'Treadmills' },
              { name: 'Exercise Bikes' },
              { name: 'Rowing Machines' },
            ],
          },
          {
            name: 'Strength Training',
            children: [
              { name: 'Dumbbells' },
              { name: 'Barbells' },
              { name: 'Resistance Bands' },
            ],
          },
          {
            name: 'Yoga & Pilates',
            children: [
              { name: 'Yoga Mats' },
              { name: 'Yoga Blocks' },
              { name: 'Pilates Equipment' },
            ],
          },
        ],
      },
      {
        name: 'Outdoor Recreation',
        children: [
          {
            name: 'Camping Gear',
            children: [
              { name: 'Tents' },
              { name: 'Sleeping Bags' },
              { name: 'Camping Stoves' },
            ],
          },
          {
            name: 'Hiking Equipment',
            children: [
              { name: 'Hiking Boots' },
              { name: 'Hiking Backpacks' },
              { name: 'Trekking Poles' },
            ],
          },
          {
            name: 'Fishing Gear',
            children: [
              { name: 'Fishing Rods' },
              { name: 'Fishing Reels' },
              { name: 'Fishing Tackle' },
            ],
          },
        ],
      },
      {
        name: 'Team Sports',
        children: [
          { name: 'Soccer' },
          { name: 'Basketball' },
          { name: 'Tennis' },
          { name: 'Baseball' },
        ],
      },
      {
        name: 'Cycling',
        children: [
          { name: 'Road Bikes' },
          { name: 'Mountain Bikes' },
          { name: 'Cycling Accessories' },
        ],
      },
      {
        name: 'Water Sports',
        children: [
          { name: 'Swimming Gear' },
          { name: 'Surfing Equipment' },
          { name: 'Kayaking' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Automotive & Motorcycles
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'Automotive & Motorcycles',
    children: [
      {
        name: 'Car Parts & Accessories',
        children: [
          {
            name: 'Engine Parts',
            children: [
              { name: 'Air Filters' },
              { name: 'Oil Filters' },
              { name: 'Spark Plugs' },
            ],
          },
          {
            name: 'Brake Parts',
            children: [
              { name: 'Brake Pads' },
              { name: 'Brake Rotors' },
              { name: 'Brake Calipers' },
            ],
          },
          {
            name: 'Suspension',
            children: [
              { name: 'Shock Absorbers' },
              { name: 'Springs' },
              { name: 'Control Arms' },
            ],
          },
        ],
      },
      {
        name: 'Car Electronics',
        children: [
          { name: 'GPS Navigation' },
          { name: 'Car Audio Systems' },
          { name: 'Dash Cameras' },
          { name: 'LED Car Lights' },
        ],
      },
      {
        name: 'Car Care',
        children: [
          { name: 'Car Wash Products' },
          { name: 'Interior Cleaning' },
          { name: 'Paint Protection' },
        ],
      },
      {
        name: 'Motorcycle Parts',
        children: [
          { name: 'Motorcycle Helmets' },
          { name: 'Motorcycle Tires' },
          { name: 'Motorcycle Accessories' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Industrial & Scientific
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'Industrial & Scientific',
    children: [
      {
        name: 'Industrial Equipment',
        children: [
          { name: 'CNC Machines' },
          { name: 'Packaging Machines' },
          { name: 'Printing Machines' },
        ],
      },
      {
        name: 'Safety Equipment',
        children: [
          { name: 'Hard Hats' },
          { name: 'Safety Goggles' },
          { name: 'Fire Extinguishers' },
        ],
      },
      {
        name: 'Lab Equipment',
        children: [
          { name: 'Microscopes' },
          { name: 'Lab Glassware' },
          { name: 'Testing Equipment' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. Toys & Hobbies
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'Toys & Hobbies',
    children: [
      {
        name: 'Toys',
        children: [
          { name: 'Educational Toys' },
          { name: 'Remote Control Toys' },
          { name: 'Dolls & Action Figures' },
          { name: 'Building Blocks' },
        ],
      },
      {
        name: 'Hobby Supplies',
        children: [
          { name: 'Model Kits' },
          { name: 'Art Supplies' },
          { name: 'Musical Instruments' },
        ],
      },
      {
        name: 'Games',
        children: [
          { name: 'Board Games' },
          { name: 'Card Games' },
          { name: 'Video Games' },
          { name: 'Puzzles' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. Health & Medical
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'Health & Medical',
    children: [
      {
        name: 'Medical Devices',
        children: [
          { name: 'Blood Pressure Monitors' },
          { name: 'Thermometers' },
          { name: 'Pulse Oximeters' },
        ],
      },
      {
        name: 'Health Supplements',
        children: [
          { name: 'Vitamins' },
          { name: 'Protein Powders' },
          { name: 'Herbal Supplements' },
        ],
      },
      {
        name: 'Personal Health',
        children: [
          { name: 'Massage Equipment' },
          { name: 'Dental Care' },
          { name: 'Vision Care' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 10. Food & Beverages
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'Food & Beverages',
    children: [
      {
        name: 'Packaged Food',
        children: [
          { name: 'Snacks' },
          { name: 'Canned Food' },
          { name: 'Dried Food' },
          { name: 'Condiments' },
        ],
      },
      {
        name: 'Beverages',
        children: [
          { name: 'Tea' },
          { name: 'Coffee' },
          { name: 'Juices' },
          { name: 'Energy Drinks' },
        ],
      },
      {
        name: 'Fresh Food',
        children: [
          { name: 'Fruits' },
          { name: 'Vegetables' },
          { name: 'Meat' },
          { name: 'Seafood' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 11. Office & School Supplies
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'Office & School Supplies',
    children: [
      {
        name: 'Stationery',
        children: [
          { name: 'Pens & Pencils' },
          { name: 'Notebooks' },
          { name: 'Paper Products' },
          { name: 'Envelopes' },
        ],
      },
      {
        name: 'Office Equipment',
        children: [
          { name: 'Printers' },
          { name: 'Scanners' },
          { name: 'Shredders' },
          { name: 'Laminators' },
        ],
      },
      {
        name: 'School Supplies',
        children: [
          { name: 'School Backpacks' },
          { name: 'Pencil Cases' },
          { name: 'Art Supplies for School' },
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // 12. Baby & Kids
  // ─────────────────────────────────────────────────────────────────────────────
  {
    name: 'Baby & Kids',
    children: [
      {
        name: 'Baby Clothing',
        children: [
          { name: 'Newborn Clothing' },
          { name: 'Infant Clothing' },
          { name: 'Toddler Clothing' },
        ],
      },
      {
        name: 'Baby Gear',
        children: [
          { name: 'Strollers' },
          { name: 'Car Seats' },
          { name: 'Baby Carriers' },
        ],
      },
      {
        name: "Kids' Toys",
        children: [
          { name: 'Learning Toys' },
          { name: 'Outdoor Toys' },
          { name: 'Stuffed Animals' },
        ],
      },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Recursive insertion
// ═══════════════════════════════════════════════════════════════════════════════

async function insertTree(
  nodes: CatNode[],
  parentId: number | null = null,
  depth = 1,
) {
  for (const node of nodes) {
    const cat = await prisma.category.create({
      data: {
        name: node.name,
        parentId,
        status: 'ACTIVE' as Status,
      },
    });
    console.log(`${'  '.repeat(depth)}[L${depth}] ${node.name} (id=${cat.id})`);
    if (node.children) {
      await insertTree(node.children, cat.id, depth + 1);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('Clearing existing category data...');

  // Delete dependent tables first (foreign key order)
  await prisma.productSpecValue.deleteMany();
  await prisma.specTemplate.deleteMany();
  await prisma.categoryKeyword.deleteMany();
  await prisma.productCategoryMap.deleteMany();
  await prisma.categoryConnectTo.deleteMany();
  await prisma.category.deleteMany();

  // Reset auto-increment sequence (PostgreSQL)
  try {
    await prisma.$executeRaw`ALTER SEQUENCE "Category_id_seq" RESTART WITH 1`;
  } catch {
    // Sequence may not exist or may have a different name — safe to ignore
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Create structural root categories that the frontend expects at fixed IDs
  // Frontend constants:
  //   PRODUCT_CATEGORY_ID = 4
  //   BUSINESS_TYPE_CATEGORY_ID = 5
  //   SERVICE_CATEGORY_ID = 6
  //   STORE_MENU_ID = 8,  BUYGROUP_MENU_ID = 9
  //   FACTORIES_MENU_ID = 10,  RFQ_MENU_ID = 11
  // ═══════════════════════════════════════════════════════════════════════════

  const structuralCategories = [
    { id: 1, name: 'Root',           parentId: null, menuId: null,  type: 'root' },
    { id: 2, name: 'Menu',           parentId: null, menuId: null,  type: 'menu' },
    { id: 3, name: 'Navigation',     parentId: null, menuId: null,  type: 'nav' },
    { id: 4, name: 'Products',       parentId: 1,    menuId: null,  type: 'product' },
    { id: 5, name: 'Business Types', parentId: 1,    menuId: null,  type: 'business' },
    { id: 6, name: 'Services',       parentId: 1,    menuId: null,  type: 'service' },
    { id: 7, name: 'Main Menu',      parentId: null, menuId: null,  type: 'menu_root' },
    { id: 8, name: 'Store',          parentId: 7,    menuId: 7,     type: 'menu_item' },
    { id: 9, name: 'Buy Group',      parentId: 7,    menuId: 7,     type: 'menu_item' },
    { id: 10, name: 'Factories',     parentId: 7,    menuId: 7,     type: 'menu_item' },
    { id: 11, name: 'RFQ',           parentId: 7,    menuId: 7,     type: 'menu_item' },
  ];

  console.log('\nCreating structural categories (IDs 1-11)...\n');
  for (const cat of structuralCategories) {
    await prisma.category.create({
      data: {
        id: cat.id,
        name: cat.name,
        parentId: cat.parentId,
        menuId: cat.menuId,
        type: cat.type,
        status: 'ACTIVE' as Status,
      },
    });
    console.log(`  [struct] ${cat.name} (id=${cat.id})`);
  }

  // Advance the sequence past structural IDs
  await prisma.$executeRaw`SELECT setval('"Category_id_seq"', 11, true)`;

  // ═══════════════════════════════════════════════════════════════════════════
  // Insert the 6-level Alibaba category tree under Products (ID 4)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\nCreating 6-level Alibaba-style category tree under Products (id=4)...\n');
  await insertTree(TREE, 4);

  // ═══════════════════════════════════════════════════════════════════════════
  // Seed some Business Types under ID 5
  // ═══════════════════════════════════════════════════════════════════════════

  const businessTypes = [
    'Manufacturer', 'Trading Company', 'Wholesaler', 'Retailer',
    'Distributor', 'Agent', 'Service Provider', 'Freelancer',
  ];
  console.log('\nCreating Business Types under id=5...\n');
  for (const bt of businessTypes) {
    const c = await prisma.category.create({
      data: { name: bt, parentId: 5, status: 'ACTIVE' as Status, type: 'business' },
    });
    console.log(`  [biz] ${bt} (id=${c.id})`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Seed some Service categories under ID 6
  // ═══════════════════════════════════════════════════════════════════════════

  const serviceCategories = [
    'Logistics & Shipping', 'Quality Inspection', 'Custom Manufacturing',
    'Product Design', 'Packaging & Labeling', 'Warehousing',
    'Marketing & Advertising', 'Legal & Compliance',
  ];
  console.log('\nCreating Service Categories under id=6...\n');
  for (const sc of serviceCategories) {
    const c = await prisma.category.create({
      data: { name: sc, parentId: 6, status: 'ACTIVE' as Status, type: 'service' },
    });
    console.log(`  [svc] ${sc} (id=${c.id})`);
  }

  const count = await prisma.category.count();
  console.log(`\nDone! Total categories: ${count}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
