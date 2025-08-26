#!/bin/bash

# Upload MBTiles directly to GCS for tile serving
# Usage: ./upload-data.sh [bucket-name] [--dry-run] [--help]

set -e

# Configuration
PROJECT_ID="footsteps-earth"
DEFAULT_BUCKET_NAME="footsteps-earth-tiles"
DATA_DIR="../../data/tiles/humans"
# GCS prefix for MBTiles - upload to root for direct API access
TILES_PREFIX=""

# Parse arguments
BUCKET_NAME="$DEFAULT_BUCKET_NAME"
DRY_RUN=false
SHOW_HELP=false
# Defaults: overwrite remote is enabled
OVERWRITE_REMOTE=true

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
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
    echo "Upload MBTiles directly to GCS for tile serving"
    echo ""
    echo "Usage: $0 [bucket-name] [options]"
    echo ""
    echo "Arguments:"
    echo "  bucket-name    GCS bucket name (default: $DEFAULT_BUCKET_NAME)"
    echo ""
    echo "Options:"
    echo "  --dry-run              Show what would be done without actually uploading"
    echo "  --overwrite-remote     Overwrite existing objects on GCS (default: on)"
    echo "  --no-overwrite-remote  Do not overwrite GCS objects (no-clobber)"
    echo "  --help, -h             Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                           # Upload MBTiles to default bucket"
    echo "  $0 my-bucket                 # Upload MBTiles to custom bucket"
    echo "  $0 --dry-run                 # Preview steps only"
    echo ""
    echo "Behavior:"
    echo "  - Uploads each combined MBTiles to gs://$DEFAULT_BUCKET_NAME/humans_{year}.mbtiles"
    echo "  - Default upload overwrites existing objects. Use --no-overwrite-remote for no-clobber."
    echo "  - Sets appropriate Content-Type for MBTiles files"
    exit 0
fi

# Show configuration
if [ "$DRY_RUN" = true ]; then
    echo "🧪 DRY RUN: Previewing MBTiles upload to: gs://$BUCKET_NAME/"
else
    echo "🚀 Uploading MBTiles to: gs://$BUCKET_NAME/"
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
echo "🔢 Scanning for combined MBTiles (excluding LOD-specific)..."
FILE_COUNT=$(find "$DATA_DIR" -maxdepth 1 -name "humans_*.mbtiles" | grep -v "_lod_" | wc -l)
echo "🧮 Computing combined MBTiles size..."
COMBINED_SIZE=$(find "$DATA_DIR" -maxdepth 1 -name "humans_*.mbtiles" | grep -v "_lod_" | xargs du -ch 2>/dev/null | tail -1 | cut -f1 || echo "unknown")
echo "📦 Found $FILE_COUNT combined MBTiles files to upload (total size: $COMBINED_SIZE)"
echo "🚀 Optimized upload: Excluding LOD-specific files (server uses combined files only)"

if [ "$FILE_COUNT" -eq 0 ]; then
    echo "❌ Error: No combined MBTiles files found in $DATA_DIR"
    echo "💡 Run 'cd footstep-generator && python process_hyde.py && python make_tiles.py' first"
    exit 1
fi

# List files to be processed (only combined yearly files)
echo "📋 MBTiles to upload:"
find "$DATA_DIR" -maxdepth 1 -name "humans_*.mbtiles" | grep -v "_lod_" | sort | while read -r file; do
    filename=$(basename "$file")
    filesize=$(du -sh "$file" 2>/dev/null | cut -f1 || echo "?")
    echo "  ✅ $filename ($filesize)"
done

# Show excluded files for transparency
LOD_COUNT=$(find "$DATA_DIR" -maxdepth 1 -name "humans_*_lod_*.mbtiles" | wc -l)
if [ "$LOD_COUNT" -gt 0 ]; then
    echo ""
    echo "⏭️ Excluding $LOD_COUNT LOD-specific files (server uses combined files only):"
    find "$DATA_DIR" -maxdepth 1 -name "humans_*_lod_*.mbtiles" | sort | head -5 | while read -r file; do
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
    echo "  1. Upload humans_{year}.mbtiles to gs://$BUCKET_NAME/"
    echo "  2. Set appropriate Content-Type for MBTiles files"
    echo "  3. Test accessibility via GCS public URL"
    echo ""
    echo "✅ Dry run completed - no files were actually uploaded"
    exit 0
fi

# Upload MBTiles directly to GCS
echo ""
echo "🧱 Uploading MBTiles directly to GCS..."

UPLOADED_COUNT=0
shopt -s nullglob
for file in "$DATA_DIR"/humans_*.mbtiles; do
    # Skip LOD-specific files
    [[ "$file" == *_lod_* ]] && continue
    filename=$(basename "$file")
    year=$(echo "$filename" | sed -E 's/^humans_(-?[0-9]+)\.mbtiles$/\1/')
    if ! [[ "$year" =~ ^-?[0-9]+$ ]]; then
        echo "❌ Could not parse year from $file"
        exit 1
    fi
    
    echo "⬆️  Uploading $filename to gs://$BUCKET_NAME/"
    NO_CLOBBER_FLAG=""
    if [ "$OVERWRITE_REMOTE" != true ]; then
        NO_CLOBBER_FLAG="--no-clobber"
    fi
    
    if gcloud storage cp $NO_CLOBBER_FLAG \
        --content-type="application/x-sqlite3" \
        "$file" "gs://$BUCKET_NAME/$filename"; then
        echo "✅ Uploaded $filename"
        UPLOADED_COUNT=$((UPLOADED_COUNT + 1))
    else
        echo "❌ Upload failed for $filename"
        exit 1
    fi
    
    # Test accessibility of uploaded file
    SAMPLE_URL="https://storage.googleapis.com/$BUCKET_NAME/$filename"
    echo "🔎 Testing accessibility: $SAMPLE_URL"
    HEADERS=$(curl -sI "$SAMPLE_URL" 2>/dev/null || true)
    if echo "$HEADERS" | head -n 1 | grep -q "200 OK"; then
        echo "✅ MBTiles file accessible"
    else
        echo "⚠️  MBTiles file not accessible yet (may be due to ACL propagation)"
    fi
done
shopt -u nullglob

echo "✅ Upload completed: uploaded $UPLOADED_COUNT MBTiles files"

# Final summary
echo ""
echo "🎉 Data upload completed successfully!"
echo "📦 Uploaded $FILE_COUNT MBTiles files (total size: $COMBINED_SIZE)"
echo "🗂️  MBTiles uploaded to gs://$BUCKET_NAME/"
echo "🌐 Base URL: https://storage.googleapis.com/$BUCKET_NAME/"
echo "🔗 View in console: https://console.cloud.google.com/storage/browser/$BUCKET_NAME"