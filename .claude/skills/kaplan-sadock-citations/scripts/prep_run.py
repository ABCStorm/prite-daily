"""
Compute which Stage-1 batches still need processing, by checking which result
files already exist on disk. This is what makes the full run resumable ACROSS
sessions -- the Workflow tool's own resumeFromRunId cache is same-session only,
which is useless for a multi-hour job you might come back to tomorrow.

Usage:
    python3 prep_run.py            # print remaining batch indices as a JSON array
    python3 prep_run.py --summary  # human-readable progress summary

Then launch/relaunch the pipeline with that array as args:
    Workflow({scriptPath: ".../run_pipeline.workflow.js", args: [<indices>]})
Or with no args at all to (re)do everything.
"""
import json
import os
import sys

BASE = "/Users/andrewcorrell/Claude/Projects/PRITE question practice website"
RESULTS = f"{BASE}/reference/results"
N_BATCHES = 360


def batch_done(i):
    """A batch counts as done only if its file exists AND parses as a non-empty list."""
    p = f"{RESULTS}/stage1_{i:04d}.json"
    if not os.path.exists(p):
        return False
    try:
        with open(p) as f:
            data = json.load(f)
        return isinstance(data, list) and len(data) > 0
    except Exception:
        return False  # corrupt/partial write -> redo it


def main():
    done = [i for i in range(N_BATCHES) if batch_done(i)]
    todo = [i for i in range(N_BATCHES) if i not in set(done)]

    if "--summary" in sys.argv:
        n_q = 0
        for i in done:
            with open(f"{RESULTS}/stage1_{i:04d}.json") as f:
                n_q += len(json.load(f))
        print(f"Stage 1 progress: {len(done)}/{N_BATCHES} batches done ({n_q} questions on disk)")
        print(f"Remaining: {len(todo)} batches")
        if todo[:20]:
            print(f"Next indices: {todo[:20]}{'...' if len(todo) > 20 else ''}")
    else:
        print(json.dumps(todo))


if __name__ == "__main__":
    main()
