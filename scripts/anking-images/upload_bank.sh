#!/usr/bin/env bash
# Upload questions_all.json as bank/questions.json.gz to Supabase Storage.
# Requires SUPABASE_SERVICE_ROLE_KEY in the environment (Dashboard → API → service_role
# or sb_secret_… under the new keys model).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
URL=$(grep VITE_SUPABASE_URL "$ROOT/.env.local" | cut -d= -f2- | tr -d '"' | tr -d "'")
KEY="${SUPABASE_SERVICE_ROLE_KEY:?set SUPABASE_SERVICE_ROLE_KEY}"
GZ=/tmp/questions.json.gz
gzip -c "$ROOT/extraction/output/questions_all.json" > "$GZ"
# App loads this versioned name (see src/lib/db.ts → loadQuestionBank).
# Also keep questions.json.gz in sync for scripts/docs that still reference it.
NAMES=(
  "questions.full-parity-20260803-r5.json.gz"
  "questions.json.gz"
)
for NAME in "${NAMES[@]}"; do
  echo "Uploading $(du -h "$GZ" | awk '{print $1}') to bank/${NAME}"
  curl -fsS -X POST \
    "${URL}/storage/v1/object/bank/${NAME}" \
    -H "Authorization: Bearer ${KEY}" \
    -H "apikey: ${KEY}" \
    -H "Content-Type: application/gzip" \
    -H "x-upsert: true" \
    -H "cache-control: no-cache" \
    --data-binary @"$GZ"
  echo
  echo "OK bank/${NAME}"
done
