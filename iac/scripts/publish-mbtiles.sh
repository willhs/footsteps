#!/usr/bin/env bash
set -euo pipefail

# Upload all humans_*.mbtiles to gs://$BUCKET/tiles/mbtiles/
# Usage: BUCKET=footsteps-earth-tiles ./publish-mbtiles.sh [--overwrite]

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
SRC_DIR=${SRC_DIR:-"$REPO_ROOT/data/tiles/humans"}
BUCKET=${BUCKET:-footsteps-earth-tiles}
PREFIX=${PREFIX:-tiles/mbtiles}
OVERWRITE=false

if [[ ${1:-} == "--overwrite" ]]; then
  OVERWRITE=true
fi

if [[ ! -d "$SRC_DIR" ]]; then
  echo "❌ SRC_DIR not found: $SRC_DIR" >&2
  exit 1
fi

echo "📤 Uploading *.mbtiles from $SRC_DIR to gs://$BUCKET/$PREFIX/"
FLAGS=("-r")
if [[ "$OVERWRITE" == false ]]; then
  FLAGS+=("--no-clobber")
fi

gcloud storage cp "${FLAGS[@]}" "$SRC_DIR"/*.mbtiles "gs://$BUCKET/$PREFIX/"

echo "✅ Done"
