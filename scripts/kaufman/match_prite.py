#!/usr/bin/env python3
"""Match PRITE questions to Kaufman 9e chapters/chunks via BM25.

Only neurology-relevant PRITE items get a citation. A hit requires a
minimum BM25 score so psychotherapy/ethics items stay unlinked.

Writes:
  reference/kaufman/matches.json
  public/data/kaufman_refs.json (+ .gz)
  reference/kaufman/pages_to_render.txt
"""
from __future__ import annotations

import gzip
import json
import re
from pathlib import Path

from rank_bm25 import BM25Okapi

ROOT = Path(__file__).resolve().parents[2]
CHUNKS = ROOT / "reference" / "kaufman" / "book_chunks.json"
CHAPTERS = ROOT / "reference" / "kaufman" / "chapter_index.json"
QUESTIONS = ROOT / "extraction" / "output" / "questions_all.json"
OUT_MATCHES = ROOT / "reference" / "kaufman" / "matches.json"
OUT_CLIENT = ROOT / "public" / "data" / "kaufman_refs.json"
OUT_GZ = ROOT / "public" / "data" / "kaufman_refs.json.gz"
OUT_PAGES = ROOT / "reference" / "kaufman" / "pages_to_render.txt"

TOKEN = re.compile(r"[a-z0-9][a-z0-9\-]{2,}")
WINDOW_RADIUS = 4  # ± pages around the best chunk, clamped to chapter
MIN_SCORE = 4.5

# Extra aliases so PRITE tags land in the right chapter even if wording differs.
CHAPTER_ALIASES: dict[int | str, list[str]] = {
    2: ["upper motor neuron", "lower motor neuron", "babinski", "hemiparesis", "spasticity"],
    3: ["psychogenic", "functional neurological", "hoover sign", "conversion"],
    4: ["cranial nerve", "optic nerve", "trigeminal", "bell palsy", "bell's palsy", "acoustic neuroma"],
    5: ["neuropathy", "guillain", "gbS", "peripheral nerve", "charcot marie", "ciguatera", "ciguatoxin", "barracuda"],
    6: ["myasthenia", "myopathy", "muscular dystrophy", "polymyositis", "lambert eaton"],
    7: ["dementia", "alzheimer", "delirium", "lewy body", "frontotemporal", "vascular dementia", "nph"],
    8: ["aphasia", "anosognosia", "broca", "wernicke", "conduction aphasia", "neglect"],
    9: ["migraine", "cluster headache", "tension headache", "pseudotumor", "idiopathic intracranial"],
    10: ["epilepsy", "seizure", "status epilepticus", "absence", "eeg", "valproate", "lamotrigine", "carbamazepine"],
    11: ["stroke", "tia", "ischemic", "hemorrhage", "subarachnoid", "mca", "wallenberg"],
    12: ["homonymous", "hemianopia", "papilledema", "optic neuritis", "argyll robertson"],
    13: ["cerebral palsy", "fragile x", "rett", "tuberous sclerosis", "nf1", "neurofibromatosis"],
    14: ["chronic pain", "neuropathic pain", "trigeminal neuralgia", "crps"],
    15: ["multiple sclerosis", "ms ", "optic neuritis", "oligoclonal", "nmo", "neuromyelitis"],
    16: ["erectile", "priapism", "sexual function"],
    17: ["narcolepsy", "cataplexy", "insomnia", "rem sleep", "sleep apnea", "restless legs"],
    18: ["parkinson", "huntington", "tardive", "dystonia", "chorea", "tourette", "tremor", "wilson", "nms", "akathisia"],
    19: ["brain tumor", "glioblastoma", "meningioma", "paraneoplastic", "metastasis"],
    20: ["lumbar puncture", "csf", "mri", "ct scan"],
    21: ["neurotransmitter", "dopamine", "serotonin", "acetylcholine", "gaba", "cocaine", "mdma"],
    22: ["traumatic brain", "concussion", "cte", "subdural"],
}


def qid(q: dict) -> str:
    return f"{q.get('year')}-{q.get('q_index')}"


def tokenize(s: str) -> list[str]:
    return TOKEN.findall((s or "").lower())


def is_neuro(q: dict) -> bool:
    tags = q.get("tags") or {}
    if tags.get("neuro"):
        return True
    cat = f"{q.get('prite_category') or ''} {q.get('prite_label') or ''}".lower()
    if "neuro" in cat:
        return True
    topics = " ".join(tags.get("topics") or []).lower()
    if "neuro" in topics:
        return True
    blob = " ".join([
        q.get("stem") or "",
        q.get("answer_text") or "",
        " ".join(tags.get("diagnosis") or []),
    ]).lower()
    needles = (
        "seizure", "epilep", "stroke", "migraine", "parkinson", "dementia",
        "delirium", "multiple sclerosis", "myasthenia", "neuropathy",
        "huntington", "tardive", "dystonia", "narcolepsy", "aphasia",
        "concussion", "meningitis", "encephalitis", "glioblastoma",
        "papilledema", "hemianop", "guillain", "nph", "lewy",
    )
    return any(n in blob for n in needles)


