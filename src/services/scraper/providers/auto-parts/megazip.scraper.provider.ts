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
  TARGET_MAKES,
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
// MegaZipProvider — megazip.net
// ---------------------------------------------------------------------------

/**
 * Scraper provider for megazip.net — OEM parts catalog for all major brands.
 *
 * Supports:
 * - Vehicle navigation: Make > Model > Year > Parts Catalog
 * - Detailed parts diagrams/maps
 * - OEM pricing, part numbers
 * - Multi-brand support (Honda, Toyota, Nissan, BMW, Mercedes, etc.)
 *
 * MegaZip organizes parts in a tree: Make > Model > Modification > Group > Subgroup > Diagram.
 * Each diagram contains numbered parts with part numbers and prices.
 */
export class MegaZipScraperProvider implements ScraperProvider {
  private readonly logger = new Logger(MegaZipScraperProvider.name);
  private readonly config = AUTO_PARTS_PLATFORMS.megazip;
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
      return hostname.includes('megazip.net');
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
    // Handle comma-decimal format (European): "1.234,56"
    if (/\d+\.\d{3},\d{1,2}$/.test(cleaned)) {
      return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
    }
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

  /**
   * Detect currency from MegaZip page context.
   * MegaZip displays prices in USD by default but may show local currency.
   */
  private detectCurrency(priceText: string): string {
    if (priceText.includes('$')) return 'USD';
    if (priceText.includes('EUR') || priceText.includes('\u20AC')) return 'EUR';
    if (priceText.includes('GBP') || priceText.includes('\u00A3')) return 'GBP';
    if (priceText.includes('AED')) return 'AED';
    if (priceText.includes('SAR')) return 'SAR';
    return 'USD';
  }

  // ------------------------------------------------------------------
  // scrapeSearch — navigate vehicle catalog, extract parts
  // ------------------------------------------------------------------

