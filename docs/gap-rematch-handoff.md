# Gap-question rematch (Further reading, phase 2) — handoff for the next agent

Last updated: 2026-08-09
Project: PRITE Daily (`https://pritedaily.com`)
Read `docs/research-articles-handoff.md` first — this is a follow-on to that pipeline, not a replacement.

## The problem this solves

After the phase-1 pipeline + audit (see `research-articles-handoff.md`), **3,035 of 5,100 questions
(60%) ship zero "Further reading" articles.** This doc is about closing that gap for as many of them
as legitimately have one.

**Root cause, confirmed by inspecting `refs.json` directly:** of those 3,035, only **11** had zero
Europe PMC hits. The other **3,024** DID get candidates from Europe PMC (median 43 per question) —
the phase-1 audit rejected every single one as pedagogically wrong. This is **not** a missing-literature
problem, it's a **narrow-shortlist problem**: `match_articles.py` uses a keyword/heuristic scorer
(`score_hit` in that file) to pick just the **top 1–2** candidates *before* any LLM judgment is
applied, and only those 1–2 ever get audited. The right paper is often sitting at rank 5, 9, or 15 in
the pool the heuristic already fetched — it just never got shown to a judge.

## The fix: wide shortlist, one-shot judge

Instead of (heuristic picks top 1-2) → (LLM audits those 1-2), do:
(heuristic fetches full candidate pool, keeps top ~18 by score, no pre-filtering) → (LLM reads
stem+answer+explanation alongside all ~18 candidates at once and either picks the single best real
match with a why-sentence, or explicitly says none qualify).

This was piloted on 180 of the 3,024 gap questions and validated: **38 new matches (21.1% yield)** —
22 "relevant", 16 "weak" — with the judge explicitly declining a pick (`no_match`) on the other 142
rather than forcing a keyword-adjacent-but-wrong paper. Examples of what it caught that phase-1 missed:
Seeley et al. 2007 (the paper defining the salience network) matched to a dACC/salience-network
question; the RUPP Autism Network NEJM RCT matched to a pediatric-antipsychotic-for-aggression
question; the AJP paper laying out the DSM-5 evidence base for PMDD matched to a PMDD-timing question.

Projected to all 3,024 gap questions: **~640 new citations**, moving app-wide coverage from **~40%
(2,065/5,100) to ~53% (~2,700/5,100)**. 21% is lower than phase-1's overall 37% keep rate — expected,
since this is the *harder* residual left over after phase-1 already claimed the easy wins.

## Architecture (three steps, code already written and tested)

```
refs.json (3,024 gap ids: articles=[], n_candidates>0)
        │
        ▼
[1] scripts/research-articles/gap_rematch_pilot.py   -- WIDE candidate pool (top ~18, no pre-filter)
        │  writes reference/research-articles/<gap-dir>/batches/batch_NNNN.json
        ▼
[2] LLM judge (one subagent/call per batch, prompt template below)
        │  writes reference/research-articles/<gap-dir>/results/batch_NNNN.json
        ▼
[3] scripts/research-articles/apply_gap_matches.py   -- merge verdicts → refs.json → rebuild client
```

### Step 1 — wide candidate pool

`scripts/research-articles/gap_rematch_pilot.py` (despite the "pilot" name, it's fully general —
takes `--sample` and `--seed`). It imports the retrieval machinery from `match_articles.py`
(`clinical_focus`, `build_queries`, `epmc_search`, `score_hit`, journal-tier helpers) so query
construction and scoring stay identical to phase 1 — the only change is: **no early-stop, no
`passes_relevance_floor` pre-filter, keep top 18 by score instead of top 1-2.**

Key constants at the top of the file: `TOP_K = 18`, `EXPL_CHARS = 900`, `ABSTRACT_CHARS = 500`.

For a **full run on all 3,024 gap ids**, do NOT use `--sample` (that draws a random subsample) —
add a `--all-gap` flag (not yet implemented; trivial: skip the `rng.sample(...)` call and use
`gap_ids` directly) or just pass `--sample 3024` with a fixed `--seed` since `min(sample, len(gap_ids))`
already caps it at the full pool. Example:

```bash
python3 scripts/research-articles/gap_rematch_pilot.py \
  --sample 3024 --seed 0 --batch-size 15 --workers 12
```

