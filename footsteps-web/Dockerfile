# Build stage using Node.js to install dependencies and compile the app
FROM node:18 AS deps
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm install --frozen-lockfile; \
  else echo "Lockfile not found." && exit 1; \
  fi

FROM deps AS builder
WORKDIR /app
COPY . .

# Set environment variables for build
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Allow overriding CDN/PMTiles origin at build time for client bundles
ARG NEXT_PUBLIC_CDN_HOST
ARG PMTILES_ORIGIN
ENV NEXT_PUBLIC_CDN_HOST=${NEXT_PUBLIC_CDN_HOST}
ENV PMTILES_ORIGIN=${PMTILES_ORIGIN}

# Build the application
RUN \
  if [ -f yarn.lock ]; then yarn run build; \
  elif [ -f package-lock.json ]; then npm run build; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm run build; \
  else echo "Lockfile not found." && exit 1; \
  fi

# Remove dev dependencies to keep runtime lean
RUN \
  if [ -f yarn.lock ]; then yarn workspaces focus --all --production; \
  elif [ -f package-lock.json ]; then npm prune --omit=dev; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm prune --prod; \
  fi

# Prepare required directories for runtime
RUN mkdir -p /data/tiles/humans /app/data/tiles/humans /tmp

# Production image using a minimal distroless base
FROM gcr.io/distroless/nodejs18 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy application files
COPY --from=builder --chown=nonroot:nonroot /app/public ./public
COPY --from=builder --chown=nonroot:nonroot /app/.next/standalone ./
COPY --from=builder --chown=nonroot:nonroot /app/.next/static ./.next/static
COPY --from=builder --chown=nonroot:nonroot /data /data
COPY --from=builder --chown=nonroot:nonroot /app/data /app/data
COPY --from=builder --chown=nonroot:nonroot /tmp /tmp

USER nonroot

# Expose port 8080 (Cloud Run default)
EXPOSE 8080

ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Health check using Node since distroless lacks curl
HEALTHCHECK --interval=30s --timeout=5s CMD ["/nodejs/bin/node","-e","require('http').get('http://localhost:8080/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"]

# Run the application
CMD ["server.js"]

