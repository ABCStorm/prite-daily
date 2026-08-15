#!/usr/bin/env python3
"""
Match each PRITE question to real research articles (no invented PMIDs).

Backend: Europe PMC REST API — search/index only. Every PMID/DOI/title comes
from the API; we never fabricate identifiers. User-facing links are PubMed /
PMC / DOI.

Quality bar:
  - MEDLINE-indexed only (SRC:MED) — hard gate against junk/predatory venues
  - Soft-demote Frontiers / MDPI / Cureus / Hindawi megajournals
  - Boost core psychiatry, neurology, and general-medicine journals
  - Prefer reviews, systematic reviews, meta-analyses, guidelines
  - Require real topical overlap with the question (answer + stem clinical terms)

Usage:
  python3 scripts/research-articles/match_articles.py --sample 50 --seed 0
  python3 scripts/research-articles/match_articles.py --all --resume --workers 10
"""

from __future__ import annotations

import argparse
import json
import random
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
QUESTIONS = ROOT / "extraction" / "output" / "questions_all.json"
OUT_DIR = ROOT / "reference" / "research-articles"
OUT_REFS = OUT_DIR / "refs.json"
OUT_CACHE = OUT_DIR / "query_cache.json"

EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"

# Shared polite rate limit across worker threads (requests/sec to Europe PMC).
_API_RATE_LOCK = threading.Lock()
_API_NEXT_OK = 0.0
_API_MIN_INTERVAL = 0.08  # ~12.5 req/s shared across all workers


def _api_rate_wait() -> None:
    global _API_NEXT_OK
    with _API_RATE_LOCK:
        now = time.monotonic()
        delay = _API_NEXT_OK - now
        _API_NEXT_OK = max(now, _API_NEXT_OK) + _API_MIN_INTERVAL
    if delay > 0:
        time.sleep(delay)

TIER1 = [
    "american journal of psychiatry", "am j psychiatry",
    "jama psychiatry", "arch gen psychiatry", "archives of general psychiatry",
    "lancet psychiatry", "the lancet psychiatry",
    "british journal of psychiatry", "br j psychiatry",
    "biological psychiatry", "biol psychiatry",
    "molecular psychiatry", "mol psychiatry",
    "neuropsychopharmacology",
    "schizophrenia bulletin", "schizophr bull",
    "schizophrenia research", "schizophr res",
    "bipolar disorders", "bipolar disord",
    "journal of clinical psychiatry", "j clin psychiatry",
    "journal of clinical psychopharmacology", "j clin psychopharmacol",
    "cns drugs", "psychopharmacology",
    "journal of the american academy of child", "j am acad child adolesc psychiatry",
    "journal of child psychology and psychiatry", "j child psychol psychiatry",
    "psychological medicine", "psychol med",
    "acta psychiatrica scandinavica", "acta psychiatr scand",
    "psychiatric services", "psychiatr serv",
    "harvard review of psychiatry", "harv rev psychiatry",
    "world psychiatry",
    "depression and anxiety", "depress anxiety",
    "journal of affective disorders", "j affect disord",
    "addiction", "drug and alcohol dependence", "drug alcohol depend",
    "alcoholism, clinical and experimental research", "alcohol clin exp res",
    "sleep", "sleep medicine reviews", "sleep med rev",
    "neurology", "annals of neurology", "ann neurol",
    "lancet neurology", "the lancet neurology", "brain",
    "jama", "new england journal of medicine", "n engl j med",
    "the lancet", "lancet", "bmj", "british medical journal",
    "cochrane database of systematic reviews", "cochrane database syst rev",
    "annual review of clinical psychology", "annu rev clin psychol",
    "psychological bulletin", "psychol bull",
    "nature medicine", "nature reviews neuroscience", "nat rev neurosci",
    "nature reviews neurology", "nat rev neurol", "neuron",
    "current opinion in psychiatry", "curr opin psychiatry",
    "international journal of neuropsychopharmacology",
    "journal of neurology, neurosurgery, and psychiatry",
    "j neurol neurosurg psychiatry",
    "epilepsia", "movement disorders", "mov disord",
    "alzheimer's & dementia", "alzheimers dement",
    "american journal of geriatric psychiatry", "am j geriatr psychiatry",
    "journal of psychiatric research", "j psychiatr res",
    "psychosomatics", "general hospital psychiatry", "gen hosp psychiatry",
    "psychosomatic medicine", "psychosom med",
    "academic psychiatry", "acad psychiatry",
    "pediatrics", "journal of pediatrics", "j pediatr",
    "developmental medicine and child neurology",
    "american journal of public health", "am j public health",
    "clinical pharmacology and therapeutics", "clin pharmacol ther",
    "british journal of clinical pharmacology", "br j clin pharmacol",
    "diabetologia", "diabetes care",
    "archives of sexual behavior", "arch sex behav",
    "journal of sex & marital therapy",
    "forensic science international", "journal of forensic sciences",
    "journal of the american academy of psychiatry and the law",
    "jaapl", "behavioral sciences & the law",
]

