#!/usr/bin/env bash
# Exercise the production Caddyfile with disposable files, without the API or real data.
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
fixture=$(mktemp -d)
container=""
cleanup() {
  if [[ -n "$container" ]]; then docker rm -f "$container" >/dev/null; fi
  rm -rf "$fixture"
}
trap cleanup EXIT
mkdir -p "$fixture/app" "$fixture/pmtiles"
printf '0123456789' > "$fixture/pmtiles/existing.pmtiles"
for path in grid terrain habitat ground water; do
  mkdir -p "$fixture/app/$path"
  printf 'image fixture' > "$fixture/app/$path/existing.png"
done
container=$(docker create -p 127.0.0.1::80 caddy:2.8-alpine)
docker cp "$repo/deploy/budgie/Caddyfile" "$container:/etc/caddy/Caddyfile" >/dev/null
docker cp "$fixture/app" "$container:/srv/app" >/dev/null
docker cp "$fixture/pmtiles" "$container:/srv/pmtiles" >/dev/null
docker start "$container" >/dev/null
docker exec "$container" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
port=$(docker port "$container" 80/tcp | sed 's/.*://')
base="http://127.0.0.1:$port"
curl --silent --show-error --retry 10 --retry-connrefused --retry-delay 1 "$base/healthz" >/dev/null
check() {
  local path=$1 status=$2 policy=$3
  shift 3
  curl --silent --show-error --head "$@" "$base/$path" > "$fixture/headers"
  cat "$fixture/headers"
  tr -d '\r' < "$fixture/headers" > "$fixture/normalized"
  grep -q "^HTTP/1.1 $status " "$fixture/normalized"
  grep -Fxiq "Cache-Control: $policy" "$fixture/normalized"
}
long='public, max-age=86400, stale-while-revalidate=604800'
for path in grid terrain habitat ground water; do
  check "$path/missing.png" 404 no-store
  check "$path/existing.png" 200 "$long"
done
check pmtiles/missing.pmtiles 404 no-store
check pmtiles/existing.pmtiles 200 "$long"
check pmtiles/existing.pmtiles 206 "$long" --header 'Range: bytes=0-3'
# The same URL must become cacheable immediately after a previously absent file is published.
docker cp "$fixture/app/terrain/existing.png" "$container:/srv/app/terrain/missing.png" >/dev/null
check terrain/missing.png 200 "$long"
echo 'PASS: missing assets are no-store; existing and newly published assets retain long caching; ranges work.'
