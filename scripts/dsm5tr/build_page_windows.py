#!/usr/bin/env python3
"""
Build readable page windows for each DSM-5-TR match.

Window = FULL section [pdf_page_start, pdf_page_end] (not a fixed ±radius).
Open-on page skips near-blank lead-in pages (section title / folio-only pages).

Writes:
  reference/dsm5tr/page_windows.json
  reference/dsm5tr/pages_to_render.txt
"""
from __future__ import annotations

import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / "reference" / "dsm5tr" / "DSM-5-TR.pdf"
MATCHES = ROOT / "reference" / "dsm5tr" / "matches.json"
OUT_WINDOWS = ROOT / "reference" / "dsm5tr" / "page_windows.json"
OUT_PAGES = ROOT / "reference" / "dsm5tr" / "pages_to_render.txt"

# Pages with this little extracted text are treated as blank / folio-only lead-ins.
BLANK_CHAR_THRESHOLD = 80
# Cap extremely long sections so a single match doesn't load 150 pages of
# Substance-Related chapter. Still much larger than the old ±4.
MAX_SECTION_PAGES = 80
# Many DSM sections end mid-page while the next disorder starts halfway down;
# the last criteria/text often bleeds onto that following page. Include one
# extra page past section_end so the pager doesn't cut those paragraphs off.
TAIL_BLEED_PAGES = 1
WORKERS = 12


def page_text_len(args: tuple[str, int]) -> tuple[int, int]:
    pdf_path, page1 = args
    doc = fitz.open(pdf_path)
    try:
        t = doc[page1 - 1].get_text().strip()
        # strip bare page numbers
        t2 = re.sub(r"^\d{1,4}$", "", t).strip()
        return page1, len(t2)
    finally:
        doc.close()


def first_content_page(start: int, end: int, lens: dict[int, int]) -> int:
    """First page in [start, end] that has enough text; else start."""
    for p in range(start, end + 1):
        if lens.get(p, 0) >= BLANK_CHAR_THRESHOLD:
            return p
    return start


def main() -> int:
    data = json.loads(MATCHES.read_text())
    matches = data.get("matches") or {}

    # Collect all section spans we might open
    needed_pages: set[int] = set()
    spans: list[tuple[str, int, int]] = []
    for id_, m in matches.items():
        start = int(m.get("pdf_page_start") or 0)
        end = int(m.get("pdf_page_end") or start)
        if start <= 0:
            continue
        if end < start:
            end = start
        # Cap very long sections from the start
        if end - start + 1 > MAX_SECTION_PAGES:
            end = start + MAX_SECTION_PAGES - 1
        spans.append((id_, start, end))
        for p in range(start, min(start + 12, end + 1)):  # only need lens near start for blank skip
            needed_pages.add(p)

    # Parallel text-length scan for candidate open pages
    print(f"scanning {len(needed_pages)} pages for blank lead-ins…", file=sys.stderr)
    pdf_path = str(PDF.resolve())
    lens: dict[int, int] = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futs = [pool.submit(page_text_len, (pdf_path, p)) for p in sorted(needed_pages)]
        for f in as_completed(futs):
            p, n = f.result()
            lens[p] = n

    windows: dict[str, dict] = {}
    pages: set[int] = set()
    blank_skips = 0

    # PDF page count so bleed never walks past the last page.
    doc = fitz.open(str(PDF.resolve()))
    try:
        pdf_last = doc.page_count
    finally:
        doc.close()

    for id_, start, end in spans:
        m = matches[id_]
        lo = start
        section_end = int(m.get("pdf_page_end") or end)
        # Window high-water: capped section end + bleed for mid-page handoffs
        # (last paragraphs often continue onto the page where the next disorder starts).
        hi = min(end + TAIL_BLEED_PAGES, pdf_last)
        anchor = first_content_page(start, end, lens)
        if anchor > start:
            blank_skips += 1
            # Don't force users to page through blank lead-ins; open window at content
            lo = anchor

        windows[id_] = {
            "section_title": m["section_title"],
            "section_kind": m.get("section_kind"),
            "chapter_title": m.get("chapter_title"),
            "book": m.get("book") or "DSM-5-TR (APA, 2022)",
            "why": m.get("why") or "",
            "page": anchor,  # open-on first real content page
            "lo": lo,
            "hi": hi,
            "section_start": start,
            "section_end": section_end,
            "atStart": True,
            # atEnd means "you've reached the end of our readable window"
            # (including bleed), not "strict section boundary only".
            "atEnd": True,
            "capped": (section_end - int(m.get("pdf_page_start") or start) + 1)
            > MAX_SECTION_PAGES,
            "tail_bleed": TAIL_BLEED_PAGES,
        }
        for p in range(lo, hi + 1):
            pages.add(p)

    OUT_WINDOWS.write_text(
        json.dumps(
            {
                "max_section_pages": MAX_SECTION_PAGES,
                "blank_char_threshold": BLANK_CHAR_THRESHOLD,
                "blank_skips": blank_skips,
                "count": len(windows),
                "windows": windows,
            },
            indent=2,
        )
        + "\n"
    )
    OUT_PAGES.write_text("\n".join(str(p) for p in sorted(pages)) + "\n")
    sizes = [v["hi"] - v["lo"] + 1 for v in windows.values()]
    print(
        f"windows={len(windows)} unique_pages={len(pages)} "
        f"blank_skips={blank_skips} median_window={sorted(sizes)[len(sizes)//2]} "
        f"max_window={max(sizes)} -> {OUT_WINDOWS.name}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
