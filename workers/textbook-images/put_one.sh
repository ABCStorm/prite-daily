#!/usr/bin/env bash
# Upload one object to R2, retrying the transient bare-521 the API throws.
# Split out of upload.sh because macOS `xargs -I` caps the replacement command
# at 255 bytes, so the retry loop cannot live inline.
# usage: put_one.sh <bucket> <filename>   (cwd must be the image directory)
bucket="$1"; name="$2"; n=0
until npx wrangler@3 r2 object put "$bucket/$name" --file "$name" --content-type image/png >/dev/null 2>&1; do
  n=$((n+1))
  if [ "$n" -ge 4 ]; then echo "FAILED: $name" >&2; exit 1; fi
  sleep $((n*2))
done
