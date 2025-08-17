#!/bin/bash

# Export MBTiles to static z/x/y .pbf and upload to GCS
# Usage: ./upload-data.sh [bucket-name] [--dry-run] [--help]

set -e

# Configuration
PROJECT_ID="footsteps-earth"
DEFAULT_BUCKET_NAME="footsteps-earth-tiles"
DATA_DIR="../../data/tiles/humans"
# Local export directory for static z/x/y .pbf tiles
ZXY_OUT_DIR="../../data/tiles/humans/zxy"
# GCS prefix for static tiles
TILES_PREFIX="tiles/humans"

# Parse arguments
BUCKET_NAME="$DEFAULT_BUCKET_NAME"
DRY_RUN=false
SHOW_HELP=false
# Defaults: overwrite is enabled (regenerate locally and replace on GCS)
OVERWRITE_LOCAL=true
OVERWRITE_REMOTE=true
DELETE_LOCAL_AFTER_UPLOAD=true

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --overwrite-local)
            OVERWRITE_LOCAL=true
            shift
            ;;
        --no-overwrite-local)
            OVERWRITE_LOCAL=false
            shift
            ;;
        --overwrite-remote)
            OVERWRITE_REMOTE=true
            shift
            ;;
        --no-overwrite-remote)
            OVERWRITE_REMOTE=false
            shift
            ;;
        --no-delete-local)
            DELETE_LOCAL_AFTER_UPLOAD=false
            shift
            ;;
        --keep-local)
            DELETE_LOCAL_AFTER_UPLOAD=false
            shift
            ;;
        --help|-h)
            SHOW_HELP=true
            shift
            ;;
        -*)
            echo "Unknown option: $1"
            echo "Usage: $0 [bucket-name] [--dry-run] [--help]"
            exit 1
            ;;
        *)
            BUCKET_NAME="$1"
            shift
            ;;
    esac
done

# Show help if requested
if [ "$SHOW_HELP" = true ]; then
    echo "Export MBTiles locally and upload static PBF tiles to GCS"
    echo ""
    echo "Usage: $0 [bucket-name] [options]"
    echo ""
    echo "Arguments:"
    echo "  bucket-name    GCS bucket name (default: $DEFAULT_BUCKET_NAME)"
    echo ""
    echo "Options:"
    echo "  --dry-run              Show what would be done without actually uploading"
    echo "  --overwrite-local      Regenerate local .pbf tiles (default: on)"
    echo "  --no-overwrite-local   Skip existing local .pbf tiles (resume mode)"
    echo "  --overwrite-remote     Overwrite existing objects on GCS (default: on)"
    echo "  --no-overwrite-remote  Do not overwrite GCS objects (no-clobber)"
    echo "  --no-delete-local      Keep local exported tiles after upload (default: delete per-year)"
    echo "  --keep-local           Alias of --no-delete-local"
    echo "  --help, -h             Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                           # Export and upload static tiles to default bucket"
    echo "  $0 my-bucket                 # Export and upload to custom bucket"
    echo "  $0 --dry-run                 # Preview steps only"
    echo ""
    echo "Behavior:"
    echo "  - Exports each combined MBTiles to static z/x/y .pbf and uploads to gs://$DEFAULT_BUCKET_NAME/$TILES_PREFIX/{year}/single/{z}/{x}/{y}.pbf"
    echo "  - Default upload overwrites existing objects. Use --no-overwrite-remote for no-clobber."
    echo "  - Sets long Cache-Control and appropriate Content-Type/Encoding for static tiles"
    exit 0
fi

# Show configuration
if [ "$DRY_RUN" = true ]; then
    echo "🧪 DRY RUN: Previewing static tiles export + upload to: gs://$BUCKET_NAME/$TILES_PREFIX/"
else
    echo "🚀 Exporting and uploading static tiles to: gs://$BUCKET_NAME/$TILES_PREFIX/"
fi

# Check if data directory exists
if [ ! -d "$DATA_DIR" ]; then
    echo "❌ Error: Data directory $DATA_DIR not found"
    exit 1
fi

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: gcloud CLI not found. Please install Google Cloud SDK"
    exit 1
fi

# Note: Using gcloud storage commands instead of gsutil for Python 3.12+ compatibility

# Set project
echo "📋 Setting project to $PROJECT_ID"
gcloud config set project $PROJECT_ID

