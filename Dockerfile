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

# We intentionally DO NOT prune dev dependencies here. The runtime needs the
# prisma CLI (a devDep) to run `prisma migrate deploy` at boot. Keeping the
# full node_modules is simpler and more robust than copying the binary out
# and trying to reconstruct the package layout post-prune (the previous
# attempt broke under npm's flat layout vs. pnpm's symlinked layout).
# Image is ~50MB larger; trade-off is acceptable.

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

# Run migrations then start the server.
#
# `npx prisma` is used so we don't depend on a specific bin layout
# (npm vs. pnpm differ).
#
# RESET_DB env trigger: when set to "true", run `migrate reset --force`
# which DROPS ALL TABLES and reapplies migrations from scratch. Used
# exactly once to recover from migration drift after the consolidated
# migration was deleted. MUST be unset (or false) on subsequent deploys.
CMD ["sh", "-c", "if [ \"$RESET_DB\" = \"true\" ]; then echo '[boot] RESET_DB=true — wiping DB, reapplying migrations, running seed-admin'; npx prisma migrate reset --force; else echo '[boot] migrate deploy'; npx prisma migrate deploy; fi && exec node dist/src/main.js"]
