#!/usr/bin/env python3
"""Build the CPRITE 2023 practice bank and merge it with CPRITE 2024.

Sources:
  Q1–200 parsed from ~/Downloads/CPRITE 2023 Q1-100.docx and Q101-200.docx
  (pandoc markdown → scripts/cprite/_parsed_2023.json).
  Topics, explanations, and in-practice vignettes in meta_2023_*.py / clinical_2023_*.py.

IDs use year "CPRITE 2023" so they never collide with PRITE 2023-N or CPRITE 2024-N.
Output: public/data/cprite_questions.json (2023 then existing 2024).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from clinical_2023_001_050 import CLINICAL as CLINICAL_001
from clinical_2023_051_100 import CLINICAL as CLINICAL_051
from clinical_2023_101_150 import CLINICAL as CLINICAL_101
from clinical_2023_151_200 import CLINICAL as CLINICAL_151
from meta_2023_001_050 import META as META_001
from meta_2023_051_100 import META as META_051
from meta_2023_101_150 import META as META_101
from meta_2023_151_200 import META as META_151

ROOT = Path(__file__).resolve().parents[2]
PARSED = Path(__file__).resolve().parent / "_parsed_2023.json"
OUT = ROOT / "public" / "data" / "cprite_questions.json"
Q97_FIG = "images/cprite/2023_q097_forest.png"

TOPICS = {
    "Development",
    "Psychopathology",
    "Psychotherapy",
    "Psychopharmacology",
    "Neuroscience",
    "Ethics & Forensics",
    "Systems & Prevention",
    "Assessment",
    "Research Methods",
    "Consultation & Schools",
}

META: dict[int, tuple[str, str]] = {}
for part in (META_001, META_051, META_101, META_151):
    META.update(part)

CLINICAL: dict[int, str] = {}
for part in (CLINICAL_001, CLINICAL_051, CLINICAL_101, CLINICAL_151):
    CLINICAL.update(part)


def clean(s: str) -> str:
    s = (s or "").replace("\\'", "'").replace('\\"', '"')
    s = s.replace("\u2019", "'").replace("\u2018", "'")
    s = s.replace("\u201c", '"').replace("\u201d", '"')
    return re.sub(r"\s+", " ", s).strip()


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "topic"


def record(q: dict, topic: str, expl: str, clinical: str, source: str) -> dict:
    letters = list(q["answers"])
    chosen = [o for o in q["options"] if o["letter"] in letters]
    ans_text = " / ".join(o["text"] for o in chosen)
    multi = bool(q.get("multi")) or len(letters) > 1
    figs = [Q97_FIG] if q.get("has_img") or q["n"] == 97 else []
    return {
        "deck": "CPRITE 2023",
        "year": "CPRITE 2023",
        "q_index": q["n"],
        "slide_number": 0,
        "stem": q["stem"],
        "options": q["options"],
        "answer_letter": letters[0],
        "answer_letters": letters,
        "multi_select": multi,
        "answer_text": ans_text,
        "answer_source": "letter" if not multi else "multi",
        "answer_raw": f"{letters[0]}. {chosen[0]['text']}" if not multi else "".join(letters),
        "explanation_text": expl,
        "figure_images": figs,
        "explanation_images": [],
        "flags": [],
        "prite_category": slug(topic),
        "prite_label": topic,
        "clinical_application": clinical,
        "video_query": f"{topic} {ans_text} child psychiatry",
        "tags": {
            "diagnosis": [],
            "medication": [],
            "psychotherapy": [],
            "neuro": [],
            "historical": [],
            "setting": None,
            "topics": [topic, "CPRITE 2023"],
        },
        "cprite": {
            "exam": "CPRITE",
            "exam_year": 2023,
            "topic": topic,
            "source": source,
        },
    }


def validate_extras() -> None:
    missing_meta = [n for n in range(1, 201) if n not in META]
    missing_clin = [n for n in range(1, 201) if n not in CLINICAL]
    extra_meta = sorted(n for n in META if n < 1 or n > 200)
    extra_clin = sorted(n for n in CLINICAL if n < 1 or n > 200)
    if missing_meta or missing_clin or extra_meta or extra_clin:
        raise SystemExit(
            f"META/CLINICAL coverage error: missing_meta={missing_meta} "
            f"missing_clin={missing_clin} extra_meta={extra_meta} extra_clin={extra_clin}"
        )
    bad_topics = sorted({t for t, _ in META.values() if t not in TOPICS})
    if bad_topics:
        raise SystemExit(f"Unknown topics: {bad_topics}")
    for n, (_, expl) in META.items():
        if "Teaching point:" not in expl:
            raise SystemExit(f"Q{n} explanation missing Teaching point:")
        if not clean(expl):
            raise SystemExit(f"Q{n} empty explanation")
    for n, clin in CLINICAL.items():
        if "Bottom line:" not in clin:
            raise SystemExit(f"Q{n} clinical missing Bottom line:")
        if not clean(clin):
            raise SystemExit(f"Q{n} empty clinical")


def build_2023() -> list[dict]:
    parsed = json.loads(PARSED.read_text())
    if len(parsed) != 200 or parsed[0]["n"] != 1 or parsed[-1]["n"] != 200:
        raise SystemExit(f"Expected 200 parsed items Q1–200, got {len(parsed)}")
    out = []
    for q in parsed:
        n = q["n"]
        topic, expl = META[n]
        source = (
            "CPRITE 2023 practice quiz Q1–100"
            if n <= 100
            else "CPRITE 2023 practice quiz Q101–200"
        )
        out.append(record(q, topic, clean(expl), clean(CLINICAL[n]), source))
    return out


def load_2024() -> list[dict]:
    if not OUT.exists():
        raise SystemExit(f"Need existing {OUT} with CPRITE 2024")
    existing = json.loads(OUT.read_text())
    y2024 = [q for q in existing if q.get("cprite", {}).get("exam_year") == 2024 or q.get("year") == "CPRITE 2024"]
    if len(y2024) != 200:
        raise SystemExit(f"Expected 200 existing CPRITE 2024 items, found {len(y2024)}")
    return y2024


def main() -> None:
    validate_extras()
    bank = build_2023() + load_2024()
    years = {(q["year"], q["q_index"]) for q in bank}
    if len(years) != len(bank):
        raise SystemExit("Duplicate year/q_index in combined bank")
    if len(bank) != 400:
        raise SystemExit(f"Expected 400 questions, got {len(bank)}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(bank, indent=2, ensure_ascii=False) + "\n")
    topics: dict[str, int] = {}
    by_year: dict[str, int] = {}
    multi = 0
    for q in bank:
        t = q["cprite"]["topic"]
        topics[t] = topics.get(t, 0) + 1
        by_year[q["year"]] = by_year.get(q["year"], 0) + 1
        if q["multi_select"]:
            multi += 1
    print(f"Wrote {len(bank)} questions ({multi} multi-select) → {OUT}")
    for y, n in sorted(by_year.items()):
        print(f"  {n:3}  {y}")
    for t, n in sorted(topics.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"  {n:3}  {t}")


if __name__ == "__main__":
    main()
