#!/usr/bin/env python3
"""
Residual re-query pilot (coverage idea #2 + multi-source search).

For questions that still have zero shipped Further-reading papers, rebuild a
wide candidate shortlist using BETTER queries than phase-1:

  - teaching-point phrases extracted from the explanation (not just answer)
  - intent templates (side effect / prevalence / first-line / mechanism / forensic)
  - PubMed E-utilities (MEDLINE) + Europe PMC + OpenAlex (DOI→PMID when possible)

Then write judge batches (same schema as gap_rematch_pilot) so an LLM can pick
or decline. This measures whether multi-source + explanation-aware queries find
papers that the original EPMC keyword pool missed.

Usage:
  python3 scripts/research-articles/requery_residual_pilot.py --sample 120 --seed 1
  python3 scripts/research-articles/requery_residual_pilot.py --sample 120 --workers 8
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))
from match_articles import (  # noqa: E402
    QUESTIONS,
    OUT_REFS,
    clinical_focus,
    epmc_search,
    score_hit,
    journal_name,
    journal_tier,
    pub_types,
    is_reviewish,
    qid,
    tokens,
)

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / "reference" / "research-articles" / "requery_pilot"

TOP_K = 18
EXPL_CHARS = 900
ABSTRACT_CHARS = 500
USER_AGENT = "prite-daily-requery/1.0 (educational; contact: local)"

# Shared polite rate limit for NCBI / OpenAlex.
# With NCBI_API_KEY, NCBI allows ~10 rps; without key ~3 rps. Stay under.
_api_lock = threading.Lock()
_last_api = 0.0
_min_interval = 0.15  # ~6–7 rps with key; still polite without


def _rate_wait() -> None:
    global _last_api
    with _api_lock:
        now = time.time()
        delay = _min_interval - (now - _last_api)
        if delay > 0:
            time.sleep(delay)
        _last_api = time.time()


def _http_get(url: str, timeout: float = 25.0, retries: int = 4) -> bytes:
    last_err: Exception | None = None
    for attempt in range(retries):
        _rate_wait()
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code in (429, 500, 502, 503):
                time.sleep(1.5 * (attempt + 1) + (0.3 * attempt))
                continue
            raise
        except Exception as e:
            last_err = e
            time.sleep(0.8 * (attempt + 1))
    raise last_err or RuntimeError("http get failed")


# ---------------------------------------------------------------------------
# Teaching-point extraction & intent templates
# ---------------------------------------------------------------------------

INTENT_PATTERNS: list[tuple[str, re.Pattern[str], list[str]]] = [
    (
        "side_effect",
        re.compile(
            r"side effect|adverse|toxicity|black box|withdrawal|overdose|"
            r"agranulocyt|tardive|akathisia|dystonia|serotonin syndrome|nms|"
            r"neuroleptic malignant|psoriasis|weight gain|metabolic|qtc|seizure",
            re.I,
        ),
        ["adverse effects", "toxicity", "side effects"],
    ),
    (
        "prevalence_epi",
        re.compile(
            r"prevalen|inciden|comorbid|epidemiolog|most common|risk factor|"
            r"highest risk|odds ratio|relative risk",
            re.I,
        ),
        ["prevalence", "epidemiology", "comorbidity"],
    ),
    (
        "first_line_tx",
        re.compile(
            r"first[- ]line|treatment of choice|most effective|efficacy|"
            r"recommended|guideline|gold standard",
            re.I,
        ),
        ["treatment", "guideline", "efficacy", "randomized"],
    ),
    (
        "mechanism",
        re.compile(
            r"mechanism of action|receptor|binds to|agonist|antagonist|"
            r"pharmacokinet|half-?life|metaboli|cytochrome|inhibits",
            re.I,
        ),
        ["mechanism", "pharmacology", "receptor"],
    ),
    (
        "forensic",
        re.compile(
            r"tarasoff|duty to|malpractice|forensic|competenc|capacity|"
            r"insanity|commitment|informed consent",
            re.I,
        ),
        ["forensic psychiatry", "legal", "malpractice"],
    ),
    (
        "neuroanatomy",
        re.compile(
            r"nucleus|gyrus|tract|pathway|lesion|stroke|mri|ct |eeg|"
            r"hippocamp|amygdala|prefrontal|basal ganglia",
            re.I,
        ),
        ["neuroanatomy", "brain", "neuroimaging"],
    ),
]


STOP_EXPL = {
    "the", "and", "for", "with", "that", "this", "from", "are", "was", "were",
    "been", "have", "has", "had", "not", "but", "also", "which", "when", "than",
    "into", "may", "can", "will", "should", "would", "could", "patient", "patients",
    "treatment", "disorder", "disorders", "symptoms", "symptom", "clinical",
    "psychiatry", "psychiatric", "however", "because", "about", "other", "more",
    "most", "such", "these", "those", "their", "there", "between", "among",
    "using", "used", "use", "often", "usually", "typically", "including",
    "associated", "include", "includes", "important", "common", "commonly",
}


def detect_intents(text: str) -> list[str]:
    found = []
    for name, pat, _ in INTENT_PATTERNS:
        if pat.search(text):
            found.append(name)
    return found or ["general"]


def expl_key_phrases(expl: str, answer: str, max_phrases: int = 4) -> list[str]:
    """Pull contentful n-grams from the explanation for query building."""
    if not expl:
        return []
    # Prefer first 2 sentences (usually the teaching point)
    sents = re.split(r"(?<=[.!?])\s+", expl.strip())
    head = " ".join(sents[:2])
    # quoted phrases
    phrases = re.findall(r'"([^"]{4,60})"', head)
    # multiword medical-ish tokens
    words = re.findall(r"[A-Za-z][A-Za-z0-9\-]{2,}", head)
    content = [w for w in words if w.lower() not in STOP_EXPL and len(w) >= 4]
    # bigrams
    for i in range(len(content) - 1):
        big = f"{content[i]} {content[i+1]}"
        if answer and answer.lower() in big.lower():
            phrases.insert(0, big)
        elif len(big) >= 8:
            phrases.append(big)
    # unigrams that look specific
    for w in content:
        if len(w) >= 7 or w[0].isupper():
            phrases.append(w)
    # dedupe preserve order
    out: list[str] = []
    seen = set()
    ans_l = (answer or "").lower()
    for p in phrases:
        pl = p.lower().strip()
        if pl in seen or pl == ans_l:
            continue
        seen.add(pl)
        out.append(p.strip())
        if len(out) >= max_phrases:
            break
    return out


def build_improved_queries(q: dict, focus: dict) -> list[tuple[str, str]]:
    """
    Return (name, free-text query) pairs — NOT Europe-PMC-syntax.
    Callers adapt per backend.
    """
    ans = (focus.get("answer") or q.get("answer_text") or "").strip()
    stem = (q.get("stem") or "")[:400]
    expl = (q.get("explanation_text") or "")[:1200]
    blob = f"{stem} {ans} {expl}"
    intents = detect_intents(blob)
    phrases = expl_key_phrases(expl, ans)
    anchors = []
    # reuse clinical_focus stem content lightly
    for w in (focus.get("stem_content") or [])[:4]:
        if w.lower() not in (ans or "").lower():
            anchors.append(w)
    for p in phrases:
        if p not in anchors:
            anchors.append(p)

    queries: list[tuple[str, str]] = []

    def add(name: str, parts: list[str]) -> None:
        parts = [p for p in parts if p and len(p.strip()) >= 3]
        if not parts:
            return
        # unique
        seen = set()
        clean = []
        for p in parts:
            pl = p.lower()
            if pl in seen:
                continue
            seen.add(pl)
            clean.append(p)
        qstr = " ".join(clean[:5])
        queries.append((name, qstr))

    # Core: answer + teaching phrase
    if ans and phrases:
        add("ans_expl0", [ans, phrases[0]])
    if ans and len(phrases) >= 2:
        add("ans_expl1", [ans, phrases[0], phrases[1]])
    if ans and anchors:
        add("ans_anchor", [ans, anchors[0]])

    # Intent-boosted
    intent_boosts = {name: boosts for name, _, boosts in INTENT_PATTERNS}
    for intent in intents[:2]:
        boosts = intent_boosts.get(intent, [])
        if ans and boosts:
            add(f"intent_{intent}", [ans, boosts[0]] + (phrases[:1] or anchors[:1]))

    # Explanation-only teaching point (when answer is a single short token like Lithium)
    if phrases:
        add("expl_only", phrases[:3])
    if len(ans.split()) <= 2 and phrases:
        add("short_ans_disambig", [ans] + phrases[:2] + anchors[:1])

    # First-line / review bias for general clinical
    if ans:
        add("ans_review", [ans, "review psychiatry"])
        add("ans_guideline", [ans, "practice guideline"])

    # Deduplicate by query text
    seen_q = set()
    out = []
    for name, qt in queries:
        key = qt.lower()
        if key in seen_q:
            continue
        seen_q.add(key)
        out.append((name, qt))
    return out[:10]


# ---------------------------------------------------------------------------
# Multi-source search → unified hit dicts (EPMC-compatible shape for scoring)
# ---------------------------------------------------------------------------

def _ncbi_api_key() -> str | None:
    """Optional NCBI E-utilities key (higher rate limit). From env or .env.local."""
    key = (os.environ.get("NCBI_API_KEY") or "").strip()
    if key:
        return key
    # load from project .env.local once
    env_path = ROOT / ".env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line.startswith("NCBI_API_KEY="):
                return line.split("=", 1)[1].strip().strip("'\"") or None
    return None


def pubmed_search(query: str, retmax: int = 20) -> list[dict]:
    """PubMed esearch + esummary; returns slim hit dicts with pmid."""
    try:
        api_key = _ncbi_api_key()
        params_dict = {
            "db": "pubmed",
            "term": f"({query}) AND medline[sb]",
            "retmax": str(retmax),
            "retmode": "json",
            "sort": "relevance",
        }
        if api_key:
            params_dict["api_key"] = api_key
        params = urllib.parse.urlencode(params_dict)
        data = json.loads(_http_get(f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?{params}"))
        ids = data.get("esearchresult", {}).get("idlist") or []
        if not ids:
            return []
        params2_dict = {
            "db": "pubmed",
            "id": ",".join(ids),
            "retmode": "json",
        }
        if api_key:
            params2_dict["api_key"] = api_key
        params2 = urllib.parse.urlencode(params2_dict)
        summary = json.loads(
            _http_get(f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?{params2}")
        )
        result = summary.get("result") or {}
        hits = []
        for pmid in ids:
            rec = result.get(pmid) or {}
            if not rec or rec.get("error"):
                continue
            # pub types
            pts = []
            for pt in rec.get("pubtype") or []:
                pts.append(pt)
            journal = ""
            if isinstance(rec.get("fulljournalname"), str):
                journal = rec["fulljournalname"]
            elif isinstance(rec.get("source"), str):
                journal = rec["source"]
            year = None
            pubdate = rec.get("pubdate") or ""
            m = re.search(r"(19|20)\d{2}", pubdate)
            if m:
                year = m.group(0)
            hits.append(
                {
                    "pmid": str(pmid),
                    "doi": (rec.get("elocationid") or "").replace("doi: ", "")
                    if "doi" in (rec.get("elocationid") or "").lower()
                    else None,
                    "title": (rec.get("title") or "").strip(),
                    "journalTitle": journal,
                    "pubYear": year,
                    "pubTypeList": {"pubType": pts},
                    "citedByCount": 0,
                    "isOpenAccess": "Y" if "Free" in str(rec.get("attributes") or "") else "N",
                    "abstractText": "",
                    "source": "pubmed",
                }
            )
        # fetch abstracts in batch via efetch
        if hits:
            try:
                p3 = {
                    "db": "pubmed",
                    "id": ",".join(ids[:20]),
                    "retmode": "xml",
                    "rettype": "abstract",
                }
                if api_key:
                    p3["api_key"] = api_key
                params3 = urllib.parse.urlencode(p3)
                xml_bytes = _http_get(
                    f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?{params3}"
                )
                root = ET.fromstring(xml_bytes)
                abs_by_pmid: dict[str, str] = {}
                for article in root.findall(".//PubmedArticle"):
                    pmid_el = article.find(".//PMID")
                    if pmid_el is None or not pmid_el.text:
                        continue
                    texts = []
                    for abs_el in article.findall(".//Abstract/AbstractText"):
                        texts.append("".join(abs_el.itertext()))
                    if texts:
                        abs_by_pmid[pmid_el.text] = " ".join(texts)
                for h in hits:
                    if h["pmid"] in abs_by_pmid:
                        h["abstractText"] = abs_by_pmid[h["pmid"]]
            except Exception:
                pass
        return hits
    except Exception as e:
        print(f"  pubmed err: {e}", file=sys.stderr)
        return []


def openalex_search(query: str, per_page: int = 15) -> list[dict]:
    """OpenAlex works search; keep items with PMID when possible."""
    try:
        params = urllib.parse.urlencode(
            {
                "search": query,
                "per_page": str(per_page),
                "filter": "type:article",
                "mailto": "prite-daily@local",
            }
        )
        data = json.loads(_http_get(f"https://api.openalex.org/works?{params}"))
        hits = []
        for w in data.get("results") or []:
            pmid = None
            ids = w.get("ids") or {}
            pmid_url = ids.get("pmid") or ""
            if "pubmed" in pmid_url:
                pmid = pmid_url.rstrip("/").split("/")[-1]
            # also check ids
            if not pmid:
                for loc in w.get("locations") or []:
                    src = (loc.get("source") or {}).get("display_name") or ""
                    pass
            title = (w.get("display_name") or w.get("title") or "").strip()
            if not title:
                continue
            abstract = ""
            inv = w.get("abstract_inverted_index")
            if isinstance(inv, dict):
                # rebuild abstract
                try:
                    positions: list[tuple[int, str]] = []
                    for word, idxs in inv.items():
                        for i in idxs:
                            positions.append((i, word))
                    positions.sort()
                    abstract = " ".join(w for _, w in positions)
                except Exception:
                    abstract = ""
            journal = ""
            primary = w.get("primary_location") or {}
            src = primary.get("source") or {}
            journal = src.get("display_name") or ""
            year = w.get("publication_year")
            pts = []
            if w.get("type") == "review":
                pts.append("Review")
            hits.append(
                {
                    "pmid": str(pmid) if pmid else None,
                    "doi": (ids.get("doi") or "").replace("https://doi.org/", "") or None,
                    "title": title,
                    "journalTitle": journal,
                    "pubYear": str(year) if year else None,
                    "pubTypeList": {"pubType": pts},
                    "citedByCount": w.get("cited_by_count") or 0,
                    "isOpenAccess": "Y" if (w.get("open_access") or {}).get("is_oa") else "N",
                    "abstractText": abstract[:1500],
                    "source": "openalex",
                    "openalex_id": w.get("id"),
                }
            )
        return hits
    except Exception as e:
        print(f"  openalex err: {e}", file=sys.stderr)
        return []


def epmc_free_search(query: str, page_size: int = 20) -> list[dict]:
    """Europe PMC with simpler free-text + MEDLINE filter."""
    # Escape carefully — EPMC uses its own syntax; quote multiword
    q = f'({query}) AND (SRC:MED)'
    try:
        hits = epmc_search(q, page_size=page_size)
        for h in hits:
            h["source"] = "epmc"
        return hits
    except Exception as e:
        print(f"  epmc err: {e}", file=sys.stderr)
        return []


def unify_hits(raw_hits: list[dict]) -> dict[str, dict]:
    """Dedupe by pmid, else doi, else title-hash. Prefer records with pmid."""
    by_key: dict[str, dict] = {}
    for h in raw_hits:
        pmid = h.get("pmid")
        doi = (h.get("doi") or "").lower().strip() or None
        title = (h.get("title") or "").strip().lower()
        if pmid:
            key = f"pmid:{pmid}"
        elif doi:
            key = f"doi:{doi}"
        elif title:
            key = f"title:{title[:80]}"
        else:
            continue
        prev = by_key.get(key)
        if not prev:
            by_key[key] = h
            continue
        # merge: prefer longer abstract, keep pmid
        if not prev.get("abstractText") and h.get("abstractText"):
            prev["abstractText"] = h["abstractText"]
        if not prev.get("pmid") and h.get("pmid"):
            prev["pmid"] = h["pmid"]
        if (h.get("citedByCount") or 0) > (prev.get("citedByCount") or 0):
            prev["citedByCount"] = h["citedByCount"]
        srcs = set(filter(None, [prev.get("source"), h.get("source")]))
        prev["source"] = "+".join(sorted(srcs))
    # drop non-PMID for final judge pool? Keep DOI-only as secondary but score lower.
    return by_key


def wide_candidates_requery(q: dict, sources: str = "all") -> tuple[list[dict], list[str], list[str]]:
    """sources: all | epmc | pubmed | openalex (comma-ok)."""
    focus = clinical_focus(q)
    strategies = build_improved_queries(q, focus)[:6]  # cap strategies to reduce rate load
    want = (
        {s.strip() for s in sources.split(",")}
        if sources != "all"
        else {"epmc", "pubmed", "openalex", "semantic"}
    )
    raw: list[dict] = []
    used = []
    for name, query in strategies:
        used.append(f"{name}:{query[:80]}")
        # EPMC first (more tolerant); PubMed/OpenAlex on best strategies only
        if "epmc" in want:
            raw.extend(epmc_free_search(query, page_size=15))
        if "pubmed" in want and name in (
            "ans_expl0", "short_ans_disambig", "intent_side_effect",
            "intent_first_line_tx", "intent_prevalence_epi", "ans_anchor",
        ):
            raw.extend(pubmed_search(query, retmax=10))
        if "openalex" in want and name in ("ans_expl0", "short_ans_disambig", "intent_side_effect"):
            raw.extend(openalex_search(query, per_page=8))
        # Semantic Scholar: slow public pool OK; only best strategies to limit volume
        if "semantic" in want or "semanticscholar" in want or "s2" in want:
            if name in ("ans_expl0", "short_ans_disambig", "intent_side_effect", "intent_first_line_tx"):
                try:
                    from semantic_scholar import search_papers as s2_search

                    raw.extend(s2_search(query, limit=6))
                except Exception as e:
                    print(f"  s2 err: {e}", file=sys.stderr)

    unified = unify_hits(raw)
    # Only judge items with real PMIDs (no invented IDs; DOI-only dropped for ship path)
    with_pmid = [h for h in unified.values() if h.get("pmid")]
    scored = sorted(
        ((score_hit(h, focus), h) for h in with_pmid),
        key=lambda x: x[0],
        reverse=True,
    )
    # boost multi-source agreement slightly in ranking by re-sort key
    def rank_key(item: tuple[float, dict]) -> tuple:
        s, h = item
        srcs = (h.get("source") or "").count("+")
        return (s + 3 * srcs, s)

    scored.sort(key=rank_key, reverse=True)

    out = []
    for s, hit in scored[:TOP_K]:
        jname = journal_name(hit)
        out.append(
            {
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
            }
        )
    intents = detect_intents(
        f"{q.get('stem') or ''} {q.get('answer_text') or ''} {q.get('explanation_text') or ''}"
    )
    return out, used, intents


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=120)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--batch-size", type=int, default=12)
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--out-dir", type=Path, default=None)
    ap.add_argument(
        "--sources",
        default="epmc,pubmed,semantic",
        help="Comma list: epmc,pubmed,openalex,semantic (or 'all')",
    )
    ap.add_argument(
        "--exclude-pilot",
        action="store_true",
        help="Exclude ids already judged in gap_pilot",
    )
    ap.add_argument(
        "--all-gap",
        action="store_true",
        help="Process full residual gap pool (no random subsample)",
    )
    ap.add_argument(
        "--shard",
        type=str,
        default=None,
        help="Only ids where index %% n == i, as i/n (e.g. 0/4). For parallel runs.",
    )
    ap.add_argument(
        "--batch-index-offset",
        type=int,
        default=0,
        help="Added to batch_index in output filenames (multi-shard merge)",
    )
    args = ap.parse_args()

    out_dir = args.out_dir or DEFAULT_OUT
    if not out_dir.is_absolute():
        out_dir = ROOT / out_dir
    batch_dir = out_dir / "batches"
    results_dir = out_dir / "results"
    batch_dir.mkdir(parents=True, exist_ok=True)
    results_dir.mkdir(parents=True, exist_ok=True)

    refs = json.loads(OUT_REFS.read_text())
    questions = {qid(q): q for q in json.loads(QUESTIONS.read_text())}

    gap_ids = [
        id_
        for id_, r in refs.items()
        if not r.get("articles") and id_ in questions
    ]
    if args.exclude_pilot:
        pilot_path = ROOT / "reference/research-articles/gap_pilot/pilot_ids.json"
        if pilot_path.exists():
            exclude = set(json.loads(pilot_path.read_text()))
            gap_ids = [i for i in gap_ids if i not in exclude]

    print(f"gap pool: {len(gap_ids)}", file=sys.stderr)
    if args.all_gap:
        sample_ids = sorted(gap_ids)
        print(f"full gap: {len(sample_ids)}", file=sys.stderr)
    else:
        rng = random.Random(args.seed)
        sample_ids = rng.sample(gap_ids, min(args.sample, len(gap_ids)))
        sample_ids.sort()
        print(f"sample: {len(sample_ids)} seed={args.seed}", file=sys.stderr)

    if args.shard:
        try:
            si_s, sn_s = args.shard.split("/")
            si, sn = int(si_s), int(sn_s)
            if sn <= 0 or si < 0 or si >= sn:
                raise ValueError("shard out of range")
        except Exception as e:
            raise SystemExit(f"bad --shard {args.shard!r}, want i/n") from e
        sample_ids = [id_ for j, id_ in enumerate(sample_ids) if j % sn == si]
        print(f"shard {si}/{sn}: {len(sample_ids)} ids", file=sys.stderr)

    if not sample_ids:
        print("nothing to do", file=sys.stderr)
        return 0

    results: dict[str, dict] = {}
    lock = threading.Lock()
    done = 0

    def work(id_: str) -> None:
        nonlocal done
        q = questions[id_]
        cands, used, intents = wide_candidates_requery(q, sources=args.sources)
        rec = {
            "id": id_,
            "stem": q.get("stem"),
            "options": q.get("options"),
            "answer_letter": q.get("answer_letter"),
            "answer_text": q.get("answer_text"),
            "explanation": (q.get("explanation_text") or "")[:EXPL_CHARS],
            "candidates": cands,
            "queries_used": used,
            "intents": intents,
            "pipeline": "requery_multi_source_v1",
        }
        with lock:
            results[id_] = rec
            done += 1
            if done % 10 == 0 or done == len(sample_ids):
                print(f"  {done}/{len(sample_ids)}", file=sys.stderr)

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futs = [pool.submit(work, id_) for id_ in sample_ids]
        for f in as_completed(futs):
            f.result()

    # write batches
    bs = args.batch_size
    n_batches = 0
    off = args.batch_index_offset
    for bi, start in enumerate(range(0, len(sample_ids), bs)):
        chunk = sample_ids[start : start + bs]
        bidx = off + bi
        batch = {
            "batch_index": bidx,
            "pipeline": "requery_multi_source_v1",
            "shard": args.shard,
            "questions": [results[i] for i in chunk],
        }
        (batch_dir / f"batch_{bidx:04d}.json").write_text(
            json.dumps(batch, indent=2, ensure_ascii=False) + "\n"
        )
        n_batches += 1

    with_any = sum(1 for r in results.values() if r["candidates"])
    median_c = sorted(len(r["candidates"]) for r in results.values())[len(results) // 2]
    # how many candidates are NEW vs would have been in old pool? we only have n_candidates count
    print(f"wrote {n_batches} batches -> {batch_dir}", file=sys.stderr)
    print(f"with >=1 candidate: {with_any}/{len(results)} median_pool={median_c}", file=sys.stderr)

    # summary json
    summary = {
        "sample": len(sample_ids),
        "seed": args.seed,
        "with_candidates": with_any,
        "median_pool": median_c,
        "batch_dir": str(batch_dir),
        "ids": sample_ids,
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
