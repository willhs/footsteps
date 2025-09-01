PMTiles (local dev)

Place `humans_*.pmtiles` files in this directory to serve tiles directly from Next's static server during local development.

Usage
- Ensure `.env.local` has `NEXT_PUBLIC_CDN_HOST=/pmtiles` and `PMTILES_ORIGIN` is empty or commented out.
- Start the app: `pnpm dev`
- Requests will hit `/pmtiles/humans_{year}.pmtiles` and be served from this folder (no extra server needed).

Notes
- Do not commit large `.pmtiles` files to the repo.
- You can symlink this folder to your data directory if preferred.
