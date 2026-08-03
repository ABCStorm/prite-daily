#!/bin/bash
# Periodically merge completed batches into the question bank while the reformatting workflow runs,
# so a crash (or a killed session) never costs more than one interval of work.
#
#   extraction/fmt_checkpoint.sh [interval_seconds] [max_minutes]
#
# Safe to run concurrently with the agents: merge skips batches that are half-written, validates
# every item before accepting it, snapshots the bank first, and writes atomically. It stops on its
# own once every batch is complete.
set -uo pipefail
cd "$(dirname "$0")/.."

INTERVAL="${1:-600}"
MAX_MIN="${2:-360}"
LOG="extraction/output/_fmt/checkpoint.log"
deadline=$(( $(date +%s) + MAX_MIN * 60 ))

echo "[$(date '+%H:%M:%S')] checkpoint loop started (every ${INTERVAL}s, up to ${MAX_MIN}m)" | tee -a "$LOG"

while [ "$(date +%s)" -lt "$deadline" ]; do
  sleep "$INTERVAL"
  status=$(python3 extraction/fmt_explanations.py status 2>&1 | head -1)
  merged=$(python3 extraction/fmt_explanations.py merge 2>&1 | grep -E '^merged' || echo "merge failed")
  echo "[$(date '+%H:%M:%S')] $status | $merged" | tee -a "$LOG"

  # Stop once nothing is outstanding.
  if [ "$(python3 extraction/fmt_explanations.py pending)" = "[]" ]; then
    echo "[$(date '+%H:%M:%S')] all batches complete — checkpoint loop done" | tee -a "$LOG"
    exit 0
  fi
done
echo "[$(date '+%H:%M:%S')] checkpoint loop hit its time limit" | tee -a "$LOG"
