import { Logger } from '@nestjs/common';
import puppeteer, { Browser, Page } from 'puppeteer';
import { ScraperProvider } from '../../scraper.service';
import {
    ScrapedProduct,
    ScrapedSearchResult,
    ScrapedProductSummary,
    ScrapedImage,
    ScrapedSpecification,
} from '../../interfaces/scraped-product.interface';
import {
    Vehicle,
    AutoPartsScraperConfig,
    AUTO_PARTS_PLATFORMS,
} from '../../interfaces/auto-parts.interface';

// ---------------------------------------------------------------------------
// Shared anti-detection: user-agent & viewport rotation
// ---------------------------------------------------------------------------

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

const VIEWPORTS = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
];

function randomItem<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// Shared base class for smaller auto parts providers
// ---------------------------------------------------------------------------

abstract class BaseAutoPartsProvider implements ScraperProvider {
    protected abstract readonly logger: Logger;
    protected abstract readonly config: AutoPartsScraperConfig;
    protected abstract readonly hostPattern: RegExp;
    protected browser: Browser | null = null;

    abstract canScrape(url: string): boolean;
    abstract scrapeSearch(url: string): Promise<ScrapedSearchResult>;
    abstract scrapeProduct(url: string): Promise<ScrapedProduct>;

    // ------------------------------------------------------------------
    // Browser management
    // ------------------------------------------------------------------

    protected async getBrowser(): Promise<Browser> {
        if (this.browser && this.browser.connected) return this.browser;

        const useBrowserbase = process.env.USE_BROWSERBASE === 'true';

        if (useBrowserbase && process.env.BROWSERBASE_WS_URL) {
            this.logger.log('Connecting to Browserbase remote browser');
            this.browser = await puppeteer.connect({
                browserWSEndpoint: process.env.BROWSERBASE_WS_URL,
            });
        } else {
            this.logger.log('Launching local Puppeteer browser');
            this.browser = await puppeteer.launch({
                headless: 'shell',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--disable-features=IsolateOrigins',
                    '--disable-site-isolation-trials',
                ],
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            });
        }

