#!/usr/bin/env python3
"""Measure how much of each explanation is verbatim carry-over vs. rewritten prose.

The fabrication audit (audit_fabrication.py) catches invented citations and numbers. It cannot
catch a claim that was silently *reworded* into something different — "reduces risk" becoming
"eliminates risk", a mechanism flipped, a hedge dropped. That kind of drift only shows up as
lowered verbatim retention, so this measures it directly.

For each reformatted explanation it computes:
  retention — fraction of the ORIGINAL's word sequence that survives, in order, in the output
              (difflib matching-block ratio over normalised words)
  new_prose — fraction of the OUTPUT's words that do not come from the original

High retention + low new_prose = the pass transcribed and marked up, which is what was asked for.
Low retention = the model rewrote, and that item needs a human or a strong model to re-verify.

  python3 extraction/audit_rework.py               # distribution + worst offenders
  python3 extraction/audit_rework.py --list 0.75   # every item below a retention threshold
"""
from __future__ import annotations

import difflib
import json
import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
BANK = BASE / "extraction" / "output" / "questions_all.json"
ORIG = BASE / "extraction" / "output" / "questions_all.json.bak-prefmt-trial"

WORD = re.compile(r"[a-z0-9]+")
# Debris the pass was explicitly told to delete. Counting it as "lost content" would make an
# honest cleanup look like a rewrite, so strip it from the original before comparing.
DEBRIS = re.compile(
    r"Thought for [^\n]*|You'?re (?:right|correct)[^\n]*|Great question[^\n]*"
    r"|\b(?:https?://\S+|www\.\S+|[a-z0-9-]+\.(?:com|org|net|gov|edu)\b)"
    r"|Search Labs|A[lI] Overview|All Short videos[^\n]*|Show Less \^|Helpful / Not Helpful"
    r"|\{\{?c\d+::?|\}\}?|\(\(c\d+:|Explanation:|Rationale:|Correct answers?:",
    re.I,
)


def words(t: str) -> list[str]:
    t = DEBRIS.sub(" ", t or "")
    t = re.sub(r"\*\*|\*|•", " ", t)
    return WORD.findall(t.lower())


def compare(before: str, after: str) -> tuple[float, float]:
    a, b = words(before), words(after)
    if not a or not b:
        return (1.0, 0.0)
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    matched = sum(blk.size for blk in sm.get_matching_blocks())
    return matched / len(a), 1 - (matched / len(b))


def main() -> None:
    new = {f'{q["year"]}-{q["q_index"]}': q for q in json.loads(BANK.read_text())}
    old = {f'{q["year"]}-{q["q_index"]}': q for q in json.loads(ORIG.read_text())}
    rows = []
    for qid, q in new.items():
        after = q.get("explanation_text") or ""
        before = old[qid].get("explanation_text") or ""
        if not after.strip() or after == before:
            continue
        ret, novel = compare(before, after)
        rows.append((ret, novel, qid, len(words(before))))

    rows.sort()
    n = len(rows)
    print(f"{n} reformatted explanations compared against their originals\n")
    print("  verbatim retention of the original's wording:")
    for p in (1, 5, 10, 25, 50):
        print(f"    p{p:<3} {rows[max(0, n * p // 100)][0]:.0%}")
    print(f"    median {rows[n // 2][0]:.0%}   mean {sum(r[0] for r in rows) / n:.0%}")

    for thresh in (0.90, 0.80, 0.70, 0.50):
        k = sum(1 for r in rows if r[0] < thresh)
        print(f"  below {thresh:.0%} retention: {k:>4}  ({100 * k / n:.1f}%)")

    novel = sorted(rows, key=lambda r: -r[1])
    print("\n  output words with no counterpart in the original (new prose):")
    print(f"    median {sorted(r[1] for r in rows)[n // 2]:.0%}"
          f"   p90 {sorted(r[1] for r in rows)[9 * n // 10]:.0%}")

    if "--list" in sys.argv:
        t = float(sys.argv[sys.argv.index("--list") + 1])
        low = [r for r in rows if r[0] < t]
        print(f"\n  {len(low)} items below {t:.0%} retention:")
        for ret, nov, qid, wlen in low:
            print(f"    {qid:>10}  retention {ret:>4.0%}  new-prose {nov:>4.0%}  ({wlen}w original)")
    else:
        print("\n  most-rewritten items:")
        for ret, nov, qid, wlen in rows[:15]:
            print(f"    {qid:>10}  retention {ret:>4.0%}  new-prose {nov:>4.0%}  ({wlen}w original)")


if __name__ == "__main__":
    main()