SOFT_DEMOTE = [
    "frontiers in", "front psychiatry", "front psychol", "front neurol",
    "frontiers in psychiatry", "frontiers in psychology", "frontiers in neurology",
    "mdpi", "international journal of environmental research and public health",
    "ijerph", "cureus", "hindawi", "biomed research international", "biomed res int",
    "scientific reports", "plos one", "medicine (baltimore)", "medicine (baltim)",
    "healthcare (basel)", "brain sciences", "brainsci", "psychiatry international",
    "journal of clinical medicine", "j clin med", "medicines (basel)",
    "f1000research", "peerj", "heliyon", "sage open",
]

# Noise words for query building / scoring
STOPWORDS = {
    "a", "an", "the", "of", "to", "and", "or", "in", "on", "for", "with", "by",
    "is", "are", "was", "were", "be", "been", "being", "that", "this", "these",
    "those", "which", "who", "whom", "whose", "from", "as", "at", "into", "than",
    "then", "not", "no", "nor", "but", "if", "when", "while", "during", "after",
    "before", "most", "more", "less", "very", "also", "may", "can", "could",
    "would", "should", "must", "patient", "patients", "year", "years", "old",
    "following", "presents", "presented", "presenting", "history", "symptoms",
    "symptom", "findings", "finding", "treatment", "treatments", "likely", "best",
    "next", "step", "appropriate", "diagnosis", "diagnosed", "disorder",
    "disorders", "condition", "conditions", "feature", "features",
    "characteristic", "characteristics", "associated", "among", "including",
    "include", "includes", "about", "over", "under", "between", "within",
    "without", "such", "other", "another", "each", "both", "all", "any", "some",
    "their", "his", "her", "its", "they", "them", "he", "she", "it", "we", "our",
    "you", "your", "i", "me", "my", "has", "have", "had", "does", "do", "did",
    "will", "shall", "versus", "vs", "eg", "ie", "etc", "via", "per", "one",
    "two", "three", "four", "five", "six", "first", "second", "third", "week",
    "weeks", "month", "months", "day", "days", "hour", "hours", "man", "woman",
    "male", "female", "boy", "girl", "child", "children", "adult", "adults",
    "resident", "physician", "doctor", "nurse", "because", "denies", "reports",
    "report", "reported", "brought", "seen", "evaluated", "evaluation",
    "describes", "described", "describe", "always", "often", "sometimes",
    "never", "begin", "begins", "began", "remit", "remits", "late", "early",
    "several", "many", "few", "new", "prior", "previous", "currently",
    "current", "recent", "recently", "ago", "what", "how", "why", "where",
    "refers", "refer", "extent", "often", "provides", "strongest", "evidence",
    "clinical", "decision", "making", "component", "components", "common",
    "commonly", "highly", "most", "least", "potential", "potentially",
}


def qid(q: dict) -> str:
    return f"{q['year']}-{q['q_index']}"


def tokens(text: str) -> list[str]:
    words = re.findall(r"[A-Za-zα-ωΑ-Ω0-9][A-Za-zα-ωΑ-Ω0-9\-]{1,}", (text or "").lower())
    out = []
    for w in words:
        # normalize greek-ish receptor tokens already ascii
        if w in STOPWORDS:
            continue
        if w.isdigit():
            continue
        if len(w) < 3 and w not in {"maoi", "ect", "tms", "ocd", "ptsd", "gad", "adhd", "ssri", "snri", "cbt", "dbs", "rem", "nrem", "eeg", "mri", "ct", "pet", "csf", "iep", "act", "daly", "qaly"}:
            continue
        out.append(w)
    return out


def journal_name(hit: dict) -> str:
    ji = hit.get("journalInfo") or {}
    j = ji.get("journal") or {}
    return (
        j.get("title")
        or j.get("medlineAbbreviation")
        or j.get("isoabbreviation")
        or ""
    )


def journal_tier(name: str) -> str:
    n = (name or "").lower().strip()
    # Prefer exact / abbreviation matches over bare substring so
    # "Neurology international" does not inherit the "neurology" tier-1 boost.
    for t in TIER1:
        if n == t or n.startswith(t + " ") or n.startswith(t + ".") or n.startswith(t + ":"):
            return "tier1"
        # short abbreviations: whole-token match
        if len(t) <= 12 and re.search(rf"(^|[\s\(]){re.escape(t)}([\s\.\):]|$)", n):
            return "tier1"
        # longer titles: substring OK
        if len(t) > 12 and t in n:
            return "tier1"
    for d in SOFT_DEMOTE:
        if d in n:
            return "demote"
    return "ok"


def pub_types(hit: dict) -> list[str]:
    pt = hit.get("pubTypeList") or {}
    raw = pt.get("pubType") or []
    if isinstance(raw, str):
        return [raw]
    return list(raw)


def is_reviewish(types: list[str]) -> bool:
    joined = " ".join(types).lower()
    return any(
        k in joined
        for k in (
            "review", "systematic", "meta-analysis", "metaanalysis",
            "guideline", "practice guideline", "consensus",
        )
    )


