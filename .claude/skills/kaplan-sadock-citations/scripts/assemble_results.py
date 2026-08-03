"""
Assemble the pipeline's per-batch result files on disk into one merged citation
set ready for verify_citations.py, with coverage accounting and section_num
sanity-checking.

Reads from reference/results/ (written incrementally by the workflow's agents),
NOT from the workflow's return value -- disk is the durable copy that survives
an interrupted multi-hour run. Optionally also folds in a workflow result JSON
via --workflow-result for belt-and-suspenders coverage.

Usage:
    python3 assemble_results.py <output.json> [--workflow-result <result.json>]

Reports (and does not hide):
  * questions missing entirely -- an agent dropped them from a batch, or a batch
    failed all retries. Both have happened; silence here previously cost 49
    questions that were only found by hand-diffing id sets.
  * citations whose section_num isn't a real entry in section_index_full.json
    (agents have invented e.g. "18" and "4.5"). The quote may still be genuine,
    so these are kept but their section attribution is nulled -- the downstream
    verifier will locate the page by whole-book search instead of trusting a
    bogus section, and the UI should not display a section it can't confirm.
"""
import glob
import json
import os
import sys

BASE = "/Users/andrewcorrell/Claude/Projects/PRITE question practice website"
RESULTS = f"{BASE}/reference/results"


def load_dir(pattern):
    out = []
    for path in sorted(glob.glob(f"{RESULTS}/{pattern}")):
        try:
            with open(path) as f:
                data = json.load(f)
            if isinstance(data, list):
                out.extend(data)
        except Exception as e:
            print(f"  WARNING: could not read {os.path.basename(path)}: {e}")
    return out


def main(output_path, workflow_result=None):
    with open(f"{BASE}/reference/section_index_full.json") as f:
        valid_sections = {s["num"] for s in json.load(f)}
    with open(f"{BASE}/reference/all3600_slim.json") as f:
        all_ids = [q["id"] for q in json.load(f)]

    merged = {}

    # Disk is the primary source of truth.
    for r in load_dir("stage1_*.json") + load_dir("fallback_*.json"):
        if not isinstance(r, dict) or "id" not in r:
            continue
        # a later (fallback) result for the same id supersedes an earlier NONE
        prev = merged.get(r["id"])
        if prev and prev.get("rating") != "NONE" and r.get("rating") == "NONE":
            continue
        merged[r["id"]] = r
    print(f"from disk: {len(merged)} questions")

    # Optional: fold in the workflow's returned JSON for anything disk missed.
    if workflow_result:
        with open(workflow_result) as f:
            wf = json.load(f)
        added = 0
        for key in ("stage1_direct", "fallback", "not_in_book"):
            for r in wf.get(key, []):
                if r.get("id") and r["id"] not in merged:
                    merged[r["id"]] = r
                    added += 1
        print(f"from workflow result: +{added} questions disk didn't have")

    # section_num sanity check
    bad_sections = {}
    for r in merged.values():
        sn = r.get("section_num")
        if sn and sn not in valid_sections:
            bad_sections.setdefault(sn, []).append(r["id"])
            r["section_num_claimed"] = sn
            r["section_num"] = None  # don't display an attribution we can't confirm
    if bad_sections:
        print(f"\n{sum(len(v) for v in bad_sections.values())} citations claimed a section_num "
              f"not in the index -- attribution nulled, quote kept for verification:")
        for sn, ids in sorted(bad_sections.items()):
            print(f"  {sn!r}: {len(ids)} question(s) e.g. {ids[:3]}")

    # coverage
    missing = [qid for qid in all_ids if qid not in merged]
    if missing:
        print(f"\nWARNING: {len(missing)}/{len(all_ids)} questions MISSING from results entirely.")
        print(f"  These were dropped by an agent or lost to a failed batch. First 20: {missing[:20]}")
        print(f"  Re-run prep_run.py + the workflow to pick them up before treating this as final.")
        for qid in missing:
            merged[qid] = {"id": qid, "section_num": None, "rating": "NONE", "citations": [],
                           "reason": "missing from pipeline output (dropped or failed batch)"}

    out = [merged[qid] for qid in all_ids]
    with open(output_path, "w") as f:
        json.dump(out, f, indent=2)

    from collections import Counter
    ratings = Counter(r.get("rating") for r in out)
    print(f"\nwrote {len(out)} entries to {output_path}")
    print(f"self-rated (NOT yet verified -- run verify_citations.py next): {dict(ratings)}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: python3 assemble_results.py <output.json> [--workflow-result <result.json>]")
        sys.exit(1)
    wf = None
    if "--workflow-result" in sys.argv:
        wf = sys.argv[sys.argv.index("--workflow-result") + 1]
    main(sys.argv[1], wf)
