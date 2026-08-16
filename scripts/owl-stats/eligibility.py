"""Conservative eligibility checks for Stat Cat assignments.

A missing Stat Cat is preferable to an impressive-looking number that is not
actually about the question.  Both the builders and the pruning script use this
module so the same rule applies to old and newly generated assignments.
"""

from __future__ import annotations

import re
from collections import Counter


WORD_RE = re.compile(r"[a-z][a-z0-9+-]*")
ABSTRACT_PREFIX_RE = re.compile(
    r"^(?:authors?'?(?: conclusions?)?|conclusions?(?: and relevance)?|background|main(?: results?)?|results?|findings?|"
    r"objective|importance|evidence synthesis)\s*[:.-]?\s+",
    re.I,
)
NUMBER_WORDS = (
    "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|"
    "thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|"
    "twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|"
    "thousand|million|billion|half|quarter|third"
)

# A year alone is not a statistic.  These patterns require a magnitude, ratio,
# count, duration, dose, or another quantitative relationship.
QUANTITATIVE_PATTERNS = [
    re.compile(r"\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:%\B|percent\b|per\s+cent\b)", re.I),
    re.compile(r"\b(?:one|1)\s+(?:person\s+)?in\s+\d+\b", re.I),
    re.compile(r"\b\d+(?:,\d{3})*(?:\.\d+)?\s+per\s+\d+(?:,\d{3})*\b", re.I),
    re.compile(r"\b\d+(?:\.\d+)?\s*(?:to|[-–—])\s*\d+(?:\.\d+)?\b", re.I),
    re.compile(r"\b\d+(?:\.\d+)?[-\s]?(?:fold|times|million|billion)\b", re.I),
    re.compile(
        r"\b\d+(?:,\d{3})*(?:\.\d+)?\s*(?:patients?|people|adults?|children|"
        r"adolescents?|cases?|deaths?|participants?|subjects?|individuals?|"
        r"years?|months?|weeks?|days?|hours?|minutes?|seconds?|mg|mcg|g|kg|ml|"
        r"mmhg|hz|items?|criteria|symptoms?|episodes?|capacities|abilities|components?|stages?|types?)\b",
        re.I,
    ),
    re.compile(rf"\b(?:{NUMBER_WORDS})\s+(?:in\s+\w+\s+)?(?:patients?|people|adults?|"
               r"children|adolescents?|cases?|deaths?|years?|months?|weeks?|days?|"
               r"times|capacities|abilities|components?|stages?|types?|criteria|symptoms?|episodes?)\b", re.I),
    re.compile(r"\b(?:odds|hazard|risk|rate)\s+ratio\s+(?:of\s+)?\d+(?:\.\d+)?\b", re.I),
    re.compile(r"\b(?:effect\s+size|standard(?:i|i[sz])ed\s+mean\s+difference|hedges'?\s*g|cohen'?s\s*d|smd|rr|or|hr|nnt)\s*(?:of|[=:])?\s*(?:minus\s+)?-?\d+(?:\.\d+)?\b", re.I),
    re.compile(r"\b(?:more|less|fewer|greater|higher|lower)\s+than\s+\d+(?:\.\d+)?\b", re.I),
    re.compile(r"\b\d+(?:,\d{3})+\b.{0,40}\b(?:patients?|people|cases?|deaths?|participants?)\b", re.I),
    re.compile(r"\b(?:more\s+than\s+|nearly\s+|about\s+)?(?:half|one-third|two-thirds|quarter)\s+of\b", re.I),
    re.compile(r"\b(?:twice|three\s+times|four\s+times)\s+(?:as\s+)?(?:likely|common|frequent)\b", re.I),
]

META_NUMBER_RE = re.compile(
    r"\b(?:questions?|items?|test\s+items?|exam\s+items?)\b.*\b(?:half|quarter|percent|%)\b|"
    r"\b(?:half|quarter|percent|%)\b.*\b(?:questions?|test\s+items?|exam\s+items?)\b",
    re.I,
)

STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "for",
    "had", "has", "he", "her", "his", "if", "in", "is", "it", "its", "not",
    "of", "on", "or", "she", "the", "to", "was", "were", "will",
    "about", "above", "across", "after", "again", "against", "among", "because",
    "before", "being", "below", "between", "both", "could", "during", "each",
    "either", "found", "from", "given", "have", "having", "into", "more", "most",
    "other", "over", "patient", "patients", "people", "person", "reported", "result",
    "results", "should", "study", "than", "that", "their", "there", "these", "they",
    "this", "those", "through", "under", "using", "versus", "which", "while", "with",
    "without", "would", "year", "years", "clinical", "condition", "disease", "disorder",
    "diagnosis", "treatment", "therapy", "symptoms", "associated", "common", "risk",
    "rate", "rates", "level", "levels", "serum", "finding", "findings", "group", "groups",
    "case", "cases", "current", "medical", "significant", "significantly", "compared",
    "percent", "prevalence", "incidence", "frequency", "population", "adult", "adults",
}

WEAK_CANONICAL_TERMS = STOPWORDS | {
    "toxicity", "tremor", "memory", "attention", "function", "impairment", "women",
    "female", "male", "men", "child", "children", "adolescent", "school", "sleep",
    "trauma", "psychosis", "psychotic", "panic", "medication", "side effect", "side effects",
}


def normalize(text: str) -> str:
    return " ".join(WORD_RE.findall((text or "").lower().replace("–", "-").replace("—", "-")))


def informative_tokens(text: str) -> list[str]:
    return [w for w in WORD_RE.findall((text or "").lower()) if len(w) >= 4 and w not in STOPWORDS]


def meaningful_number(sentence: str) -> bool:
    if not sentence or META_NUMBER_RE.search(sentence):
        return False
    return any(pattern.search(sentence) for pattern in QUANTITATIVE_PATTERNS)


def clean_sentence(sentence: str) -> str:
    """Remove harmless abstract section labels before the text reaches the UI."""
    cleaned = re.sub(r"\s+", " ", sentence or "").strip()
    cleaned = re.sub(r"(?<=[.!?])(?=[A-Z])", " ", cleaned)
    # Undo spacing introduced inside initialisms such as C.I. or U.S.
    for _ in range(3):
        cleaned = re.sub(r"\b([A-Z])\. (?=[A-Z]\.)", r"\1.", cleaned)
    return ABSTRACT_PREFIX_RE.sub("", cleaned)


def well_formed(sentence: str) -> bool:
    if len(sentence) < 35 or sentence[0].islower():
        return False
    if sentence.count("(") != sentence.count(")") or sentence.count("[") != sentence.count("]"):
        return False
    if re.search(r"\b(?:and|or|versus|vs\.?)\s+\d+(?:\.\d+)?\.?$", sentence, re.I):
        return False
    if re.search(r"\b(?:OR|RR|HR|SMD)\s*=\s*-?\d*\.?\d*\.?$", sentence):
        return False
    if re.search(r"\bP\s+Results\b|^Selection criteria\b|^Methods?\b|^Participants?\b", sentence, re.I):
        return False
    return True


def question_surface(question: dict) -> str:
    quizapine = question.get("quizapine") or {}
    return normalize(" ".join([
        question.get("stem") or "",
        question.get("answer_text") or "",
        quizapine.get("topic") or "",
        quizapine.get("modality") or "",
    ]))


def has_term(surface: str, term: str) -> bool:
    term = normalize(term.replace("-", " "))
    return bool(term) and f" {term} " in f" {surface} "


def canonical_relevant(question: dict, stat: dict, sentence: str) -> tuple[bool, str]:
    surface = question_surface(question)
    stat_text = normalize(" ".join([stat.get("core") or "", sentence or ""]))

    # Named diagnoses and medications are the safest anchors.  They must occur
    # in learner-visible question content; broad extractor tags do not qualify.
    for field in ("diagnoses", "anchors"):
        for term in stat.get(field) or []:
            if (normalize(term) not in WEAK_CANONICAL_TERMS
                    and has_term(surface, term) and has_term(stat_text, term)):
                return True, f"named {field[:-1]}"

    # Medication metadata often describes possible uses rather than the fact
    # itself. It only anchors relevance when the medication is named in both the
    # question and the statistic sentence.
    for term in stat.get("medications") or []:
        if has_term(surface, term) and has_term(stat_text, term):
            return True, "medication named in question and statistic"

    # Multiword keywords are specific enough when the exact phrase is present.
    for term in stat.get("keywords") or []:
        normalized = normalize(term)
        if normalized in WEAK_CANONICAL_TERMS:
            continue
        if len(normalized.split()) >= 2 and has_term(surface, term) and has_term(stat_text, term):
            return True, "specific keyword phrase"

    answer = normalize(question.get("answer_text") or "")
    if len(answer) >= 5 and answer not in WEAK_CANONICAL_TERMS and has_term(stat_text, answer):
        return True, "answer appears in statistic"

    return False, "no strong canonical anchor"