        return this.browser;
    }

    protected async createPage(lang: string = 'en-US,en;q=0.9'): Promise<Page> {
        const browser = await this.getBrowser();
        const page = await browser.newPage();

        const ua = randomItem(USER_AGENTS);
        const vp = randomItem(VIEWPORTS);

        await page.setUserAgent(ua);
        await page.setViewport(vp);
        await page.setExtraHTTPHeaders({
            'Accept-Language': lang,
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
        });

        // Hide webdriver flags
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            (window as any).chrome = { runtime: {} };
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        });

        return page;
    }

    // ------------------------------------------------------------------
    // Shared utilities
    // ------------------------------------------------------------------

    protected parsePrice(text: string | null | undefined): number {
        if (!text) return 0;
        const cleaned = text.replace(/[^\d.,]/g, '');
        if (/\d+\.\d{3},\d{1,2}$/.test(cleaned)) {
            return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
        }
        return parseFloat(cleaned.replace(/,/g, '')) || 0;
    }

    protected matchHost(url: string): boolean {
        try {
            let candidate = url;
            if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(candidate)) {
                candidate = 'http://' + candidate;
            }
            const hostname = new URL(candidate).hostname.toLowerCase();
            return this.hostPattern.test(hostname);
        } catch {
            return false;
        }
    }

    protected async extractTableParts(
        page: Page,
        baseUrl: string,
        brand: string,
    ): Promise<ScrapedProductSummary[]> {
        try {
            return await page.evaluate(
                (base: string, brandLabel: string) => {
                    const items: ScrapedProductSummary[] = [];
                    const tables = document.querySelectorAll('table');

                    for (const table of tables) {
                        const rows = table.querySelectorAll('tr');
                        if (rows.length < 2) continue;

                        rows.forEach((row, idx) => {
                            if (idx === 0) return;
                            try {
                                const cells = row.querySelectorAll('td');
                                if (cells.length < 2) return;

                                const partNumber = cells[0]?.textContent?.trim() || cells[1]?.textContent?.trim() || '';
                                const description = cells.length >= 3
                                    ? (cells[2]?.textContent?.trim() || cells[1]?.textContent?.trim() || '')
                                    : (cells[1]?.textContent?.trim() || '');

                                if (!partNumber || partNumber.length < 2) return;

                                const priceEl = row.querySelector('.price, td:last-child');
                                const priceText = priceEl?.textContent?.trim() || '';
                                const price = parseFloat(priceText.replace(/[^\d.]/g, '')) || 0;

                                const linkEl = row.querySelector('a[href]');
                                const href = linkEl?.getAttribute('href') || '';
                                const productUrl = href.startsWith('http') ? href : `${base}${href}`;

                                items.push({
                                    productName: `${partNumber} — ${description}`,
                                    productUrl,
                                    productPrice: price,
                                    offerPrice: price,
                                    inStock: undefined,
                                    brandName: brandLabel || 'OEM',
                                });
                            } catch { /* skip */ }
                        });

                        if (items.length > 0) break;
                    }

                    return items;
                },
                baseUrl,
                brand,
            );
        } catch (err) {
            this.logger.warn('Failed to extract table parts');
            return [];
        }
    }

    protected async extractBasicPartDetail(
        page: Page,
        baseUrl: string,
    ): Promise<{
        partNumber: string; description: string;
        price: number; currency: string;
        diagramUrl?: string; images: ScrapedImage[];
        specifications: ScrapedSpecification[];
        vehicles: Vehicle[];
    }> {
        try {
            const raw = await page.evaluate((base: string) => {
                // Part number
                const pnSelectors = [
                    '.part-number', '.oem-number', '#partNumber', '.sku',
                    '[data-part-number]', 'h1 .number', '.product-sku',
                ];
                let partNumber = '';
                for (const sel of pnSelectors) {
                    const el = document.querySelector(sel);
                    if (el?.textContent?.trim()) {
                        partNumber = el.textContent.trim().replace(/^(Part\s*#?:?\s*|OEM\s*#?:?\s*)/i, '');
                        break;
                    }
                }

                // Description
                const descSelectors = ['h1', '.product-title', '.part-name', '.product-name'];
                let description = '';
                for (const sel of descSelectors) {
                    const el = document.querySelector(sel);
                    if (el?.textContent?.trim()) {
                        description = el.textContent.trim();
                        break;
                    }
                }

                // Price
                const priceEl = document.querySelector('.price, .product-price, .part-price, .current-price');
                const priceText = priceEl?.textContent?.trim() || '';

                // Images
                const images: Array<{ url: string; name: string }> = [];
                document.querySelectorAll(
                    '.product-image img, .part-image img, .gallery img, .diagram-image img, img[src*="part"], img[src*="diagram"]'
                ).forEach((img, idx) => {
                    const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
                    if (src) {
                        images.push({
                            url: src.startsWith('http') ? src : `${base}${src}`,
                            name: img.getAttribute('alt') || `part-image-${idx}`,
                        });
                    }
                });

                // Diagram URL
                const diagramImg = document.querySelector('img[usemap], img.diagram, img[src*="diagram"]');
                const diagramUrl = diagramImg?.getAttribute('src') || '';

                // Specifications
                const specs: Array<{ label: string; value: string }> = [];
                document.querySelectorAll('.specifications tr, .spec-row, .product-specs dt').forEach(row => {
                    const label = row.querySelector('th, dt, .spec-label, td:first-child')?.textContent?.trim() || '';
                    const value = row.querySelector('td, dd, .spec-value, td:last-child')?.textContent?.trim() || '';
                    if (label && value && label !== value) specs.push({ label, value });
                });

                // Vehicles — try compatibility table
                const vehicles: Array<{ make: string; model: string; year?: number }> = [];
                document.querySelectorAll('.compatibility tr, .fitment tr, .vehicle-list li').forEach(row => {
                    const cells = row.querySelectorAll('td, span');
                    if (cells.length >= 2) {
                        const v: { make: string; model: string; year?: number } = {
                            make: cells[0]?.textContent?.trim() || '',
                            model: cells[1]?.textContent?.trim() || '',
                        };
                        if (cells.length >= 3) {
                            const ym = cells[2]?.textContent?.match(/(\d{4})/);
                            if (ym) v.year = parseInt(ym[1], 10);
                        }
                        if (v.make) vehicles.push(v);
                    }
                });

                return {
                    partNumber,
                    description,
                    priceText,
                    diagramUrl: diagramUrl ? (diagramUrl.startsWith('http') ? diagramUrl : `${base}${diagramUrl}`) : '',
                    images,
                    specs,
                    vehicles,
                };
            }, baseUrl);

            return {
                partNumber: raw.partNumber,
                description: raw.description,
                price: this.parsePrice(raw.priceText),
                currency: raw.priceText.includes('$') ? 'USD' : raw.priceText.includes('\u00a5') ? 'JPY' : 'USD',
                diagramUrl: raw.diagramUrl || undefined,
                images: raw.images.map((img, i) => ({
                    url: img.url,
                    imageName: img.name,
                    isPrimary: i === 0,
                })),
                specifications: raw.specs,
                vehicles: raw.vehicles as Vehicle[],
            };
        } catch (err) {
            this.logger.warn('Failed to extract basic part detail');
            return {
                partNumber: '', description: '', price: 0, currency: 'USD',
                images: [], specifications: [], vehicles: [],
            };
        }
    }
}


// ===========================================================================
// 1. YoshiPartsProvider — Japanese car parts (yoshiparts.com)
// ===========================================================================

/**
 * Scraper for yoshiparts.com — Japanese vehicle OEM parts catalog.
 *
 * Features:
 * - Japanese car focus (Toyota, Honda, Nissan, Mazda, Subaru, etc.)
 * - Parts diagrams with position markers
 * - OEM pricing in USD/JPY
 * - Year/Make/Model navigation
 */
export class YoshiPartsProvider extends BaseAutoPartsProvider {
    protected readonly logger = new Logger(YoshiPartsProvider.name);
    protected readonly config: AutoPartsScraperConfig = AUTO_PARTS_PLATFORMS.yoshiparts;
    protected readonly hostPattern = /^(www\.)?yoshiparts\.com$/;

    canScrape(url: string): boolean {
        return this.matchHost(url);
    }

    async scrapeSearch(url: string): Promise<ScrapedSearchResult> {
        this.logger.log(`[scrapeSearch] YoshiParts url=${url}`);
        const page = await this.createPage('en-US,en;q=0.9,ja;q=0.8');

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Wait for content
            const selectors = [
                '.parts-list', '.search-results', 'table.parts',
                '.catalog-parts', '#parts-container',
            ];
            for (const sel of selectors) {
                try { await page.waitForSelector(sel, { timeout: 5000 }); break; } catch { /* next */ }
            }

            await new Promise(r => setTimeout(r, 1500));

            const products = await this.extractTableParts(page, this.config.baseUrl, 'Japanese OEM');

            // Also try card-based layout
            if (products.length === 0) {
                const cardProducts = await page.evaluate((base: string) => {
                    const items: ScrapedProductSummary[] = [];
                    document.querySelectorAll('.part-card, .product-card, .catalog-item').forEach(card => {
                        try {
                            const nameEl = card.querySelector('.part-name, .product-name, h3, h4');
                            const linkEl = card.querySelector('a[href]');
                            const priceEl = card.querySelector('.price, .part-price');
                            const imgEl = card.querySelector('img');

                            const name = nameEl?.textContent?.trim() || '';
                            const href = linkEl?.getAttribute('href') || '';
                            const price = parseFloat(priceEl?.textContent?.replace(/[^\d.]/g, '') || '') || 0;
                            const image = imgEl?.getAttribute('src') || '';

                            if (name) {
                                items.push({
                                    productName: name,
                                    productUrl: href.startsWith('http') ? href : `${base}${href}`,
                                    productPrice: price,
                                    offerPrice: price,
                                    image: image.startsWith('http') ? image : (image ? `${base}${image}` : ''),
                                    brandName: 'Japanese OEM',
                                });
                            }
                        } catch { /* skip */ }
                    });
                    return items;
                }, this.config.baseUrl);
                products.push(...cardProducts);
            }

            this.logger.log(`[scrapeSearch] Found ${products.length} parts from YoshiParts`);

            return {
                products,
                totalResults: products.length,
                currentPage: 1,
                searchQuery: url,
            };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(`[scrapeSearch] YoshiParts failed: ${msg}`);
            throw new Error(`YoshiParts search scrape failed: ${msg}`);
        } finally {
            await page.close().catch(() => {});
        }
    }

    async scrapeProduct(url: string): Promise<ScrapedProduct> {
        this.logger.log(`[scrapeProduct] YoshiParts url=${url}`);
        const page = await this.createPage('en-US,en;q=0.9,ja;q=0.8');

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise(r => setTimeout(r, 1500));

            const detail = await this.extractBasicPartDetail(page, this.config.baseUrl);

            return {
                productName: detail.description || `Part ${detail.partNumber}`,
                description: `Japanese OEM Part ${detail.partNumber}. ${detail.description || ''}`,
                shortDescription: `${detail.partNumber} — ${detail.description || 'OEM Part'}`,
                productPrice: detail.price,
                offerPrice: detail.price,
                brandName: 'Japanese OEM Genuine',
                images: detail.images,
                specifications: detail.specifications,
                sourceUrl: url,
                sourcePlatform: 'yoshiparts',
                productType: 'PHYSICAL',
                typeOfProduct: 'NEW',
                tags: ['oem', 'genuine-parts', 'auto-parts', 'japanese'],
                metadata: {
                    partNumber: detail.partNumber,
                    oem: true,
                    isGenuine: true,
                    vehicles: detail.vehicles,
                    diagramUrl: detail.diagramUrl,
                    category: detail.specifications.find(s => s.label === 'Category')?.value || '',
                    currency: detail.currency,
                    platform: this.config.platform,
                },
            };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(`[scrapeProduct] YoshiParts failed: ${msg}`);
            throw new Error(`YoshiParts product scrape failed: ${msg}`);
        } finally {
            await page.close().catch(() => {});
        }
    }
}


