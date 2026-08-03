"""
Deterministic, non-negotiable verification pass for the K&S citation pipeline.
Never trust an agent's self-rating (STRONG/WEAK) as proof a quote is real --
independently confirmed hallucinations have slipped through self-rating in
this project (see SKILL.md "known failure mode: fabricated continuations").

For every citation:
  1. Check the quote is an exact (whitespace/unicode-normalized) substring of
     the actual book markdown. If not -> QUOTE_NOT_FOUND (reject it, don't ship it).
  2. Locate which PDF page it's actually on, first restricted to the claimed
     section's page range, then -- if that fails -- across the whole book
     (tables and italicized/hyphenated text often don't survive PyMuPDF's
     page.get_text() the same way the markdown source does, so a "not found
     in its own section" result is frequently a tooling limitation, not a
     fabrication -- recovers ~35-60% of apparent failures in past runs).
  3. Render the located page to a PNG screenshot for the citation's image.

PERFORMANCE NOTE (learned the hard way): do NOT re-extract page.get_text()
per-quote per-page -- that's O(n_failing_quotes x 12,754 pages) and made a
run over ~130 failing quotes take so long it had to be killed mid-run. This
version extracts and normalizes every page's text ONCE up front (~1-3 min for
the whole 12,754-page book) and does all lookups as cheap in-memory substring
checks against that cache -- O(n_pages) once, not O(n_citations x n_pages).

Usage:
    python3 verify_citations.py <input.json> <output_prefix>

<input.json> must be a JSON array of objects shaped like:
    {"id": "...", "section_num": "...", "rating": "STRONG"|"WEAK"|"NONE",
     "citations": [{"quote": "...", "supports": "...", "note": "..."}]}
(This is exactly the merged shape of a workflow run's stage1_direct + fallback
arrays -- see SKILL.md "merging workflow output" for the merge snippet.)

Writes <output_prefix>_verified.json and screenshots to
reference/screenshots_<output_prefix>/.
"""
import json
import os
import re
import sys
import unicodedata

import fitz

BASE = "/Users/andrewcorrell/Claude/Projects/PRITE question practice website"


def normalize(s):
    s = unicodedata.normalize("NFKC", s)
    s = s.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    s = s.replace("–", "-").replace("—", "-").replace("′", "'")
    s = re.sub(r"-\s*\n?\s*", "", s)  # collapse hyphenated line-breaks
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


def main(input_path, output_prefix):
    with open(f"{BASE}/reference/section_index_full.json") as f:
        sections = {s["num"]: s for s in json.load(f)}
    with open(input_path) as f:
        raw = json.load(f)

    doc = fitz.open(f"{BASE}/reference/kaplan-sadock-10e.pdf")
    with open(f"{BASE}/reference/kaplan-sadock-10e.md", encoding="utf-8") as f:
        full_text = f.read()
    norm_full = normalize(full_text)

    print(f"pre-caching {doc.page_count} pages' normalized text (one-time cost)...", flush=True)
    page_texts = [normalize(doc[pno].get_text()) for pno in range(doc.page_count)]
    print("done caching, verifying citations...", flush=True)

    screenshots_dir = f"{BASE}/reference/screenshots_{output_prefix}"
    os.makedirs(screenshots_dir, exist_ok=True)

    results = []
    for i, q in enumerate(raw):
        qid = q["id"]
        out = {"id": qid, "section_num": q.get("section_num"), "rating": q.get("rating"), "citations": []}
        sec = sections.get(q.get("section_num"))

        for c in q.get("citations", []):
            quote = c.get("quote", "")
            entry = {"quote": quote, "supports": c.get("supports"), "note": c.get("note")}
            if not quote or normalize(quote) not in norm_full:
                entry["status"] = "QUOTE_NOT_FOUND"
                out["citations"].append(entry)
                continue

            target = normalize(quote)
            target80 = target[:80]
            pdf_page = None
            # pass 1: within the claimed section's own page range (check first, most likely hit)
            if sec:
                start = sec["pdf_page_start"] - 1
                end = min(sec["pdf_page_end"], doc.page_count)
                for pno in range(start, end):
                    if target in page_texts[pno] or target80 in page_texts[pno]:
                        pdf_page = pno + 1
                        break
            # pass 2: whole-book fallback (cheap now -- just scanning the cache)
            if not pdf_page:
                for pno, pt in enumerate(page_texts):
                    if target80 in pt:
                        pdf_page = pno + 1
                        break

            entry["pdf_page"] = pdf_page
            if pdf_page:
                pix = doc[pdf_page - 1].get_pixmap(dpi=150)
                fname = f"{qid}_{q.get('section_num')}_p{pdf_page}.png"
                pix.save(f"{screenshots_dir}/{fname}")
                entry["image_path"] = fname
                entry["status"] = "OK"
            else:
                entry["status"] = "PAGE_NOT_LOCATED"
            out["citations"].append(entry)

        results.append(out)
        if i % 100 == 0:
            print(f"...{i}/{len(raw)}", flush=True)

    with open(f"{BASE}/reference/{output_prefix}_verified.json", "w") as f:
        json.dump(results, f, indent=2)

    ok = sum(1 for r in results for c in r["citations"] if c.get("status") == "OK")
    total = sum(len(r["citations"]) for r in results)
    withok = sum(1 for r in results if any(c.get("status") == "OK" for c in r["citations"]))
    strong_ok = sum(1 for r in results if r["rating"] == "STRONG" and any(c.get("status") == "OK" for c in r["citations"]))
    n = len(results)
    print(f"\n{ok}/{total} citations verified+screenshotted")
    print(f"{withok}/{n} questions have >=1 verified citation ({withok/n*100:.0f}%)")
    print(f"{strong_ok}/{n} STRONG+verified ({strong_ok/n*100:.0f}%)")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: python3 verify_citations.py <input.json> <output_prefix>")
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
