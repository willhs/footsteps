# Hosting Options: Cheap Paths

Updated: 2025-08-10

## Context

> Note: The app has migrated from a legacy NDJSON API to pre‑tiled vector tiles (MBTiles with MVT). The bullets below reflect the current architecture; much of the remainder of this doc describes the older NDJSON streaming approach and is kept for reference.

- App: Next.js (Deck.gl) at `humans-globe/`, uses a Tile API `/api/tiles/{year}/single/{z}/{x}/{y}.pbf`.
- Data: MBTiles under `data/tiles/humans/` (one per year, single layer `humans`).
- Pipeline: Python generates tiles offline with Tippecanoe (see `footstep-generator/make_tiles.py`).
- Tile behavior: Serves Mapbox Vector Tiles with ETag and immutable caching; frontend uses deck.gl `MVTLayer`.

## Cheap Hosting Options

1) Fly.io (single VM)
- What: Run `next start` on a tiny VM; keep dataset on disk (image or mounted volume).
- Changes: Minimal. Prefer `DATA_DIR` env var in API to locate data. No serverless limits.
- Cost: ~$0–$2/mo for low traffic + ~$1–$3/mo for 10–20 GB volume.
- Pros: Easiest path from current code; keeps streaming+gzip logic.
- Cons: You manage a small VM/volume.

2) Hetzner VPS (CX11)
- What: Simple Node server on a budget VPS; data on disk.
- Cost: ~€2.49/mo all-in.
- Pros: Very cheap, predictable; minimal code changes.
- Cons: You manage the box; no autoscale.

3) Vercel Hobby + Object Storage (R2/S3)
- What: Deploy the app on Vercel; store `data/processed` in R2/S3; API fetches + decompresses stream from object storage.
- Cost: App free; storage ~$0–$2/mo (R2 is very cheap at 1.7 GB).
- Pros: Managed platform, good DX, near-zero cost at small scale.
- Cons: Small refactor to use HTTP streams; avoid bundling data into the deploy.

4) Cloudflare Pages + R2
- What: Next.js on Pages Functions; read from R2 using Workers streaming APIs.
- Cost: Typically $0–$3/mo (R2 storage; egress often free within CF).
- Pros: Great egress economics; global edge; cheap.
- Cons: Use Workers APIs (no Node `fs`/`zlib`); requires stream+decompression changes.

5) Netlify + Object Storage
- What: Similar to Vercel; Netlify Functions stream from R2/S3.
- Cost: Likely free for app + storage costs.
- Pros: Managed, simple.
- Cons: Same streaming refactor as above.

Note: Bundling 1.7 GB into a serverless deploy (Vercel/Netlify) is not viable; use a VM or external object storage.

## Ballpark Costs

- Fly.io tiny VM + 20 GB volume: ~$2–$5/mo.
- Hetzner CX11: €2.49/mo.
- Vercel Hobby + R2 (1.7 GB): <$2/mo (storage+requests).
- Cloudflare Pages + R2 (1.7 GB): ~$0–$3/mo depending on traffic.

## Recommendations

- Minimal change, live quickly: Fly.io or Hetzner with data on disk.
- Lowest ongoing cost on a managed platform: Vercel Hobby or Cloudflare Pages + R2; refactor the API route to stream from object storage.

## Implementation Notes

VM Path (Fly/Hetzner)
- Add `DATA_DIR` env var support in the API route; prefer it before `../data/processed`.
- Build with `pnpm build`; serve with `pnpm start` (or `next start -p 4444`).
- Fly quick steps:
  - Add a Dockerfile for `humans-globe` that builds and runs `next start`.
  - `flyctl launch`; create volume (`flyctl volumes create data --size 20`), mount at `/data`.
  - Set `DATA_DIR=/data/processed`; upload `data/processed` once.

Serverless + Object Storage Path (Vercel/Cloudflare/Netlify)
- Preferred: serve prebuilt vector tiles.
  - Option A (API backed by MBTiles on disk/volume):
    - Upload `data/tiles/humans/*.mbtiles` to a VM or attach a persistent volume.
    - API route opens the MBTiles (SQLite) and returns tile bytes with
      `SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?`.
    - Set `Content-Type: application/x-protobuf`, strong `ETag`, and `Cache-Control: public, max-age=31536000, immutable`.
  - Option B (pure serverless): convert MBTiles → PMTiles and host as a static file in R2/S3/Pages Assets.
    - Frontend loads with `@protomaps/pmtiles` using a `PMTiles`/`MVTLayer` source.
    - Benefits: zero server code, global edge caching, cheap egress.
  - Keep LOD by zoom policy consistent with tile metadata; no NDJSON parsing is needed.

## Next Steps (choose one)

Option A — VM (minimal change)
- [ ] Add `DATA_DIR` support in API route.
- [ ] Add Dockerfile and process manager config (or Fly config).
- [ ] Provision VM/volume; copy data; deploy.

Option B — Serverless + R2 (lowest cost)
- [ ] Upload artifacts to R2; store credentials as env vars.
- [ ] Switch API route to stream from R2/S3; keep gzip + NDJSON parse.
- [ ] Deploy to Vercel/Cloudflare; verify performance and costs.

Appendix: Why not pure static export?
- The app’s API route performs dynamic viewport filtering and on-the-fly aggregation. Pre-materializing all combinations is impractical; the streaming filter+aggregate keeps responses small and interactive behavior intact while remaining cheap on a VM or when backed by object storage.
