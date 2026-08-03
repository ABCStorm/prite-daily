#!/usr/bin/env python3
"""Render the page-window PNGs and push them to the private R2 bucket.

Reads reference/pages_to_render.txt (from build_page_windows.py) and produces
one object per PDF page, keyed BY PAGE rather than by question:

    ks-03321.png

The original set was keyed per question (`2014-2_11.3_p3321.png`), which meant
the same page was stored once per citation that landed on it — 2,777 objects for
1,251 distinct pages. Page keys deduplicate that, and more importantly they make
a neighbouring page addressable by arithmetic, which is the whole point of being
able to scroll.

Renders run-by-run and delete as they go, so peak local disk is a few MB rather
than ~3 GB — the machine this was built on had 25 GiB free on a 98%-full volume.

Resumable: every uploaded page is appended to reference/uploaded_pages.txt and
skipped on a re-run. Safe to interrupt and restart.

    python3 render_and_upload_pages.py [--dry-run] [--limit N] [--jobs N]
"""
import argparse
import pathlib
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

ROOT = pathlib.Path(__file__).resolve().parents[4]
PDF = ROOT / "reference" / "kaplan-sadock-10e.pdf"
PAGES = ROOT / "reference" / "pages_to_render.txt"
DONE = ROOT / "reference" / "uploaded_pages.txt"
BUCKET = "textbook-excerpts"
DPI = 150  # matches the original shipped renders
# Local wrangler v4. NOTE: v4 writes to *simulated local* storage unless
# --remote is passed, so an upload without it silently touches nothing real.
WRANGLER = ROOT / "node_modules" / ".bin" / "wrangler"


def key_for(page: int) -> str:
    """pdftoppm zero-pads to the digit count of the document's last page (12754 -> 5)."""
    return f"ks-{page:05d}.png"


def runs(pages):
    """Collapse sorted pages into contiguous [lo, hi] runs — one pdftoppm call each."""
    out, start, prev = [], pages[0], pages[0]
    for p in pages[1:]:
        if p == prev + 1:
            prev = p
        else:
            out.append((start, prev))
            start = prev = p
    out.append((start, prev))
    return out


def upload(path: pathlib.Path) -> str | None:
    """Put one object. R2 intermittently 521s; an immediate retry succeeds."""
    for attempt in range(4):
        r = subprocess.run(
            [str(WRANGLER), "r2", "object", "put", f"{BUCKET}/{path.name}",
             "--file", str(path), "--content-type", "image/png", "--remote"],
            capture_output=True, text=True,
        )
        if r.returncode == 0:
            return None
        if attempt == 3:
            return (r.stderr or r.stdout).strip()[-300:]
    return "unreachable"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, help="stop after N pages (for a smoke test)")
    ap.add_argument("--jobs", type=int, default=8)
    args = ap.parse_args()

    if not PDF.exists():
        print(f"missing source PDF: {PDF}", file=sys.stderr)
        return 1

    want = [int(l) for l in PAGES.read_text().split()]
    done = set(int(l) for l in DONE.read_text().split()) if DONE.exists() else set()
    todo = [p for p in want if p not in done]
    if args.limit:
        todo = todo[: args.limit]

    print(f"{len(want)} pages wanted, {len(done)} already uploaded, {len(todo)} to do")
    if not todo:
        return 0
    batches = runs(todo)
    print(f"{len(batches)} contiguous run(s), {DPI} DPI, {args.jobs} parallel uploads")
    if args.dry_run:
        print("dry run — nothing rendered or uploaded")
        return 0

    tmp = pathlib.Path(tempfile.mkdtemp(prefix="ks-pages-"))
    n_ok = n_fail = 0
    try:
        with DONE.open("a") as log:
            for i, (lo, hi) in enumerate(batches, 1):
                subprocess.run(
                    ["pdftoppm", "-png", "-r", str(DPI), "-f", str(lo), "-l", str(hi),
                     str(PDF), str(tmp / "ks")],
                    check=True, capture_output=True,
                )
                # Only upload pages actually asked for — a run is contiguous, but
                # a resumed run can still straddle pages already done.
                files = [tmp / key_for(p) for p in range(lo, hi + 1)]
                files = [f for f in files if f.exists()]
                with ThreadPoolExecutor(max_workers=args.jobs) as pool:
                    for f, err in zip(files, pool.map(upload, files)):
                        if err is None:
                            n_ok += 1
                            log.write(f"{int(f.stem.split('-')[1])}\n")
                        else:
                            n_fail += 1
                            print(f"  FAILED {f.name}: {err}", file=sys.stderr)
                    log.flush()
                for f in tmp.glob("*.png"):
                    f.unlink()
                print(f"[{i}/{len(batches)}] pages {lo}-{hi}  ok={n_ok} failed={n_fail}", flush=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print(f"done: {n_ok} uploaded, {n_fail} failed")
    return 1 if n_fail else 0


if __name__ == "__main__":
    sys.exit(main())
