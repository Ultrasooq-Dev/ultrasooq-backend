import { Module, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { ScraperService } from './scraper.service';
import { ScraperController } from './scraper.controller';

// Providers
import { AmazonINScraperProvider } from './providers/amazon.in.scraper.provider';
import { TaobaoScraperProvider } from './providers/taobao.scraper.provider';
import { AlibabaScraperProvider } from './providers/alibaba.scraper.provider';
import { AmazonGlobalScraperProvider } from './providers/amazon.global.scraper.provider';
import { AliExpressScraperProvider } from './providers/aliexpress.scraper.provider';

// Auto parts providers
import { HondaPartsScraperProvider } from './providers/auto-parts/hondaparts.scraper.provider';
import { RockAutoScraperProvider } from './providers/auto-parts/rockauto.scraper.provider';
import { MegaZipScraperProvider } from './providers/auto-parts/megazip.scraper.provider';
import { PartsOuqProvider } from './providers/auto-parts/partsouq.scraper.provider';
import { RealOEMProvider } from './providers/auto-parts/realoem.scraper.provider';
import { CatCarProvider } from './providers/auto-parts/catcar.scraper.provider';
import { YoshiPartsProvider, PartsNextProvider, ToyotaPartsProvider } from './providers/auto-parts/multi-brand.scraper.provider';

// Mega-scraper services
import { ScraperQueueService } from './services/scraper-queue.service';
import { ScraperRotationService } from './services/scraper-rotation.service';
import { TranslationService } from './services/translation.service';
import { CategoryMappingService } from './services/category-mapping.service';
import { ScraperMonitorService } from './services/scraper-monitor.service';
import { ScraperExportService } from './services/scraper-export.service';
import { ScraperOrchestratorService } from './services/scraper-orchestrator.service';

// BullMQ Processors (workers that execute scraping jobs)
import { AmazonScrapeProcessor, TaobaoScrapeProcessor, AlibabaScrapeProcessor, AliExpressScrapeProcessor } from './processors/scrape.processor';

// Shared / helper services
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
 * including the mega-scraper BullMQ queue system.
 */
@Module({
    imports: [
        // Register all BullMQ queues used by the mega-scraper system.
        // The connection uses REDIS_HOST / REDIS_PORT env vars (defaults to localhost:6379).
        BullModule.forRootAsync({
            useFactory: (config: ConfigService) => ({
                connection: {
                    host: config.get<string>('REDIS_HOST', 'localhost'),
                    port: config.get<number>('REDIS_PORT', 6379),
                },
            }),
            inject: [ConfigService],
        }),
        BullModule.registerQueue(
            { name: 'scrape-amazon' },
            { name: 'scrape-taobao' },
            { name: 'scrape-alibaba' },
            { name: 'scrape-aliexpress' },
            { name: 'translate-text' },
            { name: 'translate-image' },
            { name: 'import-products' },
            { name: 'export-files' },
            { name: 'scrape-hondaparts' },
            { name: 'scrape-rockauto' },
            { name: 'scrape-megazip' },
            { name: 'scrape-partsouq' },
            { name: 'scrape-realoem' },
            { name: 'scrape-catcar' },
            { name: 'scrape-yoshiparts' },
            { name: 'scrape-partsnext' },
            { name: 'scrape-toyotaparts' },
        ),
    ],
    controllers: [ScraperController],
    providers: [
        // Core scraper service
        ScraperService,

        // Platform providers
        AmazonINScraperProvider,
        TaobaoScraperProvider,
        AlibabaScraperProvider,
        AmazonGlobalScraperProvider,
        AliExpressScraperProvider,

        // Auto parts providers
        HondaPartsScraperProvider,
        RockAutoScraperProvider,
        MegaZipScraperProvider,
        PartsOuqProvider,
        RealOEMProvider,
        CatCarProvider,
        YoshiPartsProvider,
        PartsNextProvider,
        ToyotaPartsProvider,

        // Mega-scraper services
        ScraperQueueService,
        ScraperRotationService,
        TranslationService,
        CategoryMappingService,
        ScraperMonitorService,
        ScraperExportService,
        ScraperOrchestratorService,

        // BullMQ Processors (workers)
        AmazonScrapeProcessor,
        TaobaoScrapeProcessor,
        AlibabaScrapeProcessor,
        AliExpressScrapeProcessor,

        // Shared / helper services
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
    exports: [ScraperService, ScraperQueueService, ScraperMonitorService, ScraperOrchestratorService],
})
export class ScraperModule implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(ScraperModule.name);

    constructor(
        private readonly scraperService: ScraperService,
        private readonly amazonProvider: AmazonINScraperProvider,
        private readonly taobaoProvider: TaobaoScraperProvider,
        private readonly alibabaProvider: AlibabaScraperProvider,
        private readonly amazonGlobalProvider: AmazonGlobalScraperProvider,
        private readonly aliExpressProvider: AliExpressScraperProvider,
        private readonly hondaPartsProvider: HondaPartsScraperProvider,
        private readonly rockAutoProvider: RockAutoScraperProvider,
        private readonly megaZipProvider: MegaZipScraperProvider,
        private readonly partsOuqProvider: PartsOuqProvider,
        private readonly realOEMProvider: RealOEMProvider,
        private readonly catCarProvider: CatCarProvider,
        private readonly yoshiPartsProvider: YoshiPartsProvider,
        private readonly partsNextProvider: PartsNextProvider,
        private readonly toyotaPartsProvider: ToyotaPartsProvider,
    ) {}

    /**
     * Register all providers when module initializes
     */
    onModuleInit() {
        this.scraperService.registerProviders([
            this.amazonProvider,
            this.taobaoProvider,
            this.alibabaProvider,
            this.amazonGlobalProvider,
            this.aliExpressProvider,
            this.hondaPartsProvider,
            this.rockAutoProvider,
            this.megaZipProvider,
            this.partsOuqProvider,
            this.realOEMProvider,
            this.catCarProvider,
            this.yoshiPartsProvider,
            this.partsNextProvider,
            this.toyotaPartsProvider,
        ]);
    }

    /**
     * Close all browser instances when module is destroyed (shutdown/restart).
     * Prevents Puppeteer/Browserbase session leaks.
     */
    async onModuleDestroy() {
        this.logger.log('Closing all scraper browser instances...');
        const providers = [
            this.taobaoProvider,
            this.alibabaProvider,
            this.aliExpressProvider,
        ];
        await Promise.allSettled(
            providers.map(async (p) => {
                if (typeof (p as any).close === 'function') {
                    await (p as any).close();
                }
            }),
        );
        this.logger.log('All scraper browser instances closed');
    }
}
