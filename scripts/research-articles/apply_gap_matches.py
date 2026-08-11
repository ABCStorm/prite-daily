#!/usr/bin/env python3
"""
Merge gap-rematch judge verdicts (see gap_rematch_pilot.py / docs/gap-rematch-handoff.md)
into refs.json for questions that currently ship zero articles.

Reads:
  <gap-dir>/batches/batch_*.json  -- question + full candidate metadata (pmid, title, journal, ...)
  <gap-dir>/results/batch_*.json  -- judge verdicts {id, no_match} or {id, pmid, rating, relevance_sentence}

For every verdict with no_match=false, looks up the full candidate record (by pmid) in the
matching batch file, builds an article record in the same schema match_articles.py produces,
and sets refs[id]["articles"] = [that record] (only if refs[id]["articles"] is currently empty
-- never overwrites an id that already has shipped articles).

Usage:
  python3 scripts/research-articles/apply_gap_matches.py --gap-dir reference/research-articles/gap_pilot
  python3 scripts/research-articles/apply_gap_matches.py --gap-dir reference/research-articles/gap_pilot --dry-run
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REFS = ROOT / "reference" / "research-articles" / "refs.json"
BACKUP = ROOT / "reference" / "research-articles" / "refs.pre_gap_rematch_backup.json"


def load_batches(batches_dir: Path) -> dict[str, dict]:
    """id -> question record (with candidates) from all batch files."""
    out: dict[str, dict] = {}
    for path in sorted(batches_dir.glob("batch_*.json")):
        data = json.loads(path.read_text())
        for q in data.get("questions", []):
            out[q["id"]] = q
    return out


def load_verdicts(results_dir: Path) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for path in sorted(results_dir.glob("batch_*.json")):
        try:
            data = json.loads(path.read_text())
        except Exception as e:
            print(f"  skip unreadable {path.name}: {e}", file=sys.stderr)
            continue
        for v in data.get("verdicts", []):
            id_ = v.get("id")
            if id_:
                out[id_] = v
    return out


def build_article_record(cand: dict, rating: str, sentence: str) -> dict:
    pmid = str(cand["pmid"])
    pmcid = cand.get("pmcid")
    doi = cand.get("doi")
    urls = {"pubmed": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"}
    if pmcid:
        urls["pmc"] = f"https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid}/"
    if doi:
        urls["doi"] = f"https://doi.org/{doi}"
    return {
        "pmid": pmid,
        "pmcid": pmcid,
        "doi": doi,
        "title": (cand.get("title") or "").strip().rstrip("."),
        "journal": cand.get("journal"),
        "journal_tier": cand.get("journal_tier"),
        "year": cand.get("year"),
        "pub_types": cand.get("pub_types") or [],
        "cited_by": cand.get("cited_by"),
        "is_open_access": cand.get("is_open_access"),
        "is_reviewish": cand.get("is_reviewish"),
        "score": cand.get("score"),
        "why": sentence,
        "relevance_sentence": sentence,
        "audit_rating": rating,
        "source": "gap_rematch",
        "urls": urls,
        "url": urls.get("pmc") or urls.get("pubmed"),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gap-dir", type=Path, required=True,
                     help="e.g. reference/research-articles/gap_pilot")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--keep-weak", action="store_true", default=True)
    ap.add_argument("--no-weak", action="store_true")
    args = ap.parse_args()
    keep_weak = args.keep_weak and not args.no_weak

    gap_dir = args.gap_dir if args.gap_dir.is_absolute() else ROOT / args.gap_dir
    batches = load_batches(gap_dir / "batches")
    verdicts = load_verdicts(gap_dir / "results")
    print(f"batches loaded: {len(batches)} questions, verdicts: {len(verdicts)}", file=sys.stderr)

    refs = json.loads(REFS.read_text())

    applied = skipped_has_articles = skipped_no_match = skipped_missing_pmid = 0
    rating_counts = {"relevant": 0, "weak": 0}

    for id_, v in verdicts.items():
        if v.get("no_match"):
            skipped_no_match += 1
            continue
        if id_ not in refs:
            print(f"  warn: {id_} not in refs.json, skipping", file=sys.stderr)
            continue
        if refs[id_].get("articles"):
            skipped_has_articles += 1
            continue
        rating = (v.get("rating") or "relevant").lower()
        if rating == "weak" and not keep_weak:
            continue
        pmid = str(v.get("pmid") or "")
        q = batches.get(id_)
        cand = None
        if q:
            for c in q.get("candidates", []):
                if str(c.get("pmid")) == pmid:
                    cand = c
                    break
        if not cand:
            print(f"  warn: {id_} verdict pmid {pmid} not found in batch candidates, skipping", file=sys.stderr)
            skipped_missing_pmid += 1
            continue
        sentence = (v.get("relevance_sentence") or "").strip()
        article = build_article_record(cand, rating, sentence)
        refs[id_] = dict(refs[id_])
        refs[id_]["articles"] = [article]
        applied += 1
        rating_counts[rating] = rating_counts.get(rating, 0) + 1

    print(
        f"applied={applied} (relevant={rating_counts.get('relevant',0)} weak={rating_counts.get('weak',0)}) "
        f"skipped_no_match={skipped_no_match} skipped_already_had_articles={skipped_has_articles} "
        f"skipped_missing_pmid={skipped_missing_pmid}",
        file=sys.stderr,
    )

    if args.dry_run:
        print("dry-run: not writing refs.json", file=sys.stderr)
        return 0

    if not BACKUP.exists():
        BACKUP.write_text(REFS.read_text())
        print(f"backup -> {BACKUP}", file=sys.stderr)

    REFS.write_text(json.dumps(refs, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {REFS}", file=sys.stderr)

    # Prefer merge that includes APA PsychiatryOnline chapters when available
    merge_apa = ROOT / "scripts/research-articles/merge_apa_into_client.py"
    if merge_apa.exists():
        subprocess.check_call([sys.executable, str(merge_apa), "--min-score", "5"])
    else:
        subprocess.check_call([sys.executable, str(ROOT / "scripts/research-articles/build_client_bundle.py")])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
