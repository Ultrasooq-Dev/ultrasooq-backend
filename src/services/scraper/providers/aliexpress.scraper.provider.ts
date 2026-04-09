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
 * Scraper provider for AliExpress.com (B2C retail platform)
 *
 * AliExpress features:
 * - SSR JSON data embedded in page source (window.__INIT_DATA__, window.runParams)
 * - Variant matrices (color x size x model)
 * - Mixed Chinese + English content
 * - Shipping varies by destination country
 */
export class AliExpressScraperProvider implements ScraperProvider {
    private readonly logger = new Logger(AliExpressScraperProvider.name);
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
                hostname === 'aliexpress.com' ||
                hostname === 'www.aliexpress.com' ||
                hostname.endsWith('.aliexpress.com')
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
            this.logger.log('Launching new browser instance for AliExpress');
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

        // Force English locale cookie to prevent Arabic redirect
        await page.setCookie(
            { name: 'aep_usuc_f', value: 'site=glo&c_tp=USD&region=US&b_locale=en_US', domain: '.aliexpress.com' },
            { name: 'intl_locale', value: 'en_US', domain: '.aliexpress.com' },
            { name: 'intl_common_forever', value: '', domain: '.aliexpress.com' },
            { name: 'xman_us_f', value: 'x_locale=en_US&x_l=0', domain: '.aliexpress.com' },
        );

