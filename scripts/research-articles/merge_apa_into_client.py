#!/usr/bin/env python3
"""
Merge curated APA PsychiatryOnline chapter matches into the client research
bundle so Further reading can show textbook/guideline cards (Wright ezproxy).

Does not replace papers. Adds `apa_chapters` (and optional fallback article
entries with kind=apa_chapter) for matched questions.

Also rewrites public/data/research_refs.json by combining:
  - slimmed MEDLINE articles from refs.json
  - APA chapter cards from reference/apa-chapters/matches.json
"""
from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REFS = ROOT / "reference" / "research-articles" / "refs.json"
APA = ROOT / "reference" / "apa-chapters" / "matches.json"
OUT = ROOT / "public" / "data" / "research_refs.json"
OUT_GZ = ROOT / "public" / "data" / "research_refs.json.gz"


def slim_article(a: dict) -> dict | None:
    pmid = a.get("pmid")
    if not pmid or not a.get("title"):
        return None
    urls = dict(a.get("urls") or {})
    if "pubmed" not in urls:
        urls["pubmed"] = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
    urls = {k: v for k, v in urls.items() if v}
    return {
        "kind": "article",
        "pmid": str(pmid),
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
        "source": a.get("source") or "medline",
    }


def slim_apa(m: dict) -> dict:
    url = m.get("url") or ""
    return {
        "kind": "apa_chapter",
        "pmid": None,
        "title": m.get("chapter_title") or "APA Publishing chapter",
        "journal": m.get("book_title") or "APA Publishing / PsychiatryOnline",
        "year": None,
        "is_open_access": False,
        "is_reviewish": True,
        "why": m.get("why") or "",
        "relevance_sentence": m.get("why") or "",
        "url": url,
        "urls": {"psychiatryonline": url},
        "source": "apa_psychiatryonline",
        "chapter_id": m.get("chapter_id"),
        "book_id": m.get("book_id"),
    }


def main() -> int:
    min_score = 5.0  # slightly stricter for ship than matcher default 4
    if "--min-score" in sys.argv:
        i = sys.argv.index("--min-score")
        min_score = float(sys.argv[i + 1])

    refs = json.loads(REFS.read_text()) if REFS.exists() else {}
    apa_raw = json.loads(APA.read_text()) if APA.exists() else {"matches": {}}
    matches = apa_raw.get("matches") or {}

    slim: dict = {}
    paper_n = apa_n = both = 0

    # all ids that might appear
    ids = set(refs.keys()) | set(matches.keys())
    for id_ in sorted(ids):
        arts = []
        r = refs.get(id_) or {}
        for a in (r.get("articles") or [])[:2]:
            s = slim_article(a)
            if s:
                arts.append(s)
        has_paper = bool(arts)

        m = matches.get(id_)
        apa_card = None
        if m and float(m.get("score") or 0) >= min_score:
            apa_card = slim_apa(m)

        # Ship APA when: no paper, OR paper exists and APA score is strong (>=6)
        if apa_card:
            sc = float(m.get("score") or 0)
            if not has_paper or sc >= 6.0:
                arts.append(apa_card)
                apa_n += 1
                if has_paper:
                    both += 1

        if has_paper:
            paper_n += 1
        if arts:
            slim[id_] = {"articles": arts}

    payload = json.dumps(slim, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(payload)
    OUT_GZ.write_bytes(gzip.compress(payload, compresslevel=9))
    print(
        f"wrote {OUT} ({len(payload):,} bytes)\n"
        f"  questions with any further-reading: {len(slim)}\n"
        f"  with paper: {paper_n}\n"
        f"  with APA card shipped: {apa_n} (of which also paper: {both})\n"
        f"  min_score={min_score}",
        file=sys.stderr,
    )
    print(f"wrote {OUT_GZ} ({OUT_GZ.stat().st_size:,} bytes gzipped)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
