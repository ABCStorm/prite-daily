#!/usr/bin/env python3
"""Generate high-precision Stat Cat candidates from matched PubMed papers."""

from __future__ import annotations

import argparse
import json
import math
import re
from collections import Counter
from pathlib import Path

from eligibility import (
    STOPWORDS,
    WORD_RE,
    clean_sentence,
    informative_tokens,
    meaningful_number,
    normalize,
    well_formed,
)

ROOT = Path(__file__).resolve().parents[2]
SECTION_RE = re.compile(
    r"(?:^|\s)(?:BACKGROUND|OBJECTIVE|OBJECTIVES|METHODS|RESULTS|CONCLUSIONS?|"
    r"FINDINGS|INTERPRETATION|IMPORTANCE|DESIGN|SETTING)\s*:\s*",
    re.I,
)
SPLIT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9])")
USEFUL_NUMBER_RE = re.compile(
    r"(?i)preval|inciden|frequen|rate|risk|odds|hazard|mortal|surviv|death|"
    r"response|remission|relapse|recover|sensitivity|specificity|predict|"
    r"affect|develop|diagnos|comorbid|heritab|adher|discontinu|hospital|"
    r"dose|milligram|months?|years?|days?|hours?|percent|%|fold|times|one\s+in"
)
SAMPLE_ONLY_RE = re.compile(
    r"(?i)^(?:a total of\s+)?\d[\d,]*\s+(?:patients?|participants?|subjects?|"
    r"individuals?)\s+(?:were|was)\s+(?:enrolled|included|recruited|randomi[sz]ed)"
)


def qid_of(q: dict) -> str:
    return f"{q['year']}-{q['q_index']}"


def question_text(q: dict) -> str:
    quiz = q.get("quizapine") or {}
    return " ".join([
        q.get("stem") or "",
        q.get("answer_text") or "",
        quiz.get("topic") or "",
        quiz.get("modality") or "",
    ])


def load_questions(paths: list[Path]) -> tuple[list[dict], dict[str, dict]]:
    questions = []
    for path in paths:
        if path.exists():
            questions.extend(json.loads(path.read_text()))
    return questions, {qid_of(q): q for q in questions}


def document_frequency(questions: list[dict]) -> Counter[str]:
    df: Counter[str] = Counter()
    for q in questions:
        df.update(set(informative_tokens(question_text(q))))
    return df


def sentences(abstract: str):
    text = SECTION_RE.sub(" ", abstract or "")
    for part in SPLIT_RE.split(re.sub(r"\s+", " ", text).strip()):
        sentence = clean_sentence(part).strip()
        if sentence and not sentence.endswith((".", "?", "!")):
            sentence += "."
        yield sentence


def ngrams(text: str, n: int) -> set[tuple[str, ...]]:
    words = WORD_RE.findall(normalize(text))
    return {
        tuple(words[i:i + n])
        for i in range(len(words) - n + 1)
        if all(word not in STOPWORDS and len(word) >= 3 for word in words[i:i + n])
    }


def numeric_answer_spoiled(q: dict, sentence: str) -> bool:
    answer = q.get("answer_text") or ""
    answer_nums = set(re.findall(r"\d+(?:\.\d+)?", answer))
    if not answer_nums:
        return False
    sentence_nums = set(re.findall(r"\d+(?:\.\d+)?", sentence))
    return bool(answer_nums & sentence_nums)


