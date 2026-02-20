import { Module, OnModuleInit } from '@nestjs/common';
import { ScraperService } from './scraper.service';
import { ScraperController } from './scraper.controller';
import { AmazonINScraperProvider } from './providers/amazon.in.scraper.provider';
import { TaobaoScraperProvider } from './providers/taobao.scraper.provider';
import { ProductService } from 'src/product/product.service';
import { UserService } from 'src/user/user.service';
import { AuthService } from 'src/auth/auth.service';
import { NotificationService } from 'src/notification/notification.service';
import { JwtService } from '@nestjs/jwt';
import { S3service } from 'src/user/s3.service';
import { HelperService } from 'src/helper/helper.service';
import { OpenRouterService } from 'src/product/openrouter.service';
import { CacheService } from 'src/cache/cache.service';
import { ProductSearchService } from 'src/product/product-search.service';
import { ProductPricingService } from 'src/product/product-pricing.service';
import { ProductMediaService } from 'src/product/product-media.service';
import { ProductRfqService } from 'src/product/product-rfq.service';
import { ProductBuyGroupService } from 'src/product/product-buygroup.service';
import { ProductFactoryService } from 'src/product/product-factory.service';
import { SpecificationService } from 'src/specification/specification.service';

/**
 * Module for web scraping services
 * Provides scraping capabilities for various e-commerce platforms
 */
@Module({
    controllers: [ScraperController],
    providers: [
        ScraperService,
        AmazonINScraperProvider,
        TaobaoScraperProvider,
        ProductService,
        UserService,
        AuthService,
        JwtService,
        NotificationService,
        S3service,
        HelperService,
        OpenRouterService,
        CacheService,
        ProductSearchService,
        ProductPricingService,
        ProductMediaService,
        ProductRfqService,
        ProductBuyGroupService,
        ProductFactoryService,
        SpecificationService,
    ],
    exports: [ScraperService],
})
export class ScraperModule implements OnModuleInit {
    constructor(
        private readonly scraperService: ScraperService,
        private readonly amazonProvider: AmazonINScraperProvider,
        private readonly taobaoProvider: TaobaoScraperProvider,
    ) {}

    /**
     * Register all providers when module initializes
     */
    onModuleInit() {
        this.scraperService.registerProviders([
            this.amazonProvider,
            this.taobaoProvider,
        ]);
    }
}
