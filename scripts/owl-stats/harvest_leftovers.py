#!/usr/bin/env python3
"""Fill Stat Cat items still on a broad NIMH fact with a cited paper figure."""
from __future__ import annotations

import importlib.util
import json
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("rebuild", HERE / "rebuild_all.py")
rb = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(rb)

ma_spec = importlib.util.spec_from_file_location(
    "match_articles", ROOT / "scripts/research-articles/match_articles.py"
)
ma = importlib.util.module_from_spec(ma_spec)
assert ma_spec.loader
ma_spec.loader.exec_module(ma)

OUT = ROOT / "public/data/owl_stats.json"
LOCK = threading.Lock()


def one(q: dict) -> tuple[str, dict | None]:
    qid = rb.qid_of(q)
    query = rb.leftover_query(q)
    if not query:
        return qid, None
    try:
        hits = ma.epmc_search(query, page_size=8)
    except Exception:
        return qid, None
    for h in hits:
        row = rb.extract_from_hit(h, q)
        if row:
            return qid, {k: v for k, v in row.items() if k not in {"pmid", "overlap"}}
    return qid, None


def main() -> int:
    assigned = json.loads(OUT.read_text())
    questions = {rb.qid_of(q): q for q in rb.load_questions()}
    leftovers = [
        questions[qid]
        for qid, row in assigned.items()
        if qid in questions and str(row.get("stat_id") or "").startswith(("nimh-ami", "nimh-smi"))
    ]
    print(f"leftovers {len(leftovers)}", file=sys.stderr)
    added = 0
    with ThreadPoolExecutor(max_workers=10) as pool:
        futs = [pool.submit(one, q) for q in leftovers]
        for i, fut in enumerate(as_completed(futs), 1):
            qid, row = fut.result()
            if row:
                with LOCK:
                    assigned[qid] = row
                    added += 1
            if i % 100 == 0:
                print(f"  {added}/{i}", file=sys.stderr)
                OUT.write_text(json.dumps(assigned, ensure_ascii=False, separators=(",", ":")))
    OUT.write_text(json.dumps(assigned, ensure_ascii=False, separators=(",", ":")))
    paper = sum(1 for v in assigned.values() if str(v.get("stat_id")).startswith("pmid-"))
    print(f"added {added}; paper-derived now {paper}/{len(assigned)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
