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

// ---------------------------------------------------------------------------
// Region & domain map
// ---------------------------------------------------------------------------
type AmazonRegion =
    | 'us' | 'ae' | 'uk' | 'de' | 'fr' | 'es' | 'it'
    | 'jp' | 'in' | 'ca' | 'au' | 'sa' | 'sg' | 'mx' | 'br';

const DOMAIN_MAP: Record<AmazonRegion, string> = {
    us: 'amazon.com',
    ae: 'amazon.ae',
    uk: 'amazon.co.uk',
    de: 'amazon.de',
    fr: 'amazon.fr',
    es: 'amazon.es',
    it: 'amazon.it',
    jp: 'amazon.co.jp',
    in: 'amazon.in',
    ca: 'amazon.ca',
    au: 'amazon.com.au',
    sa: 'amazon.sa',
    sg: 'amazon.sg',
    mx: 'amazon.com.mx',
    br: 'amazon.com.br',
};

const REGION_LANG: Record<AmazonRegion, string> = {
    us: 'en-US,en;q=0.9',
    ae: 'en-AE,ar;q=0.9,en;q=0.8',
    uk: 'en-GB,en;q=0.9',
    de: 'de-DE,de;q=0.9,en;q=0.8',
    fr: 'fr-FR,fr;q=0.9,en;q=0.8',
    es: 'es-ES,es;q=0.9,en;q=0.8',
    it: 'it-IT,it;q=0.9,en;q=0.8',
    jp: 'ja-JP,ja;q=0.9,en;q=0.8',
    in: 'en-IN,en;q=0.9,hi;q=0.8',
    ca: 'en-CA,en;q=0.9,fr;q=0.8',
    au: 'en-AU,en;q=0.9',
    sa: 'ar-SA,ar;q=0.9,en;q=0.8',
    sg: 'en-SG,en;q=0.9,zh;q=0.8',
    mx: 'es-MX,es;q=0.9,en;q=0.8',
    br: 'pt-BR,pt;q=0.9,en;q=0.8',
};

const REGION_ORIGIN: Record<AmazonRegion, string> = {
    us: 'USA', ae: 'UAE', uk: 'United Kingdom', de: 'Germany',
    fr: 'France', es: 'Spain', it: 'Italy', jp: 'Japan',
    in: 'India', ca: 'Canada', au: 'Australia', sa: 'Saudi Arabia',
    sg: 'Singapore', mx: 'Mexico', br: 'Brazil',
};

const CURRENCY_SYMBOLS: Record<string, string> = {
    us: '$', ae: 'AED', uk: '£', de: '€', fr: '€', es: '€', it: '€',
    jp: '¥', in: '₹', ca: 'CA$', au: 'A$', sa: 'SAR', sg: 'S$',
    mx: 'MX$', br: 'R$',
};

// ---------------------------------------------------------------------------
// Category allowlist — only tech / industrial
// ---------------------------------------------------------------------------
const ALLOWED_CATEGORIES = [
    'electronics', 'computers', 'computer', 'industrial', 'scientific',
    'automotive', 'office', 'office products', 'pc', 'laptop', 'tablet',
    'smartphone', 'phone', 'camera', 'audio', 'video', 'networking',
    'storage', 'components', 'peripherals', 'software', 'accessories',
    'smart home', 'wearable', 'drone', 'printer', 'scanner', 'monitor',
    'tv', 'television', 'gaming', 'console',
];

const EXCLUDED_CATEGORIES = [
    'home & kitchen', 'kitchen', 'toys', 'clothing', 'fashion', 'apparel',
    'grocery', 'gourmet', 'health', 'beauty', 'personal care', 'garden',
    'outdoor', 'pet', 'pet supplies', 'sports', 'fitness', 'baby',
    'books', 'music', 'dvd', 'arts', 'crafts', 'sewing', 'shoes',
    'jewelry', 'watches', 'luggage', 'handmade',
];

