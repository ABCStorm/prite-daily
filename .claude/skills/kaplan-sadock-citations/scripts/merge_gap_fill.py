#!/usr/bin/env python3
"""Assemble / apply gap-fill results for questions that had no live K&S citation.

Usage:
  python3 merge_gap_fill.py assemble
  python3 verify_citations.py reference/gap_fill_merged_raw.json gap_fill
  python3 merge_gap_fill.py apply reference/gap_fill_verified.json
"""
from __future__ import annotations

import json
import shutil
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path("/Users/andrewcorrell/Claude/Projects/PRITE question practice website")
GAP_DIR = ROOT / "reference" / "results" / "gap_fill"
SECTIONS = ROOT / "reference" / "section_index_full.json"
LIVE = ROOT / "reference" / "kaplan_refs_bundle.LIVE.json"
RAW_OUT = ROOT / "reference" / "gap_fill_merged_raw.json"


def assemble() -> None:
    files = sorted(GAP_DIR.glob("batch_*.json"))
    if not files:
        raise SystemExit(f"no batch_*.json under {GAP_DIR}")
    by_id: dict = {}
    for f in files:
        data = json.loads(f.read_text())
        rows = data if isinstance(data, list) else data.get("results") or data
        if not isinstance(rows, list):
            print(f"  skip {f.name}: unexpected shape")
            continue
        for r in rows:
            if r.get("id"):
                by_id[r["id"]] = r
    rows = list(by_id.values())
    RAW_OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=2))
    print(f"assembled {len(rows)} from {len(files)} files -> {RAW_OUT.name}")
    print(f"  ratings: {dict(Counter(r.get('rating') for r in rows))}")
    print(f"  dispositions: {dict(Counter(r.get('disposition') for r in rows))}")


def apply(verified_path: Path) -> None:
    verified = json.loads(verified_path.read_text())
    sections = {s["num"]: s for s in json.loads(SECTIONS.read_text())}
    live = json.loads(LIVE.read_text())
    n_before = len(live)

    now = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = LIVE.with_suffix(LIVE.suffix + f".bak-gapfill-{now}")
    shutil.copy2(LIVE, backup)

    added = upgraded = skipped = 0
    for r in verified:
        qid = r["id"]
        rating = (r.get("rating") or "").upper()
        if rating in ("NONE", "DROP"):
            skipped += 1
            continue
        oks = [
            c for c in r.get("citations") or []
            if c.get("status") == "OK" and c.get("pdf_page") and c.get("quote")
        ]
        if not oks:
            skipped += 1
            continue

        # Do not overwrite an existing live entry unless this is STRONG and
        # the existing one is context-only from a prior weak ship.
        if qid in live and rating != "STRONG":
            skipped += 1
            continue

        sec = r.get("section_num") or (live.get(qid) or {}).get("section") or ""
        title = (sections.get(sec) or {}).get("title") or (live.get(qid) or {}).get("title") or ""
        cites = []
        for c in oks:
            page = int(c["pdf_page"])
            supports = (c.get("supports") or "correct").lower()
            if supports.startswith("distractor"):
                role = "distractor"
            elif rating == "STRONG":
                role = "primary"
            else:
                role = "context"
            cites.append({
                "quote": c["quote"],
                "role": role,
                "note": c.get("note") or "",
                "image": f"{qid}_{sec or 'x'}_p{page}.png",
                "page": page,
            })

        was = qid in live
        live[qid] = {
            "section": sec,
            "title": title,
            "cites": cites,
            "_source": f"gap_fill:{rating}",
        }
        if was:
            upgraded += 1
        else:
            added += 1

    LIVE.write_text(json.dumps(live, ensure_ascii=False, separators=(",", ":")))
    print(f"backup: {backup.name}")
    print(f"added new:        {added}")
    print(f"overwrote existing: {upgraded}")
    print(f"skipped:          {skipped}")
    print(f"LIVE {n_before} -> {len(live)} questions / {sum(len(v['cites']) for v in live.values())} cites")


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    cmd = sys.argv[1]
    if cmd == "assemble":
        assemble()
    elif cmd == "apply":
        if len(sys.argv) < 3:
            raise SystemExit("apply needs path to *_verified.json")
        apply(Path(sys.argv[2]))
    else:
        raise SystemExit(f"unknown cmd {cmd}")


if __name__ == "__main__":
    main()
