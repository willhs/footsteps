#!/usr/bin/env bash
# Code deploys itself: every green CI run on main builds the web and API images
# (.github/workflows/deploy-budgie.yml) and Watchtower on budgie pulls them. This script
# publishes what is not in git (data, PMTiles) and the compose file, then pulls the images now.
#   scripts/deploy-budgie.sh            # compose + data + tiles, pull and restart
#   SKIP_TILES=1 scripts/deploy-budgie.sh
#   GRID_ONLY=1 scripts/deploy-budgie.sh # data only: grid, terrain, habitat, fauna, evidence
#   API_ONLY=1 scripts/deploy-budgie.sh  # pull and restart the day + anthropology API only
# Images are built from main, so push first: this never ships uncommitted code.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="${REMOTE:-will@budgie}"
DEST="${DEST:-projects/deep-footsteps/deploy/budgie}"
TILES_DIR="${TILES_DIR:-$ROOT/data/tiles/humans}"

# Data-only publishing preserves other years and the existing population grids.
sync_grid() {
  ssh "$REMOTE" "mkdir -p $DEST/app/grid"
  rsync -az --include='humans_*.webp' --include='landuse_*.png' --exclude='*' \
    "$ROOT/data/tiles/grid/" "$REMOTE:$DEST/app/grid/"
  # Modelled pre-HYDE people (footstep-generator/prehistory_population.py): 90 tiny
  # WebPs named like the HYDE ones, so the app reads them from the same place.
  if compgen -G "$ROOT/data/tiles/prehistory/humans_*.webp" >/dev/null; then
    rsync -az --include='humans_*.webp' --exclude='*' \
      "$ROOT/data/tiles/prehistory/" "$REMOTE:$DEST/app/grid/"
  else
    echo "warning: no modelled pre-HYDE images; people before 10,000 BCE will be missing (see docs/ops/prehistory-population.md)" >&2
  fi
  # Population images used to be PNGs; drop the superseded ones.
  # find, not rm with a glob: budgie's zsh aborts on a glob with no matches.
  ssh "$REMOTE" "find $DEST/app/grid -name 'humans_*.png' -delete"
  # Terrain: one ~200 KB WebP per terrain year (footstep-generator/terrain_image.py)
  if compgen -G "$ROOT/data/tiles/terrain/earth_*.webp" >/dev/null; then
    ssh "$REMOTE" "mkdir -p $DEST/app/terrain"
    rsync -az --include='earth_*.webp' --exclude='*' \
      "$ROOT/data/tiles/terrain/" "$REMOTE:$DEST/app/terrain/"
  else
    echo "warning: no local terrain images; skipping (see docs/ops/terrain-images.md)" >&2
  fi
  # Hover card lookups: ~100 lossless WebPs of 70-90 KB (footstep-generator/habitat_lookup.py)
  if compgen -G "$ROOT/data/tiles/habitat/bp_*.webp" >/dev/null; then
    ssh "$REMOTE" "mkdir -p $DEST/app/habitat"
    rsync -az --include='bp_*.webp' --include='use_*.webp' --exclude='*' \
      "$ROOT/data/tiles/habitat/" "$REMOTE:$DEST/app/habitat/"
  else
    echo "warning: no local habitat lookups; the hover card will show no habitat (see docs/ops/habitat-lookup.md)" >&2
  fi
  # Hover card animals: 47 small region blocks + species.json (footstep-generator/fauna/export_web.py)
  if [[ -f "$ROOT/data/tiles/fauna/species.json" ]]; then
    ssh "$REMOTE" "mkdir -p $DEST/app/fauna"
    rsync -az --include='r_*.json' --include='species.json' --exclude='*' \
      "$ROOT/data/tiles/fauna/" "$REMOTE:$DEST/app/fauna/"
  else
    echo "warning: no local fauna files; the hover card will show no animals (see docs/ops/fauna.md)" >&2
  fi
  # Dated sites for ?evidence=1 (footstep-generator/evidence/), copied into public/evidence/
  if compgen -G "$ROOT/footsteps-web/public/evidence/*.json.gz" >/dev/null; then
    ssh "$REMOTE" "mkdir -p $DEST/app/evidence"
    rsync -az --include='*.json.gz' --exclude='*' \
      "$ROOT/footsteps-web/public/evidence/" "$REMOTE:$DEST/app/evidence/"
  else
    echo "warning: no footsteps-web/public/evidence; ?evidence=1 will show no sites" >&2
  fi
}
if [[ -n "${GRID_ONLY:-}" ]]; then
  sync_grid
  exit 0
fi
# The day/anthropology API container only: no app build, no data sync.
if [[ -n "${API_ONLY:-}" ]]; then
  rsync -az "$ROOT/deploy/budgie/docker-compose.yml" "$REMOTE:$DEST/"
  ssh "$REMOTE" "cd $DEST && docker compose pull api && docker compose up -d api && for i in \$(seq 1 20); do curl -fsS http://127.0.0.1:5090/api/day/health && exit 0; sleep 1; done; exit 1"
  echo
  exit 0
fi

ssh "$REMOTE" "mkdir -p $DEST/app/grid $DEST/app/terrain $DEST/app/habitat $DEST/app/fauna $DEST/app/evidence $DEST/pmtiles"
rsync -az "$ROOT/deploy/budgie/docker-compose.yml" "$REMOTE:$DEST/"
# Units/Grid: one ~1 MB WebP per year (footstep-generator/grid_image.py)
sync_grid
if [[ -z "${SKIP_TILES:-}" ]]; then
  rsync -az --include='humans_*.pmtiles' --exclude='*' "$TILES_DIR/" "$REMOTE:$DEST/pmtiles/"
fi
ssh "$REMOTE" "cd $DEST && docker compose pull && docker compose up -d && for i in 1 2 3 4 5 6 7 8 9 10; do curl -fsS http://127.0.0.1:5090/healthz && exit 0; sleep 1; done; exit 1"
echo
echo "Deployed. Live commit: $(curl -fsS https://footsteps.willhs.me/version.txt)"
