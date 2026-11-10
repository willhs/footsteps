#!/usr/bin/env bash
# Render deploy/budgie/api.env.tpl from 1Password straight onto budgie and
# restart the API so it picks the key up. The secret never touches this Mac's
# disk and is never printed. Run in your own terminal (1Password approval).
#   scripts/push-api-secrets.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="${REMOTE:-will@budgie}"
DEST="${DEST:-projects/deep-footsteps/deploy/budgie}"
op inject -i "$ROOT/deploy/budgie/api.env.tpl" \
  | ssh "$REMOTE" "umask 077; mkdir -p $DEST && cat > $DEST/api.env"
ssh "$REMOTE" "cd $DEST && docker compose up -d --force-recreate api >/dev/null && sleep 2 && curl -fsS http://127.0.0.1:5090/api/day/health"
echo