def clinical_focus(q: dict) -> dict[str, Any]:
    """
    Build the clinical focus for searching/scoring.
    Prioritize answer_text; only use tags that support the answer, not every
    distractor medication that happens to be listed on the item.
    """
    tags = q.get("tags") or {}
    raw_answer = (q.get("answer_text") or "").strip()
    topic = ((q.get("quizapine") or {}).get("topic") or "").strip()
    chapter = ((q.get("kaufman") or {}).get("chapter") or "").strip()
    # Therapy options are long spoken sentences — they make useless PMC queries.
    # Search the teaching topic / chapter name instead, keep the option as a stem anchor.
    if topic and (len(raw_answer) > 90 or q.get("quizapine")):
        answer = topic
    elif chapter and len(raw_answer) > 90:
        answer = chapter
    else:
        answer = raw_answer
    # multi-select answers: "A / B"
    answer_parts = [p.strip() for p in re.split(r"\s*/\s*", answer) if p.strip()]
    ans_toks = tokens(answer)
    stem_toks = tokens(q.get("stem") or "")

    # Keep stem medical content words (longer / rarer-ish)
    stem_content = []
    seen = set()
    for w in stem_toks:
        if w in seen:
            continue
        seen.add(w)
        if len(w) >= 5 or w in {
            "maoi", "ect", "tms", "ocd", "ptsd", "gad", "adhd", "ssri", "snri",
            "cbt", "dbs", "rem", "lithium", "clozapine", "haloperidol", "dopamine",
            "serotonin", "glutamate", "gaba", "opioid", "opiate", "naltrexone",
            "disulfiram", "methadone", "buprenorphine", "thiamine", "wernicke",
            "delirium", "dementia", "psychosis", "mania", "catatonia", "akathisia",
            "dystonia", "parkinsonism", "tardive", "autism", "grief", "bereavement",
            "metformin", "psoriasis", "linezolid", "meperidine", "codeine",
            "caffeine", "nicotine", "tobacco", "alcohol", "cannabis", "cocaine",
            "heroin", "amphetamine", "methylphenidate", "fluoxetine", "sertraline",
            "valproate", "lamotrigine", "carbamazepine", "olanzapine", "quetiapine",
            "aripiprazole", "risperidone", "ziprasidone", "brexpiprazole",
            "hippocampus", "amygdala", "prefrontal", "striatum", "accumbens",
            "tegmental", "raphe", "locus", "ceruleus", "polysomnography",
            "hydrocephalus", "stroke", "seizure", "epilepsy", "migraine",
            "validity", "reliability", "sensitivity", "specificity", "daly",
            "resilience", "alliance", "transference", "countertransference",
            "exposure", "desensitization", "sensate", "assertive", "community",
            "forensic", "malpractice", "capacity", "competence", "tarasoff",
        }:
            stem_content.append(w)
        if len(stem_content) >= 10:
            break

    diagnoses = [d.replace("-", " ") for d in (tags.get("diagnosis") or [])[:2]]
    # Only include a medication tag if it appears in the answer or stem
    meds = []
    for m in tags.get("medication") or []:
        m_plain = m.replace("-", " ").lower()
        blob = f"{answer} {q.get('stem') or ''}".lower()
        if m_plain in blob or any(tok in blob for tok in m_plain.split() if len(tok) > 3):
            meds.append(m_plain)
    meds = meds[:2]

    neuros = [n.replace("-", " ") for n in (tags.get("neuro") or [])[:2]]
    psychotx = [p.replace("-", " ") for p in (tags.get("psychotherapy") or [])[:1]]

    # Primary topic phrases for phrase search
    phrases: list[str] = []
    if topic:
        phrases.append(topic[:120])
    if chapter:
        phrases.append(chapter)
    for part in answer_parts:
        # strip trailing punctuation
        p = re.sub(r"[.\s]+$", "", part).strip()
        if len(p) >= 4:
            phrases.append(p)
    phrases.extend(diagnoses)
    phrases.extend(meds)
    # common multiword stem concepts
    stem_lower = (q.get("stem") or "").lower()
    for phrase in (
        "assertive community", "serotonin syndrome", "neuroleptic malignant",
        "tardive dyskinesia", "major depressive", "bipolar disorder",
        "borderline personality", "antisocial personality", "alcohol use",
        "substance use", "posttraumatic stress", "obsessive compulsive",
        "attention-deficit", "attention deficit", "autism spectrum",
        "intellectual disability", "light therapy", "seasonal affective",
        "monoamine oxidase", "extrapyramidal", "wernicke encephalopathy",
        "korsakoff", "decision making capacity", "informed consent",
        "therapeutic alliance", "motivational interviewing",
        "cognitive behavioral", "electroconvulsive", "transcranial magnetic",
        "disability-adjusted", "randomized control", "meta-analysis",
        "individualized education", "civil rights",
    ):
        if phrase in stem_lower or phrase in answer.lower():
            phrases.append(phrase)

    # Dedup phrases
    seen_p = set()
    phrases_u = []
    for p in phrases:
        k = p.lower()
        if k not in seen_p:
            seen_p.add(k)
            phrases_u.append(p)

    focus_terms = []
    for bucket in (ans_toks, tokens(" ".join(diagnoses + meds + neuros)), stem_content):
        for t in bucket:
            if t not in focus_terms:
                focus_terms.append(t)

    return {
        "answer": answer,
        "answer_parts": answer_parts,
        "ans_toks": ans_toks,
        "phrases": phrases_u[:6],
        "focus_terms": focus_terms[:16],
        "stem_content": stem_content,
        "diagnoses": diagnoses,
        "meds": meds,
    }


