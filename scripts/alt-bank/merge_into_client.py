#!/usr/bin/env python3
"""Merge alt-bank paper + podcast matches into the public client sidecars.

Papers: pick a unique PMID per question when the candidate list allows.
Podcasts: already uniquified by match_podcasts.mjs.
"""
from __future__ import annotations

import gzip
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAPER_SRC = ROOT / "reference" / "alt-bank" / "papers.json"
POD_SRC = ROOT / "reference" / "alt-bank" / "podcasts.json"
RESEARCH_OUT = ROOT / "public" / "data" / "research_refs.json"
POD_OUT = ROOT / "public" / "data" / "podcasts.json"


def slim_article(a: dict) -> dict | None:
    pmid = a.get("pmid")
    title = (a.get("title") or "").strip()
    if not pmid or not title:
        return None
    urls = dict(a.get("urls") or {})
    if "pubmed" not in urls:
        urls["pubmed"] = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
    urls = {k: v for k, v in urls.items() if v}
    return {
        "pmid": str(pmid),
        "pmcid": a.get("pmcid"),
        "doi": a.get("doi"),
        "title": title,
        "journal": a.get("journal") or "",
        "year": a.get("year"),
        "is_open_access": bool(a.get("is_open_access")),
        "is_reviewish": bool(a.get("is_reviewish")),
        "why": a.get("relevance_sentence") or a.get("why") or "",
        "relevance_sentence": a.get("relevance_sentence") or a.get("why") or "",
        "url": a.get("url") or urls.get("pmc") or urls.get("pubmed"),
        "urls": urls,
    }


STOP = {
    "about", "after", "among", "because", "before", "being", "between", "during",
    "patient", "patients", "resident", "therapy", "treatment", "treatments",
    "clinical", "psychiatry", "psychiatric", "disorder", "disorders", "symptom",
    "symptoms", "diagnosis", "which", "their", "these", "those", "would",
    "should", "could", "using", "based", "most", "more", "than", "with", "from",
    "that", "this", "have", "been", "will", "also", "into", "over", "under",
    "such", "only", "other", "when", "what", "review", "study", "effect",
    "effects", "central", "peripheral", "nervous", "system", "involvement",
    "systematic", "covid", "coronavirus", "digital", "construction", "starting",
    "matching", "specific", "activity", "monitoring", "importance", "children",
    "childhood", "adults", "human", "humans", "model", "models", "reflex",
    "function", "functions", "common", "regions", "diverse", "demands",
}


def content_words(text: str) -> set[str]:
    return {
        w for w in (text or "").lower().replace("-", " ").split()
        if len(w) >= 5 and w.isalpha() and w not in STOP
    }


CLINICAL = {
    "psychotherapy", "psychodynamic", "cognitive", "behavioral", "dialectical",
    "motivational", "interpersonal", "transference", "mentalization", "exposure",
    "alliance", "borderline", "depression", "depressive", "anxiety", "trauma",
    "ptsd", "epilepsy", "seizure", "seizures", "stroke", "dementia", "parkinson",
    "migraine", "headache", "myasthenia", "sclerosis", "aphasia", "neuropathy",
    "insomnia", "narcolepsy", "tremor", "dystonia", "catatonia", "delirium",
    "clozapine", "lithium", "valproate", "lamotrigine", "serotonin", "dopamine",
    "psychosis", "schizophrenia", "bipolar", "ocd", "adhd", "autism",
}

JUNK_TITLE = (
    "prisma", "plant biotech", "aav vector", "gene transfer", "rna structural",
    "microplastic", "covid-19 pandemic on mental", "systematic reviews and meta-analyses: the prisma",
    "gina's", "sepsis campaign", "quantum machine", "spatial transcriptom",
    "falciparum", "air poll", "multi-omics", "gm crops",
)


def paper_on_topic(article: dict, rec: dict) -> bool:
    title = article.get("title") or ""
    tl = title.lower()
    if any(j in tl for j in JUNK_TITLE):
        return False
    title_w = content_words(title)
    focus = rec.get("focus") or {}
    topic_w = content_words(
        " ".join(
            [
                focus.get("answer") or "",
                " ".join(focus.get("phrases") or []),
                rec.get("answer_text") or "",
                rec.get("stem_preview") or "",
            ]
        )
    )
    overlap = {w for w in (title_w & topic_w) if len(w) >= 6}
    if not overlap:
        return False
    if overlap & CLINICAL:
        return True
    if any(w.endswith("therapy") or w.endswith("phobia") or w.endswith("lepsy") for w in title_w | topic_w):
        return True
    return len(overlap) >= 2


def uniquify_papers(raw: dict) -> dict[str, dict]:
    # Highest-scoring first-choice gets first claim on a PMID.
    ranked = []
    for qid, rec in raw.items():
        arts = [a for a in (rec.get("articles") or []) if paper_on_topic(a, rec)]
        if not arts:
            continue
        ranked.append((float(arts[0].get("score") or 0), qid, arts))
    ranked.sort(reverse=True)
    used: set[str] = set()
    out: dict[str, dict] = {}
    unique = reused = 0
    for _score, qid, arts in ranked:
        pick = None
        shared = False
        for a in arts:
            pmid = str(a.get("pmid") or "")
            if pmid and pmid not in used:
                pick = a
                used.add(pmid)
                unique += 1
                break
        if pick is None:
            pick = arts[0]
            shared = True
            reused += 1
        slim = slim_article(pick)
        if not slim:
            continue
        if shared:
            slim["why"] = (slim.get("why") or "Matched this item.") + " (best available paper; also used nearby)"
        out[qid] = {"articles": [slim]}
    print(f"papers: {len(out)} questions  unique PMIDs={unique}  reused={reused}")
    return out


def main() -> int:
    paper_add: dict[str, dict] = {}
    if PAPER_SRC.exists():
        paper_add = uniquify_papers(json.loads(PAPER_SRC.read_text()))
    existing_r = json.loads(RESEARCH_OUT.read_text()) if RESEARCH_OUT.exists() else {}
    existing_r.update(paper_add)
    payload = json.dumps(existing_r, ensure_ascii=False, separators=(",", ":")).encode()
    RESEARCH_OUT.write_bytes(payload)
    RESEARCH_OUT.with_suffix(".json.gz").write_bytes(gzip.compress(payload, 9))
    print(f"research_refs.json now {len(existing_r)} questions")

    if POD_SRC.exists():
        pod_add = json.loads(POD_SRC.read_text())
        from collections import Counter
        counts = Counter(refs[0]["videoId"] for refs in pod_add.values() if refs)
        cleaned = {}
        dropped = 0
        for qid, refs in pod_add.items():
            r = refs[0]
            why = r.get("why") or ""
            hit_n = why.count(",") + 1 if "Matched this item on" in why else 0
            # A video reused on a crowd of loosely related items is the old
            # "one lecture for the whole chapter" problem — drop those.
            if counts[r["videoId"]] > 8 and hit_n < 2:
                dropped += 1
                continue
            cleaned[qid] = refs
        existing_p = json.loads(POD_OUT.read_text()) if POD_OUT.exists() else {}
        existing_p.update(cleaned)
        POD_OUT.write_text(json.dumps(existing_p, ensure_ascii=False, separators=(",", ":")))
        print(f"podcasts.json now {len(existing_p)} questions (+{len(cleaned)} alt-bank, dropped {dropped} weak reuses)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