// ===========================================================================
// 2. PartsNextProvider — OEM parts marketplace (partsnext.com)
// ===========================================================================

/**
 * Scraper for partsnext.com — OEM parts marketplace.
 *
 * Features:
 * - Multi-brand OEM parts marketplace
 * - Year/Make/Model navigation
 * - OEM pricing with dealer discounts
 * - Parts diagrams available
 */
export class PartsNextProvider extends BaseAutoPartsProvider {
    protected readonly logger = new Logger(PartsNextProvider.name);
    protected readonly config: AutoPartsScraperConfig = AUTO_PARTS_PLATFORMS.partsnext;
    protected readonly hostPattern = /^(www\.)?partsnext\.com$/;

    canScrape(url: string): boolean {
        return this.matchHost(url);
    }

    async scrapeSearch(url: string): Promise<ScrapedSearchResult> {
        this.logger.log(`[scrapeSearch] PartsNext url=${url}`);
        const page = await this.createPage();

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            const selectors = [
                '.parts-list', '.search-results', '.product-grid',
                'table.parts-table', '#catalog-results',
            ];
            for (const sel of selectors) {
                try { await page.waitForSelector(sel, { timeout: 5000 }); break; } catch { /* next */ }
            }

            await new Promise(r => setTimeout(r, 1500));

            const baseUrl = this.config.baseUrl;

            // Try grid/card layout first (more modern marketplace pattern)
            let products: ScrapedProductSummary[] = await page.evaluate((base: string) => {
                const items: ScrapedProductSummary[] = [];

                document.querySelectorAll(
                    '.product-card, .part-card, .catalog-item, .search-result-item'
                ).forEach(card => {
                    try {
                        const nameEl = card.querySelector('.product-name, .part-name, h3, h4, .title');
                        const linkEl = card.querySelector('a[href]');
                        const priceEl = card.querySelector('.price, .product-price, .part-price');
                        const imgEl = card.querySelector('img');
                        const partNumEl = card.querySelector('.part-number, .sku, .oem-number');

                        const name = nameEl?.textContent?.trim() || '';
                        const partNum = partNumEl?.textContent?.trim() || '';
                        const href = linkEl?.getAttribute('href') || '';
                        const priceText = priceEl?.textContent?.trim() || '';
                        const price = parseFloat(priceText.replace(/[^\d.]/g, '')) || 0;
                        const image = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || '';

                        if (name || partNum) {
                            items.push({
                                productName: partNum ? `${partNum} — ${name}` : name,
                                productUrl: href.startsWith('http') ? href : `${base}${href}`,
                                productPrice: price,
                                offerPrice: price,
                                image: image.startsWith('http') ? image : (image ? `${base}${image}` : ''),
                                brandName: 'OEM',
                            });
                        }
                    } catch { /* skip */ }
                });

                return items;
            }, baseUrl);

            // Fallback to table extraction
            if (products.length === 0) {
                products = await this.extractTableParts(page, baseUrl, 'OEM');
            }

            this.logger.log(`[scrapeSearch] Found ${products.length} parts from PartsNext`);

            return {
                products,
                totalResults: products.length,
                currentPage: 1,
                searchQuery: url,
            };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(`[scrapeSearch] PartsNext failed: ${msg}`);
            throw new Error(`PartsNext search scrape failed: ${msg}`);
        } finally {
            await page.close().catch(() => {});
        }
    }

    async scrapeProduct(url: string): Promise<ScrapedProduct> {
        this.logger.log(`[scrapeProduct] PartsNext url=${url}`);
        const page = await this.createPage();

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise(r => setTimeout(r, 1500));

            const detail = await this.extractBasicPartDetail(page, this.config.baseUrl);

            // Try to extract brand name from page
            const brand = await page.evaluate(() => {
                const el = document.querySelector('.brand, .manufacturer, .product-brand, .make-name');
                return el?.textContent?.trim() || '';
            });

            // Extract discount info if available
            const discountInfo = await page.evaluate(() => {
                const msrpEl = document.querySelector('.msrp, .list-price, .original-price, .was-price');
                const discountEl = document.querySelector('.discount, .savings, .you-save');
                return {
                    msrp: msrpEl?.textContent?.trim() || '',
                    discount: discountEl?.textContent?.trim() || '',
                };
            });

            const msrp = this.parsePrice(discountInfo.msrp);

            return {
                productName: detail.description || `Part ${detail.partNumber}`,
                description: `OEM Part ${detail.partNumber}. ${detail.description || ''} — ${brand || 'Multi-brand'} genuine part.`,
                shortDescription: `${detail.partNumber} — ${detail.description || 'OEM Part'}`,
                productPrice: msrp || detail.price,
                offerPrice: detail.price,
                brandName: brand || 'OEM Genuine',
                images: detail.images,
                specifications: detail.specifications,
                sourceUrl: url,
                sourcePlatform: 'partsnext',
                productType: 'PHYSICAL',
                typeOfProduct: 'NEW',
                tags: ['oem', 'genuine-parts', 'auto-parts', 'marketplace'],
                metadata: {
                    partNumber: detail.partNumber,
                    oem: true,
                    isGenuine: true,
                    vehicles: detail.vehicles,
                    diagramUrl: detail.diagramUrl,
                    category: detail.specifications.find(s => s.label === 'Category')?.value || '',
                    currency: detail.currency,
                    msrp,
                    discount: discountInfo.discount,
                    platform: this.config.platform,
                },
            };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(`[scrapeProduct] PartsNext failed: ${msg}`);
            throw new Error(`PartsNext product scrape failed: ${msg}`);
        } finally {
            await page.close().catch(() => {});
        }
    }
}


