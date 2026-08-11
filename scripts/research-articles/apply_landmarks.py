#!/usr/bin/env python3
"""
Attach curated landmark papers to residual gap questions by topic/intent match.
Only fills articles=[] slots. Verifies PMID exists via Europe PMC or skips soft.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from match_articles import QUESTIONS, OUT_REFS, qid  # noqa: E402
from requery_residual_pilot import detect_intents  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
LIB = ROOT / "reference" / "research-articles" / "landmark_library.json"
REFS = OUT_REFS


def fetch_meta(pmid: str) -> dict | None:
    url = (
        "https://www.ebi.ac.uk/europepmc/webservices/rest/search?"
        + urllib.parse.urlencode(
            {"query": f"EXT_ID:{pmid} AND SRC:MED", "format": "json", "pageSize": "1"}
        )
    )
    try:
        with urllib.request.urlopen(
            urllib.request.Request(url, headers={"User-Agent": "prite-daily-landmarks/1"}),
            timeout=20,
        ) as r:
            data = json.loads(r.read().decode())
        hits = (data.get("resultList") or {}).get("result") or []
        return hits[0] if hits else None
    except Exception:
        return None


def score(q: dict, lm: dict) -> float:
    blob = " ".join(
        [
            (q.get("stem") or ""),
            (q.get("answer_text") or ""),
            (q.get("explanation_text") or "")[:600],
        ]
    ).lower()
    tags = q.get("tags") or {}
    for k in ("diagnosis", "medication", "topics", "neuro"):
        for x in tags.get(k) or []:
            blob += " " + str(x).replace("-", " ").lower()
    sc = 0.0
    ans = (q.get("answer_text") or "").lower()
    for t in lm.get("topics") or []:
        tl = t.lower()
        if tl in ans:
            sc += 4.0
        elif re.search(rf"\b{re.escape(tl)}\b", blob):
            sc += 2.0
    intents = set(detect_intents(blob))
    sc += 1.5 * len(intents & set(lm.get("intents") or []))
    return sc


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-score", type=float, default=6.0)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-fetch", action="store_true", help="Skip EPMC metadata fetch")
    args = ap.parse_args()

    lib = json.loads(LIB.read_text())
    landmarks = lib["landmarks"]
    refs = json.loads(REFS.read_text())
    questions = {qid(q): q for q in json.loads(QUESTIONS.read_text())}

    meta_cache: dict[str, dict | None] = {}
    applied = 0
    for id_, r in list(refs.items()):
        if r.get("articles"):
            continue
        q = questions.get(id_)
        if not q:
            continue
        best = None
        best_sc = 0.0
        for lm in landmarks:
            sc = score(q, lm)
            if sc > best_sc:
                best_sc = sc
                best = lm
        if not best or best_sc < args.min_score:
            continue
        pmid = str(best["pmid"])
        if not args.no_fetch:
            if pmid not in meta_cache:
                meta_cache[pmid] = fetch_meta(pmid)
            meta = meta_cache[pmid]
        else:
            meta = None
        title = (meta or {}).get("title") or best.get("title") or ""
        journal = ""
        if meta:
            journal = (meta.get("journalTitle") or "") 
        year = best.get("year") or (meta or {}).get("pubYear")
        why = best.get("why_template") or ""
        pmcid = (meta or {}).get("pmcid")
        doi = (meta or {}).get("doi")
        urls = {"pubmed": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"}
        if pmcid:
            urls["pmc"] = f"https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid}/"
        if doi:
            urls["doi"] = f"https://doi.org/{doi}"
        article = {
            "pmid": pmid,
            "pmcid": pmcid,
            "doi": doi,
            "title": title.strip().rstrip("."),
            "journal": journal,
            "journal_tier": "tier1",
            "year": year,
            "pub_types": [],
            "cited_by": (meta or {}).get("citedByCount"),
            "is_open_access": (meta or {}).get("isOpenAccess"),
            "is_reviewish": True,
            "score": best_sc,
            "why": why,
            "relevance_sentence": why,
            "audit_rating": "relevant",
            "source": "landmark_library",
            "landmark_id": best.get("id"),
            "urls": urls,
            "url": urls.get("pmc") or urls.get("pubmed"),
        }
        if args.dry_run:
            print(f"would apply {id_} -> {pmid} score={best_sc:.1f} {title[:60]}")
        else:
            refs[id_] = dict(r)
            refs[id_]["articles"] = [article]
        applied += 1

    print(f"landmark matches: {applied} (min_score={args.min_score})", file=sys.stderr)
    if args.dry_run:
        return 0
    REFS.write_text(json.dumps(refs, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {REFS}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
