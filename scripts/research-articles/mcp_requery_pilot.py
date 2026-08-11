#!/usr/bin/env python3
"""
Re-query residual gap questions using the paper-search-mcp package
(PubMed + Europe PMC + OpenAlex connectors from openags/paper-search-mcp).

Same batch schema as gap_rematch_pilot / requery_residual_pilot for LLM judging.
"""
from __future__ import annotations

import argparse
import json
import random
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from match_articles import (  # noqa: E402
    QUESTIONS, OUT_REFS, clinical_focus, score_hit, journal_name,
    journal_tier, pub_types, is_reviewish, qid,
)
from requery_residual_pilot import (  # noqa: E402
    build_improved_queries, detect_intents, EXPL_CHARS, ABSTRACT_CHARS, TOP_K,
)

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / "reference" / "research-articles" / "mcp_requery_pilot"

_lock = threading.Lock()
_last = 0.0
_interval = 0.35


def _pace() -> None:
    global _last
    with _lock:
        now = time.time()
        d = _interval - (now - _last)
        if d > 0:
            time.sleep(d)
        _last = time.time()


def _to_hit(paper, source: str) -> dict | None:
    """Convert paper-search-mcp Paper → EPMC-like hit dict."""
    d = paper.to_dict() if hasattr(paper, "to_dict") else {}
    title = (d.get("title") or getattr(paper, "title", None) or "").strip()
    if not title:
        return None
    paper_id = str(d.get("paper_id") or getattr(paper, "paper_id", "") or "")
    pmid = None
    # pubmed uses pmid as paper_id
    if paper_id.isdigit():
        pmid = paper_id
    extra = d.get("extra") or getattr(paper, "extra", None) or {}
    if isinstance(extra, dict) and extra.get("pmid"):
        pmid = str(extra["pmid"])
    url = d.get("url") or getattr(paper, "url", "") or ""
    m = re.search(r"pubmed\.ncbi\.nlm\.nih\.gov/(\d+)", url)
    if m:
        pmid = m.group(1)
    if not pmid:
        return None  # ship path requires real PMIDs
    year = None
    pd = d.get("published_date") or getattr(paper, "published_date", None)
    if pd is not None:
        year = str(getattr(pd, "year", None) or str(pd)[:4])
        if year and not re.match(r"^\d{4}$", year):
            year = None
    abstract = (d.get("abstract") or getattr(paper, "abstract", "") or "")[:1500]
    return {
        "pmid": pmid,
        "doi": d.get("doi") or getattr(paper, "doi", None),
        "title": title,
        "journalTitle": (extra.get("journal") if isinstance(extra, dict) else None) or "",
        "pubYear": year,
        "pubTypeList": {"pubType": []},
        "citedByCount": d.get("citations") or getattr(paper, "citations", 0) or 0,
        "isOpenAccess": "N",
        "abstractText": abstract,
        "source": source,
    }


def search_mcp(query: str, sources: list[str], max_per: int = 8) -> list[dict]:
    hits: list[dict] = []
    for src in sources:
        _pace()
        try:
            if src == "pubmed":
                from paper_search_mcp.academic_platforms.pubmed import PubMedSearcher
                papers = PubMedSearcher().search(query, max_results=max_per)
                for p in papers:
                    h = _to_hit(p, "pubmed")
                    if h:
                        hits.append(h)
            elif src == "europepmc":
                try:
                    from paper_search_mcp.academic_platforms.europepmc import EuropePMCSearcher
                    papers = EuropePMCSearcher().search(query, max_results=max_per)
                except Exception:
                    # fallback to our EPMC REST
                    from match_articles import epmc_search
                    for h in epmc_search(f"({query}) AND (SRC:MED)", page_size=max_per):
                        h = dict(h)
                        h["source"] = "europepmc"
                        hits.append(h)
                    continue
                for p in papers:
                    h = _to_hit(p, "europepmc")
                    if h:
                        hits.append(h)
            elif src == "openalex":
                from paper_search_mcp.academic_platforms.openalex import OpenAlexSearcher
                papers = OpenAlexSearcher().search(query, max_results=max_per)
                for p in papers:
                    h = _to_hit(p, "openalex")
                    if h:
                        hits.append(h)
            elif src in ("semantic", "semanticscholar", "s2"):
                # Prefer our backoff-aware public/keyed client (works unauthenticated, just slow)
                try:
                    from semantic_scholar import search_papers as s2_search

                    hits.extend(s2_search(query, limit=max_per))
                except Exception:
                    from paper_search_mcp.academic_platforms.semantic import SemanticScholarSearcher
                    papers = SemanticScholarSearcher().search(query, max_results=max_per)
                    for p in papers:
                        h = _to_hit(p, "semantic")
                        if h:
                            hits.append(h)
        except Exception as e:
            print(f"  {src} err: {e}", file=sys.stderr)
    return hits


