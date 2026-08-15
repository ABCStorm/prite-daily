#!/usr/bin/env python3
"""Rebuild Stat Cat for every question on the site.

Preference order, never inventing a number:
  1. A numeric finding taken from the MEDLINE paper already matched to
     that question (unique PMID when possible).
  2. The best unused canonical fact that is actually about this item.
  3. A least-reused specific canonical fact.
  4. A broad NIMH/CDC fallback.

Covers PRITE + Kaufman Neuro + Quizapine Therapy.
"""
from __future__ import annotations

import importlib.util
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("owl_build", HERE / "build-owl-stats.py")
owl_build = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(owl_build)

STATS = owl_build.STATS
content_text = owl_build.content_text
score = owl_build.score
speak = owl_build.speak
spoils = owl_build.spoils
MIN_SCORE = owl_build.MIN_SCORE

BANK_PRITE = ROOT / "extraction/output/questions_all.json"
BANK_THERAPY = ROOT / "public/data/therapy_questions.json"
BANK_KAUFMAN = ROOT / "reference/kaufman/questions.json"
RESEARCH = ROOT / "public/data/research_refs.json"
ALT_PAPERS = ROOT / "reference/alt-bank/papers.json"
CACHE = ROOT / "reference/research-articles/query_cache.json"
OUT = ROOT / "public/data/owl_stats.json"

STAT_PAT = re.compile(
    r"(?ix)"
    r"((?:[A-Z]|[Tt]he |[Ii]n |[Aa]mong |[Oo]f )[^.!?]{12,240}?"
    r"(?:\d[\d,]*(?:\.\d+)?\s*(?:%|percent|per\s*cent)"
    r"|(?:odds\s+ratio|hazard\s+ratio|relative\s+risk)\s*(?:of\s+)?[\d.]"
    r"|\b\d[\d,]*(?:\.\d+)?[-\s]?(?:fold|times)\b"
    r"|one\s+in\s+\d+"
    r"|\b\d[\d,]*(?:\.\d+)?\s*(?:million|billion)\b"
    r")"
    r"[^.!?]{0,180}[.!?])"
)
JUNK = re.compile(
    r"(?i)prisma|we searched|pubmed|embase|inclusion criteria|n\s*=\s*\d|"
    r"p\s*[<>=]|this review|systematic search|protocol was|registered at|"
    r"copyright|all rights reserved|supplementary"
)
STOP = {
    "about", "after", "among", "because", "patient", "patients", "treatment",
    "clinical", "study", "review", "effect", "effects", "using", "based",
    "these", "those", "which", "their", "between", "during", "system",
    "results", "methods", "background", "conclusion", "compared", "group",
}


def words(text: str) -> set[str]:
    return {
        w for w in re.findall(r"[a-z][a-z-]{4,}", (text or "").lower())
        if w not in STOP
    }


def load_questions() -> list[dict]:
    out = []
    for path in (BANK_PRITE, BANK_THERAPY, BANK_KAUFMAN):
        if path.exists() and path.stat().st_size > 100:
            out.extend(json.loads(path.read_text()))
    return out


def qid_of(q: dict) -> str:
    return f"{q['year']}-{q['q_index']}"


def extra_surface(q: dict) -> str:
    return " ".join([
        q.get("stem") or "",
        q.get("answer_text") or "",
        (q.get("quizapine") or {}).get("topic") or "",
        (q.get("quizapine") or {}).get("modality") or "",
        (q.get("kaufman") or {}).get("chapter") or "",
        q.get("prite_label") or "",
    ])


def papers_for(q: dict, research: dict, alt: dict) -> list[dict]:
    qid = qid_of(q)
    seen: set[str] = set()
    out: list[dict] = []
    for rec in (research.get(qid) or {}, alt.get(qid) or {}):
        for a in rec.get("articles") or []:
            pmid = str(a.get("pmid") or "")
            if pmid and pmid not in seen:
                seen.add(pmid)
                out.append(a)
    return out


