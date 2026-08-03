"""
One-time (already done — book_chunks.json exists) step: chunk the whole
Kaplan & Sadock markdown into paragraph-merged passages (~200 words each),
tagging each chunk with its containing section (from section_index_full.json)
for PDF page lookup. This is what build_candidates.py's BM25 index is built over.

Run only if reference/book_chunks.json is missing or the source markdown changed.
Output: reference/book_chunks.json (~18,500 chunks).
"""
import json

BASE = "/Users/andrewcorrell/Claude/Projects/PRITE question practice website"

with open(f"{BASE}/reference/kaplan-sadock-10e.md", encoding="utf-8") as f:
    lines = f.readlines()

with open(f"{BASE}/reference/section_index_full.json") as f:
    SECTIONS = json.load(f)


def find_section_for_line(lineno):
    for s in SECTIONS:
        end = s["md_line_end"] if s["md_line_end"] is not None else len(lines)
        if s["md_line_start"] <= lineno <= end:
            return s
    return None


chunks = []
buf, buf_start, buf_words = [], None, 0
TARGET = 200
for i, line in enumerate(lines):
    stripped = line.strip()
    if not stripped:
        if buf and buf_words >= TARGET:
            chunks.append({"start": buf_start, "end": i - 1, "text": " ".join(buf)})
            buf, buf_start, buf_words = [], None, 0
        continue
    if buf_start is None:
        buf_start = i
    buf.append(stripped)
    buf_words += len(stripped.split())
if buf:
    chunks.append({"start": buf_start, "end": len(lines) - 1, "text": " ".join(buf)})

for c in chunks:
    sec = find_section_for_line(c["start"])
    c["section_num"] = sec["num"] if sec else None
    c["section_title"] = sec["title"] if sec else None
    c["pdf_page_start"] = sec["pdf_page_start"] if sec else None
    c["pdf_page_end"] = sec["pdf_page_end"] if sec else None

no_section = sum(1 for c in chunks if c["section_num"] is None)
print(f"{len(chunks)} chunks from {len(lines)} lines")
print(f"{no_section}/{len(chunks)} chunks fall outside the 283 indexed sections (known gap chapters — see SKILL.md)")

with open(f"{BASE}/reference/book_chunks.json", "w") as f:
    json.dump(chunks, f)
print("saved book_chunks.json")
