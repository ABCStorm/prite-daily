#!/usr/bin/env python3
"""
Render DSM-5-TR PDF pages and upload to private R2 bucket textbook-excerpts
as dsm-NNNNN.png (5-digit zero-padded).

Requires: pdftoppm (poppler), wrangler logged in with R2 access.

Usage:
  python3 scripts/dsm5tr/render_and_upload_dsm_pages.py
  python3 scripts/dsm5tr/render_and_upload_dsm_pages.py --limit 20   # smoke
  python3 scripts/dsm5tr/render_and_upload_dsm_pages.py --skip-upload
"""
from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / "reference" / "dsm5tr" / "DSM-5-TR.pdf"
PAGES_FILE = ROOT / "reference" / "dsm5tr" / "pages_to_render.txt"
UPLOADED_LOG = ROOT / "reference" / "dsm5tr" / "uploaded_pages.txt"
BUCKET = "textbook-excerpts"
DPI = 150
PARALLEL = 4  # wrangler spawns are heavy; keep modest


def page_key(p: int) -> str:
    return f"dsm-{p:05d}.png"


def render_page(page: int, out_dir: Path) -> Path:
    """Render one 1-based PDF page → out_dir/dsm-NNNNN.png"""
    # pdftoppm -f -l are 1-based; -singlefile names with prefix
    prefix = out_dir / f"dsm-{page:05d}"
    cmd = [
        "pdftoppm",
        "-png",
        "-r",
        str(DPI),
        "-f",
        str(page),
        "-l",
        str(page),
        "-singlefile",
        str(PDF),
        str(prefix),
    ]
    subprocess.check_call(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    out = Path(str(prefix) + ".png")
    if not out.exists():
        raise FileNotFoundError(out)
    return out


def upload_one(local: Path, key: str) -> None:
    # Note: wrangler@3 r2 object put talks to real R2 by default (no --remote).
    # Passing --remote makes wrangler 3 print help and exit 1.
    cmd = [
        "npx",
        "wrangler@3",
        "r2",
        "object",
        "put",
        f"{BUCKET}/{key}",
        "--file",
        str(local),
        "--content-type",
        "image/png",
    ]
    # retry a few times on transient 521/429
    last = None
    for attempt in range(4):
        try:
            subprocess.check_call(cmd, cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            return
        except subprocess.CalledProcessError as e:
            last = e
            import time

            time.sleep(1.5 * (attempt + 1))
    raise last  # type: ignore[misc]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="Only first N pages (smoke)")
    ap.add_argument("--skip-upload", action="store_true")
    ap.add_argument("--workers", type=int, default=PARALLEL)
    args = ap.parse_args()

    if not PDF.exists():
        print(f"missing {PDF}", file=sys.stderr)
        return 1
    pages = [int(x) for x in PAGES_FILE.read_text().split() if x.strip().isdigit()]
    done: set[int] = set()
    if UPLOADED_LOG.exists():
        done = {int(x) for x in UPLOADED_LOG.read_text().split() if x.strip().isdigit()}
    todo = [p for p in pages if p not in done]
    if args.limit:
        todo = todo[: args.limit]
    print(f"pages total={len(pages)} already={len(done)} todo={len(todo)}", file=sys.stderr)

    ok = 0
    fail = 0
    with tempfile.TemporaryDirectory(prefix="dsm_pages_") as td:
        tdir = Path(td)

        def work(p: int) -> tuple[int, str]:
            local = render_page(p, tdir)
            key = page_key(p)
            if not args.skip_upload:
                upload_one(local, key)
            local.unlink(missing_ok=True)
            return p, key

        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futs = {pool.submit(work, p): p for p in todo}
            for i, f in enumerate(as_completed(futs), 1):
                p = futs[f]
                try:
                    page, key = f.result()
                    with UPLOADED_LOG.open("a") as log:
                        log.write(f"{page}\n")
                    ok += 1
                    if i % 25 == 0 or i == len(todo):
                        print(f"  {i}/{len(todo)} ok={ok} fail={fail} last={key}", file=sys.stderr)
                except Exception as e:
                    fail += 1
                    print(f"  FAIL page {p}: {e}", file=sys.stderr)

    print(f"done ok={ok} fail={fail}", file=sys.stderr)
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
