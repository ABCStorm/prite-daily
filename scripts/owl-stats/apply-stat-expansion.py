#!/usr/bin/env python3
"""Merge independently approved Stat Cat additions and run a final full-bank audit."""

from __future__ import annotations

import argparse
import gzip
import json
from collections import Counter
from pathlib import Path

from canonical import STATS
from eligibility import assignment_eligible, audit, clean_sentence

ROOT = Path(__file__).resolve().parents[2]
PUBLIC_FIELDS = (
    "stat_id", "sentence", "source_label", "source_url", "source_year", "audio_path", "source_title",
)


def load_list(path: Path) -> list[dict]:
    data = json.loads(path.read_text())
    if not isinstance(data, list):
        raise ValueError(f"expected a question list: {path}")
    return data


def qid(question: dict) -> str:
    return f"{question['year']}-{question['q_index']}"


def bank(question: dict) -> str:
    if question.get("quizapine"):
        return "Therapy"
    if question.get("kaufman") or str(question.get("year") or "").lower() in {"kaufman", "neuro"}:
        return "Neuro"
    return "PRITE"


def public_row(row: dict) -> dict:
    out = {key: row.get(key) for key in PUBLIC_FIELDS}
    out["sentence"] = clean_sentence(str(out.get("sentence") or ""))
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stats", type=Path, default=ROOT / "public/data/owl_stats.json")
    parser.add_argument("--pubmed", type=Path, default=ROOT / "work/pubmed-stat-approved.json")
    parser.add_argument("--therapy", type=Path, default=ROOT / "work/therapy-stat-approved.json")
    parser.add_argument("--neuro", type=Path, default=Path("/private/tmp/prite-kaufman-questions-audit.json"))
    parser.add_argument("--report", type=Path, default=ROOT / "work/owl_stats.expansion-report.json")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    questions = (
        load_list(ROOT / "extraction/output/questions_all.json")
        + load_list(ROOT / "public/data/therapy_questions.json")
        + load_list(args.neuro)
    )
    by_qid = {qid(question): question for question in questions}
    canonical = {stat["id"]: stat for stat in STATS}
    before = json.loads(args.stats.read_text())
    assignments, cleanup_reasons, initial_unknown = audit(before, questions, canonical)
    if initial_unknown:
        raise ValueError(f"{len(initial_unknown)} existing assignments are absent from the supplied banks")
    cleaned_base_count = len(assignments)

    additions = Counter()
    skipped = Counter()
    # Purpose-built modality evidence is more specific than a sentence mined
    # from a generally relevant paper, so it gets first choice for Therapy.
    for source, path in (("therapy evidence", args.therapy), ("PubMed mining", args.pubmed)):
        for candidate in json.loads(path.read_text()):
            candidate_qid = candidate["qid"]
            if candidate_qid in assignments:
                skipped[f"{source}: already covered"] += 1
                continue
            question = by_qid.get(candidate_qid)
            if not question:
                raise ValueError(f"approved candidate has no question: {candidate_qid}")
            row = public_row(candidate)
            ok, reason = assignment_eligible(question, row, canonical)
            if not ok:
                raise ValueError(f"approved candidate failed final check: {candidate_qid}: {reason}")
            assignments[candidate_qid] = row
            additions[f"{source}: {bank(question)}"] += 1

    kept, reasons, unknown = audit(assignments, questions, canonical)
    if unknown:
        raise ValueError(f"{len(unknown)} assignments are absent from the three supplied banks")
    if len(kept) != len(assignments):
        raise ValueError(f"full-bank audit rejected {len(assignments) - len(kept)} rows: {dict(reasons)}")

    before_banks = Counter(bank(by_qid[key]) for key in before)
    after_banks = Counter(bank(by_qid[key]) for key in kept)
    report = {
        "question_count": len(questions),
        "before": {"total": len(before), "banks": dict(before_banks)},
        "after": {"total": len(kept), "banks": dict(after_banks)},
        "added": dict(additions),
        "skipped": dict(skipped),
        "removed_by_stronger_checker": len(before) - cleaned_base_count,
        "cleanup_reasons": dict(cleanup_reasons),
        "final_audit_rejections": dict(reasons),
    }
    print(json.dumps(report, indent=2))
    if args.dry_run:
        return 0

    raw = json.dumps(kept, ensure_ascii=False, separators=(",", ":")).encode()
    args.stats.write_bytes(raw)
    args.stats.with_suffix(args.stats.suffix + ".gz").write_bytes(
        gzip.compress(raw, compresslevel=9, mtime=0)
    )
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
