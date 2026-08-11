#!/usr/bin/env python3
"""
Match PRITE questions → DSM-5-TR sections (fast, parallel).

Uses an inverted alias index so each question only scores a small candidate set.
Writes reference/dsm5tr/matches.json and public/data/dsm_refs.json(+.gz).
"""
from __future__ import annotations

import argparse
import gzip
import json
import re
import sys
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INDEX = ROOT / "reference" / "dsm5tr" / "section_index.json"
QUESTIONS = ROOT / "extraction" / "output" / "questions_all.json"
OUT_MATCHES = ROOT / "reference" / "dsm5tr" / "matches.json"
OUT_CLIENT = ROOT / "public" / "data" / "dsm_refs.json"
OUT_GZ = ROOT / "public" / "data" / "dsm_refs.json.gz"

TAG_HINTS: dict[str, list[str]] = {
    "schizophrenia": ["schizophrenia"],
    "psychosis": ["schizophrenia", "brief psychotic", "schizophreniform", "delusional"],
    "bipolar": ["bipolar i", "bipolar ii", "bipolar and related"],
    "depression": ["major depressive", "depressive disorders", "persistent depressive"],
    "mdd": ["major depressive"],
    "anxiety": ["anxiety disorders", "generalized anxiety", "panic"],
    "gad": ["generalized anxiety"],
    "panic": ["panic disorder"],
    "ptsd": ["posttraumatic stress", "trauma- and stressor"],
    "ocd": ["obsessive-compulsive disorder"],
    "adhd": ["attention-deficit/hyperactivity"],
    "autism": ["autism spectrum"],
    "asd": ["autism spectrum"],
    "substance-use": ["substance-related", "alcohol use", "opioid use", "stimulant use", "cannabis use"],
    "alcohol": ["alcohol use"],
    "opioid": ["opioid use"],
    "personality": ["personality disorders"],
    "borderline": ["borderline personality"],
    "antisocial": ["antisocial personality"],
    "eating": ["feeding and eating", "anorexia", "bulimia", "binge-eating"],
    "anorexia": ["anorexia nervosa"],
    "bulimia": ["bulimia nervosa"],
    "sleep": ["sleep-wake", "insomnia"],
    "dementia": ["major neurocognitive", "neurocognitive"],
    "delirium": ["delirium"],
    "somatic": ["somatic symptom"],
    "conversion": ["functional neurological", "conversion"],
    "dissociative": ["dissociative"],
    "gender": ["gender dysphoria"],
    "conduct": ["conduct disorder"],
    "odd": ["oppositional defiant"],
    "tic": ["tourette", "tic disorder"],
    "tourette": ["tourette"],
    "catatonia": ["catatonia"],
    "pmdd": ["premenstrual dysphoric"],
    "social-anxiety": ["social anxiety"],
    "phobia": ["specific phobia", "agoraphobia"],
    "hoarding": ["hoarding"],
    "body-dysmorphic": ["body dysmorphic"],
    "gambling": ["gambling"],
    "paraphilia": ["paraphilic"],
    "nms": ["neuroleptic malignant"],
    "tardive": ["tardive dyskinesia"],
}


def qid(q: dict) -> str:
    return f"{q.get('year')}-{q.get('q_index')}"


def blob_for(q: dict) -> str:
    parts = [
        q.get("stem") or "",
        q.get("answer_text") or "",
        (q.get("explanation_text") or "")[:400],
    ]
    tags = q.get("tags") or {}
    for k in ("diagnosis", "medication", "topics", "neuro", "setting"):
        for x in tags.get(k) or []:
            parts.append(str(x).replace("-", " "))
    return " ".join(parts).lower()


# Globals set in worker initializer
_SECTIONS: list[dict] = []
_ALIAS_TO_IDX: dict[str, list[int]] = {}
_MIN_SCORE = 5.0


def _init_worker(sections: list[dict], alias_to_idx: dict[str, list[int]], min_score: float) -> None:
    global _SECTIONS, _ALIAS_TO_IDX, _MIN_SCORE
    _SECTIONS = sections
    _ALIAS_TO_IDX = alias_to_idx
    _MIN_SCORE = min_score


def _score(blob: str, ans: str, sec: dict, is_disorder: bool) -> float:
    title = sec["title"].lower()
    if len(title) < 8 or title in {"disorder", "disorders"}:
        return 0.0
    sc = 0.0
    for a in sec.get("aliases") or [title]:
        if len(a) < 4 or a in {"disorder", "disorders", "use", "related"}:
            continue
        if a == ans or (len(a) >= 6 and a in ans):
            sc += 10.0 if is_disorder else 6.0
        elif f" {a} " in f" {blob} " or blob.startswith(a + " ") or blob.endswith(" " + a):
            sc += 5.0 if is_disorder else 2.5
        elif a in blob and len(a) >= 8:
            sc += 3.0 if is_disorder else 1.5
    for tag, hints in TAG_HINTS.items():
        t = tag.replace("-", " ")
        if t in blob or tag in blob:
            for h in hints:
                if h in title or any(h in al for al in (sec.get("aliases") or [])):
                    sc += 3.5 if is_disorder else 1.5
    if is_disorder and sc >= 4:
        sc += 1.0
    if len(title) > 80:
        sc *= 0.3
    return sc