This does fresh Europe PMC calls (no cache reuse — the existing `query_cache.json` is 577MB and
loading it isn't worth it; a 12-worker run stays under Europe PMC's shared rate limit and the full
3,024 batch build took the pilot's 180 questions ~2 minutes, so full scale is roughly **~35-40 min**
of network time). Output: one `batch_NNNN.json` per 15 questions under `<out-dir>/batches/` — **use a
new output dir for the full run**, e.g. `reference/research-articles/gap_full/`, not `gap_pilot/`
(edit `OUT_DIR` at the top of the script, or parameterize it — currently hardcoded to `gap_pilot`).
Each batch question record has: `id`, `stem`, `options`, `answer_letter`, `answer_text`,
`explanation` (truncated to 900 chars), `candidates` (up to 18, each with `pmid`, `pmcid`, `doi`,
`title`, `journal`, `journal_tier`, `year`, `pub_types`, `is_reviewish`, `cited_by`,
`is_open_access`, `abstract`, `score`).

3,024 questions / 15 per batch ≈ **202 batch files.**

### Step 2 — LLM judge

One call per batch file. This is the step that needs an actual LLM (not deterministic code). Run it
as ~15-20 parallel agent calls per wave (roughly 11-14 waves for 202 batches) rather than all 202 at
once — mirrors what worked before (`research-articles-handoff.md` notes chunks of ~50-60 agents per
run for the phase-1 audit). **Do not use workflow/agent scratch storage for per-batch persistence** —
write results straight to `<gap-dir>/results/batch_NNNN.json` on disk; the phase-1 doc hit a hard
64-file scratch quota doing this wrong the first time.

**Exact prompt template used for the pilot** (validated — reuse verbatim, only the batch file path
and `batch_index` change per call):

```
You are grading candidate research papers for a psychiatry board-exam question app (PRITE Daily). Read the batch file at:

<absolute path to gap-dir>/batches/batch_NNNN.json

It contains a list of `questions`, each with: id, stem, options, answer_letter, answer_text, explanation (the teaching explanation for the correct answer), and `candidates` (up to 18 real MEDLINE papers from Europe PMC, each with pmid, title, journal, journal_tier, year, pub_types, abstract, cited_by, score — sorted by a keyword-heuristic score, NOT by actual relevance).

## Background

These are "gap" questions: an earlier automated pipeline searched Europe PMC, picked its top 1-2 keyword-scored candidates per question, and an LLM audit rejected ALL of them as pedagogically wrong. The keyword scorer keeps finding papers that share vocabulary with the question but teach a DIFFERENT fact than what's actually being tested — e.g. an ADHD stimulant-efficacy paper attached to a question about ADHD comorbidity rates, or a lithium-battery-chemistry paper attached to a lithium-psoriasis side-effect question. Your job is to look past keyword overlap and judge actual pedagogical fit across the WIDER candidate pool (up to 18 options instead of just the top 1-2), since the right paper is often further down the keyword-ranked list than #1 or #2.

## Task

For EACH question, read the stem + answer + explanation to identify the SPECIFIC teaching point being tested (not just the general topic/disease). Then scan ALL its candidates and decide:

- Is there a candidate whose title+abstract actually supports THAT SPECIFIC fact (not just the same disease/drug family)?
- If yes: pick the single best one. Rate it "relevant" (directly and specifically supports the tested fact) or "weak" (same clinical area/stage but doesn't nail the precise point — still genuinely useful further reading, not a stretch). Write one clinical sentence explaining why it supports the teaching point, addressed to a resident.
- If no candidate genuinely teaches the point (even the top-scored ones are just same-topic keyword matches), mark the question "no_match": true. This is a legitimate, expected outcome — many questions test pure DSM-5 criteria, dosing conventions, or textbook facts with no single supporting paper. DO NOT force a weak pick just to fill a slot. Precision matters far more than coverage here; a wrong "further reading" link actively misleads a resident studying for boards.

Deprioritize (don't reject automatically, but be skeptical of) journal_tier "demote" candidates (Frontiers/MDPI/Cureus/Hindawi-style low-signal venues) — pass them only if genuinely and specifically on point and nothing better qualifies.

Never invent a pmid, title, or fact — only choose among the candidates given, and never make up details about a paper beyond its provided title/abstract.

## Output

Write your verdicts as JSON to:

<absolute path to gap-dir>/results/batch_NNNN.json

Format:
{
  "batch_index": N,
  "verdicts": [
    {
      "id": "2013-45",
      "no_match": false,
      "pmid": "12345678",
      "rating": "relevant",
      "relevance_sentence": "One clinical sentence tying the paper directly to the specific tested fact."
    },
    {
      "id": "2013-46",
      "no_match": true
    }
  ]
}

Include exactly one verdict object per question in the batch, in the same order. After writing the file, report back a one-line summary: how many matched (relevant/weak split) vs no_match, out of 15.
```

