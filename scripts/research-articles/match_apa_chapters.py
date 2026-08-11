#!/usr/bin/env python3
"""
Match gap (or all) questions to curated APA Publishing / PsychiatryOnline chapters.

Uses Wright State EZproxy base by default:
  https://psychiatryonline-org.ezproxy.libraries.wright.edu

Does NOT touch Kaplan & Sadock. Safe additive layer: writes
  reference/apa-chapters/matches.json
and can optionally merge chapter cards into research refs later.

Usage:
  python3 scripts/research-articles/match_apa_chapters.py
  python3 scripts/research-articles/match_apa_chapters.py --gap-only
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from match_articles import QUESTIONS, OUT_REFS, qid  # noqa: E402
from requery_residual_pilot import detect_intents  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
INDEX = ROOT / "reference" / "apa-chapters" / "chapter_index.json"
OUT = ROOT / "reference" / "apa-chapters" / "matches.json"


def make_url(base: str, path: str) -> str:
    path = path if path.startswith("/") else f"/{path}"
    return base.rstrip("/") + path


def score_chapter(q: dict, ch: dict) -> tuple[float, list[str]]:
    stem = (q.get("stem") or "").lower()
    ans = (q.get("answer_text") or "").lower()
    expl = (q.get("explanation_text") or "").lower()[:800]
    tags = q.get("tags") or {}
    tag_blob = " ".join(
        str(x).replace("-", " ").lower()
        for k in ("diagnosis", "medication", "neuro", "psychotherapy", "topics", "setting")
        for x in (tags.get(k) or [])
    )
    blob = f"{stem} {ans} {expl} {tag_blob}"
    intents = set(detect_intents(blob))
    reasons = []
    score = 0.0

    for t in ch.get("topics") or []:
        tl = t.lower()
        if len(tl) < 3:
            continue
        if tl in ans:
            score += 4.0
            reasons.append(f"answer:{t}")
        elif re.search(rf"\b{re.escape(tl)}\b", blob):
            score += 2.0
            reasons.append(f"topic:{t}")

    ch_intents = set(ch.get("intents") or [])
    overlap = intents & ch_intents
    if overlap:
        score += 1.5 * len(overlap)
        reasons.append(f"intent:{','.join(sorted(overlap))}")

    return score, reasons


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gap-only", action="store_true")
    ap.add_argument("--min-score", type=float, default=4.0)
    args = ap.parse_args()

    index = json.loads(INDEX.read_text())
    books = {b["id"]: b for b in index["books"]}
    chapters = index["chapters"]
    ez = index.get("ezproxy_base") or "https://psychiatryonline-org.ezproxy.libraries.wright.edu"
    link_style = index.get("link_style") or "ezproxy"
    base = ez if link_style == "ezproxy" else index.get("public_base") or "https://psychiatryonline.org"

    refs = json.loads(OUT_REFS.read_text())
    questions = [q for q in json.loads(QUESTIONS.read_text())]
    by_id = {qid(q): q for q in questions}

    ids = list(by_id.keys())
    if args.gap_only:
        ids = [i for i in ids if not (refs.get(i) or {}).get("articles")]

    matches: dict[str, dict] = {}
    for id_ in ids:
        q = by_id[id_]
        best = None
        best_score = 0.0
        best_reasons: list[str] = []
        for ch in chapters:
            sc, reasons = score_chapter(q, ch)
            if sc > best_score:
                best_score = sc
                best = ch
                best_reasons = reasons
        if best and best_score >= args.min_score:
            book = books.get(best["book_id"]) or {}
            path = best.get("url_path") or book.get("url_path") or "/guidelines"
            matches[id_] = {
                "id": id_,
                "chapter_id": best["id"],
                "chapter_title": best["title"],
                "book_title": book.get("title"),
                "book_id": best["book_id"],
                "score": round(best_score, 2),
                "reasons": best_reasons,
                "url": make_url(base, path),
                "source": "apa_psychiatryonline",
                "why": (
                    f"APA Publishing chapter relevant to this item "
                    f"({', '.join(best_reasons[:3]) or 'topic match'})."
                ),
            }

    OUT.write_text(json.dumps({"count": len(matches), "min_score": args.min_score,
                               "ezproxy_base": base, "matches": matches}, indent=2) + "\n")
    gap_n = sum(1 for i in ids if not (refs.get(i) or {}).get("articles"))
    print(
        f"matched {len(matches)}/{len(ids)} "
        f"(gap-only={args.gap_only} gap_in_set≈{gap_n}) -> {OUT}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
