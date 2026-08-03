---
name: kaplan-sadock-citations
description: Link every PRITE Daily question to a real, verified supporting passage (with page screenshot) from Kaplan & Sadock's Comprehensive Textbook of Psychiatry, 10th ed. Use when asked to continue, resume, scale up, or debug the K&S citation pipeline, or to add textbook citations to PRITE questions.
---

# Kaplan & Sadock citation pipeline

For every question in the PRITE question bank, find a real, verified passage from Kaplan & Sadock's
Comprehensive Textbook of Psychiatry (10th ed.) that supports the correct answer — quote it exactly,
locate the PDF page, and screenshot it. Feeds a `kaplan_sadock_refs` field per question so residents
studying in the app can see "here's where this comes from in the book."

## Status as of 2026-07-28 (check current state before assuming this is stale)

- **Design validated** across 7+ pilot rounds on progressively larger samples (30 → 30 repeated
  4 ways → 300 → 300+retry → paused mid-3,600). See "Validated numbers" below — don't re-litigate
  model/approach choices already settled here without a reason.
- **300-question run: DONE, verified, AND retry-pass applied.** 241/300 (80%) questions have a
  verified citation, 169/300 (56%) rigorously STRONG. This is the final number for this scale — the
  retry pass (`scripts/retry_pipeline.workflow.js`) already ran on it and improved it from a pre-retry
  231/300 (77%) / 164/300 (55%). `reference/s300_final_verified.json` (post-retry, final) vs
  `reference/s300_verified_final.json` (pre-retry — kept for comparison, not the current baseline).
- **Full 3,600-question run: COMPLETE.** Survived two usage-limit interruptions with zero work lost
  (disk-based resume via `prep_run.py` — see "Resuming the full run"). Retry pass applied.
- **Shipped set = strong citations only** (user's call: "i would only ship the strong ones").
  `reference/kaplan_sadock_refs_SHIP.json` — **1,632 questions, 1,959 verified citations**, every one
  exact-substring-checked against the PDF.
  ⚠️ **1,632 is the self-rated STRONG count.** Blind adversarial audit put self-ratings ~1.6x inflated,
  so the audit-adjusted "genuinely strong" figure is roughly **1,037 (~29% of the bank)**. Quote the
  29% number to the user, not the 45% — they have already caught this once.
- **The retry pass is proven at 300-question scale, not just 30** — run it as a standard final
  step for any future run at any scale, it's cheap (~1.16M tokens for 73 failures at 300-question
  scale) and reliably improves numbers.
- **Hosting: DONE — private Cloudflare R2 + gated Worker.** See "Hosting the screenshots" below.
  Supabase Storage was evaluated and **rejected**; `supabase/migrations/0058_textbook_excerpts.sql`
  is now **moot — do not apply it.**
- **App UI: BUILT AND DEPLOYED** — a "Textbook" tab on the question view, live on pritedaily.com
  as of 2026-07-28 (Pages deployment `3a85efe9`). See "The app UI" below.

To check current state yourself (don't trust the paragraph above blindly):
```bash
ls reference/full_batch_*.json | wc -l   # should be 360 if BM25 candidates are still built
cat reference/s300_verified_final.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'{sum(1 for r in d if any(c.get(\"status\")==\"OK\" for c in r[\"citations\"])) }/{len(d)} verified')"
```

## Architecture (why it's built this way — read before changing it)

Three stages, in order of cost (cheapest first):

1. **BM25 keyword retrieval** (`scripts/build_candidates.py`, pure Python, `rank_bm25`, **zero LLM
   cost**) — the whole book is pre-chunked into ~18,500 paragraph-level passages
   (`reference/book_chunks.json`). For each question, BM25 ranks the top-10 most relevant passages by
   keyword overlap with `stem + answer_text + tags`. This replaced an earlier design that used an LLM
   to guess which of 283 *chapter titles* was relevant — that approach missed facts that live in
   subsections whose titles don't match the surface topic (e.g. Assertive Community Treatment RCT
   data lives under "12.15 Recovery in Schizophrenia," not anything about ACT). BM25 against
   paragraph-level chunks finds these directly and for free.