**Do not trust each call's self-reported narrative tally** — several pilot runs made arithmetic
mistakes in their own summary text (e.g. said "6 matched" while listing 7 items) even though the
underlying JSON they wrote was correct. Always recompute totals by reading the actual result JSON
files, never by summing the agents' prose summaries.

### Step 3 — merge

`scripts/research-articles/apply_gap_matches.py --gap-dir <gap-dir>` (already written and tested —
dry-run on the pilot's 180 questions applied all 38 matches cleanly with zero errors):

- Reads every `<gap-dir>/batches/batch_*.json` (for full candidate metadata) and every
  `<gap-dir>/results/batch_*.json` (for verdicts).
- For every verdict with `no_match: false`, looks up the candidate by `pmid`, builds a full article
  record in the same schema `match_articles.py` produces (pmid/pmcid/doi/title/journal/journal_tier/
  year/pub_types/cited_by/is_open_access/urls/etc.), and sets `refs[id]["articles"] = [record]`.
- **Never overwrites an id that already has articles** — only touches ids currently at `articles: []`,
  so it's safe to run against the full `refs.json` without disturbing phase-1's shipped citations.
- `--dry-run` to preview counts without writing. `--no-weak` to ship relevant-only if you want a
  higher bar. Tags each written record `"source": "gap_rematch"` and `"audit_rating"` so these are
  distinguishable later from phase-1 citations if needed.
- On a real (non-dry-run) call it backs up `refs.json` to
  `reference/research-articles/refs.pre_gap_rematch_backup.json` (once, first run only) and calls
  `build_client_bundle.py` automatically.

After that, deploy same as phase 1:

```bash
npm run build && npx wrangler@3 pages deploy dist --project-name=prite-daily --branch main --commit-dirty=true
```

## Do / don't (same lessons as phase 1, still apply)

**Do**
- Keep the wide pool at ~18 candidates — big enough that the right paper (often rank 5-15) is visible,
  small enough to fit comfortably in one judge call's context.
- Let `no_match` be the majority outcome. In the pilot it was 142/180 (79%) — that's correct, not a
  failure. Many exam questions test pure definitions/DSM criteria/dosing conventions with no natural
  paper hook.
- Run judge calls in waves of ~15-20 parallel, not all ~202 at once.
- Verify final counts from the JSON files, not from agent self-reports.

**Don't**
- Don't lower the bar to force higher coverage — that's exactly what produced the original 60% gap
  (a scorer picking topically-adjacent-but-wrong papers). The whole point of this phase is precision
  at a wider net, not more papers per se.
- Don't reuse `--sample` with a small N expecting it to mean "the full gap set" — it draws a random
  subsample; for the full run pass `--sample` >= the actual gap pool size (currently 3,024) or add
  the trivial `--all-gap` flag described above.
- Don't touch `query_cache.json` (577MB) — this pipeline intentionally does fresh EPMC calls instead.
- Don't run `apply_gap_matches.py` without `--dry-run` first on a new gap-dir to sanity check counts.

## One-paragraph summary for whoever picks this up

Phase 1 shipped citations for 40% of PRITE Daily's questions by scoring Europe PMC candidates with a
keyword heuristic, keeping only the top 1-2, and LLM-auditing those. The other 60% mostly weren't
missing literature — the heuristic's top-1-2 picks were just wrong, and the real match (when one
exists) was sitting further down a pool of ~43 candidates that no LLM ever looked at. The fix, piloted
and validated on 180 questions (21.1% yield, 38 new matches, zero forced weak picks), is to keep the
same retrieval but widen the pool an LLM judges from 2 candidates to ~18, in one shot per question,
with the same "no_match is fine, precision beats coverage" discipline phase 1 already proved out. Code
for all three steps (`gap_rematch_pilot.py`, the judge prompt template above, `apply_gap_matches.py`)
is written and tested end-to-end on the pilot; scaling to the remaining ~2,844 un-piloted gap questions
(3,024 total minus the 180 already done) is purely a matter of running steps 1-3 at full size.
