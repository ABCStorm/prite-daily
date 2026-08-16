#!/usr/bin/env python3
"""Assign independently verified therapy evidence to the matching modality."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

from eligibility import assignment_eligible, has_term, normalize
from therapy_evidence import FACTS

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--questions", type=Path, default=ROOT / "public/data/therapy_questions.json")
    parser.add_argument("--stats", type=Path, default=ROOT / "public/data/owl_stats.json")
    parser.add_argument("--output", type=Path, default=ROOT / "work/therapy-stat-approved.json")
    args = parser.parse_args()

    questions = json.loads(args.questions.read_text())
    existing = json.loads(args.stats.read_text())
    by_modality = defaultdict(list)
    for fact in FACTS:
        for modality in fact["modalities"]:
            by_modality[modality].append(fact)

    approved = []
    counts = Counter()
    for q in questions:
        qid = f"{q['year']}-{q['q_index']}"
        if qid in existing:
            continue
        modality = (q.get("quizapine") or {}).get("modality") or ""
        facts = by_modality.get(modality) or []
        surface = normalize(" ".join([
            q.get("stem") or "", q.get("answer_text") or "",
            (q.get("quizapine") or {}).get("topic") or "",
        ]))
        anchored = [fact for fact in facts if not fact.get("anchors") or any(has_term(surface, a) for a in fact["anchors"])]
        if not anchored:
            continue
        index = int(hashlib.sha1(qid.encode()).hexdigest(), 16) % len(anchored)
        fact = anchored[index]
        pmid = fact["source_url"].rstrip("/").split("/")[-1]
        row = {
            "stat_id": f"pmid-{pmid}",
            "sentence": fact["sentence"],
            "source_label": fact["source_label"],
            "source_url": fact["source_url"],
            "source_year": fact["source_year"],
            "audio_path": f"owl/{qid}/v1.mp3",
            "source_title": fact["id"],
            "review": "therapy-modality-check-v1",
        }
        ok, reason = assignment_eligible(q, row, {})
        if not ok:
            raise ValueError(f"therapy evidence failed final eligibility: {qid} {fact['id']} {reason}")
        approved.append({"qid": qid, "bank": "Therapy", "fact_id": fact["id"], **row})
        counts[modality] += 1

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(approved, ensure_ascii=False, indent=2) + "\n")
    print(f"approved {len(approved)} therapy modality facts: {dict(counts)} -> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
