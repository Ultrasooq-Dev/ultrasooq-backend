import { Controller, Get, Query, Post, Body, HttpException, HttpStatus, Request, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ScraperService } from './scraper.service';
import { ScrapedProduct, ScrapedSearchResult } from './interfaces/scraped-product.interface';
import { ScrapeListDto } from './dto/scrape-list.dto';
import { ListProductDto } from './dto/list-product.dto';
import { ProductService } from 'src/product/product.service';
import { ScrapedProductMapper } from './utils/scraped-product.mapper';
import { AuthGuard } from 'src/guards/AuthGuard';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Controller for web scraping operations
 * This is a sample controller - integrate it into your existing product/admin controllers
 */
@ApiTags('scraper')
@ApiBearerAuth('JWT-auth')
@Controller('scraper')
export class ScraperController {
    private readonly logger = new Logger(ScraperController.name);

    constructor(
        private readonly scraperService: ScraperService,
        private readonly productService: ProductService,
        private readonly prisma: PrismaService,
    ) {}

    /**
     * Check if a URL can be scraped
     */
    @Get('check')
    @ApiOperation({ summary: 'Check if a URL can be scraped' })
    @ApiQuery({ name: 'url', description: 'The URL to check' })
    @ApiResponse({ status: 200, description: 'Returns whether the URL can be scraped' })
    async checkUrl(@Query('url') url: string): Promise<{ canScrape: boolean; provider?: string }> {
        if (!url) {
            throw new HttpException('URL is required', HttpStatus.BAD_REQUEST);
        }

        const canScrape = this.scraperService.canScrape(url);
        
        return {
            canScrape,
            provider: canScrape ? 'Available' : undefined,
        };
    }

    /**
     * Get list of registered scraper providers
     */
    @Get('providers')
    @ApiOperation({ summary: 'Get list of registered scraper providers' })
    @ApiResponse({ status: 200, description: 'Returns list of provider names' })
    async getProviders(): Promise<{ providers: string[] }> {
        const providers = this.scraperService.getRegisteredProviders();
        return { providers };
    }

    /**
     * Scrape product details from a URL
     */
    @Get('product')
    @ApiOperation({ summary: 'Scrape product details from a URL' })
    @ApiQuery({ name: 'url', description: 'The product URL to scrape' })
    @ApiResponse({ status: 200, description: 'Returns scraped product data', type: Object })
    @ApiResponse({ status: 400, description: 'Invalid URL or scraping failed' })
    async scrapeProduct(@Query('url') url: string): Promise<ScrapedProduct> {
        if (!url) {
            throw new HttpException('URL is required', HttpStatus.BAD_REQUEST);
        }

        try {
            const product = await this.scraperService.scrapeProduct(url);
            return product;
        } catch (error) {
            throw new HttpException(
                `Failed to scrape product: ${error.message}`,
                HttpStatus.BAD_REQUEST
            );
        }
    }

    /**
     * Scrape search results from a URL
     */
    @Get('search')
    @ApiOperation({ summary: 'Scrape search results from a URL' })
    @ApiQuery({ name: 'url', description: 'The search URL to scrape' })
    @ApiResponse({ status: 200, description: 'Returns scraped search results', type: Object })
    @ApiResponse({ status: 400, description: 'Invalid URL or scraping failed' })
    async scrapeSearch(@Query('url') url: string): Promise<ScrapedSearchResult> {
        if (!url) {
            throw new HttpException('URL is required', HttpStatus.BAD_REQUEST);
        }

        try {
            const results = await this.scraperService.scrapeSearch(url);
            return results;
        } catch (error) {
            throw new HttpException(
                `Failed to scrape search results: ${error.message}`,
                HttpStatus.BAD_REQUEST
            );
        }
    }

    /**
     * Scrape and preview product data (for testing)
     */
    @Post('preview')
    @ApiOperation({ summary: 'Scrape product and preview how it would be saved' })
    @ApiResponse({ status: 200, description: 'Returns preview of product data' })
    async previewProduct(
        @Body() body: { url: string; userId: number; categoryId?: number; brandId?: number }
    ): Promise<any> {
        const { url, userId, categoryId, brandId } = body;

        if (!url || !userId) {
            throw new HttpException('URL and userId are required', HttpStatus.BAD_REQUEST);
        }

        try {
            const scrapedProduct = await this.scraperService.scrapeProduct(url);
            
            // Import mapper dynamically to avoid circular dependency
            const { ScrapedProductMapper } = await import('./utils/scraped-product.mapper');
            
            const productDto = ScrapedProductMapper.toCreateProductDto(
                scrapedProduct,
                userId,
                {
                    categoryId,
                    brandId,
                    status: 'INACTIVE',
                }
            );

            const sku = ScrapedProductMapper.generateSKU(scrapedProduct);
            const tags = ScrapedProductMapper.extractTags(scrapedProduct);

            return {
                scrapedData: scrapedProduct,
                productDto: {
                    ...productDto,
                    skuNo: sku,
                },
                suggestedTags: tags,
                preview: {
                    productName: productDto.productName,
                    prices: {
                        productPrice: productDto.productPrice,
                        offerPrice: productDto.offerPrice,
                    },
                    imagesCount: productDto.images?.length || 0,
                    specificationsCount: productDto.specifications?.length || 0,
                    status: productDto.status,
                },
            };
        } catch (error) {
            throw new HttpException(
                `Failed to preview product: ${error.message}`,
                HttpStatus.BAD_REQUEST
            );
        }
    }

