#!/usr/bin/env bash
# Smoke-check a deployed Footsteps: the app loads and every year's PMTiles
# archive really is PMTiles. Checks magic bytes, not status codes: a missing
# object once came back as HTTP 206 with an XML error body, which passed.
#   scripts/smoke.sh [base-url]
set -euo pipefail
BASE="${1:-https://footsteps.willhs.me}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
years_of() { sed -n "/$1 = \\[/,/\\];/p" "$ROOT/footsteps-web/lib/constants.ts" | grep -v '//' | grep -oE -- '-?[0-9]+'; }
DOT_YEARS=$(years_of DOT_TILE_YEARS)
YEARS=$(years_of TARGET_YEARS)

curl -fsS "$BASE/" | grep -q '<html' || { echo "FAIL app: $BASE/ is not HTML"; exit 1; }
echo "ok   app"

fail=0
for y in $DOT_YEARS; do
  magic=$(curl -sS -r 0-6 -H 'Accept-Encoding: identity' "$BASE/pmtiles/humans_${y}.pmtiles" | head -c 7)
  if [[ "$magic" == "PMTiles" ]]; then echo "ok   $y"; else echo "FAIL $y (got: ${magic:-nothing})"; fail=1; fi
done
for y in $YEARS; do
  magic=$(curl -sS -r 0-3 "$BASE/grid/humans_${y}.png" | head -c 4 | tail -c 3)
  if [[ "$magic" == "PNG" ]]; then echo "ok   grid $y"; else echo "FAIL grid $y"; fail=1; fi
done
exit $fail
