#!/bin/bash

# Deploy Footsteps of Time to Google Cloud Run
# Usage: ./deploy.sh [--skip-build] [--skip-data]

set -e

# Configuration
PROJECT_ID="footsteps-earth"
SERVICE_NAME="footsteps-time-app"
REGION="us-central1"
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"
APP_DIR="../../humans-globe"

# Parse arguments
SKIP_BUILD=false
SKIP_DATA=false
SKIP_CACHE_WARMING=false

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
        --skip-cache-warming)
            SKIP_CACHE_WARMING=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--skip-build] [--skip-data] [--skip-cache-warming]"
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
    
    # Build cache warming container
    echo "🔥 Building cache warming container..."
    cd "../cache-warmer"
    CACHE_WARMER_IMAGE="$IMAGE_NAME-cache-warmer"
    gcloud builds submit --tag "$CACHE_WARMER_IMAGE" .
    echo "✅ Cache warmer container built and pushed to $CACHE_WARMER_IMAGE"
    cd - > /dev/null
else
    echo "⏭️  Skipping container build"
fi

# Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
    --image "$IMAGE_NAME" \
    --platform managed \
    --region "$REGION" \
    --allow-unauthenticated \
    --set-env-vars="NODE_ENV=production,GCP_PROJECT_ID=$PROJECT_ID,GCS_BUCKET_NAME=footsteps-earth-tiles,HUMANS_TILES_DIR=/data/tiles/humans,TILE_CACHE_DIR=/data/tiles/humans" \
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

# Trigger cache warming if not skipping
if [ "$SKIP_CACHE_WARMING" = false ]; then
    echo ""
    echo "🔥 Starting cache warming process..."
    echo "📦 This will pre-download all tile files (~12GB) to persistent cache"
    echo "⏱️  Expected time: 10-15 minutes"
    
    CACHE_WARMER_JOB="$SERVICE_NAME-cache-warmer"
    
    # Execute the cache warming job
    echo "🚀 Executing cache warming job: $CACHE_WARMER_JOB"
    if gcloud run jobs execute "$CACHE_WARMER_JOB" --region="$REGION" --wait; then
        echo "✅ Cache warming completed successfully!"
        echo "🚀 All tile files are now cached and ready for instant access"
    else
        echo "❌ Cache warming failed. Check the job logs:"
        echo "   gcloud logging read 'resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"$CACHE_WARMER_JOB\"' --limit=50 --format=json"
        echo "⚠️  The application will still work, but first access to new years will be slow"
    fi
else
    echo ""
    echo "⏭️  Skipping cache warming"
    echo "💡 Note: First access to each year will require ~30s download from GCS"
fi

echo ""
echo "✨ Deployment complete!"