#!/bin/bash

# Local data deployment wrapper script
# Handles the complete workflow: process data → upload → optionally redeploy app
# Usage: ./deploy-data-local.sh [options]

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FOOTSTEP_GENERATOR_DIR="$PROJECT_ROOT/footstep-generator"
DATA_DIR="$PROJECT_ROOT/data/tiles/humans"

# Default options
SKIP_PROCESSING=false
SKIP_UPLOAD=false
DRY_RUN=false
FORCE_UPLOAD=false
TRIGGER_DEPLOY=false
BUCKET_NAME="footsteps-earth-tiles"
SHOW_HELP=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-processing)
            SKIP_PROCESSING=true
            shift
            ;;
        --skip-upload)
            SKIP_UPLOAD=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --force)
            FORCE_UPLOAD=true
            shift
            ;;
        --deploy)
            TRIGGER_DEPLOY=true
            shift
            ;;
        --bucket)
            BUCKET_NAME="$2"
            shift 2
            ;;
        --help|-h)
            SHOW_HELP=true
            shift
            ;;
        -*)
            echo "Unknown option: $1"
            echo "Usage: $0 [options]"
            echo "Use --help for more information."
            exit 1
            ;;
        *)
            echo "Unexpected argument: $1"
            echo "Usage: $0 [options]"
            echo "Use --help for more information."
            exit 1
            ;;
    esac
done

# Show help if requested
if [ "$SHOW_HELP" = true ]; then
    cat << EOF
Local Data Deployment Script

This script handles the complete data deployment workflow:
1. Generate/update MBTiles data (optional)
2. Upload to GCS bucket 
3. Optionally trigger app redeployment

Usage: $0 [options]

Options:
  --skip-processing     Skip data generation step (use existing files)
  --skip-upload         Skip upload step (only process data locally)
  --dry-run            Preview upload without actually uploading
  --force              Force re-upload all files (skip existing file checks)
  --deploy             Trigger app redeployment after successful upload
  --bucket NAME        Upload to specific GCS bucket (default: $BUCKET_NAME)
  --help, -h           Show this help message

Examples:
  $0                              # Full workflow: process → upload
  $0 --skip-processing            # Only upload existing files
  $0 --dry-run                    # Preview what would be uploaded
  $0 --force --deploy             # Force re-upload and redeploy app
  $0 --skip-upload                # Only process data locally
  $0 --bucket my-test-bucket      # Upload to custom bucket

Prerequisites:
  - Python environment set up in footstep-generator/
  - gcloud CLI authenticated with appropriate permissions
  - HYDE data downloaded in data/raw/hyde-3.5/

EOF
    exit 0
fi

echo "🚀 Starting local data deployment workflow"
echo "📁 Project root: $PROJECT_ROOT"

# Validate prerequisites
echo "🔍 Checking prerequisites..."

# Check footstep-generator directory
if [ ! -d "$FOOTSTEP_GENERATOR_DIR" ]; then
    echo "❌ Error: footstep-generator directory not found at $FOOTSTEP_GENERATOR_DIR"
    exit 1
fi

# Check Python files exist
if [ ! -f "$FOOTSTEP_GENERATOR_DIR/generate_footstep_tiles.py" ]; then
    echo "❌ Error: Required Python script generate_footstep_tiles.py not found in footstep-generator/"
    exit 1
fi

# Check for raw HYDE data (only if not skipping processing)
if [ "$SKIP_PROCESSING" = false ]; then
    if [ ! -d "$PROJECT_ROOT/data/raw/hyde-3.5" ]; then
        echo "❌ Error: HYDE data not found at data/raw/hyde-3.5/"
        echo "💡 Download HYDE data first or use --skip-processing to use existing tiles"
        exit 1
    fi
fi

# Check gcloud (only if not skipping upload)
if [ "$SKIP_UPLOAD" = false ]; then
    if ! command -v gcloud &> /dev/null; then
        echo "❌ Error: gcloud CLI not found"
        echo "💡 Install Google Cloud SDK or use --skip-upload to only process data locally"
        exit 1
    fi
    
    # Check gcloud authentication
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -n1 > /dev/null; then
        echo "❌ Error: No active gcloud authentication found"
        echo "💡 Run 'gcloud auth login' first"
        exit 1
    fi
fi

