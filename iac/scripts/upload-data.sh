#!/bin/bash

# Upload MBTiles files to GCS bucket
# Usage: ./upload-data.sh [bucket-name]

set -e

# Configuration
PROJECT_ID="footsteps-earth"
DEFAULT_BUCKET_NAME="footsteps-earth-tiles"
DATA_DIR="../../data/tiles/humans"

# Use provided bucket name or default
BUCKET_NAME="${1:-$DEFAULT_BUCKET_NAME}"

echo "🚀 Uploading data files to GCS bucket: $BUCKET_NAME"

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

# Count files to upload
FILE_COUNT=$(find "$DATA_DIR" -name "*.mbtiles" | wc -l)
echo "📦 Found $FILE_COUNT MBTiles files to upload"

# Upload files with progress
echo "⬆️ Uploading files..."
gsutil -m rsync -r "$DATA_DIR/" "gs://$BUCKET_NAME/"

# Verify upload
echo "✅ Verifying upload..."
REMOTE_COUNT=$(gsutil ls "gs://$BUCKET_NAME/*.mbtiles" | wc -l)
echo "📊 Local files: $FILE_COUNT, Remote files: $REMOTE_COUNT"

if [ "$FILE_COUNT" -eq "$REMOTE_COUNT" ]; then
    echo "🎉 Upload completed successfully!"
    echo "📡 Files are now available at: https://storage.googleapis.com/$BUCKET_NAME/"
else
    echo "⚠️  Warning: File count mismatch. Please check the upload."
fi

# Set public read permissions (if needed)
echo "🔓 Setting public read permissions..."
gsutil -m acl ch -r -u AllUsers:R "gs://$BUCKET_NAME/*"

echo "✨ Data upload complete!"