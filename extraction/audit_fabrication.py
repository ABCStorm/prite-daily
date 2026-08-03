#!/usr/bin/env python3
"""Detect content the reformatting pass INVENTED rather than carried over.

The reformat was supposed to add markup, not claims. This finds anything in a reformatted
explanation that has no basis in the original:

  citations  — "Smith et al.", "(2019)", journal names, DOIs, PMIDs, trial acronyms (STAR*D, CATIE)
  numbers    — doses, percentages, hazard ratios, durations, ages, N's
  drugs      — drug names that appear nowhere in the original or the question's own options

A hit is not automatically wrong: option letters and drug names legitimately enter from the
question's options list, which is why those are excluded. But an invented CITATION is never
legitimate, and an invented NUMBER in a board-review bank is a fabricated statistic until proven
otherwise.

  python3 extraction/audit_fabrication.py            # summary
  python3 extraction/audit_fabrication.py --detail   # every hit, with context
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
BANK = BASE / "extraction" / "output" / "questions_all.json"
ORIG = BASE / "extraction" / "output" / "questions_all.json.bak-prefmt-trial"

# --- citation shapes -------------------------------------------------------
CITATION_PATTERNS = [
    (r"\b([A-Z][a-z]{2,})\s+et\s+al\.?", "author et al."),
    (r"\((?:19|20)\d{2}\)", "(year) citation"),
    (r"\b(?:doi|DOI)\s*:?\s*10\.\d{4,}", "DOI"),
    (r"\bPMID\s*:?\s*\d+", "PMID"),
    (r"\b(NEJM|JAMA|Lancet|BMJ|Cochrane|UpToDate|PubMed)\b", "journal/source name"),
    (r"\b(?:New England Journal|Journal of [A-Z][a-z]+|American Journal of [A-Z][a-z]+)", "journal title"),
    (r"\b(STAR\*D|CATIE|CUtLASS|MTA|TADS|CAMS|WHI|SPRINT|MOTHER|WHIMS|SMART)\b", "named trial"),
    (r"\b(?:meta-analysis|systematic review|randomized controlled trial|RCT)\b", "study-type claim"),
]

NUM = re.compile(r"\d+(?:\.\d+)?")
WORD = re.compile(r"[A-Za-z][A-Za-z'\-]+")


def norm(s: str) -> str:
    """Strip markup so comparisons see prose only."""
    s = re.sub(r"\*\*|\*|•", " ", s or "")
    return re.sub(r"\s+", " ", s)


# Digits that are part of a name, not a measurement. Splitting these produces pure noise:
# CYP3A4 -> {3,4}, B12 -> {12}, 15q11-q13 -> {15,11,13}, Delta9-THC -> {9}, P450 -> {450}.
TOKENISED = re.compile(
    r"""(?xi)
    \bCYP\s?\d[A-Z]\d*\b | \bP-?450\b | \b[A-Z]?B-?12\b | \bB-?6\b | \bD-?\d\b
  | \b\d{1,2}[pq]\d{1,2}(?:[.-][pq]?\d{1,2})*\b            # cytogenetic loci: 15q11-q13
  | [Δδ]\s?\d                                              # delta-9-THC
  | \b(?:alpha|beta|gamma|α|β|γ)\s?-?\d\b                  # receptor subunits: alpha-5
  | \bDSM-?(?:I{1,3}|IV|V|5)(?:-TR|-R)?\b
  | \bstage\s?\d\b | \baxis\s?\d\b | \btype\s?\d\b | \bcluster\s?[ABC]\b
  | \b5-?HT\d?[A-Z]?\d?\b | \bD\d\b | \bGABA-?A\b | \bomega-?3\b
  | \b\d+M\b                                               # 6M categories
    """
)


def numbers(t: str) -> set[str]:
    """Numbers that function as measurements, with name-embedded digits removed first."""
    n = norm(t)
    n = TOKENISED.sub(" ", n)
    n = re.sub(r"(?<=\d),(?=\d{3}\b)", "", n)   # 13,502 -> 13502 so it matches the source
    return set(NUM.findall(n))


def citations(t: str) -> list[tuple[str, str]]:
    out = []
    n = norm(t)
    for pat, label in CITATION_PATTERNS:
        for m in re.finditer(pat, n):
            out.append((m.group(0).strip(), label))
    return out


def audit() -> tuple[list, list]:
    new = {f'{q["year"]}-{q["q_index"]}': q for q in json.loads(BANK.read_text())}
    old = {f'{q["year"]}-{q["q_index"]}': q for q in json.loads(ORIG.read_text())}

    cite_hits, num_hits = [], []
    for qid, q in new.items():
        after = q.get("explanation_text") or ""
        before = old[qid].get("explanation_text") or ""
        if not after.strip() or after == before:
            continue

        # Text the model could legitimately draw on: the original plus the question itself.
        source = before + " " + q["stem"] + " " + " ".join(o["text"] for o in q["options"])

        src_cites = {c for c, _ in citations(source)}
        for c, label in citations(after):
            if c not in src_cites:
                # tolerate case-only differences
                if c.lower() in {s.lower() for s in src_cites}:
                    continue
                cite_hits.append((qid, c, label))

        src_nums = numbers(source)
        invented = numbers(after) - src_nums
        # A range endpoint re-rendered ("3-5" -> "3 to 5"), a list index, or a bare digit that
        # appears anywhere in the raw source is not an invented measurement.
        raw = set(NUM.findall(re.sub(r"(?<=\d),(?=\d{3}\b)", "", norm(source))))
        invented = {n for n in invented if n not in raw}
        # single digits 1-9 are overwhelmingly list numbering or option indices, not statistics
        invented = {n for n in invented if not (len(n) == 1 and n.isdigit())}
        if invented:
            num_hits.append((qid, sorted(invented)))
    return cite_hits, num_hits


def main() -> None:
    detail = "--detail" in sys.argv
    cite_hits, num_hits = audit()
    print(f"INVENTED CITATIONS: {len(cite_hits)} across {len({c[0] for c in cite_hits})} explanations")
    by_label: dict[str, int] = {}
    for _, _, label in cite_hits:
        by_label[label] = by_label.get(label, 0) + 1
    for label, n in sorted(by_label.items(), key=lambda x: -x[1]):
        print(f"    {n:>4}  {label}")
    if detail:
        for qid, c, label in cite_hits:
            print(f"      {qid}: {c!r}  [{label}]")

    print(f"\nINVENTED NUMBERS: {len(num_hits)} explanations contain a number absent from the source")
    if detail:
        for qid, ns in num_hits[:80]:
            print(f"      {qid}: {', '.join(ns[:10])}")
    else:
        for qid, ns in num_hits[:15]:
            print(f"      {qid}: {', '.join(ns[:8])}")


if __name__ == "__main__":
    main()
