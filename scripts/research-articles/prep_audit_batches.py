#!/usr/bin/env python3
"""
Build audit input batches for research-article relevance review.

Each item is one (question, article) pair with enough context for a human/LLM
to decide: is this paper actually useful further reading for THIS PRITE item?

Writes:
  reference/research-articles/audit/pairs.jsonl   — all pairs
  reference/research-articles/audit/batch_NNNN.json — ~15 pairs each
  reference/research-articles/audit/abstract_cache.json — PMID -> abstract
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REFS = ROOT / "reference" / "research-articles" / "refs.json"
QUESTIONS = ROOT / "extraction" / "output" / "questions_all.json"
OUT_DIR = ROOT / "reference" / "research-articles" / "audit"
ABS_CACHE = OUT_DIR / "abstract_cache.json"
PAIRS = OUT_DIR / "pairs.jsonl"

BATCH_SIZE = 12  # articles per agent batch (keeps prompts under control)


def qid(q: dict) -> str:
    return f"{q['year']}-{q['q_index']}"


def fetch_abstracts(pmids: list[str], cache: dict) -> None:
    need = [p for p in pmids if p and p not in cache]
    if not need:
        return
    # Europe PMC: batch by OR of EXT_ID
    for i in range(0, len(need), 40):
        chunk = need[i : i + 40]
        q = " OR ".join(f"EXT_ID:{p}" for p in chunk)
        params = {
            "query": q,
            "resultType": "core",
            "pageSize": str(len(chunk)),
            "format": "json",
        }
        url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={"User-Agent": "prite-daily-audit/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            hits = (data.get("resultList") or {}).get("result") or []
            found = set()
            for h in hits:
                pmid = str(h.get("pmid") or "")
                if not pmid:
                    continue
                found.add(pmid)
                abs_ = (h.get("abstractText") or "").strip()
                cache[pmid] = abs_[:1800] if abs_ else ""
            for p in chunk:
                if p not in found:
                    cache[p] = ""  # mark attempted
        except Exception as e:
            print(f"  abstract fetch error: {e}", file=sys.stderr)
            for p in chunk:
                cache.setdefault(p, "")
        time.sleep(0.12)
        print(f"  abstracts {min(i+40, len(need))}/{len(need)}", file=sys.stderr)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="Limit pairs (0=all)")
    ap.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    ap.add_argument("--skip-abstracts", action="store_true")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    refs = json.loads(REFS.read_text())
    questions = {qid(q): q for q in json.loads(QUESTIONS.read_text())}
    abs_cache = json.loads(ABS_CACHE.read_text()) if ABS_CACHE.exists() else {}

    pairs = []
    pmids = []
    for id_, r in sorted(refs.items(), key=lambda x: (str(x[1].get("year")), int(x[1].get("q_index") or 0))):
        q = questions.get(id_)
        stem = (q.get("stem") if q else None) or r.get("stem_preview") or ""
        ans = (q.get("answer_text") if q else None) or r.get("answer_text") or ""
        expl = (q.get("explanation_text") if q else None) or ""
        # strip markdown-ish for prompt size
        expl = expl.replace("**", "").replace("*", "")[:700]
        for a in r.get("articles") or []:
            pmid = str(a.get("pmid") or "")
            if not pmid:
                continue
            pmids.append(pmid)
            pairs.append({
                "pair_id": f"{id_}:{pmid}",
                "question_id": id_,
                "year": r.get("year"),
                "q_index": r.get("q_index"),
                "stem": stem[:900],
                "answer_text": ans,
                "answer_letter": (q.get("answer_letter") if q else None) or r.get("answer_letter"),
                "explanation": expl,
                "pmid": pmid,
                "title": a.get("title") or "",
                "journal": a.get("journal") or "",
                "article_year": a.get("year"),
                "url": a.get("url") or (a.get("urls") or {}).get("pubmed"),
            })

    if args.limit:
        pairs = pairs[: args.limit]
        pmids = [p["pmid"] for p in pairs]

    print(f"pairs={len(pairs)} unique_pmids={len(set(pmids))}", file=sys.stderr)

    if not args.skip_abstracts:
        print("fetching abstracts…", file=sys.stderr)
        fetch_abstracts(sorted(set(pmids)), abs_cache)
        ABS_CACHE.write_text(json.dumps(abs_cache, ensure_ascii=False))
        print(f"wrote {ABS_CACHE}", file=sys.stderr)

    for p in pairs:
        p["abstract"] = abs_cache.get(p["pmid"], "")[:1500]

    with PAIRS.open("w") as f:
        for p in pairs:
            f.write(json.dumps(p, ensure_ascii=False) + "\n")
    print(f"wrote {PAIRS}", file=sys.stderr)

    # wipe old batches
    for old in OUT_DIR.glob("batch_*.json"):
        old.unlink()

    n_batches = 0
    for i in range(0, len(pairs), args.batch_size):
        chunk = pairs[i : i + args.batch_size]
        path = OUT_DIR / f"batch_{n_batches:04d}.json"
        path.write_text(json.dumps({"batch_index": n_batches, "pairs": chunk}, indent=2, ensure_ascii=False) + "\n")
        n_batches += 1
    print(f"wrote {n_batches} batches of size ~{args.batch_size}", file=sys.stderr)
    print(json.dumps({"pairs": len(pairs), "batches": n_batches, "batch_size": args.batch_size}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
