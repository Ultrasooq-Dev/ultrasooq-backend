# Ultrasooq Backend API

B2B/B2C marketplace backend powering the Ultrasooq platform. Handles authentication, product management, orders, payments, real-time chat, notifications, and admin operations.

## Tech Stack

- **Runtime:** Node.js 18+
- **Framework:** NestJS 11
- **ORM:** Prisma 6 (PostgreSQL)
- **Cache:** Redis via cache-manager + ioredis
- **Real-time:** Socket.IO 4
- **Auth:** JWT (access + refresh tokens)
- **File Storage:** AWS S3
- **Email:** SendGrid
- **Payments:** Stripe, Paymob, AmwalPay
- **Logging:** Pino (structured JSON logs)
- **Docs:** Swagger / OpenAPI

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 7+
- AWS account (for S3 file uploads)
- Stripe account (for payment processing)
- SendGrid account (for transactional email)

## Getting Started

```bash
# 1. Clone the repository
git clone <repo-url>
cd xmartech-ultrasooq-backend-main

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your actual values (database URL, secrets, API keys)

# 4. Push database schema
npx prisma db push

# 5. Seed initial data (admin user, categories, sample products)
npx prisma db seed

# 6. Start development server (hot reload)
npm run start:dev
```

The server starts on `http://localhost:3000` by default.

## Available Scripts

| Script             | Command                  | Description                          |
|--------------------|--------------------------|--------------------------------------|
| `start:dev`        | `nest start --watch`     | Start dev server with hot reload     |
| `start`            | `nest start`             | Start server (no watch)              |
| `start:prod`       | `node dist/main`         | Start production build               |
| `start:debug`      | `nest start --debug --watch` | Start with debugger attached     |
| `build`            | `nest build`             | Compile TypeScript to `dist/`        |
| `lint`             | `eslint ... --fix`       | Lint and auto-fix source files       |
| `format`           | `prettier --write ...`   | Format source files with Prettier    |
| `test`             | `jest`                   | Run unit tests                       |
| `test:watch`       | `jest --watch`           | Run tests in watch mode              |
| `test:cov`         | `jest --coverage`        | Run tests with coverage report       |
| `test:e2e`         | `jest --config ./test/jest-e2e.json` | Run end-to-end tests     |

## API Documentation

Swagger UI is available at `/api-docs` when the server is running:

```
http://localhost:3000/api-docs
```

All API routes are prefixed with `/api/v1/` (except health checks and docs).

## Health Check

```
GET /health        # Overall health status
GET /health/ready  # Readiness probe (database, Redis)
GET /health/live   # Liveness probe
```

## Authentication

The API uses JWT Bearer tokens. Include the token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

**Key auth endpoints (all under `/api/v1/auth/`):**

| Method | Endpoint         | Description              |
|--------|------------------|--------------------------|
| POST   | `/auth/login`    | Login, returns access + refresh tokens |
| POST   | `/auth/signup`   | Register a new user      |
| POST   | `/auth/refresh`  | Refresh an expired access token |
| POST   | `/auth/forgot-password` | Send password reset OTP |
| POST   | `/auth/verify-otp` | Verify OTP code        |

Access tokens expire after 1 hour (configurable via `JWT_EXPIRY`). Use the refresh endpoint to obtain a new access token without re-authenticating.

## Environment Variables

See `.env.example` for the full list. Key groups:

| Variable              | Description                                   |
|-----------------------|-----------------------------------------------|
| `LOCAL_DATABASE_URL`  | PostgreSQL connection string                  |
| `JWT_SECRET`          | Secret for signing JWT tokens                 |
| `JWT_EXPIRY`          | Token expiration (e.g., `1h`)                 |
| `PORT`                | Server port (default: `3000`)                 |
| `NODE_ENV`            | `development` or `production`                 |
| `CORS_ORIGINS`        | Comma-separated allowed origins               |
| `REDIS_HOST`          | Redis hostname (default: `localhost`)          |
| `REDIS_PORT`          | Redis port (default: `6379`)                  |
| `AWS_ACCESS_KEY_ID`   | AWS IAM access key for S3                     |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM secret key for S3                   |
| `AWS_BUCKET`          | S3 bucket name                                |
| `AWS_LOCATION`        | AWS region (e.g., `us-east-1`)                |
| `STRIPE_SECRET_KEY`   | Stripe secret key                             |
| `SENDGRID_API_KEY`    | SendGrid API key for email                    |
| `SENDGRID_SENDER`     | From address for outbound emails              |
| `PAYMOB_SECRET_KEY`   | Paymob payment gateway secret                 |
| `OPENROUTER_API_KEY`  | OpenRouter AI API key (product categorization)|

## Project Structure

```
src/
  main.ts                  # Application entry point (bootstrap, CORS, Swagger)
  app.module.ts            # Root module — imports all feature modules
  app.controller.ts        # Root controller
  app.service.ts           # Root service

  # --- Feature Modules ---
  auth/                    # JWT login, signup, OTP, password reset, token refresh
  user/                    # User CRUD, profiles, addresses, S3 uploads
  product/                 # Product CRUD, pricing, images, variants, search, AI categorization
  order/                   # Order creation, status tracking, buyer/seller views
  cart/                    # Shopping cart (regular, RFQ, factories)
  category/                # Category tree management
  brand/                   # Brand CRUD
  rfq-product/             # Request-for-Quote product management
  wishlist/                # User wishlists
  chat/                    # Real-time chat via Socket.IO (rooms, messages, attachments)
  notification/            # Email (SendGrid) and in-app notification dispatch
  payment/                 # Stripe, Paymob, AmwalPay payment processing + webhooks
  stripe/                  # Stripe Connect onboarding and account management
  wallet/                  # Wallet balance, transactions, transfers
  fees/                    # Platform fee configuration (location-based)
  policy/                  # Seller/store policy management
  service/                 # Freelancer/company service listings
  banner/                  # Banner/promotion management
  tag/                     # Tag/label management for products
  team-member/             # Seller team member management
  admin/                   # Super-admin operations (user mgmt, product approval, analytics)
  admin-member/            # Admin roles, permissions, admin member CRUD
  specification/           # Specification templates and filterable specs
  system-log/              # System audit log
  helper/                  # Shared utilities, scheduled cleanup tasks
  services/scraper/        # Web scraping (Amazon, Taobao product import)

  # --- Infrastructure ---
  prisma/                  # PrismaService (singleton database client)
  cache/                   # Redis cache module + CacheService wrapper
  guards/                  # AuthGuard (JWT), SuperAdminAuthGuard
  common/
    filters/               # GlobalExceptionFilter (consistent error responses)
    interceptors/          # LoggingInterceptor (request/response logging)

prisma/
  schema.prisma            # Database schema (100+ models)
  seed.ts                  # Main seed script
  seed-admin.ts            # Admin user seeding
  seed-categories.ts       # Category tree seeding
  seed-products.ts         # Sample product seeding
  migrations/              # Prisma migration history
```

## Docker

Docker Compose files are provided for development:

```bash
# Start with Docker (includes PostgreSQL + Redis)
docker-compose -f docker-compose.dev.yml up

# Production build
docker-compose up --build
```

## Rate Limiting

Global rate limiting is enabled: **100 requests per 60 seconds** per client (via `@nestjs/throttler`).

## Logging

Structured JSON logging via Pino. In development, logs are pretty-printed with color. Health check endpoints (`/health`) are excluded from automatic request logging to reduce noise.
