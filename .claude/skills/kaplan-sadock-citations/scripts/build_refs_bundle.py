#!/usr/bin/env python3
"""Build the compact citation bundle the app downloads.

Input : reference/kaplan_refs_bundle.LIVE.json (snapshot of the deployed refs.json)
        reference/kaplan_page_windows.json     (from build_page_windows.py)
Output: reference/kaplan_refs_bundle.json      (keyed by question id, app-shaped)

⚠️ THIS AUGMENTS THE DEPLOYED BUNDLE — it does not rebuild one from scratch.

It used to build from `reference/kaplan_sadock_refs_SHIP.json`, but that file no
longer matches what is actually live: SHIP.json holds 1,632 questions / 1,959
citations while the deployed refs.json holds 2,697 / 3,148. Regenerating from
SHIP.json would therefore *delete* citations from ~1,065 live questions. The
broader shipped set could not be reproduced from any file in reference/, so the
deployed artifact itself is the source of truth. Refresh the snapshot before
running if it might be stale:

    npx wrangler@3 r2 object get textbook-excerpts/refs.json \\
        --file reference/kaplan_refs_bundle.LIVE.json

Fields:

  * `image_url` is never emitted. The app builds it from VITE_TEXTBOOK_BASE so
    the Worker can be moved to a custom domain without regenerating this bundle.
  * Page images are keyed by PDF page (`ks-03321.png`), so the app derives every
    filename in the readable window from `page`/`lo`/`hi` arithmetic.
  * `image` (the old per-question filename, e.g. `2014-2_11.3_p3321.png`) was a
    transitional field carried through the page-window rollout so browsers still
    running the pre-window build didn't lose their page image mid-session.
    **Removed 2026-08-03**, along with the 2,777 old per-question objects in R2.
    Nothing references those keys any more — the app derives every filename from
    `page`/`lo`/`hi`. Don't reintroduce it.

⚠️ `page`, `lo` and `hi` are indexes into OUR PDF, not printed book pages — the
source is a reflowed ebook with none. They are here to address image files and
nothing else. The UI must never display them; it shows position relative to the
quote ("2 pages earlier") and cites the section. See the warning in SKILL.md.
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[4]
LIVE = ROOT / "reference" / "kaplan_refs_bundle.LIVE.json"
WINDOWS = ROOT / "reference" / "kaplan_page_windows.json"
OUT = ROOT / "reference" / "kaplan_refs_bundle.json"

live = json.loads(LIVE.read_text())
windows = json.loads(WINDOWS.read_text())

bundle = {}
n_cit = n_win = 0
for qid, rec in live.items():
    win = windows.get(qid) or []
    cites = []
    for i, c in enumerate(rec["cites"]):
        if not c.get("quote"):
            continue
        cite = {
            "quote": c["quote"],
            "role": c.get("role") or "primary",
            "note": c.get("note") or "",
        }
        w = win[i] if i < len(win) else None
        if w:
            n_win += 1
            cite.update(page=w["page"], lo=w["lo"], hi=w["hi"])
            # Only emit the boundary flags when true — they're the uncommon case
            # and this bundle ships to every reader on every session.
            if w["atStart"]:
                cite["atStart"] = True
            if w["atEnd"]:
                cite["atEnd"] = True
        cites.append(cite)
    if not cites:
        continue
    bundle[qid] = {
        "section": rec.get("section") or "",
        "title": rec.get("title") or "",
        "cites": cites,
    }
    n_cit += len(cites)

# A regression here is silent and expensive (readers just lose their Textbook
# tab), so refuse to write a bundle smaller than the one it replaces.
if len(bundle) < len(live) or n_cit < sum(len(v["cites"]) for v in live.values()):
    raise SystemExit(
        f"refusing to shrink the bundle: {len(bundle)} questions / {n_cit} citations "
        f"vs live {len(live)} / {sum(len(v['cites']) for v in live.values())}"
    )

OUT.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":")))
size_kb = OUT.stat().st_size / 1024
print(f"{len(bundle)} questions, {n_cit} citations "
      f"({n_win} with a readable page window) -> {OUT.name} ({size_kb:.0f} KB)")
