# Re-query + APA chapters + gap rematch status (updated 2026-08-11)

## What we tried

1. **Improved residual re-query** (`scripts/research-articles/requery_residual_pilot.py`)
   - Explanation teaching-point phrases + intent templates (side effect, epi, first-line, mechanism, forensic…)
   - Multi-source: Europe PMC + PubMed + OpenAlex (PubMed/OpenAlex rate-limited during concurrent gap_full run; this pilot was effectively **EPMC + improved queries**, with OpenAlex mostly 429)
   - Wide shortlist top 18 → LLM judge (same precision rules as gap rematch)

2. **APA Publishing / PsychiatryOnline chapters** (`reference/apa-chapters/`)
   - Curated chapter index (no Kaplan)
   - Links via Wright EZproxy: `https://psychiatryonline-org.ezproxy.libraries.wright.edu`
   - Topic/intent matcher: `scripts/research-articles/match_apa_chapters.py`

3. **Also completed offline:** `gap_full` wide shortlists for 2,844 residual gap questions (190 batches) ready for the original gap-rematch judge pipeline.

## Pilot yield (re-query, n=48, seed=1)

Recomputed from `reference/research-articles/requery_pilot_n48/results/`:

| Metric | Value |
|---|---|
| Matched (relevant+weak) | **19/48 (39.6%)** |
| Relevant / weak | **17 / 2** |
| no_match | **29 (60.4%)** |
| Novel PMIDs vs gap_full shortlist | **avg 14/18 candidates novel; every Q had ≥1 novel** |
| Matched papers novel vs gap_full | **17/19 (89%)** — re-query finds papers the original shortlist missed |

Interpretation: **better queries are a real lift on residual items**, not just reshuffling the same pool. Yield on this 48-sample looked **at least as good as gap rematch’s 21% pilot**, and often better — with the caveat that n=48 is small and OpenAlex/PubMed were throttled.

## APA chapter auto-match

| Set | Matches (min_score=4) |
|---|---|
| Gap-only | **1,096 / ~2,997** (~37% of empty paper items) |
| All questions | 1,747 / 5,100 |

These are **topic/intent auto-matches**, not LLM-audited chapter fitness. Ship only after a light audit (or start with high-score subset). Book-level DOIs are used until true chapter DOIs are filled in.

## Recommended next steps

1. Apply requery pilot matches (if desired) via `apply_gap_matches.py --gap-dir …/requery_pilot_n48`.
2. Scale re-query to full residual **after** gap_full LLM judge (or on gap_full `no_match` only) with slower NCBI/OpenAlex rates or API keys.
3. Wire APA chapter cards into UI with ezproxy URLs; expand `chapter_index.json` with real chapter DOIs from PsychiatryOnline TOC.
4. Landmark library still valuable for classics (CATIE, STAR*D, InterSePT…) that query rewrite sometimes still misses (e.g. clozapine-suicide item in pilot had no InterSePT in pool).

## MCP note

A multi-source paper-search MCP is useful for interactive curation; for bulk yield the Python multi-source client in `requery_residual_pilot.py` is the right tool (rate limits dominate). Prefer **PubMed E-utilities** (with API key if available) + **Europe PMC** as truth for PMIDs; OpenAlex as recall booster when not throttled.