    /**
     * Scrape product list from a search URL
     * Returns list of products with title and image
     */
    @Post('list')
    @ApiOperation({ summary: 'Scrape product list from a search URL' })
    @ApiResponse({ 
        status: 200, 
        description: 'Returns list of products with title and image',
        schema: {
            type: 'object',
            properties: {
                products: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            productName: { type: 'string' },
                            image: { type: 'string' },
                            productUrl: { type: 'string' },
                            productPrice: { type: 'number' },
                            offerPrice: { type: 'number' },
                        }
                    }
                },
                totalResults: { type: 'number' }
            }
        }
    })
    @ApiResponse({ status: 400, description: 'Invalid URL or scraping failed' })
    async scrapeList(@Body() dto: ScrapeListDto): Promise<any> {
        try {
            const searchResults = await this.scraperService.scrapeSearch(dto.url);
            
            // Map to simplified response with title and image
            const products = searchResults.products.map(product => ({
                productName: product.productName,
                image: product.image,
                productUrl: product.productUrl,
                productPrice: product.productPrice,
                offerPrice: product.offerPrice,
                rating: product.rating,
                reviewCount: product.reviewCount,
                inStock: product.inStock,
                brandName: product.brandName,
            }));

            return {
                products,
                totalResults: searchResults.totalResults || products.length,
                currentPage: searchResults.currentPage,
                totalPages: searchResults.totalPages,
                searchQuery: searchResults.searchQuery,
            };
        } catch (error) {
            throw new HttpException(
                `Failed to scrape product list: ${error.message}`,
                HttpStatus.BAD_REQUEST
            );
        }
    }

    /**
     * Scrape product details and optionally auto-list it to ExistingProduct
     */
    @Post('list-product')
    @UseGuards(AuthGuard)
    @ApiOperation({ summary: 'Scrape product and optionally auto-list it to the ExistingProduct table' })
    @ApiResponse({ 
        status: 200, 
        description: 'Returns scraped product data and optionally the created product',
        schema: {
            type: 'object',
            properties: {
                scrapedData: { type: 'object' },
                autoListed: { type: 'boolean' },
                product: { type: 'object' },
                message: { type: 'string' }
            }
        }
    })
    @ApiResponse({ status: 400, description: 'Invalid URL or scraping failed' })
    @ApiResponse({ status: 401, description: 'Unauthorized - user authentication required for auto-listing' })
    async listProduct(@Body() dto: ListProductDto, @Request() req: any): Promise<any> {
        try {
            // Check if it's a Taobao/Tmall URL - route to local scraper service
            const taobaoPattern = /(taobao|tmall)\.com/i;
            let scrapedProduct: ScrapedProduct;
            
            if (taobaoPattern.test(dto.url)) {
                // Use local scraper service for Taobao/Tmall
                const localScraperUrl = process.env.LOCAL_SCRAPER_URL || 'http://localhost:4000';
                const axios = (await import('axios')).default;
                
                this.logger.log(`Using local scraper service for Taobao/Tmall URL: ${dto.url}`);
                
                // First check if local scraper service is reachable
                try {
                    const healthCheck = await axios.get(
                        `${localScraperUrl}/api/scraper/health`,
                        { timeout: 5000 }
                    );
                    if (!healthCheck.data || healthCheck.data.status !== 'ok') {
                        throw new HttpException(
                            'Local scraper service is not responding correctly. Please ensure it is running on port 4000.',
                            HttpStatus.SERVICE_UNAVAILABLE
                        );
                    }
                } catch (healthError: any) {
                    // If it's already an HttpException, re-throw it
                    if (healthError instanceof HttpException) {
                        throw healthError;
                    }
                    if (healthError.code === 'ECONNREFUSED' || healthError.code === 'ETIMEDOUT') {
                        throw new HttpException(
                            `Cannot connect to local scraper service at ${localScraperUrl}. Please ensure it is running on port 4000.`,
                            HttpStatus.SERVICE_UNAVAILABLE
                        );
                    }
                    // Other errors - log and continue anyway, might be network issue
                    this.logger.warn(`Health check failed but continuing: ${healthError.message}`);
                }
                
                const response = await axios.post(
                    `${localScraperUrl}/api/scraper/scrape-automatic`,
                    { 
                        url: dto.url,
                        timeout: 120000 // Pass timeout to local scraper service (2 minutes)
                    },
                    { 
                        timeout: 130000, // Axios timeout slightly longer than service timeout
                        headers: {
                            'Content-Type': 'application/json'
                        }
                    }
                );

                if (!response.data || !response.data.success) {
                    throw new HttpException(
                        response.data?.error || 'Scraping failed',
                        HttpStatus.INTERNAL_SERVER_ERROR
                    );
                }

                // Transform local scraper response to ScrapedProduct format
                const extractedData = response.data.data;

                if (!extractedData) {
                    throw new HttpException('No data extracted from page', HttpStatus.BAD_REQUEST);
                }

                // Log the raw data for debugging
                this.logger.log(`Raw extracted data type: ${extractedData.type}`);
                this.logger.log(`Raw extracted data keys: ${Object.keys(extractedData).join(', ')}`);

                // Handle product page type
                if (extractedData.type === 'product') {
                    // Get product data - try multiple paths
                    let product = extractedData.product;
                    
                    // If product is nested, extract it; otherwise use extractedData directly
                    if (!product && extractedData.type === 'product') {
                        // Data might be at root level
                        product = extractedData;
                    }
                    
                    // Log product data structure for debugging
                    if (product) {
                        this.logger.log(`Product keys: ${Object.keys(product).join(', ')}`);
                        this.logger.log(`Product title: ${product.title || product.productName || product.name || 'NOT FOUND'}`);
                        this.logger.log(`Product price (product.price): ${product.price || 'NOT FOUND'}`);
                        this.logger.log(`Product price type: ${typeof product.price}`);
                        this.logger.log(`ExtractedData price (extractedData.price): ${extractedData.price || 'NOT FOUND'}`);
                        this.logger.log(`Full extractedData keys: ${Object.keys(extractedData).join(', ')}`);
                    } else {
                        this.logger.warn('Product object is null or undefined');
                        this.logger.log(`ExtractedData keys: ${Object.keys(extractedData).join(', ')}`);
                    }
                    
                    // Handle images - can be array of strings or array of objects
                    let images: any[] = [];
                    if (product?.images) {
                        if (Array.isArray(product.images)) {
                            images = product.images.map((img: any, index: number) => {
                                const imgUrl = typeof img === 'string' ? img : img.url || img.src || '';
                                if (imgUrl) {
                                    return {
                                        url: imgUrl.startsWith('http') ? imgUrl : `https:${imgUrl}`,
                                        isPrimary: index === 0
                                    };
                                }
                                return null;
                            }).filter(img => img !== null);
                        } else if (typeof product.images === 'string') {
                            images = [{ url: product.images, isPrimary: true }];
                        }
                    } else if (product?.image) {
                        const imgUrl = typeof product.image === 'string' ? product.image : product.image.url || product.image.src || '';
                        if (imgUrl) {
                            images = [{ url: imgUrl.startsWith('http') ? imgUrl : `https:${imgUrl}`, isPrimary: true }];
                        }
                    }
                    
                    // Calculate prices - handle Yuan to Rupee conversion if needed
                    // Check multiple paths for price
                    let basePrice = 0;
                    
                    // Helper function to extract price from various formats
                    const extractPriceValue = (priceValue: any): number => {
                        if (!priceValue) return 0;
                        
                        // If it's a number and positive
                        if (typeof priceValue === 'number' && priceValue > 0) {
                            return priceValue;
                        }
                        
                        // If it's a string, try to extract number
                        if (typeof priceValue === 'string' && priceValue.trim()) {
                            // Remove common currency symbols and extract number
                            const cleaned = priceValue.replace(/[¥¥$£€,\s]/g, '');
                            const priceMatch = cleaned.match(/[\d.]+/);
                            if (priceMatch) {
                                const parsed = parseFloat(priceMatch[0]);
                                if (!isNaN(parsed) && parsed > 0) {
                                    return parsed;
                                }
                            }
                        }
                        
                        return 0;
                    };
                    
                    // Try multiple paths in order of preference
                    basePrice = extractPriceValue(product?.price) ||
                               extractPriceValue(extractedData.price) ||
                               extractPriceValue(product?.productPrice) ||
                               extractPriceValue(product?.offerPrice) ||
                               extractPriceValue(extractedData.productPrice) ||
                               extractPriceValue(extractedData.offerPrice) ||
                               0;
                    
                    // Log price extraction for debugging
                    this.logger.log(`Price extraction - product?.price: ${JSON.stringify(product?.price)}`);
                    this.logger.log(`Price extraction - extractedData.price: ${JSON.stringify(extractedData.price)}`);
                    this.logger.log(`Price extraction - basePrice extracted: ${basePrice}`);
                    
                    // Convert Yuan (CNY) to Rupee (INR) if price seems to be in Yuan (typically < 10000 for most products)
                    // 1 CNY ≈ 11.5 INR (approximate)
                    let priceInRupee = basePrice;
                    if (basePrice > 0 && basePrice < 100000) {
                        // Likely in Yuan, convert to Rupee (most Taobao prices are in Yuan)
                        priceInRupee = Math.round(basePrice * 11.5 * 100) / 100; // Round to 2 decimal places
                        this.logger.log(`Price conversion - ${basePrice} CNY → ₹${priceInRupee} INR`);
                    } else if (basePrice === 0) {
                        this.logger.warn(`⚠️ Price is 0 - price might not have been extracted correctly from the page`);
                        this.logger.warn(`Check if price selectors in extension are working for this Taobao page format`);
                    } else {
                        // Price is already high, assume it's already in Rupee or different currency
                        priceInRupee = basePrice;
                        this.logger.log(`Price appears to already be in final currency: ₹${priceInRupee}`);
                    }
                    
                    // Extract product name
                    const productName = product?.title || product?.productName || product?.name || 
                                     extractedData.title || extractedData.productName || 'Taobao Product';
                    
                    // Extract description - check multiple paths
                    let description = product?.description || product?.desc || 
                                     extractedData.description || extractedData.desc || '';
                    
                    // Remove empty strings
                    if (description === '' || !description || description.trim() === '') {
                        description = '';
                    }
                    
                    // Extract brand - check multiple paths
                    let brandName = product?.brand || extractedData.brand || '';
                    if (brandName === '' || !brandName || brandName.trim() === '') {
                        brandName = '';
                    }
                    
                    // Extract specifications - handle array of objects
                    let specifications: any[] = [];
                    if (product?.specifications && Array.isArray(product.specifications)) {
                        specifications = product.specifications;
                    } else if (extractedData.specifications && Array.isArray(extractedData.specifications)) {
                        specifications = extractedData.specifications;
                    } else if (product?.specs && Array.isArray(product.specs)) {
                        specifications = product.specs;
                    }
                    
                    // Log what we found
                    this.logger.log(`Extracted - Description: ${description ? 'YES (' + description.length + ' chars)' : 'NO'}`);
                    this.logger.log(`Extracted - Brand: ${brandName || 'NO'}`);
                    this.logger.log(`Extracted - Specifications: ${specifications.length} items`);
                    
                    // Format specifications for ScrapedSpecification interface
                    const formattedSpecs = specifications.map((spec: any) => {
                        if (typeof spec === 'object' && spec.label && spec.value) {
                            return {
                                label: spec.label,
                                value: spec.value
                            };
                        } else if (typeof spec === 'string') {
                            // Try to parse "Label: Value" format
                            const match = spec.match(/^([^:：]+)[:：]\s*(.+)$/);
                            if (match) {
                                return {
                                    label: match[1].trim(),
                                    value: match[2].trim()
                                };
                            }
                        }
                        return null;
                    }).filter(spec => spec !== null && spec.label && spec.value);
                    
                    // Create specification text from formatted specs
                    const specificationText = formattedSpecs.length > 0 
                        ? formattedSpecs.map(spec => `${spec.label}: ${spec.value}`).join('\n')
                        : '';
                    
                    // If description is empty, use specification text as description
                    if ((!description || description.trim() === '') && specificationText) {
                        description = specificationText;
                    }
                    
                    // Create short description from first part of description
                    const shortDescription = (description && description.trim()) 
                        ? description.substring(0, 200).trim() 
                        : '';
                    
                    // Log final values
                    this.logger.log(`Final - Description: ${description ? 'YES (' + description.length + ' chars)' : 'NO'}`);
                    this.logger.log(`Final - Short Description: ${shortDescription ? 'YES (' + shortDescription.length + ' chars)' : 'NO'}`);
                    this.logger.log(`Final - Specification: ${specificationText ? 'YES (' + specificationText.length + ' chars)' : 'NO'}`);
                    this.logger.log(`Final - Brand: ${brandName || 'NO'}`);
                    
                    scrapedProduct = {
                        productName: productName,
                        description: description,
                        shortDescription: shortDescription,
                        specification: specificationText,
                        brandName: brandName,
                        productPrice: priceInRupee > 0 ? priceInRupee * 1.2 : 0, // Add 20% markup
                        offerPrice: priceInRupee,
                        images: images,
                        rating: typeof product?.rating === 'number' ? product.rating : 
                               typeof product?.rating === 'string' ? parseFloat(product.rating) || 0 : 0,
                        reviewCount: typeof product?.reviewCount === 'number' ? product.reviewCount :
                                    typeof product?.reviews === 'number' ? product.reviews : 0,
                        inStock: product?.inStock !== false && product?.inStock !== undefined ? product.inStock : true,
                        sourceUrl: dto.url,
                        sourcePlatform: 'Taobao.com',
                        specifications: formattedSpecs,
                    };
                    
                    this.logger.log(`Transformed product: ${scrapedProduct.productName}, Price: ₹${scrapedProduct.offerPrice}`);
                } else {
                    throw new HttpException(
                        `Expected product page but got ${extractedData.type} page. Please use a product URL.`,
                        HttpStatus.BAD_REQUEST
                    );
                }
            } else {
                // Use regular scraper service for other platforms
                scrapedProduct = await this.scraperService.scrapeProduct(dto.url);
            }
            
            const response: any = {
                scrapedData: scrapedProduct,
                autoListed: false,
            };

            // If autolist is true, create the product in ExistingProduct table
            if (dto.autolist) {
                // Check if user is authenticated (AuthGuard should have populated req.user)
                if (!req?.user?.id) {
                    throw new HttpException(
                        'User authentication required for auto-listing products',
                        HttpStatus.UNAUTHORIZED
                    );
                }

                const userId = req.user.id;

                // Use injected prisma service
                const prisma = this.prisma;

                try {
                    // Get user details to determine user type
                    const userDetail = await prisma.user.findUnique({
                        where: { id: userId },
                        select: { userType: true },
                    });

                    const userType = userDetail?.userType || 'ADMIN';

                    // Auto-create/find brand if brandName is available from scraping
                    // Only use provided brandId if it's a valid number (not null/undefined/0)
                    let brandId = (dto.brandId && typeof dto.brandId === 'number' && dto.brandId > 0) ? dto.brandId : null;
                    let brandCreated = false;
                    
                    // If no valid brandId provided, try to create/find brand from scraped brandName
                    if (!brandId && scrapedProduct.brandName && scrapedProduct.brandName.trim() !== '') {
                        try {
                            // Import brand service
                            const { BrandService } = await import('../../brand/brand.service');
                            const brandService = new BrandService(this.prisma);
                            
                            const brand = await brandService.findOrCreateByName(
                                scrapedProduct.brandName,
                                userId,
                                userType
                            );
                            brandId = brand.id;
                            brandCreated = true;
                            this.logger.log(`✓ Auto-created/found brand: ${brand.brandName} (ID: ${brandId})`);
                        } catch (brandError: any) {
                            this.logger.warn(`⚠️ Failed to create/find brand "${scrapedProduct.brandName}": ${brandError.message}`);
                            // Continue without brand if creation fails
                            brandId = null;
                        }
                    } else if (brandId) {
                        this.logger.log(`✓ Using provided brandId: ${brandId}`);
                    } else if (!scrapedProduct.brandName || scrapedProduct.brandName.trim() === '') {
                        this.logger.warn(`⚠️ No brandName found in scraped product, product will be created without brand`);
                    }

                    // Generate SKU with retry logic for duplicate SKU errors
                    let sku = ScrapedProductMapper.generateSKU(scrapedProduct);
                    let retryCount = 0;
                    const maxRetries = 5;
                    let createdProduct;

                    while (retryCount < maxRetries) {
                        try {
                            // Build categoryLocation path for the selected category
                            let categoryLocation: string | null = null;
                            try {
                                // Build path from parent chain: root -> ... -> leaf
                                const pathIds: number[] = [];
                                let currentId: number | null = dto.categoryId;
                                const visitedIds = new Set<number>(); // Prevent infinite loops

                                while (currentId && !visitedIds.has(currentId)) {
                                    visitedIds.add(currentId);
                                    const category = await prisma.category.findUnique({
                                        where: { id: currentId },
                                        select: {
                                            id: true,
                                            parentId: true,
                                        },
                                    });

                                    if (category) {
                                        pathIds.unshift(category.id);
                                        // Stop if no parent or parent is self (root category)
                                        if (!category.parentId || category.parentId === category.id) {
                                            break;
                                        }
                                        currentId = category.parentId;
                                    } else {
                                        break;
                                    }
                                }

                                if (pathIds.length) {
                                    categoryLocation = pathIds.join(',');
                                }
                            } catch (catError) {
                                this.logger.warn(
                                    `⚠️ Failed to build categoryLocation for categoryId=${dto.categoryId}: ${catError.message}`,
                                );
                                categoryLocation = null;
                            }

                            // Create the product in ExistingProduct table
                            createdProduct = await prisma.existingProduct.create({
                                data: {
                                    productName: scrapedProduct.productName,
                                    productType: dto.productType || 'P', // Regular product
                                    categoryId: dto.categoryId,
                                    categoryLocation: categoryLocation,
                                    brandId: brandId || null, // Use auto-found/created brandId, or null if not available
                                    placeOfOriginId: dto.placeOfOriginId,
                                    skuNo: sku,
                                    productPrice: scrapedProduct.productPrice || 0,
                                    offerPrice: scrapedProduct.offerPrice || 0,
                                    shortDescription: scrapedProduct.shortDescription || null,
                                    description: scrapedProduct.description || null,
                                    specification: scrapedProduct.specification || null,
                                    status: 'INACTIVE', // Set to inactive for review
                                    userId: userId,
                                    adminId: userId,
                                },
                            });
                            break; // Success, exit retry loop
                        } catch (createError: any) {
                            // Check if it's a unique constraint error on skuNo
                            if (createError.code === 'P2002' && createError.meta?.target?.includes('skuNo')) {
                                retryCount++;
                                if (retryCount >= maxRetries) {
                                    throw new HttpException(
                                        'Failed to generate unique SKU after multiple attempts',
                                        HttpStatus.INTERNAL_SERVER_ERROR
                                    );
                                }
                                // Generate a new SKU with additional random component
                                const additionalRandom = Math.floor(Math.random() * 1000000);
                                sku = `${ScrapedProductMapper.generateSKU(scrapedProduct)}_${additionalRandom}`;
                            } else {
                                // Re-throw if it's a different error
                                throw createError;
                            }
                        }
                    }

                    // Add images if available
                    if (scrapedProduct.images && scrapedProduct.images.length > 0) {
                        for (const img of scrapedProduct.images) {
                            // Validate image URL before saving
                            if (img.url && 
                                img.url.startsWith('http') && 
                                img.url.length > 10 &&
                                !img.url.includes('360') &&
                                !img.url.includes('spin')) {
                                await prisma.existingProductImages.create({
                                    data: {
                                        existingProductId: createdProduct.id,
                                        imageName: img.imageName || img.url.split('/').pop() || 'product-image',
                                        image: img.url,
                                    },
                                });
                            }
                        }
                    }

                    // Add tags if available
                    const tags = ScrapedProductMapper.extractTags(scrapedProduct);
                    if (tags && tags.length > 0 && dto.tagIds && dto.tagIds.length > 0) {
                        for (const tagId of dto.tagIds) {
                            await prisma.existingProductTags.create({
                                data: {
                                    existingProductId: createdProduct.id,
                                    tagId: tagId,
                                },
                            });
                        }
                    }

                    response.autoListed = true;
                    response.product = createdProduct;
                    if (brandId && brandCreated) {
                        response.message = `Product scraped and listed successfully. Brand "${scrapedProduct.brandName}" added to brand list (ID: ${brandId})`;
                    } else if (brandId) {
                        response.message = `Product scraped and listed successfully with existing brand (ID: ${brandId})`;
                    } else if (scrapedProduct.brandName && scrapedProduct.brandName.trim() !== '') {
                        response.message = `Product scraped and listed successfully. Note: Brand "${scrapedProduct.brandName}" could not be created/linked.`;
                        this.logger.warn(`⚠️ Product created without brand despite brandName being available: "${scrapedProduct.brandName}"`);
                    } else {
                        response.message = 'Product scraped and listed successfully to ExistingProduct (no brand information available)';
                        this.logger.warn(`⚠️ Product created without brand - no brandName found in scraped data`);
                    }
                } finally {
                    // PrismaService manages its own connection lifecycle
                }
            } else {
                response.message = 'Product scraped successfully (not auto-listed)';
                response.preview = {
                    productName: scrapedProduct.productName,
                    prices: {
                        productPrice: scrapedProduct.productPrice,
                        offerPrice: scrapedProduct.offerPrice,
                    },
                    imagesCount: scrapedProduct.images?.length || 0,
                    hasDescription: !!scrapedProduct.description,
                    hasSpecification: !!scrapedProduct.specification,
                };
            }

            return response;
        } catch (error) {
            // Handle axios timeout errors
            if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
                throw new HttpException(
                    `Request timed out after 2 minutes. This usually means:\n` +
                    `1. The local scraper service is not running (check port 4000)\n` +
                    `2. The extension is not installed or not working\n` +
                    `3. The browser took too long to extract data\n\n` +
                    `Please check:\n` +
                    `- Is the local scraper service running? (http://localhost:4000/api/scraper/health)\n` +
                    `- Is the Chrome extension installed and enabled?\n` +
                    `- Check browser console for extension errors`,
                    HttpStatus.REQUEST_TIMEOUT
                );
            }
            // Handle connection errors
            if (error.code === 'ECONNREFUSED') {
                throw new HttpException(
                    `Cannot connect to local scraper service at ${process.env.LOCAL_SCRAPER_URL || 'http://localhost:4000'}. ` +
                    `Please ensure the local scraper service is running.`,
                    HttpStatus.SERVICE_UNAVAILABLE
                );
            }
            // Handle axios errors from local scraper service
            if (error.response?.status) {
                throw new HttpException(
                    error.response.data?.message || `Local scraper service error: ${error.message}`,
                    error.response.status
                );
            }
            // Preserve the original status code if it's an HttpException
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                `Failed to list product: ${error.message}`,
                HttpStatus.BAD_REQUEST
            );
        }
    }

    /**
     * Automatically scrape Taobao using local scraper service
     * Calls local scraper service which opens browser and waits for extension to extract
     */
    @Post('scrape-taobao-automatic')
    @ApiOperation({ summary: 'Automatically scrape Taobao URL using local scraper service and extension' })
    @ApiResponse({ 
        status: 200, 
        description: 'Returns scraped products from Taobao',
        schema: {
            type: 'object',
            properties: {
                products: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            productName: { type: 'string' },
                            image: { type: 'string' },
                            productUrl: { type: 'string' },
                            productPrice: { type: 'number' },
                            offerPrice: { type: 'number' },
                            rating: { type: 'number' },
                            reviewCount: { type: 'number' },
                            inStock: { type: 'boolean' },
                        }
                    }
                },
                totalResults: { type: 'number' }
            }
        }
    })
    @ApiResponse({ status: 400, description: 'Invalid URL or scraping failed' })
    async scrapeTaobaoAutomatic(@Body() dto: ScrapeListDto): Promise<any> {
        try {
            const { url } = dto;

            // Validate it's a Taobao URL
            const taobaoPattern = /taobao\.com/i;
            if (!taobaoPattern.test(url)) {
                throw new HttpException('URL must be from Taobao.com', HttpStatus.BAD_REQUEST);
            }

            // Get local scraper service URL from config or use default
            const localScraperUrl = process.env.LOCAL_SCRAPER_URL || 'http://localhost:4000';

            // Call local scraper service
            const axios = (await import('axios')).default;
            
            this.logger.log(`Calling local scraper service for Taobao URL: ${url}`);
            
            const response = await axios.post(
                `${localScraperUrl}/api/scraper/scrape-automatic`,
                { url, timeout: 90000 }, // 90 seconds timeout
                { timeout: 95000 } // Axios timeout slightly longer
            );

            if (!response.data || !response.data.success) {
                throw new HttpException(
                    response.data?.error || 'Scraping failed',
                    HttpStatus.INTERNAL_SERVER_ERROR
                );
            }

            // Transform the response to match expected format
            const extractedData = response.data.data;

            if (!extractedData) {
                throw new HttpException('No data extracted from page', HttpStatus.BAD_REQUEST);
            }

            // Handle different page types
            let products: any[] = [];

            if (extractedData.type === 'search' || extractedData.type === 'promotion') {
                // Search/Promotion page - extract products array
                const productsArray = extractedData.products || extractedData.content || [];
                
                if (!Array.isArray(productsArray) || productsArray.length === 0) {
                    throw new HttpException('No products found on search page', HttpStatus.BAD_REQUEST);
                }

                products = productsArray.map((item: any) => {
                    let price = 0;
                    if (typeof item.productPrice === 'number') {
                        price = item.productPrice;
                    } else if (typeof item.price === 'number') {
                        price = item.price;
                    }

                    return {
                        productName: item.productName || item.title || 'Taobao Product',
                        image: item.image || '',
                        productUrl: item.productUrl || item.url || '',
                        productPrice: price > 0 ? price * 1.2 : 0,
                        offerPrice: price,
                        rating: item.rating || 0,
                        reviewCount: item.reviewCount || 0,
                        inStock: item.inStock !== false,
                        brandName: item.brandName || item.brand || undefined,
                    };
                });
            } else if (extractedData.type === 'product') {
                // Single product page
                const product = extractedData.product || extractedData;
                let price = 0;
                if (typeof product.price === 'number') {
                    price = product.price;
                }

                products = [{
                    productName: product.title || product.productName || 'Taobao Product',
                    image: (product.images && product.images[0]) || product.image || '',
                    productUrl: url,
                    productPrice: price > 0 ? price * 1.2 : 0,
                    offerPrice: price,
                    rating: product.rating || 0,
                    reviewCount: product.reviewCount || 0,
                    inStock: product.inStock !== false,
                    brandName: product.brandName || product.brand || undefined,
                }];
            } else {
                throw new HttpException(
                    `Unsupported page type: ${extractedData.type}`,
                    HttpStatus.BAD_REQUEST
                );
            }

            return {
                products,
                totalResults: products.length,
                currentPage: 1,
                totalPages: 1,
                searchQuery: 'Taobao Search',
            };

        } catch (error) {
            if (error.response?.status) {
                // Axios error
                throw new HttpException(
                    error.response.data?.message || `Local scraper service error: ${error.message}`,
                    error.response.status
                );
            } else if (error instanceof HttpException) {
                throw error;
            } else {
                throw new HttpException(
                    `Failed to scrape Taobao URL: ${error.message}`,
                    HttpStatus.INTERNAL_SERVER_ERROR
                );
            }
        }
    }

    /**
     * Import Taobao data from local scraper JSON
     * User copies JSON from local scraper extension and pastes it here
     */
    @Post('import-taobao-data')
    @ApiOperation({ summary: 'Import Taobao data from local scraper JSON (manual import)' })
    @ApiResponse({ 
        status: 200, 
        description: 'Returns formatted products ready for import',
        schema: {
            type: 'object',
            properties: {
                products: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            productName: { type: 'string' },
                            image: { type: 'string' },
                            productUrl: { type: 'string' },
                            productPrice: { type: 'number' },
                            offerPrice: { type: 'number' },
                            rating: { type: 'number' },
                            reviewCount: { type: 'number' },
                            inStock: { type: 'boolean' },
                        }
                    }
                },
                totalResults: { type: 'number' }
            }
        }
    })
    @ApiResponse({ status: 400, description: 'Invalid JSON format or missing required fields' })
    async importTaobaoData(@Body() body: { url?: string; data: any }): Promise<any> {
        try {
            const { url, data } = body;

            if (!data) {
                throw new HttpException('Data is required', HttpStatus.BAD_REQUEST);
            }

            // Handle different data formats from local scraper
            let parsedData = data;
            
            // If data is a string, try to parse it as JSON
            if (typeof data === 'string') {
                try {
                    parsedData = JSON.parse(data);
                } catch (parseError) {
                    throw new HttpException('Invalid JSON format. Please check the copied data.', HttpStatus.BAD_REQUEST);
                }
            }

            // Extract the actual data structure
            // Local scraper returns: { success: true, url: "...", data: { type: "...", ... } }
            const actualData = parsedData.data || parsedData;

            if (!actualData) {
                throw new HttpException('No data found in JSON. Please ensure you copied the complete response.', HttpStatus.BAD_REQUEST);
            }

            // Handle search/promotion pages
            if (actualData.type === 'search' || actualData.type === 'promotion') {
                const products = actualData.products || actualData.content || actualData.items || [];
                
                if (!Array.isArray(products) || products.length === 0) {
                    throw new HttpException('No products found in the data. Please ensure you extracted from a search or promotion page.', HttpStatus.BAD_REQUEST);
                }

                // Transform products to match expected format
                const formattedProducts = products.map((item: any) => {
                    // Extract price (handle various formats)
                    let price = 0;
                    if (typeof item.price === 'number') {
                        price = item.price;
                    } else if (typeof item.productPrice === 'number') {
                        price = item.productPrice;
                    } else if (typeof item.price === 'string' || typeof item.productPrice === 'string') {
                        const priceStr = item.price || item.productPrice || '0';
                        price = parseFloat(priceStr.replace(/[¥¥$£€,]/g, '').trim()) || 0;
                    }

                    // Extract image
                    const image = item.image || 
                                 item.images?.[0] || 
                                 (Array.isArray(item.images) && item.images.length > 0 ? item.images[0] : '') || 
                                 '';

                    return {
                        productName: item.productName || item.title || item.name || 'Taobao Product',
                        image: image,
                        productUrl: item.productUrl || item.url || item.link || '',
                        productPrice: price > 0 ? price * 1.2 : price, // Estimate original price
                        offerPrice: price,
                        rating: item.rating || 0,
                        reviewCount: item.reviewCount || item.reviews || 0,
                        inStock: item.inStock !== false && item.inStock !== 'false',
                        brandName: item.brandName || item.brand || undefined,
                    };
                });

                return {
                    products: formattedProducts,
                    totalResults: formattedProducts.length,
                    currentPage: 1,
                    searchQuery: 'Taobao Search',
                };
            }
            // Handle single product page
            else if (actualData.type === 'product') {
                const product = actualData.product || actualData;
                
                // Extract price
                let price = 0;
                if (typeof product.price === 'number') {
                    price = product.price;
                } else if (typeof product.price === 'string') {
                    price = parseFloat(product.price.replace(/[¥¥$£€,]/g, '').trim()) || 0;
                }

                // Extract images
                const images = product.images || [];
                const primaryImage = Array.isArray(images) && images.length > 0 ? images[0] : '';

                // Return as single product in array format (for consistency with search)
                return {
                    products: [{
                        productName: product.title || product.productName || product.name || 'Taobao Product',
                        image: primaryImage,
                        productUrl: url || '',
                        productPrice: price > 0 ? price * 1.2 : price,
                        offerPrice: price,
                        rating: product.rating || 0,
                        reviewCount: product.reviewCount || 0,
                        inStock: product.inStock !== false,
                        brandName: product.brandName || product.brand || undefined,
                    }],
                    totalResults: 1,
                    currentPage: 1,
                    searchQuery: 'Taobao Product',
                };
            }
            else {
                throw new HttpException(
                    `Unsupported data type: ${actualData.type}. Please extract from a product, search, or promotion page.`,
                    HttpStatus.BAD_REQUEST
                );
            }
        } catch (error) {
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(
                `Failed to import Taobao data: ${error.message}`,
                HttpStatus.BAD_REQUEST
            );
        }
    }
}
