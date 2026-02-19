/**
 * @file product.module.ts
 * @description NestJS module definition for the Product domain of the Ultrasooq B2B/B2C marketplace.
 *   Registers the ProductController and all provider services required by the product
 *   feature set, including authentication, notifications, S3 file storage, and helper utilities.
 *
 * @module ProductModule
 *
 * @idea Centralises the dependency wiring for every product-related capability
 *   (CRUD, pricing, reviews, RFQ, factories, buy-group, seller rewards, generated links,
 *   existing-product copy, and custom fields) into a single NestJS module.
 *
 * @usage Imported by the root AppModule. No exports -- the module is self-contained.
 *
 * @dataflow
 *   AppModule -> ProductModule -> ProductController -> ProductService -> PrismaClient (module-scoped)
 *                                                   -> AuthService / JwtService (JWT verification)
 *                                                   -> NotificationService (in-app notifications)
 *                                                   -> S3service (image / barcode uploads)
 *                                                   -> HelperService (admin-id resolution)
 *                                                   -> UserService (user look-ups)
 *
 * @dependencies
 *   - {@link ProductController}       -- HTTP routing layer
 *   - {@link ProductService}          -- business logic facade (delegates to sub-services)
 *   - {@link ProductSearchService}    -- search, filtering, and listing logic (Phase B13)
 *   - {@link ProductPricingService}   -- product-price CRUD and bulk operations (Phase B13)
 *   - {@link ProductMediaService}     -- barcode generation and analytics tracking (Phase B13)
 *   - {@link ProductRfqService}      -- RFQ product and quote management (Phase B14)
 *   - {@link ProductBuyGroupService} -- buy-group product listings (Phase B14)
 *   - {@link ProductFactoryService}  -- factory/custom product operations (Phase B14)
 *   - {@link UserService}             -- user look-up operations
 *   - {@link AuthService}             -- JWT token validation
 *   - {@link JwtService}              -- low-level JWT sign / verify
 *   - {@link NotificationService}     -- push & in-app notifications
 *   - {@link S3service}               -- AWS S3 file uploads
 *   - {@link HelperService}           -- admin-id / team-member ownership resolution
 *
 * @notes
 *   - All providers are registered directly (no imports of other NestJS modules);
 *     therefore each provider must be self-sufficient or rely only on providers listed here.
 *   - PrismaClient is instantiated at module scope inside ProductService (not DI-managed).
 */
import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { UserService } from 'src/user/user.service';
import { AuthService } from 'src/auth/auth.service';
import { NotificationService } from 'src/notification/notification.service';
import { JwtService } from '@nestjs/jwt';
import { S3service } from 'src/user/s3.service';
import { HelperService } from 'src/helper/helper.service';
import { OpenRouterService } from './openrouter.service';
import { ProductSearchService } from './product-search.service';
import { ProductPricingService } from './product-pricing.service';
import { ProductMediaService } from './product-media.service';
import { ProductRfqService } from './product-rfq.service';
import { ProductBuyGroupService } from './product-buygroup.service';
import { ProductFactoryService } from './product-factory.service';
import { SpecificationService } from '../specification/specification.service';

/**
 * @class ProductModule
 * @description NestJS module that bundles the Product feature controllers and providers.
 *
 * @intent Provide a single registration point so the root AppModule can activate all
 *   product-related HTTP endpoints and their backing services in one import.
 *
 * @notes
 *   - No `exports` array -- services are private to this module.
 *   - No `imports` array -- cross-module services are listed directly in `providers`.
 *   - ProductSearchService, ProductPricingService, and ProductMediaService are sub-services
 *     extracted from the monolithic ProductService (Phase B13 decomposition).
 *   - ProductRfqService, ProductBuyGroupService, and ProductFactoryService are sub-services
 *     extracted from the monolithic ProductService (Phase B14 decomposition).
 *     ProductService acts as a facade, delegating to these sub-services.
 */
@Module({
  controllers: [ProductController],
  providers: [
    ProductService,
    ProductSearchService,
    ProductPricingService,
    ProductMediaService,
    ProductRfqService,
    ProductBuyGroupService,
    ProductFactoryService,
    UserService,
    AuthService,
    JwtService,
    NotificationService,
    S3service,
    HelperService,
    OpenRouterService,
    SpecificationService,
  ]
})
export class ProductModule {}
