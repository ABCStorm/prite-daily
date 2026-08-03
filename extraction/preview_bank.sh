#!/bin/bash
# Populate public/data/questions.json with reformatted questions so the local no-backend
# preview (`prite-daily-nogate` in .claude/launch.json) can render them, then restore the
# tracked empty stub when you're done.
#
#   extraction/preview_bank.sh on    # fill with every question that has a reformatted explanation
#   extraction/preview_bank.sh off   # restore the "[]" stub  <-- ALWAYS run before committing
#
# public/data/questions.json is TRACKED by git. Leaving the real bank in it would commit the
# private question bank to the repo.
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  on)
    python3 - <<'PY'
import json
from pathlib import Path
qs = json.loads(Path("extraction/output/questions_all.json").read_text())
done = {x["id"] for b in Path("extraction/output/_fmt/batches").glob("batch_*.out.json")
        for x in json.loads(b.read_text())}
sel = [q for q in qs if f'{q["year"]}-{q["q_index"]}' in done]
Path("public/data/questions.json").write_text(json.dumps(sel, ensure_ascii=False))
print(f"preview bank: {len(sel)} reformatted questions")
PY
    ;;
  off)
    git checkout -- public/data/questions.json
    git diff --quiet -- public/data/questions.json \
      && echo "restored: public/data/questions.json matches HEAD" \
      || echo "WARNING: public/data/questions.json still differs from HEAD"
    ;;
  *)
    echo "usage: $0 {on|off}" >&2; exit 2 ;;
esac
