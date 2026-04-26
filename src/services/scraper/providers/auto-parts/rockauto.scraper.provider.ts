// @ts-nocheck
import { Logger } from '@nestjs/common';
import puppeteer, { Browser, Page } from 'puppeteer';
import { ScraperProvider } from '../../scraper.service';
import {
  ScrapedProduct,
  ScrapedSearchResult,
  ScrapedProductSummary,
  ScrapedImage,
  ScrapedSpecification,
  ScrapedSeller,
} from '../../interfaces/scraped-product.interface';
import {
  ScrapedAutoPart,
  Vehicle,
  AutoPartImage,
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// RockAutoProvider — rockauto.com
// ---------------------------------------------------------------------------

/**
 * Scraper provider for rockauto.com — largest aftermarket + OEM parts catalog.
 *
 * Supports:
 * - Vehicle navigation: Year > Make > Model > Parts Category
 * - No diagrams but massive catalog (400+ manufacturers)
 * - Multiple sellers per part with different prices
 * - Part number cross-references
 *
 * RockAuto uses a JS-heavy page with expandable categories and dynamic content
 * loading. Parts are organized in a tree: Year > Make > Model > Engine > Category.
 */
export class RockAutoScraperProvider implements ScraperProvider {
  private readonly logger = new Logger(RockAutoScraperProvider.name);
  private readonly config = AUTO_PARTS_PLATFORMS.rockauto;
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
      return hostname.includes('rockauto.com');
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
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
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

  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  // ------------------------------------------------------------------
  // Utility
  // ------------------------------------------------------------------

  private parsePrice(text: string | null | undefined): number {
    if (!text) return 0;
    const cleaned = text.replace(/[^\d.,]/g, '');
    return parseFloat(cleaned.replace(/,/g, '')) || 0;
  }

  private parseDiscount(msrp: number, salePrice: number): number {
    if (!msrp || msrp <= 0 || salePrice >= msrp) return 0;
    return Math.round(((msrp - salePrice) / msrp) * 100);
  }

  /**
   * RockAuto encodes vehicle/category path in the URL.
   * e.g. /en/catalog/honda,1,2024,civic,+2.0l+l4+dohc,+brakes
   */
  private parseRockAutoUrl(url: string): {
    make?: string; year?: string; model?: string; engine?: string; category?: string;
  } {
    try {
      const path = new URL(url).pathname;
      const parts = path.split('/').filter(Boolean);
      // catalog URL parts after /en/catalog/
      const catalogIdx = parts.indexOf('catalog');
      if (catalogIdx === -1) return {};

      const segments = parts.slice(catalogIdx + 1).join('/').split(',');
      return {
        make: segments[0] || undefined,
        year: segments[2] || undefined,
        model: segments[3] || undefined,
        engine: segments[4]?.replace(/\+/g, ' ').trim() || undefined,
        category: segments[5]?.replace(/\+/g, ' ').trim() || undefined,
      };
    } catch {
      return {};
    }
  }

  // ------------------------------------------------------------------
  // scrapeSearch — navigate catalog pages, extract part listings
  // ------------------------------------------------------------------

  async scrapeSearch(url: string): Promise<ScrapedSearchResult> {
    this.logger.log(`[scrapeSearch] url=${url}`);
    const page = await this.createPage();
    const urlMeta = this.parseRockAutoUrl(url);

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45_000 });
      await delay(2000 + Math.random() * 1500);

      // RockAuto loads parts dynamically in category sections. Wait for them.
      const contentSelectors = [
        'table.ra-group-display',
        '.listing-inner',
        'td[id^="listingcontainer"]',
        'table[id^="vParts"]',
        '.ra-listing-description',
      ];

      let found = false;
      for (const sel of contentSelectors) {
        try {
          await page.waitForSelector(sel, { timeout: 8000 });
          found = true;
          break;
        } catch { /* try next */ }
      }

      if (!found) {
        // RockAuto may show category tree that needs expanding
        this.logger.warn('No parts listing found — may be a category navigation page');
      }

      const products: ScrapedProductSummary[] = await page.evaluate((baseUrl, metaMake) => {
        const items: ScrapedProductSummary[] = [];

        // RockAuto uses table-based layout with specific class patterns
        const partContainers = document.querySelectorAll(
          'tr[id^="listingcontainer"], .ra-listing-description, td.listing-inner-content, .ra-group-display tbody tr',
        );

        partContainers.forEach((container) => {
          // Part name and description
          const nameEl = container.querySelector(
            '.listing-text-row-moreinfo-truck a, .listing-text-row a, span.listing-text-row, a.ra-btn-moreinfo',
          );
          const name = nameEl?.textContent?.trim() || '';

          // Part number
          const partNumEl = container.querySelector(
            '.listing-text-row-partnumber, span[id*="partnumber"], .ra-listing-partnumber',
          );
          const partNumber = partNumEl?.textContent?.trim().replace(/Part #\s*/i, '') || '';

          // Brand / manufacturer
          const brandEl = container.querySelector(
            '.listing-text-row-brand, img.listing-inline-brand, span[id*="brand"]',
          );
          const brand = brandEl?.textContent?.trim() || (brandEl as HTMLImageElement)?.alt || '';

          // Price — RockAuto shows "core" price + part price
          const priceEl = container.querySelector(
            'span.ra-formatted-amount, .listing-price, span[id*="price"]',
          );
          const priceText = priceEl?.textContent?.trim() || '';

          // Image
          const imgEl = container.querySelector('img.listing-inline-image, img[id*="listing"]') as HTMLImageElement;
          const image = imgEl?.src || '';

          // Link
          const linkEl = container.querySelector('a[href*="moreinfo"]') as HTMLAnchorElement;
          const href = linkEl?.href || '';

          if (name || partNumber) {
            const fullName = brand ? `${brand} ${name}` : name;
            const productUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
            const price = parseFloat(priceText.replace(/[^\d.]/g, '')) || 0;

            items.push({
              productName: partNumber ? `${partNumber} - ${fullName}` : fullName,
              productUrl,
              productPrice: price,
              offerPrice: price || undefined,
              image: image || undefined,
              inStock: true, // RockAuto generally shows only in-stock items
              brandName: brand || undefined,
            });
          }
        });

        return items;
      }, this.config.baseUrl, urlMeta.make);

      this.logger.log(`[scrapeSearch] Found ${products.length} parts from ${url}`);
      return {
        products,
        totalResults: products.length,
        currentPage: 1,
        totalPages: 1,
        searchQuery: urlMeta.category
          ? `${urlMeta.year || ''} ${urlMeta.make || ''} ${urlMeta.model || ''} ${urlMeta.category}`.trim()
          : undefined,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[scrapeSearch] Failed: ${msg}`);
      throw new Error(`RockAuto scrapeSearch failed: ${msg}`);
    } finally {
      await page.close();
    }
  }

  // ------------------------------------------------------------------
  // scrapeProduct — extract part details, sellers/prices, cross-refs
  // ------------------------------------------------------------------

  async scrapeProduct(url: string): Promise<ScrapedProduct> {
    this.logger.log(`[scrapeProduct] url=${url}`);
    const page = await this.createPage();
    const urlMeta = this.parseRockAutoUrl(url);

    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 45_000 });
      await delay(2000 + Math.random() * 1500);

      // Wait for product detail content
      try {
        await page.waitForSelector(
          '.moreinfo-bold-partnumber, .ra-moreinfo, .listing-final-moreinfo, td.moreinfo',
          { timeout: 10_000 },
        );
      } catch {
        this.logger.warn('Product detail container not found — scraping available data');
      }

      const partData = await page.evaluate(() => {
        const getText = (sel: string) => document.querySelector(sel)?.textContent?.trim() || '';
        const getAllText = (sel: string) =>
          Array.from(document.querySelectorAll(sel)).map((el) => el.textContent?.trim() || '').filter(Boolean);

        // Part identification
        const partNumber = getText(
          '.moreinfo-bold-partnumber, span[id*="partnumber"].listing-text-row-partnumber, .ra-moreinfo-partnumber',
        );
        const name = getText('.moreinfo-text-description, .listing-text-row-moreinfo-truck, .ra-moreinfo-desc');
        const brand = getText('.moreinfo-brand, .listing-text-row-brand, img.moreinfo-brand-image')
          || (document.querySelector('img.moreinfo-brand-image') as HTMLImageElement)?.alt || '';

        // Description
        const description = getText('.moreinfo-text-notes, .ra-moreinfo-notes, .listing-notes');

        // Price — RockAuto shows multiple sellers with different prices
        interface SellerInfo { name: string; price: number; corePrice: number; inStock: boolean }
        const sellers: SellerInfo[] = [];

        const sellerRows = document.querySelectorAll(
          'tr.ra-group-display-price, .moreinfo-warehouse-row, table.ra-warehouse-display tr',
        );

        sellerRows.forEach((row) => {
          const sellerName = row.querySelector('.warehouse-name, td:first-child')?.textContent?.trim() || 'RockAuto';
          const priceEl = row.querySelector('span.ra-formatted-amount, .warehouse-price');
          const price = parseFloat(priceEl?.textContent?.replace(/[^\d.]/g, '') || '0') || 0;
          const corePriceEl = row.querySelector('.core-price, .listing-core-price');
          const corePrice = parseFloat(corePriceEl?.textContent?.replace(/[^\d.]/g, '') || '0') || 0;
          const stockEl = row.querySelector('.availability, .stock-status, .in-stock');
          const inStock = stockEl ? !stockEl.textContent?.toLowerCase().includes('out of stock') : true;

          if (price > 0) {
            sellers.push({ name: sellerName, price, corePrice, inStock });
          }
        });

        // If no seller rows found, grab single price
        if (sellers.length === 0) {
          const singlePrice = getText('span.ra-formatted-amount, .listing-price');
          const priceNum = parseFloat(singlePrice.replace(/[^\d.]/g, '') || '0') || 0;
          if (priceNum > 0) {
            sellers.push({ name: 'RockAuto', price: priceNum, corePrice: 0, inStock: true });
          }
        }

        // Cross-references / interchange
        const crossRefs = getAllText(
          '.interchange-partnumber, .cross-reference-number, .moreinfo-text-interchange span',
        );

        // Specifications / attributes
        const specRows = document.querySelectorAll('.moreinfo-specifications tr, .ra-moreinfo-attr tr, table.moreinfo-table tr');
        const specs: Array<{ label: string; value: string }> = [];
        specRows.forEach((row) => {
          const label = row.querySelector('td:first-child, th')?.textContent?.trim() || '';
          const value = row.querySelector('td:last-child, td:nth-child(2)')?.textContent?.trim() || '';
          if (label && value && label !== value) {
            specs.push({ label, value });
          }
        });

        // Vehicle fitment
        const fitmentRows = document.querySelectorAll('.moreinfo-fitment tr, .vehicle-fitment-list li');
        const vehicles: Array<{ year?: number; make: string; model: string; engine?: string }> = [];
        fitmentRows.forEach((row) => {
          const text = row.textContent?.trim() || '';
          // Parse "2024 Honda Civic 2.0L L4"
          const match = text.match(/(\d{4})\s+(\w+)\s+(.+?)(?:\s+(\d\.\d+L.*))?$/i);
          if (match) {
            vehicles.push({
              year: parseInt(match[1], 10),
              make: match[2],
              model: match[3].trim(),
              engine: match[4]?.trim() || undefined,
            });
          }
        });

        // Images
        const imageEls = document.querySelectorAll(
          'img.moreinfo-image, .moreinfo-images img, .ra-moreinfo img[src*="catalog"]',
        );
        const images = Array.from(imageEls).map((img) => {
          const imgEl = img as HTMLImageElement;
          return { url: imgEl.src || '', alt: imgEl.alt || '' };
        }).filter((i) => i.url);

        // Category / part type
        const categoryPath = getAllText('.navlabellink, .breadcrumb a, #breadcrumb span').join(' > ');

        // Weight info
        const weight = getText('.moreinfo-weight, [data-field="weight"]');

        // Genuine OEM vs aftermarket
        const isGenuine = (brand.toLowerCase().includes('genuine') || brand.toLowerCase().includes('oem'))
          || name.toLowerCase().includes('genuine') || name.toLowerCase().includes('oem');

        return {
          partNumber,
          name,
          brand,
          description,
          sellers,
          crossRefs,
          specs,
          vehicles,
          images,
          categoryPath,
          weight,
          isGenuine,
        };
      });

      // Pick lowest seller price as offer, highest as list price
      const sortedSellers = partData.sellers.sort((a, b) => a.price - b.price);
      const lowestPrice = sortedSellers[0]?.price || 0;
      const highestPrice = sortedSellers.length > 1 ? sortedSellers[sortedSellers.length - 1].price : lowestPrice;

      // Build auto part metadata
      const autoPart: ScrapedAutoPart = {
        partNumber: partData.partNumber,
        name: partData.name,
        description: partData.description || undefined,
        price: lowestPrice,
        currency: 'USD',
        msrp: highestPrice > lowestPrice ? highestPrice : undefined,
        discount: this.parseDiscount(highestPrice, lowestPrice),
        category: partData.categoryPath.split(' > ').slice(-2, -1)[0] || 'Parts',
        subcategory: partData.categoryPath.split(' > ').pop() || undefined,
        vehicles: (partData.vehicles as Vehicle[]) || [],
        images: partData.images.map((img): AutoPartImage => ({
          url: img.url,
          type: 'product',
          alt: img.alt,
        })),
        sourceUrl: url,
        sourcePlatform: 'rockauto',
        brand: partData.brand || undefined,
        isGenuine: partData.isGenuine,
        inStock: sortedSellers.some((s) => s.inStock),
        weight: partData.weight || undefined,
        crossReferences: partData.crossRefs.length > 0 ? partData.crossRefs : undefined,
        metadata: {
          sellers: partData.sellers,
          coreCharge: sortedSellers[0]?.corePrice || undefined,
        },
      };

      // Map primary seller
      const primarySeller = sortedSellers[0];
      const seller: ScrapedSeller | undefined = primarySeller
        ? {
            name: primarySeller.name,
            storeName: 'RockAuto',
            storeUrl: 'https://www.rockauto.com',
          }
        : undefined;

      // Map to ScrapedProduct
      const result: ScrapedProduct = {
        productName: partData.name || partData.partNumber,
        description: partData.description || undefined,
        productPrice: highestPrice || lowestPrice,
        offerPrice: lowestPrice,
        brandName: partData.brand || undefined,
        images: partData.images.map((img): ScrapedImage => ({
          url: img.url,
          imageName: img.alt || partData.partNumber,
          isPrimary: false,
        })),
        tags: ['rockauto', partData.brand, partData.partNumber, partData.isGenuine ? 'oem' : 'aftermarket']
          .filter(Boolean) as string[],
        specifications: partData.specs.map((s): ScrapedSpecification => ({
          label: s.label,
          value: s.value,
        })),
        sourceUrl: url,
        sourcePlatform: 'rockauto',
        inStock: sortedSellers.some((s) => s.inStock),
        seller,
        categoryPath: partData.categoryPath,
        metadata: {
          autoPart,
          partNumber: partData.partNumber,
          allSellers: partData.sellers,
          crossReferences: partData.crossRefs,
          vehicles: partData.vehicles,
          isGenuine: partData.isGenuine,
        },
      };

      if (result.images && result.images.length > 0) {
        result.images[0].isPrimary = true;
      }

      this.logger.log(`[scrapeProduct] Scraped part: ${partData.partNumber} — ${partData.name} (${sortedSellers.length} sellers)`);
      return result;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[scrapeProduct] Failed: ${msg}`);
      throw new Error(`RockAuto scrapeProduct failed: ${msg}`);
    } finally {
      await page.close();
    }
  }

  // ------------------------------------------------------------------
  // scrapeVehicleCatalog — get all makes/models by year
  // ------------------------------------------------------------------

  async scrapeVehicleCatalog(): Promise<Array<{ year: number; make: string; models: string[] }>> {
    this.logger.log('[scrapeVehicleCatalog] Starting RockAuto vehicle catalog scrape');
    const page = await this.createPage();
    const catalog: Array<{ year: number; make: string; models: string[] }> = [];

    try {
      // RockAuto catalog root: /en/catalog/
      await page.goto(`${this.config.baseUrl}/`, { waitUntil: 'networkidle2', timeout: 45_000 });
      await delay(2000 + Math.random() * 1000);

      // Extract year links from the main catalog page
      const years = await page.evaluate(() => {
        const yearLinks = document.querySelectorAll(
          'a.navlabellink[href*="catalog/"], a[href*="/en/catalog/"] , .ranavnode a',
        );
        const yearSet = new Set<string>();
        yearLinks.forEach((el) => {
          const text = el.textContent?.trim() || '';
          const year = parseInt(text, 10);
          if (year >= 2010 && year <= 2026) {
            yearSet.add(year);
          }
        });
        return Array.from(yearSet).sort((a, b) => b - a);
      });

      this.logger.log(`[scrapeVehicleCatalog] Found ${years.length} years to process`);

      for (const year of years) {
        // Navigate to year page to get makes
        const yearUrl = `${this.config.baseUrl}/${year}`;
        await page.goto(yearUrl, { waitUntil: 'networkidle2', timeout: 45_000 });
        await delay(this.getRateLimitDelay());

        const makesAndModels = await page.evaluate((currentYear) => {
          const results: Array<{ make: string; models: string[] }> = [];

          // RockAuto shows makes as expandable nodes
          const makeNodes = document.querySelectorAll(
            '.ranavnode a.navlabellink, a[href*="catalog/"][class*="nav"]',
          );

          const makeSet = new Map<string, string[]>();

          makeNodes.forEach((node) => {
            const text = node.textContent?.trim() || '';
            const href = (node as HTMLAnchorElement).href || '';

            // Determine if this is a make or model
            // Make links: /en/catalog/honda,1,2024
            // Model links: /en/catalog/honda,1,2024,civic
            const segments = href.split(',');

            if (segments.length === 3) {
              // This is a make
              if (!makeSet.has(text)) {
                makeSet.set(text, []);
              }
            } else if (segments.length >= 4) {
              // This is a model — extract make from parent or URL
              const makePart = segments[0].split('/').pop() || '';
              const make = makePart.charAt(0).toUpperCase() + makePart.slice(1);
              if (!makeSet.has(make)) {
                makeSet.set(make, []);
              }
              makeSet.get(make)!.push(text);
            }
          });

          makeSet.forEach((models, make) => {
            results.push({ make, models: Array.from(new Set(models)) });
          });

          return results;
        }, year);

        for (const entry of makesAndModels) {
          if (entry.models.length > 0) {
            catalog.push({
              year,
              make: entry.make,
              models: entry.models,
            });
          } else {
            // Need to navigate into make page to get models
            catalog.push({
              year,
              make: entry.make,
              models: [], // Will be filled on deeper scrape
            });
          }
        }
      }

      this.logger.log(`[scrapeVehicleCatalog] Collected ${catalog.length} year-make entries`);
      return catalog;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[scrapeVehicleCatalog] Failed: ${msg}`);
      throw new Error(`RockAuto scrapeVehicleCatalog failed: ${msg}`);
    } finally {
      await page.close();
    }
  }

  // ------------------------------------------------------------------
  // Rate limiting
  // ------------------------------------------------------------------

  private getRateLimitDelay(): number {
    // config.rateLimit = 15 req/min → ~4000ms between requests
    const baseDelay = Math.ceil(60_000 / this.config.rateLimit);
    const jitter = Math.random() * 1500;
    return baseDelay + jitter;
  }
}