#!/usr/bin/env python3
"""Reflow OCR'd explanation_text: join soft wraps, fix hyphenation, spacing.

Usage (from repo root):
  python3 extraction/clean_ocr_explanations.py
"""
from __future__ import annotations
import json, re
from pathlib import Path

BANK = Path(__file__).resolve().parent / "output" / "questions_all.json"
PREOCR_GLOB = "questions_all.json.bak-preocr-*"


def is_list_start(s: str) -> bool:
    return bool(re.match(r"^(?:[•●○▪◦\-\*–—]\s|\d{1,2}[\.\)]\s|[A-Ea-e][\.\)]\s)", s))


def is_section_label(s: str) -> bool:
    if re.match(
        r"^(Explanation|Rationale|Answer|Why not|Key concepts|Key points|"
        r"Other Options|The correct answer|Memory hook|Clinical pearl|"
        r"Causes|Clinical Features)\s*:?\s*$",
        s,
        re.I,
    ):
        return True
    if (
        re.match(
            r"^(Explanation|Rationale|Answer|Why not|Key concepts|Key points|"
            r"Other Options|The correct answer)\b",
            s,
            re.I,
        )
        and len(s) <= 50
    ):
        return True
    if s.endswith(":") and len(s) <= 50 and "." not in s[:-1] and s.count(" ") <= 6:
        return True
    return False


def ends_sentence(s: str) -> bool:
    return bool(re.search(r'[.!?]"?$', s.rstrip("\"')]} ")))


def reflow(text: str) -> str:
    if not text or not text.strip():
        return text
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"([A-Za-z])-\s*\n\s*([a-z])", r"\1\2", text)
    out: list[str] = []
    for raw in text.split("\n"):
        s = raw.strip()
        if not s:
            if out and out[-1] != "":
                out.append("")
            continue
        if out and out[-1] != "":
            prev = out[-1]
            join = False
            if is_list_start(s):
                join = False
            elif is_section_label(prev) and len(prev) <= 50:
                join = False
            elif re.match(r"^[a-z(]", s):
                join = True
            elif prev.endswith(("-", ",", ";")):
                join = True
            elif (
                not ends_sentence(prev)
                and not is_section_label(prev)
                and len(prev) >= 40
                and re.match(r"^[A-Z]", s)
                and not is_list_start(s)
                and not is_section_label(s)
            ):
                join = True
            if join:
                if prev.endswith("-") and s[0].islower():
                    out[-1] = prev[:-1] + s
                else:
                    out[-1] = prev + " " + s
                continue
        out.append(s)
    cleaned: list[str] = []
    blank = 0
    for ln in out:
        if ln == "":
            blank += 1
            if blank <= 1:
                cleaned.append("")
        else:
            blank = 0
            cleaned.append(ln)
    text = "\n".join(cleaned).strip()
    text = re.sub(r" {2,}", " ", text)
    text = re.sub(r" +([,.;:!?])", r"\1", text)
    text = re.sub(r"(?<=[a-z)])\.([A-Z])", r". \1", text)
    text = re.sub(r"\bU\. S\.", "U.S.", text)
    text = re.sub(r"\be\. g\.", "e.g.", text)
    text = re.sub(r"\bi\. e\.", "i.e.", text)
    text = re.sub(r"^([•●])(\S)", r"\1 \2", text, flags=re.M)
    return text.strip()


def soft_count(t: str) -> int:
    return len(re.findall(r"[a-zA-Z,;]\n[a-z]", t or ""))


def main() -> None:
    qs = json.loads(BANK.read_text())
    pre = sorted(BANK.parent.glob(PREOCR_GLOB))
    bak_text = {}
    if pre:
        bak = json.loads(pre[-1].read_text())
        bak_text = {(str(q["year"]), q["q_index"]): (q.get("explanation_text") or "") for q in bak}

    changed = 0
    for q in qs:
        key = (str(q["year"]), q["q_index"])
        cur = q.get("explanation_text") or ""
        old = bak_text.get(key, "")
        if len(cur) < 20:
            continue
        if not (len(old.strip()) < 100 or soft_count(cur) or re.search(r"[A-Za-z]-\n[a-z]", cur)):
            continue
        after = cur
        for _ in range(6):
            nxt = reflow(after)
            if nxt == after:
                break
            after = nxt
        if after != cur:
            q["explanation_text"] = after
            changed += 1

    BANK.write_text(json.dumps(qs, indent=2, ensure_ascii=False))
    left = sum(soft_count(q.get("explanation_text") or "") for q in qs)
    print(f"cleaned {changed}; remaining soft-wrap markers: {left}")
    print(f"wrote {BANK}")


if __name__ == "__main__":
    main()
