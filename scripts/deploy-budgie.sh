#!/usr/bin/env bash
# Build the static app and push it (and any new tiles) to budgie.
#   scripts/deploy-budgie.sh            # app + tiles
#   SKIP_TILES=1 scripts/deploy-budgie.sh
#   GRID_ONLY=1 scripts/deploy-budgie.sh # publish generated grid + terrain images without rebuilding app
#   API_ONLY=1 scripts/deploy-budgie.sh  # day + anthropology API container only
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
}
if [[ -n "${GRID_ONLY:-}" ]]; then
  sync_grid
  exit 0
fi
# The day/anthropology API container only: no app build, no data sync.
if [[ -n "${API_ONLY:-}" ]]; then
  rsync -az "$ROOT/deploy/budgie/Caddyfile" "$ROOT/deploy/budgie/docker-compose.yml" "$REMOTE:$DEST/"
  rsync -az --delete --exclude=__pycache__ "$ROOT/deploy/budgie/api/" "$REMOTE:$DEST/api/"
  ssh "$REMOTE" "cd $DEST && docker compose up -d --build api && for i in \$(seq 1 20); do curl -fsS http://127.0.0.1:5090/api/day/health && exit 0; sleep 1; done; exit 1"
  echo
  exit 0
fi

# Tiles are same-origin (/pmtiles), served by Caddy next to the app.
(cd "$ROOT/footsteps-web" && NEXT_PUBLIC_CDN_HOST= NEXT_PUBLIC_PMTILES_DIRECT=false pnpm build)

ssh "$REMOTE" "mkdir -p $DEST/app $DEST/pmtiles"
rsync -az "$ROOT/deploy/budgie/Caddyfile" "$ROOT/deploy/budgie/docker-compose.yml" "$REMOTE:$DEST/"
rsync -az --delete --exclude=__pycache__ "$ROOT/deploy/budgie/api/" "$REMOTE:$DEST/api/"
rsync -az --delete --exclude=/pmtiles --exclude=/grid --exclude=/terrain "$ROOT/footsteps-web/out/" "$REMOTE:$DEST/app/"
# Units/Grid: one ~1 MB WebP per year (footstep-generator/grid_image.py)
sync_grid
if [[ -z "${SKIP_TILES:-}" ]]; then
  rsync -az --include='humans_*.pmtiles' --exclude='*' "$TILES_DIR/" "$REMOTE:$DEST/pmtiles/"
fi
ssh "$REMOTE" "cd $DEST && docker compose up -d --build && docker compose restart web >/dev/null && for i in 1 2 3 4 5 6 7 8 9 10; do curl -fsS http://127.0.0.1:5090/healthz && exit 0; sleep 1; done; exit 1"
echo
echo "Deployed. Local check: ssh $REMOTE curl -sI http://127.0.0.1:5090/"