def _ans_query_clause(focus: dict) -> str:
    ans = focus["answer"]
    if not ans:
        return ""
    if " " in ans and len(ans) < 80:
        return f'"{ans}"'
    toks_ = focus["ans_toks"][:5]
    if toks_:
        return " AND ".join(f"({t})" for t in toks_)
    return f"({ans})"


# Generic stem words that are not useful co-terms for disambiguation
WEAK_ANCHORS = {
    "requested", "regarding", "participation", "participating",
    "encouraged", "explore", "bodies", "except", "areas", "homework",
    "exercise", "description", "insufficient", "response", "monotherapy",
    "augmenting", "agents", "effective", "depressed", "addition",
    "atypical", "always", "begin", "remit", "spring", "denies",
    "suicidal", "ideation", "husband", "because", "medications",
    "medication", "associated", "exacerbations", "exacerbation",
    "following", "component", "components", "commonly", "common",
    "potentially", "lethal", "interaction", "interactions", "studies",
    "suggest", "controlled", "reducing", "inpatient", "hospital",
    "quality", "life", "severely", "mechanism", "mechanisms", "reduce",
    "weight", "body", "which", "most", "likely", "remain", "adulthood",
    "episodes", "recurrent", "35-year-old", "winter", "parent",
    "evaluates", "psychiatrist", "consultation", "psychiatry",
    "endorsing", "medically", "hospitalized", "patient", "patients",
}


def _stem_anchors(focus: dict, ans: str) -> list[str]:
    """Pick 1–2 clinical anchors from the stem that are not already in the answer."""
    ans_l = (ans or "").lower()
    preferred = []
    for w in focus["stem_content"]:
        wl = w.lower()
        if wl in ans_l or wl in WEAK_ANCHORS:
            continue
        preferred.append(w)
    # Prefer longer, more specific tokens
    preferred = sorted(set(preferred), key=lambda w: (-len(w), w))
    return preferred[:3]


def build_queries(q: dict, focus: dict) -> list[tuple[str, str]]:
    """Return ordered (name, query) strategies, MEDLINE-only."""
    strategies: list[tuple[str, str]] = []
    review = (
        '(PUB_TYPE:"Review" OR PUB_TYPE:"Systematic Review" OR '
        'PUB_TYPE:"Meta-Analysis" OR PUB_TYPE:"Guideline" OR '
        'PUB_TYPE:"Practice Guideline")'
    )

    # Named psychotherapy / neurology chapter queries beat long option text.
    MOD_Q = {
        "Psychodynamic": "psychodynamic psychotherapy",
        "CBT": "cognitive behavioral therapy",
        "DBT": "dialectical behavior therapy",
        "MI": "motivational interviewing",
        "IPT": "interpersonal psychotherapy",
        "ACT": "acceptance and commitment therapy",
        "MBT": "mentalization based treatment",
        "TFP & Supportive": "transference focused psychotherapy",
        "Trauma-focused": "trauma focused psychotherapy PTSD",
        "Group, family & couples": "family therapy group psychotherapy",
        "Integration": "psychotherapy integration",
        "Psychosocial": "psychosocial intervention psychiatry",
    }
    quiz = q.get("quizapine") or {}
    kauf = q.get("kaufman") or {}
    if quiz.get("modality"):
        mq = MOD_Q.get(quiz["modality"], quiz["modality"])
        topic_bits = tokens(quiz.get("topic") or "")[:4]
        if topic_bits:
            tq = " AND ".join(f"({t})" for t in topic_bits[:3])
            strategies.append(("tx_mod_topic_review", f'("{mq}") AND ({tq}) AND (SRC:MED) AND {review}'))
            strategies.append(("tx_mod_topic_any", f'("{mq}") AND ({tq}) AND (SRC:MED)'))
        strategies.append(("tx_mod_review", f'("{mq}") AND (SRC:MED) AND {review}'))
    if kauf.get("chapter"):
        ch = kauf["chapter"]
        strategies.append(("kf_ch_review", f'("{ch}") AND (psychiatry OR neuropsychiatry OR neurology) AND (SRC:MED) AND {review}'))
        ans_bits = tokens(q.get("answer_text") or "")[:3]
        if ans_bits:
            aq = " AND ".join(f"({t})" for t in ans_bits)
            strategies.append(("kf_ch_ans", f'("{ch}") AND ({aq}) AND (SRC:MED)'))

    ans = focus["answer"]
    ans_q = _ans_query_clause(focus)
    anchors = _stem_anchors(focus, ans)

    # 1) Answer alone — often the purest query ("Serotonin syndrome", "Meperidine")
    if ans_q:
        strategies.append(("answer_alone_review", f"({ans_q}) AND (SRC:MED) AND {review}"))
        strategies.append(("answer_alone_any", f"({ans_q}) AND (SRC:MED)"))

    # 2) Answer + one stem clinical anchor (metformin, psoriasis, seasonal, MAOI…)
    if ans_q and anchors:
        a0 = anchors[0]
        strategies.append(
            ("answer_anchor_review", f"({ans_q}) AND ({a0}) AND (SRC:MED) AND {review}")
        )
        strategies.append(
            ("answer_anchor_any", f"({ans_q}) AND ({a0}) AND (SRC:MED)")
        )
        if len(anchors) >= 2:
            a1 = anchors[1]
            strategies.append(
                ("answer_2anchor", f"({ans_q}) AND ({a0}) AND ({a1}) AND (SRC:MED)")
            )

    # 3) Two clinical phrases when available (e.g. lithium + psoriasis)
    phrase_pool = []
    for p in focus["phrases"]:
        # skip pure answer duplicates later handled
        phrase_pool.append(p)
    for a in anchors:
        if a not in phrase_pool:
            phrase_pool.append(a)
    if len(phrase_pool) >= 2:
        p0, p1 = phrase_pool[0], phrase_pool[1]
        if p0.lower() != p1.lower():
            strategies.append(
                ("phrases_review", f'("{p0}" AND "{p1}") AND (SRC:MED) AND {review}')
            )
            strategies.append(
                ("phrases_any", f'("{p0}" AND "{p1}") AND (SRC:MED)')
            )

    # 4) Broader bag fallback
    bag_terms = []
    for t in focus["ans_toks"][:3] + anchors[:2] + focus["focus_terms"][:3]:
        if t not in bag_terms:
            bag_terms.append(t)
    if len(bag_terms) >= 2:
        bag_q = " AND ".join(f"({t})" for t in bag_terms[:4])
        strategies.append(("bag_review", f"({bag_q}) AND (SRC:MED) AND {review}"))
        strategies.append(("bag_any", f"({bag_q}) AND (SRC:MED)"))

    seen = set()
    out = []
    for name, query in strategies:
        if query in seen:
            continue
        seen.add(query)
        out.append((name, query))
    return out


