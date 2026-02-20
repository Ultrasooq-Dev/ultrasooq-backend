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
