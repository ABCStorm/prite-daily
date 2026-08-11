#!/usr/bin/env python3
"""
Pilot: wide-shortlist rematch for gap questions (currently zero shipped articles).

Unlike match_articles.py, this does NOT pre-filter to top 1-2 via passes_relevance_floor
before an LLM ever sees the pool. It fetches the full candidate pool (all strategies, no
early stop), scores everything with the existing heuristic, and keeps the top N candidates
per question so a judge (human or LLM) can pick from a wide, real shortlist instead of a
narrow pre-filtered one.

Usage:
  python3 scripts/research-articles/gap_rematch_pilot.py --sample 180 --seed 0 --batch-size 15
  python3 scripts/research-articles/gap_rematch_pilot.py --all-gap --out-dir reference/research-articles/gap_full
"""
from __future__ import annotations

import argparse
import json
import random
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from match_articles import (  # noqa: E402
    QUESTIONS, OUT_REFS, clinical_focus, build_queries, epmc_search,
    score_hit, journal_name, journal_tier, pub_types, is_reviewish, qid,
)

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT_DIR = ROOT / "reference" / "research-articles" / "gap_pilot"

TOP_K = 18
EXPL_CHARS = 900
ABSTRACT_CHARS = 500


def wide_candidates(q: dict, cache: dict, cache_lock: threading.Lock) -> list[dict]:
    focus = clinical_focus(q)
    strategies = build_queries(q, focus)
    all_hits: dict[str, dict] = {}
    for name, query in strategies:
        with cache_lock:
            hits = cache.get(query)
        if hits is None:
            try:
                hits = epmc_search(query, page_size=25)
            except Exception:
                continue
            with cache_lock:
                cache[query] = hits
        for h in hits:
            pmid = h.get("pmid")
            if pmid:
                all_hits.setdefault(str(pmid), h)
        # no early stop -- we want the full pool this time

    scored = sorted(
        ((score_hit(h, focus), h) for h in all_hits.values()),
        key=lambda x: x[0], reverse=True,
    )

    out = []
    for s, hit in scored[:TOP_K]:
        jname = journal_name(hit)
        out.append({
            "pmid": str(hit.get("pmid")),
            "pmcid": hit.get("pmcid"),
            "doi": hit.get("doi"),
            "title": (hit.get("title") or "").strip(),
            "journal": jname,
            "journal_tier": journal_tier(jname),
            "year": hit.get("pubYear"),
            "pub_types": pub_types(hit),
            "is_reviewish": is_reviewish(pub_types(hit)),
            "cited_by": hit.get("citedByCount"),
            "is_open_access": hit.get("isOpenAccess"),
            "abstract": (hit.get("abstractText") or "")[:ABSTRACT_CHARS],
            "score": round(s, 1),
        })
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=180,
                    help="Random subsample size (ignored with --all-gap)")
    ap.add_argument("--all-gap", action="store_true",
                    help="Process the full gap pool (no random subsample)")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--batch-size", type=int, default=15)
    ap.add_argument("--workers", type=int, default=10)
    ap.add_argument("--out-dir", type=Path, default=None,
                    help="Output dir (default: reference/research-articles/gap_pilot)")
    ap.add_argument("--exclude-ids-file", type=Path, default=None,
                    help="JSON list or newline file of question ids to skip (e.g. pilot ids)")
    args = ap.parse_args()

    out_dir = args.out_dir
    if out_dir is None:
        out_dir = DEFAULT_OUT_DIR
    elif not out_dir.is_absolute():
        out_dir = ROOT / out_dir
    batch_dir = out_dir / "batches"
    results_dir = out_dir / "results"

    refs = json.loads(OUT_REFS.read_text())
    questions = json.loads(QUESTIONS.read_text())
    by_id = {qid(q): q for q in questions}

    gap_ids = [
        id_ for id_, r in refs.items()
        if not r.get("articles") and r.get("n_candidates", 0) > 0
    ]
    print(f"gap pool: {len(gap_ids)}", file=sys.stderr)

    exclude: set[str] = set()
    if args.exclude_ids_file:
        p = args.exclude_ids_file if args.exclude_ids_file.is_absolute() else ROOT / args.exclude_ids_file
        raw = p.read_text().strip()
        if raw.startswith("["):
            exclude = set(json.loads(raw))
        else:
            exclude = {line.strip() for line in raw.splitlines() if line.strip()}
        gap_ids = [i for i in gap_ids if i not in exclude]
        print(f"after exclude ({len(exclude)} ids): {len(gap_ids)}", file=sys.stderr)

    if args.all_gap:
        sample_ids = sorted(gap_ids)
        print(f"full gap run: {len(sample_ids)}", file=sys.stderr)
    else:
        rng = random.Random(args.seed)
        sample_ids = rng.sample(gap_ids, min(args.sample, len(gap_ids)))
        sample_ids.sort()
        print(f"pilot sample: {len(sample_ids)}", file=sys.stderr)

    cache: dict = {}
    cache_lock = threading.Lock()
    results: dict[str, dict] = {}
    lock = threading.Lock()

    def work(i: int, id_: str):
        q = by_id[id_]
        cands = wide_candidates(q, cache, cache_lock)
        with lock:
            results[id_] = {
                "id": id_,
                "stem": q.get("stem"),
                "options": q.get("options"),
                "answer_letter": q.get("answer_letter"),
                "answer_text": q.get("answer_text"),
                "explanation": (q.get("explanation_text") or "")[:EXPL_CHARS],
                "candidates": cands,
            }
            if i % 50 == 0 or i == len(sample_ids):
                print(f"  {i}/{len(sample_ids)}", file=sys.stderr)

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futs = [pool.submit(work, i, id_) for i, id_ in enumerate(sample_ids, 1)]
        for f in futs:
            f.result()

    batch_dir.mkdir(parents=True, exist_ok=True)
    results_dir.mkdir(parents=True, exist_ok=True)
    bs = args.batch_size
    n_batches = 0
    for bi, start in enumerate(range(0, len(sample_ids), bs)):
        chunk_ids = sample_ids[start:start + bs]
        batch = {
            "batch_index": bi,
            "questions": [results[id_] for id_ in chunk_ids],
        }
        (batch_dir / f"batch_{bi:04d}.json").write_text(
            json.dumps(batch, indent=2, ensure_ascii=False) + "\n"
        )
        n_batches += 1

    print(f"wrote {n_batches} batches to {batch_dir}", file=sys.stderr)
    with_any = sum(1 for r in results.values() if r["candidates"])
    print(f"questions with >=1 wide candidate: {with_any}/{len(results)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