# Check if bucket exists (fast, non-hanging)
echo "🔍 Checking if bucket exists (fast probe)..."
BUCKET_CHECK_STATUS=""
if command -v curl >/dev/null 2>&1; then
  # 200, 401, or 403 imply the bucket exists; 404 means it does not
  BUCKET_HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
    --connect-timeout 3 --max-time 6 \
    "https://storage.googleapis.com/storage/v1/b/$BUCKET_NAME") || BUCKET_HTTP=""
  if [ "$BUCKET_HTTP" = "200" ] || [ "$BUCKET_HTTP" = "403" ] || [ "$BUCKET_HTTP" = "401" ]; then
    echo "✅ Bucket exists (HTTP $BUCKET_HTTP)"
    BUCKET_CHECK_STATUS="ok"
  elif [ "$BUCKET_HTTP" = "404" ]; then
    echo "❌ Error: Bucket gs://$BUCKET_NAME not found (HTTP 404)"
    echo "💡 Run 'terraform apply' first to create the bucket"
    exit 1
  else
    echo "⚠️  Bucket probe inconclusive (HTTP: ${BUCKET_HTTP:-none}), falling back to gcloud..."
  fi
fi
if [ -z "$BUCKET_CHECK_STATUS" ]; then
  if gcloud storage buckets describe "gs://$BUCKET_NAME" --format="value(name)" >/dev/null 2>&1; then
    echo "✅ Bucket exists (gcloud)"
  else
    echo "❌ Error: Bucket gs://$BUCKET_NAME does not exist (gcloud)"
    echo "💡 Run 'terraform apply' first to create the bucket"
    exit 1
  fi
fi

# Count and validate files (exclude LOD-specific files)
FILE_COUNT=$(find "$DATA_DIR" -name "humans_*.mbtiles" | grep -v "_lod_" | wc -l)
COMBINED_SIZE=$(find "$DATA_DIR" -name "humans_*.mbtiles" | grep -v "_lod_" | xargs du -ch 2>/dev/null | tail -1 | cut -f1 || echo "unknown")
TOTAL_SIZE=$(du -sh "$DATA_DIR" 2>/dev/null | cut -f1 || echo "unknown")

echo "📦 Found $FILE_COUNT combined MBTiles files to export (size: $COMBINED_SIZE of $TOTAL_SIZE total)"
echo "🚀 Optimized export: Excluding LOD-specific files (66% size reduction)"

if [ "$FILE_COUNT" -eq 0 ]; then
    echo "❌ Error: No combined MBTiles files found in $DATA_DIR"
    echo "💡 Run 'cd footstep-generator && python process_hyde.py && python make_tiles.py' first"
    exit 1
fi

# List files to be processed (only combined yearly files)
echo "📋 MBTiles to export:"
find "$DATA_DIR" -name "humans_*.mbtiles" | grep -v "_lod_" | sort | while read -r file; do
    filename=$(basename "$file")
    filesize=$(du -sh "$file" 2>/dev/null | cut -f1 || echo "?")
    echo "  ✅ $filename ($filesize)"
done

# Show excluded files for transparency
LOD_COUNT=$(find "$DATA_DIR" -name "humans_*_lod_*.mbtiles" | wc -l)
if [ "$LOD_COUNT" -gt 0 ]; then
    echo ""
    echo "⏭️ Excluding $LOD_COUNT LOD-specific files (server uses combined files only):"
    find "$DATA_DIR" -name "humans_*_lod_*.mbtiles" | sort | head -5 | while read -r file; do
        filename=$(basename "$file")
        echo "  ❌ $filename (not needed)"
    done
    if [ "$LOD_COUNT" -gt 5 ]; then
        echo "  ... and $((LOD_COUNT - 5)) more LOD-specific files"
    fi
fi

# Dry run: show what would be done
if [ "$DRY_RUN" = true ]; then
    echo ""
    echo "🧪 DRY RUN: Would perform the following actions per-year (streaming):"
    echo "  1. Export humans_{year}.mbtiles → $ZXY_OUT_DIR/{year}/single/{z}/{x}/{y}.pbf"
    echo "  2. Upload that year's tiles to gs://$BUCKET_NAME/$TILES_PREFIX/{year}/single/... with metadata"
    echo "  3. Set public read permissions for that year's upload"
    echo "  4. Probe a sample tile over public HTTP"
    echo "  5. Delete local {year} tiles (unless --no-delete-local)"
    echo ""
    echo "✅ Dry run completed - no files were actually uploaded"
    exit 0
fi

# Export MBTiles to z/x/y .pbf locally
echo ""
echo "🧱 Streaming export → upload → delete per year to minimize local disk usage..."
mkdir -p "$ZXY_OUT_DIR"

# Detect Python
if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN=python3
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN=python
else
  echo "❌ Python not found on PATH"
  exit 1
fi

EXPORTED_COUNT=0
UPLOADED_COUNT=0
DELETED_COUNT=0
shopt -s nullglob
# Build optional overwrite arg for exporter
OVERWRITE_ARG=""
if [ "$OVERWRITE_LOCAL" = true ]; then
    OVERWRITE_ARG="--overwrite"
