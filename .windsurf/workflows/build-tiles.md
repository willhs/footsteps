---
description: Build/regenerate MBTiles (per-year, per-LOD) from HYDE 3.5
auto_execution_mode: 1
---

- __Objective__
  - Generate `humans_{year}_lod_{lod}.mbtiles` and combined `humans_{year}.mbtiles` in `data/tiles/humans/` using `footstep-generator/make_tiles.py`.

- __Prerequisites__
  - HYDE ASCII grids present under `footstep-generator/data/raw/hyde-3.5/` (files like `popd_*.asc`)
  - tippecanoe + tile-join installed (macOS): `brew install tippecanoe`

- __Set paths__ (run from repo root)
// turbo
```bash
export RAW_DIR="$(pwd)/footstep-generator/data/raw/hyde-3.5"
export TILES_DIR="$(pwd)/data/tiles/humans"
mkdir -p "$TILES_DIR"
```

- __Build all found years__ (scans `RAW_DIR` for `popd_*.asc`)
// turbo
```bash
poetry run python footstep-generator/make_tiles.py \
  --raw-dir "$RAW_DIR" \
  --tiles-dir "$TILES_DIR"
```

- __Build specific years__ (BCE is negative)
// turbo
```bash
poetry run python footstep-generator/make_tiles.py \
  --raw-dir "$RAW_DIR" \
  --tiles-dir "$TILES_DIR" \
  --years -1000 0 1500 2020
```

- __Overwrite existing outputs__
// turbo
```bash
poetry run python footstep-generator/make_tiles.py \
  --raw-dir "$RAW_DIR" \
  --tiles-dir "$TILES_DIR" \
  --years 2020 \
  --force
```

- __Verify outputs__
// turbo
```bash
ls -lh "$TILES_DIR" | grep humans_ | sort
# Inspect per-zoom tile counts in a combined tileset
sqlite3 "$TILES_DIR/humans_2020.mbtiles" "select zoom_level, count(*) from tiles group by zoom_level;"
```

- __Serve in dev__
// turbo
```bash
export HUMANS_TILES_DIR="$TILES_DIR"
cd humans-globe && pnpm dev -p 4444
```

- __LOD zoom ranges__ (must match generator + frontend)
  - LOD 0: z0–3, LOD 1: z4, LOD 2: z5, LOD 3: z6–12
  - Source of truth: `footstep-generator/make_tiles.py#LOD_ZOOM_RANGES`, `humans-globe/lib/lod.ts#getLODLevel`
