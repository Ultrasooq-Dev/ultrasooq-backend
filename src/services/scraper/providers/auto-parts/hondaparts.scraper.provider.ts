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
  ScrapedAutoPart,
  Vehicle,
  PartsDiagram,
  DiagramPart,
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
// HondaPartsProvider — hondapartsnow.com
// ---------------------------------------------------------------------------

/**
 * Scraper provider for hondapartsnow.com — OEM Honda & Acura parts catalog.
 *
 * Supports:
 * - Vehicle navigation: Year > Make (Honda/Acura) > Model > Category > Part
 * - Parts diagrams with numbered positions
 * - OEM pricing with MSRP and discount prices
 * - Part numbers, supersession info, fitment notes
 */
export class HondaPartsScraperProvider implements ScraperProvider {
  private readonly logger = new Logger(HondaPartsScraperProvider.name);
  private readonly config = AUTO_PARTS_PLATFORMS.hondaparts;
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
      return hostname.includes('hondapartsnow.com');
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

  private buildAbsoluteUrl(path: string): string {
    if (path.startsWith('http')) return path;
    return `${this.config.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  // ------------------------------------------------------------------
  // scrapeSearch — navigate catalog pages, extract parts listings
  // ------------------------------------------------------------------

  async scrapeSearch(url: string): Promise<ScrapedSearchResult> {
    this.logger.log(`[scrapeSearch] url=${url}`);
    const page = await this.createPage();

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await delay(1500 + Math.random() * 1000);

      // Wait for parts listing to load
      const listSelectors = [
        '.parts-list table tbody tr',
        '.catalog-parts-list .part-row',
        '.search-results .result-item',
        'table.parts-table tbody tr',
        '.parts-results-list li',
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
        this.logger.warn('No parts listing selector matched — scraping page anyway');
      }

      const products: ScrapedProductSummary[] = await page.evaluate((baseUrl) => {
        const items: ScrapedProductSummary[] = [];

        // Try multiple DOM structures
        const rows = document.querySelectorAll(
          '.parts-list table tbody tr, .catalog-parts-list .part-row, .search-results .result-item, table.parts-table tbody tr, .parts-results-list li',
        );

        rows.forEach((row) => {
          const nameEl = row.querySelector('.part-name a, .part-description a, td.part-name a, a[href*="/part/"]');
          const priceEl = row.querySelector('.price, .part-price, .sale-price, td.price');
          const msrpEl = row.querySelector('.msrp, .list-price, .original-price, td.msrp');
          const imgEl = row.querySelector('img') as HTMLImageElement;
          const partNumEl = row.querySelector('.part-number, .oem-number, td.part-number');
          const stockEl = row.querySelector('.in-stock, .availability, .stock-status');

          const name = nameEl?.textContent?.trim() || '';
          const href = nameEl?.getAttribute('href') || '';
          const partNumber = partNumEl?.textContent?.trim() || '';
          const price = priceEl?.textContent?.trim() || '';
          const msrp = msrpEl?.textContent?.trim() || '';
          const image = imgEl?.src || '';

          if (name || partNumber) {
            const fullName = partNumber ? `${partNumber} - ${name}` : name;
            const productUrl = href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
            const priceNum = parseFloat(price.replace(/[^\d.]/g, '')) || 0;
            const msrpNum = parseFloat(msrp.replace(/[^\d.]/g, '')) || 0;

            items.push({
              productName: fullName,
              productUrl,
              productPrice: msrpNum || priceNum,
              offerPrice: priceNum || undefined,
              image: image || undefined,
              inStock: stockEl ? stockEl.textContent?.toLowerCase().includes('in stock') : undefined,
              brandName: 'Genuine Honda',
            });
          }
        });

        return items;
      }, this.config.baseUrl);

      // Extract pagination info
      const pagination = await page.evaluate(() => {
        const totalEl = document.querySelector('.results-count, .total-results, .result-count');
        const pageEl = document.querySelector('.pagination .active, .current-page');
        const totalPagesEl = document.querySelector('.pagination li:last-child a, .total-pages');

        return {
          total: parseInt(totalEl?.textContent?.replace(/\D/g, '') || '0', 10) || undefined,
          currentPage: parseInt(pageEl?.textContent?.trim() || '1', 10),
          totalPages: parseInt(totalPagesEl?.textContent?.trim() || '1', 10),
        };
      });

      this.logger.log(`[scrapeSearch] Found ${products.length} parts from ${url}`);
      return {
        products,
        totalResults: pagination.total,
        currentPage: pagination.currentPage,
        totalPages: pagination.totalPages,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[scrapeSearch] Failed: ${msg}`);
      throw new Error(`HondaParts scrapeSearch failed: ${msg}`);
    } finally {
      await page.close();
    }
  }

  // ------------------------------------------------------------------
  // scrapeProduct — extract full part details with diagram position
  // ------------------------------------------------------------------

  async scrapeProduct(url: string): Promise<ScrapedProduct> {
    this.logger.log(`[scrapeProduct] url=${url}`);
    const page = await this.createPage();

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await delay(1500 + Math.random() * 1000);

      // Wait for product detail content
      try {
        await page.waitForSelector('.part-detail, .product-detail, .part-info, #partDetail', { timeout: 8000 });
      } catch {
        this.logger.warn('Part detail container not found — scraping available data');
      }

      const partData = await page.evaluate((baseUrl) => {
        const getText = (sel: string) => document.querySelector(sel)?.textContent?.trim() || '';
        const getAttr = (sel: string, attr: string) => document.querySelector(sel)?.getAttribute(attr) || '';

        // Part identification
        const partNumber = getText('.part-number, .oem-part-number, [itemprop="mpn"], .partNumber');
        const name = getText('.part-name h1, .product-name, h1.part-title, [itemprop="name"]');
        const description = getText('.part-description, .product-description, [itemprop="description"]');

        // Pricing
        const priceText = getText('.sale-price, .our-price, .discount-price, [itemprop="price"]');
        const msrpText = getText('.msrp, .list-price, .original-price, .retail-price');

        // Supersession / alternate part numbers
        const supersededEls = document.querySelectorAll('.superseded-by a, .replacement-part a, .supersession a');
        const supersededBy = supersededEls.length > 0
          ? Array.from(supersededEls).map((el) => el.textContent?.trim() || '').filter(Boolean)
          : [];

        const altPartEls = document.querySelectorAll('.alternate-parts a, .also-known-as span, .cross-reference li');
        const altPartNumbers = altPartEls.length > 0
          ? Array.from(altPartEls).map((el) => el.textContent?.trim() || '').filter(Boolean)
          : [];

        // Fitment / vehicle compatibility
        const fitmentNotes = getText('.fitment-notes, .fits-description, .compatibility-notes');
        const vehicleEls = document.querySelectorAll('.fitment-table tbody tr, .compatible-vehicles li, .vehicle-list li');
        const vehicles: Array<{ year?: number; make: string; model: string; submodel?: string; engine?: string }> = [];
        vehicleEls.forEach((el) => {
          const cols = el.querySelectorAll('td, span');
          if (cols.length >= 2) {
            vehicles.push({
              year: parseInt(cols[0]?.textContent?.trim() || '', 10) || undefined,
              make: cols[1]?.textContent?.trim() || 'Honda',
              model: cols[2]?.textContent?.trim() || '',
              submodel: cols[3]?.textContent?.trim() || undefined,
              engine: cols[4]?.textContent?.trim() || undefined,
            });
          }
        });

        // Diagram info
        const diagramPosition = getText('.diagram-position, .ref-number, .position-number, .callout-number');
        const diagramId = getAttr('.diagram-link a, a[href*="diagram"]', 'href');

        // Images
        const imageEls = document.querySelectorAll('.part-images img, .product-gallery img, [itemprop="image"]');
        const images = Array.from(imageEls).map((img) => {
          const imgEl = img as HTMLImageElement;
          return {
            url: imgEl.src || imgEl.getAttribute('data-src') || '',
            alt: imgEl.alt || '',
          };
        }).filter((i) => i.url);

        // Category breadcrumbs
        const breadcrumbs = Array.from(document.querySelectorAll('.breadcrumb li, .breadcrumbs a, nav[aria-label="breadcrumb"] a'))
          .map((el) => el.textContent?.trim() || '')
          .filter(Boolean);

        // Stock / availability
        const stockText = getText('.stock-status, .availability, .in-stock-status');
        const inStock = stockText ? stockText.toLowerCase().includes('in stock') || stockText.toLowerCase().includes('available') : undefined;

        // Specifications table
        const specRows = document.querySelectorAll('.specifications tr, .part-specs tr, .details-table tr');
        const specs: Array<{ label: string; value: string }> = [];
        specRows.forEach((row) => {
          const label = row.querySelector('th, td:first-child')?.textContent?.trim() || '';
          const value = row.querySelector('td:last-child, td:nth-child(2)')?.textContent?.trim() || '';
          if (label && value && label !== value) {
            specs.push({ label, value });
          }
        });

        // Weight / dimensions
        const weight = getText('.weight, .part-weight, [data-field="weight"]');
        const dimensions = getText('.dimensions, .part-dimensions, [data-field="dimensions"]');

        return {
          partNumber,
          name,
          description,
          priceText,
          msrpText,
          supersededBy,
          altPartNumbers,
          fitmentNotes,
          vehicles,
          diagramPosition,
          diagramId,
          images,
          breadcrumbs,
          inStock,
          specs,
          weight,
          dimensions,
        };
      }, this.config.baseUrl);

      const price = this.parsePrice(partData.priceText);
      const msrp = this.parsePrice(partData.msrpText);

      // Build auto part metadata
      const autoPart: ScrapedAutoPart = {
        partNumber: partData.partNumber,
        partNumberAlt: partData.altPartNumbers.length > 0 ? partData.altPartNumbers : undefined,
        name: partData.name,
        description: partData.description || undefined,
        price,
        currency: 'USD',
        msrp: msrp || undefined,
        discount: this.parseDiscount(msrp, price),
        category: partData.breadcrumbs[partData.breadcrumbs.length - 2] || 'Parts',
        subcategory: partData.breadcrumbs[partData.breadcrumbs.length - 1] || undefined,
        vehicles: (partData.vehicles as Vehicle[]) || [],
        fitmentNotes: partData.fitmentNotes || undefined,
        images: partData.images.map((img): AutoPartImage => ({
          url: img.url,
          type: 'product',
          alt: img.alt,
        })),
        diagramId: partData.diagramId || undefined,
        diagramPosition: partData.diagramPosition || undefined,
        sourceUrl: url,
        sourcePlatform: 'hondaparts',
        brand: 'Genuine Honda',
        isGenuine: true,
        inStock: partData.inStock,
        weight: partData.weight || undefined,
        dimensions: partData.dimensions || undefined,
        supersededBy: partData.supersededBy[0] || undefined,
        crossReferences: partData.altPartNumbers.length > 0 ? partData.altPartNumbers : undefined,
      };

      // Map to ScrapedProduct
      const result: ScrapedProduct = {
        productName: partData.name || partData.partNumber,
        description: partData.description || undefined,
        productPrice: msrp || price,
        offerPrice: price,
        brandName: 'Genuine Honda',
        images: partData.images.map((img): ScrapedImage => ({
          url: img.url,
          imageName: img.alt || partData.partNumber,
          isPrimary: false,
        })),
        tags: ['honda', 'oem', 'genuine', partData.partNumber].filter(Boolean),
        specifications: partData.specs.map((s): ScrapedSpecification => ({
          label: s.label,
          value: s.value,
        })),
        sourceUrl: url,
        sourcePlatform: 'hondaparts',
        inStock: partData.inStock,
        categoryPath: partData.breadcrumbs.join(' > '),
        metadata: {
          autoPart,
          partNumber: partData.partNumber,
          diagramPosition: partData.diagramPosition,
          supersededBy: partData.supersededBy,
          vehicles: partData.vehicles,
        },
      };

      if (result.images && result.images.length > 0) {
        result.images[0].isPrimary = true;
      }

      this.logger.log(`[scrapeProduct] Scraped part: ${partData.partNumber} — ${partData.name}`);
      return result;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[scrapeProduct] Failed: ${msg}`);
      throw new Error(`HondaParts scrapeProduct failed: ${msg}`);
    } finally {
      await page.close();
    }
  }

  // ------------------------------------------------------------------
  // scrapeVehicleCatalog — get all Honda/Acura models by year
  // ------------------------------------------------------------------

  async scrapeVehicleCatalog(): Promise<Array<{ year: number; make: string; models: string[] }>> {
    this.logger.log('[scrapeVehicleCatalog] Starting Honda/Acura vehicle catalog scrape');
    const page = await this.createPage();
    const catalog: Array<{ year: number; make: string; models: string[] }> = [];

    try {
      await page.goto(this.config.baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await delay(2000 + Math.random() * 1000);

      // Navigate the year/make/model selection
      // HondaPartsNow typically has dropdowns or link grids for year > make > model
      const makes = ['Honda', 'Acura'];

      for (const make of makes) {
        // Navigate to make page
        const makeUrl = `${this.config.baseUrl}/${make.toLowerCase()}-parts.html`;
        await page.goto(makeUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await delay(1000 + Math.random() * 500);

        // Extract year > model mappings
        const yearModels = await page.evaluate(() => {
          const results: Array<{ year: number; models: string[] }> = [];

          // Try year sections with model links
          const yearSections = document.querySelectorAll('.year-section, .model-year-group, [data-year]');

          if (yearSections.length > 0) {
            yearSections.forEach((section) => {
              const yearText = section.querySelector('.year-title, h2, h3')?.textContent?.trim() || '';
              const year = parseInt(yearText.replace(/\D/g, ''), 10);
              if (year >= 2010 && year <= 2026) {
                const modelEls = section.querySelectorAll('a[href*="model"], .model-link, li a');
                const models = Array.from(modelEls)
                  .map((el) => el.textContent?.trim() || '')
                  .filter(Boolean);
                if (models.length > 0) {
                  results.push({ year, models });
                }
              }
            });
          }

          // Fallback: try table layout
          if (results.length === 0) {
            const rows = document.querySelectorAll('table tbody tr, .vehicle-list li, .catalog-list li');
            const yearMap = new Map<number, string[]>();

            rows.forEach((row) => {
              const cells = row.querySelectorAll('td, a, span');
              const yearText = cells[0]?.textContent?.trim() || '';
              const model = cells[1]?.textContent?.trim() || row.querySelector('a')?.textContent?.trim() || '';
              const year = parseInt(yearText.replace(/\D/g, ''), 10);

              if (year >= 2010 && year <= 2026 && model) {
                if (!yearMap.has(year)) yearMap.set(year, []);
                yearMap.get(year)!.push(model);
              }
            });

            yearMap.forEach((models, year) => {
              results.push({ year, models: Array.from(new Set(models)) });
            });
          }

          // Fallback: extract from navigation links
          if (results.length === 0) {
            const allLinks = document.querySelectorAll('a[href]');
            const yearMap = new Map<number, string[]>();

            allLinks.forEach((link) => {
              const href = link.getAttribute('href') || '';
              // Match patterns like /2024-honda-civic-parts.html
              const match = href.match(/(\d{4})-\w+-(\w[\w-]+)-parts/i);
              if (match) {
                const year = parseInt(match[1], 10);
                const model = match[2].replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
                if (year >= 2010 && year <= 2026) {
                  if (!yearMap.has(year)) yearMap.set(year, []);
                  yearMap.get(year)!.push(model);
                }
              }
            });

            yearMap.forEach((models, year) => {
              results.push({ year, models: Array.from(new Set(models)) });
            });
          }

          return results;
        });

        for (const ym of yearModels) {
          catalog.push({
            year: ym.year,
            make,
            models: ym.models,
          });
        }

        // Rate limit between makes
        await delay(this.getRateLimitDelay());
      }

      this.logger.log(`[scrapeVehicleCatalog] Found ${catalog.length} year-make entries`);
      return catalog;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[scrapeVehicleCatalog] Failed: ${msg}`);
      throw new Error(`HondaParts scrapeVehicleCatalog failed: ${msg}`);
    } finally {
      await page.close();
    }
  }

  // ------------------------------------------------------------------
  // scrapeDiagram — extract parts diagram image + all positioned parts
  // ------------------------------------------------------------------

  async scrapeDiagram(url: string): Promise<PartsDiagram> {
    this.logger.log(`[scrapeDiagram] url=${url}`);
    const page = await this.createPage();

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await delay(2000 + Math.random() * 1000);

      // Wait for diagram content
      try {
        await page.waitForSelector('.diagram-container, .parts-diagram, .illustration, #diagram', { timeout: 8000 });
      } catch {
        this.logger.warn('Diagram container not found — scraping available data');
      }

      const diagramData = await page.evaluate(() => {
        const getText = (sel: string) => document.querySelector(sel)?.textContent?.trim() || '';

        // Diagram image
        const diagramImg = document.querySelector(
          '.diagram-container img, .parts-diagram img, .illustration img, #diagram img, img[usemap]',
        ) as HTMLImageElement;
        const imageUrl = diagramImg?.src || diagramImg?.getAttribute('data-src') || '';
        const svgEl = document.querySelector('.diagram-svg svg, .parts-diagram svg');
        const svgUrl = svgEl ? '' : undefined; // SVG would need serialization

        // Diagram name and category
        const name = getText('.diagram-title, .illustration-name, h1, h2.diagram-name');
        const category = getText('.breadcrumb li:nth-last-child(2), .category-name');

        // Vehicle info from page context
        const vehicleText = getText('.vehicle-info, .vehicle-title, .fitment-header');

        // Parts list from diagram table
        const partRows = document.querySelectorAll(
          '.parts-list table tbody tr, .diagram-parts-list tr, .parts-table tbody tr, table.illustration-parts tr',
        );

        const parts: Array<{
          position: string;
          partNumber: string;
          name: string;
          quantity: number;
          price?: number;
          notes?: string;
        }> = [];

        partRows.forEach((row) => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            const position = cells[0]?.textContent?.trim() || '';
            const partNumber = (cells[1]?.textContent?.trim() || '')
              .replace(/\s+/g, '')
              .toUpperCase();
            const partName = cells[2]?.textContent?.trim() || '';
            const qtyText = cells[3]?.textContent?.trim() || '1';
            const priceText = cells[4]?.textContent?.trim() || '';
            const notes = cells[5]?.textContent?.trim() || '';

            if (partNumber && position) {
              parts.push({
                position,
                partNumber,
                name: partName,
                quantity: parseInt(qtyText, 10) || 1,
                price: priceText ? parseFloat(priceText.replace(/[^\d.]/g, '')) || undefined : undefined,
                notes: notes || undefined,
              });
            }
          }
        });

        return { imageUrl, svgUrl, name, category, vehicleText, parts };
      });

      // Parse vehicle from page context text
      const vehicleMatch = diagramData.vehicleText.match(/(\d{4})\s+(Honda|Acura)\s+(.+)/i);
      const vehicle: Vehicle = {
        year: vehicleMatch ? parseInt(vehicleMatch[1], 10) : undefined,
        make: vehicleMatch ? vehicleMatch[2] : 'Honda',
        model: vehicleMatch ? vehicleMatch[3].trim() : '',
      };

      const diagram: PartsDiagram = {
        id: url.split('/').pop()?.replace(/\.\w+$/, '') || `honda-diagram-${Date.now()}`,
        name: diagramData.name || 'Parts Diagram',
        imageUrl: diagramData.imageUrl,
        svgUrl: diagramData.svgUrl,
        vehicle,
        category: diagramData.category || 'Parts',
        parts: diagramData.parts as DiagramPart[],
        sourceUrl: url,
        sourcePlatform: 'hondaparts',
      };

      this.logger.log(`[scrapeDiagram] Extracted diagram with ${diagram.parts.length} parts`);
      return diagram;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[scrapeDiagram] Failed: ${msg}`);
      throw new Error(`HondaParts scrapeDiagram failed: ${msg}`);
    } finally {
      await page.close();
    }
  }

  // ------------------------------------------------------------------
  // Rate limiting
  // ------------------------------------------------------------------

  private getRateLimitDelay(): number {
    // config.rateLimit = 30 req/min → ~2000ms between requests
    const baseDelay = Math.ceil(60_000 / this.config.rateLimit);
    const jitter = Math.random() * 1000;
    return baseDelay + jitter;
  }
}
