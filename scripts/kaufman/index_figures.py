#!/usr/bin/env python3
"""Index Kaufman 9e figures, crop them, and attach them to practice questions.

- Teaching figures: caption lines like "Fig. 18.1 …"
- Q&A figures: "see Fig. 13QA.70" or a large image on the question page
- Crops go to reference/kaufman/fig_crops/ as kf-fig-*.png
- questions.json is updated with stem_figures / expl_figures

Does NOT upload; run render_and_upload.py --figures after this.
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / "reference" / "kaufman" / "kaufman-9e.pdf"
PAGES = ROOT / "reference" / "kaufman" / "page_texts.json"
QFILE = ROOT / "reference" / "kaufman" / "questions.json"
OUT_INDEX = ROOT / "reference" / "kaufman" / "figure_index.json"
CROP_DIR = ROOT / "reference" / "kaufman" / "fig_crops"

CAP_LINE = re.compile(
    r"^\s*(?:Fig(?:ure)?|FIG(?:URE)?)\.?\s*"
    r"(?:(\d+)\s*QA\.?\s*(\d+)|(\d+)\.(\d+))\b",
    re.I,
)
CITE = re.compile(
    r"Fig(?:ure)?\.?\s*(?:(\d+)\s*QA\.?\s*(\d+)|(\d+)\.(\d+))",
    re.I,
)
SEE_FIG = re.compile(
    r"\b(?:see (?:the )?(?:figure|fig\.?)|pictured(?: below| above)?|"
    r"shown in this|this (?:mri|ct|scan|figure|image|sketch|eeg|dat)|"
    r"based on this (?:mri|ct|scan|figure)|accompanying (?:figure|mri|ct)|"
    r"myelin-?stained section)\b",
    re.I,
)
NEXT_PAGE = re.compile(r"next page|following page", re.I)

DPI = 150
PAD = 8  # points around the art


def fig_id(m: re.Match) -> str:
    if m.group(1):
        return f"{m.group(1)}QA.{m.group(2)}"
    return f"{m.group(3)}.{m.group(4)}"


def safe_name(fid: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", fid).strip("-")
    return f"kf-fig-{slug}.png"


def col_bounds(rect: fitz.Rect, page_w: float) -> tuple[float, float]:
    mid = page_w / 2
    if rect.x1 < mid + 20:
        return 48.0, mid - 6
    if rect.x0 > mid - 20:
        return mid + 6, page_w - 48.0
    return 48.0, page_w - 48.0


def large_images(page: fitz.Page) -> list[fitz.Rect]:
    out = []
    try:
        infos = page.get_image_info(xrefs=True)
    except Exception:
        infos = []
    for inf in infos:
        bbox = inf.get("bbox")
        if not bbox:
            continue
        r = fitz.Rect(bbox)
        if r.width >= 70 and r.height >= 70:
            out.append(r)
    return out


def drawing_union(page: fitz.Page, band: fitz.Rect) -> fitz.Rect | None:
    acc = None
    for d in page.get_drawings():
        r = d.get("rect")
        if not r:
            continue
        rr = fitz.Rect(r)
        if rr.width < 8 or rr.height < 8:
            continue
        if rr.width > page.rect.width * 0.95:  # header rules
            continue
        if rr.y0 < 45:  # running header
            continue
        inter = rr & band
        if inter.is_empty or inter.get_area() < 40:
            continue
        acc = rr if acc is None else (acc | rr)
    return acc


def figure_label_union(page: fitz.Page, band: fitz.Rect) -> fitz.Rect | None:
    """Short labels sitting on the artwork (A/B, nerve names) — not body paragraphs."""
    acc = None
    d = page.get_text("dict")
    for b in d["blocks"]:
        if b.get("type") != 0:
            continue
        r = fitz.Rect(b["bbox"])
        if (r & band).is_empty:
            continue
        t = "".join(s["text"] for l in b.get("lines", []) for s in l.get("spans", [])).strip()
        if not t or len(t) > 48:
            continue
        if CAP_LINE.match(t.replace("\u2002", " ")):
            continue
        acc = r if acc is None else (acc | r)
    return acc


def crop_for_caption(page: fitz.Page, cap: fitz.Rect, ceiling: float | None = None) -> fitz.Rect:
    """Tight box around the artwork above a caption, plus the full caption.

    Multi-panel figures (A/B) are full-width; a sliver search_for('Fig. 4.11')
    must not collapse them into the left column.

    `ceiling` is the bottom of the previous caption on this page so a stacked
    pair (15.7/15.8, 16.2/16.3, 20.4/20.5) does not swallow the figure above.
    """
    pw, ph = page.rect.width, page.rect.height
    wide = cap.width > 320
    if wide:
        x0, x1 = 48.0, pw - 48.0
    else:
        x0, x1 = col_bounds(cap, pw)
    top = 48.0 if ceiling is None else max(48.0, ceiling + 8)
    # Never reach more than ~360pt above the caption either.
    top = max(top, cap.y0 - 360)
    band = fitz.Rect(x0, top, x1, cap.y0 + 6)

    art = None
    for r in large_images(page):
        if (r & band).is_empty:
            continue
        art = r if art is None else (art | r)
    drawn = drawing_union(page, band)
    if drawn:
        art = drawn if art is None else (art | drawn)
    labels = figure_label_union(page, band)
    if labels:
        art = labels if art is None else (art | labels)

    if art is None:
        box = fitz.Rect(x0, max(48, cap.y0 - 220), x1, cap.y1)
    else:
        # If the art spans most of the page, keep the full caption width.
        if art.width > 260:
            box = fitz.Rect(min(art.x0, cap.x0, 48), art.y0, max(art.x1, cap.x1, pw - 48), cap.y1)
        else:
            box = art | cap
    box.x0 = max(36, box.x0 - PAD)
    box.y0 = max(44, box.y0 - PAD)
    box.x1 = min(pw - 16, box.x1 + PAD)
    box.y1 = min(ph - 16, max(box.y1, cap.y1) + 4)
    if box.height < 60:
        box.y0 = max(44, box.y1 - 160)
    return box


def crop_largest_image(page: fitz.Page) -> fitz.Rect | None:
    imgs = large_images(page)
    if not imgs:
        return None
    return max(imgs, key=lambda r: r.get_area())


def crop_near_marker(page: fitz.Page, marker: str) -> fitz.Rect | None:
    """Pick the image closest to a question-number / 'see Fig' marker."""
    hits = page.search_for(marker[:28]) if marker else []
    imgs = large_images(page)
    if not imgs:
        return None
    if not hits:
        return max(imgs, key=lambda r: r.get_area())
    anchor = fitz.Rect(hits[0])

    def score(r: fitz.Rect) -> float:
        dy = abs(((r.y0 + r.y1) / 2) - anchor.y0)
        dx = abs(((r.x0 + r.x1) / 2) - ((anchor.x0 + anchor.x1) / 2))
        return dy + 0.35 * dx

    best = min(imgs, key=score)
    # If the only nearby bitmap is far from the citation, treat as a miss so
    # the caller can look on the next/previous page (Q&A figures often sit
    # under the following item).
    if score(best) > 220:
        return None
    return best


def crop_below_marker(page: fitz.Page, marker: str) -> fitz.Rect | None:
    """Artwork sitting under a 'see figure below' stem — not the figure beside it.

    Two-column Q&A pages often put the previous item's art in the other
    column. Split candidates by a vertical gap and take the lowest cluster.
    """
    hits = page.search_for(marker[:28]) if marker else []
    if not hits:
        return None
    anchor = fitz.Rect(hits[0])
    band = fitz.Rect(36, anchor.y0 + 10, page.rect.width - 36, page.rect.height - 20)
    cands: list[fitz.Rect] = []
    for r in large_images(page):
        if not (r & band).is_empty:
            cands.append(r)
    for d in page.get_drawings():
        r = d.get("rect")
        if not r:
            continue
        rr = fitz.Rect(r)
        if rr.width < 20 or rr.height < 20 or rr.y0 < 50:
            continue
        if rr.width > page.rect.width * 0.95:
            continue
        if (rr & band).is_empty:
            continue
        cands.append(rr)
    if not cands:
        return None
    cands.sort(key=lambda r: r.y0)
    clusters = [cands[0]]
    for r in cands[1:]:
        if r.y0 > clusters[-1].y1 + 36:
            clusters.append(r)
        else:
            clusters[-1] = clusters[-1] | r
    # Prefer the lowest sizable cluster (the figure under the item).
    sizable = [c for c in clusters if c.width >= 80 and c.height >= 50]
    if not sizable:
        return clusters[-1]
    return sizable[-1]


def find_figure_box(doc: fitz.Document, page_no: int, marker: str) -> tuple[int, fitz.Rect] | None:
    for pno in (page_no, page_no + 1, page_no - 1):
        if pno < 1 or pno > doc.page_count:
            continue
        box = crop_near_marker(doc[pno - 1], marker)
        if box is not None:
            return pno, box
        # page with no marker but a large scan (MRI sitting above the item)
        if pno != page_no:
            big = crop_largest_image(doc[pno - 1])
            if big is not None and big.get_area() > 18000:
                return pno, big
    return None


def render_crop(page: fitz.Page, box: fitz.Rect, dest: Path) -> None:
    mat = fitz.Matrix(DPI / 72, DPI / 72)
    pix = page.get_pixmap(matrix=mat, clip=box, alpha=False)
    dest.write_bytes(pix.tobytes("png"))


def caption_block_rect(page: fitz.Page, fid: str) -> fitz.Rect | None:
    """Full caption paragraph, not the sliver around the first few letters."""
    d = page.get_text("dict")
    for b in d["blocks"]:
        if b.get("type") != 0:
            continue
        t = "".join(s["text"] for l in b.get("lines", []) for s in l.get("spans", []))
        t = t.replace("\u2002", " ").replace("\xa0", " ").strip()
        m = CAP_LINE.match(t)
        if not m:
            continue
        if fig_id(m) == fid:
            return fitz.Rect(b["bbox"])
    return None


def collect_captions(doc: fitz.Document) -> list[dict]:
    found: list[dict] = []
    seen: set[str] = set()
    for i in range(doc.page_count):
        page = doc[i]
        for line in (page.get_text() or "").splitlines():
            m = CAP_LINE.match(line)
            if not m:
                continue
            fid = fig_id(m)
            # Prefer the first (usually the real caption, not a later cross-ref)
            if fid in seen:
                continue
            cap = caption_block_rect(page, fid)
            if cap is None:
                needle = line.strip()[:24]
                rects = page.search_for(needle) or page.search_for(f"Fig. {fid}")
                if not rects:
                    continue
                cap = fitz.Rect(rects[0])
                cap.y1 = min(page.rect.height - 16, cap.y1 + 48)
            found.append({
                "id": fid,
                "pdf_page": i + 1,
                "caption": line.strip()[:200],
                "caption_bbox": [round(v, 1) for v in cap],
                "crop_bbox": None,
                "file": safe_name(fid),
                "_cap": [cap.x0, cap.y0, cap.x1, cap.y1],
            })
            seen.add(fid)
    # Second pass: crop with knowledge of the previous caption on the same page.
    by_page: dict[int, list[dict]] = {}
    for rec in found:
        by_page.setdefault(rec["pdf_page"], []).append(rec)
    for pno, recs in by_page.items():
        page = doc[pno - 1]
        recs.sort(key=lambda r: r["_cap"][1])
        prev_bottom = None
        for rec in recs:
            cap = fitz.Rect(rec["_cap"])
            box = crop_for_caption(page, cap, prev_bottom)
            rec["crop_bbox"] = [round(v, 1) for v in box]
            rec["caption_bbox"] = [round(v, 1) for v in cap]
            prev_bottom = cap.y1
            del rec["_cap"]
    return found


def cites_in(text: str) -> list[str]:
    out = []
    for m in CITE.finditer(text or ""):
        fid = fig_id(m)
        if fid not in out:
            out.append(fid)
    return out


def main() -> int:
    if not PDF.exists():
        raise SystemExit(f"missing {PDF}")
    doc = fitz.open(PDF)
    captions = collect_captions(doc)
    by_id = {c["id"]: c for c in captions}
    print(f"captions indexed: {len(captions)}")

    questions = json.loads(QFILE.read_text())
    CROP_DIR.mkdir(parents=True, exist_ok=True)

    # Render every cited teaching figure + every caption we will actually attach
    needed: set[str] = set()
    unlabeled_crops: dict[str, dict] = {}

    for q in questions:
        stem = q.get("stem") or ""
        expl = q.get("explanation_text") or ""
        page = int((q.get("kaufman") or {}).get("pdf_page") or 0)
        stem_ids = cites_in(stem)
        expl_ids = [i for i in cites_in(expl) if i not in stem_ids]
        unlabeled = (not stem_ids) and bool(SEE_FIG.search(stem))
        for fid in stem_ids + expl_ids:
            if fid in by_id:
                needed.add(fid)
            elif page:
                # Q&A-only label (13QA.70) — crop the image nearest the citation
                start = page + 1 if NEXT_PAGE.search(stem) else page
                start = min(start, doc.page_count)
                marker = f"Fig. {fid}" if "QA" in fid else f"{q.get('book_number') or q['q_index']}."
                found = find_figure_box(doc, start, marker)
                if found:
                    pno, box = found
                else:
                    pno, box = start, fitz.Rect(48, 80, doc[start - 1].rect.width - 48, 520)
                rec = {
                    "id": fid,
                    "pdf_page": pno,
                    "caption": f"Fig. {fid}",
                    "crop_bbox": [round(v, 1) for v in box],
                    "file": safe_name(fid),
                    "source": "qa-image",
                }
                by_id[fid] = rec
                captions.append(rec)
                needed.add(fid)
        if unlabeled and page:
            key = f"Q{q['year']}-{q['q_index']}".replace(" ", "")
            pno = page + 1 if NEXT_PAGE.search(stem) else page
            pno = min(pno, doc.page_count)
            marker = f"{q.get('book_number') or q['q_index']}."
            found = None
            if re.search(r"\bbelow\b|\bfollowing\b", stem, re.I):
                box = crop_below_marker(doc[pno - 1], marker)
                if box is not None:
                    found = (pno, box)
            if found is None:
                found = find_figure_box(doc, pno, marker)
            if found:
                pno, box = found
            else:
                hits = doc[pno - 1].search_for(marker[:12])
                r = doc[pno - 1].rect
                if hits:
                    a = fitz.Rect(hits[0])
                    band = fitz.Rect(r.width * 0.40, a.y0, r.width - 36, min(r.height - 40, a.y0 + 280))
                    box = drawing_union(doc[pno - 1], band)
                else:
                    box = None
            if box is None:
                continue  # no picture on the page — don't invent one
            rec = {
                "id": key,
                "pdf_page": pno,
                "caption": "Figure from this question",
                "crop_bbox": [round(v, 1) for v in box],
                "file": safe_name(key),
                "source": "unlabeled",
            }
            unlabeled_crops[f"{q['year']}-{q['q_index']}"] = rec
            needed.add(key)
            by_id[key] = rec

    rendered = 0
    for fid in sorted(needed):
        rec = by_id[fid]
        page = doc[int(rec["pdf_page"]) - 1]
        box = fitz.Rect(rec["crop_bbox"])
        dest = CROP_DIR / rec["file"]
        render_crop(page, box, dest)
        rec["bytes"] = dest.stat().st_size
        rendered += 1
    print(f"crops rendered: {rendered}")

    attached_stem = attached_expl = 0
    for q in questions:
        k = q.setdefault("kaufman", {})
        stem = q.get("stem") or ""
        expl = q.get("explanation_text") or ""
        stem_ids = cites_in(stem)
        expl_ids = [i for i in cites_in(expl) if i not in stem_ids]
        qid = f"{q['year']}-{q['q_index']}"
        stem_figs = []
        for fid in stem_ids:
            if fid in by_id:
                rec = by_id[fid]
                stem_figs.append({
                    "id": fid,
                    "page": rec["pdf_page"],
                    "file": rec["file"],
                    "caption": rec.get("caption") or f"Fig. {fid}",
                })
        if not stem_figs and qid in unlabeled_crops:
            rec = unlabeled_crops[qid]
            stem_figs.append({
                "id": rec["id"],
                "page": rec["pdf_page"],
                "file": rec["file"],
                "caption": rec["caption"],
            })
        expl_figs = []
        for fid in expl_ids:
            if fid in by_id:
                rec = by_id[fid]
                expl_figs.append({
                    "id": fid,
                    "page": rec["pdf_page"],
                    "file": rec["file"],
                    "caption": rec.get("caption") or f"Fig. {fid}",
                })
        k["stem_figures"] = stem_figs
        k["expl_figures"] = expl_figs
        k["needs_figure"] = bool(stem_figs)
        if stem_figs:
            attached_stem += 1
        if expl_figs:
            attached_expl += 1

    QFILE.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n")
    OUT_INDEX.write_text(
        json.dumps({"count": len(captions), "figures": captions}, ensure_ascii=False, indent=2) + "\n"
    )
    print(f"questions with stem figures: {attached_stem}")
    print(f"questions with explanation figures: {attached_expl}")
    print(f"wrote {QFILE}")
    doc.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
