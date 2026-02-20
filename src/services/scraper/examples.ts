/**
 * Usage Examples for Scraper Service
 * 
 * ⚠️ IMPORTANT: This file is for REFERENCE ONLY - DO NOT RUN IT DIRECTLY!
 * 
 * This file contains practical examples of how to use the scraper service
 * in your application. Copy these examples into your actual services.
 * 
 * To test the scraper:
 * 1. Start your NestJS server: npm run start:dev
 * 2. Use the API endpoints:
 *    GET http://localhost:3000/scraper/product?url=https://www.amazon.in/dp/B08N5WRWNW
 * 
 * Or see test-scraper.ts for a runnable test script.
 * 
 * Note: These are example functions. In your actual implementation, 
 * inject PrismaService instead of PrismaClient.
 */

import { ScraperService, ScrapedProductMapper } from './index';

// Type alias for examples - replace with your actual PrismaService
type PrismaClient = any;

// Example 1: Basic Product Scraping
export async function example1_basicScraping(scraperService: ScraperService) {
    const url = 'https://www.amazon.in/dp/B08N5WRWNW';
    
    // Scrape the product
    const scrapedProduct = await scraperService.scrapeProduct(url);
    
    
    return scrapedProduct;
}

// Example 2: Search Results Scraping
export async function example2_searchScraping(scraperService: ScraperService) {
    const searchUrl = 'https://www.amazon.in/s?k=laptop';
    
    // Scrape search results
    const searchResults = await scraperService.scrapeSearch(searchUrl);
    
    
    // Process each product
    searchResults.products.forEach((product, index) => {
    });
    
    return searchResults;
}

// Example 3: Creating a Product from Scraped Data
export async function example3_createProduct(
    scraperService: ScraperService,
    prisma: PrismaClient,
    userId: number,
    categoryId: number
) {
    const url = 'https://www.amazon.in/dp/B08N5WRWNW';
    
    // Scrape the product
    const scrapedProduct = await scraperService.scrapeProduct(url);
    
    // Convert to product DTO
    const productDto = ScrapedProductMapper.toCreateProductDto(
        scrapedProduct,
        userId,
        {
            categoryId,
            status: 'INACTIVE', // Set to inactive for review
        }
    );
    
    // Generate SKU
    const sku = ScrapedProductMapper.generateSKU(scrapedProduct);
    
    // Create product in database
    const product = await prisma.product.create({
        data: {
            productName: productDto.productName,
            skuNo: sku,
            productPrice: productDto.productPrice,
            offerPrice: productDto.offerPrice,
            description: productDto.description,
            shortDescription: productDto.shortDescription,
            specification: productDto.specification,
            categoryId: productDto.categoryId,
            userId: productDto.userId,
            status: productDto.status || 'INACTIVE',
            barcode: productDto.barcode,
            productType: productDto.productType as any,
            typeOfProduct: productDto.typeOfProduct as any,
        },
    });
    
    // Create product images
    if (productDto.images && productDto.images.length > 0) {
        await prisma.productImages.createMany({
            data: productDto.images.map(img => ({
                productId: product.id,
                image: img.image,
                imageName: img.imageName,
                variant: img.variant,
                status: 'ACTIVE' as any,
            })),
        });
    }
    
    // Create product specifications
    if (productDto.specifications && productDto.specifications.length > 0) {
        await prisma.productSpecification.createMany({
            data: productDto.specifications.map(spec => ({
                productId: product.id,
                label: spec.label,
                specification: spec.specification,
                status: 'ACTIVE' as any,
            })),
        });
    }
    
    return product;
}

// Example 4: Dropshipping Product
export async function example4_dropshippingProduct(
    scraperService: ScraperService,
    prisma: PrismaClient,
    originalProductId: number,
    vendorId: number,
    categoryId: number
) {
    const url = 'https://www.amazon.in/dp/B08N5WRWNW';
    
    // Scrape the original product
    const scrapedProduct = await scraperService.scrapeProduct(url);
    
    // Create dropship product with 25% markup
    const dropshipDto = ScrapedProductMapper.toDropshipProductDto(
        scrapedProduct,
        originalProductId,
        vendorId,
        25, // 25% markup
        {
            categoryId,
            customMarketingContent: {
                customDescription: 'Premium quality product with fast shipping!',
                customFeatures: ['Free Shipping', '24/7 Support', '30-day Return'],
            },
        }
    );
    
    // Generate SKU
    const sku = ScrapedProductMapper.generateSKU(scrapedProduct, 'DROPSHIP');
    
    // Create dropship product
    const product = await prisma.product.create({
        data: {
            productName: dropshipDto.productName,
            skuNo: sku,
            productPrice: dropshipDto.productPrice,
            offerPrice: dropshipDto.offerPrice,
            description: dropshipDto.description,
            categoryId: dropshipDto.categoryId,
            userId: dropshipDto.userId,
            status: dropshipDto.status || 'INACTIVE',
            isDropshipped: dropshipDto.isDropshipped,
            originalProductId: dropshipDto.originalProductId,
            dropshipVendorId: dropshipDto.dropshipVendorId,
            dropshipMarkup: dropshipDto.dropshipMarkup,
            customMarketingContent: dropshipDto.metadata?.customMarketingContent,
        },
    });
    
    
    return product;
}