def paper_relevant(question: dict, sentence: str, source_title: str = "") -> tuple[bool, str]:
    surface = question_surface(question)
    stat_text = normalize(sentence)
    answer = normalize(question.get("answer_text") or "")

    modality = normalize((question.get("quizapine") or {}).get("modality") or "").replace("-", " ")
    modality_terms = {
        "act": ["acceptance and commitment therapy", " act "],
        "cbt": ["cognitive behavioral therapy", "cognitive behavioural therapy", " cbt "],
        "dbt": ["dialectical behavior therapy", "dialectical behaviour therapy", " dbt "],
        "mi": ["motivational interviewing"],
        "ipt": ["interpersonal psychotherapy", "interpersonal therapy", " ipt "],
        "mbt": ["mentalization based", "mentalisation based", " mbt "],
        "psychodynamic": ["psychodynamic psychotherapy", "psychodynamic therapy"],
        "trauma focused": ["trauma focused", "prolonged exposure", "cognitive processing therapy"],
        "group family couples": ["family intervention", "family interventions", "family psychoeducation", "family therapy", "group therapy", "couples therapy"],
        "tfp supportive": ["transference focused psychotherapy", "supportive therapy", "supportive psychotherapy"],
        "integration": ["integrative psychotherapy", "psychotherapy for borderline", "psychotherapy reduced borderline", "psychological therapies for borderline"],
    }
    if modality:
        for key, anchors in modality_terms.items():
            if key in modality and any(has_term(stat_text, anchor.strip()) for anchor in anchors):
                return True, "therapy modality named in statistic"

    if len(answer) >= 5 and answer not in WEAK_CANONICAL_TERMS and has_term(stat_text, answer):
        return True, "answer appears in paper finding"

    for concept in ("alliance", "rupture", "borderline", "bpd"):
        if has_term(surface, concept) and has_term(stat_text, concept):
            return True, f"specific therapy concept named in question and statistic: {concept}"

    q_all = WORD_RE.findall(surface)
    stat_all = WORD_RE.findall(stat_text)
    q_bigrams = {(a, b) for a, b in zip(q_all, q_all[1:]) if a not in STOPWORDS and b not in STOPWORDS}
    stat_bigrams = {(a, b) for a, b in zip(stat_all, stat_all[1:]) if a not in STOPWORDS and b not in STOPWORDS}
    if q_bigrams & stat_bigrams:
        return True, "specific phrase overlap"

    shared = set(informative_tokens(surface)) & set(informative_tokens(stat_text))
    if len(shared) >= 3 and any(len(token) >= 8 for token in shared):
        return True, "three clinical concepts overlap"
    title_tokens = set(informative_tokens(source_title))
    if shared and set(informative_tokens(surface)) & title_tokens and set(informative_tokens(stat_text)) & title_tokens:
        return True, "paper title bridges question and finding"
    return False, "paper finding lacks question-specific overlap"


def assignment_eligible(question: dict, row: dict, canonical_by_id: dict[str, dict]) -> tuple[bool, str]:
    sentence = clean_sentence(str(row.get("sentence") or ""))
    if not meaningful_number(sentence):
        return False, "not a quantitative fact"

    stat_id = str(row.get("stat_id") or "")
    if stat_id.startswith("pmid-"):
        if not well_formed(sentence):
            return False, "paper statistic is not a complete sentence"
        return paper_relevant(question, sentence, str(row.get("source_title") or ""))

    stat = canonical_by_id.get(stat_id)
    if not stat:
        return False, "unknown canonical statistic"
    return canonical_relevant(question, stat, sentence)


def audit(assignments: dict[str, dict], questions: list[dict], canonical_by_id: dict[str, dict]):
    by_id = {f"{q['year']}-{q['q_index']}": q for q in questions}
    kept: dict[str, dict] = {}
    reasons: Counter[str] = Counter()
    unknown: list[str] = []
    for qid, row in assignments.items():
        question = by_id.get(qid)
        if not question:
            unknown.append(qid)
            continue
        ok, reason = assignment_eligible(question, row, canonical_by_id)
        if ok:
            kept[qid] = row
        else:
            reasons[reason] += 1
    return kept, reasons, unknown
