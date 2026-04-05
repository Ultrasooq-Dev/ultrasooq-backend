/**
 * @file main.ts — Application Entry Point
 *
 * @intent
 *   Bootstraps the entire NestJS backend application. This is the first file
 *   executed when the server starts. It creates the NestJS app instance,
 *   configures global middleware (CORS, validation, logging), and begins
 *   listening on port 3000.
 *
 * @idea
 *   NestJS uses a factory pattern (NestFactory.create) to build the app from
 *   the root AppModule. All cross-cutting concerns (validation, CORS, logging)
 *   are applied here at the global level so every route benefits automatically.
 *
 * @usage
 *   Called via `npm run start` / `npm run start:dev` (see package.json scripts).
 *   The compiled JavaScript equivalent (dist/main.js) is the production entry.
 *
 * @dataflow
 *   1. Polyfill globalThis.crypto (for @nestjs/schedule on older Node runtimes)
 *   2. NestFactory.create(AppModule) → initializes all modules, controllers,
 *      providers, and their dependency-injection graph.
 *   3. Helmet middleware sets security-related HTTP headers (X-Content-Type-Options,
 *      Strict-Transport-Security, X-Frame-Options, etc.).
 *   4. CORS enabled with an explicit origin whitelist (env CORS_ORIGINS or
 *      localhost defaults). Only specified methods and headers are allowed.
 *   5. Global ValidationPipe strips unknown DTO properties (whitelist: true).
 *   6. Pino HTTP logger attached.
 *   7. Server listens on configured port (default 3000).
 *
 * @depends
 *   - @nestjs/core          (NestFactory)
 *   - @nestjs/common         (ValidationPipe)
 *   - helmet                 (Security HTTP headers)
 *   - compression            (gzip response compression)
 *   - nestjs-pino            (Pino structured logger)
 *   - node:crypto            (randomUUID polyfill)
 *   - ./app.module           (root module — aggregates all feature modules)
 *
 * @notes
 *   - CORS is restricted to an explicit origin whitelist. Set CORS_ORIGINS
 *     env var (comma-separated) in production; defaults to localhost ports.
 *   - Helmet sets security headers but CSP and CrossOriginEmbedderPolicy are
 *     disabled to avoid breaking frontend asset loading.
 *   - `forbidNonWhitelisted` and `transform` are commented out. Enabling
 *     `forbidNonWhitelisted` would reject payloads with extra fields (stricter).
 *     Enabling `transform` would auto-cast primitives and instantiate DTOs.
 *   - Port is read from process.env.PORT (default 3000).
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import * as compression from 'compression';
import helmet from 'helmet';
import { randomUUID } from 'crypto';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';

// Pino logger configuration
import { Logger } from 'nestjs-pino';

/*
 * Polyfill: Some Node.js versions (<19) do not expose crypto on globalThis.
 * @nestjs/schedule internally relies on globalThis.crypto.randomUUID for
 * generating unique cron-job identifiers. This patch prevents a runtime crash.
 */
// Patch for globalThis.crypto to support @nestjs/schedule
if (!globalThis.crypto) {
  (globalThis as any).crypto = {
    randomUUID,
  };
}

/**
 * bootstrap — Async IIFE that creates and configures the NestJS application.
 *
 * @intent   Single place for all global app setup before listening.
 * @dataflow NestFactory.create → enableCors → useGlobalPipes → morgan → listen
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true, // Buffer logs until logger is ready
  });

  // Use Pino logger
  app.useLogger(app.get(Logger));
  const logger = app.get(Logger);

  // Global exception filter for consistent error responses
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Security headers via Helmet — sets various HTTP headers to help protect the app.
  // CSP and Cross-Origin-Embedder-Policy are disabled to avoid breaking frontend
  // asset loading and cross-origin iframe embeds during development.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Enable gzip response compression for all responses > 1 KB
  app.use(
    compression({
      threshold: 1024, // Only compress responses larger than 1 KB
      level: 6, // Balanced compression level (1 = fastest, 9 = best compression)
    }),
  );

  // Configure body parser for larger payloads
  const maxRequestSize = process.env.MAX_REQUEST_SIZE || '10mb';
  app.use(json({ limit: maxRequestSize }));
  app.use(urlencoded({ extended: true, limit: maxRequestSize }));

  /* CORS — restrict to an explicit whitelist of allowed origins.
     Set the CORS_ORIGINS env var as a comma-separated list in production
     (e.g. "https://app.ultrasooq.com,https://admin.ultrasooq.com").
     The x-test-user-id header is included for the dev auth-bypass guard. */
  app.enableCors({
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',')
      : ['http://localhost:4001', 'http://localhost:3001', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-test-user-id', 'Cache-Control', 'Pragma'],
    credentials: true,
  });

  /*
   * Global ValidationPipe: automatically validates incoming DTOs using
   * class-validator decorators. `whitelist: true` silently strips any
   * properties not declared in the DTO class, preventing unexpected data
   * from reaching controllers/services.
   */
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strips properties that are not defined in the DTO
      //   forbidNonWhitelisted: true, // Throws an error if non-whitelisted properties are sent
      //   transform: true,  // Automatically transforms request payloads into DTO instances
    }),
  );

  /* Morgan HTTP logger replaced by Pino logger interceptor. */
  // app.use(morgan('dev')); // Removed - using Pino logger instead

  // Global API prefix — all routes get /api/v1/ except health checks and docs
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'health/ready', 'health/live', 'health/system', 'api-docs', 'api-docs-json'],
  });

  // Swagger API Documentation Setup
  const config = new DocumentBuilder()
    .setTitle('Ultrasooq API')
    .setDescription('Ultrasooq B2B/B2C Marketplace API')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('auth', 'Authentication endpoints')
    .addTag('users', 'User management')
    .addTag('products', 'Product operations')
    .addTag('orders', 'Order management')
    .addTag('cart', 'Shopping cart')
    .addTag('categories', 'Category management')
    .addTag('specifications', 'Product specifications')
    .addTag('health', 'Health checks')
    .addTag('admin', 'Admin panel operations')
    .addTag('admin-members', 'Admin member & role management')
    .addTag('brands', 'Brand management')
    .addTag('banners', 'Banner management')
    .addTag('chat', 'Chat & messaging')
    .addTag('notifications', 'Notification management')
    .addTag('wallet', 'Wallet & transactions')
    .addTag('wishlist', 'Wishlist management')
    .addTag('stripe', 'Stripe payment integration')
    .addTag('payment', 'Payment operations')
    .addTag('fees', 'Fee configurations')
    .addTag('policies', 'Policy management')
    .addTag('services', 'Service listings')
    .addTag('team-members', 'Team member management')
    .addTag('system-logs', 'System log management')
    .addTag('scraper', 'Web scraping operations')
    .addServer('http://localhost:3000', 'Development Server')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document, {
    customSiteTitle: 'Ultrasooq API Documentation',
    customfavIcon: 'https://nestjs.com/img/logo-small.svg',
  });

  const port = parseInt(process.env.PORT || '3000', 10);
  await app.listen(port, '0.0.0.0'); // Listen on all network interfaces
  const url = await app.getUrl();
  logger.log(`USER App is Running on port ${url}`);
  logger.log(`API Documentation available at ${url}/api-docs`);
}
bootstrap();