def candidate_score(q: dict, article: dict, sentence: str, df: Counter[str], total_docs: int):
    if not meaningful_number(sentence) or not well_formed(sentence):
        return None
    if not USEFUL_NUMBER_RE.search(sentence) or SAMPLE_ONLY_RE.search(sentence):
        return None
    if numeric_answer_spoiled(q, sentence):
        return None

    q_text = question_text(q)
    answer = normalize(q.get("answer_text") or "")
    title = article.get("title") or ""
    why = article.get("why") or article.get("relevance_sentence") or ""
    source_context = f"{title} {why}"

    q_tokens = set(informative_tokens(q_text))
    s_tokens = set(informative_tokens(sentence))
    title_tokens = set(informative_tokens(title))
    context_tokens = set(informative_tokens(source_context))
    direct = q_tokens & s_tokens
    bridge_q = q_tokens & context_tokens
    bridge_s = s_tokens & context_tokens

    weighted_direct = sum(math.log((total_docs + 1) / (df[token] + 1)) for token in direct)
    rare_direct = {token for token in direct if df[token] <= max(35, total_docs // 150)}
    phrase_overlap = bool((ngrams(q_text, 2) & ngrams(sentence, 2)) or (ngrams(q_text, 3) & ngrams(sentence, 3)))
    answer_exact = bool(answer and len(answer) >= 5 and f" {answer} " in f" {normalize(sentence)} ")

    # The paper was already curated for this question. Still require the numeric
    # sentence to connect to both the question and the paper's stated topic.
    direct_ok = (
        (answer_exact and (len(answer.split()) >= 2 or len(direct) >= 2))
        or phrase_overlap
        or (len(rare_direct) >= 1 and len(direct) >= 2 and weighted_direct >= 6.0)
        or (len(direct) >= 3 and weighted_direct >= 7.0)
    )
    bridge_ok = bool(bridge_q) and (bool(bridge_s) or bool(s_tokens & title_tokens))
    if not direct_ok or not bridge_ok:
        return None

    score = weighted_direct
    score += 10 if answer_exact else 0
    score += 8 if phrase_overlap else 0
    score += min(6, len(bridge_s) * 1.5)
    if re.search(r"(?i)preval|inciden|one\s+in|affect", sentence):
        score += 4
    if re.search(r"(?i)sensitivity|specificity|odds ratio|hazard ratio|mortality|survival", sentence):
        score += 3
    return round(score, 3), sorted(direct), sorted(bridge_s)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refs", type=Path, default=ROOT / "public/data/research_refs.json")
    parser.add_argument("--abstracts", type=Path, default=ROOT / "work/pubmed-stat-abstracts.json")
    parser.add_argument("--stats", type=Path, default=ROOT / "public/data/owl_stats.json")
    parser.add_argument("--neuro", type=Path, default=Path("/private/tmp/prite-kaufman-questions-audit.json"))
    parser.add_argument("--output", type=Path, default=ROOT / "work/pubmed-stat-candidates.json")
    args = parser.parse_args()

    questions, by_id = load_questions([
        ROOT / "extraction/output/questions_all.json",
        ROOT / "public/data/therapy_questions.json",
        args.neuro,
    ])
    refs = json.loads(args.refs.read_text())
    abstracts = json.loads(args.abstracts.read_text())
    existing = json.loads(args.stats.read_text())
    df = document_frequency(questions)

    out = []
    bank_counts: Counter[str] = Counter()
    for qid, record in refs.items():
        if qid in existing or qid not in by_id:
            continue
        q = by_id[qid]
        ranked = []
        for matched in record.get("articles") or []:
            pmid = str(matched.get("pmid") or "")
            cached = abstracts.get(pmid) or {}
            article = {**matched, **{k: v for k, v in cached.items() if v}}
            for sentence in sentences(cached.get("abstract") or ""):
                scored = candidate_score(q, article, sentence, df, len(questions))
                if scored:
                    score, direct, bridge = scored
                    ranked.append((score, sentence, article, direct, bridge))
        if not ranked:
            continue
        ranked.sort(key=lambda item: (-item[0], len(item[1])))
        bank = "Therapy" if q.get("quizapine") else "Neuro" if q.get("kaufman") else "PRITE"
        bank_counts[bank] += 1
        seen_sentences = set()
        rank = 0
        for score, sentence, article, direct, bridge in ranked:
            if sentence in seen_sentences:
                continue
            seen_sentences.add(sentence)
            rank += 1
            year = article.get("year")
            try:
                source_year = int(str(year)[:4])
            except (TypeError, ValueError):
                source_year = None
            out.append({
                "qid": qid,
                "rank": rank,
                "bank": bank,
                "score": score,
                "direct_terms": direct,
                "bridge_terms": bridge,
                "stem": q.get("stem") or "",
                "answer": q.get("answer_text") or "",
                "topic": (q.get("quizapine") or {}).get("topic") or (q.get("kaufman") or {}).get("chapter") or q.get("prite_label") or "",
                "stat_id": f"pmid-{article['pmid']}",
                "sentence": sentence,
                "source_title": article.get("title") or "",
                "source_label": f"{article.get('journal') or 'PubMed'}" + (f", {source_year}" if source_year else ""),
                "source_url": f"https://pubmed.ncbi.nlm.nih.gov/{article['pmid']}/",
                "source_year": source_year,
                "audio_path": f"owl/{qid}/v1.mp3",
            })
            if rank == 3:
                break

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
    print(f"generated {len(out)} candidates for {sum(bank_counts.values())} questions: {dict(bank_counts)} -> {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
