# Lightweight Node.js container for cache warming
FROM node:18-alpine

# Install dependencies for GCS access
RUN apk add --no-cache \
    ca-certificates \
    && rm -rf /var/cache/apk/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY warm-cache.js ./

# Create cache directory with proper permissions
RUN mkdir -p /data/tiles/humans && chown -R node:node /data

# Switch to non-root user
USER node

# Set default environment variables
ENV NODE_ENV=production
ENV CACHE_WARMING_CONCURRENCY=3

# Run the cache warmer
CMD ["node", "warm-cache.js"]