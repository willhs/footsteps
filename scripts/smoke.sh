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
  for kind in humans landuse; do
    # Read the whole response: head can cause curl SIGPIPE when Range is ignored.
    magic=$(curl -fsS -r 0-7 -H 'Accept-Encoding: identity' "$BASE/grid/${kind}_${y}.png" | od -An -tx1 | tr -d ' \n') || magic=""
    if [[ "$magic" == 89504e470d0a1a0a* ]]; then echo "ok   grid $kind $y"; else echo "FAIL grid $kind $y"; fail=1; fi
  done
done
exit $fail
