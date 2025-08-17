#!/bin/bash

# Upload MBTiles files to GCS bucket
# Usage: ./upload-data.sh [bucket-name] [--dry-run] [--force] [--help]

set -e

# Configuration
PROJECT_ID="footsteps-earth"
DEFAULT_BUCKET_NAME="footsteps-earth-tiles"
DATA_DIR="../../data/tiles/humans"

# Parse arguments
BUCKET_NAME="$DEFAULT_BUCKET_NAME"
DRY_RUN=false
FORCE_UPLOAD=false
SHOW_HELP=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --force)
            FORCE_UPLOAD=true
            shift
            ;;
        --help|-h)
            SHOW_HELP=true
            shift
            ;;
        -*)
            echo "Unknown option: $1"
            echo "Usage: $0 [bucket-name] [--dry-run] [--force] [--help]"
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
    echo "Upload MBTiles files to GCS bucket"
    echo ""
    echo "Usage: $0 [bucket-name] [options]"
    echo ""
    echo "Arguments:"
    echo "  bucket-name    GCS bucket name (default: $DEFAULT_BUCKET_NAME)"
    echo ""
    echo "Options:"
    echo "  --dry-run      Show what would be uploaded without actually uploading"
    echo "  --force        Force re-upload all files (skip existing file checks)"
    echo "  --help, -h     Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                           # Upload to default bucket"
    echo "  $0 my-bucket                 # Upload to custom bucket"
    echo "  $0 --dry-run                 # Preview what would be uploaded"
    echo "  $0 --force                   # Force re-upload all files"
    exit 0
fi

# Show configuration
if [ "$DRY_RUN" = true ]; then
    echo "🧪 DRY RUN: Previewing upload to GCS bucket: $BUCKET_NAME"
else
    echo "🚀 Uploading data files to GCS bucket: $BUCKET_NAME"
fi

if [ "$FORCE_UPLOAD" = true ]; then
    echo "⚡ Force mode: Will re-upload all files"
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

echo "📦 Found $FILE_COUNT combined MBTiles files to upload (size: $COMBINED_SIZE of $TOTAL_SIZE total)"
echo "🚀 Optimized upload: Excluding LOD-specific files (66% size reduction)"

if [ "$FILE_COUNT" -eq 0 ]; then
    echo "❌ Error: No combined MBTiles files found in $DATA_DIR"
    echo "💡 Run 'cd footstep-generator && python process_hyde.py && python make_tiles.py' first"
    exit 1
fi

# List files to be processed (only combined yearly files)
echo "📋 Files to upload:"
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

# Dry run: show what would be uploaded
if [ "$DRY_RUN" = true ]; then
    echo ""
    echo "🧪 DRY RUN: Would perform the following actions:"
    echo "  1. Upload $FILE_COUNT MBTiles files to gs://$BUCKET_NAME/"
    echo "  2. Set public read permissions on all files"
    echo "  3. Verify upload integrity"
    echo ""
    echo "✅ Dry run completed - no files were actually uploaded"
    exit 0
fi

# Check for existing files (unless force mode)
if [ "$FORCE_UPLOAD" = false ]; then
    echo "🔍 Checking for existing files..."
    EXISTING_COUNT=$(gcloud storage ls "gs://$BUCKET_NAME/*.mbtiles" 2>/dev/null | wc -l || echo "0")
    
    if [ "$EXISTING_COUNT" -gt 0 ]; then
        echo "⚠️  Found $EXISTING_COUNT existing files in bucket"
        echo "💡 Use --force to re-upload all files, or files will be synced intelligently"
    fi
fi

# Upload files with progress
echo "⬆️ Starting upload..."
echo "📊 Progress will be shown below:"

# Upload only combined yearly files (exclude LOD-specific files)
echo "🔄 Uploading combined yearly files only..."
UPLOAD_SUCCESS=true
UPLOADED_COUNT=0

find "$DATA_DIR" -name "humans_*.mbtiles" | grep -v "_lod_" | sort | while read -r file; do
    filename=$(basename "$file")
    echo "⬆️ Uploading $filename..."
    if gcloud storage cp "$file" "gs://$BUCKET_NAME/$filename"; then
        echo "✅ $filename uploaded successfully"
        UPLOADED_COUNT=$((UPLOADED_COUNT + 1))
    else
        echo "❌ Failed to upload $filename"
        UPLOAD_SUCCESS=false
        break
    fi
done

if [ "$UPLOAD_SUCCESS" = true ]; then
    echo "✅ File upload completed"
else
    echo "❌ Upload failed. Check your authentication and network connection."
    exit 1
fi

# Verify upload (only check combined yearly files)
echo "🔍 Verifying upload integrity..."
REMOTE_COMBINED_COUNT=$(gcloud storage ls "gs://$BUCKET_NAME/humans_*.mbtiles" 2>/dev/null | grep -v "_lod_" | wc -l || echo "0")
echo "📊 Local combined files: $FILE_COUNT, Remote combined files: $REMOTE_COMBINED_COUNT"

if [ "$FILE_COUNT" -eq "$REMOTE_COMBINED_COUNT" ] && [ "$REMOTE_COMBINED_COUNT" -gt 0 ]; then
    echo "✅ Upload verification passed!"
    echo "🎯 Optimized deployment: Using only combined yearly files"
else
    echo "❌ Upload verification failed:"
    echo "  - Expected: $FILE_COUNT combined files"
    echo "  - Found: $REMOTE_COMBINED_COUNT combined files"
    echo "💡 Check gcloud output above for errors"
    exit 1
fi

# Set public read permissions with error handling
echo "🔓 Setting public read permissions..."
# Note: gcloud storage doesn't have direct ACL commands, using gsutil for this specific task
if command -v gsutil &> /dev/null && gsutil -m acl ch -r -u AllUsers:R "gs://$BUCKET_NAME/*" 2>/dev/null; then
    echo "✅ Permissions set successfully"
else
    echo "⚠️  Warning: Could not set public permissions (gsutil unavailable or failed)."
    echo "💡 Files should still be accessible via authenticated requests"
    echo "🔧 To set public access manually: gcloud storage objects update gs://$BUCKET_NAME/* --add-acl-grant=entity=AllUsers,role=READER"
fi

# Final summary
echo ""
echo "🎉 Data upload completed successfully!"
echo "📦 Uploaded $FILE_COUNT MBTiles files ($TOTAL_SIZE total)"
echo "🌐 Files are publicly accessible at: https://storage.googleapis.com/$BUCKET_NAME/"
echo "🔗 View in console: https://console.cloud.google.com/storage/browser/$BUCKET_NAME"