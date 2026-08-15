#!/usr/bin/env python3
"""Parse multiple-choice questions from Kaufman 9e Q&A sections.

Reads reference/kaufman/page_texts.json + chapter_index.json.
Writes:
  reference/kaufman/questions_raw.json   full parse (including skipped)
  reference/kaufman/questions.json       practice-bank shape (upload to private R2; do not publish)
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC_PAGES = ROOT / "reference" / "kaufman" / "page_texts.json"
SRC_CH = ROOT / "reference" / "kaufman" / "chapter_index.json"
OUT_RAW = ROOT / "reference" / "kaufman" / "questions_raw.json"
OUT_Q = ROOT / "reference" / "kaufman" / "questions.json"
OUT_CLIENT = ROOT / "reference" / "kaufman" / "questions.json"  # gated via Worker; do not publish

HEADER_RE = re.compile(
    r"(?im)^(?:\s*(?:chapter\s+\d+|section\s+[ivx]+|additional review questions and answers"
    r"|classic anatomic neurology|major neurologic conditions).*$)"
)
PAGE_NUM_RE = re.compile(r"(?m)^\s*\d{1,3}\s*$")
QA_HEAD_RE = re.compile(r"questions\s+and\s+answers", re.I)
ANSWER_RE = re.compile(
    r"(?im)^\s*answer:\s*([a-h](?:\s*[,&]\s*[a-h]|\s+and\s+[a-h]|[–-][a-h])*(?:\s*\.)?)\s*(.*)$"
)
Q_START_RE = re.compile(r"(?m)^\s*(?:(\d{1,3})\s*[–-]\s*(\d{1,3})|(\d{1,3}))[.:]\s+(.*)$")
OPT_RE = re.compile(r"(?m)^\s*([a-h])\.\s+(.*)$")
WS = re.compile(r"\s+")


def clean(s: str) -> str:
    s = s.replace("\xa0", " ").replace("\u00ad", "")
    s = WS.sub(" ", s).strip()
    return s


def dehyphen(s: str) -> str:
    return re.sub(r"(\w)-\s+(\w)", r"\1\2", s)


def strip_running(text: str) -> str:
    lines = []
    for line in text.splitlines():
        if PAGE_NUM_RE.match(line):
            continue
        if HEADER_RE.match(line.strip()):
            continue
        if re.match(r"(?i)^questions\s+and\s+answers\s*$", line.strip()):
            continue
        # spaced-out heading: Q U E STI O N S A N D A N S W E RS
        if re.match(r"(?i)^(?:[A-Z]\s+){6,}[A-Z]\s*$", line.strip()):
            continue
        lines.append(line)
    return "\n".join(lines)


def chapter_for_page(chapters: list[dict], pdf_page: int) -> dict | None:
    for ch in chapters:
        if ch["pdf_page_start"] <= pdf_page <= ch["pdf_page_end"]:
            return ch
    return None


def is_qa_page(text: str) -> bool:
    low = text.lower()
    if "additional review questions" in low:
        return True
    # Elsevier sometimes letter-spaces the heading: "Q U E STI O N S A N D A N S W E RS"
    compact = re.sub(r"\s+", "", low)
    if "questionsandanswers" in compact:
        return True
    if QA_HEAD_RE.search(text):
        return True
    answers = len(re.findall(r"(?im)^\s*answer:", text))
    opts = len(re.findall(r"(?m)^\s*[a-h]\.\s", text))
    # End-of-chapter Q&A pages always have Answer: lines; options are often indented.
    return answers >= 2 or (answers >= 1 and opts >= 2)


def parse_answer_letters(blob: str) -> list[str]:
    blob = blob.lower().replace("and", ",").replace("&", ",")
    blob = blob.replace("-", ",")
    letters = re.findall(r"[a-h]", blob)
    out = []
    for L in letters:
        U = L.upper()
        if U not in out:
            out.append(U)
    return out


FIGURE_HINT = re.compile(
    r"\b(pictured|shown in this|this (?:mri|ct|scan|figure|image|sketch|drawing|photograph|section|tracing|eeg|dat)"
    r"|based on this|accompanying (?:figure|image|mri|ct)|see (?:fig|figure)\.?)",
    re.I,
)


def parse_blocks(joined: str) -> list[dict]:
    """Split a Q&A stream into question dicts."""
    # Normalize odd line breaks before option letters / Answer:
    joined = re.sub(r"(?m)(?<![a-z])\n(?=[a-h]\.\s)", "\n", joined)
    lines = joined.splitlines()
    items: list[dict] = []
    cur: dict | None = None

    def flush() -> None:
        nonlocal cur
        if cur:
            items.append(cur)
        cur = None

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        m_q = Q_START_RE.match(stripped)
        m_ans = ANSWER_RE.match(stripped)
        m_opt = OPT_RE.match(stripped)

        if m_q and (m_q.group(1) or (m_q.group(3) and not (cur and cur.get("options") and not cur.get("answer_raw")))):
            # New question. Range headings (1–7: Match...) start a group.
            flush()
            if m_q.group(1):
                cur = {
                    "q_from": int(m_q.group(1)),
                    "q_to": int(m_q.group(2)),
                    "kind": "match_group",
                    "stem": dehyphen(clean(m_q.group(4))),
                    "options": [],
                    "answer_raw": "",
                    "explanation": "",
                    "pdf_page": None,
                    "line_page": None,
                }
            else:
                rest = dehyphen(clean(m_q.group(4)))
                cur = {
                    "q_from": int(m_q.group(3)),
                    "q_to": int(m_q.group(3)),
                    "kind": "mcq",
                    "stem": rest,
                    "options": [],
                    "answer_raw": "",
                    "explanation": "",
                    "pdf_page": None,
                    "line_page": None,
                }
            i += 1
            continue

        if m_ans and cur is not None:
            cur["answer_raw"] = m_ans.group(1)
            expl = dehyphen(clean(m_ans.group(2)))
            cur["explanation"] = expl
            i += 1
            # consume explanation lines until next question / option-only block
            while i < len(lines):
                nxt = lines[i].strip()
                if Q_START_RE.match(nxt) and not nxt.lower().startswith("answer"):
                    break
                if ANSWER_RE.match(nxt):
                    break
                # a lone new option list after a finished answer is a new Q's options
                # (don't treat mid-explanation "a. foo" as a new question)
                if OPT_RE.match(nxt) and Q_START_RE.match(nxt):
                    break
                if nxt.startswith("@@P"):
                    i += 1
                    continue
                if nxt:
                    cur["explanation"] = dehyphen(clean(cur["explanation"] + " " + nxt))
                i += 1
            continue

        if m_opt and cur is not None and not cur.get("answer_raw"):
            letter = m_opt.group(1).upper()
            text = dehyphen(clean(m_opt.group(2)))
            # merge wrapped option lines
            i += 1
            while i < len(lines):
                nxt = lines[i].strip()
                if not nxt or nxt.startswith("@@P"):
                    i += 1
                    if nxt.startswith("@@P"):
                        continue
                    break
                if OPT_RE.match(nxt) or ANSWER_RE.match(nxt) or Q_START_RE.match(nxt):
                    break
                text = dehyphen(clean(text + " " + nxt))
                i += 1
            cur["options"].append({"letter": letter, "text": text})
            continue

        if stripped.startswith("@@P") and cur is not None and cur.get("pdf_page") is None:
            try:
                cur["pdf_page"] = int(stripped[3:])
            except ValueError:
                pass

        if cur is not None and stripped and not stripped.startswith("@@P") and not cur.get("answer_raw"):
            # continuation of stem (before options)
            if not cur["options"]:
                cur["stem"] = dehyphen(clean(cur["stem"] + " " + stripped))
        i += 1
    flush()
    return items


def to_bank_item(item: dict, idx: int, ch: dict | None) -> dict | None:
    opts = [o for o in item.get("options") or [] if o.get("letter")]
    letters = parse_answer_letters(item.get("answer_raw") or "")
    stem = clean(item.get("stem") or "").replace("\x07", "")
    if item.get("kind") == "match_group":
        return None
    if len(stem) < 20:
        return None
    if len(opts) < 2:
        return None
    # drop options that are empty figure labels with no text AND no siblings with text
    nonempty = [o for o in opts if o.get("text")]
    nonempty = [
        {**o, "text": o["text"].replace("\x07", "")}
        for o in nonempty
        if "answers:" not in o["text"].lower()
    ]
    # unique letters only — duplicates mean two questions got glued together
    seen = set()
    uniq = []
    for o in nonempty:
        if o["letter"] in seen:
            return None
        seen.add(o["letter"])
        uniq.append(o)
    nonempty = uniq
    if len(nonempty) < 2 or len(nonempty) > 8:
        return None
    expl_preview = clean(item.get("explanation") or "")
    if re.search(r"answers:\s*\d", expl_preview, re.I):
        return None
    if not letters:
        return None
    valid = {o["letter"] for o in nonempty}
    letters = [L for L in letters if L in valid]
    if not letters:
        return None
    expl = clean(item.get("explanation") or "")
    ch_title = (ch or {}).get("title") or "Kaufman"
    ch_num = (ch or {}).get("num")
    ch_label = (
        f"Chapter {ch_num}: {ch_title}" if isinstance(ch_num, int)
        else ch_title
    )
    year = "Review" if ch_num == "R" else f"Ch {ch_num}"
    needs_fig = bool(FIGURE_HINT.search(stem))
    book_n = item["q_from"]
    return {
        "deck": "Kaufman 9e",
        "year": year,
        "q_index": book_n,
        "slide_number": item.get("pdf_page") or 0,
        "book_number": book_n,
        "stem": stem,
        "options": [{"letter": o["letter"], "text": o["text"]} for o in nonempty],
        "answer_letter": letters[0] if len(letters) == 1 else None,
        "answer_letters": letters,
        "multi_select": len(letters) > 1,
        "answer_text": " / ".join(
            next((o["text"] for o in nonempty if o["letter"] == L), L) for L in letters
        ),
        "answer_source": "kaufman",
        "answer_raw": "".join(letters),
        "explanation_text": (
            f"**Answer: {', '.join(letters)} — {(' / '.join(next((o['text'] for o in nonempty if o['letter'] == L), L) for L in letters))}.** "
            + expl
        ).strip(),
        "figure_images": [],
        "explanation_images": [],
        "flags": ["kaufman", *([ "needs_figure"] if needs_fig else [])],
        "prite_category": "neurology",
        "prite_label": ch_label,
        "tags": {
            "diagnosis": [],
            "medication": [],
            "psychotherapy": [],
            "neuro": [ch_title] if ch_title else [],
            "historical": [],
            "setting": None,
            "topics": [ch_label, "Kaufman"],
        },
        "clinical_application": "",
        "video_query": "",
        "kaufman": {
            "chapter_num": ch_num,
            "chapter": ch_title,
            "pdf_page": item.get("pdf_page"),
            "book_number": book_n,
            "needs_figure": needs_fig,
        },
    }


def main() -> int:
    pages = json.loads(SRC_PAGES.read_text())["pages"]
    chapters = json.loads(SRC_CH.read_text())["chapters"]

    qa_flags = [is_qa_page(p["text"]) for p in pages]
    # grow one page backward so a stem that starts on the previous page is kept
    for i in range(1, len(qa_flags)):
        if qa_flags[i] and not qa_flags[i - 1]:
            # only if that previous page looks like questions
            t = pages[i - 1]["text"]
            if re.search(r"(?m)^\d{1,3}\.\s", t) or QA_HEAD_RE.search(t):
                qa_flags[i - 1] = True

    # group consecutive Q&A pages
    groups: list[list[int]] = []
    run: list[int] = []
    for i, flag in enumerate(qa_flags):
        if flag:
            run.append(i)
        elif run:
            groups.append(run)
            run = []
    if run:
        groups.append(run)

    parsed: list[dict] = []
    for run in groups:
        parts = []
        for i in run:
            parts.append(f"@@P{pages[i]['pdf_page']}")
            parts.append(strip_running(pages[i]["text"]))
        joined = "\n".join(parts)
        items = parse_blocks(joined)
        # assign pdf page: last @@P seen before each item's stem
        last_p = pages[run[0]]["pdf_page"]
        # re-walk to stamp pages more accurately using stem snippets
        page_by_snip: list[tuple[int, str]] = []
        for i in run:
            page_by_snip.append((pages[i]["pdf_page"], clean(pages[i]["text"])[:]))
        for it in items:
            stem_key = it["stem"][:60]
            found = None
            for pno, txt in page_by_snip:
                if stem_key and stem_key[:40] in clean(txt):
                    found = pno
                    break
            it["pdf_page"] = found or it.get("pdf_page") or last_p
            parsed.append(it)

    bank = []
    skipped = 0
    used_ids: set[str] = set()
    for it in parsed:
        ch = chapter_for_page(chapters, it.get("pdf_page") or 0)
        item = to_bank_item(it, len(bank) + 1, ch)
        if not item:
            skipped += 1
            continue
        key = f"{item['year']}-{item['q_index']}"
        if key in used_ids:
            item["q_index"] = item["q_index"] * 1000 + (len(bank) % 1000)
            key = f"{item['year']}-{item['q_index']}"
        used_ids.add(key)
        bank.append(item)

    OUT_RAW.write_text(json.dumps({"parsed": parsed, "groups": [[pages[i]["pdf_page"] for i in r] for r in groups]}, ensure_ascii=False))
    OUT_Q.parent.mkdir(parents=True, exist_ok=True)
    OUT_Q.write_text(json.dumps(bank, ensure_ascii=False, indent=2) + "\n")

    by_ch: dict[str, int] = {}
    for q in bank:
        key = str(q["kaufman"]["chapter_num"])
        by_ch[key] = by_ch.get(key, 0) + 1
    print(f"qa_page_groups={len(groups)} parsed={len(parsed)} bank={len(bank)} skipped={skipped}")
    print("by_chapter", json.dumps(by_ch, sort_keys=True))
    fig = sum(1 for q in bank if q["kaufman"]["needs_figure"])
    print(f"needs_figure={fig}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
