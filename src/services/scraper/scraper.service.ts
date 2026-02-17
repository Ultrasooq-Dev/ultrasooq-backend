import { Injectable, Logger } from '@nestjs/common';
import { ScrapedProduct, ScrapedSearchResult } from './interfaces/scraped-product.interface';
import { getErrorMessage } from 'src/common/utils/get-error-message';

/**
 * Interface that all scraper providers must implement
 */
export interface ScraperProvider {
    /**
     * Check if this provider can scrape the given URL
     */
    canScrape(url: string): boolean;
    
    /**
     * Scrape search results from the given URL
     */
    scrapeSearch(url: string): Promise<ScrapedSearchResult>;
    
    /**
     * Scrape product details from the given URL
     */
    scrapeProduct(url: string): Promise<ScrapedProduct>;
}

/**
 * Service for scraping product data from various e-commerce platforms
 */
@Injectable()
export class ScraperService {
    private readonly logger = new Logger(ScraperService.name);
    private providers: ScraperProvider[] = [];

    constructor() {
        this.logger.log('ScraperService initialized');
    }

    /**
     * Register a scraper provider
     */
    registerProvider(provider: ScraperProvider): void {
        this.providers.push(provider);
        this.logger.log(`Registered scraper provider: ${provider.constructor.name}`);
    }

    /**
     * Register multiple scraper providers
     */
    registerProviders(providers: ScraperProvider[]): void {
        providers.forEach(provider => this.registerProvider(provider));
    }

    /**
     * Get the appropriate provider for the given URL
     */
    private getProvider(url: string): ScraperProvider | null {
        for (const provider of this.providers) {
            try {
                if (provider.canScrape(url)) {
                    this.logger.log(`Found provider ${provider.constructor.name} for URL: ${url}`);
                    return provider;
                }
            } catch (error: unknown) {
                this.logger.warn(`Error checking provider ${provider.constructor.name}: ${getErrorMessage(error)}`);
            }
        }
        return null;
    }

    /**
     * Scrape search results from the given URL
     */
    async scrapeSearch(url: string): Promise<ScrapedSearchResult> {
        this.logger.log(`Attempting to scrape search results from: ${url}`);
        
        const provider = this.getProvider(url);
        if (!provider) {
            const error = `No suitable scraper provider found for the URL: ${url}`;
            this.logger.error(error);
            throw new Error(error);
        }

        try {
            const result = await provider.scrapeSearch(url);
            this.logger.log(`Successfully scraped ${result.products?.length || 0} products from search`);
            return result;
        } catch (error: unknown) {
            this.logger.error(`Error scraping search from ${url}: ${getErrorMessage(error)}`, (error as any)?.stack);
            throw new Error(`Failed to scrape search results: ${getErrorMessage(error)}`);
        }
    }

    /**
     * Scrape product details from the given URL
     */
    async scrapeProduct(url: string): Promise<ScrapedProduct> {
        this.logger.log(`Attempting to scrape product from: ${url}`);
        
        const provider = this.getProvider(url);
        if (!provider) {
            const error = `No suitable scraper provider found for the URL: ${url}`;
            this.logger.error(error);
            throw new Error(error);
        }

        try {
            const result = await provider.scrapeProduct(url);
            this.logger.log(`Successfully scraped product: ${result.productName}`);
            return result;
        } catch (error: unknown) {
            this.logger.error(`Error scraping product from ${url}: ${getErrorMessage(error)}`, (error as any)?.stack);
            throw new Error(`Failed to scrape product: ${getErrorMessage(error)}`);
        }
    }

    /**
     * Get list of registered providers
     */
    getRegisteredProviders(): string[] {
        return this.providers.map(p => p.constructor.name);
    }

    /**
     * Check if a URL can be scraped by any registered provider
     */
    canScrape(url: string): boolean {
        return this.getProvider(url) !== null;
    }
}