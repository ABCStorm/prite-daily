#!/usr/bin/env python3
"""Write open-ended prompt + teaching-point JSONL for CPRITE 2023 audio drills.

Merges 2023 rows into the existing CPRITE jsonl files (2024 rows are kept).
Prompts are open-ended (no choices). Teaching lines are the clinical Bottom line,
spoken for TTS.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

import sys

ROOT = Path(__file__).resolve().parents[2]
BANK = ROOT / "public" / "data" / "cprite_questions.json"
OUT_TEACH = ROOT / "extraction" / "output" / "cprite_audio_scripts.jsonl"
OUT_PROMPT = ROOT / "extraction" / "output" / "cprite_audio_prompts.jsonl"

sys.path.insert(0, str(Path(__file__).resolve().parent))
from audio_prompts_2023_001_100 import PROMPTS as PROMPTS_001
from audio_prompts_2023_101_200 import PROMPTS as PROMPTS_101

PROMPTS: dict[int, str] = {**PROMPTS_001, **PROMPTS_101}

EXPAND = [
    (r"\bNNT\b", "number needed to treat"),
    (r"\bARR\b", "absolute risk reduction"),
    (r"\bNNH\b", "number needed to harm"),
    (r"\bPSG\b", "polysomnography"),
    (r"\bEMG\b", "electromyography"),
    (r"\bADOS\b", "the autism diagnostic observation schedule"),
    (r"\bPMDD\b", "premenstrual dysphoric disorder"),
    (r"\bGnRH\b", "gonadotropin-releasing hormone"),
    (r"\bIEP\b", "individualized education program"),
    (r"\bCSF\b", "cerebrospinal fluid"),
    (r"\bEBV\b", "Epstein-Barr virus"),
    (r"\bPHQ-9\b", "P H Q 9"),
    (r"\bCBT\b", "cognitive behavioral therapy"),
    (r"\bIPT\b", "interpersonal therapy"),
    (r"\bODD\b", "oppositional defiant disorder"),
    (r"\bADHD\b", "A D H D"),
    (r"\bPTSD\b", "P T S D"),
    (r"\bOCD\b", "obsessive-compulsive disorder"),
    (r"\bBDD\b", "body dysmorphic disorder"),
    (r"\bFDA\b", "F D A"),
    (r"\bMRI\b", "M R I"),
    (r"\bCT\b", "C T"),
    (r"\bEEG\b", "E E G"),
    (r"\bAIMS\b", "A I M S"),
    (r"\bAACAP\b", "A A C A P"),
    (r"\bIDEA\b", "I D E A"),
    (r"\bMSLT\b", "multiple sleep latency test"),
    (r"\bOSA\b", "obstructive sleep apnea"),
    (r"\bASD\b", "autism spectrum disorder"),
    (r"\bCYP2D6\b", "C Y P 2 D 6"),
    (r"\bCYP2C19\b", "C Y P 2 C 19"),
]


def speech(text: str) -> str:
    t = text.replace("→", " points to ").replace("=", " is ")
    t = t.replace(" / ", ", ").replace("–", " to ").replace("—", ", ")
    t = t.replace("%", " percent").replace("½", " and a half")
    t = t.replace("NR3C1", "N R 3 C 1").replace("FKBP5", "F K B P 5")
    t = t.replace("CYP2D6", "C Y P 2 D 6").replace("CYP2C19", "C Y P 2 C 19")
    for pat, rep in EXPAND:
        t = re.sub(pat, rep, t)
    t = re.sub(r"\s+", " ", t).strip()
    if t and t[-1] not in ".!?":
        t += "."
    return t


def wc(s: str) -> int:
    return len(s.split())


def teaching_for(q: dict) -> str:
    m = re.search(r"Bottom line:\s*(.*)$", q.get("clinical_application") or "", re.I)
    raw = m.group(1).strip() if m else (q.get("explanation_text") or "").split(".")[0] + "."
    t = speech(raw)
    # Keep TTS short.
    if wc(t) > 45:
        parts = re.split(r"(?<=[.!?])\s+", t)
        t = parts[0]
        if not re.search(r"[.!?]$", t):
            t += "."
    return t


def qid(q: dict) -> str:
    return f"{q['year']}-{q['q_index']}"


def load_jsonl(path: Path) -> dict[str, dict]:
    rows: dict[str, dict] = {}
    if not path.exists():
        return rows
    for line in path.read_text().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        rows[row["question_id"]] = row
    return rows


def main() -> None:
    bank = [q for q in json.loads(BANK.read_text()) if q.get("year") == "CPRITE 2023"]
    if len(bank) != 200:
        raise SystemExit(f"Expected 200 CPRITE 2023 items, got {len(bank)}")
    missing = [q["q_index"] for q in bank if q["q_index"] not in PROMPTS]
    if missing:
        raise SystemExit(f"Missing spoken prompts for {missing}")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    problems = []
    new_teach = {}
    new_prompt = {}
    for q in bank:
        teach = teaching_for(q)
        prompt = speech(PROMPTS[q["q_index"]])
        if not prompt.endswith("?"):
            prompt = prompt.rstrip(".!") + "?"
        if wc(teach) > 45:
            problems.append(f"Q{q['q_index']} teaching {wc(teach)} words: {teach}")
        if wc(prompt) > 65:
            problems.append(f"Q{q['q_index']} prompt {wc(prompt)} words: {prompt}")
        if not re.search(r"[.!?]$", teach):
            problems.append(f"Q{q['q_index']} teaching punctuation: {teach}")
        if re.search(r"which of the following|option [a-e]|choices?:", prompt, re.I):
            problems.append(f"Q{q['q_index']} prompt still MC: {prompt}")
        new_teach[qid(q)] = {"question_id": qid(q), "script": teach, "generated_at": now, "engine": "grok"}
        new_prompt[qid(q)] = {"question_id": qid(q), "prompt": prompt, "generated_at": now, "engine": "grok", "kind": "prompt"}
    if problems:
        raise SystemExit("\n".join(problems[:30]) + f"\n({len(problems)} problems)")

    teach_all = load_jsonl(OUT_TEACH)
    prompt_all = load_jsonl(OUT_PROMPT)
    teach_all.update(new_teach)
    prompt_all.update(new_prompt)

    def dump(path: Path, rows: dict[str, dict]) -> None:
        ordered = sorted(rows.values(), key=lambda r: (r["question_id"]))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in ordered))

    dump(OUT_TEACH, teach_all)
    dump(OUT_PROMPT, prompt_all)
    print(f"Wrote {len(teach_all)} teaching ({len(new_teach)} 2023) → {OUT_TEACH}")
    print(f"Wrote {len(prompt_all)} prompts ({len(new_prompt)} 2023) → {OUT_PROMPT}")
    print("sample teach", new_teach["CPRITE 2023-1"]["script"])
    print("sample prompt", new_prompt["CPRITE 2023-1"]["prompt"])
    print("Q200 teach", new_teach["CPRITE 2023-200"]["script"])
    print("Q200 prompt", new_prompt["CPRITE 2023-200"]["prompt"])


if __name__ == "__main__":
    main()