        return page;
    }

    /**
     * Attempt to extract SSR JSON data from the page.
     * AliExpress often embeds product/search data in script tags.
     */
    private async extractSSRJson(page: Page): Promise<any | null> {
        try {
            const data = await page.evaluate(() => {
                // Common AliExpress SSR data variable names
                const windowKeys = [
                    '__INIT_DATA__',
                    'runParams',
                    '__NEXT_DATA__',
                    'pageComponent',
                ];

                for (const key of windowKeys) {
                    if ((window as any)[key]) {
                        return (window as any)[key];
                    }
                }

                // Fallback: parse script tags for JSON data
                const scripts = Array.from(document.querySelectorAll('script'));
                for (const script of scripts) {
                    const content = script.textContent || '';

                    // window.runParams = { ... }
                    if (content.includes('window.runParams')) {
                        const match = content.match(
                            /window\.runParams\s*=\s*(\{[\s\S]*?\});/,
                        );
                        if (match) {
                            try {
                                return JSON.parse(match[1]);
                            } catch {
                                // Malformed JSON
                            }
                        }
                    }

                    // window.__INIT_DATA__ = { ... }
                    if (content.includes('__INIT_DATA__')) {
                        const match = content.match(
                            /__INIT_DATA__\s*=\s*(\{[\s\S]*?\});/,
                        );
                        if (match) {
                            try {
                                return JSON.parse(match[1]);
                            } catch {
                                // Malformed JSON
                            }
                        }
                    }

                    // data: { ... } from productDetailComponent
                    if (content.includes('productDetailComponent')) {
                        const match = content.match(
                            /productDetailComponent\s*:\s*(\{[\s\S]*?\})\s*[,}]/,
                        );
                        if (match) {
                            try {
                                return JSON.parse(match[1]);
                            } catch {
                                // Malformed JSON
                            }
                        }
                    }
                }

                return null;
            });
            return data;
        } catch (error: any) {
            this.logger.warn(`SSR JSON extraction failed: ${error.message}`);
            return null;
        }
    }

    // ──────────────────────────────────────────────
    // Search scraping
    // ──────────────────────────────────────────────

    /**
     * Scrape search results from AliExpress
     */
    async scrapeSearch(url: string): Promise<ScrapedSearchResult> {
        this.logger.log(`Scraping AliExpress search results from: ${url}`);
        const page = await this.createPage();

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // AliExpress needs extra time for dynamic rendering
            await new Promise(resolve => setTimeout(resolve, 4000));

            // Try JSON-based extraction first
            const ssrData = await this.extractSSRJson(page);
            if (ssrData) {
                const jsonProducts = this.parseSearchResultsFromJson(ssrData);
                if (jsonProducts.length > 0) {
                    this.logger.log(
                        `Extracted ${jsonProducts.length} products from SSR JSON`,
                    );
                    return {
                        products: jsonProducts,
                        totalResults: jsonProducts.length,
                        currentPage: 1,
                        searchQuery: url,
                    };
                }
            }

            // Fallback to DOM extraction
            this.logger.log('SSR JSON extraction yielded no results, falling back to DOM');

            const selectors = [
                '.search-item-card-wrapper-gallery',
                '.manhattan--container',
                '.search-card-item',
                '[class*="SearchProductFeed"] a',
                '.product-snippet_ProductSnippet',
                '[class*="product-card"]',
            ];

            let selectorFound = false;
            for (const selector of selectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 6000 });
                    selectorFound = true;
                    this.logger.log(`Found AliExpress search results using: ${selector}`);
                    break;
                } catch {
                    this.logger.warn(`Selector not found: ${selector}`);
                }
            }

            if (!selectorFound) {
                this.logger.warn(
                    'No AliExpress search selectors found, attempting extraction anyway',
                );
            }

            const products: ScrapedProductSummary[] = await page.evaluate(() => {
                const results: ScrapedProductSummary[] = [];

                const containerSelectors = [
                    '.search-item-card-wrapper-gallery',
                    '.manhattan--container',
                    '.search-card-item',
                    '[class*="product-card"]',
                    '.product-snippet_ProductSnippet',
                ];

                let elements: NodeListOf<Element> | null = null;
                for (const sel of containerSelectors) {
                    elements = document.querySelectorAll(sel);
                    if (elements && elements.length > 0) break;
                }

                if (!elements || elements.length === 0) return results;

                elements.forEach(el => {
                    try {
                        // Title
                        const titleEl =
                            el.querySelector('h1') ||
                            el.querySelector('h3') ||
                            el.querySelector('[class*="title"] span') ||
                            el.querySelector('[class*="title"]') ||
                            el.querySelector('a[title]');
                        const productName =
                            titleEl?.getAttribute('title') ||
                            titleEl?.textContent?.trim() ||
                            '';

                        // URL
                        const linkEl =
                            el.querySelector('a[href*="/item/"]') ||
                            el.querySelector('a[href*="aliexpress.com"]') ||
                            el.querySelector('a');
                        let productUrl = linkEl?.getAttribute('href') || '';
                        if (productUrl && !productUrl.startsWith('http')) {
                            productUrl = 'https:' + productUrl;
                        }

                        // Price
                        const priceEl =
                            el.querySelector('[class*="price-current"]') ||
                            el.querySelector('[class*="price--current"]') ||
                            el.querySelector('.manhattan--price-sale') ||
                            el.querySelector('[class*="price"]');
                        const priceText = priceEl?.textContent?.trim() || '';
                        let productPrice = 0;
                        const priceMatch = priceText.match(/[\d,.]+/);
                        if (priceMatch) {
                            productPrice =
                                parseFloat(priceMatch[0].replace(/,/g, '')) || 0;
                        }

                        // Image
                        const imgEl =
                            el.querySelector('img[src*="alicdn"]') ||
                            el.querySelector('img[src]') ||
                            el.querySelector('img');
                        let image =
                            imgEl?.getAttribute('src') ||
                            imgEl?.getAttribute('data-src') ||
                            '';
                        if (image && !image.startsWith('http')) {
                            image = 'https:' + image;
                        }

                        // Rating
                        const ratingEl =
                            el.querySelector('[class*="evaluation"] span') ||
                            el.querySelector('[class*="star-score"]') ||
                            el.querySelector('[class*="rating"]');
                        const rating = ratingEl
                            ? parseFloat(ratingEl.textContent?.trim() || '0')
                            : 0;

                        // Orders count
                        const ordersEl =
                            el.querySelector('[class*="sale-value"]') ||
                            el.querySelector('[class*="trade-count"]') ||
                            el.querySelector('[class*="orders"]');
                        const ordersText = ordersEl?.textContent?.trim() || '';
                        const ordersMatch = ordersText.match(/([\d,.k+]+)/i);
                        let reviewCount = 0;
                        if (ordersMatch) {
                            let val = ordersMatch[1]
                                .toLowerCase()
                                .replace(/,/g, '')
                                .replace('+', '');
                            if (val.endsWith('k')) {
                                reviewCount =
                                    Math.round(parseFloat(val.replace('k', '')) * 1000) ||
                                    0;
                            } else {
                                reviewCount = parseInt(val, 10) || 0;
                            }
                        }

                        // Seller
                        const sellerEl =
                            el.querySelector('[class*="store-name"]') ||
                            el.querySelector('[class*="store"]');
                        const brandName = sellerEl?.textContent?.trim() || '';

                        // Shipping
                        const shippingEl =
                            el.querySelector('[class*="shipping"]') ||
                            el.querySelector('[class*="delivery"]');
                        const freeShipping =
                            shippingEl?.textContent
                                ?.toLowerCase()
                                .includes('free') || false;

                        if (productName && productUrl) {
                            results.push({
                                productName,
                                productUrl,
                                productPrice,
                                offerPrice: productPrice,
                                image,
                                rating,
                                reviewCount,
                                inStock: true,
                                brandName: brandName || undefined,
                            });
                        }
                    } catch {
                        // Skip malformed cards
                    }
                });

                return results;
            });

            const totalResults = await page.evaluate(() => {
                const countEl =
                    document.querySelector('[class*="result-count"]') ||
                    document.querySelector('[class*="search-count"]');
                const text = countEl?.textContent?.trim() || '';
                const match = text.match(/([\d,]+)/);
                return match ? parseInt(match[1].replace(/,/g, ''), 10) : 0;
            });

            this.logger.log(
                `Successfully scraped ${products.length} AliExpress products from DOM`,
            );

            return {
                products,
                totalResults,
                currentPage: 1,
                searchQuery: url,
            };
        } catch (error: any) {
            this.logger.error(
                `Error scraping AliExpress search: ${error.message}`,
                error.stack,
            );
            throw error;
        } finally {
            await page.close();
        }
    }

    /**
     * Parse search results from SSR JSON data
     */
    private parseSearchResultsFromJson(data: any): ScrapedProductSummary[] {
        const results: ScrapedProductSummary[] = [];
        try {
            // Navigate common SSR structures
            const items =
                data?.data?.root?.fields?.mods?.itemList?.content ||
                data?.mods?.itemList?.content ||
                data?.items ||
                data?.data?.items ||
                data?.productList ||
                [];

            for (const item of items) {
                try {
                    const productName =
                        item.title?.displayTitle ||
                        item.title?.seoTitle ||
                        item.title ||
                        item.productTitle ||
                        '';

                    let productUrl =
                        item.productDetailUrl ||
                        item.detailUrl ||
                        item.itemUrl ||
                        '';
                    if (productUrl && !productUrl.startsWith('http')) {
                        productUrl = 'https:' + productUrl;
                    }

                    const priceVal =
                        item.prices?.salePrice?.minPrice ||
                        item.prices?.salePrice?.formattedPrice ||
                        item.price?.current?.value ||
                        item.salePrice ||
                        0;
                    const productPrice =
                        typeof priceVal === 'string'
                            ? parseFloat(priceVal.replace(/[^0-9.]/g, '')) || 0
                            : parseFloat(priceVal) || 0;

                    let image =
                        item.image?.imgUrl || item.imageUrl || item.imgUrl || '';
                    if (image && !image.startsWith('http')) {
                        image = 'https:' + image;
                    }

                    const rating = parseFloat(item.evaluation?.starRating || item.starRating || '0') || 0;

                    const ordersRaw = item.trade?.tradeDesc || item.orders || item.totalSales || '';
                    const ordersMatch = String(ordersRaw).match(/([\d,.k+]+)/i);
                    let reviewCount = 0;
                    if (ordersMatch) {
                        let val = ordersMatch[1].toLowerCase().replace(/,/g, '').replace('+', '');
                        if (val.endsWith('k')) {
                            reviewCount = Math.round(parseFloat(val.replace('k', '')) * 1000) || 0;
                        } else {
                            reviewCount = parseInt(val, 10) || 0;
                        }
                    }

                    const brandName =
                        item.store?.storeName ||
                        item.sellerName ||
                        '';

                    if (productName && productUrl) {
                        results.push({
                            productName,
                            productUrl,
                            productPrice,
                            offerPrice: productPrice,
                            image,
                            rating,
                            reviewCount,
                            inStock: true,
                            brandName: brandName || undefined,
                        });
                    }
                } catch {
                    // Skip malformed item
                }
            }
        } catch (error: any) {
            this.logger.warn(`Failed to parse search JSON: ${error.message}`);
        }
        return results;
    }

    // ──────────────────────────────────────────────
    // Product detail scraping
    // ──────────────────────────────────────────────

    /**
     * Scrape product details from AliExpress
     */
    async scrapeProduct(url: string): Promise<ScrapedProduct> {
        this.logger.log(`Scraping AliExpress product from: ${url}`);
        const page = await this.createPage();

        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 40000 });

            // AliExpress pages are heavy — give dynamic content time
            await new Promise(resolve => setTimeout(resolve, 4000));

            // Attempt JSON-based extraction first (much more reliable)
            const ssrData = await this.extractSSRJson(page);
            if (ssrData) {
                const jsonProduct = this.parseProductFromJson(ssrData, url);
                if (jsonProduct && jsonProduct.productName) {
                    this.logger.log(
                        `Extracted product from SSR JSON: ${jsonProduct.productName}`,
                    );
                    return jsonProduct;
                }
            }

            // Fallback to DOM extraction
            this.logger.log('SSR JSON extraction yielded no product data, falling back to DOM');

            // Wait for a title to appear
            try {
                await page.waitForSelector(
                    '.product-title-text, h1, [class*="product-title"]',
                    { timeout: 10000 },
                );
            } catch {
                this.logger.warn('AliExpress product title selector not found within timeout');
            }

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
                    '.product-title-text',
                    'h1[data-pl="product-title"]',
                    'h1',
                    '[class*="product-title"]',
                ]);

                // ── Price ─────────────────────────────────
                const priceText = txt([
                    '.product-price-current',
                    '[class*="price--current"]',
                    '.uniform-banner-box-price',
                    '[class*="price-current"]',
                    '[class*="product-price"]',
                ]);
                let productPrice = 0;
                const priceMatch = priceText.match(/[\d,.]+/);
                if (priceMatch) {
                    productPrice =
                        parseFloat(priceMatch[0].replace(/,/g, '')) || 0;
                }

                // Original / compare-at price
                const origPriceText = txt([
                    '.product-price-original',
                    '[class*="price--original"]',
                    '[class*="price-original"]',
                    '[class*="del-price"]',
                ]);
                let offerPrice = 0;
                const origMatch = origPriceText.match(/[\d,.]+/);
                if (origMatch) {
                    offerPrice =
                        parseFloat(origMatch[0].replace(/,/g, '')) || 0;
                }
                if (offerPrice === 0) offerPrice = productPrice;

                // ── Description ───────────────────────────
                const description = txt([
                    '.product-description',
                    '[class*="product-desc"]',
                    '.detail-desc-decorate-richtext',
                    '#product-description',
                ]);
                const shortDescription = description.substring(0, 250);

                // ── Images ────────────────────────────────
                const images: any[] = [];
                const seenUrls = new Set<string>();
                const imageSelectors = [
                    '.image-view-magnifier-wrap img',
                    '.slider--img img',
                    '.pdp-info-right img',
                    '[class*="gallery"] img',
                    '.image-viewer img',
                    '.sku-image img',
                ];
                for (const sel of imageSelectors) {
                    document.querySelectorAll(sel).forEach(img => {
                        let src =
                            img.getAttribute('src') ||
                            img.getAttribute('data-src') ||
                            '';
                        if (src && !src.startsWith('http')) src = 'https:' + src;
                        // Remove size suffix for full-size
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

                // ── Rating ────────────────────────────────
                const ratingText = txt([
                    '.overview-rating-average',
                    '[class*="rating-value"]',
                    '[class*="star-score"]',
                ]);
                const rating = parseFloat(ratingText) || 0;

                // ── Review & Order counts ─────────────────
                const reviewText = txt([
                    '.product-reviewer-reviews',
                    '[class*="review-count"]',
                    '[class*="reviews"]',
                ]);
                const reviewMatch = reviewText.match(/([\d,]+)/);
                const reviewCount = reviewMatch
                    ? parseInt(reviewMatch[1].replace(/,/g, ''), 10)
                    : 0;

                const ordersText = txt([
                    '.product-reviewer-sold',
                    '[class*="trade-count"]',
                    '[class*="orders"]',
                ]);
                const ordersMatch = ordersText.match(/([\d,.k+]+)/i);
                let totalSales = 0;
                if (ordersMatch) {
                    let val = ordersMatch[1].toLowerCase().replace(/,/g, '').replace('+', '');
                    if (val.endsWith('k')) {
                        totalSales = Math.round(parseFloat(val.replace('k', '')) * 1000) || 0;
                    } else {
                        totalSales = parseInt(val, 10) || 0;
                    }
                }

                // ── Variants (SKU properties) ─────────────
                const variants: any[] = [];
                document
                    .querySelectorAll(
                        '.sku-property, [class*="sku-prop"], .product-sku-item',
                    )
                    .forEach(propGroup => {
                        const nameEl =
                            propGroup.querySelector(
                                '.sku-title, [class*="sku-title"], .sku-property-text',
                            );
                        const name = nameEl?.textContent?.trim().replace(/:$/, '') || '';
                        const options: string[] = [];
                        propGroup
                            .querySelectorAll(
                                '.sku-property-item, [class*="sku-value"], .sku-name, img[title]',
                            )
                            .forEach(opt => {
                                const v =
                                    opt.getAttribute('title') ||
                                    opt.textContent?.trim();
                                if (v) options.push(v);
                            });
                        if (name && options.length > 0) {
                            variants.push({ name, options });
                        }
                    });

                // ── Specifications ────────────────────────
                const specifications: any[] = [];
                const specSelectors = [
                    '.specification-keys + .specification-values',
                    '.product-specs-list li',
                    '[class*="specification"] li',
                    '.product-property-list .product-property-item',
                ];
                // Paired key/value approach
                const specKeys = document.querySelectorAll(
                    '.specification-keys li, .attr-key, [class*="spec-key"]',
                );
                const specValues = document.querySelectorAll(
                    '.specification-values li, .attr-value, [class*="spec-value"]',
                );
                for (let i = 0; i < specKeys.length && i < specValues.length; i++) {
                    const label = specKeys[i].textContent?.trim() || '';
                    const value = specValues[i].textContent?.trim() || '';
                    if (label && value) {
                        specifications.push({ label, value });
                    }
                }
                // Alternative: single-row specs
                if (specifications.length === 0) {
                    document
                        .querySelectorAll(
                            '.product-property-item, [class*="specification-item"]',
                        )
                        .forEach(item => {
                            const parts = (item.textContent?.trim() || '').split(':');
                            if (parts.length >= 2) {
                                specifications.push({
                                    label: parts[0].trim(),
                                    value: parts.slice(1).join(':').trim(),
                                });
                            }
                        });
                }

                // ── Seller ────────────────────────────────
                const storeName = txt([
                    '.shop-name a',
                    '[class*="store-name"]',
                    '.seller-name',
                ]);
                const storeUrl =
                    (
                        document.querySelector('.shop-name a') ||
                        document.querySelector('[class*="store-name"] a') ||
                        document.querySelector('.seller-name a')
                    )?.getAttribute('href') || '';

                const storeRatingText = txt([
                    '.shop-review-score',
                    '[class*="store-rating"]',
                    '[class*="positive-rate"]',
                ]);
                const storeRating = parseFloat(storeRatingText) || 0;

                const followersText = txt([
                    '.shop-follower-count',
                    '[class*="follower"]',
                ]);
                const followersMatch = followersText.match(/([\d,.k+]+)/i);
                let followers = 0;
                if (followersMatch) {
                    let val = followersMatch[1].toLowerCase().replace(/,/g, '').replace('+', '');
                    if (val.endsWith('k')) {
                        followers = Math.round(parseFloat(val.replace('k', '')) * 1000) || 0;
                    } else {
                        followers = parseInt(val, 10) || 0;
                    }
                }

                // ── Shipping ──────────────────────────────
                const shippingText = txt([
                    '.product-shipping-info',
                    '[class*="shipping-value"]',
                    '[class*="delivery"]',
                    '.dynamic-shipping-line',
                ]);
                const freeShipping =
                    shippingText.toLowerCase().includes('free');
                const shippingCostMatch = shippingText.match(/\$\s*([\d,.]+)/);
                const shippingCost = shippingCostMatch
                    ? parseFloat(shippingCostMatch[1].replace(/,/g, ''))
                    : 0;
                const deliveryDaysMatch = shippingText.match(/(\d+)\s*days?/i);
                const estimatedDays = deliveryDaysMatch
                    ? parseInt(deliveryDaysMatch[1], 10)
                    : 0;
                const shippingFrom = txt([
                    '[class*="ship-from"]',
                    '.product-shipping-origin',
                ]);

                // ── Brand ─────────────────────────────────
                const brandName = txt([
                    '.product-brand',
                    '[class*="brand"]',
                    '.specification-keys li:first-child + .specification-values li:first-child',
                ]);

                // ── Category path ─────────────────────────
                const breadcrumbs: string[] = [];
                document
                    .querySelectorAll(
                        '.bread-crumb a, [class*="breadcrumb"] a, .parent-category a',
                    )
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
                    totalSales,
                    specifications,
                    variants,
                    storeName,
                    storeUrl,
                    storeRating,
                    followers,
                    shippingText,
                    freeShipping,
                    shippingCost,
                    estimatedDays,
                    shippingFrom,
                    categoryPath,
                };
            });

            return this.buildScrapedProduct(productData, url);
        } catch (error: any) {
            this.logger.error(
                `Error scraping AliExpress product: ${error.message}`,
                error.stack,
            );
            throw error;
        } finally {
            await page.close();
        }
    }

    /**
     * Parse product data from SSR JSON
     */
    private parseProductFromJson(
        data: any,
        url: string,
    ): ScrapedProduct | null {
        try {
            // Navigate common SSR JSON structures
            const pageData =
                data?.data?.root?.fields ||
                data?.data ||
                data?.pageProps ||
                data?.props?.pageProps ||
                data;

            // Product title
            const titleInfo =
                pageData?.productInfoComponent?.subject ||
                pageData?.titleModule?.subject ||
                pageData?.product?.title ||
                '';
            if (!titleInfo) return null;

            // Price
            const priceModule =
                pageData?.priceComponent ||
                pageData?.priceModule ||
                pageData?.product?.prices ||
                {};
            const actPrice =
                priceModule?.actSkuCalPrice ||
                priceModule?.actSkuMultiCurrencyCalPrice ||
                priceModule?.formatedActivityPrice ||
                priceModule?.minPrice ||
                0;
            const origPrice =
                priceModule?.maxPrice ||
                priceModule?.formatedPrice ||
                0;
            const productPrice =
                typeof actPrice === 'string'
                    ? parseFloat(actPrice.replace(/[^0-9.]/g, '')) || 0
                    : parseFloat(actPrice) || 0;
            const offerPrice =
                typeof origPrice === 'string'
                    ? parseFloat(origPrice.replace(/[^0-9.]/g, '')) || 0
                    : productPrice;

            // Images
            const imageModule =
                pageData?.imageComponent ||
                pageData?.imageModule ||
                pageData?.product?.images ||
                {};
            const imageList: string[] =
                imageModule?.imagePathList || imageModule?.images || [];
            const images: ScrapedImage[] = imageList.map((img: string, i: number) => ({
                url: img.startsWith('http') ? img : 'https:' + img,
                imageName: `image_${i + 1}`,
                isPrimary: i === 0,
            }));

            // Variants / SKU
            const skuModule =
                pageData?.skuComponent ||
                pageData?.skuModule ||
                pageData?.product?.skuInfo ||
                {};
            const skuProperties = skuModule?.productSKUPropertyList || [];
            const variants: ScrapedVariant[] = skuProperties.map((prop: any) => ({
                name: prop.skuPropertyName || '',
                options: (prop.skuPropertyValues || []).map(
                    (v: any) => v.propertyValueDisplayName || v.skuPropertyValueTips || '',
                ),
            }));

            // Seller
            const storeModule =
                pageData?.storeModule ||
                pageData?.storeHeaderComponent ||
                pageData?.store ||
                {};
            const seller: ScrapedSeller = {
                name: storeModule?.storeName || storeModule?.companyName || '',
                storeName: storeModule?.storeName || '',
                storeUrl: storeModule?.storeURL
                    ? storeModule.storeURL.startsWith('http')
                        ? storeModule.storeURL
                        : 'https:' + storeModule.storeURL
                    : '',
                rating: parseFloat(storeModule?.positiveRate || '0') || undefined,
                totalSales: storeModule?.followCount || undefined,
            };

            // Specifications
            const specModule =
                pageData?.specsModule ||
                pageData?.productPropComponent ||
                pageData?.product?.specs ||
                {};
            const specList = specModule?.props || specModule?.specifications || [];
            const specifications: ScrapedSpecification[] = specList.map(
                (s: any) => ({
                    label: s.attrName || s.name || '',
                    value: s.attrValue || s.value || '',
                }),
            );

            // Shipping
            const shippingModule =
                pageData?.shippingComponent ||
                pageData?.webGeneralFreightCalculateComponent ||
                {};
            const shipping: ScrapedShipping = {
                freeShipping: !!shippingModule?.freeShipping,
                shippingFrom: shippingModule?.shipFrom || 'China',
                estimatedDays: shippingModule?.deliveryDayMax || undefined,
                shippingCost: shippingModule?.freightAmount
                    ? parseFloat(shippingModule.freightAmount) || undefined
                    : undefined,
            };

            // Feedback
            const feedbackModule =
                pageData?.feedbackComponent ||
                pageData?.titleModule ||
                {};
            const rating =
                parseFloat(feedbackModule?.averageStar || feedbackModule?.feedbackRating?.averageStar || '0') || 0;
            const reviewCount =
                parseInt(feedbackModule?.totalValidNum || feedbackModule?.tradeCount || '0', 10) || 0;

            // Description
            const descModule =
                pageData?.descriptionComponent ||
                pageData?.descriptionModule ||
                {};
            const description = descModule?.descriptionUrl || descModule?.description || '';

            // Brand
            const brandName =
                specifications.find(
                    s => s.label.toLowerCase() === 'brand name' || s.label.toLowerCase() === 'brand',
                )?.value || '';

            // Category
            const categoryPath =
                pageData?.crossLinkModule?.breadCrumbPathList
                    ?.map((c: any) => c.name)
                    .join(' > ') || '';

            const scrapedProduct: ScrapedProduct = {
                productName: titleInfo,
                description,
                shortDescription: description.substring(0, 250),
                productPrice,
                offerPrice,
                brandName,
                images,
                placeOfOrigin: 'China',
                productType: 'PHYSICAL',
                typeOfProduct: 'NEW',
                specifications,
                sourceUrl: url,
                sourcePlatform: 'AliExpress',
                inStock: true,
                rating,
                reviewCount,
                variants,
                seller,
                shipping,
                originalLanguage: 'en',
                categoryPath,
                metadata: {
                    scrapedAt: new Date().toISOString(),
                    sourceUrl: url,
                    extractedVia: 'ssr-json',
                },
            };

            return scrapedProduct;
        } catch (error: any) {
            this.logger.warn(`Failed to parse product JSON: ${error.message}`);
            return null;
        }
    }

    /**
     * Build a ScrapedProduct from DOM-extracted data
     */
    private buildScrapedProduct(data: any, url: string): ScrapedProduct {
        if (data.productPrice === 0) {
            this.logger.warn(
                `Price extraction failed for AliExpress product: ${data.productName || 'Unknown'}`,
            );
        } else {
            this.logger.log(
                `Price extracted: $${data.productPrice} (original: $${data.offerPrice})`,
            );
        }

        const seller: ScrapedSeller = {
            name: data.storeName || '',
            storeName: data.storeName || '',
            storeUrl: data.storeUrl
                ? data.storeUrl.startsWith('http')
                    ? data.storeUrl
                    : 'https:' + data.storeUrl
                : '',
            rating: data.storeRating || undefined,
            totalSales: data.totalSales || undefined,
        };

        const shipping: ScrapedShipping = {
            freeShipping: data.freeShipping || false,
            shippingCost: data.shippingCost || undefined,
            estimatedDays: data.estimatedDays || undefined,
            shippingFrom: data.shippingFrom || 'China',
        };

        const variants: ScrapedVariant[] = (data.variants || []).map(
            (v: any) => ({
                name: v.name,
                options: v.options,
            }),
        );

        const scrapedProduct: ScrapedProduct = {
            productName: data.productName,
            description: data.description,
            shortDescription: data.shortDescription,
            productPrice: data.productPrice,
            offerPrice: data.offerPrice,
            brandName: data.brandName || '',
            images: data.images as ScrapedImage[],
            placeOfOrigin: 'China',
            productType: 'PHYSICAL',
            typeOfProduct: 'NEW',
            specifications: data.specifications as ScrapedSpecification[],
            sourceUrl: url,
            sourcePlatform: 'AliExpress',
            inStock: true,
            rating: data.rating,
            reviewCount: data.reviewCount,
            variants,
            seller,
            shipping,
            originalLanguage: 'en',
            categoryPath: data.categoryPath || '',
            metadata: {
                scrapedAt: new Date().toISOString(),
                sourceUrl: url,
                extractedVia: 'dom',
                followers: data.followers,
                totalSales: data.totalSales,
            },
        };

        this.logger.log(
            `Successfully scraped AliExpress product: ${scrapedProduct.productName}`,
        );
        return scrapedProduct;
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
