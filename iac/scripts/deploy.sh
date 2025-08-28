#!/bin/bash

# Deploy Footsteps of Time to Google Cloud Run
# Usage: ./deploy.sh [--skip-build] [--skip-data]

set -e

# Configuration
PROJECT_ID="footsteps-earth"
SERVICE_NAME="footsteps-time-app"
REGION="us-central1"
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"
APP_DIR="../../footsteps-web"

# Parse arguments
SKIP_BUILD=false
SKIP_DATA=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-data)
            SKIP_DATA=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--skip-build] [--skip-data]"
            exit 1
            ;;
    esac
done

echo "🚀 Deploying Footsteps of Time to Cloud Run"
echo "📋 Project: $PROJECT_ID"
echo "🌍 Region: $REGION"
echo "🏷️  Image: $IMAGE_NAME"

# Check prerequisites
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: gcloud CLI not found. Please install Google Cloud SDK"
    exit 1
fi

if [ ! -d "$APP_DIR" ]; then
    echo "❌ Error: App directory $APP_DIR not found"
    exit 1
fi

# Set project
echo "📋 Setting project to $PROJECT_ID"
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "🔧 Enabling required APIs..."
gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    containerregistry.googleapis.com

# Upload data if not skipping
if [ "$SKIP_DATA" = false ]; then
    echo "📦 Uploading data files..."
    ./upload-data.sh
else
    echo "⏭️  Skipping data upload"
fi

# Build and push container if not skipping
if [ "$SKIP_BUILD" = false ]; then
    echo "🏗️  Building container images..."
    
    # Build main application container
    cd "$APP_DIR"
    gcloud builds submit --tag "$IMAGE_NAME" .
    echo "✅ Main container built and pushed to $IMAGE_NAME"
    cd - > /dev/null
    
    # Cache warmer image removed (deprecated)
else
    echo "⏭️  Skipping container build"
fi

# Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
## Build env vars for the service (runtime only)
# Env vars for runtime
ENV_VARS="NODE_ENV=production,GCP_PROJECT_ID=$PROJECT_ID,GCS_TILES_BUCKET=footsteps-earth-tiles,HUMANS_TILES_DIR=/data/tiles/humans,TILE_CACHE_DIR=/data/tiles/humans"

gcloud run deploy "$SERVICE_NAME" \
    --image "$IMAGE_NAME" \
    --platform managed \
    --region "$REGION" \
    --allow-unauthenticated \
    --set-env-vars="$ENV_VARS" \
    --memory=2Gi \
    --cpu=2 \
    --timeout=300 \
    --max-instances=100 \
    --min-instances=0 \
    --port=8080

# Get service URL
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format="value(status.url)")

echo "🎉 Deployment completed!"
echo "🌐 Service URL: $SERVICE_URL"
echo "📊 Monitor logs: gcloud logs tail /projects/$PROJECT_ID/logs/run.googleapis.com%2Fstdout"
echo "🔧 Manage service: https://console.cloud.google.com/run/detail/$REGION/$SERVICE_NAME/metrics?project=$PROJECT_ID"

# Test the deployment
echo "🧪 Testing deployment..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SERVICE_URL")
if [ "$HTTP_STATUS" = "200" ]; then
    echo "✅ Service is responding correctly!"
else
    echo "⚠️  Service returned HTTP $HTTP_STATUS. Check the logs for issues."
fi

# Cache warming deprecated; tiles served directly from GCS/CDN

echo ""
echo "✨ Deployment complete!"
