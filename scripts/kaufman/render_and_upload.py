#!/usr/bin/env python3
"""Render Kaufman 9e pages and upload to private R2 as kf-NNNNN.png.

Also uploads kaufman-refs.json and kaufman-questions.json.

Usage:
  python3 scripts/kaufman/render_and_upload.py --limit 8          # smoke
  python3 scripts/kaufman/render_and_upload.py --skip-upload
  python3 scripts/kaufman/render_and_upload.py                   # full
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / "reference" / "kaufman" / "kaufman-9e.pdf"
PAGES_FILE = ROOT / "reference" / "kaufman" / "pages_to_render.txt"
QFILE = ROOT / "reference" / "kaufman" / "questions.json"
REFS = ROOT / "public" / "data" / "kaufman_refs.json"
UPLOADED = ROOT / "reference" / "kaufman" / "uploaded_pages.txt"
UPLOADED_FIGS = ROOT / "reference" / "kaufman" / "uploaded_figs.txt"
CROP_DIR = ROOT / "reference" / "kaufman" / "fig_crops"
BUCKET = "textbook-excerpts"
DPI = 150
PARALLEL = 4


def page_key(p: int) -> str:
    return f"kf-{p:05d}.png"


def needed_pages() -> list[int]:
    pages: set[int] = set()
    if PAGES_FILE.exists():
        for line in PAGES_FILE.read_text().splitlines():
            line = line.strip()
            if line.isdigit():
                pages.add(int(line))
    if QFILE.exists():
        for q in json.loads(QFILE.read_text()):
            p = (q.get("kaufman") or {}).get("pdf_page")
            if p:
                for x in range(int(p) - 1, int(p) + 3):
                    if x >= 1:
                        pages.add(x)
    return sorted(pages)


def render_page(doc: fitz.Document, page: int, dest: Path) -> Path:
    pix = doc[page - 1].get_pixmap(dpi=DPI, alpha=False)
    dest.write_bytes(pix.tobytes("png"))
    return dest


def upload(local: Path, key: str, content_type: str) -> None:
    cmd = [
        "npx", "wrangler@3", "r2", "object", "put",
        f"{BUCKET}/{key}",
        "--file", str(local),
        "--content-type", content_type,
    ]
    last = None
    for _ in range(4):
        try:
            subprocess.check_call(cmd, cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            return
        except subprocess.CalledProcessError as e:
            last = e
    raise last  # type: ignore[misc]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--skip-upload", action="store_true")
    ap.add_argument("--json-only", action="store_true", help="upload refs + questions only")
    ap.add_argument("--figures-only", action="store_true", help="upload fig crops + questions JSON")
    args = ap.parse_args()

    done = set()
    if UPLOADED.exists():
        done = {int(x) for x in UPLOADED.read_text().split() if x.isdigit()}

    pages = needed_pages()
    if args.limit:
        pages = pages[: args.limit]
    todo = [p for p in pages if p not in done]
    print(f"needed={len(pages)} already={len(done)} todo={len(todo)}", file=sys.stderr)

    if args.figures_only:
        if not args.skip_upload and CROP_DIR.exists():
            already = set(UPLOADED_FIGS.read_text().split()) if UPLOADED_FIGS.exists() else set()
            files = sorted(CROP_DIR.glob("kf-fig-*.png"))
            print(f"fig crops {len(files)} already={len(already)}", file=sys.stderr)
            for i, f in enumerate(files, 1):
                if f.name in already:
                    continue
                upload(f, f.name, "image/png")
                with UPLOADED_FIGS.open("a") as log:
                    log.write(f.name + "\n")
                if i % 20 == 0 or i == len(files):
                    print(f"  figs {i}/{len(files)}", file=sys.stderr)
        if not args.skip_upload and QFILE.exists():
            print("uploading kaufman-questions.json", file=sys.stderr)
            upload(QFILE, "kaufman-questions.json", "application/json; charset=utf-8")
        print("done", file=sys.stderr)
        return 0

    if not args.json_only:
        if not PDF.exists():
            raise SystemExit(f"missing {PDF}")
        from concurrent.futures import ThreadPoolExecutor, as_completed

        def work(page: int) -> int:
            # Each worker opens its own doc — fitz documents are not thread-safe.
            doc = fitz.open(PDF)
            try:
                with tempfile.TemporaryDirectory(prefix=f"kf-{page}-") as tmp:
                    out = Path(tmp) / page_key(page)
                    render_page(doc, page, out)
                    if not args.skip_upload:
                        upload(out, page_key(page), "image/png")
            finally:
                doc.close()
            return page

        UPLOADED.parent.mkdir(parents=True, exist_ok=True)
        ok = 0
        with ThreadPoolExecutor(max_workers=PARALLEL) as pool:
            futs = {pool.submit(work, p): p for p in todo}
            for fut in as_completed(futs):
                p = futs[fut]
                try:
                    fut.result()
                    ok += 1
                    if not args.skip_upload:
                        with UPLOADED.open("a") as f:
                            f.write(f"{p}\n")
                except Exception as e:
                    print(f"  FAIL p{p}: {e}", file=sys.stderr)
                if ok % 25 == 0 or ok == len(todo):
                    print(f"  done {ok}/{len(todo)}", file=sys.stderr)

    if not args.skip_upload:
        if REFS.exists():
            print("uploading kaufman-refs.json", file=sys.stderr)
            upload(REFS, "kaufman-refs.json", "application/json; charset=utf-8")
        if QFILE.exists():
            print("uploading kaufman-questions.json", file=sys.stderr)
            upload(QFILE, "kaufman-questions.json", "application/json; charset=utf-8")
    print("done", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
