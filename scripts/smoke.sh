#!/usr/bin/env bash
# Smoke-check a deployed Footsteps: the app loads and every year's PMTiles
# archive really is PMTiles. Checks magic bytes, not status codes: a missing
# object once came back as HTTP 206 with an XML error body, which passed.
#   scripts/smoke.sh [base-url]
set -euo pipefail
BASE="${1:-https://footsteps.willhs.me}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
YEARS=$(grep -oE -- '-?[0-9]+' <(sed -n '/TARGET_YEARS = \[/,/\];/p' "$ROOT/footsteps-web/lib/constants.ts" | grep -v '//'))

curl -fsS "$BASE/" | grep -q '<html' || { echo "FAIL app: $BASE/ is not HTML"; exit 1; }
echo "ok   app"

fail=0
for y in $YEARS; do
  magic=$(curl -sS -r 0-6 -H 'Accept-Encoding: identity' "$BASE/pmtiles/humans_${y}.pmtiles" | head -c 7)
  if [[ "$magic" == "PMTiles" ]]; then echo "ok   $y"; else echo "FAIL $y (got: ${magic:-nothing})"; fail=1; fi
done
exit $fail