def blob_for(q: dict) -> str:
    tags = q.get("tags") or {}
    parts = [
        q.get("stem") or "",
        q.get("answer_text") or "",
        (q.get("explanation_text") or "")[:400],
    ]
    for k in ("diagnosis", "medication", "neuro", "topics"):
        for x in tags.get(k) or []:
            parts.append(str(x).replace("-", " "))
    return " ".join(parts)


def main() -> int:
    raw_chunks = json.loads(CHUNKS.read_text())
    chunks = []
    for c in raw_chunks:
        if c.get("chapter_num") in {"R", "I"} or str(c.get("chapter_num", "")).startswith("A"):
            continue
        text = c.get("text") or ""
        if len(re.findall(r"answer:", text, flags=re.I)) >= 2:
            continue
        chunks.append(c)
    chapters = json.loads(CHAPTERS.read_text())["chapters"]
    ch_by_num = {c["num"]: c for c in chapters}
    questions = json.loads(QUESTIONS.read_text())

    tokenized = [tokenize(c["text"]) for c in chunks]
    bm25 = BM25Okapi(tokenized)

    matches: dict[str, dict] = {}
    for q in questions:
        if not is_neuro(q):
            continue
        blob = blob_for(q)
        toks = tokenize(blob)
        if len(toks) < 4:
            continue
        scores = bm25.get_scores(toks)
        best_i = int(max(range(len(scores)), key=lambda i: scores[i]))
        score = float(scores[best_i])
        # alias bonus toward the matching chapter
        blob_l = blob.lower()
        alias_bonus = {}
        for num, aliases in CHAPTER_ALIASES.items():
            hit = sum(1 for a in aliases if a.lower() in blob_l)
            if hit:
                alias_bonus[num] = hit * 1.6
        if alias_bonus:
            # if BM25's chapter disagrees with a strong alias, prefer the
            # best-scoring chunk inside that chapter
            prefer = max(alias_bonus, key=alias_bonus.get)
            if alias_bonus[prefer] >= 1.6:
                ch_idxs = [i for i, c in enumerate(chunks) if c["chapter_num"] == prefer]
                if ch_idxs:
                    alt = max(ch_idxs, key=lambda i: scores[i])
                    if scores[alt] + alias_bonus[prefer] >= score:
                        best_i = alt
                        score = float(scores[alt]) + alias_bonus[prefer]
        if score < MIN_SCORE:
            continue
        chnk = chunks[best_i]
        ch = ch_by_num.get(chnk["chapter_num"])
        if not ch:
            continue
        if ch.get("num") in {"R", "I"} or str(ch.get("num", "")).startswith("A"):
            continue
        text_end = int(ch.get("text_page_end") or ch["pdf_page_end"])
        qa_start = ch.get("qa_page_start")
        if qa_start:
            text_end = min(text_end, int(qa_start) - 1)
        anchor = int(chnk["pdf_page_start"])
        if anchor > text_end:
            continue
        lo = max(int(ch["pdf_page_start"]), anchor - WINDOW_RADIUS)
        hi = min(text_end, anchor + WINDOW_RADIUS)
        if hi < lo:
            continue
        subsection = None
        for sec in ch.get("sections") or []:
            if int(sec["pdf_page_start"]) <= anchor <= int(sec["pdf_page_end"]):
                subsection = sec.get("title")
                break
        loc = f"Chapter {ch['num']}: {ch['title']}"
        if subsection:
            loc = f"{loc} — {subsection}"
        matches[qid(q)] = {
            "section": str(ch["num"]),
            "title": chnk.get("chapter") or ch["title"],
            "subsection": subsection,
            "why": (
                f"Main-text discussion in {loc}. "
                f"This is the teaching section a resident would read for context — "
                f"not the book’s own review questions."
            ),
            "book": "Kaufman's Clinical Neurology for Psychiatrists, 9th ed.",
            "page": anchor,
            "lo": lo,
            "hi": hi,
            "atStart": lo <= int(ch["pdf_page_start"]),
            "atEnd": hi >= text_end,
            "score": round(score, 2),
        }

    OUT_MATCHES.parent.mkdir(parents=True, exist_ok=True)
    OUT_MATCHES.write_text(
        json.dumps({"count": len(matches), "min_score": MIN_SCORE, "matches": matches}, indent=2, ensure_ascii=False)
        + "\n"
    )
    client = {k: {kk: vv for kk, vv in v.items() if kk != "score"} for k, v in matches.items()}
    OUT_CLIENT.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(client, ensure_ascii=False)
    OUT_CLIENT.write_text(body + "\n")
    with gzip.open(OUT_GZ, "wt", encoding="utf-8") as f:
        f.write(body)

    pages: set[int] = set()
    for v in matches.values():
        for p in range(int(v["lo"]), int(v["hi"]) + 1):
            pages.add(p)
    OUT_PAGES.write_text("\n".join(str(p) for p in sorted(pages)) + "\n")

    by_ch: dict[str, int] = {}
    for v in matches.values():
        by_ch[v["section"]] = by_ch.get(v["section"], 0) + 1
    print(f"eligible_neuro≈ matched={len(matches)} / {len(questions)}")
    print("pages_to_render", len(pages))
    print("by_chapter", json.dumps(dict(sorted(by_ch.items(), key=lambda kv: str(kv[0])))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
