#!/usr/bin/env bash
# Upload one AnKing/Sketchy media file to R2, retrying transient bare-521.
# usage: put_one.sh <bucket> <filename>   (cwd must be the media directory)
# or:    put_one.sh <filename>            (uses default bucket)
set -euo pipefail
if [ "$#" -eq 1 ]; then
  bucket="anking-sketchy-images"
  name="$1"
elif [ "$#" -eq 2 ]; then
  bucket="$1"
  name="$2"
else
  echo "usage: put_one.sh [bucket] <filename>" >&2
  exit 2
fi
# If name is a path, use basename for the object key but read from path
file="$name"
key="$(basename "$name")"
if [ ! -f "$file" ]; then
  echo "missing: $file" >&2
  exit 1
fi
low="$(printf '%s' "$key" | tr '[:upper:]' '[:lower:]')"
ct="application/octet-stream"
case "$low" in
  *.png) ct="image/png" ;;
  *.jpg|*.jpeg) ct="image/jpeg" ;;
  *.webp) ct="image/webp" ;;
  *.gif) ct="image/gif" ;;
esac
ROOT="$(cd "$(dirname "$0")" && pwd)"
n=0
until npx wrangler@3 r2 object put "$bucket/$key" \
    --file "$file" \
    --content-type "$ct" \
    --config "$ROOT/wrangler.toml" >/dev/null 2>&1; do
  n=$((n+1))
  if [ "$n" -ge 4 ]; then echo "FAILED: $key" >&2; exit 1; fi
  sleep $((n*2))
done
echo "OK $key"
