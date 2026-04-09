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
// Supported makes on CatCar
// ---------------------------------------------------------------------------

const CATCAR_MAKES = [
    'BMW', 'Mercedes-Benz', 'Audi', 'Volkswagen', 'Porsche', 'Volvo',
    'Ford', 'Opel', 'Peugeot', 'Renault', 'Citroen', 'Fiat',
    'Alfa Romeo', 'Land Rover', 'Jaguar', 'MINI', 'SEAT', 'Skoda',
];

// ---------------------------------------------------------------------------
// CatCarProvider — multi-brand parts catalog (catcar.info)
// ---------------------------------------------------------------------------

/**
 * Scraper provider for catcar.info — multi-brand car parts catalog.
 *
 * Features:
 * - Category tree navigation (brand > model > group > subgroup)
 * - Parts diagrams/maps with position labels
 * - Multi-brand support (European focus)
 * - Lower anti-detection (rateLimit: 30 req/min)
 * - No pricing (reference catalog)
 */
export class CatCarProvider implements ScraperProvider {
    private readonly logger = new Logger(CatCarProvider.name);
    private readonly config: AutoPartsScraperConfig = AUTO_PARTS_PLATFORMS.catcar;
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
            return /^(www\.)?catcar\.info$/.test(hostname);
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
            'Accept-Language': 'en-US,en;q=0.9',
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
    // URL parsing helpers
    // ------------------------------------------------------------------

    private parseBrandFromUrl(url: string): string {
        try {
            const pathname = new URL(url).pathname.toLowerCase();
            // Pattern: /en/brand/model/... or /en/bmw/... etc.
            for (const make of CATCAR_MAKES) {
                if (pathname.includes(`/${make.toLowerCase().replace(/\s+/g, '-')}/`) ||
                    pathname.includes(`/${make.toLowerCase().replace(/\s+/g, '_')}/`) ||
                    pathname.includes(`/${make.toLowerCase()}/`)) {
                    return make;
                }
            }
        } catch { /* fallback */ }
        return '';
    }

    private parseCategoryPath(url: string): string[] {
        try {
            const pathname = new URL(url).pathname;
            // Remove /en/ prefix, split on /
            const parts = pathname
                .replace(/^\/(en|de|fr|es|ru)\//i, '/')
                .split('/')
                .filter(Boolean)
                .map(p => p.replace(/[-_]/g, ' '));
            return parts;
        } catch {
            return [];
        }
    }

    // ------------------------------------------------------------------
    // scrapeSearch — extract parts from a catalog/group page
    // ------------------------------------------------------------------

    async scrapeSearch(url: string): Promise<ScrapedSearchResult> {
        this.logger.log(`[scrapeSearch] CatCar url=${url}`);
        const page = await this.createPage();

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // CatCar uses various layouts: tables, grids, category lists
            const contentSelectors = [
                'table.parts-list', 'table.partslist', '.parts-table',
                '.group-parts table', '.subgroup-parts',
                '#parts-list', '.catalog-content table',
                'table', // CatCar is heavily table-based
            ];

            let found = false;
            for (const sel of contentSelectors) {
                try {
                    await page.waitForSelector(sel, { timeout: 5000 });
                    found = true;
                    break;
                } catch { /* try next */ }
            }

            if (!found) {
                this.logger.warn('No parts table selector matched — checking for category tree');
            }

            await new Promise(r => setTimeout(r, 1500));

            const baseUrl = this.config.baseUrl;
            const brand = this.parseBrandFromUrl(url);

            const products: ScrapedProductSummary[] = await page.evaluate(
                (base: string, brandName: string) => {
                    const items: ScrapedProductSummary[] = [];

                    // Try parts table rows
                    const tables = document.querySelectorAll('table');
                    for (const table of tables) {
                        const rows = table.querySelectorAll('tr');
                        if (rows.length < 2) continue;

                        rows.forEach((row, idx) => {
                            if (idx === 0) return; // skip header
                            try {
                                const cells = row.querySelectorAll('td');
                                if (cells.length < 2) return;

                                // CatCar columns: Position, Part Number, Description, Notes
                                let partNumber = '';
                                let description = '';
                                let position = '';

                                if (cells.length >= 3) {
                                    position = cells[0]?.textContent?.trim() || '';
                                    partNumber = cells[1]?.textContent?.trim() || '';
                                    description = cells[2]?.textContent?.trim() || '';
                                } else {
                                    partNumber = cells[0]?.textContent?.trim() || '';
                                    description = cells[1]?.textContent?.trim() || '';
                                }

                                if (!partNumber || partNumber.length < 3) return;

                                const linkEl = row.querySelector('a[href]');
                                const href = linkEl?.getAttribute('href') || '';
                                const productUrl = href.startsWith('http') ? href : `${base}${href}`;

                                const nameStr = position
                                    ? `[${position}] ${partNumber} — ${description}`
                                    : `${partNumber} — ${description}`;

                                items.push({
                                    productName: nameStr,
                                    productUrl,
                                    productPrice: 0, // CatCar has no pricing
                                    offerPrice: 0,
                                    inStock: undefined,
                                    brandName: brandName ? `${brandName} OEM` : 'OEM',
                                });
                            } catch { /* skip */ }
                        });

                        if (items.length > 0) break; // found the right table
                    }

                    // If no table parts found, try category/group links
                    if (items.length === 0) {
                        const links = document.querySelectorAll(
                            'a[href*="/catalog/"], a[href*="/group/"], a[href*="/subgroup/"], .category-item a'
                        );
                        links.forEach(link => {
                            const text = link.textContent?.trim() || '';
                            const href = link.getAttribute('href') || '';
                            if (text && href) {
                                items.push({
                                    productName: text,
                                    productUrl: href.startsWith('http') ? href : `${base}${href}`,
                                    productPrice: 0,
                                    offerPrice: 0,
                                    brandName: brandName || undefined,
                                });
                            }
                        });
                    }

                    return items;
                },
                baseUrl,
                brand,
            );

            this.logger.log(`[scrapeSearch] Found ${products.length} entries from CatCar`);

            return {
                products,
                totalResults: products.length,
                currentPage: 1,
                searchQuery: url,
            };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(`[scrapeSearch] CatCar failed: ${msg}`);
            throw new Error(`CatCar search scrape failed: ${msg}`);
        } finally {
            await page.close().catch(() => {});
        }
    }

