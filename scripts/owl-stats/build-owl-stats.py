#!/usr/bin/env python3
"""Map every PRITE question to one verified owl statistic.

The number always comes from canonical.py. This script only chooses the best
matching fact and writes a unique spoken sentence plus the source URL.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

from canonical import STATS

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_BANK = ROOT / "extraction/output/questions_all.json"
DEFAULT_OUT = ROOT / "public/data/owl_stats.json"

# Too generic to prove the stat is about THIS item.
ANCHOR_STOP = {
    "prevalence", "epidemiology", "population", "community", "severe", "disability",
    "women", "female", "men", "gender", "sex", "boys", "girls",
    "adolescent", "teenager", "youth", "pediatric", "child", "school",
    "impairment", "function", "lifetime", "memory", "neurocognitive",
    "confused", "inattention", "attention", "elderly", "mortality",
    "duration", "defense", "developmental", "worldwide", "global", "who",
    "18", "25", "65", "leading cause", "death certificate",
    # Sibling-polluted or overly common tokens — score them, do not grant eligibility.
    "trauma", "traumatic", "personality", "substance-use", "substance",
    "sleep", "nightmare", "psychosis", "psychotic",
    "falls", "stroke", "amnesia", "neglect", "anxious",
}

# Extractor tags often list every sibling in a family (e.g. rls on an RBD item).
# A specific fact may use them as a weak bonus, never as proof of relevance.
GENERIC_TAGS = {
    "substance-use", "personality-disorder", "insomnia", "sleep-apnea",
    "rls", "parasomnia", "psychosis", "dementia",
}


def question_id(q: dict) -> str:
    return f"{q['year']}-{q['q_index']}"


def norm(text: str) -> str:
    return re.sub(r"[^a-z0-9+]+", " ", (text or "").lower()).strip()


def has_term(hay: str, term: str) -> bool:
    """Whole-token match so 'ect' does not hit 'correct' or 'expected'."""
    term = norm(term)
    if not term:
        return False
    if " " in term:
        return term in hay
    return f" {term} " in f" {hay} "


def surface_text(q: dict) -> str:
    """What the learner actually sees — stem and answer, never extractor tags."""
    extra = " ".join([
        ((q.get("quizapine") or {}).get("topic") or ""),
        ((q.get("quizapine") or {}).get("modality") or ""),
        ((q.get("kaufman") or {}).get("chapter") or ""),
        q.get("prite_label") or "",
    ])
    return norm(" ".join([q.get("stem") or "", q.get("answer_text") or "", extra]))


def tag_text(q: dict) -> str:
    """Structured tags only. Useful as a weak score bonus, not as eligibility."""
    tags = q.get("tags") or {}
    return norm(" ".join([
        " ".join(tags.get("diagnosis") or []),
        " ".join(tags.get("medication") or []),
        " ".join(tags.get("psychotherapy") or []),
        " ".join(tags.get("neuro") or []),
    ]))


def content_text(q: dict) -> str:
    """Stem, answer, and structured clinical tags only — never the topic label."""
    return norm(" ".join([surface_text(q), tag_text(q)]))


def anchors_for(stat: dict) -> list[str]:
    if stat.get("anchors"):
        return [a for a in stat["anchors"] if norm(a)]
    out = []
    for group in (stat.get("diagnoses") or [], stat.get("medications") or [], stat.get("keywords") or []):
        for term in group:
            t = norm(term)
            if t and t not in ANCHOR_STOP:
                out.append(term)
    return out


def content_hits(stat: dict, content: str, q: dict) -> list[str]:
    """Hits that prove the fact is about this item — stem/answer only."""
    surface = surface_text(q)
    hits = []
    for d in stat.get("diagnoses") or []:
        slug = norm(d)
        if slug in GENERIC_TAGS:
            continue
        if has_term(surface, d) or has_term(surface, d.replace("-", " ")):
            hits.append(f"dx:{d}")
    for m in stat.get("medications") or []:
        if has_term(surface, m) or has_term(surface, m.replace("-", " ")):
            hits.append(f"med:{m}")
    for a in anchors_for(stat):
        if norm(a) in ANCHOR_STOP:
            continue
        if has_term(surface, a):
            hits.append(f"kw:{a}")
    return hits


def spoils(stat: dict, q: dict) -> bool:
    answer = norm(q.get("answer_text") or "")
    if not answer:
        return False
    for token in stat.get("number_tokens") or []:
        t = norm(str(token))
        if t and t in answer:
            return True
    return False


def eligible(stat: dict, content: str, q: dict) -> bool:
    """Specific stats need a content hit. Broad stats are fallbacks only."""
    if spoils(stat, q):
        return False
    if stat.get("broad"):
        return True
    return bool(content_hits(stat, content, q))


def score(stat: dict, q: dict, content: str) -> int:
    if not eligible(stat, content, q):
        return -10_000
    tags = q.get("tags") or {}
    dx = {norm(x) for x in (tags.get("diagnosis") or [])}
    meds = {norm(x) for x in (tags.get("medication") or [])}
    topics = {str(x) for x in (tags.get("topics") or [])}
    cat = q.get("prite_category") or ""
    stem = norm(q.get("stem") or "")
    answer = norm(q.get("answer_text") or "")
    surface = surface_text(q)
    n = 0
    for d in stat.get("diagnoses") or []:
        if has_term(surface, d) or has_term(surface, d.replace("-", " ")):
            n += 50
        elif norm(d) in dx and norm(d) not in GENERIC_TAGS:
            n += 8
    for m in stat.get("medications") or []:
        if has_term(surface, m) or has_term(surface, m.replace("-", " ")):
            n += 46
        elif norm(m) in meds:
            n += 8
    for t in stat.get("topics") or []:
        if t in topics:
            n += 4
    if cat and cat in (stat.get("categories") or []):
        n += 2
    for kw in stat.get("keywords") or []:
        if not norm(kw):
            continue
        weak = norm(kw) in ANCHOR_STOP
        if has_term(answer, kw):
            n += 36 if " " in norm(kw) else 28
        elif has_term(stem, kw):
            n += (20 if " " in norm(kw) else 14) if weak else (28 if " " in norm(kw) else 20)
        elif has_term(content, kw) and not weak:
            n += 4
    if stat.get("broad") and not content_hits(stat, content, q):
        n -= 30
    return n


def speak(stat: dict, q: dict) -> str:
    sentence = re.sub(r"\s+", " ", stat["core"]).strip().rstrip(".")
    if sentence:
        sentence = sentence[0].upper() + sentence[1:] + "."
    return sentence


# A lone weak tag is not enough; require a real content score.
MIN_SCORE = 20


def pick(q: dict, used_recent: list[str]) -> tuple[dict, int, list[str]]:
    content = content_text(q)
    qid = question_id(q)
    ranked = sorted(
        ((score(stat, q, content), stat) for stat in STATS),
        key=lambda pair: (
            -pair[0],
            hashlib.sha1(f"{qid}:{pair[1]['id']}".encode()).hexdigest(),
        ),
    )
    for points, stat in ranked:
        if stat.get("broad") or points < MIN_SCORE:
            continue
        if stat["id"] not in used_recent:
            return stat, points, content_hits(stat, content, q)
    for points, stat in ranked:
        if not stat.get("broad") and points >= MIN_SCORE:
            return stat, points, content_hits(stat, content, q)
    return None, -1, []


def build(bank_path: Path) -> dict:
    questions = json.loads(bank_path.read_text())
    by_year: dict[str, list[str]] = {}
    out: dict[str, dict] = {}
    assigned = Counter()
    fallbacks = 0
    for q in questions:
        qid = question_id(q)
        recent = by_year.setdefault(str(q["year"]), [])
        stat, points, hits = pick(q, recent[-8:])
        if not stat:
            continue
        recent.append(stat["id"])
        assigned[stat["id"]] += 1
        out[qid] = {
            "stat_id": stat["id"],
            "sentence": speak(stat, q),
            "source_label": stat["source_label"],
            "source_url": stat["source_url"],
            "source_year": stat.get("year"),
            "audio_path": f"owl/{qid}/v1.mp3",
        }
    return {
        "count": len(out),
        "canonical": len(STATS),
        "coverage": assigned.most_common(),
        "fallbacks": fallbacks,
        "stats": out,
    }


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--input", type=Path, default=DEFAULT_BANK)
    p.add_argument("--output", type=Path, default=DEFAULT_OUT)
    args = p.parse_args()
    bundle = build(args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    # Client only needs the per-question map; keep coverage in a sibling report.
    client = {k: v for k, v in bundle["stats"].items()}
    args.output.write_text(json.dumps(client, ensure_ascii=False, separators=(",", ":")))
    report = ROOT / "extraction/output/owl_stats.report.json"
    report.write_text(
        json.dumps(
            {
                "count": bundle["count"],
                "canonical": bundle["canonical"],
                "top_stats": bundle["coverage"][:25],
                "unused": [s["id"] for s in STATS if s["id"] not in {i for i, _ in bundle["coverage"]}],
                "fallbacks": bundle["fallbacks"],
            },
            indent=2,
        )
        + "\n"
    )
    print(f"wrote {bundle['count']} owl stats -> {args.output}")
    print(f"canonical facts used: {len(bundle['coverage'])} / {bundle['canonical']}")
    print(f"general fallbacks (no content hit): {bundle['fallbacks']}")
    print("top assignments:")
    for stat_id, n in bundle["coverage"][:12]:
        print(f"  {n:4d}  {stat_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
