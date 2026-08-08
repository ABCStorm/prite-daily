#!/usr/bin/env python3
"""Merge strengthen-pass results into LIVE, after verify_citations.py.

Usage:
  # 1) assemble raw strengthen outputs (already on disk under results/strengthen/)
  python3 merge_strengthen.py assemble

  # 2) verify:
  python3 verify_citations.py reference/strengthen_merged_raw.json strengthen

  # 3) apply upgrades into LIVE (only OK-verified STRONG, plus improved WEAK OK):
  python3 merge_strengthen.py apply reference/strengthen_verified.json
"""
from __future__ import annotations

import json
import shutil
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path("/Users/andrewcorrell/Claude/Projects/PRITE question practice website")
STREN_DIR = ROOT / "reference" / "results" / "strengthen"
SECTIONS = ROOT / "reference" / "section_index_full.json"
LIVE = ROOT / "reference" / "kaplan_refs_bundle.LIVE.json"
RAW_OUT = ROOT / "reference" / "strengthen_merged_raw.json"


def assemble() -> None:
    files = sorted(STREN_DIR.glob("batch_*.json"))
    if not files:
        raise SystemExit(f"no batch_*.json under {STREN_DIR}")
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
    ratings = Counter(r.get("rating") for r in rows)
    disp = Counter(r.get("disposition") for r in rows)
    print(f"assembled {len(rows)} questions from {len(files)} files -> {RAW_OUT.name}")
    print(f"  ratings: {dict(ratings)}")
    print(f"  dispositions: {dict(disp)}")


def apply(verified_path: Path) -> None:
    verified = json.loads(verified_path.read_text())
    sections = {s["num"]: s for s in json.loads(SECTIONS.read_text())}
    live = json.loads(LIVE.read_text())

    upgraded = improved = dropped = kept = skipped = 0
    now = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = LIVE.with_suffix(LIVE.suffix + f".bak-strengthen-{now}")
    shutil.copy2(LIVE, backup)

    for r in verified:
        qid = r["id"]
        rating = (r.get("rating") or "").upper()
        disposition = (r.get("disposition") or "").lower()
        oks = [c for c in r.get("citations") or [] if c.get("status") == "OK" and c.get("pdf_page") and c.get("quote")]

        # DROP: remove the weak-sourced entry if we added it from shipfinal WEAK
        if rating in ("DROP", "NONE") or disposition == "dropped":
            rec = live.get(qid)
            if rec and rec.get("_source", "").startswith("shipfinal_verified:WEAK"):
                del live[qid]
                dropped += 1
            else:
                skipped += 1
            continue

        if not oks:
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

        live[qid] = {
            "section": sec,
            "title": title,
            "cites": cites,
            "_source": f"strengthen:{rating}",
        }
        if rating == "STRONG":
            upgraded += 1
        else:
            improved += 1

    LIVE.write_text(json.dumps(live, ensure_ascii=False, separators=(",", ":")))
    print(f"backup: {backup.name}")
    print(f"upgraded→STRONG: {upgraded}")
    print(f"improved WEAK:   {improved}")
    print(f"dropped:         {dropped}")
    print(f"skipped:         {skipped}")
    print(f"LIVE now: {len(live)} questions / {sum(len(v['cites']) for v in live.values())} cites")


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
