#!/usr/bin/env python3
"""Re-letter distractor bullets by solving the whole block at once.

Fixing bullets one at a time cannot repair a permutation. 2016-51's block wrote
A. Punishment / B. Positive reinforcement / C. Extinction / D. Sensitization against options
A. Extinction / B. Punishment / C. Sensitization / D. Positive reinforcement — a 4-cycle, where
every correct target letter is already occupied by another bullet, so a per-bullet "don't collide"
rule refuses all four. Matching the block's labels to the option list globally fixes the cycle.

Conservative by construction: a block is rewritten ONLY if every one of its bullets matches a
distinct option with high confidence. Any ambiguity and the whole block is left alone for review —
two earlier regressions (2017-190, 2020-293) came from relabelling on weak evidence.

  python3 extraction/fix_option_letters.py            # dry run
  python3 extraction/fix_option_letters.py --apply
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
BANK = BASE / "extraction" / "output" / "questions_all.json"
sys.path.insert(0, str(BASE / "extraction"))
from audit_option_letters import BULLET, similarity  # noqa: E402

CONFIDENT = 0.75


def solve(labels: list[str], opts: dict[str, str]) -> dict[int, str] | None:
    """Assign each bullet index a distinct option letter, greedily by best score.

    Returns None unless every bullet lands on a distinct option at >= CONFIDENT.
    """
    scored = []
    for i, lab in enumerate(labels):
        for L, text in opts.items():
            s = similarity(lab, text)
            if s >= CONFIDENT:
                scored.append((s, i, L))
    scored.sort(reverse=True)
    taken_i, taken_L, out = set(), set(), {}
    for s, i, L in scored:
        if i in taken_i or L in taken_L:
            continue
        out[i] = L
        taken_i.add(i)
        taken_L.add(L)
    return out if len(out) == len(labels) else None


def main() -> None:
    apply = "--apply" in sys.argv
    qs = json.loads(BANK.read_text())
    changed, skipped = [], []
    for q in qs:
        text = q.get("explanation_text") or ""
        if "❌" not in text:
            continue
        head, _, block = text.partition("❌")
        found = list(BULLET.finditer(block))
        if not found:
            continue
        opts = {o["letter"]: o["text"] for o in q["options"]}
        labels = [m.group(2).strip().rstrip(":—-").strip() for m in found]
        current = [m.group(1) for m in found]
        # A bullet may legitimately cover several options at once —
        # "**B. Esomeprazole / C. Omeprazole**", "**D. 5 years and E. 7 years**". Its label then
        # contains a second option letter, matches whichever option it likes, and drags the whole
        # block's assignment off by one. Never re-letter a block containing one.
        if any(re.search(r"\b[A-H]\.\s", lab) for lab in labels):
            continue
        assign = solve(labels, opts)
        qid = f'{q["year"]}-{q["q_index"]}'
        if assign is None:
            if any(similarity(lab, opts.get(L, "")) < CONFIDENT for lab, L in zip(labels, current)):
                skipped.append(qid)
            continue
        target = [assign[i] for i in range(len(labels))]
        if target == current:
            continue
        # rewrite each bullet's letter in place, longest label first so no prefix collides
        new_block = block
        for i in sorted(range(len(labels)), key=lambda j: -len(labels[j])):
            new_block = new_block.replace(f"**{current[i]}. {labels[i]}**",
                                          f"**{target[i]}. {labels[i]}**", 1)
        changed.append((qid, list(zip(current, target, labels))))
        if apply:
            q["explanation_text"] = head + "❌" + new_block

    print(f"blocks re-lettered: {len(changed)}")
    for qid, moves in changed[:12]:
        shown = ", ".join(f"{c}->{t} ({lab[:24]})" for c, t, lab in moves if c != t)
        print(f"  {qid}: {shown}")
    print(f"\nblocks left alone as ambiguous (need review): {len(skipped)}")
    print("  " + " ".join(skipped[:20]))
    if apply and changed:
        tmp = BANK.with_suffix(BANK.suffix + ".tmp")
        tmp.write_text(json.dumps(qs, indent=2, ensure_ascii=False))
        tmp.replace(BANK)
        print(f"\nwrote {BANK}")


if __name__ == "__main__":
    main()
