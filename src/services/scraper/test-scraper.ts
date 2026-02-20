/**
 * Simple Test Script for Scraper Service
 * 
 * This is a standalone script to test the scraper functionality.
 * Run with: node --loader ts-node/esm test-scraper.ts
 * Or better: Start the NestJS app and use the API endpoints
 */

import { AmazonINScraperProvider } from './providers/amazon.in.scraper.provider';
import { ScraperService } from './scraper.service';

async function testScraper() {

    // Create service instance
    const scraperService = new ScraperService();
    const amazonProvider = new AmazonINScraperProvider();
    
    // Register provider
    scraperService.registerProvider(amazonProvider);
    

    // Test URL
    const testUrl = 'https://www.amazon.in/dp/B0B37TXGCK'; // Example product

    // Check if URL is supported
    const canScrape = scraperService.canScrape(testUrl);

    if (!canScrape) {
        return;
    }

    // Scrape product
    try {
        const product = await scraperService.scrapeProduct(testUrl);
        

        if (product.shortDescription) {
        }

        if (product.images && product.images.length > 0) {
            product.images.slice(0, 3).forEach((img, i) => {
            });
        }

        
    } catch (error) {
    } finally {
        // Cleanup
        await amazonProvider.close();
    }
}

// Run the test
testScraper().catch((err) => process.stderr.write(String(err)));
