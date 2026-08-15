#!/usr/bin/env python3
"""Map every PRITE question to one sourced psychodynamic perspective."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path

from canonical import PEARLS

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_BANK = ROOT / "extraction/output/questions_all.json"
DEFAULT_OUT = ROOT / "public/data/dyn_perspectives.json"

TEMPLATES = [
    "A psychodynamic listen to this {year} item: {core}.",
    "From the chair, on this {year} question: {core}.",
    "An older formulation for this {year} stem: {core}.",
    "If we sit with this {year} vignette a moment: {core}.",
    "A dynamic pearl beside this {year} case: {core}.",
    "What the relationship might be saying in {year}: {core}.",
    "A classical reading of this {year} item: {core}.",
    "Holding this {year} question in mind: {core}.",
]

HOOK_TEMPLATES = [
    "On this {year} {hook} item, a dynamic listen hears: {core}.",
    "For this {year} {hook} question: {core}.",
    "Sitting with this {year} {hook} stem: {core}.",
    "A {year} {hook} formulation: {core}.",
    "This {year} {hook} vignette also has a deeper story: {core}.",
]


def question_id(q: dict) -> str:
    return f"{q['year']}-{q['q_index']}"


def norm(text: str) -> str:
    return re.sub(r"[^a-z0-9+]+", " ", (text or "").lower()).strip()


def has_term(hay: str, term: str) -> bool:
    term = norm(term)
    if not term:
        return False
    if " " in term:
        return term in hay
    return f" {term} " in f" {hay} "


def hook_for(q: dict) -> str | None:
    tags = q.get("tags") or {}
    pt = (tags.get("psychotherapy") or [])[:1]
    dx = (tags.get("diagnosis") or [])[:1]
    if pt:
        return str(pt[0]).replace("-", " ")
    if dx:
        return str(dx[0]).replace("-", " ")
    topics = tags.get("topics") or []
    if topics:
        t = str(topics[0])
        t = re.split(r"[\(/,]", t)[0].strip()
        if 3 < len(t) < 42:
            return t.lower()
    label = (q.get("prite_label") or "").split("&")[0].strip()
    if 3 < len(label) < 42:
        return label.lower()
    return None


def surface_text(q: dict) -> str:
    return norm(" ".join([q.get("stem") or "", q.get("answer_text") or ""]))


def content_text(q: dict) -> str:
    tags = q.get("tags") or {}
    bits = [
        q.get("stem") or "",
        q.get("answer_text") or "",
        " ".join(tags.get("diagnosis") or []),
        " ".join(tags.get("medication") or []),
        " ".join(tags.get("psychotherapy") or []),
        " ".join(tags.get("neuro") or []),
    ]
    return norm(" ".join(bits))


GENERIC_TAGS = {
    "substance-use", "personality-disorder", "insomnia", "sleep-apnea",
    "rls", "parasomnia", "psychosis", "dementia",
}

# Therapy-modality slugs that match too many stems ("family members", "support group").
WEAK_PT = {
    "psychodynamic", "family", "group", "supportive", "behavioral", "motivational",
}

WEAK_KW = {
    "trauma", "traumatic", "identity", "control", "holding", "late", "avoids",
    "humor", "repetition", "dream", "frame", "boundary", "fee",
}


def anchors_for(pearl: dict) -> list[str]:
    if pearl.get("anchors"):
        return [a for a in pearl["anchors"] if norm(a)]
    out = []
    for term in (pearl.get("keywords") or []):
        if norm(term) and norm(term) not in WEAK_KW:
            out.append(term)
    for d in pearl.get("diagnoses") or []:
        if norm(d) not in GENERIC_TAGS:
            out.append(d)
            out.append(d.replace("-", " "))
    return out


def content_hits(pearl: dict, content: str, q: dict) -> list[str]:
    """Specific pearls must appear in the stem or answer, not just extractor tags."""
    surface = surface_text(q)
    hits = []
    for p in pearl.get("psychotherapy") or []:
        if norm(p) in WEAK_PT:
            continue
        if has_term(surface, p) or has_term(surface, p.replace("-", " ")):
            hits.append(f"pt:{p}")
    for d in pearl.get("diagnoses") or []:
        if norm(d) in GENERIC_TAGS:
            continue
        if has_term(surface, d) or has_term(surface, d.replace("-", " ")):
            hits.append(f"dx:{d}")
    for a in anchors_for(pearl):
        if norm(a) in WEAK_KW:
            continue
        if has_term(surface, a):
            hits.append(f"kw:{a}")
    return hits


MIN_SCORE = 20


def score(pearl: dict, q: dict, content: str) -> int:
    # Category fallbacks are scored only when used as fallbacks, not as specifics.
    if pearl.get("fallback_for") and not content_hits(pearl, content, q):
        return -10_000
    hits = content_hits(pearl, content, q)
    if not hits and not pearl.get("fallback_for"):
        return -10_000
    tags = q.get("tags") or {}
    dx = {norm(x) for x in (tags.get("diagnosis") or [])}
    pt = {norm(x) for x in (tags.get("psychotherapy") or [])}
    topics = {str(x) for x in (tags.get("topics") or [])}
    cat = q.get("prite_category") or ""
    stem = norm(q.get("stem") or "")
    answer = norm(q.get("answer_text") or "")
    surface = surface_text(q)
    n = 0
    for p in pearl.get("psychotherapy") or []:
        if norm(p) in WEAK_PT:
            continue
        if has_term(surface, p) or has_term(surface, p.replace("-", " ")):
            n += 40
        elif norm(p) in pt:
            n += 6
    for d in pearl.get("diagnoses") or []:
        if has_term(surface, d) or has_term(surface, d.replace("-", " ")):
            n += 50
        elif norm(d) in dx and norm(d) not in GENERIC_TAGS:
            n += 8
    for t in pearl.get("topics") or []:
        if t in topics:
            n += 4
    if cat and cat in (pearl.get("categories") or []):
        n += 2
    for kw in pearl.get("keywords") or []:
        if not norm(kw):
            continue
        weak = norm(kw) in WEAK_KW
        if has_term(answer, kw):
            n += 48 if " " in norm(kw) else 42
        elif has_term(stem, kw):
            n += (16 if " " in norm(kw) else 10) if weak else (28 if " " in norm(kw) else 20)
        elif has_term(content, kw) and not weak:
            n += 4
    return n


def speak(pearl: dict, q: dict) -> str:
    sentence = re.sub(r"\s+", " ", pearl["core"]).strip().rstrip(".")
    if sentence:
        sentence = sentence[0].upper() + sentence[1:] + "."
    return sentence


def category_fallbacks(q: dict) -> list[dict]:
    cat = q.get("prite_category") or ""
    hits = [p for p in PEARLS if cat in (p.get("fallback_for") or [])]
    if hits:
        return hits
    return [p for p in PEARLS if "psychopathology" in (p.get("fallback_for") or [])] or PEARLS[:1]


def pick(q: dict, used_recent: list[str]) -> dict:
    content = content_text(q)
    qid = question_id(q)
    ranked = sorted(
        ((score(pearl, q, content), pearl) for pearl in PEARLS),
        key=lambda pair: (
            -pair[0],
            hashlib.sha1(f"{qid}:{pair[1]['id']}".encode()).hexdigest(),
        ),
    )
    # Prefer a specific take that is actually about this stem/answer.
    for points, pearl in ranked:
        if points < MIN_SCORE:
            continue
        if pearl["id"] not in used_recent:
            return pearl
    for points, pearl in ranked:
        if points >= MIN_SCORE:
            return pearl
    # Otherwise a category-true fallback, not a random process lecture.
    for pearl in category_fallbacks(q):
        if pearl["id"] not in used_recent:
            return pearl
    return category_fallbacks(q)[0]


def build(bank_path: Path) -> dict:
    questions = json.loads(bank_path.read_text())
    by_year: dict[str, list[str]] = {}
    out: dict[str, dict] = {}
    assigned = Counter()
    for q in questions:
        qid = question_id(q)
        recent = by_year.setdefault(str(q["year"]), [])
        pearl = pick(q, recent[-8:])
        recent.append(pearl["id"])
        assigned[pearl["id"]] += 1
        out[qid] = {
            "pearl_id": pearl["id"],
            "sentence": speak(pearl, q),
            "audio_path": f"dyn/{qid}/v1.mp3",
        }
    return {
        "count": len(out),
        "canonical": len(PEARLS),
        "coverage": assigned.most_common(),
        "stats": out,
    }


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--input", type=Path, default=DEFAULT_BANK)
    p.add_argument("--output", type=Path, default=DEFAULT_OUT)
    args = p.parse_args()
    bundle = build(args.input)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(bundle["stats"], ensure_ascii=False, separators=(",", ":")))
    report = ROOT / "extraction/output/dyn_perspectives.report.json"
    report.write_text(
        json.dumps(
            {
                "count": bundle["count"],
                "canonical": bundle["canonical"],
                "top": bundle["coverage"][:25],
                "unused": [s["id"] for s in PEARLS if s["id"] not in {i for i, _ in bundle["coverage"]}],
            },
            indent=2,
        )
        + "\n"
    )
    print(f"wrote {bundle['count']} dyn perspectives -> {args.output}")
    print(f"canonical used: {len(bundle['coverage'])} / {bundle['canonical']}")
    for pearl_id, n in bundle["coverage"][:12]:
        print(f"  {n:4d}  {pearl_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