    // ------------------------------------------------------------------
    // scrapeProduct — extract single part detail
    // ------------------------------------------------------------------

    async scrapeProduct(url: string): Promise<ScrapedProduct> {
        this.logger.log(`[scrapeProduct] CatCar url=${url}`);
        const page = await this.createPage();

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise(r => setTimeout(r, 1500));

            const baseUrl = this.config.baseUrl;
            const brand = this.parseBrandFromUrl(url);
            const categoryParts = this.parseCategoryPath(url);

            // Extract part data
            const partData = await this.extractPartData(page);

            // Extract diagram
            const diagramInfo = await this.extractDiagram(page, baseUrl);

            // Extract vehicle info
            const vehicleInfo = await this.extractVehicleInfo(page, brand);

            // Extract breadcrumb category
            const category = await this.extractCategory(page, categoryParts);

            // Build specifications
            const specifications: ScrapedSpecification[] = [];
            if (partData.partNumber) specifications.push({ label: 'Part Number', value: partData.partNumber });
            if (partData.position) specifications.push({ label: 'Diagram Position', value: partData.position });
            if (partData.quantity) specifications.push({ label: 'Quantity', value: partData.quantity });
            if (partData.notes) specifications.push({ label: 'Notes', value: partData.notes });
            if (brand) specifications.push({ label: 'Brand', value: brand });
            if (vehicleInfo.model) specifications.push({ label: 'Model', value: vehicleInfo.model });

            const images: ScrapedImage[] = [];
            if (diagramInfo.imageUrl) {
                images.push({
                    url: diagramInfo.imageUrl,
                    imageName: `diagram-${partData.partNumber || 'catcar'}`,
                    isPrimary: true,
                });
            }

            return {
                productName: partData.description || `${brand} Part ${partData.partNumber}`,
                description: `OEM Part ${partData.partNumber}. ${partData.description || ''} — Fits ${brand} ${vehicleInfo.model || ''}.`.trim(),
                shortDescription: `${brand} ${partData.partNumber} — ${partData.description || 'OEM Part'}`,
                productPrice: 0, // CatCar is reference-only
                offerPrice: 0,
                brandName: brand ? `${brand} / Genuine` : 'OEM Genuine',
                images,
                specifications,
                sourceUrl: url,
                sourcePlatform: 'catcar',
                productType: 'PHYSICAL',
                typeOfProduct: 'NEW',
                categoryPath: category,
                tags: ['oem', 'genuine-parts', 'auto-parts', 'catalog', brand.toLowerCase()].filter(Boolean),
                metadata: {
                    partNumber: partData.partNumber,
                    oem: true,
                    isGenuine: true,
                    vehicles: [vehicleInfo],
                    diagramUrl: diagramInfo.imageUrl,
                    diagramPosition: partData.position,
                    diagramId: diagramInfo.diagramId,
                    diagramName: diagramInfo.groupName,
                    category,
                    notes: partData.notes,
                    quantity: partData.quantity,
                    noPricing: true,
                    platform: this.config.platform,
                },
            };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(`[scrapeProduct] CatCar failed: ${msg}`);
            throw new Error(`CatCar product scrape failed: ${msg}`);
        } finally {
            await page.close().catch(() => {});
        }
    }

    // ------------------------------------------------------------------
    // Extraction helpers
    // ------------------------------------------------------------------

    private async extractPartData(page: Page): Promise<{
        partNumber: string; description: string;
        position: string; quantity: string; notes: string;
    }> {
        try {
            return await page.evaluate(() => {
                // Try highlighted/selected row in parts table
                const row = document.querySelector(
                    'tr.highlight, tr.selected, tr.active, tr[style*="background"], tr.current'
                );
                if (row) {
                    const cells = row.querySelectorAll('td');
                    return {
                        position: cells[0]?.textContent?.trim() || '',
                        partNumber: cells[1]?.textContent?.trim() || '',
                        description: cells[2]?.textContent?.trim() || '',
                        quantity: cells[3]?.textContent?.trim() || '',
                        notes: cells[4]?.textContent?.trim() || '',
                    };
                }

                // Fallback: detail elements
                const pnEl = document.querySelector('.part-number, .partNumber, [data-part]');
                const descEl = document.querySelector('.part-description, .partName, h1, h2');

                return {
                    partNumber: pnEl?.textContent?.trim() || '',
                    description: descEl?.textContent?.trim() || '',
                    position: '',
                    quantity: '',
                    notes: '',
                };
            });
        } catch (err) {
            this.logger.warn('Failed to extract part data');
            return { partNumber: '', description: '', position: '', quantity: '', notes: '' };
        }
    }

    private async extractDiagram(page: Page, baseUrl: string): Promise<{
        imageUrl?: string; diagramId?: string; groupName?: string;
    }> {
        try {
            return await page.evaluate((base: string) => {
                const imgSelectors = [
                    'img[usemap]', 'img.diagram', 'img[src*="diagram"]',
                    'img[src*="group"]', 'img[src*="scheme"]',
                    '.diagram-container img', '#diagram img',
                    'img[src*="catcar"]',
                ];
                let imageUrl: string | undefined;
                for (const sel of imgSelectors) {
                    const img = document.querySelector(sel);
                    const src = img?.getAttribute('src') || '';
                    if (src) {
                        imageUrl = src.startsWith('http') ? src : `${base}${src}`;
                        break;
                    }
                }

                const groupEl = document.querySelector(
                    'h1, h2, .group-name, .subgroup-name, .breadcrumb li:last-child'
                );
                const groupName = groupEl?.textContent?.trim() || '';

                return {
                    imageUrl,
                    diagramId: undefined,
                    groupName: groupName || undefined,
                };
            }, baseUrl);
        } catch (err) {
            this.logger.warn('Failed to extract diagram');
            return {};
        }
    }

    private async extractVehicleInfo(page: Page, brand: string): Promise<Vehicle> {
        try {
            const rawInfo = await page.evaluate(() => {
                const titleEl = document.querySelector(
                    'h1, .model-title, .vehicle-title, .breadcrumb'
                );
                return titleEl?.textContent?.trim() || '';
            });

            const vehicle: Vehicle = { make: brand || '', model: '' };

            // Try to parse "Brand Model Year" from title
            const modelMatch = rawInfo.match(new RegExp(`(?:${brand})?\\s*(.+?)\\s*(\\d{4})?\\s*$`, 'i'));
            if (modelMatch) {
                vehicle.model = modelMatch[1].trim();
                if (modelMatch[2]) vehicle.year = parseInt(modelMatch[2], 10);
            }

            return vehicle;
        } catch (err) {
            this.logger.warn('Failed to extract vehicle info');
            return { make: brand, model: '' };
        }
    }

    private async extractCategory(page: Page, fallbackParts: string[]): Promise<string> {
        try {
            const breadcrumb = await page.evaluate(() => {
                const bcEl = document.querySelector(
                    '.breadcrumb, nav[aria-label="breadcrumb"], .category-path'
                );
                if (bcEl) {
                    return Array.from(bcEl.querySelectorAll('li, a, span'))
                        .map(el => el.textContent?.trim())
                        .filter(Boolean)
                        .join(' > ');
                }
                return '';
            });

            return breadcrumb || fallbackParts.join(' > ');
        } catch (err) {
            this.logger.warn('Failed to extract category');
            return fallbackParts.join(' > ');
        }
    }
}
