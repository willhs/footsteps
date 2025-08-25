# Use official Node.js runtime as the base image
FROM node:18-alpine AS base

# Install system packages once
FROM base AS pkg
# libc6-compat enables some native npm modules, sqlite provides the CLI for
# MBTiles fallback access, and curl supports health checks.
RUN apk add --no-cache libc6-compat sqlite curl

# Install dependencies only when needed
FROM pkg AS deps
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi

# Rebuild the source code only when needed
FROM pkg AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment variables for build
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_TILES_BASE_URL="https://storage.googleapis.com/footsteps-earth-tiles/tiles/humans"
ENV NEXT_PUBLIC_TILES_BASE_URL=${NEXT_PUBLIC_TILES_BASE_URL}

# Build the application
RUN \
  if [ -f yarn.lock ]; then yarn run build; \
  elif [ -f package-lock.json ]; then npm run build; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm run build; \
  else echo "Lockfile not found." && exit 1; \
  fi

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

# Copy runtime binaries from the pkg stage instead of installing again
COPY --from=pkg /usr/bin/sqlite3 /usr/bin/sqlite3
COPY --from=pkg /usr/bin/curl /usr/bin/curl
COPY --from=pkg /usr/lib /usr/lib
COPY --from=pkg /lib /lib

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Create directories for tiles
# /data will be mounted from persistent disk in production, local files in development
RUN mkdir -p /data/tiles/humans && chown -R nextjs:nodejs /data
RUN mkdir -p /app/data/tiles/humans && chown -R nextjs:nodejs /app/data
RUN mkdir -p /tmp && chown -R nextjs:nodejs /tmp

# Copy necessary files
COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

# Expose port 8080 (Cloud Run default)
EXPOSE 8080

ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=5s \
  CMD curl -f http://localhost:8080/health || exit 1

# Run the application
CMD ["node", "server.js"]
