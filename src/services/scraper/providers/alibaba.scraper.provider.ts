import { Logger } from '@nestjs/common';
import puppeteer, { Browser, Page } from 'puppeteer';
import { ScraperProvider } from '../scraper.service';
import {
    ScrapedProduct,
    ScrapedSearchResult,
    ScrapedProductSummary,
    ScrapedImage,
    ScrapedSpecification,
    ScrapedVariant,
    ScrapedSeller,
    ScrapedShipping,
} from '../interfaces/scraped-product.interface';

/**
 * Scraper provider for Alibaba.com (B2B wholesale platform)
 *
 * Alibaba products feature FOB prices, MOQ, supplier certifications,
 * Trade Assurance, and mixed Chinese/English content.
 */
export class AlibabaScraperProvider implements ScraperProvider {
    private readonly logger = new Logger(AlibabaScraperProvider.name);
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
            return (
                hostname === 'alibaba.com' ||
                hostname === 'www.alibaba.com' ||
                hostname.endsWith('.alibaba.com')
            );
        } catch (error: any) {
            this.logger.warn(`Error checking URL: ${error.message}`);
            return false;
        }
    }

    /**
     * Get or create browser instance
     */
    private async getBrowser(): Promise<Browser> {
        if (!this.browser || !this.browser.connected) {
            this.logger.log('Launching new browser instance for Alibaba');
            this.browser = await puppeteer.launch({
                headless: 'shell',
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
     * Create a new page with anti-detection settings
     */
    private async createPage(): Promise<Page> {
        const browser = await this.getBrowser();
        const page = await browser.newPage();

        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        );

        await page.setViewport({ width: 1920, height: 1080 });

        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        });

        return page;
    }

    // ──────────────────────────────────────────────
    // Search scraping
    // ──────────────────────────────────────────────

    /**
     * Scrape search results from Alibaba.com
     */
    async scrapeSearch(url: string): Promise<ScrapedSearchResult> {
        this.logger.log(`Scraping Alibaba search results from: ${url}`);
        const page = await this.createPage();

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Wait for search result containers to appear
            const selectors = [
                '.organic-list .J-offer-wrapper',
                '.organic-list .list-no-v2-outter',
                '[data-content="offer"]',
                '.organic-gallery-offer-outter',
                '.J-offer-wrapper',
                '.organic-list-offer-outter',
            ];

            let selectorFound = false;
            for (const selector of selectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 6000 });
                    this.logger.log(`Found Alibaba search results using selector: ${selector}`);
                    selectorFound = true;
                    break;
                } catch {
                    this.logger.warn(`Selector not found: ${selector}`);
                }
            }

            if (!selectorFound) {
                this.logger.warn('No Alibaba search result selectors found, attempting extraction anyway');
            }

            // Allow lazy-loaded content to populate
            await new Promise(resolve => setTimeout(resolve, 2500));

            const products: ScrapedProductSummary[] = await page.evaluate(() => {
                const results: ScrapedProductSummary[] = [];

                // Try several container selectors
                const containerSelectors = [
                    '.J-offer-wrapper',
                    '.organic-list-offer-outter',
                    '[data-content="offer"]',
                    '.organic-gallery-offer-outter',
                    '.list-no-v2-outter .J-offer-wrapper',
                ];

                let productElements: NodeListOf<Element> | null = null;
                for (const sel of containerSelectors) {
                    productElements = document.querySelectorAll(sel);
                    if (productElements && productElements.length > 0) break;
                }

                if (!productElements || productElements.length === 0) return results;

                productElements.forEach(el => {
                    try {
                        // Title
                        const titleEl =
                            el.querySelector('.elements-title-normal__content') ||
                            el.querySelector('.search-card-e-title') ||
                            el.querySelector('h2') ||
                            el.querySelector('.title') ||
                            el.querySelector('a[title]');
                        const productName =
                            titleEl?.getAttribute('title') ||
                            titleEl?.textContent?.trim() ||
                            '';

                        // URL
                        const linkEl =
                            el.querySelector('a.elements-title-normal__content') ||
                            el.querySelector('a[href*="product-detail"]') ||
                            el.querySelector('a[href*="alibaba.com"]') ||
                            el.querySelector('h2 a') ||
                            el.querySelector('a');
                        let productUrl = linkEl?.getAttribute('href') || '';
                        if (productUrl && !productUrl.startsWith('http')) {
                            productUrl = 'https:' + productUrl;
                        }

                        // Price (FOB price range like "$0.50 - $2.00")
                        const priceEl =
                            el.querySelector('.elements-offer-price-normal__price') ||
                            el.querySelector('.search-card-e-price-main') ||
                            el.querySelector('.price') ||
                            el.querySelector('[class*="price"]');
                        const priceText = priceEl?.textContent?.trim() || '';
                        let productPrice = 0;
                        const priceMatch = priceText.match(
                            /\$?\s*([\d,.]+)/,
                        );
                        if (priceMatch) {
                            productPrice =
                                parseFloat(priceMatch[1].replace(/,/g, '')) || 0;
                        }

                        // Image
                        const imgEl =
                            el.querySelector('img[src*="alicdn"]') ||
                            el.querySelector('img[data-src]') ||
                            el.querySelector('.seb-img-switcher__imgs img') ||
                            el.querySelector('img');
                        let image =
                            imgEl?.getAttribute('src') ||
                            imgEl?.getAttribute('data-src') ||
                            '';
                        if (image && !image.startsWith('http')) {
                            image = 'https:' + image;
                        }

                        // Rating (Alibaba uses stars on some cards)
                        const ratingEl = el.querySelector('.seb-supplier-review__score');
                        const rating = ratingEl
                            ? parseFloat(ratingEl.textContent?.trim() || '0')
                            : 0;

                        // MOQ as review count stand-in (stored in metadata later)
                        const moqEl =
                            el.querySelector('.element-offer-minorder-normal__value') ||
                            el.querySelector('.search-card-m-sale-features__item') ||
                            el.querySelector('[class*="moq"]') ||
                            el.querySelector('[class*="min-order"]');
                        const moqText = moqEl?.textContent?.trim() || '';
                        const moqMatch = moqText.match(/([\d,]+)/);
                        const reviewCount = moqMatch
                            ? parseInt(moqMatch[1].replace(/,/g, ''), 10)
                            : 0;

                        // Brand / Supplier name
                        const supplierEl =
                            el.querySelector('.search-card-e-company') ||
                            el.querySelector('.company-name') ||
                            el.querySelector('[class*="supplier"]') ||
                            el.querySelector('[class*="company"]');
                        const brandName = supplierEl?.textContent?.trim() || '';

                        if (productName && productUrl) {
                            results.push({
                                productName,
                                productUrl,
                                productPrice,
                                offerPrice: productPrice,
                                image,
                                rating,
                                reviewCount,
                                inStock: true, // B2B products are generally in-stock
                                brandName: brandName || undefined,
                            });
                        }
                    } catch {
                        // Skip malformed cards
                    }
                });

                return results;
            });

            // Pagination info
            const totalResults = await page.evaluate(() => {
                const countEl =
                    document.querySelector('.search-count') ||
                    document.querySelector('[class*="result-count"]') ||
                    document.querySelector('.total-count');
                const text = countEl?.textContent?.trim() || '';
                const match = text.match(/([\d,]+)/);
                return match ? parseInt(match[1].replace(/,/g, ''), 10) : 0;
            });

            this.logger.log(
                `Successfully scraped ${products.length} Alibaba products from search`,
            );

            return {
                products,
                totalResults,
                currentPage: 1,
                searchQuery: url,
            };
        } catch (error: any) {
            this.logger.error(
                `Error scraping Alibaba search: ${error.message}`,
                error.stack,
            );
            throw error;
        } finally {
            await page.close();
        }
    }

    // ──────────────────────────────────────────────
    // Product detail scraping
    // ──────────────────────────────────────────────

    /**
     * Scrape product details from Alibaba.com
     */
    async scrapeProduct(url: string): Promise<ScrapedProduct> {
        this.logger.log(`Scraping Alibaba product from: ${url}`);
        const page = await this.createPage();

        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 40000 });

            // Wait for a primary title element
            try {
                await page.waitForSelector(
                    '.product-title, h1, .module-pdp-title',
                    { timeout: 15000 },
                );
            } catch {
                this.logger.warn('Alibaba product title selector not found within timeout');
            }

            // Let dynamic content (images, specs) load
            await new Promise(resolve => setTimeout(resolve, 3000));

            const productData = await page.evaluate(() => {
                // ── Helpers ────────────────────────────────
                const txt = (selectors: string[]): string => {
                    for (const sel of selectors) {
                        const el = document.querySelector(sel);
                        if (el) {
                            const t = el.textContent?.trim();
                            if (t) return t;
                        }
                    }
                    return '';
                };

                // ── Title ─────────────────────────────────
                const productName = txt([
                    '.product-title',
                    '.module-pdp-title h1',
                    'h1',
                    '.ma-title h1',
                    '[class*="product-title"]',
                ]);

                // ── Price ─────────────────────────────────
                // FOB price ranges like "$0.50 - $2.00 / Piece"
                const priceRawText = txt([
                    '.price',
                    '.module-pdp-price',
                    '.ma-spec-price .ma-ref-price',
                    '[class*="price"]',
                    '.original-price',
                ]);
                let productPrice = 0;
                let offerPrice = 0;
                // Try to grab lowest price from range
                const allPrices = priceRawText.match(/[\d,.]+/g) || [];
                if (allPrices.length >= 1) {
                    productPrice = parseFloat(allPrices[0].replace(/,/g, '')) || 0;
                }
                if (allPrices.length >= 2) {
                    offerPrice = parseFloat(allPrices[1].replace(/,/g, '')) || 0;
                }
                if (offerPrice === 0) offerPrice = productPrice;

                // ── MOQ ───────────────────────────────────
                const moqText = txt([
                    '.moq-value',
                    '.ma-quantity-range',
                    '[class*="moq"]',
                    '[class*="min-order"]',
                    '.step-price-range .step-price-range-val',
                ]);
                const moqMatch = moqText.match(/([\d,]+)/);
                const moq = moqMatch ? parseInt(moqMatch[1].replace(/,/g, ''), 10) : 1;

                // ── Brand ─────────────────────────────────
                const brandName = txt([
                    '.product-name a',
                    '.module-company-name',
                    '.company-name a',
                    '[class*="company-name"]',
                    '.ma-company-name',
                ]);

                // ── Description ───────────────────────────
                const description = txt([
                    '.product-description',
                    '.detail-decorate-root',
                    '.module-pdp-desc',
                    '#ali-anchor-AliPostDh498-description',
                    '.do-description',
                ]);
                const shortDescription = description.substring(0, 250);

                // ── Images ────────────────────────────────
                const images: any[] = [];
                const imageSelectors = [
                    '.main-image-list img',
                    '.detail-gallery-turn img',
                    '.module-pdp-image img',
                    '.ma-main-image img',
                    '.image-view img',
                    '.sku-image img',
                ];
                const seenUrls = new Set<string>();
                for (const sel of imageSelectors) {
                    document.querySelectorAll(sel).forEach((img, idx) => {
                        let src =
                            img.getAttribute('src') ||
                            img.getAttribute('data-src') ||
                            img.getAttribute('data-lazy-src') ||
                            '';
                        if (src && !src.startsWith('http')) src = 'https:' + src;
                        // Get full-size image (remove size suffix)
                        src = src.replace(/_\d+x\d+\./, '.');
                        if (src && !seenUrls.has(src) && src.includes('alicdn')) {
                            seenUrls.add(src);
                            images.push({
                                url: src,
                                imageName: `image_${images.length + 1}`,
                                isPrimary: images.length === 0,
                            });
                        }
                    });
                }

                // ── Rating & Reviews ──────────────────────
                const ratingText = txt([
                    '.score',
                    '.seb-supplier-review__score',
                    '[class*="review-score"]',
                ]);
                const rating = parseFloat(ratingText) || 0;

                const reviewText = txt([
                    '.review-count',
                    '[class*="review-count"]',
                ]);
                const reviewMatch = reviewText.match(/([\d,]+)/);
                const reviewCount = reviewMatch
                    ? parseInt(reviewMatch[1].replace(/,/g, ''), 10)
                    : 0;

                // ── Specifications ────────────────────────
                const specifications: any[] = [];
                const specSelectors = [
                    '.do-entry-list .do-entry-item',
                    '.module-pdp-info .info-item',
                    '.product-prop-list .product-prop-line',
                    '.ma-ref-price-info .ref-price-info-item',
                    '[class*="attr-item"]',
                ];
                for (const sel of specSelectors) {
                    document.querySelectorAll(sel).forEach(item => {
                        const label =
                            item.querySelector('.do-entry-item-label, .info-title, .attr-name, dt')
                                ?.textContent?.trim() || '';
                        const value =
                            item.querySelector('.do-entry-item-val, .info-desc, .attr-value, dd')
                                ?.textContent?.trim() || '';
                        if (label && value) {
                            specifications.push({ label, value });
                        }
                    });
                }

                // ── Supplier / Seller ─────────────────────
                const supplierName = txt([
                    '.module-company-name a',
                    '.company-name a',
                    '.ma-company-name a',
                    '.contact-company a',
                    '[class*="company-name"]',
                ]);

                const yearsText = txt([
                    '.seb-supplier-review__years',
                    '.company-year',
                    '[class*="supplier-year"]',
                    '.verify-item .num',
                ]);
                const yearsMatch = yearsText.match(/(\d+)/);
                const yearsOnPlatform = yearsMatch ? parseInt(yearsMatch[1], 10) : 0;

                const tradeAssuranceEl =
                    document.querySelector('[class*="trade-assurance"]') ||
                    document.querySelector('[class*="ta-badge"]') ||
                    document.querySelector('[data-trade-assurance]');
                const tradeAssurance = !!tradeAssuranceEl;

                const verifiedEl =
                    document.querySelector('[class*="verified"]') ||
                    document.querySelector('[class*="gold-supplier"]') ||
                    document.querySelector('.seb-icon-gold-supplier');
                const isVerified = !!verifiedEl;

                const locationText = txt([
                    '.module-company-info .company-info-item:last-child',
                    '.company-location',
                    '.ma-company-location',
                    '[class*="company-address"]',
                ]);

                const storeUrl =
                    (
                        document.querySelector('.module-company-name a') ||
                        document.querySelector('.company-name a')
                    )?.getAttribute('href') || '';

                // ── Variants (price tiers / options) ──────
                const variants: any[] = [];
                document
                    .querySelectorAll(
                        '.sku-prop, [class*="sku-prop"], .module-sku .sku-attr',
                    )
                    .forEach(propGroup => {
                        const name =
                            propGroup
                                .querySelector('.sku-title, .sku-attr-title')
                                ?.textContent?.trim()
                                .replace(/:$/, '') || '';
                        const options: string[] = [];
                        propGroup
                            .querySelectorAll(
                                '.sku-attr-val, .sku-prop-val, [class*="sku-value"]',
                            )
                            .forEach(opt => {
                                const v = opt.textContent?.trim();
                                if (v) options.push(v);
                            });
                        if (name && options.length > 0) {
                            variants.push({ name, options });
                        }
                    });

                // ── Shipping ──────────────────────────────
                const shippingText = txt([
                    '.logistics-cost',
                    '.module-logistics .logistics-info',
                    '[class*="shipping-info"]',
                    '[class*="logistic"]',
                ]);
                const shippingFrom = txt([
                    '.logistics-company .logistics-from',
                    '.ship-from',
                    '[class*="ship-from"]',
                ]);
                const estimatedDaysText = txt([
                    '.logistics-time',
                    '.logistics-info .delivery-days',
                    '[class*="delivery-time"]',
                ]);
                const daysMatch = estimatedDaysText.match(/(\d+)/);
                const estimatedDays = daysMatch ? parseInt(daysMatch[1], 10) : 0;

                // ── Certifications ────────────────────────
                const certifications: string[] = [];
                document
                    .querySelectorAll(
                        '.cert-item, [class*="certification"] .name, .product-cert-list li',
                    )
                    .forEach(el => {
                        const c = el.textContent?.trim();
                        if (c) certifications.push(c);
                    });

                // ── Category path ─────────────────────────
                const breadcrumbs: string[] = [];
                document
                    .querySelectorAll('.detail-breadcrumbs a, .breadcrumb a, .bread-crumb a')
                    .forEach(a => {
                        const t = a.textContent?.trim();
                        if (t) breadcrumbs.push(t);
                    });
                const categoryPath = breadcrumbs.join(' > ');

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
                    specifications,
                    supplierName,
                    yearsOnPlatform,
                    tradeAssurance,
                    isVerified,
                    locationText,
                    storeUrl,
                    variants,
                    shippingText,
                    shippingFrom,
                    estimatedDays,
                    certifications,
                    categoryPath,
                    moq,
                    priceRawText,
                };
            });

            // Log extraction diagnostics
            if (productData.productPrice === 0) {
                this.logger.warn(
                    `Price extraction failed for Alibaba product: ${productData.productName || 'Unknown'}`,
                );
            } else {
                this.logger.log(
                    `Price extracted: $${productData.productPrice} – $${productData.offerPrice}`,
                );
            }

            // Build seller object
            const seller: ScrapedSeller = {
                name: productData.supplierName || productData.brandName || '',
                storeName: productData.supplierName || '',
                storeUrl: productData.storeUrl
                    ? productData.storeUrl.startsWith('http')
                        ? productData.storeUrl
                        : 'https:' + productData.storeUrl
                    : '',
                location: productData.locationText || '',
                isVerified: productData.isVerified,
                tradeAssurance: productData.tradeAssurance,
                rating: productData.rating || undefined,
            };

            // Build shipping object
            const shipping: ScrapedShipping = {
                freeShipping: false,
                estimatedDays: productData.estimatedDays || undefined,
                shippingFrom: productData.shippingFrom || 'China',
                methods: productData.shippingText ? [productData.shippingText] : [],
            };

            // Build variants
            const variants: ScrapedVariant[] = (productData.variants || []).map(
                (v: any) => ({
                    name: v.name,
                    options: v.options,
                }),
            );

            const scrapedProduct: ScrapedProduct = {
                productName: productData.productName,
                description: productData.description,
                shortDescription: productData.shortDescription,
                productPrice: productData.productPrice,
                offerPrice: productData.offerPrice,
                brandName: productData.brandName || productData.supplierName || '',
                images: productData.images as ScrapedImage[],
                placeOfOrigin: productData.locationText || 'China',
                productType: 'PHYSICAL',
                typeOfProduct: 'NEW',
                specifications: productData.specifications as ScrapedSpecification[],
                sourceUrl: url,
                sourcePlatform: 'Alibaba',
                inStock: true,
                rating: productData.rating,
                reviewCount: productData.reviewCount,
                variants,
                seller,
                shipping,
                originalLanguage: 'en',
                categoryPath: productData.categoryPath || '',
                metadata: {
                    scrapedAt: new Date().toISOString(),
                    sourceUrl: url,
                    moq: productData.moq,
                    priceRange: productData.priceRawText,
                    certifications: productData.certifications,
                    yearsOnPlatform: productData.yearsOnPlatform,
                    tradeAssurance: productData.tradeAssurance,
                },
            };

            this.logger.log(`Successfully scraped Alibaba product: ${scrapedProduct.productName}`);
            return scrapedProduct;
        } catch (error: any) {
            this.logger.error(
                `Error scraping Alibaba product: ${error.message}`,
                error.stack,
            );
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