# Step 1: Process data (if not skipping)
if [ "$SKIP_PROCESSING" = false ]; then
    echo ""
    echo "📊 Step 1: Processing HYDE data..."
    cd "$FOOTSTEP_GENERATOR_DIR"
    
    echo "🔄 Running generate_footstep_tiles.py (combined HYDE processing + tile generation)..."
    if python generate_footstep_tiles.py --raw-dir ../data/raw/hyde-3.5 --tiles-dir ../data/tiles/humans; then
        echo "✅ Data processing and tile generation completed"
    else
        echo "❌ Data processing and tile generation failed"
        exit 1
    fi
    
    cd "$PROJECT_ROOT"
else
    echo ""
    echo "⏭️ Step 1: Skipping data processing (using existing files)"
fi

# Step 2: Upload to GCS (if not skipping)
if [ "$SKIP_UPLOAD" = false ]; then
    echo ""
    echo "📤 Step 2: Uploading to GCS..."
    cd "$SCRIPT_DIR"
    
    # Build upload command
    UPLOAD_CMD="./upload-data.sh $BUCKET_NAME"
    if [ "$DRY_RUN" = true ]; then
        UPLOAD_CMD="$UPLOAD_CMD --dry-run"
    fi
    if [ "$FORCE_UPLOAD" = true ]; then
        UPLOAD_CMD="$UPLOAD_CMD --force"
    fi
    
    echo "🔄 Running: $UPLOAD_CMD"
    if eval $UPLOAD_CMD; then
        echo "✅ Upload completed successfully"
    else
        echo "❌ Upload failed"
        exit 1
    fi
else
    echo ""
    echo "⏭️ Step 2: Skipping upload (data processed locally only)"
fi

# Step 3: Trigger app deployment (if requested and not dry run)
if [ "$TRIGGER_DEPLOY" = true ] && [ "$DRY_RUN" = false ] && [ "$SKIP_UPLOAD" = false ]; then
    echo ""
    echo "🚀 Step 3: Triggering app redeployment..."
    
    # Check if we're in a git repository
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        echo "❌ Error: Not in a git repository. Cannot trigger GitHub Actions."
        exit 1
    fi
    
    # Get repository info
    REPO_URL=$(git remote get-url origin 2>/dev/null || echo "")
    if [[ $REPO_URL =~ github\.com[:/]([^/]+/[^/]+)(\.git)?$ ]]; then
        REPO="${BASH_REMATCH[1]}"
        echo "🔍 Repository: $REPO"
        
        # Check if gh CLI is available
        if command -v gh &> /dev/null; then
            echo "🔄 Triggering deployment via GitHub CLI..."
            if gh workflow run deploy.yml; then
                echo "✅ App deployment triggered successfully"
                echo "🔗 View progress: https://github.com/$REPO/actions"
            else
                echo "❌ Failed to trigger deployment via GitHub CLI"
                echo "💡 You can manually trigger it at: https://github.com/$REPO/actions/workflows/deploy.yml"
            fi
        else
            echo "💡 GitHub CLI not found. You can manually trigger deployment at:"
            echo "   https://github.com/$REPO/actions/workflows/deploy.yml"
        fi
    else
        echo "💡 Could not determine GitHub repository. You can manually trigger deployment."
    fi
else
    if [ "$TRIGGER_DEPLOY" = true ]; then
        if [ "$DRY_RUN" = true ]; then
            echo ""
            echo "⏭️ Step 3: Skipping app deployment (dry run mode)"
        elif [ "$SKIP_UPLOAD" = true ]; then
            echo ""
            echo "⏭️ Step 3: Skipping app deployment (upload was skipped)"
        fi
    fi
fi

# Final summary
echo ""
echo "🎉 Local data deployment workflow completed!"

if [ "$SKIP_PROCESSING" = false ]; then
    TILE_COUNT=$(find "$DATA_DIR" -name "*.mbtiles" 2>/dev/null | wc -l || echo "?")
    echo "📊 Generated $TILE_COUNT MBTiles files"
fi

if [ "$SKIP_UPLOAD" = false ]; then
    if [ "$DRY_RUN" = true ]; then
        echo "🧪 Dry run completed - no files were actually uploaded"
    else
        echo "📤 Files uploaded to gs://$BUCKET_NAME/"
        echo "🌐 View in console: https://console.cloud.google.com/storage/browser/$BUCKET_NAME"
    fi
fi

if [ "$TRIGGER_DEPLOY" = true ] && [ "$DRY_RUN" = false ] && [ "$SKIP_UPLOAD" = false ]; then
    echo "🚀 App redeployment initiated"
fi

echo ""
echo "✨ All done! Your data deployment workflow is complete."