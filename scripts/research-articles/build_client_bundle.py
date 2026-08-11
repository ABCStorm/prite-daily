#!/usr/bin/env python3
"""Slim reference/research-articles/refs.json → public/data/research_refs.json for the app."""

from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "reference" / "research-articles" / "refs.json"
OUT = ROOT / "public" / "data" / "research_refs.json"
OUT_GZ = ROOT / "public" / "data" / "research_refs.json.gz"


def slim_article(a: dict) -> dict:
    pmid = a.get("pmid")
    urls = dict(a.get("urls") or {})
    if pmid and "pubmed" not in urls:
        urls["pubmed"] = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
    urls = {k: v for k, v in urls.items() if v}
    return {
        "pmid": pmid,
        "pmcid": a.get("pmcid"),
        "doi": a.get("doi"),
        "title": a.get("title"),
        "journal": a.get("journal"),
        "year": a.get("year"),
        "is_open_access": bool(a.get("is_open_access")),
        "is_reviewish": bool(a.get("is_reviewish")),
        "why": a.get("relevance_sentence") or a.get("why") or "",
        "relevance_sentence": a.get("relevance_sentence") or a.get("why") or "",
        "url": a.get("url") or urls.get("pmc") or urls.get("pubmed"),
        "urls": urls,
    }


def main() -> int:
    if not SRC.exists():
        print(f"missing {SRC}", file=sys.stderr)
        return 1
    raw_in = json.loads(SRC.read_text())
    slim: dict = {}
    for k, v in raw_in.items():
        arts = [slim_article(a) for a in (v.get("articles") or [])[:2]]
        arts = [a for a in arts if a.get("pmid") and a.get("title")]
        if arts:
            slim[k] = {"articles": arts}
    payload = json.dumps(slim, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(payload)
    OUT_GZ.write_bytes(gzip.compress(payload, compresslevel=9))
    print(f"wrote {OUT} ({len(payload):,} bytes, {len(slim)} questions)")
    print(f"wrote {OUT_GZ} ({OUT_GZ.stat().st_size:,} bytes gzipped)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
