#!/usr/bin/env python3
"""Build a questions_all-shaped JSON for Kaufman + Quizapine therapy items."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
THERAPY = ROOT / "public" / "data" / "therapy_questions.json"
KAUFMAN = ROOT / "reference" / "kaufman" / "questions.json"
OUT = ROOT / "reference" / "alt-bank" / "questions.json"


def main() -> int:
    out = []
    if THERAPY.exists():
        out.extend(json.loads(THERAPY.read_text()))
    if KAUFMAN.exists():
        for q in json.loads(KAUFMAN.read_text()):
            ch = (q.get("kaufman") or {}).get("chapter") or q.get("prite_label") or q.get("year")
            if not q.get("video_query"):
                q["video_query"] = f"{ch} {q.get('answer_text') or ''} neurology psychiatry"
            out.append(q)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False))
    print(f"wrote {len(out)} questions -> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