def wide_for_q(q: dict, sources: list[str]) -> tuple[list[dict], list[str], list[str]]:
    focus = clinical_focus(q)
    strategies = build_improved_queries(q, focus)[:5]
    raw: list[dict] = []
    used = []
    for name, query in strategies:
        used.append(f"{name}:{query[:90]}")
        raw.extend(search_mcp(query, sources, max_per=8))
    # dedupe by pmid
    by: dict[str, dict] = {}
    for h in raw:
        pmid = str(h.get("pmid") or "")
        if not pmid:
            continue
        prev = by.get(pmid)
        if not prev:
            by[pmid] = h
        elif not prev.get("abstractText") and h.get("abstractText"):
            prev["abstractText"] = h["abstractText"]
    scored = sorted(
        ((score_hit(h, focus), h) for h in by.values()),
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
            "retrieval_source": hit.get("source"),
        })
    intents = detect_intents(
        f"{q.get('stem') or ''} {q.get('answer_text') or ''} {q.get('explanation_text') or ''}"
    )
    return out, used, intents


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=60)
    ap.add_argument("--seed", type=int, default=2)
    ap.add_argument("--batch-size", type=int, default=10)
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--sources", default="pubmed,europepmc")
    ap.add_argument("--out-dir", type=Path, default=None)
    args = ap.parse_args()
    sources = [s.strip() for s in args.sources.split(",") if s.strip()]
    out_dir = args.out_dir or DEFAULT_OUT
    if not out_dir.is_absolute():
        out_dir = ROOT / out_dir
    batch_dir = out_dir / "batches"
    results_dir = out_dir / "results"
    batch_dir.mkdir(parents=True, exist_ok=True)
    results_dir.mkdir(parents=True, exist_ok=True)

    refs = json.loads(OUT_REFS.read_text())
    questions = {qid(q): q for q in json.loads(QUESTIONS.read_text())}
    gap_ids = [i for i, r in refs.items() if not r.get("articles") and i in questions]
    rng = random.Random(args.seed)
    sample_ids = sorted(rng.sample(gap_ids, min(args.sample, len(gap_ids))))
    print(f"gap={len(gap_ids)} sample={len(sample_ids)} sources={sources}", file=sys.stderr)

    results: dict[str, dict] = {}
    lock = threading.Lock()
    done = 0

    def work(id_: str) -> None:
        nonlocal done
        q = questions[id_]
        cands, used, intents = wide_for_q(q, sources)
        with lock:
            results[id_] = {
                "id": id_,
                "stem": q.get("stem"),
                "options": q.get("options"),
                "answer_letter": q.get("answer_letter"),
                "answer_text": q.get("answer_text"),
                "explanation": (q.get("explanation_text") or "")[:EXPL_CHARS],
                "candidates": cands,
                "queries_used": used,
                "intents": intents,
                "pipeline": "mcp_requery_v1",
            }
            done += 1
            if done % 5 == 0 or done == len(sample_ids):
                print(f"  {done}/{len(sample_ids)}", file=sys.stderr)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futs = [pool.submit(work, i) for i in sample_ids]
        for f in as_completed(futs):
            f.result()

    bs = args.batch_size
    n_batches = 0
    for bi, start in enumerate(range(0, len(sample_ids), bs)):
        chunk = sample_ids[start:start + bs]
        batch = {
            "batch_index": bi,
            "pipeline": "mcp_requery_v1",
            "questions": [results[i] for i in chunk],
        }
        (batch_dir / f"batch_{bi:04d}.json").write_text(
            json.dumps(batch, indent=2, ensure_ascii=False) + "\n"
        )
        n_batches += 1
    with_any = sum(1 for r in results.values() if r["candidates"])
    med = sorted(len(r["candidates"]) for r in results.values())[len(results)//2]
    print(f"wrote {n_batches} batches; with_cands={with_any}/{len(results)} median={med}", file=sys.stderr)
    (out_dir / "summary.json").write_text(json.dumps({
        "sample": len(sample_ids), "sources": sources, "with_candidates": with_any, "median": med,
        "ids": sample_ids,
    }, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
