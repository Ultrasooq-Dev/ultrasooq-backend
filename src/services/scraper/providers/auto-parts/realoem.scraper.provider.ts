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
// RealOEM series mapping
// ---------------------------------------------------------------------------

const BMW_SERIES_MAP: Record<string, string> = {
    '1': '1 Series', '2': '2 Series', '3': '3 Series', '4': '4 Series',
    '5': '5 Series', '6': '6 Series', '7': '7 Series', '8': '8 Series',
    X1: 'X1', X2: 'X2', X3: 'X3', X4: 'X4', X5: 'X5', X6: 'X6', X7: 'X7',
    Z3: 'Z3', Z4: 'Z4', Z8: 'Z8', i3: 'i3', i4: 'i4', i5: 'i5', i7: 'i7', iX: 'iX',
    M2: 'M2', M3: 'M3', M4: 'M4', M5: 'M5', M6: 'M6', M8: 'M8',
};

// ---------------------------------------------------------------------------
// RealOEMProvider — BMW/MINI ETK parts diagrams (realoem.com)
// ---------------------------------------------------------------------------

/**
 * Scraper provider for realoem.com — BMW/MINI specific parts catalog.
 *
 * Features:
 * - Comprehensive BMW ETK (Electronic Parts Catalog) data
 * - High-quality exploded parts diagrams
 * - VIN lookup and model series navigation
 * - No pricing (reference catalog only)
 * - Higher anti-detection — rate limiting enforced
 */
