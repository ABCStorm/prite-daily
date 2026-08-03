"""
Build BM25 top-10 candidate passages for every question in the full 3,600
question bank, batched by 10 questions/file for the workflow's Stage 1.

Prereqs: reference/book_chunks.json (run build_book_chunks.py first if missing).
Slow: ~15-25 min for 3,600 queries against ~18,500 chunks (rank_bm25 is pure
Python, not vectorized). Run in the background with progress logging, e.g.:

  python3 build_candidates.py > /tmp/bm25_progress.log 2>&1 &

Output: reference/all3600_slim.json (id/stem/options/answer for lookup during
triage+fallback stages) and reference/full_batch_0000.json..full_batch_0359.json
(360 files, 10 questions each, each with pre-fetched "candidates").

Already run once — full_batch_*.json (360 files) exist in reference/. Only
re-run if the question bank or book_chunks.json changed.
"""
import json
import re
from rank_bm25 import BM25Okapi

BASE = "/Users/andrewcorrell/Claude/Projects/PRITE question practice website"

with open(f"{BASE}/reference/book_chunks.json") as f:
    chunks = json.load(f)
with open(f"{BASE}/extraction/output/questions_all.json") as f:
    all_q = json.load(f)
for q in all_q:
    q["id"] = f"{q['year']}-{q['q_index']}"

with open(f"{BASE}/reference/all3600_slim.json", "w") as f:
    json.dump(
        [{"id": q["id"], "stem": q["stem"], "options": q["options"],
          "answer_letter": q["answer_letter"], "answer_text": q["answer_text"]} for q in all_q],
        f,
    )


def tokenize(s):
    return re.findall(r"[a-z0-9]+", s.lower())


print("building BM25 index...", flush=True)
corpus_tokens = [tokenize(c["text"]) for c in chunks]
bm25 = BM25Okapi(corpus_tokens)
print("index built, scoring queries...", flush=True)

TOPK = 10
batch_data = []
for qi, q in enumerate(all_q):
    # NOTE: do NOT add distractor-option text to the query -- tried this once
    # (repilot round) and it measurably hurt recall by diluting the query
    # with generic terms. Stem + answer + tags only.
    query = f"{q['stem']} {q['answer_text']} " + " ".join(q.get("tags", []) or [])
    scores = bm25.get_scores(tokenize(query))
    top_idx = sorted(range(len(scores)), key=lambda i: -scores[i])[:TOPK]
    candidates = [
        {"chunk_id": i, "section_num": chunks[i]["section_num"],
         "section_title": chunks[i]["section_title"], "text": chunks[i]["text"]}
        for i in top_idx
    ]
    batch_data.append({
        "id": q["id"], "stem": q["stem"], "options": q["options"],
        "answer_letter": q["answer_letter"], "answer_text": q["answer_text"],
        "candidates": candidates,
    })
    if qi % 200 == 0:
        print(f"...{qi}/{len(all_q)}", flush=True)

BATCH_SIZE = 10
BATCHES = [batch_data[i:i + BATCH_SIZE] for i in range(0, len(batch_data), BATCH_SIZE)]
for i, b in enumerate(BATCHES):
    with open(f"{BASE}/reference/full_batch_{i:04d}.json", "w") as f:
        json.dump(b, f)
print(f"DONE: wrote {len(BATCHES)} batches for {len(batch_data)} questions", flush=True)
