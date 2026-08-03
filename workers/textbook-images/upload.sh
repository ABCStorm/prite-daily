#!/usr/bin/env bash
# ⚠️ SUPERSEDED 2026-08-03 — DOES NOT RUN AS-IS.
#
# This uploaded the old PER-QUESTION image set (`2014-2_11.3_p3321.png`) from
# reference/screenshots_SHIP/. Images are now keyed per PDF page (`ks-03321.png`)
# so the reader can page through neighbours, and that directory has been deleted
# (3 GB of derived renders, all reproducible from reference/kaplan-sadock-10e.pdf).
#
# Use instead:
#   .claude/skills/kaplan-sadock-citations/scripts/render_and_upload_pages.py
# which renders and uploads in one resumable pass without staging GBs on disk.
#
# Kept only for the R2 auth/retry notes below, which still apply.
#
# Upload the K&S page screenshots to the PRIVATE R2 bucket.
#
# Prereq: wrangler must be authed WITH R2 scope. The default `wrangler login`
# token in this repo did NOT include r2 — re-run `npx wrangler@3 login` and make
# sure R2 is in the granted scopes, or use an R2 API token.
#
# Safe to re-run: `r2 object put` overwrites, and the loop skips nothing, so an
# interrupted upload just needs another pass.

set -euo pipefail
BUCKET="textbook-excerpts"
# Full-colour 150 DPI renders (~614 MB = 6% of R2's 10 GB free tier).
# The grayscale/hybrid set in ../../reference/screenshots_R2 (223 MB) is kept
# as a fallback if bandwidth or load time ever becomes a concern.
DIR="$(cd "$(dirname "$0")/../../reference/screenshots_SHIP" && pwd)"

total=$(ls "$DIR" | wc -l | tr -d ' ')
echo "uploading $total images from $DIR -> r2://$BUCKET (private)"

# Cloudflare's R2 API intermittently returns a bare 521 on object put. It is
# transient — an immediate retry succeeds. Without this, a 1,800-object run
# will drop files silently.
put_with_retry() {
  local key="$1" file="$2" n=0
  until npx wrangler@3 r2 object put "$key" --file "$file" --content-type image/png >/dev/null 2>&1; do
    n=$((n+1))
    if [ "$n" -ge 4 ]; then echo "  FAILED after $n attempts: $key" >&2; return 1; fi
    sleep $((n*2))
  done
  return 0
}

# Each `npx wrangler` spawn costs ~2s, so serial upload of ~1,800 objects takes
# about an hour. Run them in parallel instead (~10 min). PARALLEL=1 to serialise.
export BUCKET
export -f put_with_retry 2>/dev/null || true
PARALLEL="${PARALLEL:-6}"

# Run from inside the image dir and pass bare filenames — passing absolute paths
# through xargs -I{} blew the command-length limit ("cannot be assembled, too long").
PUT="$(cd "$(dirname "$0")" && pwd)/put_one.sh"
cd "$DIR"
ls *.png | xargs -P "$PARALLEL" -I{} "$PUT" "$BUCKET" {}
echo "upload pass complete — verify with: npx wrangler@3 r2 object get ... or the count check below"
echo
echo "NOTE: do NOT enable the r2.dev public URL for this bucket."
echo "These are copyrighted textbook pages; access goes through the"
echo "textbook-images Worker, which requires a valid Supabase session."
