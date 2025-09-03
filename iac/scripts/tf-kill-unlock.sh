#!/usr/bin/env bash
set -euo pipefail

# Kill stray terraform processes and force-unlock the current GCS backend lock.

here="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$here/.." && pwd)"
cd "$repo_root"

echo "→ Scanning for terraform processes"
pgrep -fl 'terraform|terraform-provider|terraform-apply.sh' || true

echo "→ Killing terraform applies/providers (best-effort)"
pkill -f "terraform apply" || true
pkill -f "terraform-provider-" || true
pkill -f "terraform-apply.sh" || true
sleep 1
pgrep -fl 'terraform|terraform-provider|terraform-apply.sh' || true

echo "→ Resolving GCS backend lock path from iac/versions.tf"
backend_bucket=$(awk '/backend "gcs"/{f=1} f&&/bucket/{gsub(/.*=\s*"|"/ , "", $0); print $0; exit}' versions.tf || true)
backend_prefix=$(awk '/backend "gcs"/{f=1} f&&/prefix/{gsub(/.*=\s*"|"/ , "", $0); print $0; exit}' versions.tf || true)

if [[ -z "${backend_bucket:-}" || -z "${backend_prefix:-}" ]]; then
  echo "✗ Could not parse backend bucket/prefix from versions.tf" >&2
  echo "  Falling back to defaults: bucket=footsteps-earth-terraform-state, prefix=terraform/state" >&2
  backend_bucket="footsteps-earth-terraform-state"
  backend_prefix="terraform/state"
fi

lock_uri="gs://${backend_bucket}/${backend_prefix}/default.tflock"
echo "→ Checking lock: ${lock_uri}"

if ! gsutil stat "$lock_uri" >/dev/null 2>&1; then
  echo "✓ No lock file present"
  exit 0
fi

echo "→ Current lock file contents:"
gsutil cat "$lock_uri" || true

gen=$(gsutil stat "$lock_uri" | awk '/Generation:/ {print $3}' | tail -n1 || true)
if [[ -z "${gen:-}" ]]; then
  echo "✗ Could not determine lock Generation. Aborting unlock." >&2
  exit 1
fi

echo "→ Force-unlocking with Generation: ${gen}"
cd "$repo_root/iac"
terraform force-unlock -force "$gen"
echo "✓ Unlocked"

