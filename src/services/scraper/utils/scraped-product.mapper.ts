import { ScrapedProduct, ScrapedImage, ScrapedSpecification } from '../interfaces/scraped-product.interface';

/**
 * Data transfer object for creating a product from scraped data
 */
export interface CreateProductFromScrapedDataDto {
    productName: string;
    categoryId?: number;
    productPrice: number;
    offerPrice: number;
    description?: string;
    specification?: string;
    shortDescription?: string;
    brandId?: number;
    placeOfOriginId?: number;
    barcode?: string;
    productType?: 'PHYSICAL' | 'DIGITAL';
    typeOfProduct?: 'NEW' | 'USED' | 'REFURBISHED';
    typeProduct?: string;
    userId: number;
    adminId?: number;
    status?: 'ACTIVE' | 'INACTIVE';
    images?: {
        image?: string;
        imageName?: string;
        variant?: any;
    }[];
    specifications?: {
        label: string;
        specification: string;
    }[];
    tags?: string[];
    metadata?: Record<string, any>;
}

/**
 * Helper class to convert scraped product data to Product model format
 */
export class ScrapedProductMapper {
    /**
     * Convert a ScrapedProduct to CreateProductFromScrapedDataDto
     * 
     * @param scrapedProduct - The scraped product data
     * @param userId - The user ID who is creating the product
     * @param options - Additional options for mapping
     * @returns DTO for creating a product
     */
    static toCreateProductDto(
        scrapedProduct: ScrapedProduct,
        userId: number,
        options?: {
            categoryId?: number;
            brandId?: number;
            placeOfOriginId?: number;
            adminId?: number;
            status?: 'ACTIVE' | 'INACTIVE';
            markupPercentage?: number; // For dropshipping
        }
    ): CreateProductFromScrapedDataDto {
        // Apply markup if specified (for dropshipping)
        const markupMultiplier = options?.markupPercentage 
            ? 1 + (options.markupPercentage / 100) 
            : 1;

        const productPrice = scrapedProduct.productPrice * markupMultiplier;
        const offerPrice = scrapedProduct.offerPrice * markupMultiplier;

        // Map images
        const images = scrapedProduct.images?.map((img: ScrapedImage) => ({
            image: img.url,
            imageName: img.imageName,
            variant: img.variant,
        })) || [];

        // Map specifications
        const specifications = scrapedProduct.specifications?.map((spec: ScrapedSpecification) => ({
            label: spec.label,
            specification: spec.value,
        })) || [];

        // Build specification text
        const specificationText = scrapedProduct.specifications
            ?.map((spec: ScrapedSpecification) => `${spec.label}: ${spec.value}`)
            .join('\n') || scrapedProduct.specification || '';

        return {
            productName: scrapedProduct.productName,
            categoryId: options?.categoryId,
            productPrice: Math.round(productPrice * 100) / 100,
            offerPrice: Math.round(offerPrice * 100) / 100,
            description: scrapedProduct.description,
            specification: specificationText,
            shortDescription: scrapedProduct.shortDescription,
            brandId: options?.brandId,
            placeOfOriginId: options?.placeOfOriginId,
            barcode: scrapedProduct.barcode,
            productType: scrapedProduct.productType || 'PHYSICAL',
            typeOfProduct: scrapedProduct.typeOfProduct || 'NEW',
            userId,
            adminId: options?.adminId,
            status: options?.status || 'INACTIVE', // Default to inactive for review
            images,
            specifications,
            tags: scrapedProduct.tags,
            metadata: {
                ...scrapedProduct.metadata,
                sourceUrl: scrapedProduct.sourceUrl,
                sourcePlatform: scrapedProduct.sourcePlatform,
                originalPrice: scrapedProduct.productPrice,
                originalOfferPrice: scrapedProduct.offerPrice,
                scrapedAt: new Date().toISOString(),
                markupPercentage: options?.markupPercentage,
            },
        };
    }

    /**
     * Create a dropshipping product DTO from scraped data
     * 
     * @param scrapedProduct - The scraped product data
     * @param originalProductId - The ID of the original product
     * @param vendorId - The vendor who is dropshipping
     * @param markupPercentage - The markup percentage
     * @returns DTO for creating a dropship product
     */
    static toDropshipProductDto(
        scrapedProduct: ScrapedProduct,
        originalProductId: number,
        vendorId: number,
        markupPercentage: number,
        options?: {
            categoryId?: number;
            brandId?: number;
            customMarketingContent?: any;
            additionalMarketingImages?: any;
        }
    ): CreateProductFromScrapedDataDto & {
        isDropshipped: boolean;
        originalProductId: number;
        dropshipVendorId: number;
        dropshipMarkup: number;
    } {
        const baseDto = this.toCreateProductDto(scrapedProduct, vendorId, {
            ...options,
            markupPercentage,
            status: 'INACTIVE',
        });

        return {
            ...baseDto,
            isDropshipped: true,
            originalProductId,
            dropshipVendorId: vendorId,
            dropshipMarkup: markupPercentage,
            metadata: {
                ...baseDto.metadata,
                customMarketingContent: options?.customMarketingContent,
                additionalMarketingImages: options?.additionalMarketingImages,
            },
        };
    }

    /**
     * Extract tags from scraped product data
     * 
     * @param scrapedProduct - The scraped product data
     * @returns Array of tag names
     */
    static extractTags(scrapedProduct: ScrapedProduct): string[] {
        const tags: string[] = [];

        // Add brand as tag if available
        if (scrapedProduct.brandName) {
            tags.push(scrapedProduct.brandName);
        }

        // Add product type tags
        if (scrapedProduct.productType) {
            tags.push(scrapedProduct.productType.toLowerCase());
        }

        if (scrapedProduct.typeOfProduct) {
            tags.push(scrapedProduct.typeOfProduct.toLowerCase());
        }

        // Add source platform
        if (scrapedProduct.sourcePlatform) {
            tags.push(scrapedProduct.sourcePlatform.toLowerCase());
        }

        // Add existing tags
        if (scrapedProduct.tags) {
            tags.push(...scrapedProduct.tags);
        }

        // Return unique tags
        return [...new Set(tags)];
    }

    /**
     * Generate a unique SKU from scraped product data
     * 
     * @param scrapedProduct - The scraped product data
     * @param prefix - Optional prefix for the SKU
     * @returns Generated SKU
     */
    static generateSKU(scrapedProduct: ScrapedProduct, prefix: string = 'SKU'): string {
        // Use barcode if available
        if (scrapedProduct.barcode) {
            return `${prefix}_${scrapedProduct.barcode}`;
        }

        // Otherwise generate from timestamp, product name, and random component for uniqueness
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 100000);
        const nameHash = scrapedProduct.productName
            .substring(0, 10)
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '');
        
        return `${prefix}_${nameHash}_${timestamp}_${random}`;
    }
}
