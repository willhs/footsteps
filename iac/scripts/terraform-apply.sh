#!/usr/bin/env bash
set -euo pipefail

# Two-phase Terraform apply to handle resources that emit DNS records
# only after apply (e.g., google_cloud_run_domain_mapping). This avoids
# plan-time unknown keys in for_each on Cloudflare DNS records.

cd "$(dirname "$0")/.."

echo "→ terraform init (upgrade plugins)"
terraform init -upgrade -no-color

# Optional: clear stale lock if provided
if [[ "${TF_FORCE_UNLOCK_ID:-}" != "" ]]; then
  echo "→ force-unlock state: ${TF_FORCE_UNLOCK_ID}"
  terraform force-unlock -force "$TF_FORCE_UNLOCK_ID" || true
fi

echo "→ phase 1: apply domain mapping (to materialize DNS records)"
terraform apply -no-color -auto-approve -target=google_cloud_run_domain_mapping.app_domain || true

echo "→ phase 2: apply full stack"
terraform apply -no-color -auto-approve

echo "✓ terraform apply complete"