export class RealOEMProvider implements ScraperProvider {
    private readonly logger = new Logger(RealOEMProvider.name);
    private readonly config: AutoPartsScraperConfig = AUTO_PARTS_PLATFORMS.realoem;
    private browser: Browser | null = null;
    private lastRequestTime = 0;

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
            return /^(www\.)?realoem\.com$/.test(hostname);
        } catch {
            return false;
        }
    }

    // ------------------------------------------------------------------
    // Rate limiter — high anti-detection site
    // ------------------------------------------------------------------

    private async enforceRateLimit(): Promise<void> {
        const minIntervalMs = (60 / this.config.rateLimit) * 1000; // 6000ms for 10/min
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < minIntervalMs) {
            const wait = minIntervalMs - elapsed + Math.random() * 2000; // +jitter
            this.logger.debug(`Rate limiting: waiting ${Math.round(wait)}ms`);
            await new Promise(r => setTimeout(r, wait));
        }
        this.lastRequestTime = Date.now();
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
    // Utility
    // ------------------------------------------------------------------

    private parseModelFromUrl(url: string): { series?: string; bodyType?: string; model?: string } {
        try {
            const parsed = new URL(url);
            const pathParts = parsed.pathname.split('/').filter(Boolean);
            // Typical: /bmw/E90/330i/...  or /bmw/F30/...
            const result: { series?: string; bodyType?: string; model?: string } = {};
            if (pathParts.length >= 2) result.series = pathParts[1]; // e.g. E90
            if (pathParts.length >= 3) result.model = pathParts[2];  // e.g. 330i
            return result;
        } catch {
            return {};
        }
    }

    // ------------------------------------------------------------------
    // scrapeSearch — list parts from a diagram/group page
    // ------------------------------------------------------------------

    async scrapeSearch(url: string): Promise<ScrapedSearchResult> {
        this.logger.log(`[scrapeSearch] RealOEM url=${url}`);
        await this.enforceRateLimit();
        const page = await this.createPage();

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // RealOEM typically shows parts in table format
            const tableSelectors = [
                'table.parts', 'table#parts', '.partsList table',
                'table.partsTable', '#partsTable',
                'table', // fallback — site is table-heavy
            ];

            let found = false;
            for (const sel of tableSelectors) {
                try {
                    await page.waitForSelector(sel, { timeout: 5000 });
                    found = true;
                    break;
                } catch { /* try next */ }
            }

            if (!found) {
                this.logger.warn('No parts table selector matched — scraping anyway');
            }

            await new Promise(r => setTimeout(r, 2000));

            const baseUrl = this.config.baseUrl;
            const modelInfo = this.parseModelFromUrl(url);

            const products: ScrapedProductSummary[] = await page.evaluate(
                (base: string, model: { series?: string; bodyType?: string; model?: string }) => {
                    const items: ScrapedProductSummary[] = [];

                    // Find the main parts table
                    const tables = document.querySelectorAll('table');
                    let partsTable: Element | null = null;
                    for (const t of tables) {
                        if (t.querySelectorAll('tr').length > 2) {
                            partsTable = t;
                            break;
                        }
                    }
                    if (!partsTable) return items;

                    const rows = partsTable.querySelectorAll('tr');
                    rows.forEach((row, idx) => {
                        if (idx === 0) return; // skip header
                        try {
                            const cells = row.querySelectorAll('td');
                            if (cells.length < 3) return;

                            // Typical columns: Diagram#, Part Number, Description, Qty, From, To, Price
                            const diagramPos = cells[0]?.textContent?.trim() || '';
                            const partNumber = cells[1]?.textContent?.trim() || '';
                            const description = cells[2]?.textContent?.trim() || '';

                            if (!partNumber || partNumber.length < 3) return;

                            // Build link
                            const linkEl = row.querySelector('a[href]');
                            const href = linkEl?.getAttribute('href') || '';
                            const productUrl = href.startsWith('http') ? href : `${base}${href}`;

                            const modelLabel = model.model
                                ? `BMW ${model.series || ''} ${model.model}`
                                : `BMW ${model.series || ''}`;

                            items.push({
                                productName: `${partNumber} — ${description}`,
                                productUrl,
                                productPrice: 0, // RealOEM has no pricing
                                offerPrice: 0,
                                inStock: undefined,
                                brandName: `BMW / ${modelLabel.trim()}`,
                            });
                        } catch { /* skip row */ }
                    });

                    return items;
                },
                baseUrl,
                modelInfo,
            );

            // Extract diagram image if on a diagram page
            const diagramImage = await page.evaluate((base: string) => {
                const img = document.querySelector(
                    'img.diagram, img.partsDiagram, img[src*="diagram"], img[src*="etk"], .diagramImage img'
                );
                const src = img?.getAttribute('src') || '';
                return src ? (src.startsWith('http') ? src : `${base}${src}`) : '';
            }, baseUrl);

            this.logger.log(`[scrapeSearch] Found ${products.length} BMW parts from RealOEM`);

            return {
                products,
                totalResults: products.length,
                currentPage: 1,
                searchQuery: url,
            };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(`[scrapeSearch] RealOEM failed: ${msg}`);
            throw new Error(`RealOEM search scrape failed: ${msg}`);
        } finally {
            await page.close().catch(() => {});
        }
    }

    // ------------------------------------------------------------------
    // scrapeProduct — extract single part detail
    // ------------------------------------------------------------------

    async scrapeProduct(url: string): Promise<ScrapedProduct> {
        this.logger.log(`[scrapeProduct] RealOEM url=${url}`);
        await this.enforceRateLimit();
        const page = await this.createPage();

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise(r => setTimeout(r, 2000));

            const baseUrl = this.config.baseUrl;
            const modelInfo = this.parseModelFromUrl(url);

            // Extract part details
            const partData = await this.extractPartData(page);

            // Extract diagram
            const diagramInfo = await this.extractDiagram(page, baseUrl);

            // Extract vehicle info from the page
            const vehicleInfo = await this.extractVehicleInfo(page, modelInfo);

            // Extract all parts in same diagram group (related parts)
            const relatedParts = await this.extractRelatedParts(page, baseUrl);

            // Build specifications from extracted data
            const specifications: ScrapedSpecification[] = [];
            if (partData.partNumber) specifications.push({ label: 'Part Number', value: partData.partNumber });
            if (partData.diagramPosition) specifications.push({ label: 'Diagram Position', value: partData.diagramPosition });
            if (partData.quantity) specifications.push({ label: 'Quantity Needed', value: partData.quantity });
            if (partData.fromDate) specifications.push({ label: 'Production From', value: partData.fromDate });
            if (partData.toDate) specifications.push({ label: 'Production To', value: partData.toDate });
            if (partData.supplement) specifications.push({ label: 'Supplement', value: partData.supplement });
            if (modelInfo.series) specifications.push({ label: 'BMW Series', value: modelInfo.series });
            if (modelInfo.model) specifications.push({ label: 'BMW Model', value: modelInfo.model });

            const images: ScrapedImage[] = [];
            if (diagramInfo.imageUrl) {
                images.push({
                    url: diagramInfo.imageUrl,
                    imageName: `diagram-${partData.partNumber || 'unknown'}`,
                    isPrimary: true,
                });
            }

            const modelLabel = modelInfo.model
                ? `BMW ${modelInfo.series || ''} ${modelInfo.model}`.trim()
                : `BMW ${modelInfo.series || ''}`.trim();

            return {
                productName: partData.description || `BMW Part ${partData.partNumber}`,
                description: `BMW OEM Part ${partData.partNumber}. ${partData.description || ''} — Fits ${modelLabel}.`,
                shortDescription: `BMW ${partData.partNumber} — ${partData.description || 'OEM Part'}`,
                productPrice: 0, // RealOEM is reference-only, no pricing
                offerPrice: 0,
                brandName: 'BMW / Genuine',
                images,
                specifications,
                sourceUrl: url,
                sourcePlatform: 'realoem',
                productType: 'PHYSICAL',
                typeOfProduct: 'NEW',
                categoryPath: diagramInfo.groupName || '',
                tags: ['bmw', 'oem', 'genuine-parts', 'auto-parts', 'etk'],
                relatedProducts: relatedParts,
                metadata: {
                    partNumber: partData.partNumber,
                    oem: true,
                    isGenuine: true,
                    vehicles: [vehicleInfo],
                    diagramUrl: diagramInfo.imageUrl,
                    diagramPosition: partData.diagramPosition,
                    diagramId: diagramInfo.diagramId,
                    diagramName: diagramInfo.groupName,
                    category: diagramInfo.groupName,
                    quantity: partData.quantity,
                    fromDate: partData.fromDate,
                    toDate: partData.toDate,
                    supplement: partData.supplement,
                    bmwSeries: modelInfo.series,
                    bmwModel: modelInfo.model,
                    noPricing: true,
                    platform: this.config.platform,
                },
            };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            this.logger.error(`[scrapeProduct] RealOEM failed: ${msg}`);
            throw new Error(`RealOEM product scrape failed: ${msg}`);
        } finally {
            await page.close().catch(() => {});
        }
    }

    // ------------------------------------------------------------------
    // Extraction helpers
    // ------------------------------------------------------------------

    private async extractPartData(page: Page): Promise<{
        partNumber: string; description: string; diagramPosition: string;
        quantity: string; fromDate: string; toDate: string; supplement: string;
    }> {
        try {
            return await page.evaluate(() => {
                // Try highlighted row in parts table
                const highlightedRow = document.querySelector('tr.highlight, tr.selected, tr.active, tr[style*="background"]');
                if (highlightedRow) {
                    const cells = highlightedRow.querySelectorAll('td');
                    return {
                        diagramPosition: cells[0]?.textContent?.trim() || '',
                        partNumber: cells[1]?.textContent?.trim() || '',
                        description: cells[2]?.textContent?.trim() || '',
                        quantity: cells[3]?.textContent?.trim() || '',
                        fromDate: cells[4]?.textContent?.trim() || '',
                        toDate: cells[5]?.textContent?.trim() || '',
                        supplement: cells[6]?.textContent?.trim() || '',
                    };
                }

                // Fallback: first data row
                const firstRow = document.querySelector('table tr:nth-child(2)');
                if (firstRow) {
                    const cells = firstRow.querySelectorAll('td');
                    return {
                        diagramPosition: cells[0]?.textContent?.trim() || '',
                        partNumber: cells[1]?.textContent?.trim() || '',
                        description: cells[2]?.textContent?.trim() || '',
                        quantity: cells[3]?.textContent?.trim() || '',
                        fromDate: cells[4]?.textContent?.trim() || '',
                        toDate: cells[5]?.textContent?.trim() || '',
                        supplement: cells[6]?.textContent?.trim() || '',
                    };
                }

                // Try standalone part detail elements
                const pn = document.querySelector('.partNumber, #partNumber, [data-part-number]');
                const desc = document.querySelector('.partDescription, #partDescription, h1, h2');
                return {
                    partNumber: pn?.textContent?.trim() || '',
                    description: desc?.textContent?.trim() || '',
                    diagramPosition: '',
                    quantity: '',
                    fromDate: '',
                    toDate: '',
                    supplement: '',
                };
            });
        } catch (err) {
            this.logger.warn('Failed to extract part data');
            return { partNumber: '', description: '', diagramPosition: '', quantity: '', fromDate: '', toDate: '', supplement: '' };
        }
    }

    private async extractDiagram(page: Page, baseUrl: string): Promise<{
        imageUrl?: string; diagramId?: string; groupName?: string;
    }> {
        try {
            return await page.evaluate((base: string) => {
                // Diagram image
                const imgSelectors = [
                    'img.diagram', 'img.partsDiagram', 'img[src*="diagram"]',
                    'img[src*="etk"]', '.diagramImage img', '#diagram img',
                    'img[usemap]', // image maps are common in parts diagrams
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

                // Group/category name from breadcrumb or heading
                const groupEl = document.querySelector(
                    '.groupName, .diagramTitle, h2.group, .breadcrumb li:last-child, .group-name'
                );
                const groupName = groupEl?.textContent?.trim() || '';

                // Diagram ID from URL or data attribute
                const diagramIdEl = document.querySelector('[data-diagram-id]');
                const diagramId = diagramIdEl?.getAttribute('data-diagram-id') || '';

                return { imageUrl, diagramId: diagramId || undefined, groupName: groupName || undefined };
            }, baseUrl);
        } catch (err) {
            this.logger.warn('Failed to extract diagram');
            return {};
        }
    }

    private async extractVehicleInfo(
        page: Page,
        modelInfo: { series?: string; bodyType?: string; model?: string },
    ): Promise<Vehicle> {
        try {
            const pageVehicle = await page.evaluate(() => {
                // Try vehicle header/title
                const headerEl = document.querySelector(
                    '.vehicleTitle, .modelTitle, h1, .vehicle-info, #vehicleInfo'
                );
                const text = headerEl?.textContent?.trim() || '';

                // Parse "BMW 3 Series E90 330i 2006-2012"
                const yearMatch = text.match(/(\d{4})\s*[-–]\s*(\d{4})/);
                const modelMatch = text.match(/(?:BMW|MINI)\s+(.+?)(?:\s+\d{4}|$)/i);

                return {
                    rawText: text,
                    yearFrom: yearMatch ? parseInt(yearMatch[1], 10) : undefined,
                    yearTo: yearMatch ? parseInt(yearMatch[2], 10) : undefined,
                    modelText: modelMatch ? modelMatch[1].trim() : '',
                };
            });

            const vehicle: Vehicle = {
                make: 'BMW',
                model: modelInfo.model || pageVehicle.modelText || '',
                year: pageVehicle.yearFrom,
                bodyType: modelInfo.series, // E90, F30, G20, etc.
            };

            // Map series code to series name
            if (modelInfo.series) {
                const seriesName = BMW_SERIES_MAP[modelInfo.series] || modelInfo.series;
                vehicle.submodel = seriesName;
            }

            return vehicle;
        } catch (err) {
            this.logger.warn('Failed to extract vehicle info');
            return { make: 'BMW', model: modelInfo.model || '' };
        }
    }

    private async extractRelatedParts(page: Page, baseUrl: string): Promise<string[]> {
        try {
            return await page.evaluate((base: string) => {
                const links: string[] = [];
                const rows = document.querySelectorAll('table tr');
                rows.forEach(row => {
                    const link = row.querySelector('a[href]');
                    const href = link?.getAttribute('href') || '';
                    if (href && !href.startsWith('#') && !href.startsWith('javascript')) {
                        const fullUrl = href.startsWith('http') ? href : `${base}${href}`;
                        if (!links.includes(fullUrl)) links.push(fullUrl);
                    }
                });
                return links.slice(0, 50); // cap at 50 related parts
            }, baseUrl);
        } catch (err) {
            this.logger.warn('Failed to extract related parts');
            return [];
        }
    }
}