// ---------------------------------------------------------------------------
// Anti-detection: user-agent & viewport rotation
// ---------------------------------------------------------------------------
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
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
// Provider
// ---------------------------------------------------------------------------

/**
 * Scraper provider for ALL Amazon regional domains.
 *
 * Supports 15 regions (us, ae, uk, de, fr, es, it, jp, in, ca, au, sa, sg,
 * mx, br). Only scrapes tech-related categories.
 */
export class AmazonGlobalScraperProvider implements ScraperProvider {
    private readonly logger = new Logger(AmazonGlobalScraperProvider.name);
    private browser: Browser | null = null;

    // ------------------------------------------------------------------
    // canScrape — accept any amazon.* domain
    // ------------------------------------------------------------------

    canScrape(url: string): boolean {
        try {
            let candidate = url;
            if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(candidate)) {
                candidate = 'http://' + candidate;
            }
            const hostname = new URL(candidate).hostname.toLowerCase();
            return /^(www\.)?amazon\.[a-z.]+$/.test(hostname);
        } catch {
            return false;
        }
    }

    // ------------------------------------------------------------------
    // Region helpers
    // ------------------------------------------------------------------

    private detectRegion(url: string): AmazonRegion {
        try {
            const hostname = new URL(url).hostname.toLowerCase();
            for (const [region, domain] of Object.entries(DOMAIN_MAP)) {
                if (hostname === domain || hostname === `www.${domain}`) {
                    return region as AmazonRegion;
                }
            }
        } catch { /* fallback below */ }
        return 'us';
    }

    private isTechCategory(categoryText: string): boolean {
        if (!categoryText) return true; // allow when unknown
        const lower = categoryText.toLowerCase();
        if (EXCLUDED_CATEGORIES.some(ex => lower.includes(ex))) return false;
        if (ALLOWED_CATEGORIES.some(al => lower.includes(al))) return true;
        return true; // default to allowed when ambiguous
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
                    '--disable-blink-features=AutomationControlled',
                    '--window-size=1920,1080',
                ],
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            });
        }
        return this.browser;
    }

    private async createPage(region: AmazonRegion = 'us'): Promise<Page> {
        const browser = await this.getBrowser();
        const page = await browser.newPage();

        const ua = randomItem(USER_AGENTS);
        const vp = randomItem(VIEWPORTS);

        await page.setUserAgent(ua);
        await page.setViewport(vp);
        await page.setExtraHTTPHeaders({
            'Accept-Language': REGION_LANG[region] || 'en-US,en;q=0.9',
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

    private parsePrice(text: string | null | undefined): number {
        if (!text) return 0;
        const cleaned = text.replace(/[^\d.,]/g, '');
        // Handle European comma-decimal: "1.234,56" → "1234.56"
        if (/\d+\.\d{3},\d{1,2}$/.test(cleaned)) {
            return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
        }
        // Handle standard: "1,234.56" → "1234.56"
        return parseFloat(cleaned.replace(/,/g, '')) || 0;
    }

    private cleanBrand(raw: string): string {
        if (!raw) return '';
        let t = raw
            .replace(/^(Brand:|Visit the|by|Visit|Shop)\s*/i, '')
            .replace(/^\s*-\s*/, '')
            .trim();
        t = t.split(/[\n\r|•]/)[0].trim();
        t = t.replace(/\s+(Store|Shop|Visit|Official|Storefront|Outlet|Retailer|Distributor|Seller|Merchant|Brand Store|Brand Shop).*$/i, '').trim();
        t = t.replace(/[.,;:]+$/, '').trim();
        return t.length > 0 && t.length < 50 ? t : '';
    }

    private extractAsin(url: string): string {
        const match = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
        return match ? match[1] : '';
    }

    // ------------------------------------------------------------------
    // scrapeSearch
    // ------------------------------------------------------------------

    async scrapeSearch(url: string): Promise<ScrapedSearchResult> {
        const region = this.detectRegion(url);
        this.logger.log(`[scrapeSearch] region=${region} url=${url}`);

        const page = await this.createPage(region);
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Wait for any common result container
            const containerSelectors = [
                '[data-component-type="s-search-result"]',
                '.s-result-item[data-asin]',
                'div[data-component-type="s-search-result"]',
                '.s-search-results .s-result-item',
                '[cel_widget_id*="MAIN-SEARCH_RESULTS"]',
            ];

            let found = false;
            for (const sel of containerSelectors) {
                try {
                    await page.waitForSelector(sel, { timeout: 5000 });
                    found = true;
                    break;
                } catch { /* try next */ }
            }

            if (!found) {
                this.logger.warn('No search-result selector matched — scraping anyway');
            }

            // Small delay for dynamic content
            await new Promise(r => setTimeout(r, 2000));

            const baseDomain = `${new URL(url).protocol}//${new URL(url).hostname}`;

            // ---- extract inside browser context ----
            const products: ScrapedProductSummary[] = await page.evaluate((base: string) => {
                const clean = (t: string): string => {
                    if (!t) return '';
                    return t
                        .replace(/^(Brand:|Visit the|by|Visit|Shop)\s*/i, '')
                        .replace(/^\s*-\s*/, '')
                        .split(/[\n\r|•]/)[0]
                        .replace(/\s+(Store|Shop|Visit|Official|Storefront).*$/i, '')
                        .replace(/[.,;:]+$/, '')
                        .trim();
                };

                const parseP = (raw: string): number => {
                    if (!raw) return 0;
                    const c = raw.replace(/[^\d.,]/g, '');
                    if (/\d+\.\d{3},\d{1,2}$/.test(c)) return parseFloat(c.replace(/\./g, '').replace(',', '.')) || 0;
                    return parseFloat(c.replace(/,/g, '')) || 0;
                };

                const items: ScrapedProductSummary[] = [];
                const selectors = [
                    '[data-component-type="s-search-result"]',
                    '.s-result-item[data-asin]:not([data-asin=""])',
                ];
                let elems: NodeListOf<Element> | null = null;
                for (const s of selectors) {
                    elems = document.querySelectorAll(s);
                    if (elems && elems.length > 0) break;
                }
                if (!elems || elems.length === 0) return items;

                elems.forEach(el => {
                    try {
                        // name
                        const nameEl = el.querySelector('h2 span') || el.querySelector('h2 a span') || el.querySelector('h2') || el.querySelector('.a-size-base-plus') || el.querySelector('.a-size-medium');
                        const productName = nameEl?.textContent?.trim() || '';

                        // url
                        const linkEl = el.querySelector('a.a-link-normal') || el.querySelector('h2 a') || el.querySelector('a[href*="/dp/"]');
                        const href = linkEl?.getAttribute('href') || '';
                        const productUrl = href.startsWith('http') ? href : `${base}${href}`;

                        // price
                        let productPrice = 0;
                        let offerPrice = 0;
                        const pw = el.querySelector('.a-price-whole');
                        if (pw) {
                            productPrice = parseP(pw.textContent || '');
                            offerPrice = productPrice;
                        }
                        if (productPrice === 0) {
                            const off = el.querySelector('.a-price .a-offscreen');
                            if (off) { productPrice = parseP(off.textContent || ''); offerPrice = productPrice; }
                        }
                        const strikeEl = el.querySelector('.a-price[data-a-strike="true"] .a-offscreen');
                        if (strikeEl && productPrice > 0) {
                            const sp = parseP(strikeEl.textContent || '');
                            if (sp > productPrice) offerPrice = sp;
                        }

                        // image
                        const imgEl = el.querySelector('img.s-image') || el.querySelector('img[data-image-latency]') || el.querySelector('.s-product-image-container img');
                        const image = imgEl?.getAttribute('src') || '';

                        // rating
                        const ratEl = el.querySelector('.a-icon-star-small .a-icon-alt') || el.querySelector('.a-icon-alt');
                        const rating = parseFloat((ratEl?.textContent?.trim() || '').split(' ')[0]) || 0;

                        // review count
                        const revEl = el.querySelector('[aria-label*="stars"]') || el.querySelector('.a-size-base.s-underline-text');
                        const revRaw = revEl?.getAttribute('aria-label') || revEl?.textContent || '';
                        const revMatch = revRaw.match(/(\d+(?:,\d+)*)/);
                        const reviewCount = revMatch ? parseInt(revMatch[1].replace(/,/g, '')) : 0;

                        // stock
                        const inStock = !el.textContent?.includes('Currently unavailable') && !el.textContent?.includes('Out of Stock');

                        // brand
                        const brandEl = el.querySelector('.s-title-instructions-style span') || el.querySelector('[data-brand]') || el.querySelector('.a-size-base-plus.a-color-secondary');
                        let brandName = clean(brandEl?.textContent?.trim() || '');
                        if (brandName.length > 50 || brandName === productName) brandName = '';

                        if (productName && productUrl) {
                            items.push({ productName, productUrl, productPrice, offerPrice, image, rating, reviewCount, inStock, brandName: brandName || undefined });
                        }
                    } catch { /* skip element */ }
                });

                return items;
            }, baseDomain);

            // Pagination info
            const pagination = await page.evaluate(() => {
                let totalPages = 1;
                const lastPageEl = document.querySelector('.s-pagination-item:not(.s-pagination-next):last-of-type');
                if (lastPageEl) {
                    const n = parseInt(lastPageEl.textContent?.trim().replace(/,/g, '') || '1');
                    if (!isNaN(n) && n > 0) totalPages = n;
                }
                const currentEl = document.querySelector('.s-pagination-item.s-pagination-selected');
                const currentPage = currentEl ? parseInt(currentEl.textContent?.trim() || '1') : 1;

                const countEl = document.querySelector('.s-breadcrumb-item .a-color-state') || document.querySelector('[data-component-type="s-result-info-bar"]');
                const countText = countEl?.textContent || '';
                const cMatch = countText.match(/([\d,]+)\s*result/i);
                const totalResults = cMatch ? parseInt(cMatch[1].replace(/,/g, '')) : 0;

                return { totalPages, currentPage, totalResults };
            });

            this.logger.log(`[scrapeSearch] ${products.length} products, page ${pagination.currentPage}/${pagination.totalPages}`);

            return {
                products,
                totalResults: pagination.totalResults || products.length,
                currentPage: pagination.currentPage,
                totalPages: pagination.totalPages,
                searchQuery: url,
            };
        } catch (error: any) {
            this.logger.error(`[scrapeSearch] ${error.message}`, error.stack);
            throw error;
        } finally {
            await page.close();
        }
    }

    // ------------------------------------------------------------------
    // scrapeProduct
    // ------------------------------------------------------------------

    async scrapeProduct(url: string): Promise<ScrapedProduct> {
        const region = this.detectRegion(url);
        this.logger.log(`[scrapeProduct] region=${region} url=${url}`);

        const page = await this.createPage(region);
        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            await page.waitForSelector('#productTitle', { timeout: 20000 });

            // ---------- core data (inside browser) ----------
            const core = await page.evaluate(() => {
                // --- helpers ---
                const cleanBrand = (t: string): string => {
                    if (!t) return '';
                    let b = t.replace(/^(Brand:|Visit the|by|Visit|Shop)\s*/i, '').replace(/^\s*-\s*/, '').trim();
                    b = b.split(/[\n\r|•]/)[0].replace(/\s+(Store|Shop|Visit|Official|Storefront|Outlet|Retailer|Distributor|Seller|Merchant).*$/i, '').replace(/[.,;:]+$/, '').trim();
                    return b.length > 0 && b.length < 50 ? b : '';
                };
                const parseP = (raw: string): number => {
                    if (!raw) return 0;
                    const c = raw.replace(/[^\d.,]/g, '');
                    if (/\d+\.\d{3},\d{1,2}$/.test(c)) return parseFloat(c.replace(/\./g, '').replace(',', '.')) || 0;
                    return parseFloat(c.replace(/,/g, '')) || 0;
                };

                // --- title ---
                const productName = document.querySelector('#productTitle')?.textContent?.trim() || '';

                // --- price ---
                let productPrice = 0;
                let offerPrice = 0;
                const priceSelectors = [
                    '.a-price-whole',
                    '.a-price .a-offscreen',
                    '#priceblock_ourprice',
                    '#priceblock_dealprice',
                    '#priceblock_saleprice',
                    '.a-price[data-a-color="base"] .a-offscreen',
                    '[data-a-color="price"] .a-offscreen',
                    '#price',
                    '.a-price-range .a-offscreen',
                ];
                for (const sel of priceSelectors) {
                    const el = document.querySelector(sel);
                    if (el) {
                        const v = parseP(el.textContent || '');
                        if (v > 0) { productPrice = v; offerPrice = v; break; }
                    }
                }
                // strike-through
                const strikeSelectors = ['.a-price[data-a-strike="true"] .a-offscreen', '.a-price.a-text-strike .a-offscreen'];
                for (const sel of strikeSelectors) {
                    const el = document.querySelector(sel);
                    if (el) {
                        const v = parseP(el.textContent || '');
                        if (v > productPrice) { offerPrice = v; break; }
                    }
                }
                if (offerPrice === 0 && productPrice > 0) offerPrice = productPrice;

                // --- brand ---
                let brandName = '';
                // from product details tables
                const detailTables = ['#productDetails_feature_div', '#productDetails_techSpec_section_1', '#productDetails_detailBullets_sections1'];
                for (const ts of detailTables) {
                    const table = document.querySelector(ts);
                    if (!table) continue;
                    const rows = Array.from(table.querySelectorAll('tr'));
                    for (let ri = 0; ri < rows.length; ri++) {
                        const th = rows[ri].querySelector('th')?.textContent?.trim() || '';
                        const td = rows[ri].querySelector('td')?.textContent?.trim() || '';
                        if (th.toLowerCase().includes('brand')) { brandName = cleanBrand(td); break; }
                    }
                    if (brandName) break;
                }
                // from byline
                if (!brandName) {
                    const byEl = document.querySelector('#bylineInfo');
                    if (byEl) brandName = cleanBrand(byEl.textContent?.trim() || '');
                }
                // from po-brand
                if (!brandName) {
                    const poEl = document.querySelector('.po-brand .po-break-word');
                    if (poEl) brandName = cleanBrand(poEl.textContent?.trim() || '');
                }

                // --- description ---
                const descEl = document.querySelector('#feature-bullets') || document.querySelector('#productDescription');
                const description = descEl?.textContent?.trim() || '';
                const firstBullet = document.querySelector('#feature-bullets ul li span')?.textContent?.trim();
                const shortDescription = firstBullet || description.substring(0, 200);

                // --- images ---
                const images: Array<{ url: string; imageName: string; isPrimary: boolean }> = [];
                // try alt thumbnails
                document.querySelectorAll('#altImages img').forEach((img, idx) => {
                    const src = img.getAttribute('src') || img.getAttribute('data-old-src') || img.getAttribute('data-src') || '';
                    if (src && src.startsWith('http') && !src.includes('play-icon') && !src.includes('360') && !src.includes('spin') && (src.includes('.jpg') || src.includes('.jpeg') || src.includes('.png') || src.includes('.webp') || src.includes('images-amazon'))) {
                        const largeUrl = src.replace(/\._.*_\./, '.').replace(/_AC_[^_]+_/, '_AC_SX679_');
                        images.push({ url: largeUrl, imageName: `image_${idx + 1}`, isPrimary: idx === 0 });
                    }
                });
                // try JS gallery data
                if (images.length === 0) {
                    try {
                        const scripts = Array.from(document.querySelectorAll('script'));
                        for (let si = 0; si < scripts.length; si++) {
                            const text = scripts[si].textContent || '';
                            const match = text.match(/'colorImages':\s*\{[^}]*?"initial":\s*(\[[^\]]*\])/);
                            if (match) {
                                const parsed: any[] = JSON.parse(match[1]);
                                parsed.forEach((item: any, idx: number) => {
                                    const u = item.hiRes || item.large || item.thumb;
                                    if (u) images.push({ url: u, imageName: `image_${idx + 1}`, isPrimary: idx === 0 });
                                });
                                break;
                            }
                        }
                    } catch { /* ignore */ }
                }
                // main image fallback
                if (images.length === 0) {
                    const main = document.querySelector('#landingImage') || document.querySelector('#imgBlkFront');
                    const mainSrc = main?.getAttribute('src') || main?.getAttribute('data-old-src') || main?.getAttribute('data-a-dynamic-image');
                    if (mainSrc) {
                        let finalSrc = mainSrc;
                        if (mainSrc.startsWith('{')) {
                            try { const keys = Object.keys(JSON.parse(mainSrc)); if (keys.length) finalSrc = keys[0]; } catch { /* skip */ }
                        }
                        if (finalSrc.startsWith('http')) images.push({ url: finalSrc, imageName: 'image_1', isPrimary: true });
                    }
                }

                // --- rating ---
                const ratEl = document.querySelector('#acrPopover .a-icon-alt') || document.querySelector('.a-icon-star .a-icon-alt');
                const rating = parseFloat((ratEl?.textContent?.trim() || '').split(' ')[0]) || 0;

                // --- review count ---
                const revEl = document.querySelector('#acrCustomerReviewText');
                const revMatch = (revEl?.textContent || '').match(/(\d+(?:,\d+)*)/);
                const reviewCount = revMatch ? parseInt(revMatch[1].replace(/,/g, '')) : 0;

                // --- stock ---
                const availEl = document.querySelector('#availability span');
                const availText = availEl?.textContent?.trim().toLowerCase() || '';
                const inStock = !availText.includes('out of stock') && !availText.includes('currently unavailable');

                // --- specifications ---
                const specifications: Array<{ label: string; value: string }> = [];
                document.querySelectorAll('#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr, #productDetails_db_sections tr').forEach(row => {
                    const label = row.querySelector('th')?.textContent?.trim();
                    const value = row.querySelector('td')?.textContent?.trim();
                    if (label && value) specifications.push({ label, value });
                });
                // detail bullets
                document.querySelectorAll('#detailBullets_feature_div ul li').forEach(li => {
                    const text = li.textContent?.trim() || '';
                    const parts = text.split(':');
                    if (parts.length >= 2) specifications.push({ label: parts[0].trim(), value: parts.slice(1).join(':').trim() });
                });
                // product-overview bullets
                document.querySelectorAll('#productOverview_feature_div tr').forEach(row => {
                    const label = row.querySelector('td:first-child span')?.textContent?.trim();
                    const value = row.querySelector('td:last-child span')?.textContent?.trim();
                    if (label && value && label !== value) specifications.push({ label, value });
                });

                // --- barcode / ASIN / EAN ---
                let barcode = '';
                for (const spec of specifications) {
                    const lbl = spec.label.toLowerCase();
                    if (lbl.includes('asin') || lbl.includes('ean') || lbl.includes('upc') || lbl.includes('isbn')) {
                        barcode = spec.value.trim();
                        break;
                    }
                }

                // --- category path ---
                const breadcrumbs: string[] = [];
                document.querySelectorAll('#wayfinding-breadcrumbs_feature_div ul li a, .a-subheader a').forEach(a => {
                    const t = a.textContent?.trim();
                    if (t) breadcrumbs.push(t);
                });
                const categoryPath = breadcrumbs.join(' > ');

                // --- variants ---
                const variants: Array<{ name: string; options: string[] }> = [];
                document.querySelectorAll('#variation_color_name, #variation_size_name, #variation_style_name, #variation_configuration, #variation_pattern_name').forEach(container => {
                    const label = container.querySelector('.a-form-label, .a-row label')?.textContent?.trim().replace(/:$/, '') || '';
                    const opts: string[] = [];
                    container.querySelectorAll('li img, li span.a-size-base, option').forEach(opt => {
                        const t = opt.getAttribute('alt') || opt.getAttribute('title') || opt.textContent?.trim() || '';
                        if (t && t !== 'Select' && t.length < 80 && !opts.includes(t)) opts.push(t);
                    });
                    if (label && opts.length > 0) variants.push({ name: label, options: opts });
                });
                // twister data fallback
                if (variants.length === 0) {
                    try {
                        const scripts = Array.from(document.querySelectorAll('script'));
                        for (let si = 0; si < scripts.length; si++) {
                            const text = scripts[si].textContent || '';
                            const match = text.match(/dataToReturn\s*=\s*(\{[^;]*\});/);
                            if (match) {
                                const data = JSON.parse(match[1]);
                                const dims = data?.dimensionValuesDisplayData;
                                if (dims && typeof dims === 'object') {
                                    const keys = Object.keys(dims);
                                    for (let ki = 0; ki < keys.length; ki++) {
                                        const vals = dims[keys[ki]];
                                        if (Array.isArray(vals) && vals.length > 0) {
                                            variants.push({ name: 'Variant', options: vals as string[] });
                                        }
                                    }
                                }
                                break;
                            }
                        }
                    } catch { /* ignore */ }
                }

                // --- seller ---
                let sellerName = '';
                let sellerUrl = '';
                const sellerEl = document.querySelector('#sellerProfileTriggerId') || document.querySelector('#merchant-info a') || document.querySelector('#tabular-buybox .tabular-buybox-text a');
                if (sellerEl) {
                    sellerName = sellerEl.textContent?.trim() || '';
                    sellerUrl = sellerEl.getAttribute('href') || '';
                }
                if (!sellerName) {
                    const merchantEl = document.querySelector('#merchant-info');
                    if (merchantEl) sellerName = merchantEl.textContent?.trim().replace(/^Sold by\s*/i, '').split('\n')[0].trim() || '';
                }

                // --- shipping ---
                let shippingText = '';
                const shipEl = document.querySelector('#deliveryBlockMessage') || document.querySelector('#mir-layout-DELIVERY_BLOCK') || document.querySelector('#delivery-message');
                if (shipEl) shippingText = shipEl.textContent?.trim() || '';
                const freeShipping = shippingText.toLowerCase().includes('free') || !!document.querySelector('#price-shipping-message .a-color-secondary');

                // --- related products ---
                const relatedProducts: string[] = [];
                document.querySelectorAll('#anonCarousel a[href*="/dp/"], #sp_detail a[href*="/dp/"], .a-carousel-card a[href*="/dp/"]').forEach(a => {
                    const href = a.getAttribute('href');
                    if (href) {
                        const full = href.startsWith('http') ? href : `${document.location.origin}${href}`;
                        if (!relatedProducts.includes(full) && relatedProducts.length < 20) relatedProducts.push(full);
                    }
                });

                return {
                    productName, productPrice, offerPrice, brandName, description, shortDescription,
                    images, rating, reviewCount, inStock, specifications, barcode, categoryPath,
                    variants, sellerName, sellerUrl, shippingText, freeShipping,
                    relatedProducts,
                };
            });

            // ---- build ScrapedProduct ----
            const asin = this.extractAsin(url) || core.barcode;

            const seller: ScrapedSeller | undefined = core.sellerName
                ? { name: core.sellerName, storeUrl: core.sellerUrl || undefined }
                : undefined;

            const shipping: ScrapedShipping | undefined = core.shippingText
                ? { freeShipping: core.freeShipping, methods: core.freeShipping ? ['Standard (Free)'] : ['Standard'] }
                : undefined;

            const variants: ScrapedVariant[] = (core.variants || []).map((v: any) => ({
                name: v.name,
                options: v.options,
            }));

            const scrapedProduct: ScrapedProduct = {
                productName: core.productName,
                description: core.description,
                shortDescription: core.shortDescription,
                productPrice: core.productPrice,
                offerPrice: core.offerPrice,
                brandName: core.brandName || undefined,
                barcode: asin || undefined,
                images: (core.images || []) as ScrapedImage[],
                placeOfOrigin: REGION_ORIGIN[region],
                productType: 'PHYSICAL',
                typeOfProduct: 'NEW',
                specifications: (core.specifications || []) as ScrapedSpecification[],
                sourceUrl: url,
                sourcePlatform: `Amazon.${DOMAIN_MAP[region].split('.').slice(1).join('.')}`,
                inStock: core.inStock,
                rating: core.rating,
                reviewCount: core.reviewCount,
                tags: this.extractTags(core.categoryPath, core.productName),
                categoryPath: core.categoryPath || undefined,
                sourceRegion: region,
                originalLanguage: REGION_LANG[region]?.split(',')[0]?.split('-')[0] || 'en',
                variants: variants.length > 0 ? variants : undefined,
                seller,
                shipping,
                relatedProducts: core.relatedProducts.length > 0 ? core.relatedProducts : undefined,
                metadata: {
                    asin,
                    scrapedAt: new Date().toISOString(),
                    sourceUrl: url,
                    region,
                    currency: CURRENCY_SYMBOLS[region] || '$',
                },
            };

            if (core.productPrice === 0) {
                this.logger.warn(`[scrapeProduct] Price extraction failed for "${core.productName}" (${url})`);
            } else {
                this.logger.log(`[scrapeProduct] OK "${core.productName}" price=${core.productPrice} brand=${core.brandName || '?'}`);
            }

            return scrapedProduct;
        } catch (error: any) {
            this.logger.error(`[scrapeProduct] ${error.message}`, error.stack);
            throw error;
        } finally {
            await page.close();
        }
    }

    // ------------------------------------------------------------------
    // Tag extraction helper
    // ------------------------------------------------------------------

    private extractTags(categoryPath: string | undefined, title: string): string[] {
        const tags: string[] = [];
        const seen: Record<string, boolean> = {};
        const addTag = (t: string) => { if (t && !seen[t]) { seen[t] = true; tags.push(t); } };

        if (categoryPath) {
            categoryPath.split('>').forEach(p => {
                const t = p.trim();
                if (t && t.length > 1 && t.length < 40) addTag(t);
            });
        }
        // add a few keywords from title
        const keywords = ['laptop', 'phone', 'tablet', 'camera', 'headphone', 'speaker', 'monitor', 'keyboard', 'mouse', 'printer', 'router', 'ssd', 'hdd', 'gpu', 'cpu', 'ram', 'charger', 'cable', 'adapter', 'drone', 'watch', 'earbuds'];
        const lowerTitle = title.toLowerCase();
        keywords.forEach(k => { if (lowerTitle.includes(k)) addTag(k); });
        return tags.slice(0, 15);
    }

    // ------------------------------------------------------------------
    // Category filter helper (exposed for orchestrator use)
    // ------------------------------------------------------------------

    isCategoryAllowed(categoryText: string): boolean {
        return this.isTechCategory(categoryText);
    }

    // ------------------------------------------------------------------
    // Cleanup
    // ------------------------------------------------------------------

    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.logger.log('Browser closed');
        }
    }
}
