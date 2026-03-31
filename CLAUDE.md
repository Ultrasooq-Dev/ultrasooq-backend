# Ultrasooq Backend — NestJS 11

**Port**: 3000 | **Dev**: `npm run start:dev` | **Test**: `npm test` | **Swagger**: `/api-docs`

## Stack
NestJS 11 · Prisma 7 · PostgreSQL · Redis (ioredis + cache-manager) · JWT · Socket.IO 4 · Pino logger · Helmet · Puppeteer 24 · SendGrid · Stripe 20 · Paymob · AmwalPay · @nestjs/schedule · @nestjs/throttler

## Directory Map
```
src/
├── main.ts                 # Bootstrap: CORS, Helmet, Swagger, ValidationPipe, /api/v1 prefix
├── app.module.ts           # Root module (26 feature modules + infrastructure)
├── prisma/                 # Global Prisma singleton
├── cache/                  # Redis cache (5min TTL, 1000 max)
├── health/                 # /health, /health/ready, /health/live, /health/system
├── guards/
│   ├── AuthGuard.ts        # JWT Bearer validation
│   └── SuperAdminAuthGuard.ts
├── common/
│   ├── filters/            # GlobalExceptionFilter
│   └── interceptors/       # LoggingInterceptor → SystemLog table
├── auth/                   # JWT login, signup, OTP, refresh
├── user/                   # CRUD, profiles, addresses, S3 uploads, multi-account
├── product/                # CRUD, search, reviews, Q&A, dropship, wholesale
├── category/               # Category tree, menu, whitelist/blacklist
├── order/                  # Create, status, shipping, vendor dashboard
├── cart/                   # Standard/RFQ/Factories/Service carts
├── rfq-product/            # Request-for-Quote
├── chat/                   # Socket.IO gateway, rooms, messages
├── notification/           # Email (SendGrid) + in-app
├── payment/                # Stripe, Paymob, AmwalPay, webhooks, EMI
├── wallet/                 # Balance, deposit, withdraw, transfer
├── admin/                  # Super-admin ops
├── admin-member/           # Admin roles & permissions
├── team-member/            # Seller team RBAC
├── specification/          # Spec templates, values, auto-categorize
├── service/                # Freelancer/company services
├── services/scraper/       # Amazon/Taobao import (Puppeteer)
└── [brand, banner, tag, policy, fees, system-log, helper, stripe, wishlist]/
prisma/schema.prisma        # 122 models, 40 enums, 3440 lines
```

## Conventions
- **API prefix**: `/api/v1/` (excludes: health, api-docs)
- **Auth**: `@UseGuards(JwtAuthGuard)` or `@UseGuards(SuperAdminAuthGuard)`
- **Validation**: `class-validator` DTOs, `ValidationPipe(whitelist: true)` strips unknown fields
- **Soft delete**: `status: 'DELETE'` + `deletedAt: new Date()`
- **Always filter**: `where: { deletedAt: null, status: { not: 'DELETE' } }`
- **Bilingual**: `field_en` + `field_ar`
- **Cache keys**: `p:{id}`, `ps:{page}`, `c:{id}`, `u:{id}`
- **Rate limit**: 100 req/60s (ThrottlerGuard)
- **Logging**: Pino structured → SystemLog table via LoggingInterceptor
- **Multi-seller**: Product → ProductPrice (one product, many sellers)

## Global Providers (app.module.ts)
- `LoggingInterceptor` (APP_INTERCEPTOR)
- `ThrottlerGuard` (APP_GUARD)
- `GlobalExceptionFilter`

## Database
- PostgreSQL with Prisma 7
- `search_vector` tsvector for full-text search on Product
- Prices: Decimal(8,2) or (10,2), Wallet: Decimal(12,2)
- M:N via explicit join tables (no implicit many-to-many)
- Migrations: `npx prisma migrate dev --name <name>`
- Generate: `npx prisma generate`

## Key Env Vars
- `DATABASE_URL` / `LOCAL_DATABASE_URL` — PostgreSQL connection
- `JWT_SECRET`, `JWT_EXPIRY` (default 1h)
- `PORT` (3000), `CORS_ORIGINS`, `FRONTEND_SERVER`
- `REDIS_HOST`, `REDIS_PORT`
- `AWS_ACCESS_KEY_ID/SECRET/BUCKET/LOCATION` — S3 uploads
- `STRIPE_SECRET_KEY/PUBLIC_KEY`
- `SENDGRID_API_KEY/SENDER`
- `OPENROUTER_API_KEY/MODEL/VISION_MODEL` — AI categorization

## Docker
- `docker-compose.yml` — PostgreSQL 15 + Redis 7 + App + Nginx (prod)
- `docker-compose.dev.yml` — Hot-reload + debug port 9229
- `Dockerfile` — Multi-stage node:22-alpine + Chromium

## Testing
- Jest + ts-jest
- Tests: `src/**/*.spec.ts`
- E2E: `test/jest-e2e.json`
