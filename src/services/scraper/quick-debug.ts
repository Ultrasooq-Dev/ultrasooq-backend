/**
 * Quick debug for Amazon search
 */
import puppeteer from 'puppeteer';
import { writeFileSync } from 'fs';

async function quickDebug() {
    const testUrl = 'https://www.amazon.in/s?k=ddr4+32gb&i=electronics';

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    const products = await page.evaluate(() => {
        const elements = document.querySelectorAll('.s-result-item[data-asin]:not([data-asin=""])');
        const results = [];

        for (let i = 0; i < Math.min(5, elements.length); i++) {
            const element = elements[i];
            const asin = element.getAttribute('data-asin');
            
            // Get h2 element and all its text
            const h2 = element.querySelector('h2');
            const h2Text = h2?.textContent?.trim();
            
            const price = element.querySelector('.a-price-whole')?.textContent?.trim();
            const isSponsored = element.textContent?.includes('Sponsored');
            
            // Check URL - try multiple selectors
            const linkElement1 = element.querySelector('h2 a');
            const linkElement2 = element.querySelector('a.a-link-normal');
            const linkElement3 = element.querySelector('.s-image-padding a');
            const linkElement4 = element.querySelector('a[href*="/dp/"]');
            
            const href1 = linkElement1?.getAttribute('href');
            const href2 = linkElement2?.getAttribute('href');
            const href3 = linkElement3?.getAttribute('href');
            const href4 = linkElement4?.getAttribute('href');
            
            const href = href1 || href2 || href3 || href4;
            const fullUrl = href?.startsWith('http') ? href : `https://www.amazon.in${href}`;

            results.push({
                index: i,
                asin,
                isSponsored,
                h2Text,
                href1,
                href2,
                href3,
                href4,
                bestHref: href,
                fullUrl,
            });
        }

        return results;
    });

    writeFileSync('debug-products.json', JSON.stringify(products, null, 2));

    products.forEach((p, i) => {
    });

    await browser.close();
}

quickDebug().catch((err) => process.stderr.write(String(err)));