def _match_one(item: tuple[str, str, str]) -> tuple[str, dict] | None:
    id_, blob, ans = item
    # candidate section indices from alias hits
    cand: set[int] = set()
    # tokenize blob words length>=4 for index probe
    tokens = set(re.findall(r"[a-z0-9][a-z0-9\-/]{3,}", blob))
    # also multiword probes: scan known aliases that appear as substrings via token pairs is hard;
    # instead check every alias key that is a single token OR contained
    for tok in tokens:
        if tok in _ALIAS_TO_IDX:
            cand.update(_ALIAS_TO_IDX[tok])
    # multi-word aliases: check high-value multiword keys
    for alias, idxs in _ALIAS_TO_IDX.items():
        if " " in alias or "/" in alias or "-" in alias:
            if alias in blob:
                cand.update(idxs)

    if not cand:
        # fallback: score all chapters only (small)
        for i, sec in enumerate(_SECTIONS):
            if sec.get("kind") == "chapter":
                cand.add(i)

    best = None
    best_sc = 0.0
    for i in cand:
        sec = _SECTIONS[i]
        is_d = sec.get("kind") == "disorder"
        sc = _score(blob, ans, sec, is_d)
        if sc > best_sc:
            best_sc = sc
            best = sec
    if not best or best_sc < _MIN_SCORE:
        return None

    chapter_title = best.get("chapter_title")
    if best.get("kind") == "disorder" and best.get("chapter_id"):
        for s in _SECTIONS:
            if s.get("kind") == "chapter" and s.get("id") == best["chapter_id"]:
                chapter_title = s["title"]
                break
    elif best.get("kind") == "chapter":
        chapter_title = best["title"]

    return id_, {
        "id": id_,
        "section_id": best["id"],
        "section_title": best["title"],
        "section_kind": best.get("kind"),
        "chapter_title": chapter_title,
        "pdf_page_start": best.get("pdf_page_start"),
        "pdf_page_end": best.get("pdf_page_end"),
        "score": round(best_sc, 2),
        "source": "dsm5tr",
        "book": "DSM-5-TR (APA, 2022)",
        "why": (
            f"DSM-5-TR section covering {best['title']} — diagnostic criteria and "
            f"clinical guidance most relevant to this item."
        ),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-score", type=float, default=5.0)
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()

    idx = json.loads(INDEX.read_text())
    sections: list[dict] = []
    for ch in idx["chapters"]:
        sections.append({**ch, "kind": "chapter"})
    for d in idx["disorders"]:
        sections.append({**d, "kind": "disorder"})

    # inverted alias → section indices (token keys + full multiword keys)
    alias_to_idx: dict[str, list[int]] = defaultdict(list)
    for i, sec in enumerate(sections):
        for a in sec.get("aliases") or [sec["title"].lower()]:
            a = a.lower().strip()
            if len(a) < 4:
                continue
            alias_to_idx[a].append(i)
            # also index first significant token for recall
            for tok in re.findall(r"[a-z0-9][a-z0-9\-/]{3,}", a):
                if tok not in {"disorder", "disorders", "related", "other", "with", "from", "type"}:
                    alias_to_idx[tok].append(i)
    # unique indices per key
    alias_to_idx = {k: list(dict.fromkeys(v)) for k, v in alias_to_idx.items()}

    questions = json.loads(QUESTIONS.read_text())
    work: list[tuple[str, str, str]] = []
    for q in questions:
        id_ = qid(q)
        blob = blob_for(q)
        ans = (q.get("answer_text") or "").lower().strip()
        work.append((id_, blob, ans))

    print(f"matching {len(work)} questions × {len(sections)} sections, workers={args.workers}", file=sys.stderr)
    matches: dict[str, dict] = {}

    # Process pool for true parallelism
    chunk = max(50, len(work) // (args.workers * 4))
    with ProcessPoolExecutor(
        max_workers=args.workers,
        initializer=_init_worker,
        initargs=(sections, alias_to_idx, args.min_score),
    ) as pool:
        futs = []
        for start in range(0, len(work), chunk):
            batch = work[start : start + chunk]
            futs.append(pool.submit(_match_batch, batch))
        done = 0
        for f in as_completed(futs):
            part = f.result()
            matches.update(part)
            done += 1
            print(f"  batch {done}/{len(futs)} cumulative_matches={len(matches)}", file=sys.stderr)

    OUT_MATCHES.parent.mkdir(parents=True, exist_ok=True)
    OUT_MATCHES.write_text(
        json.dumps(
            {
                "min_score": args.min_score,
                "count": len(matches),
                "total_questions": len(questions),
                "matches": matches,
            },
            indent=2,
            ensure_ascii=False,
        )
        + "\n"
    )

    slim = {
        id_: {
            "section_title": m["section_title"],
            "section_kind": m["section_kind"],
            "chapter_title": m.get("chapter_title"),
            "pdf_page_start": m.get("pdf_page_start"),
            "pdf_page_end": m.get("pdf_page_end"),
            "why": m["why"],
            "book": m["book"],
        }
        for id_, m in matches.items()
    }
    payload = json.dumps(slim, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    OUT_CLIENT.parent.mkdir(parents=True, exist_ok=True)
    OUT_CLIENT.write_bytes(payload)
    OUT_GZ.write_bytes(gzip.compress(payload, compresslevel=9))
    print(
        f"matched {len(matches)}/{len(questions)} "
        f"({100 * len(matches) / len(questions):.1f}%) min_score={args.min_score}",
        file=sys.stderr,
    )
    print(f"wrote {OUT_CLIENT} ({len(payload):,} bytes)", file=sys.stderr)
    return 0


def _match_batch(batch: list[tuple[str, str, str]]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for item in batch:
        r = _match_one(item)
        if r:
            out[r[0]] = r[1]
    return out


if __name__ == "__main__":
    raise SystemExit(main())