def topical_overlap(hit: dict, focus: dict) -> dict[str, float]:
    """How well does this paper match the clinical focus?"""
    title = (hit.get("title") or "").lower()
    abstract = (hit.get("abstractText") or "").lower()
    blob = title + " " + abstract

    ans_toks = focus["ans_toks"]
    focus_terms = focus["focus_terms"]

    def hits(terms: list[str], text: str) -> int:
        return sum(1 for t in terms if t.lower() in text)

    ans_in_title = hits(ans_toks, title)
    ans_in_blob = hits(ans_toks, blob)
    focus_in_title = hits(focus_terms, title)
    focus_in_blob = hits(focus_terms, blob)

    # Phrase hits
    phrase_title = sum(1 for p in focus["phrases"] if p.lower() in title)
    phrase_blob = sum(1 for p in focus["phrases"] if p.lower() in blob)

    ans_n = max(len(ans_toks), 1)
    focus_n = max(len(focus_terms), 1)

    return {
        "ans_title": ans_in_title,
        "ans_blob": ans_in_blob,
        "ans_title_frac": ans_in_title / ans_n,
        "ans_blob_frac": ans_in_blob / ans_n,
        "focus_title": focus_in_title,
        "focus_blob": focus_in_blob,
        "focus_title_frac": focus_in_title / focus_n,
        "focus_blob_frac": focus_in_blob / focus_n,
        "phrase_title": phrase_title,
        "phrase_blob": phrase_blob,
    }


def score_hit(hit: dict, focus: dict) -> float:
    title = (hit.get("title") or "").lower()
    jname = journal_name(hit)
    tier = journal_tier(jname)
    types = pub_types(hit)
    year = int(hit.get("pubYear") or 0) or 2000
    cited = int(hit.get("citedByCount") or 0)
    ov = topical_overlap(hit, focus)

    # Hard topical gate components
    score = 0.0

    # Topical relevance dominates
    score += 40.0 * ov["ans_title_frac"]
    score += 18.0 * ov["ans_blob_frac"]
    score += 22.0 * ov["focus_title_frac"]
    score += 8.0 * ov["focus_blob_frac"]
    score += 15.0 * ov["phrase_title"]
    score += 6.0 * ov["phrase_blob"]

    # Bonus for answer phrase literally in title
    ans = (focus.get("answer") or "").lower().strip()
    if ans and len(ans) >= 4 and ans in title:
        score += 30.0

    # Stem co-term bonus/penalty (psoriasis with lithium, metformin with hepatic glucose…)
    anchors = _stem_anchors(focus, focus.get("answer") or "")
    for d in focus.get("diagnoses") or []:
        for tok in d.split():
            if tok and len(tok) >= 4 and tok not in anchors:
                anchors.append(tok)
    if anchors:
        blob = title + " " + (hit.get("abstractText") or "").lower()
        a_hits_title = sum(1 for a in anchors if a.lower() in title)
        a_hits_blob = sum(1 for a in anchors if a.lower() in blob)
        score += 20.0 * a_hits_title + 8.0 * a_hits_blob
        if a_hits_blob == 0 and len(focus.get("ans_toks") or []) <= 3:
            score -= 40.0  # lithium batteries, etc.

    if is_reviewish(types):
        score += 12.0
    if any("guideline" in t.lower() for t in types):
        score += 8.0

    if tier == "tier1":
        score += 12.0
    elif tier == "demote":
        score -= 25.0
    else:
        score += 3.0

    age = max(2026 - year, 1)
    cites_per_year = cited / age
    score += min(cites_per_year, 30.0) * 0.35
    score += min(cited, 300) * 0.015

    if 2000 <= year <= 2025:
        score += 2.0
    elif year < 1990:
        score -= 3.0

    if (hit.get("isOpenAccess") or "").upper() == "Y":
        score += 1.0
    if hit.get("pmcid"):
        score += 0.5

    return score


