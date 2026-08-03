#!/usr/bin/env python3
"""Aggregate the per-batch accuracy verdicts into one report.

Each verifier agent writes `_fmt/accuracy/ac_NNNN.verdict.json`, so progress survives a crash and
this can be run at any time — including while the run is still going.

  python3 extraction/accuracy_report.py            # coverage + severity summary
  python3 extraction/accuracy_report.py --high     # every high-severity finding, in full
  python3 extraction/accuracy_report.py --pending  # batch ids with no verdict yet
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
ACC = BASE / "extraction" / "output" / "_fmt" / "accuracy"


def load() -> tuple[list[dict], set[str], set[str]]:
    findings, done, expected = [], set(), set()
    controls: set[str] = set()
    for inp in sorted(ACC.glob("ac_*.json")):
        if inp.name.endswith(".verdict.json"):
            continue
        num = inp.stem.split("_")[1]
        expected.add(num)
        items = json.loads(inp.read_text())
        controls |= {x["id"] for x in items if x.get("control")}
        v = ACC / f"ac_{num}.verdict.json"
        if not v.exists():
            continue
        try:
            verdicts = json.loads(v.read_text())
        except json.JSONDecodeError:
            continue
        done.add(num)
        for r in verdicts:
            for p in r.get("problems", []) or []:
                findings.append({"id": r["id"], "control": r["id"] in controls, **p})
    return findings, done, expected


def main() -> None:
    findings, done, expected = load()
    pending = sorted(expected - done)

    if "--pending" in sys.argv:
        print(json.dumps(pending))
        return

    print(f"batches verified: {len(done)}/{len(expected)}"
          + (f"   pending: {len(pending)}" if pending else "   COMPLETE"))
    if not findings:
        print("no problems reported yet")
        return

    flagged_ids = {f["id"] for f in findings}
    print(f"items with at least one problem: {len(flagged_ids)}\n")

    print("by kind:")
    for k, n in Counter(f["kind"] for f in findings).most_common():
        print(f"  {n:>4}  {k}")
    print("\nby severity:")
    for k, n in Counter(f.get("severity", "?") for f in findings).most_common():
        print(f"  {n:>4}  {k}")

    ctrl = [f for f in findings if f["control"]]
    print(f"\ncontrol group (near-verbatim reformats): {len({f['id'] for f in ctrl})} flagged"
          f" — a high number here would mean the >=95%-retention band is NOT safe")

    high = [f for f in findings if f.get("severity") == "high"]
    print(f"\nhigh-severity findings: {len(high)} across {len({f['id'] for f in high})} items")
    show = high if "--high" in sys.argv else high[:12]
    for f in show:
        print(f"\n  {f['id']}  [{f['kind']}]")
        print(f"     claim     : {f['claim'][:160]}")
        print(f"     why       : {f['why'][:220]}")
        if f.get("correction"):
            print(f"     correction: {f['correction'][:160]}")


if __name__ == "__main__":
    main()
