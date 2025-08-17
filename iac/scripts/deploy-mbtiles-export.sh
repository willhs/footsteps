#!/usr/bin/env bash
set -euo pipefail

# Build and deploy Cloud Run Job: mbtiles-export
# - Builds image from mbtiles-export/
# - Deploys/updates Cloud Run Job with env vars and resources
#
# Usage:
#   PROJECT=footsteps-earth REGION=us-central1 BUCKET=footsteps-earth-tiles \
#     ./deploy-mbtiles-export.sh
#
# Env vars:
#   PROJECT         GCP project id (default: footsteps-earth)
#   REGION          Region (default: us-central1)
#   IMAGE_NAME      Artifact name (default: mbtiles-export)
#   BUCKET          Tiles bucket (default: footsteps-earth-tiles)
#   SRC_PREFIX      Source prefix for mbtiles (default: tiles/mbtiles/)
#   OUT_PREFIX      Destination base prefix (default: tiles/humans)
#   CONCURRENCY     Upload concurrency (default: 8)
#   OVERWRITE       true|false (default: false)
#   SERVICE_ACCOUNT Service account email for the job (default: terraform app SA)

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
JOB_NAME=${JOB_NAME:-mbtiles-export}
PROJECT=${PROJECT:-footsteps-earth}
REGION=${REGION:-us-central1}
IMAGE_NAME=${IMAGE_NAME:-mbtiles-export}
IMAGE="gcr.io/$PROJECT/$IMAGE_NAME:latest"
BUCKET=${BUCKET:-footsteps-earth-tiles}
SRC_PREFIX=${SRC_PREFIX:-tiles/mbtiles/}
OUT_PREFIX=${OUT_PREFIX:-tiles/humans}
CONCURRENCY=${CONCURRENCY:-8}
OVERWRITE=${OVERWRITE:-false}

# Try to infer the app service account from terraform output if not provided
SERVICE_ACCOUNT=${SERVICE_ACCOUNT:-}
if [[ -z "$SERVICE_ACCOUNT" ]]; then
  if command -v terraform >/dev/null 2>&1 && [[ -f "$REPO_ROOT/iac/terraform.tfstate" ]]; then
    # best-effort extraction
    SERVICE_ACCOUNT=$(grep -o '"footsteps-app-service-account@[^"]*' "$REPO_ROOT/iac/terraform.tfstate" | head -n1 | sed 's/"//g') || true
  fi
fi

pushd "$REPO_ROOT/mbtiles-export" >/dev/null

echo "🧱 Building image: $IMAGE"
gcloud builds submit --tag "$IMAGE"

echo "🚀 Deploying Cloud Run Job: $JOB_NAME in $REGION"
EXTRA_SA=()
if [[ -n "$SERVICE_ACCOUNT" ]]; then
  EXTRA_SA=("--service-account" "$SERVICE_ACCOUNT")
fi

gcloud run jobs deploy "$JOB_NAME" \
  --image "$IMAGE" \
  --region "$REGION" \
  "${EXTRA_SA[@]}" \
  --max-retries=3 \
  --task-timeout=3600s \
  --memory=2Gi \
  --cpu=2 \
  --set-env-vars SRC_BUCKET="$BUCKET",SRC_PREFIX="$SRC_PREFIX",DST_BUCKET="$BUCKET",OUT_PREFIX="$OUT_PREFIX",CONCURRENCY="$CONCURRENCY",OVERWRITE="$OVERWRITE"

popd >/dev/null

echo "✅ Deployed job $JOB_NAME"
