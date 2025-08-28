#!/usr/bin/env bash
set -euo pipefail

# Upload PMTiles to GCS efficiently (skip unchanged, set cache headers)
# Usage:
#   scripts/upload_pmtiles.sh [--bucket gs://your-bucket] [--dir data/tiles/humans] [--years "-1000 0 1000"]
#
# Defaults (overridable):
#   Bucket:   $BUCKET or $GCS_TILES_BUCKET or gs://footsteps-earth-tiles
#   Source:   $TILES_DIR or $HUMANS_TILES_DIR or data/tiles/humans

PREFIX_DEFAULT="${PMTILES_PREFIX:-pmtiles}"
DEST_BUCKET_DEFAULT="${BUCKET:-${GCS_TILES_BUCKET:-gs://footsteps-earth-tiles}}"
DEST_BUCKET="${DEST_BUCKET_DEFAULT}"

# Default source directory (can be overridden)
SRC_DIR_DEFAULT="${TILES_DIR:-${HUMANS_TILES_DIR:-data/tiles/humans}}"
SRC_DIR="$SRC_DIR_DEFAULT"
YEARS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --bucket)
      DEST_BUCKET="$2"; shift 2 ;;
    --dir)
      SRC_DIR="$2"; shift 2 ;;
    --years)
      read -r -a YEARS <<< "$2"; shift 2 ;;
    --prefix)
      PREFIX_DEFAULT="$2"; shift 2 ;;
    gs://*)
      # Backward-compat: allow positional bucket first arg
      DEST_BUCKET="$1"; shift 1 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "${DEST_BUCKET}" || ! "${DEST_BUCKET}" =~ ^gs:// ]]; then
  echo "✗ No valid bucket set. Use --bucket gs://... or set BUCKET/GCS_TILES_BUCKET env vars." >&2
  exit 1
fi

# If DEST_BUCKET has no path, append prefix (e.g., gs://bucket -> gs://bucket/pmtiles)
if [[ "$DEST_BUCKET" =~ ^gs://[^/]+/?$ ]]; then
  DEST_BUCKET="${DEST_BUCKET%/}/$PREFIX_DEFAULT"
fi

if ! command -v gsutil >/dev/null 2>&1; then
  echo "✗ gsutil not found. Install gcloud SDK or run in CI with setup-gcloud." >&2
  exit 1
fi

if [[ ! -d "$SRC_DIR" ]]; then
  echo "✗ Source dir not found: $SRC_DIR" >&2
  exit 1
fi

echo "→ Uploading PMTiles from $SRC_DIR to $DEST_BUCKET ..."

if [[ ${#YEARS[@]} -eq 0 ]]; then
  echo "↪ copying all *.pmtiles (no bucket-wide listing)"
  shopt -s nullglob
  files=("$SRC_DIR"/*.pmtiles)
  if [[ ${#files[@]} -eq 0 ]]; then
    echo "  • no .pmtiles found in $SRC_DIR"
  else
    # Copy in parallel without overwriting existing
    gsutil -m cp -n "${files[@]}" "$DEST_BUCKET/" >/dev/null || true
  fi
  shopt -u nullglob
else
  echo "↪ copying years: ${YEARS[*]}"
  for y in "${YEARS[@]}"; do
    f="$SRC_DIR/humans_${y}.pmtiles"
    if [[ -f "$f" ]]; then
      gsutil -m cp -n "$f" "$DEST_BUCKET/" >/dev/null || true
    else
      echo "  • skip $y (missing $f)"
    fi
  done
fi

# Set strong cache headers on pmtiles objects
echo "↪ setting Cache-Control on .pmtiles"
gsutil -m setmeta -h 'Cache-Control:public, max-age=31536000, immutable' "${DEST_BUCKET}/**.pmtiles" >/dev/null || true

echo "✓ Upload complete"
