# Use official Node.js runtime as the base image
FROM node:18 AS base

# Install dependencies only when needed
FROM base AS deps
# Install sqlite and curl for later stages
RUN apt-get update \
  && apt-get install -y --no-install-recommends sqlite3 curl \
  && rm -rf /var/lib/apt/lists/*

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
FROM base AS builder
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

# Prepare runtime directories with correct permissions
RUN mkdir -p /data/tiles/humans /app/data/tiles/humans /tmp \
  && chown -R 65532:65532 /data /app/data /tmp

# Production image, copy all the files and run next
FROM gcr.io/distroless/nodejs18-debian11 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy sqlite and curl binaries plus required libs
COPY --from=deps /usr/bin/sqlite3 /usr/bin/sqlite3
COPY --from=deps /usr/bin/curl /usr/bin/curl
COPY --from=deps /lib/x86_64-linux-gnu /lib/x86_64-linux-gnu
COPY --from=deps /usr/lib/x86_64-linux-gnu /usr/lib/x86_64-linux-gnu
COPY --from=deps /etc/ssl/certs/ /etc/ssl/certs/

# Copy application files
COPY --from=builder --chown=65532:65532 /app/public ./public
COPY --from=builder --chown=65532:65532 /app/.next/standalone ./
COPY --from=builder --chown=65532:65532 /app/.next/static ./.next/static
COPY --from=builder --chown=65532:65532 /app/data ./data
COPY --from=builder --chown=65532:65532 /data /data
COPY --from=builder --chown=65532:65532 /tmp /tmp

USER 65532

# Expose port 8080 (Cloud Run default)
EXPOSE 8080

ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=5s CMD ["/usr/bin/curl", "-f", "http://localhost:8080/health"] || exit 1

# Run the application
CMD ["node", "server.js"]