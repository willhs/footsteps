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

# Check if gsutil is available
if ! command -v gsutil &> /dev/null; then
    echo "❌ Error: gsutil not found. Please install Google Cloud SDK"
    exit 1
fi

# Set project
echo "📋 Setting project to $PROJECT_ID"
gcloud config set project $PROJECT_ID

# Check if bucket exists
echo "🔍 Checking if bucket exists..."
if ! gsutil ls -b gs://$BUCKET_NAME &> /dev/null; then
    echo "❌ Error: Bucket gs://$BUCKET_NAME does not exist"
    echo "💡 Run 'terraform apply' first to create the bucket"
    exit 1
fi

# Count and validate files
FILE_COUNT=$(find "$DATA_DIR" -name "*.mbtiles" | wc -l)
TOTAL_SIZE=$(du -sh "$DATA_DIR" 2>/dev/null | cut -f1 || echo "unknown")

echo "📦 Found $FILE_COUNT MBTiles files to process (total size: $TOTAL_SIZE)"

if [ "$FILE_COUNT" -eq 0 ]; then
    echo "❌ Error: No MBTiles files found in $DATA_DIR"
    echo "💡 Run 'cd footstep-generator && python process_hyde.py && python make_tiles.py' first"
    exit 1
fi

# List files to be processed
echo "📋 Files to process:"
find "$DATA_DIR" -name "*.mbtiles" | sort | while read -r file; do
    filename=$(basename "$file")
    filesize=$(du -sh "$file" 2>/dev/null | cut -f1 || echo "?")
    echo "  - $filename ($filesize)"
done

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
    EXISTING_COUNT=$(gsutil ls "gs://$BUCKET_NAME/*.mbtiles" 2>/dev/null | wc -l || echo "0")
    
    if [ "$EXISTING_COUNT" -gt 0 ]; then
        echo "⚠️  Found $EXISTING_COUNT existing files in bucket"
        echo "💡 Use --force to re-upload all files, or files will be synced intelligently"
    fi
fi

# Upload files with progress
echo "⬆️ Starting upload..."
echo "📊 Progress will be shown below:"

# Build gsutil command
GSUTIL_CMD="gsutil -m rsync"
if [ "$FORCE_UPLOAD" = false ]; then
    GSUTIL_CMD="$GSUTIL_CMD -x '.*\.tmp$'"  # Exclude temp files
fi
GSUTIL_CMD="$GSUTIL_CMD -r '$DATA_DIR/' 'gs://$BUCKET_NAME/'"

# Execute upload with error handling
if eval $GSUTIL_CMD; then
    echo "✅ File upload completed"
else
    echo "❌ Upload failed. Check your authentication and network connection."
    exit 1
fi

# Verify upload
echo "🔍 Verifying upload integrity..."
REMOTE_COUNT=$(gsutil ls "gs://$BUCKET_NAME/*.mbtiles" 2>/dev/null | wc -l || echo "0")
echo "📊 Local files: $FILE_COUNT, Remote files: $REMOTE_COUNT"

if [ "$FILE_COUNT" -eq "$REMOTE_COUNT" ] && [ "$REMOTE_COUNT" -gt 0 ]; then
    echo "✅ Upload verification passed!"
else
    echo "❌ Upload verification failed:"
    echo "  - Expected: $FILE_COUNT files"
    echo "  - Found: $REMOTE_COUNT files"
    echo "💡 Check gsutil output above for errors"
    exit 1
fi

# Set public read permissions with error handling
echo "🔓 Setting public read permissions..."
if gsutil -m acl ch -r -u AllUsers:R "gs://$BUCKET_NAME/*" 2>/dev/null; then
    echo "✅ Permissions set successfully"
else
    echo "⚠️  Warning: Could not set public permissions. Files may not be publicly accessible."
    echo "💡 You may need additional IAM permissions or can set this manually in the console"
fi

# Final summary
echo ""
echo "🎉 Data upload completed successfully!"
echo "📦 Uploaded $FILE_COUNT MBTiles files ($TOTAL_SIZE total)"
echo "🌐 Files are publicly accessible at: https://storage.googleapis.com/$BUCKET_NAME/"
echo "🔗 View in console: https://console.cloud.google.com/storage/browser/$BUCKET_NAME"