def passes_relevance_floor(hit: dict, focus: dict, score: float) -> bool:
    """Reject famous-but-off-topic papers."""
    ov = topical_overlap(hit, focus)
    tier = journal_tier(journal_name(hit))
    if tier == "demote":
        return False

    title = (hit.get("title") or "").lower()
    abstract = (hit.get("abstractText") or "").lower()
    blob = title + " " + abstract

    # If the stem supplies clinical co-terms (psoriasis, metformin, MAOI…),
    # a short drug/answer match alone is not enough — batteries, basic-science
    # lithium chemistry, etc. should not win.
    anchors = _stem_anchors(focus, focus.get("answer") or "")
    # also allow diagnosis tags as anchors when present
    for d in focus.get("diagnoses") or []:
        for tok in d.split():
            if tok and tok not in anchors and tok.lower() not in (focus.get("answer") or "").lower():
                anchors.append(tok)
    anchors = [a for a in anchors if len(a) >= 4][:4]
    if anchors and len(focus.get("ans_toks") or []) <= 3:
        if not any(a.lower() in blob for a in anchors):
            # allow if multi-word answer phrase is literally in title
            ans = (focus.get("answer") or "").lower()
            if not (ans and len(ans) >= 8 and ans in title):
                return False

    # Must have some topical signal
    if ov["phrase_title"] >= 1:
        return True
    if ov["ans_title"] >= 1 and (not anchors or any(a.lower() in title for a in anchors) or len(focus.get("ans_toks") or []) >= 2):
        return True
    if ov["ans_blob"] >= 2:
        return True
    if ov["focus_title"] >= 2:
        return True
    if ov["focus_blob"] >= 3 and ov["ans_blob"] >= 1:
        return True
    if len(focus["ans_toks"]) <= 2 and ov["ans_blob"] >= 1 and ov["focus_title"] >= 1:
        return True
    if score >= 55 and ov["focus_blob"] >= 2:
        return True
    return False


def _slim_hit(hit: dict) -> dict:
    """Keep only fields we score/display — full core payloads balloon the cache to GBs."""
    ji = hit.get("journalInfo") or {}
    j = ji.get("journal") or {}
    abstract = hit.get("abstractText") or ""
    if len(abstract) > 1200:
        abstract = abstract[:1200]
    return {
        "pmid": hit.get("pmid"),
        "pmcid": hit.get("pmcid"),
        "doi": hit.get("doi"),
        "title": hit.get("title"),
        "abstractText": abstract,
        "pubYear": hit.get("pubYear"),
        "citedByCount": hit.get("citedByCount"),
        "isOpenAccess": hit.get("isOpenAccess"),
        "pubTypeList": hit.get("pubTypeList"),
        "journalInfo": {
            "journal": {
                "title": j.get("title"),
                "medlineAbbreviation": j.get("medlineAbbreviation"),
                "isoabbreviation": j.get("isoabbreviation"),
            }
        },
    }


def epmc_search(query: str, page_size: int = 25, timeout: float = 30.0) -> list[dict]:
    _api_rate_wait()
    params = {
        "query": query,
        "resultType": "core",
        "pageSize": str(page_size),
        "format": "json",
        # Europe PMC rejects sort=RELEVANCE (empty payload). CITED is a
        # decent prior; we re-rank by topical overlap + journal quality.
        "sort": "CITED desc",
    }
    url = EPMC + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url, headers={"User-Agent": "prite-daily-research-matcher/1.2"}
    )
    # Small retry for transient network / 429 / 5xx
    last_err: Exception | None = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            raw = list((data.get("resultList") or {}).get("result") or [])
            return [_slim_hit(h) for h in raw]
        except Exception as e:
            last_err = e
            time.sleep(0.4 * (attempt + 1))
            _api_rate_wait()
    raise last_err  # type: ignore[misc]


