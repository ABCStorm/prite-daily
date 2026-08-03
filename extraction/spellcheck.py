#!/usr/bin/env python3
"""Find OCR spelling damage in question stems, answer options, and answer text.

A dictionary spellcheck is the wrong tool here. /usr/share/dict/words lacks most inflections
("banned", "handoffs") and essentially all medical vocabulary, so it flags thousands of correct
words while missing the errors that actually matter. The real defects are glyph confusions from
the slide OCR, and those have precise shapes:

    I_for_l     capital I where lowercase l belongs — "Fronto-subcorticaI"
    l_for_I     lowercase l where capital I belongs — "ChlP-sequencing", "Anti-lgLON"
    digit_mix   a stray digit inside an alphabetic word — "patlent", "l0ss"

The two letterform rules need no corroboration: a capital I between two lowercase letters, or a
lone lowercase l inside an acronym, is essentially always a glyph error in English or medical
prose. Requiring the correction to be "attested elsewhere" actively broke this — it rejected
Fronto-subcortical and ChIP-sequencing for being rare, which is exactly what a rare-term-friendly
checker must not do. digit_mix keeps the attestation requirement because digits legitimately
appear in receptor and gene names (a1A, MgSO4, IgLON5).

An "rn"->"m" rule was tried and removed: it cannot distinguish OCR damage from surnames, and
flagged Karen Horney and Dr. Lorna Breen as misspellings of "Homey" and "Loma".

  python3 extraction/spellcheck.py                # report
  python3 extraction/spellcheck.py --apply        # write the confident fixes back to the bank
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
BANK = BASE / "extraction" / "output" / "questions_all.json"
DICT = Path("/usr/share/dict/words")

WORD = re.compile(r"[A-Za-z0-9][A-Za-z0-9'’\-]*[A-Za-z0-9]|[A-Za-z]")


def load_english() -> set[str]:
    w = {x.strip().lower() for x in DICT.read_text(errors="ignore").split() if x.strip()}
    return w | {x + "s" for x in w}


def bank_vocab(qs: list[dict]) -> Counter:
    """Every token in the bank with how many questions it appears in."""
    seen: dict[str, set[str]] = defaultdict(set)
    for q in qs:
        qid = f'{q["year"]}-{q["q_index"]}'
        texts = [q.get("stem") or "", q.get("answer_text") or "", q.get("explanation_text") or ""]
        texts += [(o.get("text") or "") for o in (q.get("options") or [])]
        for t in texts:
            for m in WORD.finditer(t):
                seen[m.group(0)].add(qid)
    return Counter({w: len(ids) for w, ids in seen.items()})


def candidates(word: str) -> list[tuple[str, str]]:
    """Possible corrections for `word`, each tagged with the rule that produced it."""
    out: list[tuple[str, str]] = []
    # capital I surrounded by lowercase -> lowercase l   (subcorticaI)
    if re.search(r"[a-z]I(?=[a-z]|\b)", word):
        out.append((re.sub(r"(?<=[a-z])I(?=[a-z]|\b)", "l", word), "I_for_l"))
    # lowercase l sitting inside a mixed-case term -> capital I  (ChlP, Anti-lgLON, MRl)
    #   [a-z]l[A-Z]   "ChlP"      l wedged before a capital
    #   ^l[a-z]*[A-Z] "lgLON"     l opening a segment that goes on to capitalise
    if re.search(r"[A-Za-z]l(?=[A-Z])", word) or re.search(r"(?<![A-Za-z])l(?=[a-z]{0,3}[A-Z])", word):
        fixed = re.sub(r"(?<=[A-Za-z])l(?=[A-Z])", "I", word)
        fixed = re.sub(r"(?<![A-Za-z])l(?=[a-z]{0,3}[A-Z])", "I", fixed)
        out.append((fixed, "l_for_I"))
    # digit inside an otherwise alphabetic word
    if re.search(r"[A-Za-z][01][A-Za-z]", word):
        out.append((word.replace("0", "o").replace("1", "l"), "digit_mix"))
        out.append((word.replace("0", "O").replace("1", "I"), "digit_mix"))
    return [(c, k) for c, k in out if c != word]


def main() -> None:
    apply = "--apply" in sys.argv
    qs = json.loads(BANK.read_text())
    english = load_english()
    vocab = bank_vocab(qs)
    # A correction is credible if the fixed form is common in the bank or a dictionary word.
    def attested(w: str) -> bool:
        return vocab.get(w, 0) >= 3 or w.lower() in english or vocab.get(w.lower(), 0) >= 3

    findings = []
    for q in qs:
        qid = f'{q["year"]}-{q["q_index"]}'
        targets = [("stem", q.get("stem") or ""), ("answer_text", q.get("answer_text") or "")]
        for o in q.get("options") or []:
            targets.append((f'option:{o["letter"]}', o.get("text") or ""))
        for field, text in targets:
            for m in WORD.finditer(text):
                raw = m.group(0)
                if len(raw) < 3 or vocab.get(raw, 0) >= 3:
                    continue                       # common in the bank => real term
                for fixed, kind in candidates(raw):
                    # Letterform errors are self-evident; only digit swaps need corroboration.
                    # digit swaps must be corroborated by the BANK, not the English dictionary:
                    # "a1A" -> "alA" passed only because "ala" is an English word.
                    ok = True if kind in ("I_for_l", "l_for_I") else vocab.get(fixed, 0) >= 3
                    if ok and not attested(raw):
                        findings.append(dict(
                            qid=qid, field=field, word=raw, fix=fixed, kind=kind,
                            ctx=re.sub(r"\s+", " ", text[max(0, m.start() - 40):m.start() + len(raw) + 30]),
                        ))
                        break

    print(f"scanned {len(qs)} questions (stems, options, answer text)")
    print(f"bank vocabulary: {len(vocab):,} distinct tokens\n")
    if not findings:
        print("no OCR spelling damage found")
        return
    for k, n in Counter(f["kind"] for f in findings).most_common():
        print(f"  {n:>3}  {k}")
    print()
    for f in findings:
        print(f"  {f['qid']:>10}  {f['field']:<12} {f['word']}  →  {f['fix']}   [{f['kind']}]")
        print(f"              …{f['ctx']}…")

    out = BASE / "extraction" / "output" / "_fmt" / "spellcheck.json"
    out.write_text(json.dumps(findings, indent=1, ensure_ascii=False))
    print(f"\nwrote {out}")

    if apply:
        by_q = defaultdict(list)
        for f in findings:
            by_q[f["qid"]].append(f)
        n = 0
        for q in qs:
            qid = f'{q["year"]}-{q["q_index"]}'
            for f in by_q.get(qid, []):
                if f["field"] == "stem":
                    q["stem"] = q["stem"].replace(f["word"], f["fix"]); n += 1
                elif f["field"] == "answer_text":
                    q["answer_text"] = q["answer_text"].replace(f["word"], f["fix"]); n += 1
                elif f["field"].startswith("option:"):
                    letter = f["field"].split(":")[1]
                    for o in q["options"]:
                        if o["letter"] == letter:
                            o["text"] = o["text"].replace(f["word"], f["fix"]); n += 1
        tmp = BANK.with_suffix(BANK.suffix + ".tmp")
        tmp.write_text(json.dumps(qs, indent=2, ensure_ascii=False))
        tmp.replace(BANK)
        print(f"applied {n} fixes to {BANK.name}")


if __name__ == "__main__":
    main()
