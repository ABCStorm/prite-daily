#!/usr/bin/env python3
"""Copy Quizapine's psychotherapy questions into the PRITE Daily bank shape.

Source is the assembled Quizapine bank (original items, not a textbook extract).
We keep every deck that is actually psychotherapy / psychosocial intervention
and drop the psychopharm / lifestyle / forensic near-matches.

Usage:
  python3 scripts/quizapine/extract_therapy.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = Path("/Users/andrewcorrell/Claude/Projects/Quizapine/public/data/questions.json")
OUT = ROOT / "public" / "data" / "therapy_questions.json"


def is_therapy(q: dict) -> bool:
    deck = (q.get("deck") or "").strip().lower()
    return deck.startswith("psychotherapy:") or deck.startswith("psychosocial interventions")


def modality_of(deck: str) -> str:
    if deck.lower().startswith("psychotherapy:"):
        rest = deck.split(":", 1)[1].strip()
        return rest.split("·", 1)[0].strip() or "Psychotherapy"
    if deck.lower().startswith("psychosocial"):
        return "Psychosocial"
    return "Psychotherapy"


def first_sentence(text: str, max_len: int = 280) -> str:
    t = " ".join((text or "").split()).strip()
    if not t:
        return ""
    for i, ch in enumerate(t):
        if ch in ".!?" and i > 40:
            t = t[: i + 1]
            break
    return t if len(t) <= max_len else t[: max_len - 1].rstrip() + "…"


def teaching_point(expl: str) -> str:
    low = expl.lower()
    i = low.rfind("teaching point:")
    if i < 0:
        return ""
    return " ".join(expl[i + len("Teaching point:") :].split()).strip()


def slug(s: str) -> str:
    out = []
    for ch in s.lower():
        out.append(ch if ch.isalnum() else "-")
    return "".join(out).strip("-") or "topic"


def slim(q: dict) -> dict:
    deck = q.get("deck") or "Psychotherapy"
    letter = q.get("answer_letter")
    letters = q.get("answer_letters") or ([letter] if letter else [])
    modality = modality_of(deck)
    topic = q.get("topic") or q.get("year") or modality
    expl = q.get("explanation_text") or ""
    point = teaching_point(expl)
    stem1 = first_sentence(q.get("stem") or "")
    clinical = (
        f"In clinic this shows up as: {stem1} What you actually do: {point}"
        if point else stem1
    )
    sources = q.get("sources") or []
    context_bits = [
        f"This item drills {topic}." if topic else "",
        f"The durable idea: {point}" if point else first_sentence(expl, 320),
        f"Standard references: {'; '.join(sources[:2])}." if sources else "",
    ]
    return {
        "deck": deck,
        "year": q["year"],
        "q_index": q["q_index"],
        "slide_number": 0,
        "stem": q["stem"],
        "options": q["options"],
        "answer_letter": letter,
        "answer_letters": letters,
        "multi_select": bool(q.get("multi_select")),
        "answer_text": q.get("answer_text") or "",
        "answer_source": q.get("answer_source") or "letter",
        "answer_raw": q.get("answer_raw") or "",
        "explanation_text": expl,
        "figure_images": [],
        "explanation_images": [],
        "flags": [],
        "prite_category": slug(modality),
        "prite_label": modality,
        "clinical_application": clinical,
        "video_query": f"{modality} {topic} psychotherapy psychiatry",
        "context": " ".join(b for b in context_bits if b),
        "tags": {
            "diagnosis": [],
            "medication": [],
            "psychotherapy": [modality],
            "neuro": [],
            "historical": [],
            "setting": None,
            "topics": [q["year"], modality],
        },
        "quizapine": {
            "modality": modality,
            "topic": topic,
            "difficulty": q.get("difficulty") or "",
            "sources": sources,
        },
    }


def main() -> int:
    bank = json.loads(SRC.read_text())
    out = [slim(q) for q in bank if is_therapy(q)]
    out.sort(key=lambda q: (q["quizapine"]["modality"], q["year"], q["q_index"]))
    ids = [f"{q['year']}-{q['q_index']}" for q in out]
    if len(ids) != len(set(ids)):
        raise SystemExit("duplicate year-q_index ids in therapy subset")
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    mods: dict[str, int] = {}
    for q in out:
        mods[q["quizapine"]["modality"]] = mods.get(q["quizapine"]["modality"], 0) + 1
    print(f"wrote {len(out)} questions -> {OUT}")
    for name, n in sorted(mods.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  {n:4}  {name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
