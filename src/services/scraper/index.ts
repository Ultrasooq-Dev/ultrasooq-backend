// Export service
export { ScraperService, ScraperProvider } from './scraper.service';

// Export module
export { ScraperModule } from './scraper.module';

// Export interfaces
export {
    ScrapedProduct,
    ScrapedSearchResult,
    ScrapedProductSummary,
    ScrapedImage,
    ScrapedSpecification,
} from './interfaces/scraped-product.interface';

// Export providers
export { AmazonINScraperProvider } from './providers/amazon.in.scraper.provider';
export { TaobaoScraperProvider } from './providers/taobao.scraper.provider';

// Export utilities
export { ScrapedProductMapper, CreateProductFromScrapedDataDto } from './utils/scraped-product.mapper';
