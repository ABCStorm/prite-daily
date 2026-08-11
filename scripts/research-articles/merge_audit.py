#!/usr/bin/env python3
"""
Merge audit verdicts into refs.json:
  - keep only articles rated relevant (or weak if --keep-weak)
  - attach relevance_sentence for the UI
  - rebuild public/data/research_refs.json

Reads any of:
  reference/research-articles/audit/results/batch_*.json
  reference/research-articles/audit/results_merged.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REFS = ROOT / "reference" / "research-articles" / "refs.json"
AUDIT_DIR = ROOT / "reference" / "research-articles" / "audit"
RESULTS_DIR = AUDIT_DIR / "results"
OUT_REFS = ROOT / "reference" / "research-articles" / "refs_audited.json"
CLIENT_BUILDER = ROOT / "scripts" / "research-articles" / "build_client_bundle.py"


def load_verdicts() -> dict[str, dict]:
    """pair_id -> {relevant, relevance_sentence, rating, note}"""
    out: dict[str, dict] = {}
    paths = sorted(RESULTS_DIR.glob("batch_*.json")) if RESULTS_DIR.exists() else []
    merged = AUDIT_DIR / "results_merged.json"
    if merged.exists():
        paths = [merged] + paths
    for path in paths:
        try:
            data = json.loads(path.read_text())
        except Exception as e:
            print(f"skip {path}: {e}", file=sys.stderr)
            continue
        items = data if isinstance(data, list) else data.get("verdicts") or data.get("items") or []
        if isinstance(data, dict) and "batches" in data:
            for b in data["batches"]:
                items = list(items) + list(b.get("verdicts") or b.get("items") or [])
        for it in items:
            pid = it.get("pair_id") or (
                f"{it.get('question_id')}:{it.get('pmid')}" if it.get("question_id") and it.get("pmid") else None
            )
            if not pid:
                continue
            out[pid] = it
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep-weak", action="store_true", help="Keep rating=weak as well as relevant")
    ap.add_argument("--write-live-refs", action="store_true", help="Overwrite refs.json (else refs_audited.json)")
    ap.add_argument("--build-client", action="store_true", help="Also rebuild public/data/research_refs.json")
    args = ap.parse_args()

    refs = json.loads(REFS.read_text())
    verdicts = load_verdicts()
    print(f"loaded {len(verdicts)} verdicts for {len(refs)} questions", file=sys.stderr)

    kept_q = kept_a = dropped = unreviewed = 0
    new_refs = {}
    for id_, r in refs.items():
        arts_out = []
        for a in r.get("articles") or []:
            pmid = str(a.get("pmid") or "")
            pid = f"{id_}:{pmid}"
            v = verdicts.get(pid)
            if not v:
                unreviewed += 1
                # drop unreviewed when any audit data exists — fail closed for quality
                if verdicts:
                    dropped += 1
                    continue
                arts_out.append(a)
                continue
            rating = (v.get("rating") or "").lower()
            relevant = v.get("relevant")
            if relevant is True:
                ok = True
            elif relevant is False:
                ok = False
            else:
                ok = rating in ("relevant", "strong") or (
                    args.keep_weak and rating == "weak"
                )
            if not ok:
                dropped += 1
                continue
            sentence = (v.get("relevance_sentence") or v.get("why") or "").strip()
            a2 = dict(a)
            if sentence:
                a2["relevance_sentence"] = sentence
                a2["why"] = sentence  # UI currently shows `why`
            a2["audit_rating"] = rating or ("relevant" if relevant else "unknown")
            arts_out.append(a2)
            kept_a += 1
        rec = dict(r)
        rec["articles"] = arts_out
        if arts_out:
            kept_q += 1
        new_refs[id_] = rec

    out_path = REFS if args.write_live_refs else OUT_REFS
    out_path.write_text(json.dumps(new_refs, indent=2, ensure_ascii=False) + "\n")
    print(
        f"kept_questions={kept_q}/{len(refs)} kept_articles={kept_a} "
        f"dropped={dropped} unreviewed={unreviewed}",
        file=sys.stderr,
    )
    print(f"wrote {out_path}", file=sys.stderr)

    if args.build_client:
        # temporarily point builder at audited file
        import subprocess
        if out_path != REFS:
            backup = REFS.with_suffix(".json.bak_pre_audit")
            if not backup.exists():
                backup.write_bytes(REFS.read_bytes())
            REFS.write_bytes(out_path.read_bytes())
        subprocess.check_call([sys.executable, str(CLIENT_BUILDER)])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
