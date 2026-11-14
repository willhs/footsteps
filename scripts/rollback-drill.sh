#!/usr/bin/env bash
# Rehearse the rollback without touching prod: run scripts/image-pins.sh against a throwaway local registry
# with a "good" and a "bad" image, then check that :latest ends up on the good one. Needs Docker; no network
# beyond pulling registry:2 once.
#   scripts/rollback-drill.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PINS="$ROOT/scripts/image-pins.sh"
PORT=$((5500 + RANDOM % 400))
IMAGE="localhost:$PORT/footsteps-web"
REG="footsteps-rollback-drill-$$"
WORK="$(mktemp -d)"
cleanup() { docker rm -f "$REG" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

docker run -d --rm --name "$REG" -p "127.0.0.1:$PORT:5000" registry:2 >/dev/null
for _ in $(seq 1 30); do curl -fsS "http://localhost:$PORT/v2/" >/dev/null 2>&1 && break; sleep 1; done

build() { # build <version-text> <tag>
  echo "$1" > "$WORK/version.txt"
  printf 'FROM scratch\nCOPY version.txt /version.txt\n' > "$WORK/Dockerfile"
  docker build -q -t "$IMAGE:$2" "$WORK" >/dev/null
  docker push -q "$IMAGE:$2" >/dev/null
}
digest() { docker buildx imagetools inspect "$IMAGE:$1" | awk '/^Digest:/ {print $2; exit}'; }
check() { # check <what> <actual> <expected>
  if [[ "$2" == "$3" ]]; then echo "ok   $1"; else echo "FAIL $1 (got $2, want $3)"; exit 1; fi
}

# 1. First deploy: nothing is pinned yet, so there is nothing to roll back to.
build good-sha good-sha
docker buildx imagetools create -t "$IMAGE:latest" "$IMAGE:good-sha" >/dev/null
check "pin falls back to :latest before any :good" "$("$PINS" pin "$IMAGE")" "$(digest latest)"
check "pin is empty for an image that was never pushed" "$("$PINS" pin "localhost:$PORT/never-pushed")" ""
if "$PINS" rollback "$IMAGE=" 2>/dev/null; then echo "FAIL rollback accepted an empty pin"; exit 1; fi
echo "ok   rollback refuses an empty pin"

# 2. The good image passes smoke and is promoted; a bad image then ships as :latest.
"$PINS" promote "$IMAGE" good-sha >/dev/null
good="$(digest good)"
docker buildx imagetools inspect "$IMAGE:good" | grep -q "$(digest good-sha)"
build bad-sha bad-sha
docker buildx imagetools create -t "$IMAGE:latest" "$IMAGE:bad-sha" >/dev/null
bad="$(digest latest)"
[[ "$bad" != "$good" ]] || { echo "FAIL drill images are identical"; exit 1; }
pinned="$("$PINS" pin "$IMAGE")"
check "pin ignores the bad :latest while :good exists" "$pinned" "$good"

# 3. Dry run changes nothing; the real rollback moves :latest; a second run is a no-op.
DRY_RUN=1 "$PINS" rollback "$IMAGE=$pinned" | grep -q '^dry '
check "dry run leaves :latest on the bad image" "$(digest latest)" "$bad"
"$PINS" rollback "$IMAGE=$pinned" >/dev/null
check "rollback puts :latest on the good image" "$(digest latest)" "$good"
"$PINS" rollback "$IMAGE=$pinned" | grep -q 'already at'
check "rollback twice changes nothing" "$(digest latest)" "$good"
docker buildx imagetools inspect "$IMAGE:bad-sha" >/dev/null
echo "ok   the bad image is still reachable by its sha tag"

# 4. A pin that is not in the registry moves nothing, even when another pin is fine.
if "$PINS" rollback "$IMAGE=sha256:$(printf '0%.0s' {1..64})" 2>/dev/null; then echo "FAIL rollback accepted a missing digest"; exit 1; fi
check "a missing digest leaves :latest alone" "$(digest latest)" "$good"
echo "rollback drill passed"
