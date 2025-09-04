---
title: Migrate footsteps-web to static export
created: 2025-09-04
updated: 2025-09-04
---

Goal
- Serve the Next.js app as a static site and fetch PMTiles directly from a CDN/Worker, removing the need for a server runtime.

Context
- The app already pulls tiles from PMTiles over HTTP and contains client-only viz logic.
- Two server routes existed: a PMTiles proxy and a tiles API. Static export cannot include Route Handlers.

Decisions
- Switch `next.config.js` to `output: 'export'`.
- Remove `app/pmtiles/[...path]/route.ts` and `app/api/tiles/[year]/single/[z]/[x]/[y]/route.ts`.
- Default deployments use build-time env to point at the tiles CDN (`NEXT_PUBLIC_PMTILES_DIRECT=true` + `NEXT_PUBLIC_CDN_HOST`).
- Add a Cloudflare Pages workflow for static hosting; keep Cloud Run infra temporarily for transition.

How to Test
- Local build: `NEXT_PUBLIC_PMTILES_DIRECT=true NEXT_PUBLIC_CDN_HOST=https://<tiles-host> pnpm build` in `footsteps-web/`.
- Serve `out/` locally with `npx serve out` and verify tiles load and the slider scrubs through years.

Follow-ups
- Configure Cloudflare Pages project secrets and run the new deploy workflow.
- Retire Cloud Run deploy for the web app once static hosting is live.

Change Log
- 2025-09-04: Initial task doc created for static export migration.
- 2025-09-04: Removed legacy Cloud Run deploy workflow (.github/workflows/deploy.yml).
