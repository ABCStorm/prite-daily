#!/usr/bin/env python3
"""Extract Kaufman 9e page texts, chapter index, and BM25 chunks.

Source PDF: reference/kaufman/kaufman-9e.pdf
(Kaufman's Clinical Neurology for Psychiatrists, 9th ed., 2023)

Printed page N is PDF page N+14 for the body (verified on several chapters).
Do not treat PDF indexes as printed-page citations in the UI; show chapter titles.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / "reference" / "kaufman" / "kaufman-9e.pdf"
OUT_DIR = ROOT / "reference" / "kaufman"

# printed_page -> pdf_page is +14 for the body (ch.1 p.2 is PDF 16).
PRINT_OFFSET = 14

# TOC printed pages (from the book's Contents).
CHAPTERS = [
    {"num": 1, "title": "First Encounter With a Patient: Examination and Formulation", "print": 2},
    {"num": 2, "title": "Signs of Central Nervous System Disorders", "print": 6},
    {"num": 3, "title": "Psychogenic Neurologic Deficits", "print": 18},
    {"num": 4, "title": "Cranial Nerve Impairments", "print": 25},
    {"num": 5, "title": "Peripheral Nerve Disorders", "print": 57},
    {"num": 6, "title": "Muscle Disorders", "print": 84},
    {"num": 7, "title": "Dementia", "print": 111},
    {"num": 8, "title": "Aphasia and Anosognosia", "print": 159},
    {"num": 9, "title": "Headaches", "print": 184},
    {"num": 10, "title": "Epilepsy", "print": 205},
    {"num": 11, "title": "Transient Ischemic Attacks and Stroke", "print": 248},
    {"num": 12, "title": "Visual Disturbances", "print": 271},
    {"num": 13, "title": "Congenital Cerebral Impairments", "print": 295},
    {"num": 14, "title": "Neurologic Aspects of Chronic Pain", "print": 325},
    {"num": 15, "title": "Multiple Sclerosis", "print": 344},
    {"num": 16, "title": "Neurologic Aspects of Sexual Function", "print": 365},
    {"num": 17, "title": "Sleep Disorders", "print": 379},
    {"num": 18, "title": "Involuntary Movement Disorders", "print": 412},
    {"num": 19, "title": "Brain Tumors, Metastatic Cancer, and Paraneoplastic Syndromes", "print": 474},
    {"num": 20, "title": "Lumbar Puncture and Imaging Studies", "print": 498},
    {"num": 21, "title": "Neurotransmitters and Drug Abuse", "print": 522},
    {"num": 22, "title": "Traumatic Brain Injury", "print": 552},
    {"num": "A1", "title": "Appendix 1: Patient and Family Support Groups", "print": 570},
    {"num": "A2", "title": "Appendix 2: Costs of Various Tests", "print": 572},
    {"num": "A3", "title": "Appendix 3: Diseases Transmitted by Chromosome or Mitochondria Abnormalities", "print": 573},
    {"num": "A4", "title": "Appendix 4: Chemical and Biological Neurotoxins", "print": 575},
    {"num": "R", "title": "Additional Review Questions and Answers", "print": 576},
    {"num": "I", "title": "Index", "print": 687},
]


def clean(s: str) -> str:
    s = s.replace("\xa0", " ").replace("\u00ad", "")
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()


ANSWER_LINE = re.compile(r"(?im)^\s*answer:")
QA_HEAD = re.compile(r"questions\s+and\s+answers", re.I)
DIVIDER = re.compile(
    r"(?is)^(this page intentionally left blank|section\s+[ivx]+|major neurologic conditions)\s*$"
)


def is_divider_page(text: str) -> bool:
    t = clean(text)
    if len(t) < 80:
        return True
    return bool(DIVIDER.match(t))


def is_qa_page(text: str) -> bool:
    """True for chapter-end question pages, not teaching text that mentions 'questions'."""
    if QA_HEAD.search(text):
        compact = re.sub(r"\s+", "", text.lower())
        # letter-spaced heading or a real "Questions and Answers" block
        if "questionsandanswers" in compact:
            return True
    return len(ANSWER_LINE.findall(text)) >= 1


def detect_qa_start(pages: list[dict], start: int, end: int, hint: int | None) -> int | None:
    """First PDF page of the chapter's Q&A tail, or None if the chapter has none.

    Walk backwards from the chapter end so a stray 'questions' mention in the
    opening pages cannot steal the whole chapter. A hint (min extracted-question
    page) wins when it sits in the last half of the chapter.
    """
    trailing = None
    for p in range(end, start - 1, -1):
        raw = pages[p - 1]["text"]
        if is_divider_page(raw):
            continue
        if is_qa_page(raw):
            trailing = p
            continue
        break
    if hint and start < hint <= end:
        # prefer the extracted-question hint when it agrees with the tail
        if trailing is None or abs(hint - trailing) <= 3 or hint <= trailing:
            return hint
    return trailing


def extract_outline(text: str) -> list[dict]:
    """Parse the chapter OUTLINE block into heading + printed page."""
    m = re.search(r"\bOUTLINE\b\s*(.+?)(?:\n\n|\n[A-Z])", text, re.S)
    if not m:
        # looser: from OUTLINE to first long paragraph
        m = re.search(r"\bOUTLINE\b\s*(.+)", text, re.S)
        if not m:
            return []
    block = m.group(1)
    items = []
    for line in block.splitlines():
        line = clean(line)
        mm = re.match(r"^(.+?)\s+(\d{1,3})$", line)
        if not mm:
            continue
        title = clean(mm.group(1))
        if len(title) < 3 or title.upper() == "OUTLINE":
            continue
        if title.lower() in {"contents", "index"}:
            continue
        items.append({"title": title, "print": int(mm.group(2))})
        if len(items) > 40:
            break
    return items


def main() -> int:
    if not PDF.exists():
        raise SystemExit(f"missing {PDF}")
    doc = fitz.open(PDF)
    n = doc.page_count
    pages = []
    for i in range(n):
        raw = doc[i].get_text() or ""
        pages.append({"pdf_page": i + 1, "text": raw, "chars": len(raw)})
    doc.close()

    # Hints from already-extracted chapter Q&As: first question page per chapter.
    qa_hint: dict[object, int] = {}
    qpath = OUT_DIR / "questions.json"
    if qpath.exists():
        for item in json.loads(qpath.read_text()):
            k = item.get("kaufman") or {}
            p = k.get("pdf_page")
            num = k.get("chapter_num")
            if not p or num in {None, "R", "I"}:
                continue
            prev = qa_hint.get(num)
            if prev is None or int(p) < prev:
                qa_hint[num] = int(p)

    # chapter spans
    chapters = []
    for i, ch in enumerate(CHAPTERS):
        start = int(ch["print"]) + PRINT_OFFSET
        if i + 1 < len(CHAPTERS):
            end = int(CHAPTERS[i + 1]["print"]) + PRINT_OFFSET - 1
        else:
            end = n
        start = max(1, min(start, n))
        end = max(start, min(end, n))
        qa_start = None
        if isinstance(ch["num"], int):
            qa_start = detect_qa_start(pages, start, end, qa_hint.get(ch["num"]))
        elif ch["num"] == "R":
            qa_start = start
        text_end = (qa_start - 1) if qa_start else end
        text_end = max(start, min(text_end, end))
        outline = extract_outline(pages[start - 1]["text"]) if start <= n else []
        sections = []
        for j, item in enumerate(outline):
            s_pdf = int(item["print"]) + PRINT_OFFSET
            if j + 1 < len(outline):
                e_pdf = int(outline[j + 1]["print"]) + PRINT_OFFSET - 1
            else:
                e_pdf = text_end
            s_pdf = max(start, min(s_pdf, text_end))
            e_pdf = max(s_pdf, min(e_pdf, text_end))
            sections.append({
                "title": item["title"],
                "print": item["print"],
                "pdf_page_start": s_pdf,
                "pdf_page_end": e_pdf,
            })
        chapters.append({
            "num": ch["num"],
            "title": ch["title"],
            "print_start": ch["print"],
            "pdf_page_start": start,
            "pdf_page_end": end,
            "text_page_end": text_end,
            "qa_page_start": qa_start,
            "sections": sections,
        })

    # paragraph-ish chunks for BM25 — teaching text only, never Q&A / review / index
    chunks = []
    for ch in chapters:
        if ch["num"] in {"I", "R"}:
            continue
        if str(ch["num"]).startswith("A"):
            continue
        text_end = int(ch["text_page_end"])
        buf: list[str] = []
        buf_start = ch["pdf_page_start"]
        buf_len = 0

        def flush(end_page: int) -> None:
            nonlocal buf, buf_start, buf_len
            text = clean(" ".join(buf))
            text = re.sub(r"\s+", " ", text)
            if len(text) >= 180:
                chunks.append({
                    "chapter_num": ch["num"],
                    "chapter": ch["title"],
                    "pdf_page_start": buf_start,
                    "pdf_page_end": end_page,
                    "text": text[:4000],
                })
            buf = []
            buf_len = 0

        for p in range(ch["pdf_page_start"], text_end + 1):
            raw = pages[p - 1]["text"]
            if is_qa_page(raw) or is_divider_page(raw):
                if buf:
                    flush(p - 1)
                    buf_start = p + 1
                continue
            paras = [clean(x) for x in re.split(r"\n\s*\n", raw) if clean(x)]
            for para in paras:
                if len(para) < 40:
                    continue
                if re.fullmatch(r"\d+", para):
                    continue
                if not buf:
                    buf_start = p
                buf.append(para)
                buf_len += len(para)
                if buf_len >= 900:
                    flush(p)
                    buf_start = p
        if buf:
            flush(text_end)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "page_texts.json").write_text(
        json.dumps({"page_count": n, "print_offset": PRINT_OFFSET, "pages": pages}, ensure_ascii=False)
    )
    (OUT_DIR / "chapter_index.json").write_text(
        json.dumps({"print_offset": PRINT_OFFSET, "chapters": chapters}, indent=2, ensure_ascii=False) + "\n"
    )
    (OUT_DIR / "book_chunks.json").write_text(
        json.dumps(chunks, ensure_ascii=False)
    )
    print(f"pages={n} chapters={len(chapters)} chunks={len(chunks)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