def index_cache(needed: set[str]) -> dict[str, dict]:
    if not CACHE.exists() or not needed:
        return {}
    print(f"indexing {len(needed)} PMIDs from query cache…", file=sys.stderr)
    raw = json.loads(CACHE.read_text())
    found: dict[str, dict] = {}
    for hits in raw.values():
        if not isinstance(hits, list):
            continue
        for h in hits:
            pmid = str(h.get("pmid") or "")
            if pmid in needed and pmid not in found:
                found[pmid] = h
            if len(found) == len(needed):
                print(f"  found abstracts for {len(found)}/{len(needed)}", file=sys.stderr)
                return found
    print(f"  found abstracts for {len(found)}/{len(needed)}", file=sys.stderr)
    return found


def extract_from_hit(hit: dict, q: dict) -> dict | None:
    title = (hit.get("title") or "").strip()
    abstract = re.sub(r"<[^>]+>", " ", hit.get("abstractText") or "")
    abstract = re.sub(r"\s+", " ", abstract).strip()
    blob = f"{title}. {abstract}"
    q_words = words(extra_surface(q))
    best = None
    best_n = 0
    for m in STAT_PAT.finditer(blob):
        sent = re.sub(r"\s+", " ", m.group(1)).strip()
        if len(sent) < 40 or len(sent) > 320:
            continue
        if JUNK.search(sent):
            continue
        overlap = words(sent) & q_words
        if len(overlap) < 1:
            continue
        answer = (q.get("answer_text") or "").lower()
        nums = re.findall(r"\d[\d,]*(?:\.\d+)?", sent)
        if any(n and n in answer for n in nums):
            continue
        score_n = len(overlap) + (2 if "%" in sent or "percent" in sent.lower() else 0)
        if score_n > best_n:
            best_n = score_n
            best = sent
    if not best:
        return None
    pmid = str(hit.get("pmid") or "")
    try:
        year = int(hit["pubYear"]) if hit.get("pubYear") else None
    except (TypeError, ValueError):
        year = None
    ji = hit.get("journalInfo") or {}
    j = ji.get("journal") or {}
    journal = j.get("medlineAbbreviation") or j.get("title") or "MEDLINE"
    return {
        "stat_id": f"pmid-{pmid}",
        "sentence": best if best.endswith(".") else best + ".",
        "source_label": f"{journal}" + (f", {year}" if year else ""),
        "source_url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
        "source_year": year,
        "audio_path": f"owl/{qid_of(q)}/v1.mp3",
        "pmid": pmid,
        "overlap": best_n,
    }


def canonical_row(stat: dict, q: dict) -> dict:
    return {
        "stat_id": stat["id"],
        "sentence": speak(stat, q),
        "source_label": stat["source_label"],
        "source_url": stat["source_url"],
        "source_year": stat.get("year"),
        "audio_path": f"owl/{qid_of(q)}/v1.mp3",
    }


def leftover_query(q: dict) -> str | None:
    topic = ((q.get("quizapine") or {}).get("topic") or "").strip()
    chapter = ((q.get("kaufman") or {}).get("chapter") or "").strip()
    answer = (q.get("answer_text") or "").strip()
    phrase = ""
    if topic and len(topic) < 80:
        phrase = topic
    elif chapter:
        phrase = chapter
    elif 4 <= len(answer) <= 60:
        phrase = answer
    else:
        tags = q.get("tags") or {}
        dx = (tags.get("diagnosis") or tags.get("neuro") or tags.get("psychotherapy") or [""])[0]
        phrase = str(dx).replace("-", " ")
    phrase = re.sub(r"\s+", " ", phrase).strip()
    if len(phrase) < 4:
        return None
    return f'("{phrase}") AND (prevalence OR incidence OR "odds ratio" OR mortality) AND (SRC:MED)'


