#!/usr/bin/env python3
"""Check that every "A. <label>" reference in an explanation matches the question's real options.

The reformatting pass rewrites distractor discussion into bullets of the form

    • **D. Reaction formation** — ...

If it attaches the wrong letter to an option (caught in the wild on 2020-25, where the stem has
D. Regression and E. Reaction formation), a resident memorises the wrong letter. Unlike a subtle
medical claim this is mechanically verifiable against the question's own option list, so it costs
nothing to check exhaustively rather than by sampling.

  python3 extraction/audit_option_letters.py           # summary + mismatches
  python3 extraction/audit_option_letters.py --fix     # rewrite bullets to the correct letter
"""
from __future__ import annotations

import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
BANK = BASE / "extraction" / "output" / "questions_all.json"

# "• **D. Reaction formation** — ..." / "• **D. Reaction formation:** ..."
BULLET = re.compile(r"^\s*•\s*\*\*([A-H])\.\s*([^*]{2,90}?)\*\*", re.M)


def norm(s: str) -> str:
    s = re.sub(r"\([^)]*\)", " ", s or "")
    s = re.sub(r"[^a-z0-9 ]", " ", s.lower())
    return re.sub(r"\s+", " ", s).strip()


STOP = {"the", "a", "an", "of", "to", "in", "and", "or", "with", "for", "is", "be", "by", "on", "due"}

ACRONYM = re.compile(r"^[A-Z][A-Za-z]{0,7}$")


def acronym_match(label: str, option: str) -> bool:
    """True when the label is an abbreviation the option spells out.

    Explanations routinely shorten an option — "OCD" for "Obsessive-compulsive disorder (OCD)",
    "ADHD" for "Comorbid attention-deficit/hyperactivity disorder". norm() drops parenthetical
    text, so these score near zero and block the whole block from being re-lettered.
    """
    lab = label.strip().rstrip(".")
    if not ACRONYM.match(lab) or len(lab) < 2:
        return False
    if re.search(rf"\b{re.escape(lab)}\b", option):
        return True
    # initials of the option's content words, e.g. ADHD <- attention deficit hyperactivity disorder
    words = [w for w in re.split(r"[^A-Za-z]+", option) if w and w.lower() not in STOP]
    return "".join(w[0] for w in words).upper().startswith(lab.upper()) and len(lab) >= 3


def similarity(a: str, b: str) -> float:
    """Word-overlap similarity between an explanation's option label and a real option.

    Two traps, both hit in practice on this bank:

    * Character ratios are useless — "Extinction" vs "Sensitization" scores 0.61 on shared letters
      (-tion, -i-, -n-) despite being different options.
    * Substring containment is worse than useless: distractors are routinely near-prefixes of each
      other, so "conditioned response" is *inside* "unconditioned response" and "anxiety disorder"
      is inside "separation anxiety disorder". Treating containment as a perfect match made the
      solver confidently relabel correct bullets onto the wrong option.

    So: compare content-word sets and divide by the LARGER set. Containment then scores below 1,
    which is what distinguishes "Anxiety disorder" from "Separation anxiety disorder".
    """
    if acronym_match(a, b) or acronym_match(b, a):
        return 1.0
    a, b = norm(a), norm(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    # Crude singularisation: an explanation writes "histones"/"tics" where the option says
    # "histone"/"tic", which otherwise drops a real match to near zero.
    def stem(w: str) -> str:
        return w[:-1] if len(w) > 4 and w.endswith("s") and not w.endswith("ss") else w

    aw = {stem(w) for w in a.split() if w not in STOP}
    bw = {stem(w) for w in b.split() if w not in STOP}
    if not aw or not bw:
        return 0.0
    overlap = len(aw & bw) / max(len(aw), len(bw))
    if overlap:
        return overlap
    # no shared words at all — fall back to character ratio only to catch OCR-level typos
    return SequenceMatcher(None, a, b).ratio() * 0.5


def audit(fix: bool = False):
    qs = json.loads(BANK.read_text())
    mismatches, corrected = [], 0
    dupes, answer_as_distractor = [], []
    for q in qs:
        text = q.get("explanation_text") or ""
        if "•" not in text:
            continue
        opts = {o["letter"]: o["text"] for o in q["options"]}
        qid = f'{q["year"]}-{q["q_index"]}'

        # Two structural errors that need no medical judgement to spot.
        if "❌" in text:
            block = text.split("❌", 1)[1]
            letters = [mm.group(1) for mm in BULLET.finditer(block)]
            if len(letters) != len(set(letters)):
                dupes.append(qid)
            clash = sorted(set(q.get("answer_letters") or []) & set(letters))
            if clash:
                answer_as_distractor.append({"id": qid, "letters": clash})

        bullets = [(m.group(1), m.group(2).strip().rstrip(":\u2014-").strip())
                   for m in BULLET.finditer(text)]
        used = {L for L, _ in bullets}
        new_text = text
        for letter, label in bullets:
            if letter not in opts:
                continue
            claimed = similarity(label, opts[letter])
            best = max(opts, key=lambda L: similarity(label, opts[L]))
            best_score = similarity(label, opts[best])
            if best == letter or best_score < 0.75 or claimed >= 0.75:
                continue
            mismatches.append({
                "id": qid, "wrote": f"{letter}. {label}",
                "actual_for_that_letter": f"{letter}. {opts[letter]}",
                "label_really_is": f"{best}. {opts[best]}",
                "claimed_score": round(claimed, 2), "best_score": round(best_score, 2),
            })
            # Only rewrite when the evidence is overwhelming AND the move cannot collide.
            # Two regressions came from relabelling on weak evidence: 2017-190's "D. DSM-III-R"
            # was right (option D is OCR-garbled "DSM-11I-R" so it scored 0), and 2020-293's
            # "A." bullet was a correct paraphrase. Both were moved onto a letter already in use.
            safe = claimed <= 0.20 and best_score >= 0.85 and best not in used
            if fix and safe:
                new_text = new_text.replace(f"**{letter}. {label}**", f"**{best}. {label}**", 1)
                used.discard(letter); used.add(best)
                corrected += 1
        if fix and new_text != text:
            q["explanation_text"] = new_text
    if fix and corrected:
        tmp = BANK.with_suffix(BANK.suffix + ".tmp")
        tmp.write_text(json.dumps(qs, indent=2, ensure_ascii=False))
        tmp.replace(BANK)
    return mismatches, corrected, dupes, answer_as_distractor


def main() -> None:
    fix = "--fix" in sys.argv
    mm, corrected, dupes, aad = audit(fix)
    print(f"option-letter mismatches: {len(mm)}")
    for x in mm:
        print(f"\n  {x['id']}")
        print(f"    explanation says : {x['wrote']}")
        print(f"    that letter is   : {x['actual_for_that_letter']}")
        print(f"    the label is     : {x['label_really_is']}")
    if fix:
        print(f"\ncorrected {corrected} bullets")
    print(f"\nduplicate letters inside one 'why not' block: {len(dupes)}  {dupes[:10]}")
    print(f"distractor bullet using the CORRECT answer's letter: {len(aad)}")
    for x in aad[:15]:
        print(f"    {x['id']}: {', '.join(x['letters'])}")


if __name__ == "__main__":
    main()
