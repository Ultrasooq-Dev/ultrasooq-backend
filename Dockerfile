# Multi-stage build for NestJS with Prisma
FROM node:18-alpine AS builder

WORKDIR /app

# Install system dependencies for Puppeteer/Chromium
RUN apk add --no-cache libc6-compat chromium nss freetype harfbuzz ca-certificates ttf-freefont

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install pnpm and ALL dependencies (including devDependencies needed for build)
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && NODE_ENV=development pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN npx prisma generate && npm run build

# Verify build output exists
RUN test -f dist/main.js || (echo "ERROR: dist/main.js not found after build" && exit 1)

# --- Production image ---
FROM node:18-alpine AS runner
WORKDIR /app

# Install runtime dependencies for Puppeteer/Chromium
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production

# Copy everything needed from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

# Install pnpm for prisma migrate deploy at runtime
RUN npm install -g pnpm

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node --version || exit 1

# Run migrations then start
CMD npx prisma migrate deploy && node dist/main.js
