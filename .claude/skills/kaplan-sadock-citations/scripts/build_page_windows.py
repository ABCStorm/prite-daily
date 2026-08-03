#!/usr/bin/env python3
"""Work out which PDF pages to render so a reader can scroll around each citation.

The Textbook tab used to show exactly one page: the one the quote sits on. That
is enough to prove the quote is real, but not enough to *read the passage* — the
sentence before it is on the previous page. This computes a +/-WINDOW page range
around every cited page so the panel can page backwards and forwards.

Two things shape the range:

  * WINDOW (default 5) pages either side.
  * The section boundary. Scrolling out of "11.3 Stimulant-Related Disorders"
    and into the next section's opening paragraphs is worse than useless, so the
    range is clamped to the section's own page span and the panel is told which
    end it hit ("beginning of this section"). Some citations sit on a page
    outside their recorded section span (the section attribution and the page
    pointer come from different pipeline stages and occasionally disagree); for
    those the clamp is skipped rather than trusted, and a plain +/-WINDOW range
    is used.

⚠️ SOURCE OF TRUTH IS THE DEPLOYED BUNDLE, NOT kaplan_sadock_refs_SHIP.json.
What actually shipped is broader than that strong-only file: refs.json in R2
carries 2,697 questions / 3,148 citations, against SHIP.json's 1,632 / 1,959.
Building windows from SHIP.json silently leaves ~1,000 live questions with no
scrollable pages. Pull the deployed bundle down first if the snapshot is stale:

    npx wrangler@3 r2 object get textbook-excerpts/refs.json \\
        --file reference/kaplan_refs_bundle.LIVE.json

The cited page is parsed out of the per-question image filename
(`2014-2_11.3_p3321.png`), which is the only place the deployed bundle records it.

Inputs :  reference/kaplan_refs_bundle.LIVE.json  (snapshot of what's deployed)
          reference/section_index_full.json       (283 sections + pdf page spans)
Outputs:  reference/kaplan_page_windows.json      (per-citation ranges)
          reference/pages_to_render.txt           (sorted unique pages, one per line)
"""
import json
import pathlib
import re

WINDOW = 5
PDF_PAGES = 12754  # total pages in reference/kaplan-sadock-10e.pdf

ROOT = pathlib.Path(__file__).resolve().parents[4]
LIVE = ROOT / "reference" / "kaplan_refs_bundle.LIVE.json"
SECTIONS = ROOT / "reference" / "section_index_full.json"
OUT_WINDOWS = ROOT / "reference" / "kaplan_page_windows.json"
OUT_PAGES = ROOT / "reference" / "pages_to_render.txt"

PAGE_RE = re.compile(r"_p(\d+)\.png$")

sections = {
    s["num"]: (s["pdf_page_start"], s["pdf_page_end"])
    for s in json.loads(SECTIONS.read_text())
    if s.get("pdf_page_start") and s.get("pdf_page_end")
}

live = json.loads(LIVE.read_text())

windows = {}
pages = set()
n_cit = n_clamped = n_unclamped = n_nopage = 0

for qid, rec in live.items():
    span = sections.get(rec.get("section") or "")
    per_cite = []
    for c in rec["cites"]:
        m = PAGE_RE.search(c.get("image") or "")
        if not m:
            n_nopage += 1
            per_cite.append(None)
            continue
        p = int(m.group(1))
        n_cit += 1
        lo, hi = p - WINDOW, p + WINDOW
        at_start = at_end = False
        if span and span[0] <= p <= span[1]:
            n_clamped += 1
            lo, hi = max(lo, span[0]), min(hi, span[1])
            at_start, at_end = lo == span[0], hi == span[1]
        else:
            n_unclamped += 1
        lo, hi = max(1, lo), min(PDF_PAGES, hi)
        per_cite.append({"page": p, "lo": lo, "hi": hi,
                         "atStart": at_start, "atEnd": at_end})
        pages.update(range(lo, hi + 1))
    if any(per_cite):
        windows[qid] = per_cite

OUT_WINDOWS.write_text(json.dumps(windows, separators=(",", ":")))
OUT_PAGES.write_text("\n".join(str(p) for p in sorted(pages)) + "\n")

print(f"{len(windows)} questions, {n_cit} citations (+/-{WINDOW} pages)")
print(f"  section-clamped: {n_clamped}   plain window (section span disagreed): {n_unclamped}")
if n_nopage:
    print(f"  {n_nopage} citation(s) had no parseable page and were skipped")
print(f"  {len(pages)} unique pages to render -> {OUT_PAGES.name}")
