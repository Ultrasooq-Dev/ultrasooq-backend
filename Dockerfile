# ── Builder stage ──────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# System deps for native modules (bcrypt, etc.) and Chromium
RUN apk add --no-cache libc6-compat python3 make g++

# Copy package files and .npmrc (legacy-peer-deps=true for npm)
COPY package.json package-lock.json .npmrc ./

# Install ALL dependencies (including devDependencies for building).
# We use npm rather than pnpm — pnpm 10's strict-builds policy blocks
# build scripts on prisma/bcrypt/puppeteer/etc. and silently fails
# native compilation. .npmrc has legacy-peer-deps=true so npm ci
# tolerates the same peer-dep tree pnpm hoisted.
RUN NODE_ENV=development npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Dummy DATABASE_URL for prisma generate (doesn't connect, just needs the format)
ARG DATABASE_URL=postgresql://dummy:dummy@localhost:5432/dummy
ENV DATABASE_URL=$DATABASE_URL

# Generate Prisma client and build
RUN npx prisma generate && npx nest build

# Verify build output exists
RUN test -f dist/src/main.js && echo "BUILD OK: dist/src/main.js exists" || \
    (echo "BUILD FAILED: dist/src/main.js not found" && find dist -name "*.js" 2>/dev/null | head -10 && exit 1)

# Copy prisma CLI binary before pruning (it's a devDep but needed for migrate deploy)
RUN mkdir -p /tmp/prisma-cli && cp -r node_modules/prisma /tmp/prisma-cli/

# Prune dev dependencies — keep only production deps
RUN npm prune --omit=dev

# Restore prisma CLI for runtime migrations
RUN cp -r /tmp/prisma-cli/prisma node_modules/ && \
    mkdir -p node_modules/.bin && \
    ln -sf ../prisma/build/index.js node_modules/.bin/prisma

# ── Runner stage ──────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Chromium and runtime deps for Puppeteer
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production

# Copy production node_modules, built code, and Prisma files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.npmrc ./.npmrc

EXPOSE 3000

# Run migrations then start the server
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/src/main.js"]
