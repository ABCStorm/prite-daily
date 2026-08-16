#!/usr/bin/env python3
"""Independent, conservative adjudicator for generated PubMed statistics.

This deliberately does not reuse the generator's scoring. It classifies the
kind of quantitative claim, rejects study-design numerology and case reports,
then independently proves question relevance before selecting one row.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

from eligibility import STOPWORDS, WORD_RE, clean_sentence, informative_tokens, normalize, well_formed

ROOT = Path(__file__).resolve().parents[2]

FACT_TYPES = {
    "epidemiology": re.compile(r"(?i)preval|inciden|frequen|\bone\s+in\b|\baffect(?:s|ed|ing)?\b|per\s+\d[\d,]*"),
    "risk/outcome": re.compile(r"(?i)mortal|surviv|death|relapse|recover|remission|response|discontinu|hospital|suicid|odds|hazard|relative risk|risk ratio"),
    "diagnostic performance": re.compile(r"(?i)sensitiv|specific|predictive value|likelihood ratio|diagnostic accuracy|screen positive|positive in"),
    "treatment effect": re.compile(r"(?i)reduc|improv|decreas|increas|superior|inferior|effect size|mean difference|respond|remit|number needed"),
    "clinical quantity": re.compile(r"(?i)half-life|dose|milligram|microgram|mmhg|mosmol|threshold|within\s+\d|last(?:ed|s)?\s+\d|duration|onset|amino acids?|receptors?|chromosomes?|capacities|stages"),
}
MAGNITUDE_RE = re.compile(
    r"(?i)\d+(?:\.\d+)?\s*(?:%|percent|per cent)|\bone\s+in\s+\d+|"
    r"\d+(?:\.\d+)?\s+per\s+\d[\d,]*|\d+(?:\.\d+)?[-\s]?(?:fold|times)\b|"
    r"(?:odds|hazard|risk|rate)\s+ratio\s+(?:of\s+)?\d|"
    r"\d+(?:\.\d+)?\s*(?:mg|mcg|g|kg|ml|mmhg|mosmol|hours?|days?|weeks?|months?|years?|amino acids?|receptors?|chromosomes?|capacities|stages)\b|"
    r"\d+(?:\.\d+)?\s*(?:million|billion)\b"
)
RESULT_MAGNITUDE_RE = re.compile(
    r"(?i)\d+(?:\.\d+)?\s*(?:%|percent|per cent)|\bone\s+in\s+\d+|"
    r"\d+(?:\.\d+)?\s+per\s+\d[\d,]*|\d+(?:\.\d+)?[-\s]?(?:fold|times)\b|"
    r"(?:OR|RR|HR|SMD|Hedges'?\s*g|effect size)\s*[=:]?\s*-?\d+(?:\.\d+)?|"
    r"\d+(?:\.\d+)?\s*(?:million|billion)\b"
)
DESIGN_ONLY_RE = re.compile(
    r"(?i)(?:we|investigators?)\s+(?:assigned|enrolled|recruited|presented|reviewed|examined)|"
    r"randomly assigned|participants? were (?:assigned|enrolled|recruited)|"
    r"aged\s+\d+[-–]\d+|\bmean age\b|\bsample of\b|\bstudy included\b|"
    r"\b(?:registers?|records?|data) (?:were|was) used\b|\bblood samples? (?:were|was) obtained\b|"
    r"\b(?:study|trial) comparing\b.*\bwas conducted\b"
)
HARD_METHOD_RE = re.compile(
    r"(?i)\b(?:study|trial) comparing\b.*\bwas conducted\b|"
    r"\b(?:registers?|records?|data)\b.{0,50}\b(?:were|was) used\b|"
    r"\bblood samples? (?:were|was) obtained\b|"
    r"\b(?:study|trial)\b.{0,250}\bevaluated\b.{0,250}\b(?:before and after|administration)\b|"
    r"\b(?:responders?|participants?|patients?)\b.{0,250}\bwere randomized\b|"
    r"\b(?:was|were) given\b.{0,80}\bto \d+\b|"
    r"^Following\b.{0,120}\ba diagnosis of\b.{0,120}\bwas made\b"
)
HISTORY_ONLY_RE = re.compile(
    r"(?i)\byears? ago\b|\bover the past \w+ years?\b|\bfirst (?:isolated|described|introduced)\b|"
    r"\bsince (?:the )?\d{4}\b|\bin the \d{4}s\b|\bcareer\b"
)
CASE_REPORT_RE = re.compile(r"(?i)\bcase report\b|^(?:we report\s+)?an?\s+\d{1,3}-year-old\b")
OUTCOME_RE = re.compile(r"(?i)had|developed|experienced|achieved|accounted|occurred|was found|were found|reduced|increased|decreased|versus|compared")
NONRESULT_RE = re.compile(
    r"(?i)^(?:authors?'? conclusions?|materials?(?: and methods?)?|study selection|relevant changes|aims?|objective|methods?)\b|"
    r"\b(?:we (?:conducted|used data|aimed|sought)|was conducted|to determine whether|to compare these methods|"
    r"were (?:randomly )?assigned|were assessed to determine|received \d+ sessions|"
    r"no significant differences? .*\bP\s*=)\b"
)
RESULT_LANGUAGE_RE = re.compile(
    r"(?i)(?:preval|inciden|mortal|response|remission|relapse|sensitivity|specificity|"
    r"risk|rate|reduc|improv|decreas|increas|superior|inferior|dropout|abstinent).*"
    r"(?:%|percent|OR\b|RR\b|HR\b|SMD\b|effect size)|"
    r"(?:%|percent|OR\b|RR\b|HR\b|SMD\b|effect size).*(?:versus|compared|preval|inciden|risk|rate|reduc|improv)"
)
ANIMAL_RE = re.compile(r"(?i)\b(?:mice|mouse|rats?|murine|ovine|monkeys?)\b")
METHOD_QUANTITY_RE = re.compile(
    r"(?i)\b(?:samples?|measurements?|assessments?|visits?|sessions?)\b.*"
    r"\b(?:within|after|before|for)\s+\d|"
    r"\b(?:within|after|before|for)\s+\d.*\b(?:samples?|measurements?|assessments?|visits?|sessions?)\b"
)
MALFORMED_RE = re.compile(
    r"(?i)^(?:authors?'?|main|results?|conclusions?)\s*[:;]?\s*$|"
    r"^[^A-Za-z]*\d|"
    r"\b(?:vs\.?|versus|and|or)\s*$|"
    r"\b\d+(?:\.\d+)?\s+fold\s+higher\.\d|"
    r"\bP\s*=\s*\.\d+(?:\s+and\s+\.\d+)?\s*(?:respectively)?\.?$|"
    r"\d\.\s+[a-z]|(?-i:\b[a-z]{3,}[A-Z][a-z])"
)


def ngrams(text: str, n: int) -> set[tuple[str, ...]]:
    tokens = WORD_RE.findall(normalize(text))
    return {
        tuple(tokens[i:i + n])
        for i in range(len(tokens) - n + 1)
        if all(len(token) >= 4 and token not in STOPWORDS for token in tokens[i:i + n])
    }


def question_text(candidate: dict) -> str:
    return " ".join([candidate.get("stem") or "", candidate.get("answer") or "", candidate.get("topic") or ""])


def classify_fact(sentence: str) -> str | None:
    if not MAGNITUDE_RE.search(sentence):
        return None
    kinds = [name for name, pattern in FACT_TYPES.items() if pattern.search(sentence)]
    if not kinds:
        return None
    if HISTORY_ONLY_RE.search(sentence):
        return None
    if CASE_REPORT_RE.search(sentence):
        return None
    if ANIMAL_RE.search(sentence):
        return None
    if MALFORMED_RE.search(sentence):
        return None
    if HARD_METHOD_RE.search(sentence):
        return None
    if (DESIGN_ONLY_RE.search(sentence) or NONRESULT_RE.search(sentence)) and not RESULT_LANGUAGE_RE.search(sentence):
        return None
    kind = kinds[0]
    if kind == "clinical quantity" and METHOD_QUANTITY_RE.search(sentence):
        return None
    if kind != "clinical quantity" and not RESULT_MAGNITUDE_RE.search(sentence):
        return None
    return kind


def review(candidate: dict, df: Counter[str], total: int) -> tuple[bool, str, str | None]:
    sentence = clean_sentence(candidate.get("sentence") or "")
    if len(sentence) > 700 or "•" in sentence:
        return False, "too long for a helpful fact", None
    if sentence.count("(") != sentence.count(")") or sentence.count("[") != sentence.count("]"):
        return False, "incomplete or malformed sentence", None
    if re.match(r"(?i)^for secondary results\b", sentence):
        return False, "not a primary useful finding", None
    if not well_formed(sentence):
        return False, "incomplete or malformed sentence", None
    kind = classify_fact(sentence)
    if not kind:
        return False, "not a useful clinical magnitude", None

    qtext = question_text(candidate)
    answer = normalize(candidate.get("answer") or "")
    source_title = candidate.get("source_title") or ""
    if ANIMAL_RE.search(source_title):
        return False, "animal study", kind
    q_tokens = set(informative_tokens(qtext))
    s_tokens = set(informative_tokens(sentence))
    title_tokens = set(informative_tokens(source_title))
    shared = q_tokens & s_tokens
    rare = {token for token in shared if df[token] <= max(40, total // 120)}
    weighted = sum(math.log((total + 1) / (df[token] + 1)) for token in shared)

    answer_exact = bool(answer and len(answer) >= 6 and f" {answer} " in f" {normalize(sentence)} ")
    exact_phrase = bool(ngrams(qtext, 2) & ngrams(sentence, 2))
    title_bridge = bool(q_tokens & title_tokens) and bool(s_tokens & title_tokens)
    relevant = (
        (answer_exact and (len(answer.split()) >= 2 or len(shared) >= 2))
        or (exact_phrase and title_bridge)
        or (len(rare) >= 1 and len(shared) >= 3 and weighted >= 8.0 and title_bridge)
    )
    if not relevant:
        return False, "independent relevance proof failed", kind

    # A statistic that directly gives the numeric answer would spoil the item.
    answer_nums = set(re.findall(r"\d+(?:\.\d+)?", candidate.get("answer") or ""))
    sentence_nums = set(re.findall(r"\d+(?:\.\d+)?", sentence))
    if answer_nums & sentence_nums:
        return False, "spoils the numeric answer", kind
    return True, "approved", kind


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=ROOT / "work/pubmed-stat-candidates.json")
    parser.add_argument("--output", type=Path, default=ROOT / "work/pubmed-stat-approved.json")
    parser.add_argument("--report", type=Path, default=ROOT / "work/pubmed-stat-review-report.json")
    args = parser.parse_args()

    candidates = json.loads(args.input.read_text())
    by_qid = defaultdict(list)
    for candidate in candidates:
        by_qid[candidate["qid"]].append(candidate)
    df: Counter[str] = Counter()
    for rows in by_qid.values():
        df.update(set(informative_tokens(question_text(rows[0]))))

    approved = []
    rejected = Counter()
    kinds = Counter()
    bank_counts = Counter()
    decisions = []
    for qid, rows in by_qid.items():
        selected = None
        for candidate in sorted(rows, key=lambda row: (row["rank"], -row["score"])):
            ok, reason, kind = review(candidate, df, len(by_qid))
            decisions.append({"qid": qid, "rank": candidate["rank"], "ok": ok, "reason": reason, "kind": kind})
            if ok:
                selected = {
                    **candidate,
                    "sentence": clean_sentence(candidate.get("sentence") or ""),
                    "fact_type": kind,
                    "review": "independent-check-v2",
                }
                break
            rejected[reason] += 1
        if selected:
            approved.append(selected)
            kinds[selected["fact_type"]] += 1
            bank_counts[selected["bank"]] += 1

    args.output.write_text(json.dumps(approved, ensure_ascii=False, indent=2) + "\n")
    args.report.write_text(json.dumps({
        "candidate_questions": len(by_qid),
        "approved": len(approved),
        "banks": bank_counts,
        "fact_types": kinds,
        "rejected_reasons": rejected,
        "decisions": decisions,
    }, ensure_ascii=False, indent=2) + "\n")
    print(f"approved {len(approved)}/{len(by_qid)} questions: {dict(bank_counts)}")
    print(f"fact types: {dict(kinds)}")
    print(f"rejections: {dict(rejected)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
