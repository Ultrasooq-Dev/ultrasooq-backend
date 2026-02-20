import { Logger } from '@nestjs/common';
import puppeteer, { Browser, Page } from 'puppeteer';
import { ScraperProvider } from '../scraper.service';
import {
    ScrapedProduct,
    ScrapedSearchResult,
    ScrapedProductSummary,
    ScrapedImage,
    ScrapedSpecification,
} from '../interfaces/scraped-product.interface';

/**
 * Scraper provider for Amazon.in
 */
export class AmazonINScraperProvider implements ScraperProvider {
    private readonly logger = new Logger(AmazonINScraperProvider.name);
    private browser: Browser | null = null;

    /**
     * Check if this provider can scrape the given URL
     */
    canScrape(url: string): boolean {
        try {
            let candidate = url;
            if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(candidate)) {
                candidate = 'http://' + candidate;
            }
            const hostname = new URL(candidate).hostname.toLowerCase();
            // Accept both amazon.com and amazon.in domains
            return hostname === 'amazon.com' || 
                   hostname === 'amazon.in' || 
                   hostname.endsWith('.amazon.com') || 
                   hostname.endsWith('.amazon.in');
        } catch (error) {
            this.logger.warn(`Error checking URL: ${error.message}`);
            return false;
        }
    }

    /**
     * Get or create browser instance
     */
    private async getBrowser(): Promise<Browser> {
        if (!this.browser || !this.browser.connected) {
            this.logger.log('Launching new browser instance');
            this.browser = await puppeteer.launch({
                headless: true, // Must be true for Docker
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--window-size=1920x1080',
                    '--disable-features=IsolateOrigins',
                    '--disable-site-isolation-trials',
                ],
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            });
        }
        return this.browser;
    }

    /**
     * Create a new page with common settings
     */
    private async createPage(): Promise<Page> {
        const browser = await this.getBrowser();
        const page = await browser.newPage();

        // Set user agent to avoid detection
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        // Set viewport
        await page.setViewport({ width: 1920, height: 1080 });

        // Set extra HTTP headers
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        });

        return page;
    }

    /**
     * Scrape search results from Amazon.in
     */
    async scrapeSearch(url: string): Promise<ScrapedSearchResult> {
        this.logger.log(`Scraping search results from: ${url}`);
        const page = await this.createPage();

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Wait for any of the common Amazon search result containers to load
            // Try multiple selectors in case Amazon changes their layout
            const selectors = [
                '[data-component-type="s-search-result"]',
                '.s-result-item[data-asin]',
                'div[data-component-type="s-search-result"]',
                '.s-search-results .s-result-item',
                '[cel_widget_id*="MAIN-SEARCH_RESULTS"]',
            ];

            let selectorFound = false;
            for (const selector of selectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 5000 });
                    this.logger.log(`Found search results using selector: ${selector}`);
                    selectorFound = true;
                    break;
                } catch (error) {
                    this.logger.warn(`Selector not found: ${selector}`);
                }
            }

            if (!selectorFound) {
                // Take a screenshot for debugging
                this.logger.warn('No search result selectors found, attempting to scrape anyway');
                // Continue anyway - we'll try to extract what we can
            }

            // Add a small delay to ensure dynamic content loads
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Get base domain from the URL to support both amazon.com and amazon.in
            const urlObj = new URL(url);
            const baseDomain = `${urlObj.protocol}//${urlObj.hostname}`;

            // Extract product data
            const products: ScrapedProductSummary[] = await page.evaluate((baseDomain) => {
                // Helper function to clean brand name
                const cleanBrandName = (brandText: string): string => {
                    if (!brandText) return '';
                    
                    // Remove common prefixes
                    brandText = brandText
                        .replace(/^(Brand:|Visit the|by|Visit|Shop)\s*/i, '')
                        .replace(/^\s*-\s*/, '')
                        .trim();
                    
                    // Split by common delimiters and take first part
                    brandText = brandText.split(/[\n\r|•]/)[0].trim();
                    
                    // Remove common suffixes (Store, Shop, Visit, etc.)
                    // Match patterns like "Brand Store", "Brand Shop", "Visit Brand Store", etc.
                    brandText = brandText.replace(/\s+(Store|Shop|Visit|Official|Storefront|Outlet|Retailer|Distributor|Seller|Merchant|Brand Store|Brand Shop).*$/i, '').trim();
                    
                    // Remove trailing punctuation
                    brandText = brandText.replace(/[.,;:]+$/, '').trim();
                    
                    return brandText;
                };
                
                const results: ScrapedProductSummary[] = [];
                
                // Try multiple selectors for product containers
                let productElements: NodeListOf<Element> | null = null;
                const containerSelectors = [
                    '[data-component-type="s-search-result"]',
                    '.s-result-item[data-asin]:not([data-asin=""])',
                    'div[data-component-type="s-search-result"]',
                    '.s-search-results .s-result-item[data-asin]',
                ];

                for (const selector of containerSelectors) {
                    productElements = document.querySelectorAll(selector);
                    if (productElements && productElements.length > 0) {
                        break;
                    }
                }

                if (!productElements || productElements.length === 0) {
                    return results;
                }

                productElements.forEach((element) => {
                    try {
                        // Product name - try multiple selectors for robustness
                        let productName = '';
                        const nameElement1 = element.querySelector('h2 span');
                        const nameElement2 = element.querySelector('h2 a span');
                        const nameElement3 = element.querySelector('h2');
                        const nameElement4 = element.querySelector('.a-size-base-plus');
                        const nameElement5 = element.querySelector('.a-size-medium');
                        
                        productName = nameElement1?.textContent?.trim() || 
                                     nameElement2?.textContent?.trim() || 
                                     nameElement3?.textContent?.trim() ||
                                     nameElement4?.textContent?.trim() ||
                                     nameElement5?.textContent?.trim() || '';

                        // Product URL - try multiple selectors
                        const linkElement = element.querySelector('a.a-link-normal') || 
                                          element.querySelector('h2 a') ||
                                          element.querySelector('a[href*="/dp/"]') ||
                                          element.querySelector('a[href*="/gp/"]');
                        const productUrl = linkElement?.getAttribute('href') || '';
                        const fullUrl = productUrl.startsWith('http') ? productUrl : `${baseDomain}${productUrl}`;

                        // Price - try multiple selectors for better coverage (handle both USD and INR)
                        let productPrice = 0;
                        let offerPrice = 0;
                        
                        // Try primary price selector
                        const priceElement = element.querySelector('.a-price-whole');
                        if (priceElement) {
                            const priceText = priceElement.textContent?.trim().replace(/[₹$,\.]/g, '') || '0';
                            productPrice = parseFloat(priceText) || 0;
                            offerPrice = productPrice;
                        }
                        
                        // If no price found, try alternative selectors
                        if (productPrice === 0) {
                            const altPriceElement = element.querySelector('.a-price .a-offscreen');
                            if (altPriceElement) {
                                const priceText = altPriceElement.textContent?.trim().replace(/[₹$,]/g, '') || '0';
                                productPrice = parseFloat(priceText) || 0;
                                offerPrice = productPrice;
                            }
                        }

                        // Check for struck-through price (original price before discount)
                        const strikeElement = element.querySelector('.a-price[data-a-strike="true"] .a-offscreen');
                        if (strikeElement && productPrice > 0) {
                            const strikeText = strikeElement.textContent?.trim().replace(/[₹$,]/g, '') || null;
                            const strikePrice = strikeText ? parseFloat(strikeText) : 0;
                            if (strikePrice > productPrice) {
                                offerPrice = strikePrice; // The higher price is the offer/original price
                            }
                        }

                        // Image
                        const imageElement = element.querySelector('img.s-image') ||
                                           element.querySelector('img[data-image-latency]') ||
                                           element.querySelector('.s-product-image-container img');
                        const image = imageElement?.getAttribute('src') || '';

                        // Rating
                        const ratingElement = element.querySelector('.a-icon-star-small .a-icon-alt') ||
                                            element.querySelector('.a-icon-alt');
                        const ratingText = ratingElement?.textContent?.trim() || '';
                        const rating = parseFloat(ratingText.split(' ')[0]) || 0;

                        // Review count
                        const reviewElement = element.querySelector('[aria-label*="stars"]') ||
                                            element.querySelector('.a-size-base.s-underline-text');
                        const reviewText = reviewElement?.getAttribute('aria-label') || 
                                         reviewElement?.textContent || '';
                        const reviewMatch = reviewText.match(/(\d+(?:,\d+)*)/);
                        const reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, '')) : 0;

                        // In stock check
                        const inStock = !element.textContent?.includes('Currently unavailable') &&
                                       !element.textContent?.includes('Out of Stock');

                        // Brand - try to extract from search result (may not always be available)
                        let brandName = '';
                        const brandElement = element.querySelector('.s-title-instructions-style span') ||
                                           element.querySelector('[data-brand]') ||
                                           element.querySelector('.a-size-base-plus.a-color-secondary');
                        
                        if (brandElement) {
                            brandName = cleanBrandName(brandElement.textContent?.trim() || '');
                            
                            // Validate - should not be too long or contain product name
                            if (brandName.length > 50 || brandName === productName) {
                                brandName = '';
                            }
                        }
                        
                        // If no brand found, try extracting from product name (first word only)
                        // But be more strict - only if it's a reasonable brand name
                        if (!brandName && productName) {
                            const titleWords = productName.split(' ');
                            if (titleWords.length > 0 && titleWords[0].length >= 2 && titleWords[0].length <= 15) {
                                const firstWord = titleWords[0];
                                // Check if first word looks like a brand (capitalized, reasonable length, not numbers)
                                if (firstWord[0] === firstWord[0].toUpperCase() && 
                                    firstWord.length >= 2 && 
                                    firstWord.length <= 15 &&
                                    !firstWord.match(/^\d+$/)) { // Not just numbers
                                    brandName = firstWord;
                                }
                            }
                        }

                        if (productName && fullUrl) {
                            results.push({
                                productName,
                                productUrl: fullUrl,
                                productPrice,
                                offerPrice,
                                image,
                                rating,
                                reviewCount,
                                inStock,
                                brandName: brandName || undefined,
                            });
                        }
                    } catch (error) {
                    }
                });

                return results;
            }, baseDomain);

            // Get total results and pagination info
            const totalResults = await page.evaluate(() => {
                const resultText = document.querySelector('.s-pagination-item.s-pagination-disabled')?.textContent;
                const match = resultText?.match(/(\d+(?:,\d+)*)/);
                return match ? parseInt(match[1].replace(/,/g, '')) : 0;
            });

            this.logger.log(`Successfully scraped ${products.length} products from search`);

            // Enhance brand names by visiting individual product detail pages
            // Limit to first 20 products to avoid timeout (can be made configurable)
            const productsToEnhance = products.slice(0, 20);
            const remainingProducts = products.slice(20);
            
            this.logger.log(`Enhancing brand names for ${productsToEnhance.length} products by visiting detail pages...`);

            const enhancedProducts = await Promise.all(
                productsToEnhance.map(async (product, index) => {
                    try {
                        // Add delay between requests to avoid rate limiting (1 second delay)
                        if (index > 0) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }

                        // Visit the product detail page to get accurate brand name
                        this.logger.log(`[${index + 1}/${productsToEnhance.length}] Enhancing brand for: ${product.productName.substring(0, 50)}...`);
                        
                        const productPage = await this.createPage();
                        try {
                            await productPage.goto(product.productUrl, { 
                                waitUntil: 'domcontentloaded', 
                                timeout: 15000 
                            });

                            // Wait a bit for page to load
                            await new Promise(resolve => setTimeout(resolve, 1000));

                            // Extract brand name from product detail page
                            const enhancedBrand = await productPage.evaluate(() => {
                                // Helper function to clean brand name
                                const cleanBrandName = (brandText: string): string => {
                                    if (!brandText) return '';
                                    
                                    // Remove common prefixes
                                    brandText = brandText
                                        .replace(/^(Brand:|Visit the|by|Visit|Shop)\s*/i, '')
                                        .replace(/^\s*-\s*/, '')
                                        .trim();
                                    
                                    // Split by common delimiters and take first part
                                    brandText = brandText.split(/[\n\r|•]/)[0].trim();
                                    
                                    // Remove common suffixes (Store, Shop, Visit, etc.)
                                    // Match patterns like "Brand Store", "Brand Shop", "Visit Brand Store", etc.
                                    brandText = brandText.replace(/\s+(Store|Shop|Visit|Official|Storefront|Outlet|Retailer|Distributor|Seller|Merchant|Brand Store|Brand Shop).*$/i, '').trim();
                                    
                                    // Remove trailing punctuation
                                    brandText = brandText.replace(/[.,;:]+$/, '').trim();
                                    
                                    return brandText;
                                };
                                
                                let brandName = '';
                                
                                // First, try to extract from "About this item" section
                                const aboutSection = document.querySelector('#feature-bullets');
                                if (aboutSection) {
                                    const aboutText = aboutSection.textContent || '';
                                    const brandPatterns = [
                                        /Brand[:\s]+([^\n\r|]+)/i,
                                        /Brand\s*-\s*([^\n\r|]+)/i,
                                    ];
                                    
                                    for (const pattern of brandPatterns) {
                                        const brandMatch = aboutText.match(pattern);
                                        if (brandMatch && brandMatch[1]) {
                                            brandName = cleanBrandName(brandMatch[1]);
                                            if (brandName && brandName.length > 0 && brandName.length < 50) {
                                                break;
                                            } else {
                                                brandName = '';
                                            }
                                        }
                                    }
                                }
                                
                                // Second, try product details tables
                                if (!brandName || brandName === '') {
                                    const detailTables = [
                                        '#productDetails_feature_div',
                                        '#productDetails_techSpec_section_1',
                                        '#productDetails_detailBullets_sections1',
                                    ];
                                    
                                    for (const tableSelector of detailTables) {
                                        const table = document.querySelector(tableSelector);
                                        if (table) {
                                            const rows = table.querySelectorAll('tr');
                                            for (const row of rows) {
                                                const th = row.querySelector('th');
                                                const td = row.querySelector('td');
                                                if (th && td) {
                                                    const label = th.textContent?.trim() || '';
                                                    if (label.toLowerCase().includes('brand')) {
                                                        brandName = cleanBrandName(td.textContent?.trim() || '');
                                                        if (brandName && brandName.length > 0 && brandName.length < 50) {
                                                            break;
                                                        } else {
                                                            brandName = '';
                                                        }
                                                    }
                                                }
                                            }
                                            if (brandName) break;
                                        }
                                    }
                                }
                                
                                // Third, try #bylineInfo
                                if (!brandName || brandName === '') {
                                    const bylineInfo = document.querySelector('#bylineInfo');
                                    if (bylineInfo) {
                                        const brandText = bylineInfo.textContent?.trim() || '';
                                        brandName = cleanBrandName(brandText);
                                        if (!brandName || brandName.length === 0 || brandName.length >= 50) {
                                            brandName = '';
                                        }
                                    }
                                }
                                
                                return brandName;
                            });

                            // Update product with enhanced brand name if found
                            if (enhancedBrand && enhancedBrand.trim() !== '') {
                                product.brandName = enhancedBrand;
                                this.logger.log(`✓ Enhanced brand for "${product.productName.substring(0, 40)}...": ${enhancedBrand}`);
                            } else {
                                this.logger.warn(`⚠ Could not extract brand from detail page for "${product.productName.substring(0, 40)}..."`);
                            }

                            await productPage.close();
                        } catch (error: any) {
                            this.logger.warn(`Failed to enhance brand for "${product.productName.substring(0, 40)}...": ${error.message}`);
                            await productPage.close().catch(() => {});
                        }
                    } catch (error: any) {
                        this.logger.warn(`Error enhancing product ${index + 1}: ${error.message}`);
                    }
                    
                    return product;
                })
            );

            // Combine enhanced products with remaining products
            const allProducts = [
                ...enhancedProducts,
                ...remainingProducts // Products beyond the first 20 keep their original brand
            ];

            this.logger.log(`Successfully enhanced ${enhancedProducts.length} products. Total products: ${allProducts.length}`);

            return {
                products: allProducts,
                totalResults,
                currentPage: 1,
                searchQuery: url,
            };
        } catch (error) {
            this.logger.error(`Error scraping search: ${error.message}`, error.stack);
            throw error;
        } finally {
            await page.close();
        }
    }

    /**
     * Scrape product details from Amazon.in
     */
    async scrapeProduct(url: string): Promise<ScrapedProduct> {
        this.logger.log(`Scraping product from: ${url}`);
        const page = await this.createPage();

        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

            // Wait for product details to load
            await page.waitForSelector('#productTitle', { timeout: 20000 });

            // Determine domain info for dynamic platform and origin
            const urlObj = new URL(url);
            const hostname = urlObj.hostname.toLowerCase();
            const isAmazonCom = hostname.includes('amazon.com');
            const sourcePlatform = isAmazonCom ? 'Amazon.com' : 'Amazon.in';
            const placeOfOrigin = isAmazonCom ? 'USA' : 'India';

            // Extract product data
            const productData = await page.evaluate(() => {
                // Helper function to clean brand name
                const cleanBrandName = (brandText: string): string => {
                    if (!brandText) return '';
                    
                    // Remove common prefixes
                    brandText = brandText
                        .replace(/^(Brand:|Visit the|by|Visit|Shop)\s*/i, '')
                        .replace(/^\s*-\s*/, '')
                        .trim();
                    
                    // Split by common delimiters and take first part
                    brandText = brandText.split(/[\n\r|•]/)[0].trim();
                    
                    // Remove common suffixes (Store, Shop, Visit, etc.)
                    // Match patterns like "Brand Store", "Brand Shop", "Visit Brand Store", etc.
                    brandText = brandText.replace(/\s+(Store|Shop|Visit|Official|Storefront|Outlet|Retailer|Distributor|Seller|Merchant|Brand Store|Brand Shop).*$/i, '').trim();
                    
                    // Remove trailing punctuation
                    brandText = brandText.replace(/[.,;:]+$/, '').trim();
                    
                    return brandText;
                };
                
                // Product name
                const productName = document.querySelector('#productTitle')?.textContent?.trim() || '';

                // Price - try multiple selectors for better coverage (handle both USD and INR)
                let productPrice = 0;
                let offerPrice = 0;
                
                // List of price selectors to try (in order of preference)
                const priceSelectors = [
                    '.a-price-whole',                                    // Most common for Amazon.in
                    '.a-price .a-offscreen',                             // Common for Amazon.com
                    '#priceblock_ourprice',                              // Our price
                    '#priceblock_dealprice',                             // Deal price
                    '#priceblock_saleprice',                             // Sale price
                    '.a-price[data-a-color="base"] .a-offscreen',       // Base price with data attribute
                    '[data-a-color="price"] .a-offscreen',              // Price with data attribute
                    '#price',                                            // Simple ID selector
                    '.a-price .a-price-whole',                           // Price whole number
                    '.a-price-range .a-offscreen',                       // Price range
                    'span.a-price-whole',                                // Span with price whole
                    '.a-price-symbol + .a-price-whole',                 // Price after symbol
                ];

                // Try each selector until we find a valid price
                for (const selector of priceSelectors) {
                    const priceElement = document.querySelector(selector);
                    if (priceElement) {
                        let priceText = priceElement.textContent?.trim() || '';
                        
                        // Remove currency symbols and commas
                        priceText = priceText.replace(/[₹$£€¥,\s]/g, '');
                        
                        // Handle cases where price might be split (e.g., "1,234.56" or "1234.56")
                        const priceMatch = priceText.match(/(\d+(?:\.\d{2})?)/);
                        if (priceMatch) {
                            const parsedPrice = parseFloat(priceMatch[1]);
                            if (!isNaN(parsedPrice) && parsedPrice > 0) {
                                productPrice = parsedPrice;
                                offerPrice = parsedPrice;
                                break; // Found valid price, exit loop
                            }
                        }
                    }
                }

                // If still no price found, try to extract from text content using regex
                if (productPrice === 0) {
                    const bodyText = document.body.textContent || '';
                    // Try to find price patterns like: ₹1,234.56 or $123.45 or 1234.56
                    const pricePatterns = [
                        /[₹$£€¥]\s*(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})?)/,  // Currency symbol followed by number
                        /(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})?)\s*[₹$£€¥]/,  // Number followed by currency symbol
                        /price[:\s]*[₹$£€¥]?\s*(\d{1,3}(?:[,\s]\d{3})*(?:\.\d{2})?)/i,  // "Price: ₹1234.56"
                    ];
                    
                    for (const pattern of pricePatterns) {
                        const match = bodyText.match(pattern);
                        if (match && match[1]) {
                            const priceStr = match[1].replace(/[,\s]/g, '');
                            const parsedPrice = parseFloat(priceStr);
                            if (!isNaN(parsedPrice) && parsedPrice > 0) {
                                productPrice = parsedPrice;
                                offerPrice = parsedPrice;
                                break;
                            }
                        }
                    }
                }

                // Check for struck-through price (original price before discount)
                if (productPrice > 0) {
                    const strikeSelectors = [
                        '.a-price[data-a-strike="true"] .a-offscreen',
                        '.a-price.a-text-strike .a-offscreen',
                        '#priceblock_dealprice + .a-text-strike',
                    ];
                    
                    for (const selector of strikeSelectors) {
                        const strikeElement = document.querySelector(selector);
                        if (strikeElement) {
                            const strikeText = strikeElement.textContent?.trim().replace(/[₹$,]/g, '') || '';
                            const strikePrice = parseFloat(strikeText);
                            if (!isNaN(strikePrice) && strikePrice > productPrice) {
                                offerPrice = strikePrice; // The higher price is the offer/original price
                                break;
                            }
                        }
                    }
                }

                // If offerPrice is still 0, set it to productPrice
                if (offerPrice === 0 && productPrice > 0) {
                    offerPrice = productPrice;
                }

                // Brand - try multiple selectors for better coverage
                let brandName = '';
                
                // First, try to extract from "About this item" section where Brand is explicitly listed
                const aboutSection = document.querySelector('#feature-bullets');
                if (aboutSection) {
                    const aboutText = aboutSection.textContent || '';
                    // Look for "Brand:" pattern in the about section - more specific pattern
                    const brandPatterns = [
                        /Brand[:\s]+([^\n\r|]+)/i,
                        /Brand\s*-\s*([^\n\r|]+)/i,
                    ];
                    
                    for (const pattern of brandPatterns) {
                        const brandMatch = aboutText.match(pattern);
                        if (brandMatch && brandMatch[1]) {
                            brandName = cleanBrandName(brandMatch[1]);
                            if (brandName && brandName.length > 0 && brandName.length < 50) {
                                break;
                            } else {
                                brandName = '';
                            }
                        }
                    }
                }
                
                // Second, try to extract from product details tables
                if (!brandName || brandName === '') {
                    const detailTables = [
                        '#productDetails_feature_div',
                        '#productDetails_techSpec_section_1',
                        '#productDetails_detailBullets_sections1',
                    ];
                    
                    for (const tableSelector of detailTables) {
                        const table = document.querySelector(tableSelector);
                        if (table) {
                            const rows = table.querySelectorAll('tr');
                            for (const row of rows) {
                                const th = row.querySelector('th');
                                const td = row.querySelector('td');
                                if (th && td) {
                                    const label = th.textContent?.trim() || '';
                                    if (label.toLowerCase().includes('brand')) {
                                        brandName = cleanBrandName(td.textContent?.trim() || '');
                                        if (brandName && brandName.length > 0 && brandName.length < 50) {
                                            break;
                                        } else {
                                            brandName = '';
                                        }
                                    }
                                }
                            }
                            if (brandName) break;
                        }
                    }
                }
                
                // Third, try common brand selectors
                if (!brandName || brandName === '') {
                    const brandSelectors = [
                        '#bylineInfo',                                    // Most common for Amazon - brand link
                        '.po-brand .po-break-word',                      // Product overview brand
                        '[data-brand]',                                   // Data attribute
                        'a#brand',                                        // Brand link
                        '.a-link-normal[href*="/brand/"]',               // Brand link in navigation
                    ];

                    // Try each selector until we find a valid brand
                    for (const selector of brandSelectors) {
                        try {
                            const brandElement = document.querySelector(selector);
                            if (brandElement) {
                                let brandText = brandElement.textContent?.trim() || '';
                                
                                // Extract brand name from links
                                if (brandText === '' && brandElement.tagName === 'A') {
                                    brandText = brandElement.textContent?.trim() || '';
                                }
                                
                                // Extract from href if it's a brand link
                                if (brandText === '' && brandElement.getAttribute('href')) {
                                    const href = brandElement.getAttribute('href');
                                    const hrefMatch = href?.match(/\/brand\/([^/?]+)/i);
                                    if (hrefMatch && hrefMatch[1]) {
                                        brandText = decodeURIComponent(hrefMatch[1])
                                            .replace(/-/g, ' ')
                                            .replace(/\b\w/g, l => l.toUpperCase());
                                    }
                                }
                                
                                // Clean the brand text
                                brandText = cleanBrandName(brandText);
                                
                                // Validate brand text - should be short and not contain product name
                                if (brandText && 
                                    brandText.length > 0 && 
                                    brandText.length < 50 && 
                                    !brandText.includes('|') &&
                                    brandText !== productName &&
                                    !productName.startsWith(brandText + ' ')) { // Brand shouldn't be part of product name
                                    brandName = brandText;
                                    break; // Found valid brand, exit loop
                                }
                            }
                        } catch (e) {
                            // Continue to next selector if this one fails
                            continue;
                        }
                    }
                }

                // Last resort: try to extract from product title (first word is often brand)
                // But only if it's a reasonable brand name (short, capitalized)
                if (!brandName || brandName === '') {
                    const titleWords = productName.split(' ');
                    if (titleWords.length > 0 && titleWords[0].length >= 2 && titleWords[0].length <= 15) {
                        const firstWord = titleWords[0];
                        // Check if first word looks like a brand (capitalized, reasonable length, not numbers)
                        if (firstWord[0] === firstWord[0].toUpperCase() && 
                            firstWord.length >= 2 && 
                            firstWord.length <= 15 &&
                            !firstWord.match(/^\d+$/) && // Not just numbers
                            !firstWord.match(/^[A-Z]{1,2}$/)) { // Not just 1-2 uppercase letters (like "A", "TV")
                            brandName = firstWord;
                        }
                    }
                }

                // Description
                const descriptionElement = document.querySelector('#feature-bullets');
                const description = descriptionElement?.textContent?.trim() || '';

                // Short description (first feature bullet)
                const firstBullet = document.querySelector('#feature-bullets ul li span')?.textContent?.trim();
                const shortDescription = firstBullet || description.substring(0, 200);

                // Images
                const images: any[] = [];
                const imageElements = document.querySelectorAll('#altImages img');
                imageElements.forEach((img, index) => {
                    const src = img.getAttribute('src');
                    const dataOldSrc = img.getAttribute('data-old-src');
                    const dataSrc = img.getAttribute('data-src');
                    
                    // Use the best available image source
                    let imageUrl = src || dataOldSrc || dataSrc || '';
                    
                    // Filter out invalid images: play icons, 360 view icons, and non-URL strings
                    if (imageUrl && 
                        !imageUrl.includes('play-icon-overlay') &&
                        !imageUrl.includes('360') &&
                        !imageUrl.includes('spin') &&
                        imageUrl.startsWith('http') &&
                        (imageUrl.includes('.jpg') || imageUrl.includes('.jpeg') || imageUrl.includes('.png') || imageUrl.includes('.webp') || imageUrl.includes('images-amazon'))) {
                        // Get larger version of image by removing size constraints
                        const largeUrl = imageUrl.replace(/\._.*_\./, '.').replace(/_AC_[^_]+_/, '_AC_SX679_');
                        images.push({
                            url: largeUrl,
                            imageName: `image_${index + 1}`,
                            isPrimary: index === 0,
                        });
                    }
                });

                // Main image if no thumbnails found
                if (images.length === 0) {
                    const mainImage = document.querySelector('#landingImage');
                    const mainImageSrc = mainImage?.getAttribute('src') || 
                                        mainImage?.getAttribute('data-old-src') ||
                                        mainImage?.getAttribute('data-src');
                    if (mainImageSrc && 
                        mainImageSrc.startsWith('http') &&
                        !mainImageSrc.includes('360') &&
                        !mainImageSrc.includes('spin')) {
                        images.push({
                            url: mainImageSrc,
                            imageName: 'image_1',
                            isPrimary: true,
                        });
                    }
                }

                // Rating
                const ratingElement = document.querySelector('.a-icon-star .a-icon-alt');
                const ratingText = ratingElement?.textContent?.trim() || '';
                const rating = parseFloat(ratingText.split(' ')[0]) || 0;

                // Review count
                const reviewElement = document.querySelector('#acrCustomerReviewText');
                const reviewText = reviewElement?.textContent?.trim() || '';
                const reviewMatch = reviewText.match(/(\d+(?:,\d+)*)/);
                const reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, '')) : 0;

                // Stock availability
                const availabilityElement = document.querySelector('#availability span');
                const availabilityText = availabilityElement?.textContent?.trim() || '';
                const inStock = !availabilityText.toLowerCase().includes('out of stock') &&
                    !availabilityText.toLowerCase().includes('currently unavailable');

                // Specifications
                const specifications: any[] = [];
                const specRows = document.querySelectorAll('#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr');
                specRows.forEach((row) => {
                    const label = row.querySelector('th')?.textContent?.trim();
                    const value = row.querySelector('td')?.textContent?.trim();
                    if (label && value) {
                        specifications.push({ label, value });
                    }
                });

                // Additional details from bullets
                const detailBullets = document.querySelectorAll('#detailBullets_feature_div ul li');
                detailBullets.forEach((li) => {
                    const text = li.textContent?.trim() || '';
                    const parts = text.split(':');
                    if (parts.length >= 2) {
                        const label = parts[0].trim();
                        const value = parts.slice(1).join(':').trim();
                        specifications.push({ label, value });
                    }
                });

                // Extract ASIN from specifications
                let barcode = '';
                specifications.forEach(spec => {
                    if (spec.label.toLowerCase().includes('asin')) {
                        barcode = spec.value;
                    }
                });

                return {
                    productName,
                    productPrice,
                    offerPrice,
                    brandName,
                    description,
                    shortDescription,
                    images,
                    rating,
                    reviewCount,
                    inStock,
                    specifications,
                    barcode,
                };
            });

            // Log price extraction results for debugging
            if (productData.productPrice === 0) {
                this.logger.warn(`⚠️ Price extraction failed for product: ${productData.productName || 'Unknown'}`);
                this.logger.warn(`URL: ${url}`);
                this.logger.warn(`This might indicate that Amazon's HTML structure has changed or the product has no price listed.`);
            } else {
                this.logger.log(`✓ Price extracted successfully: ₹${productData.productPrice} (Offer: ₹${productData.offerPrice})`);
            }

            // Build the complete product object
            const scrapedProduct: ScrapedProduct = {
                productName: productData.productName,
                description: productData.description,
                shortDescription: productData.shortDescription,
                productPrice: productData.productPrice,
                offerPrice: productData.offerPrice,
                brandName: productData.brandName,
                barcode: productData.barcode,
                images: productData.images as ScrapedImage[],
                placeOfOrigin: placeOfOrigin,
                productType: 'PHYSICAL',
                typeOfProduct: 'NEW',
                specifications: productData.specifications as ScrapedSpecification[],
                sourceUrl: url,
                sourcePlatform: sourcePlatform,
                inStock: productData.inStock,
                rating: productData.rating,
                reviewCount: productData.reviewCount,
                metadata: {
                    scrapedAt: new Date().toISOString(),
                    sourceUrl: url,
                },
            };

            this.logger.log(`Successfully scraped product: ${scrapedProduct.productName}`);

            return scrapedProduct;
        } catch (error) {
            this.logger.error(`Error scraping product: ${error.message}`, error.stack);
            throw error;
        } finally {
            await page.close();
        }
    }

    /**
     * Close the browser instance
     */
    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.logger.log('Browser instance closed');
        }
    }
}