2. **Haiku extraction with mandatory self-rating** — given the 10 BM25 candidates, Haiku extracts a
   verbatim quote and self-rates STRONG (discriminates the correct answer from the specific
   distractors) / WEAK (real but doesn't discriminate) / NONE (nothing qualifies). Sonnet was tried
   for this step and wasn't meaningfully better — Haiku matched Sonnet's picks on 3/7 test cases and
   was plausible on the rest (see pilot history if you want the receipts). **Do not add Sonnet back
   into this pipeline without a specific reason** — it roughly triples cost for no measured quality
   gain at the extraction step.

3. **Fallback for BM25 misses (~13-15% of questions)**: a *second* Haiku call does old-style
   chapter-title triage (primary + backup section) for whatever BM25's top-10 didn't resolve, then a
   third Haiku call re-checks those specific sections with the same self-rating discipline. This
   recovers real content BM25's single query missed — confirmed via an independent audit that showed
   most of BM25's "no match" verdicts were retrieval failures, not genuine textbook gaps (the same
   question often succeeded via chapter-title triage instead).

All of this runs as a **Workflow script** (`scripts/run_pipeline.workflow.js`) using `schema`-forced
structured output — earlier manual (non-Workflow) attempts at the same design kept losing agents'
output to markdown-code-block parsing failures, agents writing to scratchpad files instead of
returning text, and one case of an agent truncating a batch's output partway through. Forcing a JSON
schema via the Workflow tool's `agent(..., {schema})` eliminates all of that.

**Verification is a separate, deterministic, non-negotiable step** (`scripts/verify_citations.py`) —
it never runs inside the Workflow (no filesystem access there) and never trusts an agent's own STRONG
rating as proof of anything. See "Known failure modes" below for why this matters — a real fabrication
was caught this way.

## Validated numbers (don't re-run pilots to rediscover these)

| Run | Scale | Model(s) | Any verified citation | Rigorous STRONG | Cost/question |
|---|---|---|---|---|---|
| Original (per-question, no batching) | 30 | Sonnet | 87%* | 87%* | ~38.7k tok |
| Hybrid + retry pass | 30 | Sonnet triage + Haiku extract | 73% | — | ~99k tok |
| BM25 + Haiku, no retry | 30 | Haiku only | 57% | — | ~9.9k tok (extraction only) |
| **BM25 + Haiku + fallback + retry (tightened bar)** | 30 | **Haiku only** | **83%** | **53%** | ~52.8k tok |
| BM25 + Haiku + fallback, no retry | 300 | Haiku only | 77% | 55% | ~20.7k tok |
| **BM25 + Haiku + fallback + retry (production design, final)** | **300** | **Haiku only** | **80%** | **56%** | **~24.6k tok** |

\* The very first pilot's 87% number was **self-reported and never independently audited** — a later
adversarial audit of a sample of its "verified" citations found only ~45% were actually STRONG
(logically sufficient on their own), ~40% WEAK, ~15% didn't really support the answer. **This is why
every number after that row went through deterministic exact-substring verification, not
self-report.** Treat any future pilot's raw self-rated numbers the same way — audit a sample before
trusting them.

The retry pass's lift at 300-question scale (77%→80% any-verified) was smaller than at 30-question
scale (73%→83%) — expected, since 300 has proportionally fewer failures to begin with. Still a clear
net positive for ~1.16M extra tokens (73 failures retried), and worth keeping as a standard final step.

Extrapolated full-3,600-question cost at the 300-question run's measured rate (including retry): **~88M
tokens, 100% Haiku, no Sonnet** (real topic clustering + schema-forced output brought this down
substantially from an earlier, more pessimistic ~185M estimate based on a small, deliberately-diverse
30-question sample that under-represented real clustering).

## ⚠️ "Page numbers" — read before promising them to anyone

The source PDF is a **reflowed ebook conversion with NO printed page numbers anywhere** — verified:
0 of 40 randomly sampled pages carry a bare page number, and the markdown has no page markers. Its
12,754 PDF pages do not correspond to the printed book's ~5,000 pages.

`pdf_page` in the output is therefore **an index into this PDF file only** — NOT a citable textbook
page. Never render it as "Kaplan & Sadock p. 2563"; a resident checking their own copy would land
somewhere unrelated.

Show users instead:
- **The section as the citable locator** — e.g. "§7.4 Clinical Neuropsychology and Intellectual
  Assessment of Adults". Stable and findable in any copy.
- **The verbatim quote** — the actual evidence.
- **The page screenshot** — the strongest artifact; real book text regardless of numbering. Keep
  `pdf_page` internally as the pointer that renders it, labelled "view source page", not as a citation.

Real printed page numbers would require a different, print-faithful copy of the book.

## Key files

