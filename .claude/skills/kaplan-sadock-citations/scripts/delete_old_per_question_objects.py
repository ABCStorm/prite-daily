#!/usr/bin/env python3
"""One-shot: delete the superseded PER-QUESTION page objects from R2.

Images were re-keyed per PDF page (`ks-03321.png`) for the reader pager, which
made the old per-question keys (`2014-2_11.3_p3321.png`) dead weight — 2,777
objects, 958 MB, storing 1,764 distinct pages. They were kept alive through the
rollout so browsers running the pre-window build didn't lose their page images
mid-session; `refs.json` has since dropped the `image` field that referenced them.

RUN ONLY AFTER the new refs.json (no `image` field) is live. Ordering matters:
delete first and any un-reloaded tab loses its page images while still being told
they exist.

Reads reference/old_objects_to_delete.txt. Every key is re-checked against the
per-question pattern before it is touched — a page key or refs.json slipping into
that list would gut the live image set, and delete is not undoable.

    python3 delete_old_per_question_objects.py [--dry-run] [--jobs N]
"""
import argparse
import pathlib
import random
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parents[4]
KEYS = ROOT / "reference" / "old_objects_to_delete.txt"
DONE = ROOT / "reference" / "old_objects_deleted.txt"
BUCKET = "textbook-excerpts"
WRANGLER = ROOT / "node_modules" / ".bin" / "wrangler"

# Two citations have no section, so that slot is literally "None".
PATTERN = re.compile(r"[0-9]{4}-[0-9]+_(?:[0-9.]+|None)_p[0-9]+\.png")


def delete(key: str) -> str | None:
    """R2 answers 429 ("consider throttling your request speed") well before the
    delete rate anything here can generate. An immediate retry just draws another
    429 — the first version of this retried three times with no pause and lost 109
    of 2,777 objects that way. Back off, and jitter so a parallel pool doesn't
    resynchronise into the next burst."""
    for attempt in range(5):
        r = subprocess.run(
            [str(WRANGLER), "r2", "object", "delete", f"{BUCKET}/{key}", "--remote"],
            capture_output=True, text=True,
        )
        if r.returncode == 0:
            return None
        if attempt == 4:
            return (r.stderr or r.stdout).strip()[-200:]
        time.sleep((2 ** attempt) + random.random())
    return "unreachable"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    # 12 drew sustained 429s. 4 finishes comfortably inside R2's tolerance.
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--limit", type=int)
    args = ap.parse_args()

    keys = [k.strip() for k in KEYS.read_text().split() if k.strip()]
    unsafe = [k for k in keys if k.startswith("ks-") or k == "refs.json"
              or not PATTERN.fullmatch(k)]
    if unsafe:
        print(f"ABORT: {len(unsafe)} key(s) are not old per-question objects: {unsafe[:5]}",
              file=sys.stderr)
        return 1

    done = set(DONE.read_text().split()) if DONE.exists() else set()
    todo = [k for k in keys if k not in done]
    if args.limit:
        todo = todo[: args.limit]
    print(f"{len(keys)} keys total, {len(done)} already deleted, {len(todo)} to delete")
    if args.dry_run:
        print("dry run — nothing deleted")
        return 0

    n_ok = n_fail = 0
    with DONE.open("a") as log, ThreadPoolExecutor(max_workers=args.jobs) as pool:
        for key, err in zip(todo, pool.map(delete, todo)):
            if err is None:
                n_ok += 1
                log.write(key + "\n")
                if n_ok % 250 == 0:
                    log.flush()
                    print(f"  {n_ok}/{len(todo)} deleted", flush=True)
            else:
                n_fail += 1
                print(f"  FAILED {key}: {err}", file=sys.stderr)
    print(f"done: {n_ok} deleted, {n_fail} failed")
    return 1 if n_fail else 0


if __name__ == "__main__":
    sys.exit(main())
