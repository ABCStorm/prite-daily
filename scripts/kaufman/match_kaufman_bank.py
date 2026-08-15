#!/usr/bin/env python3
"""Match extracted Kaufman *practice* questions to teaching-text chunks.

The Neuro-mode Kaufman tab used to open the Q&A page the item was printed
on. Residents need the main-text discussion (e.g. ciguatoxin on ch.5 p.78,
not the chapter-end question list on p.95).

Writes teach_page / teach_lo / teach_hi back onto reference/kaufman/questions.json.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from rank_bm25 import BM25Okapi

ROOT = Path(__file__).resolve().parents[2]
CHUNKS = ROOT / "reference" / "kaufman" / "book_chunks.json"
CHAPTERS = ROOT / "reference" / "kaufman" / "chapter_index.json"
QFILE = ROOT / "reference" / "kaufman" / "questions.json"

TOKEN = re.compile(r"[a-z0-9][a-z0-9\-]{2,}")
WINDOW_RADIUS = 4
MIN_SCORE = 3.0

CHAPTER_ALIASES: dict[int | str, list[str]] = {
    2: ["upper motor neuron", "lower motor neuron", "babinski", "hemiparesis", "spasticity"],
    3: ["psychogenic", "functional neurological", "hoover sign", "conversion"],
    4: ["cranial nerve", "optic nerve", "trigeminal", "bell palsy", "bell's palsy", "acoustic neuroma"],
    5: [
        "neuropathy", "guillain", "peripheral nerve", "charcot marie",
        "ciguatera", "ciguatoxin", "barracuda", "thimerosal",
    ],
    6: ["myasthenia", "myopathy", "muscular dystrophy", "polymyositis", "lambert eaton"],
    7: ["dementia", "alzheimer", "delirium", "lewy body", "frontotemporal", "vascular dementia", "nph"],
    8: ["aphasia", "anosognosia", "broca", "wernicke", "conduction aphasia", "neglect"],
    9: ["migraine", "cluster headache", "tension headache", "pseudotumor", "idiopathic intracranial"],
    10: ["epilepsy", "seizure", "status epilepticus", "absence", "eeg", "valproate", "lamotrigine"],
    11: ["stroke", "tia", "ischemic", "hemorrhage", "subarachnoid", "mca", "wallenberg"],
    12: ["homonymous", "hemianopia", "papilledema", "optic neuritis", "argyll robertson"],
    13: ["cerebral palsy", "fragile x", "rett", "tuberous sclerosis", "nf1", "neurofibromatosis"],
    14: ["chronic pain", "neuropathic pain", "trigeminal neuralgia", "crps"],
    15: ["multiple sclerosis", "optic neuritis", "oligoclonal", "nmo", "neuromyelitis"],
    16: ["erectile", "priapism", "sexual function"],
    17: ["narcolepsy", "cataplexy", "insomnia", "rem sleep", "sleep apnea", "restless legs"],
    18: ["parkinson", "huntington", "tardive", "dystonia", "chorea", "tourette", "tremor", "wilson"],
    19: ["brain tumor", "glioblastoma", "meningioma", "paraneoplastic", "metastasis"],
    20: ["lumbar puncture", "csf", "mri", "ct scan"],
    21: ["neurotransmitter", "dopamine", "serotonin", "acetylcholine", "gaba", "cocaine"],
    22: ["traumatic brain", "concussion", "cte", "subdural"],
}


def tokenize(s: str) -> list[str]:
    return TOKEN.findall((s or "").lower())


def blob_for(q: dict) -> str:
    k = q.get("kaufman") or {}
    parts = [
        q.get("stem") or "",
        q.get("answer_text") or "",
        (q.get("explanation_text") or "")[:500],
        str(k.get("chapter") or ""),
    ]
    return " ".join(parts)


def main() -> int:
    chunks = json.loads(CHUNKS.read_text())
    chapters = {c["num"]: c for c in json.loads(CHAPTERS.read_text())["chapters"]}
    questions = json.loads(QFILE.read_text())
    page_texts = json.loads((ROOT / "reference" / "kaufman" / "page_texts.json").read_text())["pages"]
    tokenized = [tokenize(c["text"]) for c in chunks]
    bm25 = BM25Okapi(tokenized)

    matched = 0
    still_qa = 0
    q87 = None
    for q in questions:
        k = q.setdefault("kaufman", {})
        blob = blob_for(q)
        toks = tokenize(blob)
        if len(toks) < 4:
            k.pop("teach_page", None)
            continue
        scores = list(map(float, bm25.get_scores(toks)))
        home = k.get("chapter_num")
        if isinstance(home, int):
            for i, c in enumerate(chunks):
                if c["chapter_num"] == home:
                    scores[i] += 2.2
        blob_l = blob.lower()
        for num, aliases in CHAPTER_ALIASES.items():
            hit = sum(1 for a in aliases if a.lower() in blob_l)
            if not hit:
                continue
            for i, c in enumerate(chunks):
                if c["chapter_num"] == num:
                    scores[i] += hit * 1.4
        best_i = max(range(len(scores)), key=lambda i: scores[i])
        if scores[best_i] < MIN_SCORE:
            k.pop("teach_page", None)
            continue
        chnk = chunks[best_i]
        ch = chapters.get(chnk["chapter_num"])
        if not ch:
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
        # Prefer the page in the window that actually names the answer / topic.
        keys = tokenize((q.get("answer_text") or "") + " " + (q.get("stem") or "")[:180])
        keys = [t for t in keys if len(t) >= 5]
        best_p, best_n = anchor, -1
        for p in range(lo, hi + 1):
            low = (page_texts[p - 1].get("text") or "").lower()
            n = sum(low.count(t) for t in keys[:12])
            if n > best_n:
                best_n, best_p = n, p
        if best_n > 0:
            anchor = best_p
        k["teach_page"] = anchor
        k["teach_lo"] = lo
        k["teach_hi"] = hi
        k["teach_section"] = str(ch["num"])
        k["teach_title"] = ch["title"]
        matched += 1
        if qa_start and lo >= int(qa_start):
            still_qa += 1
        if q.get("year") == "Ch 5" and q.get("q_index") == 87:
            q87 = (anchor, lo, hi, scores[best_i], chnk["text"][:160].replace("\n", " "))

    QFILE.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n")
    print(f"matched {matched}/{len(questions)} still_qa_window={still_qa}")
    if q87:
        print("Ch5 Q87 ->", q87[:4])
        print(" ", q87[4])
    else:
        print("Ch5 Q87 NOT MATCHED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
