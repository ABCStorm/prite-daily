#!/usr/bin/env python3
"""
Semantic Scholar Academic Graph client for residual re-query.

Supports:
  - Optional SEMANTIC_SCHOLAR_API_KEY / S2_API_KEY (header x-api-key)
  - Unauthenticated public API with slow pacing + exponential backoff on 429

We only keep hits that resolve to a real PubMed PMID (ship path requires PMIDs).
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
BASE = "https://api.semanticscholar.org/graph/v1"
USER_AGENT = "prite-daily-research-matcher/1.0 (educational; Wright State PRITE)"

_lock = threading.Lock()
_last = 0.0
# Unauth shared pool is very tight; ~1 req / 3–4s when no key.
_min_interval_no_key = 3.5
_min_interval_with_key = 1.1


def _load_key() -> str | None:
    for env_name in ("SEMANTIC_SCHOLAR_API_KEY", "S2_API_KEY", "PAPER_SEARCH_MCP_SEMANTIC_SCHOLAR_API_KEY"):
        v = (os.environ.get(env_name) or "").strip()
        if v:
            return v
    env_path = ROOT / ".env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, val = line.split("=", 1)
            if k.strip() in ("SEMANTIC_SCHOLAR_API_KEY", "S2_API_KEY"):
                val = val.strip().strip("'\"")
                if val:
                    return val
    return None


def _pace(has_key: bool) -> None:
    global _last
    interval = _min_interval_with_key if has_key else _min_interval_no_key
    with _lock:
        now = time.time()
        delay = interval - (now - _last)
        if delay > 0:
            time.sleep(delay)
        _last = time.time()


def _get_json(url: str, api_key: str | None, retries: int = 6) -> dict[str, Any]:
    last_err: Exception | None = None
    backoff = 2.0
    for attempt in range(retries):
        _pace(bool(api_key))
        headers = {"User-Agent": USER_AGENT}
        if api_key:
            headers["x-api-key"] = api_key
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=40) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code == 429:
                # Respect Retry-After if present
                ra = e.headers.get("Retry-After") if e.headers else None
                wait = float(ra) if ra and str(ra).isdigit() else backoff
                wait = min(max(wait, 2.0), 60.0)
                time.sleep(wait)
                backoff = min(backoff * 1.7, 60.0)
                continue
            if e.code in (500, 502, 503):
                time.sleep(backoff)
                backoff = min(backoff * 1.5, 40.0)
                continue
            raise
        except Exception as e:
            last_err = e
            time.sleep(backoff)
            backoff = min(backoff * 1.5, 40.0)
    raise last_err or RuntimeError("Semantic Scholar request failed")


def paper_to_hit(p: dict) -> dict | None:
    """Map S2 paper object → EPMC-like hit with pmid required."""
    ext = p.get("externalIds") or {}
    pmid = ext.get("PubMed") or ext.get("PMID")
    if not pmid:
        return None
    pmid = str(pmid).strip()
    if not pmid.isdigit():
        return None
    title = (p.get("title") or "").strip()
    if not title:
        return None
    year = p.get("year")
    abstract = (p.get("abstract") or "")[:1500]
    venue = p.get("venue") or p.get("journal") or ""
    if isinstance(venue, dict):
        venue = venue.get("name") or ""
    return {
        "pmid": pmid,
        "doi": ext.get("DOI"),
        "title": title,
        "journalTitle": venue,
        "pubYear": str(year) if year else None,
        "pubTypeList": {"pubType": []},
        "citedByCount": p.get("citationCount") or 0,
        "isOpenAccess": "Y" if p.get("isOpenAccess") else "N",
        "abstractText": abstract,
        "source": "semanticscholar",
        "s2_paper_id": p.get("paperId"),
    }


def search_papers(query: str, limit: int = 8) -> list[dict]:
    """
    Unauthenticated-or-keyed paper search. Returns EPMC-shaped hits with PMIDs.
    Slow when unauthenticated — intentional.
    """
    api_key = _load_key()
    fields = "title,year,abstract,externalIds,citationCount,venue,isOpenAccess"
    params = urllib.parse.urlencode(
        {
            "query": query,
            "limit": str(min(limit, 20)),
            "fields": fields,
        }
    )
    url = f"{BASE}/paper/search?{params}"
    try:
        data = _get_json(url, api_key)
    except Exception as e:
        print(f"  s2 search err: {e}", flush=True)
        return []
    out: list[dict] = []
    for p in data.get("data") or []:
        h = paper_to_hit(p)
        if h:
            out.append(h)
    return out


def lookup_pmid(pmid: str) -> dict | None:
    api_key = _load_key()
    fields = "title,year,abstract,externalIds,citationCount,venue,isOpenAccess"
    url = f"{BASE}/paper/PMID:{pmid}?fields={urllib.parse.quote(fields)}"
    try:
        data = _get_json(url, api_key, retries=4)
        return paper_to_hit(data)
    except Exception as e:
        print(f"  s2 lookup err: {e}", flush=True)
        return None


if __name__ == "__main__":
    import sys

    q = " ".join(sys.argv[1:]) or "clozapine suicide InterSePT"
    print(f"key={'yes' if _load_key() else 'no (public slow)'}")
    hits = search_papers(q, limit=5)
    print(f"hits with PMID: {len(hits)}")
    for h in hits:
        print(f"  {h['pmid']} {h.get('year')} {h['title'][:70]}")
