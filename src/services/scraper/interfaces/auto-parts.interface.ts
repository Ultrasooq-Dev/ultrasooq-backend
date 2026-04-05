/**
 * Auto Parts Scraper Interfaces
 * Extends the mega scraper system for OEM spare parts platforms.
 */

// Vehicle identification
export interface Vehicle {
  year?: number;
  make: string;           // e.g. "Honda", "Toyota", "BMW"
  model: string;          // e.g. "Civic", "Camry", "X5"
  submodel?: string;      // e.g. "EX-L", "SE", "xDrive40i"
  engine?: string;        // e.g. "2.0L L4 DOHC 16V", "3.0L I6 Turbo"
  bodyType?: string;      // e.g. "Sedan", "SUV", "Coupe"
  trim?: string;
  driveType?: string;     // e.g. "FWD", "AWD", "RWD"
  transmission?: string;  // e.g. "Automatic", "Manual", "CVT"
}

// OEM Part data
export interface ScrapedAutoPart {
  // Part identification
  partNumber: string;          // OEM part number (primary identifier)
  partNumberAlt?: string[];    // alternative/superseded part numbers
  name: string;                // part name
  nameOriginal?: string;       // name in original language
  description?: string;

  // Pricing
  price?: number;
  currency?: string;
  msrp?: number;              // manufacturer suggested retail price
  discount?: number;          // percentage

  // Categorization
  category: string;           // e.g. "Engine", "Brakes", "Suspension"
  subcategory?: string;       // e.g. "Timing Belt", "Brake Pads"
  group?: string;             // parts group/assembly

  // Vehicle compatibility
  vehicles: Vehicle[];        // all compatible vehicles
  fitmentNotes?: string;      // specific fitment instructions

  // Images and diagrams
  images?: AutoPartImage[];
  diagramId?: string;         // reference to parts diagram
  diagramPosition?: string;   // position marker on diagram (e.g. "A-12", "3")

  // Source
  sourceUrl: string;
  sourcePlatform: string;     // megazip | rockauto | hondaparts | etc.
  brand?: string;             // manufacturer brand (e.g. "Genuine Honda", "Denso")
  isGenuine: boolean;         // OEM genuine vs aftermarket

  // Stock
  inStock?: boolean;
  stockQuantity?: number;
  leadTime?: string;          // e.g. "2-5 business days"

  // Weight/Dimensions (for shipping)
  weight?: string;
  dimensions?: string;

  // Cross-references
  crossReferences?: string[]; // part numbers from other manufacturers
  supersededBy?: string;      // if this part is replaced by a newer one
  interchangeWith?: string[]; // compatible aftermarket alternatives

  // Metadata
  metadata?: Record<string, any>;
}

// Parts diagram/map
export interface PartsDiagram {
  id: string;
  name: string;               // e.g. "Engine Block Assembly", "Front Brake System"
  imageUrl: string;            // diagram image URL
  svgUrl?: string;             // SVG version if available
  vehicle: Vehicle;
  category: string;
  parts: DiagramPart[];        // parts shown in this diagram
  sourceUrl: string;
  sourcePlatform: string;
}

export interface DiagramPart {
  position: string;            // position number/label on diagram
  partNumber: string;
  name: string;
  quantity: number;            // how many needed
  price?: number;
  notes?: string;              // fitment or condition notes
}

// Auto part image
export interface AutoPartImage {
  url: string;
  type: 'product' | 'diagram' | 'fitment' | 'thumbnail';
  alt?: string;
}

// Platform-specific configs
export interface AutoPartsScraperConfig {
  platform: string;
  baseUrl: string;
  vehicleNavigation: 'year-make-model' | 'vin' | 'part-number' | 'category-tree';
  hasDiagrams: boolean;
  hasOemPricing: boolean;
  antiDetection: 'low' | 'medium' | 'high';  // how aggressive anti-bot is
  rateLimit: number;           // requests per minute
}

// All supported auto parts platforms
export const AUTO_PARTS_PLATFORMS: Record<string, AutoPartsScraperConfig> = {
  megazip: {
    platform: 'megazip',
    baseUrl: 'https://www.megazip.net',
    vehicleNavigation: 'year-make-model',
    hasDiagrams: true,
    hasOemPricing: true,
    antiDetection: 'medium',
    rateLimit: 20,
  },
  partsnext: {
    platform: 'partsnext',
    baseUrl: 'https://www.partsnext.com',
    vehicleNavigation: 'year-make-model',
    hasDiagrams: true,
    hasOemPricing: true,
    antiDetection: 'medium',
    rateLimit: 20,
  },
  realoem: {
    platform: 'realoem',
    baseUrl: 'https://www.realoem.com',
    vehicleNavigation: 'year-make-model',
    hasDiagrams: true,
    hasOemPricing: false,
    antiDetection: 'high',
    rateLimit: 10,
  },
  partsouq: {
    platform: 'partsouq',
    baseUrl: 'https://partsouq.com',
    vehicleNavigation: 'year-make-model',
    hasDiagrams: true,
    hasOemPricing: true,
    antiDetection: 'medium',
    rateLimit: 20,
  },
  catcar: {
    platform: 'catcar',
    baseUrl: 'https://www.catcar.info/en',
    vehicleNavigation: 'category-tree',
    hasDiagrams: true,
    hasOemPricing: false,
    antiDetection: 'low',
    rateLimit: 30,
  },
  yoshiparts: {
    platform: 'yoshiparts',
    baseUrl: 'https://yoshiparts.com',
    vehicleNavigation: 'year-make-model',
    hasDiagrams: true,
    hasOemPricing: true,
    antiDetection: 'medium',
    rateLimit: 20,
  },
  rockauto: {
    platform: 'rockauto',
    baseUrl: 'https://www.rockauto.com/en/catalog',
    vehicleNavigation: 'year-make-model',
    hasDiagrams: false,
    hasOemPricing: true,
    antiDetection: 'medium',
    rateLimit: 15,
  },
  hondaparts: {
    platform: 'hondaparts',
    baseUrl: 'https://www.hondapartsnow.com',
    vehicleNavigation: 'year-make-model',
    hasDiagrams: true,
    hasOemPricing: true,
    antiDetection: 'low',
    rateLimit: 30,
  },
  toyotaparts: {
    platform: 'toyotaparts',
    baseUrl: 'https://toyotaparts.ourismantoyotaofrichmond.com',
    vehicleNavigation: 'year-make-model',
    hasDiagrams: true,
    hasOemPricing: true,
    antiDetection: 'low',
    rateLimit: 30,
  },
};

// Vehicle makes to scrape
export const TARGET_MAKES = [
  // Japanese
  'Honda', 'Toyota', 'Nissan', 'Mazda', 'Subaru', 'Mitsubishi', 'Suzuki', 'Lexus', 'Acura', 'Infiniti',
  // German
  'BMW', 'Mercedes-Benz', 'Audi', 'Volkswagen', 'Porsche',
  // Korean
  'Hyundai', 'Kia', 'Genesis',
  // American
  'Ford', 'Chevrolet', 'GMC', 'Dodge', 'Jeep', 'Ram', 'Tesla', 'Cadillac', 'Lincoln',
  // European
  'Volvo', 'Land Rover', 'Jaguar', 'Fiat', 'Alfa Romeo', 'Peugeot', 'Renault',
];

// Year range to scrape
export const YEAR_RANGE = { from: 2010, to: 2026 };
