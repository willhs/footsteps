# MBTiles → PBF Cloud Run Job

Export `.mbtiles` hosted in GCS to gzipped `.pbf` tiles in GCS (intra-region).

- Input: `gs://$SRC_BUCKET/$SRC_PREFIX/humans_{year}.mbtiles`
- Output: `gs://$DST_BUCKET/$OUT_PREFIX/{year}/single/{z}/{x}/{y}.pbf`
- Headers: `Content-Type: application/x-protobuf`, `Content-Encoding: gzip`, `Cache-Control: public, max-age=31536000, immutable`

## Config (env)
- `SRC_BUCKET` (required)
- `SRC_PREFIX` (default: `tiles/mbtiles/`)
- `DST_BUCKET` (default: same as `SRC_BUCKET`)
- `OUT_PREFIX` (default: `tiles/humans`)
- `CONCURRENCY` (default: `8`)
- `OVERWRITE` (default: `false`) — if `false`, skip existing objects
- `YEARS` (optional) — comma-separated years, e.g. `-1000,0,1500`

## Build & Deploy

```bash
# Upload one or more MBTiles
BUCKET=footsteps-earth-tiles iac/scripts/publish-mbtiles.sh

# Build + deploy job
PROJECT=footsteps-earth REGION=us-central1 BUCKET=footsteps-earth-tiles \
  iac/scripts/deploy-mbtiles-export.sh

# Run job for a specific year (recommended for test)
REGION=us-central1 YEARS="-1000" iac/scripts/run-mbtiles-export.sh
```

Verify a tile (public):

```bash
curl -sI https://storage.googleapis.com/footsteps-earth-tiles/tiles/humans/-1000/single/9/471/293.pbf | sed -n '1,20p'
```

## Notes
- MBTiles must be tippecanoe-style with gzipped MVT (`tile_data` stored gzipped)
- Job uses Python `google-cloud-storage` client and SQLite3
- Concurrency bounded to avoid large memory growth
- Designed for idempotent re-runs (skip if object exists)
