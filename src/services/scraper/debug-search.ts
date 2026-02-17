/**
 * Debug Script for Amazon Search Scraper
 * 
 * This script helps debug search scraping issues
 * Run with: bun src/services/scraper/debug-search.ts
 */

import puppeteer from 'puppeteer';

async function debugSearch() {

    const testUrl = 'https://www.amazon.in/s?k=ddr4+32gb&i=electronics&crid=3DWWI5D7QDKS3&sprefix=%2Celectronics%2C332&ref=nb_sb_ss_recent_2_0_recent';

    const browser = await puppeteer.launch({
        headless: false, // Run in visible mode to see what's happening
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    // Set user agent
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.setViewport({ width: 1920, height: 1080 });

    try {
        await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 30000 });


        // Take a screenshot
        await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });

        // Check for various selectors

        const selectors = [
            '[data-component-type="s-search-result"]',
            '.s-result-item',
            '[data-asin]',
            '.s-main-slot .s-result-item',
            'div[data-component-type="s-search-result"]',
            '.s-search-results',
            '[cel_widget_id*="MAIN"]',
        ];

        for (const selector of selectors) {
            const count = await page.evaluate((sel) => {
                return document.querySelectorAll(sel).length;
            }, selector);
        }

        // Get page content info
        const pageInfo = await page.evaluate(() => {
            const title = document.title;
            const h1 = document.querySelector('h1')?.textContent?.trim();
            const resultsText = document.querySelector('.s-breadcrumb')?.textContent?.trim();
            const hasCaptcha = document.body.innerHTML.includes('captcha');
            const hasRobotCheck = document.body.innerHTML.includes('Robot Check');
            
            return {
                title,
                h1,
                resultsText,
                hasCaptcha,
                hasRobotCheck,
            };
        });


        // Try to extract products with different selectors

        // Method 1: data-component-type
        const method1 = await page.evaluate(() => {
            const elements = document.querySelectorAll('[data-component-type="s-search-result"]');
            return elements.length;
        });

        // Method 2: data-asin
        const method2 = await page.evaluate(() => {
            const elements = document.querySelectorAll('[data-asin]:not([data-asin=""])');
            return elements.length;
        });

        // Method 3: .s-result-item
        const method3 = await page.evaluate(() => {
            const elements = document.querySelectorAll('.s-result-item[data-asin]:not([data-asin=""])');
            return elements.length;
        });

        // Try extracting with the most promising method
        if (method3 > 0) {
            const sampleProducts = await page.evaluate(() => {
                const elements = document.querySelectorAll('.s-result-item[data-asin]:not([data-asin=""])');
                const products = [];

                // Get first 3 products
                for (let i = 0; i < Math.min(3, elements.length); i++) {
                    const element = elements[i];
                    const asin = element.getAttribute('data-asin');
                    
                    // Try multiple selectors for product name
                    let productName = '';
                    const nameSelectors = [
                        'h2 a span',
                        'h2 span.a-text-normal',
                        'h2 a',
                        '.a-size-medium.a-text-normal',
                        '.a-size-base-plus',
                        'h2',
                    ];
                    
                    for (const selector of nameSelectors) {
                        const el = element.querySelector(selector);
                        if (el?.textContent?.trim()) {
                            productName = el.textContent.trim();
                            break;
                        }
                    }
                    
                    const priceElement = element.querySelector('.a-price-whole');
                    const price = priceElement?.textContent?.trim();
                    const imageElement = element.querySelector('img.s-image');
                    const image = imageElement?.getAttribute('src');
                    const linkElement = element.querySelector('h2 a');
                    const link = linkElement?.getAttribute('href');

                    // Check if it's sponsored
                    const isSponsored = element.textContent?.includes('Sponsored') || false;
                    
                    // Get the HTML structure for debugging
                    const h2Content = element.querySelector('h2')?.innerHTML;

                    products.push({
                        index: i,
                        asin,
                        productName,
                        price,
                        hasImage: !!image,
                        hasLink: !!link,
                        isSponsored,
                        h2Content: h2Content?.substring(0, 150),
                    });
                }

                return products;
            });

            sampleProducts.forEach((product, idx) => {
                if (!product.productName && product.h2Content) {
                }
            });
        }

        if (pageInfo.hasCaptcha || pageInfo.hasRobotCheck) {
        } else if (method3 > 0) {
        } else if (method2 > 0) {
        } else {
        }

        await new Promise(resolve => setTimeout(resolve, 30000));

    } catch (error) {
    } finally {
        await browser.close();
    }
}

// Run the debug script
debugSearch().catch((err) => process.stderr.write(String(err)));
