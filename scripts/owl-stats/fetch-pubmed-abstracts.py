#!/usr/bin/env python3
"""Fetch PubMed abstracts for uncovered questions' already-matched articles.

The cache is a build artifact, not a client asset. It is intentionally kept out
of the public bundle; Stat Cat rows retain only the source URL and selected
quantitative sentence.
"""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def text_of(node: ET.Element | None) -> str:
    if node is None:
        return ""
    return " ".join("".join(node.itertext()).split())


def parse_articles(payload: bytes) -> dict[str, dict]:
    root = ET.fromstring(payload)
    out: dict[str, dict] = {}
    for article in root.findall(".//PubmedArticle"):
        pmid = text_of(article.find(".//MedlineCitation/PMID"))
        if not pmid:
            continue
        title = text_of(article.find(".//Article/ArticleTitle"))
        parts = []
        for abstract in article.findall(".//Article/Abstract/AbstractText"):
            label = abstract.attrib.get("Label") or ""
            body = text_of(abstract)
            if body:
                parts.append(f"{label}: {body}" if label else body)
        journal = text_of(article.find(".//Article/Journal/Title"))
        year = (
            text_of(article.find(".//Article/Journal/JournalIssue/PubDate/Year"))
            or text_of(article.find(".//Article/Journal/JournalIssue/PubDate/MedlineDate"))[:4]
        )
        out[pmid] = {
            "pmid": pmid,
            "title": title,
            "abstract": " ".join(parts),
            "journal": journal,
            "year": year or None,
        }
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refs", type=Path, default=ROOT / "public/data/research_refs.json")
    parser.add_argument("--stats", type=Path, default=ROOT / "public/data/owl_stats.json")
    parser.add_argument("--output", type=Path, default=ROOT / "work/pubmed-stat-abstracts.json")
    parser.add_argument("--batch-size", type=int, default=180)
    parser.add_argument("--email", default=os.environ.get("PUBMED_EMAIL"), help="optional NCBI contact email")
    args = parser.parse_args()

    refs = json.loads(args.refs.read_text())
    existing = json.loads(args.stats.read_text())
    needed = sorted({
        str(article["pmid"])
        for qid, record in refs.items()
        if qid not in existing
        for article in record.get("articles") or []
        if article.get("pmid")
    })

    cache = json.loads(args.output.read_text()) if args.output.exists() else {}
    missing = [pmid for pmid in needed if pmid not in cache]
    print(f"need {len(needed)} unique PMIDs; cached {len(needed) - len(missing)}; fetching {len(missing)}")
    args.output.parent.mkdir(parents=True, exist_ok=True)

    for start in range(0, len(missing), args.batch_size):
        batch = missing[start:start + args.batch_size]
        params = {
            "db": "pubmed",
            "retmode": "xml",
            "tool": "prite-daily-stat-cat",
            "id": ",".join(batch),
        }
        if args.email:
            params["email"] = args.email
        query = urllib.parse.urlencode(params)
        request = urllib.request.Request(
            f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?{query}",
            headers={"User-Agent": "PRITE-Daily-Stat-Cat/1.0"},
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            parsed = parse_articles(response.read())
        for pmid in batch:
            cache[pmid] = parsed.get(pmid, {"pmid": pmid, "title": "", "abstract": "", "journal": "", "year": None})
        args.output.write_text(json.dumps(cache, ensure_ascii=False, separators=(",", ":")))
        print(f"  fetched {min(start + len(batch), len(missing))}/{len(missing)} ({len(parsed)} records in batch)", flush=True)
        if start + len(batch) < len(missing):
            time.sleep(0.38)

    with_abstract = sum(bool((cache.get(pmid) or {}).get("abstract")) for pmid in needed)
    print(f"complete: {with_abstract}/{len(needed)} needed PMIDs have abstracts -> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
