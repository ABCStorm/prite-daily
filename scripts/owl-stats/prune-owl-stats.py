#!/usr/bin/env python3
"""Remove Stat Cat rows that are not both quantitative and question-relevant."""

from __future__ import annotations

import argparse
import gzip
import json
from collections import Counter
from pathlib import Path

from canonical import STATS
from eligibility import audit, clean_sentence

ROOT = Path(__file__).resolve().parents[2]


def load_bank(path: Path) -> list[dict]:
    if not path.exists():
        return []
    data = json.loads(path.read_text())
    if not isinstance(data, list):
        raise ValueError(f"question bank must be a list: {path}")
    return data


def bank_name(question: dict) -> str:
    year = str(question.get("year") or "")
    if question.get("quizapine"):
        return "Therapy"
    if year.lower() in {"kaufman", "neuro"} or question.get("kaufman"):
        return "Neuro"
    return "PRITE"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=ROOT / "public/data/owl_stats.json")
    parser.add_argument("--output", type=Path, default=ROOT / "public/data/owl_stats.json")
    parser.add_argument("--prite", type=Path, default=ROOT / "extraction/output/questions_all.json")
    parser.add_argument("--therapy", type=Path, default=ROOT / "public/data/therapy_questions.json")
    parser.add_argument("--neuro", type=Path, default=ROOT / "reference/kaufman/questions.json")
    parser.add_argument("--require-known", action="store_true", help="drop rows absent from all supplied banks")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    assignments = json.loads(args.input.read_text())
    for row in assignments.values():
        if str(row.get("stat_id") or "").startswith("pmid-"):
            row["sentence"] = clean_sentence(str(row.get("sentence") or ""))
    questions = load_bank(args.prite) + load_bank(args.therapy) + load_bank(args.neuro)
    canonical = {stat["id"]: stat for stat in STATS}
    kept, reasons, unknown = audit(assignments, questions, canonical)

    if not args.require_known:
        for qid in unknown:
            kept[qid] = assignments[qid]

    by_question = {f"{q['year']}-{q['q_index']}": q for q in questions}
    before = Counter(bank_name(by_question[qid]) for qid in assignments if qid in by_question)
    after = Counter(bank_name(by_question[qid]) for qid in kept if qid in by_question)

    print(f"audited {len(assignments)} assignments against {len(questions)} questions")
    for name in ("PRITE", "Therapy", "Neuro"):
        print(f"  {name}: {before[name]} -> {after[name]} (removed {before[name] - after[name]})")
    for reason, count in reasons.most_common():
        print(f"  removed {count}: {reason}")
    if unknown:
        verb = "removed" if args.require_known else "preserved"
        print(f"  {verb} {len(unknown)} assignments absent from supplied banks")

    if args.dry_run:
        return 0

    raw = json.dumps(kept, ensure_ascii=False, separators=(",", ":")).encode()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(raw)
    args.output.with_suffix(args.output.suffix + ".gz").write_bytes(
        gzip.compress(raw, compresslevel=9, mtime=0)
    )
    print(f"wrote {len(kept)} eligible assignments -> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
