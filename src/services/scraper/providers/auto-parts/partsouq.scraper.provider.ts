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
// Anti-detection: user-agent & viewport rotation
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
// PartsOuqProvider — Middle East OEM parts (partsouq.com)
// ---------------------------------------------------------------------------

/**
 * Scraper provider for partsouq.com — Middle East focused OEM spare parts.
 *
 * Features:
 * - Bilingual Arabic + English content (ideal for Ultrasooq)
 * - Vehicle: Make > Model > Year > Category navigation
 * - OEM pricing in AED/SAR/USD
 * - Parts diagrams with position markers
 * - Genuine OEM parts from regional distributors
 */
export class PartsOuqProvider implements ScraperProvider {
    private readonly logger = new Logger(PartsOuqProvider.name);
    private readonly config: AutoPartsScraperConfig = AUTO_PARTS_PLATFORMS.partsouq;
    private browser: Browser | null = null;

    // ------------------------------------------------------------------
    // canScrape
    // ------------------------------------------------------------------

    canScrape(url: string): boolean {
        try {
            let candidate = url;
            if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(candidate)) {
                candidate = 'http://' + candidate;
            }
            const hostname = new URL(candidate).hostname.toLowerCase();
            return /^(www\.)?partsouq\.com$/.test(hostname);
        } catch {
            return false;
        }
    }

    // ------------------------------------------------------------------
    // Browser management
    // ------------------------------------------------------------------

    private async getBrowser(): Promise<Browser> {
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

    private async createPage(): Promise<Page> {
        const browser = await this.getBrowser();
        const page = await browser.newPage();

        const ua = randomItem(USER_AGENTS);
        const vp = randomItem(VIEWPORTS);

        await page.setUserAgent(ua);
        await page.setViewport(vp);
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-AE,ar;q=0.9,en;q=0.8',
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
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'ar'] });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        });

        return page;
    }

    // ------------------------------------------------------------------
    // Utility
    // ------------------------------------------------------------------

    private parsePrice(text: string | null | undefined): number {
        if (!text) return 0;
        const cleaned = text.replace(/[^\d.,]/g, '');
        if (/\d+\.\d{3},\d{1,2}$/.test(cleaned)) {
            return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
        }
        return parseFloat(cleaned.replace(/,/g, '')) || 0;
    }

    private extractCurrency(text: string | null | undefined): string {
        if (!text) return 'AED';
        if (text.includes('AED') || text.includes('د.إ')) return 'AED';
        if (text.includes('SAR') || text.includes('ر.س')) return 'SAR';
        if (text.includes('USD') || text.includes('$')) return 'USD';
        if (text.includes('KWD') || text.includes('د.ك')) return 'KWD';
        if (text.includes('QAR') || text.includes('ر.ق')) return 'QAR';
        if (text.includes('BHD') || text.includes('د.ب')) return 'BHD';
        if (text.includes('OMR') || text.includes('ر.ع')) return 'OMR';
        return 'AED';
    }

    private parseVehicleFromBreadcrumb(breadcrumb: string): Vehicle {
        const vehicle: Vehicle = { make: '', model: '' };
        try {
            // Pattern: "Make > Model > Year" or "Make > Model Year"
            const parts = breadcrumb.split(/[>\/]/).map(p => p.trim()).filter(Boolean);
            if (parts.length >= 1) vehicle.make = parts[0];
            if (parts.length >= 2) vehicle.model = parts[1];
            if (parts.length >= 3) {
                const yearMatch = parts[2].match(/(\d{4})/);
                if (yearMatch) vehicle.year = parseInt(yearMatch[1], 10);
            }
            // Try extracting year from model field if combined
            const modelYear = vehicle.model.match(/^(.+?)\s+(\d{4})$/);
            if (modelYear) {
                vehicle.model = modelYear[1];
                vehicle.year = parseInt(modelYear[2], 10);
            }
        } catch (err) {
            this.logger.warn(`Failed to parse vehicle from breadcrumb: ${breadcrumb}`);
        }
        return vehicle;
    }

    // ------------------------------------------------------------------
    // scrapeSearch
    // ------------------------------------------------------------------

    async scrapeSearch(url: string): Promise<ScrapedSearchResult> {
        this.logger.log(`[scrapeSearch] PartsOuq url=${url}`);
        const page = await this.createPage();

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Wait for product listing
            const listSelectors = [
                '.parts-list .part-item',
                '.search-results .product-card',
                '.catalog-parts .part-row',
                'table.parts-table tbody tr',
                '.product-list .product-item',
            ];

            let found = false;
            for (const sel of listSelectors) {
                try {
                    await page.waitForSelector(sel, { timeout: 5000 });
                    found = true;
                    break;
                } catch { /* try next */ }
            }

            if (!found) {
                this.logger.warn('No parts listing selector matched — scraping anyway');
            }

            await new Promise(r => setTimeout(r, 2000));

            const baseUrl = this.config.baseUrl;

            const products: ScrapedProductSummary[] = await page.evaluate((base: string) => {
                const items: ScrapedProductSummary[] = [];

                // Try table-based layout first (common for parts catalogs)
                const tableRows = document.querySelectorAll(
                    'table.parts-table tbody tr, .parts-list .part-item, .search-results .product-card, .product-list .product-item'
                );

                tableRows.forEach(row => {
                    try {
                        const nameEl = row.querySelector('.part-name, .product-name, td:nth-child(2), a[href*="/part/"]');
                        const productName = nameEl?.textContent?.trim() || '';
                        if (!productName) return;

                        const linkEl = row.querySelector('a[href*="/part/"], a[href*="/catalog/"]');
                        const href = linkEl?.getAttribute('href') || '';
                        const productUrl = href.startsWith('http') ? href : `${base}${href}`;

                        const priceEl = row.querySelector('.part-price, .product-price, .price, td:last-child');
                        const priceText = priceEl?.textContent?.trim() || '';
                        const priceNum = parseFloat(priceText.replace(/[^\d.]/g, '')) || 0;

                        const imgEl = row.querySelector('img');
                        const image = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src') || '';

                        const partNumEl = row.querySelector('.part-number, .oem-number, td:first-child');
                        const partNumber = partNumEl?.textContent?.trim() || '';

                        items.push({
                            productName: partNumber ? `${partNumber} - ${productName}` : productName,
                            productUrl,
                            productPrice: priceNum,
                            offerPrice: priceNum,
                            image: image.startsWith('http') ? image : (image ? `${base}${image}` : ''),
                            inStock: true,
                            brandName: 'OEM Genuine',
                        });
                    } catch { /* skip malformed row */ }
                });

                return items;
            }, baseUrl);

            // Extract pagination
            const pagination = await page.evaluate(() => {
                const totalEl = document.querySelector('.pagination-info, .results-count, .total-count');
                const totalText = totalEl?.textContent?.trim() || '';
                const totalMatch = totalText.match(/(\d+)/);
                return {
                    totalResults: totalMatch ? parseInt(totalMatch[1], 10) : undefined,
                    currentPage: 1,
                };
            });

            this.logger.log(`[scrapeSearch] Found ${products.length} parts from PartsOuq`);

            return {
                products,
                totalResults: pagination.totalResults || products.length,
                currentPage: pagination.currentPage,
                searchQuery: url,
            };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(`[scrapeSearch] PartsOuq failed: ${msg}`);
            throw new Error(`PartsOuq search scrape failed: ${msg}`);
        } finally {
            await page.close().catch(() => {});
        }
    }

    // ------------------------------------------------------------------
    // scrapeProduct
    // ------------------------------------------------------------------

    async scrapeProduct(url: string): Promise<ScrapedProduct> {
        this.logger.log(`[scrapeProduct] PartsOuq url=${url}`);
        const page = await this.createPage();

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Wait for part detail content
            const detailSelectors = [
                '.part-detail',
                '.product-detail',
                '.part-info',
                '#part-content',
                '.catalog-detail',
            ];

            for (const sel of detailSelectors) {
                try {
                    await page.waitForSelector(sel, { timeout: 5000 });
                    break;
                } catch { /* try next */ }
            }

            await new Promise(r => setTimeout(r, 1500));

            const baseUrl = this.config.baseUrl;

            // Extract part number
            const partNumber = await this.extractPartNumber(page);

            // Extract names (bilingual)
            const names = await this.extractBilingualNames(page);

            // Extract pricing
            const pricing = await this.extractPricing(page);

            // Extract vehicle compatibility
            const vehicles = await this.extractVehicles(page);

            // Extract images and diagrams
            const images = await this.extractImages(page, baseUrl);

            // Extract specifications
            const specifications = await this.extractSpecifications(page);

            // Extract category from breadcrumb
            const category = await this.extractCategory(page);

            // Extract stock info
            const stockInfo = await this.extractStockInfo(page);

            // Extract diagram reference
            const diagramInfo = await this.extractDiagramInfo(page, baseUrl);

            // Extract cross-references / superseded parts
            const crossReferences = await this.extractCrossReferences(page);

            return {
                productName: names.nameEn || partNumber,
                description: names.descriptionEn || '',
                shortDescription: `OEM Part ${partNumber}${names.nameAr ? ` / ${names.nameAr}` : ''}`,
                productPrice: pricing.price,
                offerPrice: pricing.offerPrice || pricing.price,
                brandName: pricing.brand || 'OEM Genuine',
                images,
                specifications,
                sourceUrl: url,
                sourcePlatform: 'partsouq',
                sourceRegion: 'ae',
                inStock: stockInfo.inStock,
                stockQuantity: stockInfo.quantity,
                productType: 'PHYSICAL',
                typeOfProduct: 'NEW',
                categoryPath: category,
                tags: ['oem', 'genuine-parts', 'auto-parts', 'middle-east'],
                metadata: {
                    partNumber,
                    partNumberAlt: crossReferences.altNumbers,
                    oem: true,
                    isGenuine: true,
                    vehicles,
                    category,
                    diagramUrl: diagramInfo.diagramUrl,
                    diagramPosition: diagramInfo.position,
                    diagramId: diagramInfo.diagramId,
                    nameAr: names.nameAr,
                    nameEn: names.nameEn,
                    descriptionAr: names.descriptionAr,
                    currency: pricing.currency,
                    msrp: pricing.msrp,
                    crossReferences: crossReferences.crossRefs,
                    supersededBy: crossReferences.supersededBy,
                    fitmentNotes: stockInfo.fitmentNotes,
                    leadTime: stockInfo.leadTime,
                    platform: this.config.platform,
                },
            };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(`[scrapeProduct] PartsOuq failed: ${msg}`);
            throw new Error(`PartsOuq product scrape failed: ${msg}`);
        } finally {
            await page.close().catch(() => {});
        }
    }

    // ------------------------------------------------------------------
    // Extraction helpers
    // ------------------------------------------------------------------

    private async extractPartNumber(page: Page): Promise<string> {
        try {
            return await page.evaluate(() => {
                const selectors = [
                    '.part-number', '.oem-number', '#partNumber',
                    '[data-part-number]', '.product-sku', '.sku-value',
                ];
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el?.textContent?.trim()) {
                        return el.textContent.trim().replace(/^(Part\s*#?:?\s*|OEM\s*#?:?\s*)/i, '');
                    }
                }
                // Fallback: look for pattern in page text
                const body = document.body.innerText;
                const match = body.match(/(?:Part|OEM)\s*(?:#|Number|No\.?)\s*:?\s*([A-Z0-9][\w-]{3,20})/i);
                return match ? match[1] : '';
            });
        } catch (err) {
            this.logger.warn('Failed to extract part number');
            return '';
        }
    }

    private async extractBilingualNames(page: Page): Promise<{
        nameEn: string; nameAr: string;
        descriptionEn: string; descriptionAr: string;
    }> {
        try {
            return await page.evaluate(() => {
                // English name
                const nameEnEl = document.querySelector(
                    'h1.part-name, h1.product-title, .part-detail h1, .product-name-en, [lang="en"] .part-name'
                );
                const nameEn = nameEnEl?.textContent?.trim() || '';

                // Arabic name — look for RTL or lang="ar"
                const nameArEl = document.querySelector(
                    '.part-name-ar, .product-name-ar, [lang="ar"] .part-name, [dir="rtl"] .part-name'
                );
                const nameAr = nameArEl?.textContent?.trim() || '';

                // Descriptions
                const descEnEl = document.querySelector(
                    '.part-description, .product-description, .description-en'
                );
                const descriptionEn = descEnEl?.textContent?.trim() || '';

                const descArEl = document.querySelector(
                    '.part-description-ar, .description-ar, [lang="ar"] .part-description'
                );
                const descriptionAr = descArEl?.textContent?.trim() || '';

                return { nameEn, nameAr, descriptionEn, descriptionAr };
            });
        } catch (err) {
            this.logger.warn('Failed to extract bilingual names');
            return { nameEn: '', nameAr: '', descriptionEn: '', descriptionAr: '' };
        }
    }

    private async extractPricing(page: Page): Promise<{
        price: number; offerPrice: number; msrp: number;
        currency: string; brand: string;
    }> {
        try {
            const rawPricing = await page.evaluate(() => {
                const priceEl = document.querySelector(
                    '.part-price, .product-price, .price-value, .current-price, #price'
                );
                const msrpEl = document.querySelector(
                    '.msrp, .list-price, .original-price, .was-price, .price-old'
                );
                const brandEl = document.querySelector(
                    '.brand-name, .manufacturer, .part-brand, .product-brand'
                );

                return {
                    priceText: priceEl?.textContent?.trim() || '',
                    msrpText: msrpEl?.textContent?.trim() || '',
                    brand: brandEl?.textContent?.trim() || '',
                };
            });

            const price = this.parsePrice(rawPricing.priceText);
            const msrp = this.parsePrice(rawPricing.msrpText);
            const currency = this.extractCurrency(rawPricing.priceText);

            return {
                price,
                offerPrice: price,
                msrp: msrp || price,
                currency,
                brand: rawPricing.brand,
            };
        } catch (err) {
            this.logger.warn('Failed to extract pricing');
            return { price: 0, offerPrice: 0, msrp: 0, currency: 'AED', brand: '' };
        }
    }

    private async extractVehicles(page: Page): Promise<Vehicle[]> {
        try {
            return await page.evaluate(() => {
                const vehicles: Vehicle[] = [];

                // Try compatibility table
                const rows = document.querySelectorAll(
                    '.compatibility-table tr, .fitment-table tr, .vehicle-list .vehicle-item, .applicable-models li'
                );
                rows.forEach(row => {
                    try {
                        const cells = row.querySelectorAll('td, span');
                        if (cells.length >= 2) {
                            const v: Vehicle = { make: '', model: '' };
                            v.make = cells[0]?.textContent?.trim() || '';
                            v.model = cells[1]?.textContent?.trim() || '';
                            if (cells.length >= 3) {
                                const yearMatch = cells[2]?.textContent?.match(/(\d{4})/);
                                if (yearMatch) v.year = parseInt(yearMatch[1], 10);
                            }
                            if (v.make && v.model) vehicles.push(v);
                        }
                    } catch { /* skip */ }
                });

                // Try breadcrumb-based vehicle
                if (vehicles.length === 0) {
                    const breadcrumb = document.querySelector('.breadcrumb, .vehicle-path, nav[aria-label="breadcrumb"]');
                    if (breadcrumb?.textContent) {
                        const parts = breadcrumb.textContent.split(/[>\/]/).map(p => p.trim()).filter(Boolean);
                        if (parts.length >= 2) {
                            const v: Vehicle = { make: parts[0] || '', model: parts[1] || '' };
                            const yearMatch = (parts[2] || '').match(/(\d{4})/);
                            if (yearMatch) v.year = parseInt(yearMatch[1], 10);
                            vehicles.push(v);
                        }
                    }
                }

                return vehicles;
            });
        } catch (err) {
            this.logger.warn('Failed to extract vehicles');
            return [];
        }
    }

    private async extractImages(page: Page, baseUrl: string): Promise<ScrapedImage[]> {
        try {
            return await page.evaluate((base: string) => {
                const images: ScrapedImage[] = [];
                const imgSelectors = [
                    '.part-image img', '.product-image img', '.gallery img',
                    '.diagram-image img', '.part-photo img',
                ];

                for (const sel of imgSelectors) {
                    document.querySelectorAll(sel).forEach((img, idx) => {
                        const src = img.getAttribute('src') || img.getAttribute('data-src') || '';
                        if (src) {
                            const url = src.startsWith('http') ? src : `${base}${src}`;
                            images.push({
                                url,
                                imageName: img.getAttribute('alt') || `part-image-${idx}`,
                                isPrimary: idx === 0,
                            });
                        }
                    });
                    if (images.length > 0) break;
                }

                return images;
            }, baseUrl);
        } catch (err) {
            this.logger.warn('Failed to extract images');
            return [];
        }
    }

    private async extractSpecifications(page: Page): Promise<ScrapedSpecification[]> {
        try {
            return await page.evaluate(() => {
                const specs: ScrapedSpecification[] = [];
                const rows = document.querySelectorAll(
                    '.specifications tr, .part-details tr, .product-specs dt, .spec-row, .detail-row'
                );

                rows.forEach(row => {
                    try {
                        const label = row.querySelector('th, dt, .spec-label, td:first-child')?.textContent?.trim() || '';
                        const value = row.querySelector('td, dd, .spec-value, td:last-child')?.textContent?.trim() || '';
                        if (label && value && label !== value) {
                            specs.push({ label, value });
                        }
                    } catch { /* skip */ }
                });

                return specs;
            });
        } catch (err) {
            this.logger.warn('Failed to extract specifications');
            return [];
        }
    }

    private async extractCategory(page: Page): Promise<string> {
        try {
            return await page.evaluate(() => {
                const breadcrumb = document.querySelector(
                    '.breadcrumb, nav[aria-label="breadcrumb"], .category-path'
                );
                if (breadcrumb?.textContent) {
                    return breadcrumb.textContent
                        .split(/[>\/]/)
                        .map(p => p.trim())
                        .filter(Boolean)
                        .join(' > ');
                }
                return '';
            });
        } catch (err) {
            this.logger.warn('Failed to extract category');
            return '';
        }
    }

    private async extractStockInfo(page: Page): Promise<{
        inStock: boolean; quantity?: number;
        fitmentNotes?: string; leadTime?: string;
    }> {
        try {
            return await page.evaluate(() => {
                const stockEl = document.querySelector(
                    '.stock-status, .availability, .in-stock, .out-of-stock, .product-availability'
                );
                const stockText = stockEl?.textContent?.trim().toLowerCase() || '';
                const inStock = !stockText.includes('out of stock') && !stockText.includes('unavailable');

                const qtyEl = document.querySelector('.stock-quantity, .qty-available');
                const qtyText = qtyEl?.textContent?.trim() || '';
                const qtyMatch = qtyText.match(/(\d+)/);

                const fitmentEl = document.querySelector('.fitment-notes, .installation-notes, .part-notes');
                const leadEl = document.querySelector('.lead-time, .delivery-time, .estimated-delivery');

                return {
                    inStock,
                    quantity: qtyMatch ? parseInt(qtyMatch[1], 10) : undefined,
                    fitmentNotes: fitmentEl?.textContent?.trim() || undefined,
                    leadTime: leadEl?.textContent?.trim() || undefined,
                };
            });
        } catch (err) {
            this.logger.warn('Failed to extract stock info');
            return { inStock: true };
        }
    }

    private async extractDiagramInfo(page: Page, baseUrl: string): Promise<{
        diagramUrl?: string; position?: string; diagramId?: string;
    }> {
        try {
            return await page.evaluate((base: string) => {
                const diagramImg = document.querySelector(
                    '.diagram-image img, .parts-diagram img, .exploded-view img, .assembly-diagram img'
                );
                const diagramUrl = diagramImg?.getAttribute('src') || diagramImg?.getAttribute('data-src') || '';

                const posEl = document.querySelector(
                    '.diagram-position, .part-position, .position-number, [data-position]'
                );
                const position = posEl?.textContent?.trim()
                    || posEl?.getAttribute('data-position')
                    || '';

                const diagramIdEl = document.querySelector('[data-diagram-id], .diagram-id');
                const diagramId = diagramIdEl?.getAttribute('data-diagram-id')
                    || diagramIdEl?.textContent?.trim()
                    || '';

                return {
                    diagramUrl: diagramUrl ? (diagramUrl.startsWith('http') ? diagramUrl : `${base}${diagramUrl}`) : undefined,
                    position: position || undefined,
                    diagramId: diagramId || undefined,
                };
            }, baseUrl);
        } catch (err) {
            this.logger.warn('Failed to extract diagram info');
            return {};
        }
    }

    private async extractCrossReferences(page: Page): Promise<{
        altNumbers: string[]; crossRefs: string[]; supersededBy?: string;
    }> {
        try {
            return await page.evaluate(() => {
                const altNumbers: string[] = [];
                const crossRefs: string[] = [];

                // Alternative part numbers
                const altEls = document.querySelectorAll(
                    '.alt-part-numbers li, .alternative-numbers span, .superseded-numbers li'
                );
                altEls.forEach(el => {
                    const num = el.textContent?.trim();
                    if (num) altNumbers.push(num);
                });

                // Cross-reference numbers
                const crossEls = document.querySelectorAll(
                    '.cross-reference li, .interchange-numbers span, .compatible-numbers li'
                );
                crossEls.forEach(el => {
                    const num = el.textContent?.trim();
                    if (num) crossRefs.push(num);
                });

                // Superseded by
                const supersededEl = document.querySelector(
                    '.superseded-by, .replaced-by, .new-part-number'
                );
                const supersededBy = supersededEl?.textContent?.trim() || undefined;

                return { altNumbers, crossRefs, supersededBy };
            });
        } catch (err) {
            this.logger.warn('Failed to extract cross-references');
            return { altNumbers: [], crossRefs: [] };
        }
    }
}