  async scrapeSearch(url: string): Promise<ScrapedSearchResult> {
    this.logger.log(`[scrapeSearch] url=${url}`);
    const page = await this.createPage();

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await delay(2000 + Math.random() * 1500);

      // Wait for catalog content to load
      const contentSelectors = [
        '.parts-list',
        '.catalog-items',
        '.search-results',
        'table.parts-table',
        '.group-parts',
        '.spare-parts-list',
        '.part-item',
      ];

      let found = false;
      for (const sel of contentSelectors) {
        try {
          await page.waitForSelector(sel, { timeout: 6000 });
          found = true;
          break;
        } catch { /* try next */ }
      }

      if (!found) {
        this.logger.warn('No parts listing selector matched — scraping page anyway');
      }

      const products: ScrapedProductSummary[] = await page.evaluate((baseUrl) => {
        const items: ScrapedProductSummary[] = [];

        // MegaZip parts are listed in table rows or card-style layouts
        const partElements = document.querySelectorAll(
          '.part-item, .parts-list tr, .catalog-items .item, table.parts-table tbody tr, .spare-parts-list li, .group-parts .part-row',
        );

        partElements.forEach((el) => {
          // Part number
          const partNumEl = el.querySelector(
            '.part-number, .oem-number, .partNumber, td.part-number, a[href*="/part/"]',
          );
          const partNumber = partNumEl?.textContent?.trim() || '';

          // Part name
          const nameEl = el.querySelector(
            '.part-name, .description, .part-description, td.name, .item-title',
          );
          const name = nameEl?.textContent?.trim() || '';

          // Price
          const priceEl = el.querySelector(
            '.price, .part-price, td.price, .item-price, .buy-price',
          );
          const priceText = priceEl?.textContent?.trim() || '';
          const price = parseFloat(priceText.replace(/[^\d.]/g, '')) || 0;

          // Image
          const imgEl = el.querySelector('img') as HTMLImageElement;
          const image = imgEl?.src || imgEl?.getAttribute('data-src') || '';

          // Link
          const linkEl = el.querySelector('a[href]') as HTMLAnchorElement;
          const href = linkEl?.href || linkEl?.getAttribute('href') || '';

          // Stock
          const stockEl = el.querySelector('.availability, .stock, .in-stock');
          const inStock = stockEl
            ? stockEl.textContent?.toLowerCase().includes('available') ||
              stockEl.textContent?.toLowerCase().includes('in stock')
            : undefined;

          if (partNumber || name) {
            const fullName = partNumber && name ? `${partNumber} - ${name}` : partNumber || name;
            const productUrl = href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;

            items.push({
              productName: fullName,
              productUrl,
              productPrice: price || undefined,
              offerPrice: price || undefined,
              image: image || undefined,
              inStock,
            });
          }
        });

        return items;
      }, this.config.baseUrl);

      // Extract pagination
      const pagination = await page.evaluate(() => {
        const totalEl = document.querySelector('.total-count, .results-total, .parts-count');
        const currentEl = document.querySelector('.pagination .active, .page-current');
        const totalPagesEl = document.querySelector('.pagination a:last-of-type, .total-pages');

        return {
          total: parseInt(totalEl?.textContent?.replace(/\D/g, '') || '0', 10) || undefined,
          currentPage: parseInt(currentEl?.textContent?.trim() || '1', 10),
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
      throw new Error(`MegaZip scrapeSearch failed: ${msg}`);
    } finally {
      await page.close();
    }
  }

  // ------------------------------------------------------------------
  // scrapeProduct — extract part details with diagram reference
  // ------------------------------------------------------------------

  async scrapeProduct(url: string): Promise<ScrapedProduct> {
    this.logger.log(`[scrapeProduct] url=${url}`);
    const page = await this.createPage();

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await delay(2000 + Math.random() * 1500);

      // Wait for part detail
      try {
        await page.waitForSelector(
          '.part-detail, .product-info, .part-info, .spare-part-detail, .part-page',
          { timeout: 8000 },
        );
      } catch {
        this.logger.warn('Part detail container not found — scraping available data');
      }

      const partData = await page.evaluate((baseUrl) => {
        const getText = (sel: string) => document.querySelector(sel)?.textContent?.trim() || '';
        const getAttr = (sel: string, attr: string) => document.querySelector(sel)?.getAttribute(attr) || '';

        // Part identification
        const partNumber = getText(
          '.part-number, .oem-number, .partNumber, [itemprop="mpn"], .part-code',
        );
        const name = getText(
          '.part-name h1, .product-name, h1.part-title, [itemprop="name"], .part-description h1',
        );
        const nameOriginal = getText('.original-name, .name-original, .native-name');
        const description = getText(
          '.description, .part-description p, [itemprop="description"], .part-notes',
        );

        // Brand detection from breadcrumbs or part info
        const brand = getText('.brand-name, .manufacturer, .part-brand, .oem-brand');

        // Pricing
        const priceText = getText(
          '.price, .part-price, .buy-price, [itemprop="price"], .current-price',
        );
        const msrpText = getText('.msrp, .list-price, .original-price, .retail-price');

        // Vehicle compatibility
        const vehicleEls = document.querySelectorAll(
          '.compatibility-list li, .vehicle-list tr, .fitment-table tbody tr, .applicable-models li',
        );
        const vehicles: Array<{
          year?: number; make: string; model: string; submodel?: string; engine?: string;
        }> = [];

        vehicleEls.forEach((el) => {
          const text = el.textContent?.trim() || '';
          // Try structured columns
          const cols = el.querySelectorAll('td, span');
          if (cols.length >= 3) {
            vehicles.push({
              make: cols[0]?.textContent?.trim() || '',
              model: cols[1]?.textContent?.trim() || '',
              year: parseInt(cols[2]?.textContent?.trim() || '', 10) || undefined,
              submodel: cols[3]?.textContent?.trim() || undefined,
              engine: cols[4]?.textContent?.trim() || undefined,
            });
          } else {
            // Parse "Toyota Camry 2020-2024 2.5L" style
            const match = text.match(/(\w[\w\s-]+?)\s+(\w[\w\s]+?)\s+(\d{4})(?:-(\d{4}))?\s*(.*)?/i);
            if (match) {
              const startYear = parseInt(match[3], 10);
              const endYear = match[4] ? parseInt(match[4], 10) : startYear;
              for (let y = startYear; y <= endYear; y++) {
                vehicles.push({
                  make: match[1].trim(),
                  model: match[2].trim(),
                  year: y,
                  engine: match[5]?.trim() || undefined,
                });
              }
            }
          }
        });

        // Diagram reference
        const diagramId = getAttr('.diagram-link a, a[href*="diagram"], a[href*="schema"]', 'href');
        const diagramPosition = getText('.diagram-position, .position, .ref-num, .callout-num');

        // Images
        const imageEls = document.querySelectorAll(
          '.part-images img, .product-gallery img, .part-photo img, [itemprop="image"]',
        );
        const images = Array.from(imageEls).map((img) => {
          const imgEl = img as HTMLImageElement;
          return {
            url: imgEl.src || imgEl.getAttribute('data-src') || '',
            alt: imgEl.alt || '',
          };
        }).filter((i) => i.url);

        // Category breadcrumbs
        const breadcrumbs = Array.from(
          document.querySelectorAll('.breadcrumb li, .breadcrumbs a, nav[aria-label="breadcrumb"] a, .path a'),
        )
          .map((el) => el.textContent?.trim() || '')
          .filter(Boolean);

        // Specifications
        const specRows = document.querySelectorAll(
          '.specifications tr, .part-specs tr, .details-table tr, .attributes tr',
        );
        const specs: Array<{ label: string; value: string }> = [];
        specRows.forEach((row) => {
          const label = row.querySelector('th, td:first-child')?.textContent?.trim() || '';
          const value = row.querySelector('td:last-child, td:nth-child(2)')?.textContent?.trim() || '';
          if (label && value && label !== value) {
            specs.push({ label, value });
          }
        });

        // Stock
        const stockText = getText('.availability, .stock-status, .in-stock-status');
        const inStock = stockText
          ? stockText.toLowerCase().includes('available') ||
            stockText.toLowerCase().includes('in stock')
          : undefined;

        // Weight / dimensions
        const weight = getText('.weight, .part-weight');
        const dimensions = getText('.dimensions, .part-dimensions');

        // Cross-references
        const crossRefEls = document.querySelectorAll(
          '.cross-references li, .alternatives li, .analog-parts .part-number',
        );
        const crossRefs = Array.from(crossRefEls)
          .map((el) => el.textContent?.trim() || '')
          .filter(Boolean);

        // Supersession
        const supersededBy = getText('.superseded-by, .replacement, .successor');

        return {
          partNumber,
          name,
          nameOriginal,
          description,
          brand,
          priceText,
          msrpText,
          vehicles,
          diagramId,
          diagramPosition,
          images,
          breadcrumbs,
          specs,
          inStock,
          weight,
          dimensions,
          crossRefs,
          supersededBy,
        };
      }, this.config.baseUrl);

      const price = this.parsePrice(partData.priceText);
      const msrp = this.parsePrice(partData.msrpText);
      const currency = this.detectCurrency(partData.priceText || partData.msrpText || '');

      // Determine if genuine OEM
      const isGenuine = !partData.brand
        || partData.brand.toLowerCase().includes('genuine')
        || partData.brand.toLowerCase().includes('oem')
        || partData.breadcrumbs.some((b) => b.toLowerCase().includes('genuine'));

      // Build auto part metadata
      const autoPart: ScrapedAutoPart = {
        partNumber: partData.partNumber,
        name: partData.name,
        nameOriginal: partData.nameOriginal || undefined,
        description: partData.description || undefined,
        price,
        currency,
        msrp: msrp || undefined,
        discount: this.parseDiscount(msrp, price),
        category: partData.breadcrumbs[partData.breadcrumbs.length - 2] || 'Parts',
        subcategory: partData.breadcrumbs[partData.breadcrumbs.length - 1] || undefined,
        vehicles: (partData.vehicles as Vehicle[]) || [],
        images: partData.images.map((img): AutoPartImage => ({
          url: img.url,
          type: 'product',
          alt: img.alt,
        })),
        diagramId: partData.diagramId || undefined,
        diagramPosition: partData.diagramPosition || undefined,
        sourceUrl: url,
        sourcePlatform: 'megazip',
        brand: partData.brand || undefined,
        isGenuine,
        inStock: partData.inStock,
        weight: partData.weight || undefined,
        dimensions: partData.dimensions || undefined,
        crossReferences: partData.crossRefs.length > 0 ? partData.crossRefs : undefined,
        supersededBy: partData.supersededBy || undefined,
      };

      // Map to ScrapedProduct
      const result: ScrapedProduct = {
        productName: partData.name || partData.partNumber,
        description: partData.description || undefined,
        productPrice: msrp || price,
        offerPrice: price,
        brandName: partData.brand || undefined,
        images: partData.images.map((img): ScrapedImage => ({
          url: img.url,
          imageName: img.alt || partData.partNumber,
          isPrimary: false,
        })),
        tags: ['megazip', 'oem', partData.partNumber, partData.brand].filter(Boolean) as string[],
        specifications: partData.specs.map((s): ScrapedSpecification => ({
          label: s.label,
          value: s.value,
        })),
        sourceUrl: url,
        sourcePlatform: 'megazip',
        inStock: partData.inStock,
        categoryPath: partData.breadcrumbs.join(' > '),
        metadata: {
          autoPart,
          partNumber: partData.partNumber,
          diagramPosition: partData.diagramPosition,
          vehicles: partData.vehicles,
          crossReferences: partData.crossRefs,
          supersededBy: partData.supersededBy,
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
      throw new Error(`MegaZip scrapeProduct failed: ${msg}`);
    } finally {
      await page.close();
    }
  }

  // ------------------------------------------------------------------
  // scrapeVehicleCatalog — get all makes/models
  // ------------------------------------------------------------------

  async scrapeVehicleCatalog(): Promise<Array<{ make: string; models: Array<{ name: string; years: number[] }> }>> {
    this.logger.log('[scrapeVehicleCatalog] Starting MegaZip vehicle catalog scrape');
    const page = await this.createPage();
    const catalog: Array<{ make: string; models: Array<{ name: string; years: number[] }> }> = [];

    try {
      // MegaZip organizes by Make on the main page
      await page.goto(this.config.baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await delay(2000 + Math.random() * 1000);

      // Extract make links
      const makeLinks = await page.evaluate((targetMakes) => {
        const links: Array<{ make: string; url: string }> = [];
        const allLinks = document.querySelectorAll(
          '.brand-list a, .makes-list a, .car-brand a, .catalog-makes a, a[href*="/catalog/"]',
        );

        allLinks.forEach((el) => {
          const text = el.textContent?.trim() || '';
          const href = (el as HTMLAnchorElement).href || el.getAttribute('href') || '';
          // Only include makes from our target list
          const matchedMake = targetMakes.find(
            (m) => text.toLowerCase() === m.toLowerCase() || text.toLowerCase().includes(m.toLowerCase()),
          );
          if (matchedMake && href) {
            links.push({ make: matchedMake, url: href });
          }
        });

        return links;
      }, TARGET_MAKES);

      this.logger.log(`[scrapeVehicleCatalog] Found ${makeLinks.length} makes to process`);

      for (const makeLink of makeLinks) {
        const makeUrl = this.buildAbsoluteUrl(makeLink.url);
        await page.goto(makeUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await delay(this.getRateLimitDelay());

        // Extract models and years for this make
        const modelsData = await page.evaluate(() => {
          const models: Array<{ name: string; years: number[] }> = [];

          // MegaZip typically shows model list with year ranges
          const modelEls = document.querySelectorAll(
            '.model-list li, .catalog-models a, .model-item, table.models tbody tr, .vehicle-models .model',
          );

          modelEls.forEach((el) => {
            const nameEl = el.querySelector('.model-name, a, td:first-child');
            const name = nameEl?.textContent?.trim() || el.textContent?.trim() || '';

            // Extract years from the model entry
            const yearsText = el.querySelector('.years, .year-range, td:nth-child(2)')?.textContent?.trim() || '';
            const years: number[] = [];

            // Parse year ranges like "2018-2024" or "2020, 2021, 2022"
            const rangeMatch = yearsText.match(/(\d{4})\s*[-\u2013]\s*(\d{4})/);
            if (rangeMatch) {
              const start = parseInt(rangeMatch[1], 10);
              const end = parseInt(rangeMatch[2], 10);
              for (let y = start; y <= end; y++) {
                if (y >= 2010 && y <= 2026) years.push(y);
              }
            } else {
              // Individual years
              const yearMatches = yearsText.match(/\d{4}/g);
              if (yearMatches) {
                yearMatches.forEach((y) => {
                  const year = parseInt(y, 10);
                  if (year >= 2010 && year <= 2026) years.push(year);
                });
              }
            }

            // Fallback: check links for year info
            if (years.length === 0) {
              const links = el.querySelectorAll('a[href]');
              links.forEach((link) => {
                const href = link.getAttribute('href') || '';
                const yearMatch = href.match(/(\d{4})/);
                if (yearMatch) {
                  const year = parseInt(yearMatch[1], 10);
                  if (year >= 2010 && year <= 2026) years.push(year);
                }
              });
            }

            if (name && name.length < 50) {
              models.push({ name: name.split('\n')[0].trim(), years: Array.from(new Set(years)).sort() });
            }
          });

          return models;
        });

        if (modelsData.length > 0) {
          catalog.push({
            make: makeLink.make,
            models: modelsData,
          });
        }
      }

      this.logger.log(`[scrapeVehicleCatalog] Collected ${catalog.length} makes with models`);
      return catalog;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[scrapeVehicleCatalog] Failed: ${msg}`);
      throw new Error(`MegaZip scrapeVehicleCatalog failed: ${msg}`);
    } finally {
      await page.close();
    }
  }

  // ------------------------------------------------------------------
  // scrapeDiagram — extract diagram image + parts list
  // ------------------------------------------------------------------

  async scrapeDiagram(url: string): Promise<PartsDiagram> {
    this.logger.log(`[scrapeDiagram] url=${url}`);
    const page = await this.createPage();

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await delay(2000 + Math.random() * 1500);

      // Wait for diagram to load
      try {
        await page.waitForSelector(
          '.diagram-container, .schema-image, .parts-map, .illustration, img[usemap], .diagram-wrapper',
          { timeout: 10_000 },
        );
      } catch {
        this.logger.warn('Diagram container not found — scraping available data');
      }

      const diagramData = await page.evaluate((baseUrl) => {
        const getText = (sel: string) => document.querySelector(sel)?.textContent?.trim() || '';

        // Diagram image — MegaZip may use regular img or an interactive SVG map
        const diagramImg = document.querySelector(
          '.diagram-container img, .schema-image img, .parts-map img, .illustration img, img[usemap], .diagram-wrapper img',
        ) as HTMLImageElement;
        const imageUrl = diagramImg?.src || diagramImg?.getAttribute('data-src') || '';

        // SVG diagram
        const svgEl = document.querySelector('.diagram-svg, svg.parts-diagram, .schema-svg');
        const svgUrl = svgEl ? (svgEl as HTMLElement).getAttribute('data-src') || '' : undefined;

        // Diagram name
        const name = getText('.diagram-title, .schema-name, h1, h2.diagram-name, .group-name');
        const category = getText('.breadcrumb li:nth-last-child(2), .category-name, .group-category');

        // Vehicle info
        const vehicleText = getText('.vehicle-info, .car-info, .model-info, .modification-info');

        // Parts table — MegaZip lists parts with position numbers, part numbers, names, quantities, prices
        const partRows = document.querySelectorAll(
          '.parts-list table tbody tr, .schema-parts tr, .diagram-parts-list tr, table.parts-table tbody tr',
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
            const partNumber = (cells[1]?.textContent?.trim() || '').replace(/\s+/g, '');
            const partName = cells[2]?.textContent?.trim() || '';
            const qtyText = cells.length > 3 ? cells[3]?.textContent?.trim() : '1';
            const priceText = cells.length > 4 ? cells[4]?.textContent?.trim() : '';
            const notes = cells.length > 5 ? cells[5]?.textContent?.trim() : '';

            if (position && (partNumber || partName)) {
              parts.push({
                position,
                partNumber: partNumber.toUpperCase(),
                name: partName,
                quantity: parseInt(qtyText || '1', 10) || 1,
                price: priceText ? parseFloat(priceText.replace(/[^\d.]/g, '')) || undefined : undefined,
                notes: notes || undefined,
              });
            }
          }
        });

        // Fallback: interactive map areas
        if (parts.length === 0) {
          const mapAreas = document.querySelectorAll('area[data-part], map area[title]');
          mapAreas.forEach((area, idx) => {
            const partNumber = area.getAttribute('data-part') || '';
            const title = area.getAttribute('title') || '';
            if (partNumber || title) {
              parts.push({
                position: String(idx + 1),
                partNumber: partNumber.toUpperCase(),
                name: title,
                quantity: 1,
              });
            }
          });
        }

        return { imageUrl, svgUrl, name, category, vehicleText, parts };
      }, this.config.baseUrl);

      // Parse vehicle from context
      const vehicleMatch = diagramData.vehicleText.match(
        /(\w[\w\s-]+?)\s+(\w[\w\s]+?)\s+(\d{4})/i,
      );
      const vehicle: Vehicle = {
        make: vehicleMatch ? vehicleMatch[1].trim() : '',
        model: vehicleMatch ? vehicleMatch[2].trim() : '',
        year: vehicleMatch ? parseInt(vehicleMatch[3], 10) : undefined,
      };

      const diagram: PartsDiagram = {
        id: url.split('/').pop()?.replace(/\.\w+$/, '') || `megazip-diagram-${Date.now()}`,
        name: diagramData.name || 'Parts Diagram',
        imageUrl: diagramData.imageUrl,
        svgUrl: diagramData.svgUrl,
        vehicle,
        category: diagramData.category || 'Parts',
        parts: diagramData.parts as DiagramPart[],
        sourceUrl: url,
        sourcePlatform: 'megazip',
      };

      this.logger.log(`[scrapeDiagram] Extracted diagram with ${diagram.parts.length} parts`);
      return diagram;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`[scrapeDiagram] Failed: ${msg}`);
      throw new Error(`MegaZip scrapeDiagram failed: ${msg}`);
    } finally {
      await page.close();
    }
  }

  // ------------------------------------------------------------------
  // Rate limiting
  // ------------------------------------------------------------------

  private getRateLimitDelay(): number {
    // config.rateLimit = 20 req/min → ~3000ms between requests
    const baseDelay = Math.ceil(60_000 / this.config.rateLimit);
    const jitter = Math.random() * 1200;
    return baseDelay + jitter;
  }
}
