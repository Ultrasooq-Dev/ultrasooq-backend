/**
 * Interface for scraped product data that maps to the Product model
 */
export interface ScrapedProduct {
  // Basic product information
  productName: string;
  description?: string;
  shortDescription?: string;
  specification?: string;
  
  // Pricing information
  productPrice: number;
  offerPrice: number;
  
  // Product details
  brandName?: string;
  barcode?: string;
  
  // Images and media
  images?: ScrapedImage[];
  
  // Product metadata
  placeOfOrigin?: string;
  productType?: 'PHYSICAL' | 'DIGITAL';
  typeOfProduct?: 'NEW' | 'USED' | 'REFURBISHED';
  
  // Additional information
  tags?: string[];
  specifications?: ScrapedSpecification[];
  
  // Source information
  sourceUrl: string;
  sourcePlatform: string;
  
  // Stock and availability
  inStock?: boolean;
  stockQuantity?: number;
  
  // Ratings and reviews
  rating?: number;
  reviewCount?: number;
  
  // Additional metadata
  metadata?: Record<string, any>;

  // Mega scraper extensions
  sourceRegion?: string;           // e.g. 'us', 'uk', 'de'
  variants?: ScrapedVariant[];
  seller?: ScrapedSeller;
  shipping?: ScrapedShipping;
  relatedProducts?: string[];      // URLs
  originalLanguage?: string;       // e.g. 'zh-CN', 'en'
  categoryPath?: string;           // source platform category path
}

export interface ScrapedImage {
  url: string;
  imageName?: string;
  variant?: any;
  isPrimary?: boolean;
}

export interface ScrapedSpecification {
  label: string;
  value: string;
}

export interface ScrapedSearchResult {
  products: ScrapedProductSummary[];
  totalResults?: number;
  currentPage?: number;
  totalPages?: number;
  searchQuery?: string;
}

export interface ScrapedProductSummary {
  productName: string;
  productUrl: string;
  productPrice?: number;
  offerPrice?: number;
  image?: string;
  rating?: number;
  reviewCount?: number;
  inStock?: boolean;
  brandName?: string;
}

export interface ScrapedVariant {
  name: string;            // e.g. "Color", "Storage", "Size"
  options: string[];       // e.g. ["Black", "White", "Blue"]
  priceModifier?: number;  // price difference for this variant
}

export interface ScrapedSeller {
  name: string;
  rating?: number;
  totalSales?: number;
  storeName?: string;
  storeUrl?: string;
  location?: string;
  isVerified?: boolean;
  tradeAssurance?: boolean; // Alibaba specific
}

export interface ScrapedShipping {
  freeShipping?: boolean;
  estimatedDays?: number;
  shippingCost?: number;
  shippingFrom?: string;   // country
  methods?: string[];      // e.g. ["Standard", "Express"]
}

// Extended search result with category info
export interface ScrapedCategoryTree {
  id?: string;
  name: string;
  path: string;            // "Electronics > Smartphones > Android"
  childCount?: number;
  productCount?: number;
  children?: ScrapedCategoryTree[];
  url?: string;
}

// Scraping job configuration
export interface ScrapeJobConfig {
  platform: 'amazon' | 'alibaba' | 'aliexpress' | 'taobao';
  region?: string;
  categoryUrl: string;
  categoryPath: string;
  pageStart?: number;
  pageEnd?: number;
  maxProducts?: number;
  priority?: number;
  sessionConfig?: {
    useBrowserbase?: boolean;
    userAgent?: string;
    viewport?: { width: number; height: number };
    proxy?: string;
  };
}

// Anti-blocking configuration
export interface RotationConfig {
  platform: string;
  maxProductsPerSession: number;
  cooldownMs: number;
  requestJitterMs: [number, number]; // [min, max]
  userAgents: string[];
  viewports: Array<{ width: number; height: number }>;
}

// Monitor health report
export interface ScraperHealthReport {
  overall: {
    totalTarget: number;
    totalScraped: number;
    totalTranslated: number;
    totalImported: number;
    percentComplete: number;
    estimatedCompletionDate: string;
  };
  platforms: Record<string, {
    target: number;
    scraped: number;
    translated: number;
    imported: number;
    blocked: boolean;
    currentRate: number;   // products/hour
    queueDepth: number;
  }>;
  queues: Record<string, {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }>;
  errors: {
    last24h: { blocks: number; failures: number; retries: number };
    topErrors: Array<{ message: string; count: number; platform: string }>;
  };
}
