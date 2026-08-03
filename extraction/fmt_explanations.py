#!/usr/bin/env python3
"""Explanation reformatting harness for the PRITE Daily question bank.

Splits `extraction/output/questions_all.json` explanations into batch files for cheap-model
reformatting, validates the returned batches (content retention, structure, markup sanity), and
merges the accepted ones back into the bank.

  python3 extraction/fmt_explanations.py split            # write _fmt/batches/batch_NNN.json
  python3 extraction/fmt_explanations.py check [NNN ...]  # validate returned .out.json files
  python3 extraction/fmt_explanations.py merge            # merge every passing item into the bank
  python3 extraction/fmt_explanations.py status           # per-batch done/partial/corrupt/missing
  python3 extraction/fmt_explanations.py pending          # JSON list of unfinished batches

Crash safety: each agent writes its own batch_NNN.out.json as it finishes, so a killed run loses
only the batches that were mid-flight. `pending` reports exactly those (including files truncated
mid-Write) and its output goes straight into the workflow's `args` to resume. `merge` is idempotent,
snapshots the bank first, and writes atomically, so it is safe to run as a checkpoint at any time —
including while agents are still running.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
BANK = BASE / "extraction" / "output" / "questions_all.json"
FMT = BASE / "extraction" / "output" / "_fmt"
BATCHES = FMT / "batches"
BATCH_SIZE = 8
# Items whose validator complaints were reviewed by hand and judged correct — almost always the
# model dropping OCR/scrape debris (mangled citation markers, scrambled numeric tables, pasted
# search-result blurbs). `check` still reports these; `merge` accepts them.
REVIEWED = FMT / "reviewed_ok.json"
# How many `.bak-premerge-*` snapshots to retain (the bank is ~12 MB each).
KEEP_BACKUPS = 3

STOP = set(
    """a an the of and or in on to for with is are was were be been being as at by from that this
    these those it its his her their they he she we you not no but if then than so such into over
    under about which who whom whose when where why how all any both each more most other some can
    could may might will would should does did do done has have had""".split()
)


# ---------------------------------------------------------------- helpers
def words(t: str) -> list[str]:
    return re.findall(r"[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*", t or "")


def content_tokens(t: str) -> list[str]:
    return [w.lower() for w in words(t) if w.lower() not in STOP and len(w) > 2]


def strip_markup(t: str) -> str:
    """Reduce formatted text to bare prose so it can be compared with the original."""
    t = re.sub(r"\*\*|\*|•", " ", t or "")
    # Drop emoji/arrows/etc. but leave a space, so "A→B" doesn't collapse into one token.
    return "".join(ch if ord(ch) < 0x2000 or ch in "–—‘’“”" else " " for ch in t)


def key(q: dict) -> str:
    return f'{q["year"]}-{q["q_index"]}'


LEAD_EMOJI = re.compile(r"^[^\w\s\*]", re.U)


def validate(original: str, new: str) -> list[str]:
    """Return a list of problems; empty list means the item passes."""
    problems: list[str] = []
    if len(original.strip()) < 20:
        if new.strip() != original.strip():
            problems.append("short explanation should have been returned unchanged")
        return problems
    if not new or not new.strip():
        return ["empty output"]

    bare = strip_markup(new)
    ow, nw = len(words(original)), len(words(bare))
    ratio = nw / max(1, ow)
    # Losing content is always a failure. Growth is judged against how much was there to begin
    # with: a terse original legitimately grows when the house style adds a per-option distractor
    # block (reviewed and accepted 2026-07-25), whereas an already-substantial explanation that
    # balloons is padding. Runaway growth fails at any length.
    if ratio < 0.90:
        problems.append(f"content loss: {nw}w vs {ow}w ({ratio:.0%})")
    elif ow >= 150 and ratio > 1.35:
        problems.append(f"content added to an already-full explanation: {nw}w vs {ow}w ({ratio:.0%})")
    elif ratio > 3.5:
        problems.append(f"runaway expansion: {nw}w vs {ow}w ({ratio:.0%})")

    # Retention of the original's distinctive vocabulary (numbers, drug names, findings).
    orig_set, new_set = set(content_tokens(original)), set(content_tokens(bare))
    missing = orig_set - new_set
    if orig_set:
        kept = 1 - len(missing) / len(orig_set)
        if kept < 0.85:
            sample = ", ".join(sorted(missing)[:8])
            problems.append(f"dropped {len(missing)}/{len(orig_set)} content words ({kept:.0%} kept): {sample}")

    # Every number in the original must survive (doses, ages, percentages, years).
    onums = set(re.findall(r"\d+(?:\.\d+)?", original))
    nnums = set(re.findall(r"\d+(?:\.\d+)?", bare))
    lost = onums - nnums
    if lost:
        problems.append("lost numbers: " + ", ".join(sorted(lost)[:8]))

    # Anti-gaming: the "lost numbers" rule above tempts a model that deleted an OCR-scrambled
    # table to paste the orphaned numbers back as prose ("event counts of 210, 231, 232, 238...").
    # That reads authoritative but is noise, so treat a run of 4+ comma-separated bare numbers
    # outside a bullet as a failure in its own right.
    for m in re.finditer(r"\d+(?:\.\d+)?(?:\s*,\s*\d+(?:\.\d+)?){3,}", bare):
        line_start = bare.rfind("\n", 0, m.start()) + 1
        if not bare[line_start:m.start()].lstrip().startswith("•"):
            problems.append(f"number dump (looks like validator gaming): '{m.group(0)[:40]}...'")
            break

    lines = [ln for ln in new.split("\n")]
    head = lines[0].strip()
    if not LEAD_EMOJI.match(head):
        problems.append("first line does not start with a topic emoji")
    if not re.search(r"\*\*.+\*\*", head):
        problems.append("first line has no bolded title")
    if len(words(head)) > 12:
        problems.append("title line too long")
    if new.count("**") % 2:
        problems.append("unbalanced ** markers")
    if re.search(r"^\s*[-*]\s+", new, re.M):
        problems.append("uses - or * as a bullet instead of •")
    if re.search(r"^#{1,6}\s", new, re.M) or "```" in new or "<b>" in new:
        problems.append("uses forbidden markdown/html")
    # Residents see this text raw, so none of the source's authoring debris may survive.
    if re.search(r"\{\{?c\d\s*[:;]|\(\(c\d\s*:", new):
        problems.append("Anki cloze syntax left in the output")
    if re.search(r"^\s*(Thought for \d+ seconds|You'?re (right|correct)\b|Great question)", new, re.I):
        problems.append("chatbot preamble left in the output")
    if len(lines) < 3:
        problems.append("no block structure (fewer than 3 lines)")
    nbold = len(re.findall(r"\*\*[^*]+\*\*", new))
    if nbold < 2:
        problems.append("almost no bolding")
    for m in re.findall(r"\*\*([^*]+)\*\*", new):
        if len(words(m)) > 25:
            problems.append("a bold span swallows a whole paragraph")
            break
    return problems


# ---------------------------------------------------------------- commands
def cmd_split() -> None:
    qs = json.loads(BANK.read_text())
    BATCHES.mkdir(parents=True, exist_ok=True)
    items = [
        {
            "id": key(q),
            "stem": q["stem"],
            "options": [f'{o["letter"]}. {o["text"]}' for o in q["options"]],
            "answer": q.get("answer_raw") or q.get("answer_letter"),
            "explanation_text": q.get("explanation_text") or "",
        }
        for q in qs
        if (q.get("explanation_text") or "").strip()
    ]
    n = 0
    for i in range(0, len(items), BATCH_SIZE):
        (BATCHES / f"batch_{i // BATCH_SIZE:04d}.json").write_text(
            json.dumps(items[i : i + BATCH_SIZE], indent=1, ensure_ascii=False)
        )
        n += 1
    print(f"wrote {n} batches of {BATCH_SIZE} covering {len(items)} explanations -> {BATCHES}")


def load_batch(num: str) -> tuple[Path, Path]:
    return BATCHES / f"batch_{num}.json", BATCHES / f"batch_{num}.out.json"


def cmd_check(args: list[str]) -> None:
    nums = args or sorted(p.stem.split("_")[1] for p in BATCHES.glob("batch_*.out.json"))
    nums = [n.replace(".out", "") for n in nums]
    total_ok = total_bad = 0
    bad_batches: list[str] = []
    for num in nums:
        inp, outp = load_batch(num)
        if not outp.exists():
            continue
        src = {x["id"]: x["explanation_text"] for x in json.loads(inp.read_text())}
        try:
            got = json.loads(outp.read_text())
        except json.JSONDecodeError as e:
            print(f"batch {num}: INVALID JSON ({e})")
            bad_batches.append(num)
            continue
        got_map = {x["id"]: x.get("explanation_text", "") for x in got}
        missing = [i for i in src if i not in got_map]
        extra = [i for i in got_map if i not in src]
        fails: list[str] = []
        for qid, orig in src.items():
            if qid not in got_map:
                continue
            probs = validate(orig, got_map[qid])
            if probs:
                fails.append(f"    {qid}: {'; '.join(probs)}")
        ok = len(src) - len(missing) - len(fails)
        total_ok += ok
        total_bad += len(missing) + len(fails)
        if missing or extra or fails:
            bad_batches.append(num)
            print(f"batch {num}: {ok}/{len(src)} ok")
            if missing:
                print(f"    MISSING: {', '.join(missing)}")
            if extra:
                print(f"    EXTRA: {', '.join(extra)}")
            for f in fails:
                print(f)
    print(f"\n{total_ok} passing, {total_bad} failing across {len(nums)} returned batches")
    if bad_batches:
        print("redo batches: " + " ".join(bad_batches))


def reviewed_ok() -> dict[str, str]:
    if not REVIEWED.exists():
        return {}
    return json.loads(REVIEWED.read_text())


def write_atomic(path: Path, text: str) -> None:
    """Write via a temp file + rename so an interrupt can never truncate `path`.

    The bank is the only copy of 3,600 questions; a half-written questions_all.json would be
    unrecoverable, and this runs while hundreds of agents are alive and may be killed at any time.
    """
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text)
    os.replace(tmp, path)


def batch_state(num: str) -> tuple[str, int, int]:
    """Classify one batch as done / partial / missing, with (covered, expected) item counts."""
    inp, outp = load_batch(num)
    expected = len(json.loads(inp.read_text()))
    if not outp.exists():
        return "missing", 0, expected
    try:
        got = json.loads(outp.read_text())
    except json.JSONDecodeError:
        return "corrupt", 0, expected          # agent killed mid-Write
    src_ids = {x["id"] for x in json.loads(inp.read_text())}
    covered = len({x["id"] for x in got if isinstance(x, dict) and x.get("id") in src_ids})
    return ("done" if covered == expected else "partial"), covered, expected


def all_batch_nums() -> list[str]:
    return sorted(
        p.stem.split("_")[1]
        for p in BATCHES.glob("batch_*.json")
        if not p.name.endswith(".out.json") and p.stem.split("_")[1] != "9999"
    )


def cmd_merge() -> None:
    qs = json.loads(BANK.read_text())
    by_id = {key(q): q for q in qs}
    allow = reviewed_ok()
    merged = skipped = forced = 0
    for outp in sorted(BATCHES.glob("batch_*.out.json")):
        inp = BATCHES / (outp.name.replace(".out.json", ".json"))
        src = {x["id"]: x["explanation_text"] for x in json.loads(inp.read_text())}
        try:
            got = json.loads(outp.read_text())
        except json.JSONDecodeError:
            continue
        for x in got:
            qid, new = x["id"], x.get("explanation_text", "")
            if qid not in src or qid not in by_id:
                continue
            if validate(src[qid], new):
                if qid not in allow:
                    skipped += 1
                    continue
                forced += 1
            if by_id[qid].get("explanation_text") != new:
                by_id[qid]["explanation_text"] = new
                merged += 1
    if merged:
        # Snapshot before overwriting, so a bad merge is always one `cp` away from undone.
        # The bank is ~12 MB, and merge is meant to be run repeatedly as a checkpoint, so keep
        # only the few most recent snapshots — older milestones have their own .bak-* names.
        stamp = time.strftime("%Y%m%d_%H%M%S")
        backup = BANK.with_name(BANK.name + f".bak-premerge-{stamp}")
        backup.write_text(BANK.read_text())
        print(f"backed up prior bank -> {backup.name}")
        stale = sorted(BANK.parent.glob(BANK.name + ".bak-premerge-*"), reverse=True)[KEEP_BACKUPS:]
        for old in stale:
            old.unlink()
        if stale:
            print(f"pruned {len(stale)} older premerge snapshot(s)")
    write_atomic(BANK, json.dumps(qs, indent=2, ensure_ascii=False))
    print(f"merged {merged} reformatted explanations "
          f"({forced} accepted via reviewed_ok.json); skipped {skipped} that failed validation")
    print(f"wrote {BANK}")


DISTRACTOR_HEADER = "**❌ Why not the others**"
# How the source signals it already discussed the distractors, in any of its pre-reformat phrasings.
HAD_DISTRACTORS = re.compile(r"why (not|the others)|why the others are wrong|other options|not [A-E][,.]", re.I)


def gained_distractor_block(original: str, new: str) -> bool:
    """True when the reformat invented a distractor block the source never had.

    These are the only bullets in the bank asserting something no human wrote, so they are the
    population that needs fact-checking (a 30-item audit found ~23% wrong or misleading).
    """
    return DISTRACTOR_HEADER in (new or "") and not HAD_DISTRACTORS.search(original or "")


def strip_distractor_block(text: str) -> str:
    """Remove the added `❌ Why not the others` block and its bullets, keeping everything else.

    Used to walk back an invented block that failed fact-checking without losing the emoji title,
    bolding, and bullet structure applied to the source's own content.
    """
    out, skipping = [], False
    for line in (text or "").split("\n"):
        stripped = line.strip()
        if stripped == DISTRACTOR_HEADER:
            skipping = True
            continue
        if skipping:
            # The block runs until a non-bullet, non-blank line (the next section).
            if not stripped or stripped.startswith("•"):
                continue
            skipping = False
        out.append(line)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip()


def cmd_audit_additions() -> None:
    """List every merged item that gained an invented distractor block, as fact-check input."""
    bank = {key(q): q for q in json.loads(BANK.read_text())}
    items = []
    for outp in sorted(BATCHES.glob("batch_*.out.json")):
        inp = BATCHES / outp.name.replace(".out.json", ".json")
        try:
            src = {x["id"]: x for x in json.loads(inp.read_text())}
            got = {x["id"]: x["explanation_text"] for x in json.loads(outp.read_text())}
        except (json.JSONDecodeError, KeyError):
            continue
        for qid, q in src.items():
            if qid not in got or qid not in bank or validate(q["explanation_text"], got[qid]):
                continue
            if gained_distractor_block(q["explanation_text"], got[qid]):
                items.append({
                    "id": qid,
                    "stem": q["stem"],
                    "options": q["options"],
                    "answer": q["answer"],
                    "original": q["explanation_text"],
                    "reformatted": got[qid],
                })
    dest = FMT / "additions_audit.json"
    write_atomic(dest, json.dumps(items, indent=1, ensure_ascii=False))
    print(f"{len(items)} items gained an invented distractor block -> {dest}")


def cmd_revert_additions() -> None:
    """Strip the invented distractor block from every id listed in _fmt/additions_rejected.json."""
    rejected_path = FMT / "additions_rejected.json"
    if not rejected_path.exists():
        print(f"nothing to do: {rejected_path.name} not found")
        return
    rejected = json.loads(rejected_path.read_text())
    ids = set(rejected if isinstance(rejected, list) else rejected.keys())
    qs = json.loads(BANK.read_text())
    n = 0
    for q in qs:
        if key(q) in ids and DISTRACTOR_HEADER in (q.get("explanation_text") or ""):
            q["explanation_text"] = strip_distractor_block(q["explanation_text"])
            n += 1
    write_atomic(BANK, json.dumps(qs, indent=2, ensure_ascii=False))
    print(f"stripped the invented distractor block from {n}/{len(ids)} items")


def cmd_status() -> None:
    nums = all_batch_nums()
    states: dict[str, list[str]] = {}
    for num in nums:
        state, covered, expected = batch_state(num)
        states.setdefault(state, []).append(num if state == "done" else f"{num}({covered}/{expected})")
    done = states.get("done", [])
    print(f"{len(done)}/{len(nums)} batches complete")
    for state in ("partial", "corrupt", "missing"):
        got = states.get(state, [])
        if not got:
            continue
        shown = " ".join(got[:40]) + (" ..." if len(got) > 40 else "")
        print(f"  {state}: {len(got)}   {shown}")
    if len(done) < len(nums):
        print("\nrelaunch the unfinished ones with:  python3 extraction/fmt_explanations.py pending")


def cmd_pending() -> None:
    """Emit the unfinished batch list as JSON, ready to paste into the workflow's `args`.

    Anything not fully covered — never started, killed mid-Write, or missing items — is included,
    so a relaunch redoes exactly the lost work and nothing else. Completed batches are never re-run.
    """
    todo = [num for num in all_batch_nums() if batch_state(num)[0] != "done"]
    print(json.dumps(todo))


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    {"split": lambda: cmd_split(), "check": lambda: cmd_check(sys.argv[2:]),
     "merge": lambda: cmd_merge(), "status": lambda: cmd_status(),
     "pending": lambda: cmd_pending(), "audit-additions": lambda: cmd_audit_additions(),
     "revert-additions": lambda: cmd_revert_additions()}[cmd]()