// ===========================================================================
// 3. ToyotaPartsProvider — Toyota dealer parts
// ===========================================================================

/**
 * Scraper for Toyota dealer parts sites.
 *
 * Features:
 * - Toyota/Lexus OEM parts with dealer pricing
 * - Parts diagrams with assembly views
 * - Year/Make/Model navigation
 * - Low anti-detection
 */
export class ToyotaPartsProvider extends BaseAutoPartsProvider {
    protected readonly logger = new Logger(ToyotaPartsProvider.name);
    protected readonly config: AutoPartsScraperConfig = AUTO_PARTS_PLATFORMS.toyotaparts;
    protected readonly hostPattern = /^(www\.)?toyotaparts\./;

    canScrape(url: string): boolean {
        try {
            let candidate = url;
            if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(candidate)) {
                candidate = 'http://' + candidate;
            }
            const hostname = new URL(candidate).hostname.toLowerCase();
            // Match any toyotaparts.* subdomain (different dealers)
            return /toyotaparts\./.test(hostname) || /toyota.*parts/.test(hostname);
        } catch {
            return false;
        }
    }

    async scrapeSearch(url: string): Promise<ScrapedSearchResult> {
        this.logger.log(`[scrapeSearch] ToyotaParts url=${url}`);
        const page = await this.createPage();

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            const selectors = [
                '.parts-list', '.search-results', '.product-list',
                'table.parts-table', '.catalog-results',
                '.diagram-parts', '#parts-container',
            ];
            for (const sel of selectors) {
                try { await page.waitForSelector(sel, { timeout: 5000 }); break; } catch { /* next */ }
            }

            await new Promise(r => setTimeout(r, 1500));

            const baseUrl = new URL(url).origin;

            // Toyota dealer sites often use product cards
            let products: ScrapedProductSummary[] = await page.evaluate((base: string) => {
                const items: ScrapedProductSummary[] = [];

                // Card layout
                document.querySelectorAll(
                    '.product-card, .part-item, .catalog-item, .parts-list-item'
                ).forEach(card => {
                    try {
                        const nameEl = card.querySelector('.product-name, .part-name, h3, h4, .title, .description');
                        const linkEl = card.querySelector('a[href]');
                        const priceEl = card.querySelector('.price, .product-price, .retail-price');
                        const imgEl = card.querySelector('img');
                        const partNumEl = card.querySelector('.part-number, .sku, .oem-number');

                        const name = nameEl?.textContent?.trim() || '';
                        const partNum = partNumEl?.textContent?.trim() || '';
                        const href = linkEl?.getAttribute('href') || '';
                        const priceText = priceEl?.textContent?.trim() || '';
                        const price = parseFloat(priceText.replace(/[^\d.]/g, '')) || 0;
                        const image = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || '';

                        if (name || partNum) {
                            items.push({
                                productName: partNum ? `${partNum} — ${name}` : name,
                                productUrl: href.startsWith('http') ? href : `${base}${href}`,
                                productPrice: price,
                                offerPrice: price,
                                image: image.startsWith('http') ? image : (image ? `${base}${image}` : ''),
                                brandName: 'Toyota Genuine',
                            });
                        }
                    } catch { /* skip */ }
                });

                return items;
            }, baseUrl);

            // Fallback to table extraction
            if (products.length === 0) {
                products = await this.extractTableParts(page, baseUrl, 'Toyota Genuine');
            }

            this.logger.log(`[scrapeSearch] Found ${products.length} parts from ToyotaParts`);

            return {
                products,
                totalResults: products.length,
                currentPage: 1,
                searchQuery: url,
            };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(`[scrapeSearch] ToyotaParts failed: ${msg}`);
            throw new Error(`ToyotaParts search scrape failed: ${msg}`);
        } finally {
            await page.close().catch(() => {});
        }
    }

    async scrapeProduct(url: string): Promise<ScrapedProduct> {
        this.logger.log(`[scrapeProduct] ToyotaParts url=${url}`);
        const page = await this.createPage();

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise(r => setTimeout(r, 1500));

            const baseUrl = new URL(url).origin;
            const detail = await this.extractBasicPartDetail(page, baseUrl);

            // Toyota-specific: extract superseded part info
            const supersededInfo = await page.evaluate(() => {
                const supersededEl = document.querySelector(
                    '.superseded, .replaced-by, .new-part, [data-superseded]'
                );
                const supersededBy = supersededEl?.textContent?.trim() || '';

                const fitmentEl = document.querySelector('.fitment-notes, .application-notes');
                const fitmentNotes = fitmentEl?.textContent?.trim() || '';

                // Weight/dimensions
                const weightEl = document.querySelector('.weight, .product-weight');
                const dimEl = document.querySelector('.dimensions, .product-dimensions');

                return {
                    supersededBy,
                    fitmentNotes,
                    weight: weightEl?.textContent?.trim() || '',
                    dimensions: dimEl?.textContent?.trim() || '',
                };
            });

            // Detect if Lexus part
            const isLexus = url.toLowerCase().includes('lexus');
            const makeName = isLexus ? 'Lexus' : 'Toyota';

            return {
                productName: detail.description || `${makeName} Part ${detail.partNumber}`,
                description: `${makeName} Genuine OEM Part ${detail.partNumber}. ${detail.description || ''}`,
                shortDescription: `${makeName} ${detail.partNumber} — ${detail.description || 'Genuine OEM Part'}`,
                productPrice: detail.price,
                offerPrice: detail.price,
                brandName: `${makeName} Genuine`,
                images: detail.images,
                specifications: detail.specifications,
                sourceUrl: url,
                sourcePlatform: 'toyotaparts',
                productType: 'PHYSICAL',
                typeOfProduct: 'NEW',
                tags: ['oem', 'genuine-parts', 'auto-parts', makeName.toLowerCase(), 'dealer'],
                metadata: {
                    partNumber: detail.partNumber,
                    oem: true,
                    isGenuine: true,
                    vehicles: detail.vehicles,
                    diagramUrl: detail.diagramUrl,
                    category: detail.specifications.find(s => s.label === 'Category')?.value || '',
                    currency: detail.currency,
                    supersededBy: supersededInfo.supersededBy || undefined,
                    fitmentNotes: supersededInfo.fitmentNotes || undefined,
                    weight: supersededInfo.weight || undefined,
                    dimensions: supersededInfo.dimensions || undefined,
                    make: makeName,
                    platform: this.config.platform,
                },
            };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(`[scrapeProduct] ToyotaParts failed: ${msg}`);
            throw new Error(`ToyotaParts product scrape failed: ${msg}`);
        } finally {
            await page.close().catch(() => {});
        }
    }
}