// Example 5: Bulk Import from Search Results
export async function example5_bulkImport(
    scraperService: ScraperService,
    prisma: PrismaClient,
    userId: number,
    categoryId: number
) {
    const searchUrl = 'https://www.amazon.in/s?k=laptop';
    
    // Scrape search results
    const searchResults = await scraperService.scrapeSearch(searchUrl);
    
    const importedProducts = [];
    
    // Import first 5 products (for demo)
    for (let i = 0; i < Math.min(5, searchResults.products.length); i++) {
        const productSummary = searchResults.products[i];
        
        try {
            // Scrape full product details
            const scrapedProduct = await scraperService.scrapeProduct(productSummary.productUrl);
            
            // Convert to DTO
            const productDto = ScrapedProductMapper.toCreateProductDto(
                scrapedProduct,
                userId,
                { categoryId, status: 'INACTIVE' }
            );
            
            // Create product
            const product = await prisma.product.create({
                data: {
                    productName: productDto.productName,
                    skuNo: ScrapedProductMapper.generateSKU(scrapedProduct),
                    productPrice: productDto.productPrice,
                    offerPrice: productDto.offerPrice,
                    description: productDto.description,
                    categoryId: productDto.categoryId,
                    userId: productDto.userId,
                    status: productDto.status || 'INACTIVE',
                },
            });
            
            importedProducts.push(product);
            
            // Add delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
        }
    }
    
    return importedProducts;
}

// Example 6: Check if URL is supported
export async function example6_checkUrl(scraperService: ScraperService) {
    const urls = [
        'https://www.amazon.in/dp/B08N5WRWNW',
        'https://www.taobao.com/product/123',
        'https://www.ebay.com/itm/123', // Not supported
    ];
    
    for (const url of urls) {
        const canScrape = scraperService.canScrape(url);
    }
}

// Example 7: Extract and Create Tags
export async function example7_tagsManagement(
    scraperService: ScraperService,
    prisma: PrismaClient,
    userId: number
) {
    const url = 'https://www.amazon.in/dp/B08N5WRWNW';
    
    // Scrape the product
    const scrapedProduct = await scraperService.scrapeProduct(url);
    
    // Extract tags
    const suggestedTags = ScrapedProductMapper.extractTags(scrapedProduct);
    
    
    // Create/find tags in database
    const tagIds = [];
    for (const tagName of suggestedTags) {
        let tag = await prisma.tags.findFirst({
            where: { tagName: { equals: tagName, mode: 'insensitive' } },
        });
        
        if (!tag) {
            tag = await prisma.tags.create({
                data: {
                    tagName,
                    status: 'ACTIVE',
                    addedBy: userId,
                },
            });
        }
        
        tagIds.push(tag.id);
    }
    
    return tagIds;
}

// Example 8: Price Monitoring
export async function example8_priceMonitoring(
    scraperService: ScraperService,
    prisma: PrismaClient,
    productId: number
) {
    // Get product from database
    const product = await prisma.product.findUnique({
        where: { id: productId },
    });
    
    if (!product || !product.metadata || !(product.metadata as any).sourceUrl) {
        throw new Error('Product does not have source URL');
    }
    
    const sourceUrl = (product.metadata as any).sourceUrl;
    
    // Scrape current price
    const scrapedProduct = await scraperService.scrapeProduct(sourceUrl);
    
    const priceChanged = 
        scrapedProduct.productPrice !== Number(product.productPrice) ||
        scrapedProduct.offerPrice !== Number(product.offerPrice);
    
    if (priceChanged) {
        
        // Update product price
        await prisma.product.update({
            where: { id: productId },
            data: {
                productPrice: scrapedProduct.productPrice,
                offerPrice: scrapedProduct.offerPrice,
                updatedAt: new Date(),
            },
        });
    } else {
    }
    
    return { priceChanged, currentPrice: scrapedProduct.productPrice };
}

/**
 * How to use these examples in your NestJS service:
 * 
 * @Injectable()
 * export class ProductService {
 *   constructor(
 *     private readonly scraperService: ScraperService,
 *     private readonly prisma: PrismaService,
 *   ) {}
 * 
 *   async importProductFromUrl(url: string, userId: number, categoryId: number) {
 *     return example3_createProduct(
 *       this.scraperService,
 *       this.prisma,
 *       userId,
 *       categoryId
 *     );
 *   }
 * }
 */
