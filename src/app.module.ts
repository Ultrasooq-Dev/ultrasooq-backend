/**
 * @file app.module.ts — Root Application Module
 *
 * @intent
 *   Serves as the single root module that aggregates every feature module in
 *   the system. NestJS discovers and wires all controllers, providers, and
 *   sub-modules through this central import list.
 *
 * @idea
 *   NestJS follows a modular architecture where each domain concern (auth,
 *   product, order, etc.) lives in its own module. The root AppModule simply
 *   imports all of them, providing a clear top-level manifest of the system's
 *   capabilities. Infrastructure modules (ConfigModule, ScheduleModule) are
 *   also configured here globally.
 *
 * @usage
 *   Imported by NestFactory.create() in main.ts. This is the only module that
 *   is passed to the factory; everything else is pulled in transitively.
 *
 * @dataflow
 *   main.ts → AppModule → (all feature modules) → controllers & services
 *
 * @depends
 *   - @nestjs/common          (Module decorator)
 *   - @nestjs/config          (ConfigModule — reads .env, provides ConfigService globally)
 *   - @nestjs/schedule        (ScheduleModule — enables cron / interval tasks)
 *   - Every feature module in src/ (see import list below)
 *
 * @notes
 *   - ConfigModule.forRoot({ isGlobal: true }) means ConfigService can be
 *     injected anywhere without re-importing ConfigModule per feature module.
 *   - S3service is imported directly here (not via a module). This is unusual
 *     for NestJS — typically it should be wrapped in a module. It works because
 *     S3service is decorated as @Module internally (see user/s3.service.ts).
 *   - ScheduleModule.forRoot() initializes the task-scheduling subsystem;
 *     individual scheduled tasks are defined inside feature modules (e.g.,
 *     helper/helper.service.ts).
 *   - The order of module imports does not affect behavior; NestJS resolves
 *     the full DI graph before bootstrapping.
 */

import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { CategoryModule } from './category/category.module';
import { AdminModule } from './admin/admin.module';
import { NotificationModule } from './notification/notification.module';
import { S3service } from './user/s3.service';
import { ProductModule } from './product/product.module';
import { BrandModule } from './brand/brand.module';
import { CartModule } from './cart/cart.module';
import { OrderModule } from './order/order.module';
import { RfqProductModule } from './rfq-product/rfq-product.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { ChatModule } from './chat/chat.module';
import { PolicyModule } from './policy/policy.module';
import { FeesModule } from './fees/fees.module';
import { TeamMemberModule } from './team-member/team-member.module';
import { PaymentModule } from './payment/payment.module';
import { TagModule } from './tag/tag.module';
import { StripeModule } from './stripe/stripe.module';
import { AdminMemberModule } from './admin-member/admin-member.module';
import { HelperModule } from './helper/helper.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ServiceModule } from './service/service.module';
import { WalletModule } from './wallet/wallet.module';
import { ScraperModule } from './services/scraper/scraper.module';
import { BannerModule } from './banner/banner.module';
import { SystemLogModule } from './system-log/system-log.module';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { PrismaModule } from './prisma/prisma.module';
import { AppCacheModule } from './cache/cache.module';
import { HealthModule } from './health/health.module';
import { SpecificationModule } from './specification/specification.module';

@Module({
  imports: [
    /* ──────────── Infrastructure Modules ──────────── */

    /** Global Prisma database service — singleton PrismaClient via DI. */
    PrismaModule,

    /** Global configuration — reads .env and makes ConfigService injectable everywhere. */
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  singleLine: false,
                  translateTime: 'SYS:standard',
                },
              }
            : undefined,
        serializers: {
          req: (req) => ({
            id: req.id,
            method: req.method,
            url: req.url,
          }),
          res: (res) => ({
            statusCode: res.statusCode,
          }),
        },
        autoLogging: {
          ignore: (req) => {
            // Ignore health check endpoints
            return req.url === '/health' || req.url === '/';
          },
        },
      },
    }),

    /** Global Redis caching — connects to Redis in docker-compose. */
    AppCacheModule,

    /** Task scheduling — enables @Cron, @Interval, @Timeout decorators system-wide. */
    ScheduleModule.forRoot(),

    /** Rate limiting — 100 requests per 60-second window per client (global default). */
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),

    /* ──────────── Feature Modules (Domain) ──────────── */

    /** Health check endpoints — /health, /health/ready, /health/live */
    HealthModule,

    /** Specification templates + filterable specs for categories */
    SpecificationModule,

    SystemLogModule,
    UserModule,           // User registration, profiles, addresses, phone, branches, S3 uploads
    AuthModule,           // JWT authentication, login, signup, password reset, OTP
    CategoryModule,       // Product/service category tree management
    AdminModule,          // Super-admin operations (user management, product approval, analytics)
    NotificationModule,   // Email (SendGrid) and in-app notification dispatch
    S3service,            // AWS S3 file-upload service (registered as a module)
    ProductModule,        // Product CRUD, pricing, images, variants, search
    BrandModule,          // Brand CRUD
    CartModule,           // Shopping cart (regular, RFQ, factories)
    OrderModule,          // Order creation, status tracking, seller/buyer views
    RfqProductModule,     // Request-for-Quote product management
    WishlistModule,       // User wishlists
    ChatModule,           // Real-time chat (Socket.io gateway), rooms, messages
    PolicyModule,         // Store/seller policy management
    FeesModule,           // Platform fee configuration (location-based)
    TeamMemberModule,     // Team member management for seller accounts
    PaymentModule,        // Payment processing (Stripe, Paymob webhooks, refunds)
    TagModule,            // Tag (label) management for products
    StripeModule,         // Stripe Connect onboarding, account management
    AdminMemberModule,    // Admin role & permission management, admin member CRUD
    HelperModule,         // Shared helper/utility functions, scheduled cleanup tasks
    ServiceModule,        // Service (freelancer/company service offerings) CRUD
    WalletModule,
    ScraperModule,
    BannerModule
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
