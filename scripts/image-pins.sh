#!/usr/bin/env bash
# Pin and roll back the budgie images. Watchtower on budgie runs whatever `<image>:latest` points at, so
# a rollback is just moving `:latest` back to a digest that was known good: Watchtower sees the change
# within ~5 minutes and recreates the container. `:good` is the last digest that passed the quick smoke
# after it went live (.github/workflows/deploy-budgie.yml). Every command is safe to run twice.
#   scripts/image-pins.sh pin <image>               print the digest to roll back to (:good, else :latest); empty if none
#   scripts/image-pins.sh promote <image> <tag>     mark <image>:<tag> as :good
#   scripts/image-pins.sh rollback <image>=<digest> [...]
#                                                   point :latest at each digest. DRY_RUN=1 only checks and prints.
# <image> is e.g. ghcr.io/willhs/footsteps-web (needs `docker login` to push; any registry works, which the drill uses).
set -euo pipefail

# Top-level digest of a tag or digest ref. Parsed from the plain output: --format is missing in older buildx.
digest_of() { local out; out=$(docker buildx imagetools inspect "$1" 2>/dev/null) || return 1; awk '/^Digest:/ {print $2; found=1; exit} END {exit !found}' <<<"$out"; }
# True when <ref> is that digest, or an index that lists it (imagetools wraps a single manifest in an index).
points_at() { local out; out=$(docker buildx imagetools inspect "$1" 2>/dev/null) || return 1; grep -q "$2" <<<"$out"; }

case "${1:-}" in
  pin)
    image="${2:?usage: image-pins.sh pin <image>}"
    digest_of "$image:good" || digest_of "$image:latest" || true
    ;;
  promote)
    image="${2:?usage: image-pins.sh promote <image> <tag>}"; tag="${3:?usage: image-pins.sh promote <image> <tag>}"
    docker buildx imagetools create -t "$image:good" "$image:$tag"
    echo "$image:good -> $(digest_of "$image:good")"
    ;;
  rollback)
    shift
    [[ $# -gt 0 ]] || { echo "usage: image-pins.sh rollback <image>=<digest> [...]" >&2; exit 2; }
    # Check every digest before moving any tag, so a bad pin never leaves one image rolled back and one not.
    for pair in "$@"; do
      image="${pair%%=*}"; digest="${pair#*=}"
      [[ "$pair" == *=sha256:* ]] || { echo "FAIL $pair: no pinned digest (first deploy, or no :good/:latest before this one)" >&2; exit 1; }
      digest_of "$image@$digest" >/dev/null || { echo "FAIL $image@$digest does not exist in the registry" >&2; exit 1; }
    done
    for pair in "$@"; do
      image="${pair%%=*}"; digest="${pair#*=}"
      if points_at "$image:latest" "$digest"; then echo "ok   $image:latest already at $digest"; continue; fi
      if [[ "${DRY_RUN:-0}" == 1 ]]; then echo "dry  would point $image:latest at $digest"; continue; fi
      docker buildx imagetools create -t "$image:latest" "$image@$digest"
      points_at "$image:latest" "$digest" || { echo "FAIL $image:latest did not move to $digest" >&2; exit 1; }
      echo "ok   $image:latest -> $digest"
    done
    ;;
  *)
    sed -n '2,11p' "$0" >&2; exit 2
    ;;
esac
