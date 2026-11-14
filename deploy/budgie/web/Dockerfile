# Footsteps web: the static export baked into Caddy. Built by .github/workflows/deploy-budgie.yml
# on every green main and pulled by Watchtower on budgie. Build context: the repository root.
# Data (population, terrain, habitat, fauna, evidence images; PMTiles) is not in git: budgie
# mounts it over /srv/app/<folder> (deploy/budgie/docker-compose.yml).
FROM node:20-bookworm-slim AS build
WORKDIR /src/footsteps-web
RUN corepack enable
COPY footsteps-web/package.json footsteps-web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY footsteps-web/ ./
# Tiles are same-origin (/pmtiles), served by Caddy next to the app.
ENV NEXT_PUBLIC_CDN_HOST= NEXT_PUBLIC_PMTILES_DIRECT=false NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM caddy:2.8-alpine
COPY deploy/budgie/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/footsteps-web/out /srv/app
ARG GIT_SHA=unknown
# /version.txt: which commit is live (the deploy workflow waits for it).
RUN echo "$GIT_SHA" > /srv/app/version.txt
