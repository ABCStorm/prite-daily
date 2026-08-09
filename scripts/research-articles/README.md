# Research articles for PRITE Daily

Find **real, MEDLINE-indexed** papers users can open for further reading after each question.

## Design choices

- **Europe PMC is only the search index.** User-facing links are PubMed / PMC / DOI. We never invent PMIDs.
- **Hard quality gate:** `SRC:MED` (MEDLINE). Soft-demote Frontiers / MDPI / Cureus / Hindawi megajournals.
- **Relevance:** query is driven by the **answer text** + a couple of stem clinical anchors (e.g. lithium + psoriasis), not every distractor medication tag.
- **1–2 articles per question** is enough for a “further reading” affordance.

## Run

```bash
# pilot
python3 scripts/research-articles/match_articles.py --sample 40 --seed 1 --fresh \
  --out reference/research-articles/refs_pilot.json

# full bank (~hours; resumable)
python3 scripts/research-articles/match_articles.py --all --resume \
  --out reference/research-articles/refs.json
```

Outputs:

- `reference/research-articles/refs.json` — per-question article list
- `reference/research-articles/query_cache.json` — cached Europe PMC responses (safe to delete)

## Verify a few

```bash
python3 -c "
import json
r=json.load(open('reference/research-articles/refs.json'))
print(len(r), 'questions')
print(sum(1 for v in r.values() if v.get('articles')), 'with articles')
"
```