def article_record(hit: dict, score: float, focus: dict) -> dict[str, Any]:
    pmid = hit.get("pmid")
    if not pmid:
        raise ValueError("hit missing pmid")
    pmcid = hit.get("pmcid")
    doi = hit.get("doi")
    jname = journal_name(hit)
    types = pub_types(hit)
    ov = topical_overlap(hit, focus)
    urls = {"pubmed": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"}
    if pmcid:
        urls["pmc"] = f"https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid}/"
    if doi:
        urls["doi"] = f"https://doi.org/{doi}"

    why = []
    if ov["ans_title"] or ov["phrase_title"]:
        why.append("title matches answer/topic")
    elif ov["ans_blob"]:
        why.append("covers answer concept")
    if is_reviewish(types):
        why.append("review/guideline")
    if journal_tier(jname) == "tier1":
        why.append("core journal")
    else:
        why.append("MEDLINE")
    if int(hit.get("citedByCount") or 0) >= 100:
        why.append(f"{hit.get('citedByCount')} cites")

    return {
        "pmid": str(pmid),
        "pmcid": pmcid,
        "doi": doi,
        "title": (hit.get("title") or "").strip().rstrip("."),
        "journal": jname,
        "journal_tier": journal_tier(jname),
        "year": int(hit.get("pubYear") or 0) or None,
        "pub_types": types,
        "cited_by": int(hit.get("citedByCount") or 0),
        "is_open_access": (hit.get("isOpenAccess") or "").upper() == "Y",
        "is_reviewish": is_reviewish(types),
        "score": round(score, 2),
        "overlap": {
            "ans_title": ov["ans_title"],
            "focus_title": ov["focus_title"],
            "phrase_title": ov["phrase_title"],
        },
        "why": ", ".join(why),
        "urls": urls,
        "url": urls.get("pmc") or urls.get("pubmed"),
    }


def search_for_question(
    q: dict,
    cache: dict,
    cache_lock: threading.Lock | None = None,
) -> dict[str, Any]:
    """cache may be shared across threads; pass cache_lock when it is."""
    lock = cache_lock or threading.Lock()
    focus = clinical_focus(q)
    strategies = build_queries(q, focus)
    all_hits: dict[str, dict] = {}
    used: list[str] = []

    for name, query in strategies:
        with lock:
            hits = cache.get(query)
            cached = hits is not None
        if not cached:
            try:
                hits = epmc_search(query, page_size=25)
            except Exception as e:
                used.append(f"{name}:ERROR:{type(e).__name__}")
                continue
            with lock:
                # Another worker may have filled it; keep first or ours — identical enough
                cache.setdefault(query, hits)
                hits = cache[query]
        used.append(f"{name}:{len(hits)}")
        for h in hits:
            pmid = h.get("pmid")
            if pmid:
                all_hits.setdefault(str(pmid), h)
        # Early stop only once we have several title-level matches
        strong = 0
        for h in all_hits.values():
            ov = topical_overlap(h, focus)
            if ov["ans_title"] or ov["phrase_title"]:
                strong += 1
        if strong >= 5 and len(all_hits) >= 15:
            break

    if not all_hits:
        return {
            "articles": [],
            "query": strategies[0][1] if strategies else "",
            "strategies": used,
            "focus": {
                "answer": focus["answer"],
                "phrases": focus["phrases"],
                "terms": focus["focus_terms"][:8],
            },
            "status": "no_hits",
        }

    scored: list[tuple[float, dict]] = []
    for hit in all_hits.values():
        s = score_hit(hit, focus)
        scored.append((s, hit))
    scored.sort(key=lambda x: x[0], reverse=True)

    articles = []
    for s, hit in scored:
        if not passes_relevance_floor(hit, focus, s):
            continue
        ov = topical_overlap(hit, focus)
        # Second article must still be clearly on-topic (not a random
        # "persistent…" match in an unrelated guideline).
        if articles:
            if s < articles[0]["score"] - 45:
                continue
            if not (ov["ans_title"] or ov["phrase_title"] or ov["focus_title"] >= 2):
                continue
        articles.append(article_record(hit, s, focus))
        if len(articles) >= 8:  # keep extras so a later unique-PMID pass can pick
            break

    # Last-resort: best MEDLINE non-demote with real multi-signal overlap
    if not articles:
        for s, hit in scored:
            if journal_tier(journal_name(hit)) == "demote":
                continue
            ov = topical_overlap(hit, focus)
            if ov["focus_title"] >= 1 and (ov["ans_blob"] >= 1 or ov["focus_blob"] >= 2):
                articles.append(article_record(hit, s, focus))
                break
            if ov["ans_title"] >= 1 and ov["focus_blob"] >= 1:
                articles.append(article_record(hit, s, focus))
                break

    return {
        "articles": articles,
        "query": strategies[0][1] if strategies else "",
        "strategies": used,
        "focus": {
            "answer": focus["answer"],
            "phrases": focus["phrases"],
            "terms": focus["focus_terms"][:8],
        },
        "status": "ok" if articles else "filtered_empty",
        "n_candidates": len(all_hits),
    }


def load_questions() -> list[dict]:
    with open(QUESTIONS) as f:
        return json.load(f)


def load_json(path: Path, default):
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return default


def save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    tmp.replace(path)


def _process_one(
    id_: str,
    q: dict,
    cache: dict,
    cache_lock: threading.Lock,
) -> tuple[str, dict]:
    try:
        result = search_for_question(q, cache, cache_lock=cache_lock)
    except Exception as e:
        result = {
            "articles": [],
            "query": "",
            "status": f"error:{e}",
            "strategies": [],
            "focus": {},
        }
    rec = {
        "id": id_,
        "year": q["year"],
        "q_index": q["q_index"],
        "stem_preview": (q.get("stem") or "")[:180],
        "answer_text": q.get("answer_text"),
        "answer_letter": q.get("answer_letter"),
        "tags": q.get("tags"),
        **result,
    }
    return id_, rec


def main() -> int:
    global _API_MIN_INTERVAL
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--sample", type=int)
    g.add_argument("--all", action="store_true")
    g.add_argument("--ids", type=str)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--fresh", action="store_true", help="Ignore existing refs for selected ids")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--workers", type=int, default=1, help="Parallel workers (default 1). Try 8–12.")
    ap.add_argument("--rps", type=float, default=12.0, help="Max Europe PMC requests/sec across all workers")
    ap.add_argument("--out", type=Path, default=OUT_REFS)
    ap.add_argument("--questions", type=Path, default=QUESTIONS, help="Question bank JSON (array)")
    args = ap.parse_args()

    if args.workers < 1:
        print("--workers must be >= 1", file=sys.stderr)
        return 2
    if args.rps <= 0:
        print("--rps must be > 0", file=sys.stderr)
        return 2
    _API_MIN_INTERVAL = 1.0 / args.rps

    questions = json.loads(args.questions.read_text()) if args.questions != QUESTIONS else load_questions()
    by_id = {qid(q): q for q in questions}
    print(f"Loaded {len(questions)} questions", file=sys.stderr)

    if args.sample:
        rng = random.Random(args.seed)
        ids = [qid(q) for q in rng.sample(questions, min(args.sample, len(questions)))]
    elif args.ids:
        ids = [x.strip() for x in args.ids.split(",") if x.strip()]
    else:
        ids = [qid(q) for q in questions]

    if args.limit:
        ids = ids[: args.limit]

    refs = {} if args.fresh else load_json(args.out, {})
    cache = load_json(OUT_CACHE, {})
    cache_lock = threading.Lock()
    refs_lock = threading.Lock()

    if args.resume and not args.fresh:
        before = len(ids)
        ids = [i for i in ids if i not in refs or not refs[i].get("articles")]
        print(f"Resume: {before - len(ids)} done, {len(ids)} left", file=sys.stderr)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    n_ok = n_empty = 0
    t0 = time.time()
    # For --fresh sample runs, start empty; otherwise keep prior refs (resume).
    out_refs: dict = {} if args.fresh else dict(refs)

    print(
        f"Workers={args.workers}  rps={args.rps}  remaining={len(ids)}",
        file=sys.stderr,
    )

    def handle_result(i: int, id_: str, rec: dict) -> None:
        nonlocal n_ok, n_empty
        with refs_lock:
            out_refs[id_] = rec
            if rec.get("articles"):
                n_ok += 1
                top = rec["articles"][0]
                print(
                    f"[{i}/{len(ids)}] {id_} → {len(rec['articles'])}  "
                    f"#{top['pmid']} ({top['journal_tier']}) "
                    f"{top['title'][:72]}",
                    file=sys.stderr,
                )
            else:
                n_empty += 1
                print(
                    f"[{i}/{len(ids)}] {id_} → NONE ({rec.get('status')})",
                    file=sys.stderr,
                )
            if i % 40 == 0 or i == len(ids):
                save_json(args.out, out_refs)
                with cache_lock:
                    cache_snap = dict(cache)
                save_json(OUT_CACHE, cache_snap)
                elapsed = time.time() - t0
                rate = i / elapsed if elapsed else 0
                eta_s = (len(ids) - i) / rate if rate else 0
                print(
                    f"  checkpoint {i}/{len(ids)} ok={n_ok} empty={n_empty} "
                    f"{rate:.2f} q/s cache={len(cache_snap)} "
                    f"eta={eta_s/60:.0f}m total_refs={len(out_refs)}",
                    file=sys.stderr,
                )

    # Filter unknown ids first
    work: list[tuple[str, dict]] = []
    for id_ in ids:
        q = by_id.get(id_)
        if not q:
            print(f"  skip unknown {id_}", file=sys.stderr)
            continue
        work.append((id_, q))

    if args.workers == 1:
        for i, (id_, q) in enumerate(work, 1):
            _, rec = _process_one(id_, q, cache, cache_lock)
            handle_result(i, id_, rec)
    else:
        completed = 0
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = {
                pool.submit(_process_one, id_, q, cache, cache_lock): id_
                for id_, q in work
            }
            for fut in as_completed(futures):
                id_, rec = fut.result()
                completed += 1
                handle_result(completed, id_, rec)

    save_json(args.out, out_refs)
    with cache_lock:
        save_json(OUT_CACHE, dict(cache))

    tiers = Counter()
    n_art = 0
    title_hit = 0
    for r in out_refs.values():
        arts = r.get("articles") or []
        if arts:
            n_art += len(arts)
            tiers[arts[0].get("journal_tier")] += 1
            if (arts[0].get("overlap") or {}).get("ans_title") or (arts[0].get("overlap") or {}).get("phrase_title"):
                title_hit += 1

    covered = sum(1 for r in out_refs.values() if r.get("articles"))
    print(
        f"\nDone. n={len(out_refs)} covered={covered} ({100*covered/max(len(out_refs),1):.1f}%) "
        f"articles={n_art} top_tiers={dict(tiers)} "
        f"top_title_topic_hit={title_hit}/{covered}",
        file=sys.stderr,
    )
    print(f"Wrote {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

