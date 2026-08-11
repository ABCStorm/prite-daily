#!/usr/bin/env python3
"""
Apply whatever audit results exist so far onto refs.json:
  - For pair_ids with a verdict: keep only relevant/weak and attach relevance_sentence
  - For unaudited pairs: leave as-is (still shown until full audit finishes)
  - Rebuild client bundle

Usage:
  python3 scripts/research-articles/apply_partial_audit.py
  python3 scripts/research-articles/apply_partial_audit.py --strict  # drop unaudited too
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REFS = ROOT / "reference" / "research-articles" / "refs.json"
RESULTS = ROOT / "reference" / "research-articles" / "audit" / "results"
BACKUP = ROOT / "reference" / "research-articles" / "refs.pre_audit_backup.json"


def load_verdicts() -> dict[str, dict]:
    out: dict[str, dict] = {}
    for path in sorted(RESULTS.glob("batch_*.json")):
        try:
            data = json.loads(path.read_text())
        except Exception:
            continue
        for it in data.get("verdicts") or []:
            pid = it.get("pair_id")
            if pid:
                out[pid] = it
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true", help="Drop pairs with no audit verdict")
    ap.add_argument("--keep-weak", action="store_true", default=True)
    ap.add_argument("--no-weak", action="store_true")
    args = ap.parse_args()
    keep_weak = args.keep_weak and not args.no_weak

    refs = json.loads(REFS.read_text())
    if not BACKUP.exists():
        BACKUP.write_text(json.dumps(refs, indent=2, ensure_ascii=False) + "\n")
        print(f"backup → {BACKUP}", file=sys.stderr)

    verdicts = load_verdicts()
    print(f"verdicts={len(verdicts)}", file=sys.stderr)

    kept = dropped = unaudited = 0
    new = {}
    for id_, r in refs.items():
        arts = []
        for a in r.get("articles") or []:
            pmid = str(a.get("pmid") or "")
            pid = f"{id_}:{pmid}"
            v = verdicts.get(pid)
            if not v:
                if args.strict:
                    dropped += 1
                    continue
                arts.append(a)
                unaudited += 1
                continue
            rating = (v.get("rating") or "").lower()
            relevant = v.get("relevant")
            if relevant is True:
                ok = rating != "irrelevant"
            elif relevant is False:
                ok = False
            else:
                ok = rating in ("relevant", "strong") or (keep_weak and rating == "weak")
            if rating == "irrelevant":
                ok = False
            if rating == "weak" and not keep_weak:
                ok = False
            if not ok:
                dropped += 1
                continue
            a2 = dict(a)
            sentence = (v.get("relevance_sentence") or "").strip()
            if sentence:
                a2["relevance_sentence"] = sentence
                a2["why"] = sentence
            a2["audit_rating"] = rating or "relevant"
            arts.append(a2)
            kept += 1
        rec = dict(r)
        rec["articles"] = arts
        new[id_] = rec

    REFS.write_text(json.dumps(new, indent=2, ensure_ascii=False) + "\n")
    print(f"kept={kept} dropped={dropped} unaudited_left={unaudited}", file=sys.stderr)
    print(f"questions_with_articles={sum(1 for r in new.values() if r.get('articles'))}", file=sys.stderr)

    subprocess.check_call([sys.executable, str(ROOT / "scripts/research-articles/build_client_bundle.py")])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
