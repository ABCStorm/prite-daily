#!/usr/bin/env python3
"""Print audit coverage and keep-rate so far."""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RESULTS = ROOT / "reference" / "research-articles" / "audit" / "results"
N_BATCHES = 637
N_PAIRS = 7637


def main() -> int:
    paths = sorted(RESULTS.glob("batch_*.json")) if RESULTS.exists() else []
    c: Counter = Counter()
    n = 0
    for p in paths:
        try:
            d = json.loads(p.read_text())
        except Exception:
            continue
        for v in d.get("verdicts") or []:
            n += 1
            c[(v.get("rating") or "?").lower()] += 1
    print(f"batches_done={len(paths)}/{N_BATCHES} pairs_audited={n}/{N_PAIRS}")
    print(f"ratings={dict(c)}")
    if n:
        keep_rw = c["relevant"] + c["weak"]
        print(f"keep relevant+weak={keep_rw} ({100*keep_rw/n:.1f}%)")
        print(f"keep relevant_only={c['relevant']} ({100*c['relevant']/n:.1f}%)")
        print(f"drop irrelevant={c['irrelevant']} ({100*c['irrelevant']/n:.1f}%)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
