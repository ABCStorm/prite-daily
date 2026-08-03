"""
Merge a workflow run's returned JSON (stage1_direct + fallback + not_in_book
arrays) into the flat list verify_citations.py expects. Also fills in any
question id from the full 3,600 bank that's missing from the merged output
entirely (shouldn't happen, but a workflow agent has silently dropped an id
from its batch output before -- see SKILL.md "known failure mode: dropped
items").

Usage:
    python3 merge_workflow_output.py <workflow_result.json> <output.json>

<workflow_result.json> is the "result" field of a completed workflow's output
file (see SKILL.md "reading workflow output" for how to extract it).
"""
import json
import sys

BASE = "/Users/andrewcorrell/Claude/Projects/PRITE question practice website"


def main(result_path, output_path):
    with open(result_path) as f:
        result = json.load(f)

    merged = []
    for r in result.get("stage1_direct", []):
        merged.append({"id": r["id"], "section_num": r.get("section_num"), "rating": r["rating"], "citations": r.get("citations", [])})
    for r in result.get("fallback", []):
        merged.append({"id": r["id"], "section_num": r.get("section_num"), "rating": r["rating"], "citations": r.get("citations", [])})
    for r in result.get("not_in_book", []):
        merged.append({"id": r["id"], "section_num": None, "rating": "NONE", "citations": []})

    covered = {m["id"] for m in merged}
    with open(f"{BASE}/reference/all3600_slim.json") as f:
        all_ids = {q["id"] for q in json.load(f)}
    missing = all_ids - covered
    if missing:
        print(f"WARNING: {len(missing)} ids missing entirely from workflow output -- "
              f"a batch likely errored (check the workflow's <failures> block) or an "
              f"agent dropped items from its structured output. Marking as NONE so "
              f"they're visible in the final tally rather than silently absent.")
        for mid in missing:
            merged.append({"id": mid, "section_num": None, "rating": "NONE", "citations": []})

    with open(output_path, "w") as f:
        json.dump(merged, f, indent=2)
    print(f"wrote {len(merged)} entries to {output_path}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: python3 merge_workflow_output.py <workflow_result.json> <output.json>")
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
