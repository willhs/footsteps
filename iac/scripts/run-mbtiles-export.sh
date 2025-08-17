#!/usr/bin/env bash
set -euo pipefail

# Execute the Cloud Run Job: mbtiles-export
# Optionally update env var YEARS before execution to restrict processing.
#
# Usage:
#   REGION=us-central1 ./run-mbtiles-export.sh            # run with existing env
#   YEARS="-1000" ./run-mbtiles-export.sh                # update YEARS, run
#   YEARS="-1000,0,100" ./run-mbtiles-export.sh         # multiple years
#
JOB_NAME=${JOB_NAME:-mbtiles-export}
REGION=${REGION:-us-central1}

if [[ -n "${YEARS:-}" ]]; then
  echo "🛠️  Updating job env YEARS=$YEARS"
  gcloud run jobs update "$JOB_NAME" \
    --region "$REGION" \
    --set-env-vars YEARS="$YEARS"
fi

echo "▶️  Executing job $JOB_NAME in $REGION"
gcloud run jobs execute "$JOB_NAME" --region "$REGION" --wait

echo "✅ Job finished"