def harvest_leftovers(questions: list[dict], assigned: dict[str, dict]) -> int:
    """Pull one cited prevalence/incidence figure for items still on a broad fact."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "match_articles",
        ROOT / "scripts/research-articles/match_articles.py",
    )
    ma = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(ma)

    added = 0
    used = {row["stat_id"] for row in assigned.values() if str(row.get("stat_id") or "").startswith("pmid-")}
    leftovers = [q for q in questions if str((assigned.get(qid_of(q)) or {}).get("stat_id") or "").startswith("nimh-ami")
                 or str((assigned.get(qid_of(q)) or {}).get("stat_id") or "").startswith("nimh-smi")]
    print(f"harvesting stats for {len(leftovers)} broad-fallback questions…", file=sys.stderr)
    for i, q in enumerate(leftovers, 1):
        query = leftover_query(q)
        if not query:
            continue
        try:
            hits = ma.epmc_search(query, page_size=8)
        except Exception:
            continue
        for h in hits:
            pmid = str(h.get("pmid") or "")
            if not pmid or f"pmid-{pmid}" in used:
                continue
            row = extract_from_hit(h, q)
            if not row:
                continue
            used.add(row["stat_id"])
            assigned[qid_of(q)] = {k: v for k, v in row.items() if k not in {"pmid", "overlap"}}
            added += 1
            break
        if i % 100 == 0:
            print(f"  harvested {added}/{i}", file=sys.stderr)
    print(f"  harvested {added} leftover stats", file=sys.stderr)
    return added


def pick_canonical(q: dict, used: Counter) -> dict | None:
    content = content_text(q)
    ranked = []
    for stat in STATS:
        if stat.get("broad"):
            continue
        pts = score(stat, q, content)
        if pts < MIN_SCORE or spoils(stat, q):
            continue
        ranked.append((pts, used[stat["id"]], stat))
    ranked.sort(key=lambda t: (-t[0], t[1]))
    if not ranked:
        return None
    return canonical_row(ranked[0][2], q)


def main() -> int:
    questions = load_questions()
    print(f"questions {len(questions)}", file=sys.stderr)
    research = json.loads(RESEARCH.read_text()) if RESEARCH.exists() else {}
    alt = json.loads(ALT_PAPERS.read_text()) if ALT_PAPERS.exists() else {}

    needed: set[str] = set()
    for q in questions:
        for a in papers_for(q, research, alt):
            if a.get("pmid"):
                needed.add(str(a["pmid"]))
    by_pmid = index_cache(needed)

    used_pmid: set[str] = set()
    used_canon: Counter = Counter()
    pending: list[tuple[dict, list[dict]]] = []
    for q in questions:
        cands = []
        for a in papers_for(q, research, alt):
            hit = by_pmid.get(str(a.get("pmid") or ""))
            if not hit:
                continue
            row = extract_from_hit(hit, q)
            if row:
                cands.append(row)
        pending.append((q, cands))

    ranked_q = sorted(
        pending,
        key=lambda pair: -(pair[1][0]["overlap"] if pair[1] else -1),
    )
    assigned: dict[str, dict] = {}
    unique_paper = from_paper = 0
    for q, cands in ranked_q:
        pick = next((c for c in cands if c["pmid"] not in used_pmid), None)
        reused = False
        if not pick and cands:
            pick = cands[0]
            reused = True
        if not pick:
            continue
        used_pmid.add(pick["pmid"])
        assigned[qid_of(q)] = {k: v for k, v in pick.items() if k not in {"pmid", "overlap"}}
        from_paper += 1
        if not reused:
            unique_paper += 1

    out: dict[str, dict] = {}
    from_canon = 0
    for q, _cands in pending:
        qid = qid_of(q)
        if qid in assigned:
            out[qid] = assigned[qid]
            continue
        row = pick_canonical(q, used_canon)
        if not row:
            continue
        used_canon[row["stat_id"]] += 1
        out[qid] = row
        from_canon += 1

    harvested = harvest_leftovers(questions, out)

    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    paper_n = sum(1 for v in out.values() if str(v.get("stat_id") or "").startswith("pmid-"))
    print(f"wrote {len(out)} -> {OUT}")
    print(f"first-pass paper-derived {from_paper} (unique PMID {unique_paper})")
    print(f"harvested leftovers {harvested}")
    print(f"total paper-derived {paper_n}")
    print(f"canonical leftovers {len(out) - paper_n}")
    reuse = Counter(v["stat_id"] for v in out.values() if not str(v["stat_id"]).startswith("pmid-"))
    print("canonical reuse:", reuse.most_common(8))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