**Reference corpus (durable, keep):**
- `reference/kaplan-sadock-10e.pdf`, `reference/kaplan-sadock-10e.md` — the source book (PDF for
  screenshots, MD for text search/extraction).
- `reference/results/` — per-batch pipeline output written incrementally by the agents
  (`stage1_NNNN.json`, `fallback_NNNN.json`). **This is the durable copy** — it survives an
  interrupted multi-hour run and is what `prep_run.py`/`assemble_results.py` read. Do not delete
  mid-run.
- `reference/section_index_full.json` — 283 detected sections (`num`, `title`, `md_line_start/end`,
  `pdf_page_start/end`). **Known gap**: some chapters use a different, unnumbered heading style
  (`## Title` instead of `### ▲ N.N Title`) and aren't in this index — confirmed examples: Tourette/tic
  disorders, disruptive behavior disorders, the book's Glossary. `reference/book_chunks.json`'s BM25
  index still covers this content (chunking doesn't depend on the 283-section index), but the
  chapter-title triage fallback can't route to these chapters by name. Fixing the heading-detection
  regex to also catch `## Title` would close this gap — not yet done.
- `reference/book_chunks.json` — ~18,500 paragraph-level chunks for BM25 (from
  `scripts/build_book_chunks.py`).
- `reference/all3600_slim.json` — id/stem/options/answer for all 3,600 questions (from
  `scripts/build_candidates.py`), what the workflow's triage/fallback agents read.
- `reference/full_batch_0000.json`..`full_batch_0359.json` — pre-built BM25 top-10 candidates, 10
  questions/file, 360 files covering all 3,600. **Already built — don't regenerate unless the question
  bank or book_chunks.json changed** (regenerating takes ~20-25 min, `rank_bm25` isn't vectorized).
- `extraction/output/questions_all.json` — the actual full question bank (3,600 questions). No
  top-level `id` field — synthesize as `f"{year}-{q_index}"`.
- `supabase/migrations/0058_textbook_excerpts.sql` — draft migration for storing citations. **Not
  applied to the live DB.** Review before running.

**Pilot/scratch files (reference/pilot_*, stage2*, repilot_*, bm25_batch_*, s300_batch_*, screenshots_v2
etc.) — these are experiment debris from validating the design. Safe to delete if you want a clean
`reference/` dir; nothing production-relevant depends on them.** The one exception:
`reference/s300_verified_final.json` + `reference/sample300_questions.json` are the real 300-question
validated result — keep those as a reference baseline.

**Scripts (this skill's, durable):**
- `scripts/build_book_chunks.py` — one-time book chunking (already run).
- `scripts/build_candidates.py` — BM25 candidate generation for all 3,600 (already run; ~20-25 min,
  run in background with progress logging, see the script's own docstring).
- `scripts/run_pipeline.workflow.js` — the main 3-phase Workflow (BM25 extraction → fallback triage →
  fallback extraction).
- `scripts/retry_pipeline.workflow.js` — recovers `QUOTE_NOT_FOUND` failures. Validated at 30-question
  scale, **not yet run at 300 or 3,600 scale**.
- `scripts/verify_citations.py` — deterministic verify + screenshot render. Run this on every
  workflow's output before trusting any number from it.
- `scripts/merge_workflow_output.py` — flattens a workflow's `{stage1_direct, fallback, not_in_book}`
  result into verify_citations.py's input shape.

## Hardening applied 2026-07-25 (before the full run) — don't regress these

1. **Fail-safe args.** `args` does NOT reliably arrive as a JS array. The old script defaulted to
   "process all 360 batches" when args looked wrong — and that fired: an `args: [0,1]` smoke test
   silently launched the entire multi-hour paid run (caught and killed after 9 batches). The script
   now ABORTS on a missing/unparseable batch list and requires the literal string `"ALL"` to run
   everything. **Never reintroduce a permissive default here** — an arg glitch must never escalate
   into hours of paid compute.
2. **Retry instead of silent drop.** Transient safety-classifier errors killed 3/30 batches (10%) on
   the first 300-run, and `filter(Boolean)` discarded them — 49 questions vanished, found only by
   hand-diffing ids. `agentRetry()` now retries 3x and any batch that still fails is reported in
   `failed_batches` and logged loudly.
3. **Incremental disk persistence.** Every extraction agent writes its batch result to
   `reference/results/` before returning. Combined with `prep_run.py` this gives true
   **cross-session** resume (Workflow's own `resumeFromRunId` cache is same-session only, useless for
   a job you resume tomorrow).
4. **NONE-rate calibration (important, and easy to get wrong).** The first hardened prompt said a
   truthful NONE "routes the question to a smarter fallback stage" — that put a thumb on the scale and
   drove stage-1 NONE from 13% to **52%**, which would have pushed 4x more questions into the
   expensive fallback stage. Rewording to make explicit that **WEAK is the correct rating for the
   uncertain middle**, and NONE only for "candidates don't cover this topic at all", brought it to
   **20%** (measured on batches 9-10). 20% is the intended landing spot: modestly stricter than the
   old 13%, which the adversarial audit showed was inflated. **If you edit the rating rubric, re-measure
   the stage-1 NONE rate on 2 batches before running at scale** — it directly drives total cost.
5. **section_num validation.** Agents have invented section numbers (`"18"`, `"4.5"` seen in the
   300-run). `assemble_results.py` checks every section_num against the index and nulls unconfirmable
   attributions (keeping the quote, which the verifier locates by whole-book search).

**Still unresolved / measure during the run:** distractor-explaining citations. The user explicitly
asked for these ("a couple more excerpts... if it helps explain a significant distractor"). The
300-run produced them for only 5/300 questions (2%). The reworked prompt makes them a numbered
requirement; batches 0-8 showed 7% but batches 9-10 showed 0/20 — **too small a sample to conclude
anything**. Measure distractor coverage on the real run's first ~50 batches; if still under ~10%,
strengthen rule 2 in `QUALITY_RULES` further.

## Resuming the full run

**Ignore `resumeFromRunId` entirely for this pipeline** — it's same-session-only and superseded by the
disk-based resume below, which works across sessions and restarts.

1. Check `reference/full_batch_*.json` still has 360 files (candidates don't expire, but confirm
   nothing deleted them).
2. Ask what's left, then launch exactly that:
   ```bash
   python3 .claude/skills/kaplan-sadock-citations/scripts/prep_run.py --summary   # human-readable
   python3 .claude/skills/kaplan-sadock-citations/scripts/prep_run.py             # JSON array of indices
   ```
   Pass that array as `args`:
   ```
   Workflow({scriptPath: "<skill>/scripts/run_pipeline.workflow.js", args: [<indices from prep_run>]})
   ```
   Launching with **no args aborts by design** (see Hardening #1) — that is the fail-safe, not a bug.
   `args: "ALL"` forces every batch. Re-running is always safe: completed batches are already on disk
   and `prep_run.py` excludes them, so an interrupted run resumes without re-paying for finished work.
3. **This is a multi-hour job at full 3,600 scale.** The 300-question version took ~20-25 min per
   attempt; 3,600 is 12x that in raw batch count (360 Stage-1 batches alone), plus fallback stages on
   top. Tell the user to expect hours, not minutes, and confirm they're not worried about credit usage
   before launching (they paused it once already for exactly this reason).
4. **Expect transient safety-classifier errors** — 3 of 30 batches hit them on the first 300-run.
   `agentRetry()` now absorbs most; any that survive 3 attempts are listed in the result's
   `failed_batches` and logged. Just re-run `prep_run.py` + relaunch to sweep them up.
5. When it completes, assemble **from disk** (the durable copy) and verify:
   ```bash
   python3 <skill>/scripts/assemble_results.py reference/full_merged_raw.json
   python3 <skill>/scripts/verify_citations.py reference/full_merged_raw.json full
   ```
   `assemble_results.py` also reports questions missing entirely and bogus section_nums — read that
   output, don't skip it. Optionally add `--workflow-result <file>` to fold in the workflow's returned
   JSON as a second source (parse that file with `python3 -c`, not `Read` — it's >256KB).
   **Never report numbers from the workflow's own self-rated output — always verify first.**
   (`merge_workflow_output.py` is the older return-value-only merger, superseded by
   `assemble_results.py`; kept only for reading old runs.)
6. Before calling the run "final," build a `retry_input.json` from every `QUOTE_NOT_FOUND` citation and
   run `retry_pipeline.workflow.js` on it, then re-verify. This step is proven to meaningfully improve
   the numbers and hasn't been skipped in any run where it mattered.

## Known failure modes (hard-won — don't rediscover these the slow way)

- **Self-rated "STRONG" is not proof.** An independent adversarial audit of the first pilot's
  citations found the true STRONG-rate was roughly half the self-reported number. Always run
  `verify_citations.py`'s exact-substring check; never ship a number based on an agent's own rating.
- **A confirmed fabrication got past self-rating**: an agent copied the real first half of a sentence
  verbatim, then invented a plausible-sounding second half that wasn't in the book at all. Only the
  exact-substring check caught it. This is exactly why verification is a separate, deterministic step
  and not something folded into the extraction agent's own judgment.
- **Adding distractor-option text to the BM25 query hurt recall** — tried once, it diluted queries
  with generic terms and a previously-findable question (myotonic dystrophy/ECG) dropped out of the
  top-10 as a result. Query is `stem + answer_text + tags` only.
- **PDF page-location false negatives are common and usually fixable for free.** PyMuPDF's
  `page.get_text()` often doesn't preserve table formatting or handle hyphenated/italicized runs the
  same way the markdown source does. A quote that's a confirmed real substring of the book but
  "PAGE_NOT_LOCATED" within its claimed section's page range is very often findable with a full-book
  scan (no LLM cost, just slower — cache all page texts in memory once rather than re-extracting per
  quote, or it's needlessly slow at scale).
- **Agents sometimes silently drop items from a batch's output** even when told to cover every item
  and even with schema forcing (one instance: 5 items in, 4 items out, no error). `merge_workflow_output.py`
  detects and flags this by diffing against the full id set — don't assume a workflow's output is
  complete just because it didn't error.
- **BM25's "no match" is usually a retrieval failure, not a real gap.** An audit of 10 BM25 "no match"
  verdicts found 9 were squarely mainstream psychiatric content that a different retrieval attempt
  (chapter-title triage) found successfully — hence the fallback stage.
- **A handful of questions are genuine textbook gaps**, confirmed across 5+ independent pipeline
  attempts each: pure neurology/radiology imaging-interpretation questions (a CT-scan appearance
  question, a spinal-cord-compression-imaging question), a question depending on an MRI image that
  isn't in the extracted data, and a schizophrenia/rheumatoid-arthritis comorbidity claim never stated
  anywhere in this textbook. Don't burn more retry cycles on these specific patterns — a comprehensive
  psychiatry textbook genuinely doesn't cover radiology-image-interpretation detail.
- **`rank_bm25`'s `get_scores` is not vectorized** — scoring 3,600 queries against ~18,500 chunks takes
  ~20-25 minutes of wall-clock, single-threaded. Run it in the background with progress logging rather
  than expecting it to return quickly; a naive foreground call will hit tool timeouts.

## Hosting the screenshots (built 2026-07-28)

**These are ~1,800 pages of a copyrighted textbook. The bucket must stay private.** That constraint
drove every choice here — the user stated it explicitly ("i need it private").

- **Bucket**: `textbook-excerpts` on Cloudflare R2 — private, **no `r2.dev` public URL enabled**.
  Do not enable one. 10 GB free tier; the shipped set is 614 MB (~6%), and R2 has no egress fees,
  which is why it beat Supabase Storage (1 GB free on the free plan — the set would not have fit).
- **Images shipped = full colour, 150 DPI.**
  **Don't blanket-grayscale**: ~11% of cited pages carry *informative* colour (Color Atlas figures
  with red anatomical outlines over MRI) — grayscaling those destroys the content.
  ⚠️ **The local screenshot directories are gone as of 2026-08-03** — `screenshots_SHIP` (958 MB),
  `screenshots_R2` (227 MB) and ~1.8 GB of pilot-round dirs were deleted to reclaim 3 GB on a
  98%-full disk. Every one of them is derived data, reproducible from `reference/kaplan-sadock-10e.pdf`
  with `pdftoppm -png -r 150`; the live images are in R2. `reference/screenshots/` stays — it's the
  output dir `verify_citations.py` writes to. Don't restage GBs of renders: `render_and_upload_pages.py`
  renders run-by-run and deletes as it goes.
- **Access path**: `workers/textbook-images/` — a Worker that is the *only* way into the bucket.
  Live at `https://textbook-images.correllsoftware.workers.dev/textbook/<file>.png`.
  It requires `Authorization: Bearer <supabase access_token>`, validates it by calling Supabase's
  `/auth/v1/user` (no local JWT-secret handling, honours revocation/expiry for free), rejects any key
  that isn't `^[A-Za-z0-9._-]+\.png$` (blocks traversal and listing), and sets
  `Cache-Control: private, max-age=86400` so no shared cache ever holds a page.
- `SUPABASE_ANON_KEY` is a Worker **secret**, not a var. Re-set it with
  `npx wrangler@3 secret put SUPABASE_ANON_KEY` if the Worker is ever recreated.

Verified deny paths (2026-07-28): no auth → 401, bad token → 401, `../../etc/passwd` → 404,
root listing → 404.

### Uploading (the gotchas cost hours — don't rediscover them)

Run `workers/textbook-images/upload.sh`. It is safe to re-run: `r2 object put` overwrites, so an
interrupted upload just needs another pass.

- **`wrangler login` must include the `r2` scope.** The repo's existing token did not, and the failure
  is a confusing permissions error, not a clear "missing scope".
- **R2 must be enabled on the account** in the Cloudflare dashboard first, or puts fail with `code: 10042`.
- **The API intermittently returns a bare `521`** on object put. It is transient and an immediate retry
  succeeds — but without the retry loop a 1,800-object run drops files *silently*. That's what
  `put_one.sh` exists for.
- **macOS `xargs -I` caps the replacement command at 255 bytes**, so the retry loop cannot live inline
  in the `xargs` invocation ("command line cannot be assembled, too long"). That is the whole reason
  `put_one.sh` is a separate file, and why `upload.sh` `cd`s into the image dir and passes bare
  filenames rather than absolute paths. Don't "simplify" this back into one script.
- **Don't background the upload with `nohup ... &`** — it dies silently, printing only the header line.
  Use the harness's own background-task runner (or just run it in the foreground).
- Each `npx wrangler` spawn costs ~2s, so serial upload of 1,800 objects takes ~1 hour;
  `PARALLEL=6` (the default) brings it to ~10 min. `PARALLEL=1` to serialise.
- **wrangler v3 has no `r2 object list`** — only get/put/delete. There is no CLI way to count objects
  in the bucket; use the Cloudflare dashboard if you need a hard count. Verify by sampling instead
  (`r2 object get` + compare byte size to the local file).
- If you write a parallel verification script, **give `mktemp` a long template** (`mktemp -t "v_$$_XXXXXXXXXX"`).
  A short one collides across workers and produces phantom "MISMATCH remote=<empty>" results that
  look like upload corruption but aren't.

**Upload completed 2026-07-28**: 1,824 objects, `xargs` exit 0 across every invocation, 0 FAILED
lines, 35 objects spot-checked byte-exact against local (including first and last alphabetically).

## Readable page windows (built 2026-08-03) — the pager

The panel originally showed exactly one page: the one the quote sits on. That proves the quote is
real but you can't *read* the passage — its first half is on the previous page. The panel now pages
through **±5 pages around every citation**, clamped to the section.

**Controls (revised after Andrew's feedback that the affordance wasn't obvious):** big 46px round
arrows floating over the page's own left/right margins, plus ← → keys and a clickable dot strip.
Below 480px of panel width the arrows drop into the footer — the A4 render's margins scale with the
image while a fixed 46px button does not, so on a phone the overlay lands on the body text and hides
several words. The arrows' onClick must `stopPropagation()`: the page is also a click-to-zoom target,
so without it every page turn opens the lightbox too.

**Objects are keyed by PDF page now, not by question.** Old: `2014-2_11.3_p3321.png` — the same page
stored once per citation landing on it (2,777 objects for 1,764 distinct pages). New: `ks-03321.png`,
zero-padded to 5 digits to match pdftoppm's own naming for a 12,754-page document. Page keys
deduplicate, and — the real point — make a neighbouring page addressable by arithmetic.

- `scripts/build_page_windows.py` → `reference/kaplan_page_windows.json` + `pages_to_render.txt`.
- `scripts/render_and_upload_pages.py` → renders (150 DPI, matching the original set) and uploads.
  Renders run-by-run and deletes as it goes, so peak local disk is a few MB rather than ~3.6 GB.
  Resumable via `reference/uploaded_pages.txt`; safe to interrupt. 8,143 pages, ~87 pages/min.
- Then `scripts/build_refs_bundle.py`, then upload `reference/kaplan_refs_bundle.json` as `refs.json`.

**Clamping to the section is the "clean break".** `reference/section_index_full.json` gives 283
sections with pdf page spans; the window stops at the section edge and the bundle sets `atStart` /
`atEnd` so the panel can say "End of §11.3 Stimulant-Related Disorders" rather than silently running
out. 2,964 of 3,148 citations clamp cleanly; the other 184 sit on a page *outside* their recorded
section span (section attribution and page pointer come from different pipeline stages and sometimes
disagree), so for those the clamp is skipped and a plain ±5 window is used. Don't "fix" that by
trusting the span — it would point readers at the wrong section.

### ⚠️ kaplan_sadock_refs_SHIP.json is NOT what shipped

Despite the name. It holds 1,632 questions / 1,959 citations; the **deployed `refs.json` holds 2,697
/ 3,148**. Nothing in `reference/` reproduces the broader shipped set. Building windows or a bundle
from SHIP.json therefore silently drops ~1,065 live questions — which is exactly what happened on the
first pass here, caught only by comparing against the deployed artifact.

**The deployed bundle is the source of truth.** Pull it down before regenerating anything:

```bash
npx wrangler@3 r2 object get textbook-excerpts/refs.json --file reference/kaplan_refs_bundle.LIVE.json
```

`build_refs_bundle.py` now *augments* that snapshot and hard-refuses to write a bundle with fewer
questions or citations than the live one.

### Verifying the panel without a login

The panel needs a Supabase session and the private Worker, so it can't be exercised offline — which
makes it tempting to ship it unverified. It isn't: stub the one auth module and serve pages from
disk. A throwaway harness (built and deleted 2026-08-03) that renders the *real* `kaplanPanel.tsx`:

- `vite.ksh.config.ts` — a plugin whose `load(id)` intercepts any id containing `/src/lib/supabase.`
  and returns a stub exporting `supabase.auth.getSession()` → `{data:{session:{access_token:"x"}}}`.
  Intercepting the module by resolved id is reliable; aliasing the relative `./supabase` specifier is
  not.
- `ks-harness.html` + `ks-harness/main.tsx` — monkeypatches `window.fetch` to rewrite
  `/textbook/ks-NNNNN.png` to a local directory, then renders `<KaplanPanel>` with real citation data.
  Vite only builds `index.html`, so a root-level extra HTML entry never leaks into `dist/`.
  Give it a `?w=` param that sets the wrapper's max-width, and render at that width **on mount** —
  see the next paragraph for why resizing after the fact doesn't work.

⚠️ **The preview pane's browser fires neither ResizeObserver callbacks nor viewport resizes.** RO
callbacks are tied to frame production, and `resize_window` leaves `clientWidth` unchanged. A
responsive layout built on RO therefore looks permanently stuck in its wide branch and reports no
error — that cost a debugging detour here. `PageWindow` measures on mount plus a `window` resize
listener instead, which a headless browser can actually exercise if the width is set before mount.

That's how the pager's edge cases were checked (boundary labels, singular/plural, clamping, one fetch
per page, 343px phone layout) before anything went live.

### Rolling it out without a broken window (COMPLETE — recorded for the next shape change)

`refs.json` is shared by every client, so a shape swap breaks whichever side deploys second: a new
bundle starves old browsers of `image`, an old bundle starves new browsers of `page`. The bundle
therefore carried **both** through the rollout. Order used: upload page images → upload refs.json
(both fields) → deploy the site → drop `image` → delete the old objects.

**Both cleanup steps ran 2026-08-03.** `refs.json` no longer carries `image`, and all 2,777 old
per-question objects are deleted from R2 (`scripts/delete_old_per_question_objects.py`, with the
deleted keys logged to `reference/old_objects_deleted.txt`). The bucket now holds only `ks-NNNNN.png`
page keys plus `refs.json`. Deleting the objects before dropping the field would have blanked page
images for any tab that hadn't reloaded — do it in this order next time.

⚠️ **R2 rate-limits deletes hard, and wrangler's error doesn't say so.** At 12-way parallelism it
returned `429 … consider throttling your request speed`, surfaced only as "a bug, please open an
issue" on stderr — the real message is in `~/.wrangler/logs/`. Worse, the first version of the delete
script retried three times with *no* pause, so all three attempts hit the same limit and 109 of 2,777
objects were dropped. Fixed with exponential backoff plus jitter and a default of 4 jobs. Uploads
tolerated 10-12 jobs fine; **deletes do not** — don't copy the upload script's concurrency here.

## The app UI (built 2026-07-28)

A **"Textbook" tab** on the question view, between Explanation and In practice. It only appears for
questions that actually have a citation (~45%) — no empty state on the other half.

- `src/lib/kaplanRefs.ts` — loads the index, and fetches images.
- `src/lib/kaplanPanel.tsx` — the panel: section heading, each quote as a pull-quote with a
  "Supports the answer" / "Context" badge, the extractor's note, and the page screenshot
  (click-to-enlarge through the app's existing `zoomImg` lightbox).
- `src/App.tsx` — `kaplanRefs` state, a load effect next to the question-bank one, the tab entry,
  and the panel render.

Three things that will bite you if you change this:

1. **Images cannot be `<img src={url}>`.** The bucket is private, so every request needs an
   `Authorization` header, which an `img` tag can't send. `kaplanImage()` fetches the blob and
   returns an object URL instead. If you "simplify" it back to a plain src, every image 401s.
2. **Never render a page number.** See the ⚠️ section above. The bundle *does* now carry `page`/
   `lo`/`hi` — the pager can't address neighbouring images without them — so the rule moved from
   "the data can't leak it" to "the UI must not print it". The pager says "2 pages before the quoted
   passage", never a figure. Keep it that way.
3. **The citation index is gated too**, not just the images — the quotes are verbatim excerpts of the
   same copyrighted book. It's served from the Worker at `/refs.json`, not bundled into the app.
4. **Never hand-set `Content-Encoding` on a Worker response.** `refs.json` was first stored
   pre-gzipped as `refs.json.gz` with `Content-Encoding: gzip`. That works through a plain local HTTP
   server but **breaks in production**: Cloudflare does not pass the header through, so the browser
   received raw gzip bytes and `res.json()` threw `Unexpected token '\x1f'`. The object is now stored
   **uncompressed**; the edge compresses it in transit for the same ~3x saving. `test.mjs` asserts
   `Content-Encoding` is absent so this can't regress.

**Debugging lesson from that bug:** the failure was invisible for three rounds because the load error
was swallowed (`.catch(() => {})`), making "citations broken" look identical to "this question has no
citation". The error is now surfaced in the study-set filter and logged as `[kaplan]`. Keep it that
way — an optional feature should degrade quietly for users, but never silently for whoever debugs it.

**Testing lesson:** the local stand-in (a Python HTTP server) did not reproduce Cloudflare's header
handling, so the end-to-end test passed against a mock while production was broken. A mock proves the
app logic, not the edge's behaviour — anything encoding-related has to be checked against the real
Worker.

`VITE_TEXTBOOK_BASE` overrides the Worker origin; it defaults to the deployed workers.dev URL, so
the tab works with no env change. Rebuild the bundle with
`.claude/skills/kaplan-sadock-citations/scripts/build_refs_bundle.py`, then
`gzip -9` it and `r2 object put` it as `refs.json.gz`.

## How this was verified (2026-07-28) — don't redo this from scratch

The awkward part: the **allow path can't be tested against production**, because it needs a real
Supabase `access_token` and there's no way to mint one without signing in as a user. So it's covered
two other ways:

1. **`workers/textbook-images/test.mjs` (19 tests, `npm test` in that dir).** Runs the Worker's real
   `fetch` handler against a stubbed Supabase and a stubbed R2 bucket, so the 200 branch is exercised
   directly: image bytes returned, `Content-Type`, gzip encoding on `/refs.json`, `Cache-Control:
   private`, ETag, the exact call made to `/auth/v1/user`, revoked-token behaviour, CORS origin
   echoing, and every denial being `no-store`. Keep this green.
2. **End-to-end in the real app**, using a local stand-in for the Worker that serves the *real*
   bundle and *real* screenshots without the session check. Confirmed: the 1,632-entry index loads,
   the right question matches, the tab appears, both page images fetch as blob URLs at full
   1241×1754, and the quoted sentence is visibly verbatim on the rendered page. Also confirmed the
   tab is **absent** on a question with no citation.

Production itself was checked for the deny paths only (401 unauthenticated on `/refs.json` and
images, 404 on traversal / listing / raw `refs.json.gz`, correct CORS preflight from pritedaily.com).

The single thing still unproven: **whether Supabase returns 200 for a valid token.** That's
Supabase's documented behaviour, not our code — but it means the very first real signed-in load is
still the true smoke test. If images 401 for a signed-in user, suspect the token or the anon-key
secret, not the routing.

## What's left to do

1. **Don't** apply `supabase/migrations/0058_textbook_excerpts.sql` — superseded by R2.
2. Consider fixing the section-index heading-detection gap (unnumbered `## Title` chapters) if time
   allows — would recover a small number of currently-unreachable genuine matches (Tourette/tic
   disorders content, disruptive behavior disorders, the Glossary's crisp definitions).