fi
for file in "$DATA_DIR"/humans_*.mbtiles; do
    # Skip LOD-specific files
    [[ "$file" == *_lod_* ]] && continue
    filename=$(basename "$file")
    year=$(echo "$filename" | sed -E 's/^humans_(-?[0-9]+)\.mbtiles$/\1/')
    if ! [[ "$year" =~ ^-?[0-9]+$ ]]; then
        echo "❌ Could not parse year from $file"
        exit 1
    fi
    YEAR_DIR="$ZXY_OUT_DIR/$year"
    echo "🛠️  Exporting $filename → $YEAR_DIR ${OVERWRITE_ARG:+(overwrite)}"
    if "$PYTHON_BIN" ../../footstep-generator/export_mbtiles_to_pbf.py --mbtiles "$file" --out-dir "$ZXY_OUT_DIR" $OVERWRITE_ARG; then
        EXPORTED_COUNT=$((EXPORTED_COUNT + 1))
    else
        echo "❌ Export failed for $file"
        exit 1
    fi

    # Prepare a sample tile URL (before deletion) for probing after upload
    SAMPLE_FILE=$(find "$YEAR_DIR" -type f -name "*.pbf" | head -n 1 || true)
    SAMPLE_URL=""
    if [ -n "$SAMPLE_FILE" ]; then
        REL_PATH="${SAMPLE_FILE#"$ZXY_OUT_DIR/"}"
        SAMPLE_URL="https://storage.googleapis.com/$BUCKET_NAME/$TILES_PREFIX/$REL_PATH"
    fi

    # Upload this year's tiles with correct metadata (prefer gcloud for Python 3.12+ compatibility)
    echo "⬆️  Uploading year $year to gs://$BUCKET_NAME/$TILES_PREFIX/"
    NO_CLOBBER_FLAG=""
    if [ "$OVERWRITE_REMOTE" != true ]; then
        NO_CLOBBER_FLAG="--no-clobber"
    fi
    if gcloud storage cp -r $NO_CLOBBER_FLAG \
        --cache-control="public, max-age=31536000, immutable" \
        --content-type="application/x-protobuf" \
        --content-encoding="gzip" \
        --canned-acl="publicRead" \
        "$YEAR_DIR" "gs://$BUCKET_NAME/$TILES_PREFIX/"; then
        echo "✅ Uploaded year $year with metadata (gcloud${OVERWRITE_REMOTE:+, overwrite})"
        UPLOADED_COUNT=$((UPLOADED_COUNT + 1))
    else
        echo "❌ Upload failed for year $year via gcloud"
        exit 1
    fi

    # Public access handled via --canned-acl=publicRead or bucket-level IAM; skipping per-object ACL changes

    # Probe a sample static tile to ensure availability
    if [ -n "$SAMPLE_URL" ]; then
        echo "🔎 Probing a sample tile for year $year: $SAMPLE_URL"
        HEADERS=$(curl -sI -H "Accept-Encoding: identity" "$SAMPLE_URL" || true)
        echo "$HEADERS" | head -n 1
        if echo "$HEADERS" | grep -q "200 OK"; then
            echo "✅ Sample tile accessible"
        else
            echo "⚠️  Sample tile not accessible yet (may be due to ACL propagation or caching)"
        fi
    fi

    # Delete local tiles to free disk space unless asked to keep them
    if [ "$DELETE_LOCAL_AFTER_UPLOAD" = true ]; then
        echo "🧹 Deleting local tiles for year $year at $YEAR_DIR"
        rm -rf "$YEAR_DIR"
        DELETED_COUNT=$((DELETED_COUNT + 1))
    else
        echo "💾 Keeping local tiles for year $year (per --no-delete-local)"
    fi
done
shopt -u nullglob

echo "✅ Streamed export+upload completed: exported $EXPORTED_COUNT, uploaded $UPLOADED_COUNT, deleted local $DELETED_COUNT"

echo ""
echo "🔐 Per-year ACL and probe executed during streaming; skipping global ACL/probe."

# Final summary
echo ""
echo "🎉 Data upload completed successfully!"
echo "📦 Exported and uploaded static tiles from $FILE_COUNT MBTiles (local size: $TOTAL_SIZE)"
echo "🗂️  Synced static tiles to gs://$BUCKET_NAME/$TILES_PREFIX/"
echo "🌐 Base URL: https://storage.googleapis.com/$BUCKET_NAME/$TILES_PREFIX/"
echo "🔗 View in console: https://console.cloud.google.com/storage/browser/$BUCKET_NAME"