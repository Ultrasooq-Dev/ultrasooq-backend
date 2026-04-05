import { Module, OnModuleInit } from '@nestjs/common';
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

// BullMQ Processors
import { AmazonScrapeProcessor, TaobaoScrapeProcessor, AlibabaScrapeProcessor, AliExpressScrapeProcessor } from './processors/scrape.processor';

// Shared services
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

@Module({
    imports: [
        BullModule.forRootAsync({
            useFactory: (configService: ConfigService) => ({
                connection: {
                    host: configService.get<string>('REDIS_HOST', 'localhost'),
                    port: configService.get<number>('REDIS_PORT', 6379),
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
        ),
    ],
    controllers: [ScraperController],
    providers: [
        ScraperService,
        AmazonINScraperProvider,
        TaobaoScraperProvider,
        AlibabaScraperProvider,
        AmazonGlobalScraperProvider,
        AliExpressScraperProvider,
        HondaPartsScraperProvider,
        RockAutoScraperProvider,
        MegaZipScraperProvider,
        PartsOuqProvider,
        RealOEMProvider,
        CatCarProvider,
        YoshiPartsProvider,
        PartsNextProvider,
        ToyotaPartsProvider,
        ScraperQueueService,
        ScraperRotationService,
        TranslationService,
        CategoryMappingService,
        ScraperMonitorService,
        ScraperExportService,
        ScraperOrchestratorService,
        AmazonScrapeProcessor,
        TaobaoScrapeProcessor,
        AlibabaScrapeProcessor,
        AliExpressScrapeProcessor,
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
export class ScraperModule implements OnModuleInit {
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
        private readonly realOemProvider: RealOEMProvider,
        private readonly catCarProvider: CatCarProvider,
        private readonly yoshiPartsProvider: YoshiPartsProvider,
        private readonly partsNextProvider: PartsNextProvider,
        private readonly toyotaPartsProvider: ToyotaPartsProvider,
    ) {}

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
            this.realOemProvider,
            this.catCarProvider,
            this.yoshiPartsProvider,
            this.partsNextProvider,
            this.toyotaPartsProvider,
        ]);
    }
}
