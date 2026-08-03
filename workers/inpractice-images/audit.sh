#!/usr/bin/env bash
# Which illustrations are actually IN the bucket?
#
# wrangler v3 has no `r2 object list`, so the only way to enumerate is to ask the
# Worker for each key. 5,096 parallel HEADs takes ~1 min and is authoritative --
# do NOT infer coverage from the uploader's stdout, which interleaves under
# `xargs -P` and gets truncated by any `tail` you pipe it through.
#
# usage: audit.sh [image-dir] > missing.txt
set -uo pipefail
BASE="${BASE:-https://inpractice-images.correllsoftware.workers.dev}"
DIR="${1:-$(cd "$(dirname "$0")/../../enrichment/illustrations/images/raw-mini-med" && pwd)}"
PARALLEL="${PARALLEL:-40}"

check() {
  code=$(curl -s -o /dev/null -m 20 -w '%{http_code}' -X HEAD "$BASE/i/$1")
  [ "$code" = "200" ] || echo "$1"
}
export -f check
export BASE

cd "$DIR"
ls *.webp | xargs -P "$PARALLEL" -I{} bash -c 'check "$@"' _ {}
