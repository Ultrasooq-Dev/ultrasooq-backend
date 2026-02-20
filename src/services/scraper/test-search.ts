/**
 * Test Amazon Search Scraping
 */
import { AmazonINScraperProvider } from './providers/amazon.in.scraper.provider';
import { ScraperService } from './scraper.service';

async function testSearch() {

    const scraperService = new ScraperService();
    const amazonProvider = new AmazonINScraperProvider();
    
    scraperService.registerProvider(amazonProvider);

    const searchUrl = 'https://www.amazon.in/s?k=ddr4+32gb&i=electronics&crid=3DWWI5D7QDKS3&sprefix=%2Celectronics%2C332&ref=nb_sb_ss_recent_2_0_recent';


    try {
        const results = await scraperService.scrapeSearch(searchUrl);


        if (results.products.length > 0) {
            results.products.slice(0, 5).forEach((product, i) => {
            });

            // Check for common issues
            const productsWithoutName = results.products.filter(p => !p.productName);
            const productsWithoutPrice = results.products.filter(p => !p.productPrice || p.productPrice === 0);
            const productsWithoutURL = results.products.filter(p => !p.productUrl);

            
            if (productsWithoutName.length > 0) {
            }
            if (productsWithoutPrice.length > 0) {
            }

        } else {
        }


    } catch (error) {
    } finally {
        await amazonProvider.close();
    }
}

testSearch().catch((err) => process.stderr.write(String(err)));
