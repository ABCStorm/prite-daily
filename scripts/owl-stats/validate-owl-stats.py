#!/usr/bin/env python3
"""Print a relevance audit for the current owl assignment file."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import importlib.util

_BUILD = Path(__file__).resolve().parent / "build-owl-stats.py"
_spec = importlib.util.spec_from_file_location("owl_build", _BUILD)
_mod = importlib.util.module_from_spec(_spec)
assert _spec.loader
_spec.loader.exec_module(_mod)
content_hits = _mod.content_hits
content_text = _mod.content_text
eligible = _mod.eligible
from canonical import STATS

BANK = ROOT / "extraction/output/questions_all.json"
ASSIGN = ROOT / "public/data/owl_stats.json"


def main() -> int:
    questions = {f"{q['year']}-{q['q_index']}": q for q in json.loads(BANK.read_text())}
    assigned = json.loads(ASSIGN.read_text())
    by_id = {s["id"]: s for s in STATS}
    unanchored = 0
    examples = []
    for qid, row in assigned.items():
        q = questions.get(qid)
        stat = by_id.get(row["stat_id"])
        if not q or not stat:
            continue
        content = content_text(q)
        hits = content_hits(stat, content, q)
        ok = eligible(stat, content, q)
        if not hits and not stat.get("broad"):
            unanchored += 1
            if len(examples) < 12:
                examples.append((qid, row["stat_id"], (q.get("stem") or "")[:140], row["sentence"][:140]))
        if qid in {"2022-49", "2022-80", "2022-133", "2022-251", "2014-105", "2009-1"}:
            print(f"{qid} -> {row['stat_id']}  hits={hits or ['(broad)' if stat.get('broad') else 'NONE']}")
            print(f"  stem: {(q.get('stem') or '')[:150]}")
            print(f"  said: {row['sentence']}")
            print()
    print(f"assigned {len(assigned)}; unanchored specific stats {unanchored}")
    for ex in examples:
        print("WEAK", ex[0], ex[1], "|", ex[2])
    return 0 if unanchored == 0 else 1


if __name__ == "__main__":
    # import path uses hyphenated filename — run inline from build instead
    raise SystemExit(main())
