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

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
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
    echo "  --dry-run      Show what would be done without actually uploading"
    echo "  --help, -h     Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                           # Export and upload static tiles to default bucket"
    echo "  $0 my-bucket                 # Export and upload to custom bucket"
    echo "  $0 --dry-run                 # Preview steps only"
    echo ""
    echo "Behavior:"
    echo "  - Exports each combined MBTiles to static z/x/y .pbf and uploads to gs://$DEFAULT_BUCKET_NAME/$TILES_PREFIX/{year}/single/{z}/{x}/{y}.pbf"
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

# Check if bucket exists
echo "🔍 Checking if bucket exists..."
if ! gcloud storage ls gs://$BUCKET_NAME &> /dev/null; then
    echo "❌ Error: Bucket gs://$BUCKET_NAME does not exist"
    echo "💡 Run 'terraform apply' first to create the bucket"
    exit 1
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
    echo "🧪 DRY RUN: Would perform the following actions:"
    echo "  1. Export each combined MBTiles to local z/x/y .pbf under $ZXY_OUT_DIR/"
    echo "  2. Upload static tiles to gs://$BUCKET_NAME/$TILES_PREFIX/ with proper metadata"
    echo "  3. Set public read permissions on all files"
    echo "  4. Probe a sample static tile over public HTTP"
    echo ""
    echo "✅ Dry run completed - no files were actually uploaded"
    exit 0
fi

# Export MBTiles to z/x/y .pbf locally
echo ""
echo "🧱 Exporting MBTiles to local z/x/y .pbf tree..."
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
shopt -s nullglob
for file in "$DATA_DIR"/humans_*.mbtiles; do
    # Skip LOD-specific files
    [[ "$file" == *_lod_* ]] && continue
    echo "🛠️  Exporting $(basename "$file") → $ZXY_OUT_DIR"
    if "$PYTHON_BIN" ../../footstep-generator/export_mbtiles_to_pbf.py --mbtiles "$file" --out-dir "$ZXY_OUT_DIR"; then
        EXPORTED_COUNT=$((EXPORTED_COUNT + 1))
    else
        echo "❌ Export failed for $file"
        exit 1
    fi
done
shopt -u nullglob

echo "✅ Export completed for $EXPORTED_COUNT MBTiles files"

# Upload static tiles to GCS with correct metadata
echo ""
echo "⬆️ Uploading static tiles to gs://$BUCKET_NAME/$TILES_PREFIX/ (resume-friendly, no overwrite) ..."
if command -v gsutil >/dev/null 2>&1; then
  # Use gsutil to set metadata headers during upload
  if gsutil -m cp -n -r \
      -h "Cache-Control:public, max-age=31536000, immutable" \
      -h "Content-Type:application/x-protobuf" \
      -h "Content-Encoding:gzip" \
      "$ZXY_OUT_DIR"/* "gs://$BUCKET_NAME/$TILES_PREFIX/"; then
    echo "✅ Static tiles uploaded with metadata (gsutil, no-clobber)"
  else
    echo "❌ Failed to upload static tiles via gsutil"
    exit 1
  fi
else
  echo "⚠️  gsutil not found; falling back to gcloud storage cp (metadata may be defaulted)"
  if gcloud storage cp -r "$ZXY_OUT_DIR/" "gs://$BUCKET_NAME/$TILES_PREFIX/"; then
    echo "✅ Static tiles uploaded (gcloud)"
  else
    echo "❌ Failed to upload static tiles"
    exit 1
  fi
fi

# Set public read permissions with error handling (covers both MBTiles and static tiles)
echo "🔓 Setting public read permissions..."
# Note: gcloud storage doesn't have direct ACL commands, using gsutil for this specific task
if command -v gsutil &> /dev/null && gsutil -m acl ch -r -u AllUsers:R "gs://$BUCKET_NAME/*" 2>/dev/null; then
    echo "✅ Permissions set successfully"
else
    echo "⚠️  Warning: Could not set public permissions (gsutil unavailable or failed)."
    echo "💡 Files should still be accessible via authenticated requests"
    echo "🔧 To set public access manually: gcloud storage objects update gs://$BUCKET_NAME/* --add-acl-grant=entity=AllUsers,role=READER"
fi

# Probe a sample static tile over public HTTP to ensure availability
echo ""
echo "🔎 Probing a sample static tile..."
SAMPLE_FILE=$(find "$ZXY_OUT_DIR" -type f -name "*.pbf" | head -n 1 || true)
if [ -z "$SAMPLE_FILE" ]; then
    echo "❌ No .pbf files found locally after export; cannot probe"
    exit 1
fi
REL_PATH="${SAMPLE_FILE#"$ZXY_OUT_DIR/"}"
SAMPLE_URL="https://storage.googleapis.com/$BUCKET_NAME/$TILES_PREFIX/$REL_PATH"
echo "🔗 $SAMPLE_URL"
HEADERS=$(curl -sI -H "Accept-Encoding: identity" "$SAMPLE_URL" || true)
echo "$HEADERS"
if echo "$HEADERS" | grep -q "200 OK"; then
    if echo "$HEADERS" | grep -qiE "content-type: (application/x-protobuf|application/octet-stream)"; then
        echo "✅ Sample tile accessible with valid content-type"
    else
        echo "⚠️  Sample tile missing expected content-type header"
    fi
else
    echo "❌ Sample tile not accessible (HTTP not 200)"
    exit 1
fi

# Final summary
echo ""
echo "🎉 Data upload completed successfully!"
echo "📦 Exported and uploaded static tiles from $FILE_COUNT MBTiles (local size: $TOTAL_SIZE)"
echo "🗂️  Synced static tiles to gs://$BUCKET_NAME/$TILES_PREFIX/"
echo "🌐 Base URL: https://storage.googleapis.com/$BUCKET_NAME/$TILES_PREFIX/"
echo "🔗 View in console: https://console.cloud.google.com/storage/browser/$BUCKET_NAME"