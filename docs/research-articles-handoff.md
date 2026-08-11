# Research articles (Further reading) — handoff

Last updated: 2026-08-09  
Project: PRITE Daily (`https://pritedaily.com`)  
Goal: Attach real peer-reviewed papers to each question so residents can open further reading after they answer.

This note captures **what we learned building the matcher + audit pipeline**, not just where the files live. Read this before changing retrieval, shipping new refs, or re-running the audit at scale.

---

## What shipped (user-facing)

- Learning stack section **Further reading** (bottom of the stack).
- **Manila folder** cards (Framer-inspired pull-out / flip) with PubMed / PMC / DOI links.
- Flip side shows a **clinical “why this paper” sentence** when the audit has produced one; raw matcher meta (`title matches answer/topic, MEDLINE…`) is **suppressed in the UI**.
- Client index: `public/data/research_refs.json` (~2–4 MB depending on keep rate; gzip ~500–800 KB).
- Loader: `src/lib/researchRefs.ts`  
- Panel: `src/lib/researchPanel.tsx` + `src/lib/DocumentFolderCard.tsx`

Rebuild client after any refs change:

```bash
python3 scripts/research-articles/build_client_bundle.py
# or after apply_partial_audit.py which calls it
npm run build && npx wrangler@3 pages deploy dist --project-name=prite-daily --branch main --commit-dirty=true
```

---

## Architecture (three stages)

```
questions_all.json (5,100)
        │
        ▼
[1] Europe PMC search (match_articles.py)
        │  MEDLINE only, real PMIDs only
        ▼
refs.json  (~7.6k paper–question pairs initially)
        │
        ▼
[2] Abstract fetch + batch files (prep_audit_batches.py)
        │
        ▼
[3] LLM relevance audit (workflow audit-research-articles.rhai)
        │  relevant | weak | irrelevant + relevance_sentence
        ▼
apply_partial_audit.py → refs.json + research_refs.json → app
```

### Stage 1 — Retrieval (`scripts/research-articles/match_articles.py`)

**Backend:** Europe PMC REST API (search index only). User-facing links are PubMed / PMC / DOI. **Never invent PMIDs.**

**Quality gates that worked:**

| Gate | Why |
|---|---|
| `SRC:MED` (MEDLINE only) | Hard filter against junk / predatory OA mills |
| Soft-demote Frontiers / MDPI / Cureus / Hindawi / *PLOS One* / *Sci Rep* | Still MEDLINE-eligible but low signal for board-exam reading |
| Boost core psych / neuro / general-medicine journals | AJP, JAMA Psych, Lancet Psych, NEJM, Cochrane, etc. |
| Prefer reviews / systematic reviews / meta-analyses / guidelines | Better “further reading” than random primary RCTs for most PRITE items |
| Query from **answer + stem clinical anchors**, not all distractor med tags | Avoided flooding every lithium distractor into a psoriasis query |

**Hard lessons from stage 1:**

1. **Keyword overlap ≠ educational usefulness.**  
   A paper can share tokens with the stem and still teach the *wrong fact*. Classic failure modes we saw:
   - ADHD **stimulant efficacy** paper on a **comorbidity rates** question  
   - Breast-cancer screening guideline on a **burnout clinic co-location** question  
   - Lithium **battery chemistry** on a **lithium → psoriasis** side-effect question (before co-term gates)  
   - Conference abstract dumps / GBD encyclopedia papers that match “disorder” broadly  

2. **`sort=RELEVANCE` broke Europe PMC** in our smoke tests (empty payload). Use `CITED desc` (or omit) and re-rank client-side.

3. **Query pollution from tags.**  
   Putting *every* medication/diagnosis tag into the query (including distractors) pulled famous bipolar guidelines for unrelated stems. Prefer:
   - answer phrase (quoted when multi-word)  
   - 1–2 **stem clinical anchors** that are not weak function words  
   - avoid AND-ing vignette diagnoses that are only context (e.g. bipolar patient + serotonin syndrome answer → don’t force bipolar into the search)

4. **Single-token answers need co-terms.**  
   Answer “Lithium” alone retrieves batteries and chemistry. Require stem co-terms (psoriasis, MAOI, metformin…) in title/abstract for short answers.

5. **Coverage vs precision is a real tradeoff.**  
   First full pass: ~95% of questions got *some* MEDLINE hit, but residents correctly said “a lot of these don’t seem relevant.”  
   After LLM audit: keep rate stabilized around **~35–37%** of paper–question pairs (roughly **~22–24%** if you keep only “relevant”, not “weak”).  
   **Do not ship un-audited keyword matches as if they were curated.**

6. **Cache design matters.**  
   Caching full Europe PMC “core” hits ballooned to **~2.9 GB**. Slim hits (pmid, title, journal, year, short abstract, cites, types) before caching. Never re-load a multi‑GB cache into a parallel job.

7. **Parallelism works well** with a shared rate limiter (~12–15 req/s, 10–12 workers). Sequential was ~0.13 q/s; parallel ~1.2–1.4 q/s.

### Stage 2 — Prep for audit (`prep_audit_batches.py`)

- Built **7,637** pairs from the first full match run.  
- Batched **12 pairs/file** → **637** batches.  
- Fetched abstracts via Europe PMC `EXT_ID:` batches of 40 PMIDs.  
- Many PMIDs have **empty abstracts** in Europe PMC; audit still works from title + journal + stem/answer/explanation, but title-only is weaker.

### Stage 3 — Relevance audit (workflow)

Workflow: `.grok/workflows/audit-research-articles.rhai`  
Agents read `reference/research-articles/audit/batch_NNNN.json` and write  
`reference/research-articles/audit/results/batch_NNNN.json`.

**Verdict schema:**

- `relevant: boolean`  
- `rating: relevant | weak | irrelevant`  
- `relevance_sentence: string` — one clinical sentence for the resident  

**Critical workflow failure we hit:**

> `Runtime error: scratch file quota exceeded (maximum 64)`

The first large run wrote every batch to **workflow scratch**. Scratch caps at **64 files**. Fix: **do not use `write_scratch_file` for per-batch persistence**. Agents write into the project `results/` tree; the workflow only returns summary counts.

**Operational pattern that worked:**

- Chunks of **50 batches** (≈600 pairs), `agent_budget` ≈ 60  
- On complete: `apply_partial_audit.py` → rebuild client → deploy  
- Resume by `start` = next unused batch index (check max file on disk)

**Final audit complete (2026-08-09):**

| Metric | Final |
|---|---|
| Batches done | **637 / 637** |
| Pairs audited | **7,636 / 7,637** (1 pair missing — negligible) |
| Keep rate (relevant+weak) | **2,815 (36.9%)** |
| Drop rate (irrelevant) | **4,821 (63.1%)** |
| Relevant-only | **1,817 (23.8%)** |
| Questions with ≥1 paper after strict ship | **2,065 / 5,100 (~40%)** |

So: **roughly one paper for every three auto-matches**, and **~60% of questions have no Further reading card** after strict audit. That is the correct product tradeoff.

---

## What “good” looks like (examples from audit)

**Keep (relevant):**  
*Metoclopramide dystonia title* for an acute dystonia vignette after metoclopramide — sentence ties drug + reaction + vignette.

**Keep (weak):**  
Broad adolescent prefrontal maturation review for a developmental-stage item — right stage, not the exact cellular markers in the stem.

**Drop (irrelevant):**  
Cochrane amphetamines-for-ADHD on “most comorbid with ADHD = anxiety/learning” — same disease family, wrong teaching point.

**The audit’s value is the sentence.**  
Even a correct paper without a “why for *this* item” sentence is hard to use in the folder UI. Prefer shipping fewer papers with clear sentences over many bare links.

---

## Apply / ship policy

`scripts/research-articles/apply_partial_audit.py`:

- Audited **irrelevant** → drop  
- Audited **relevant / weak** → keep + attach `relevance_sentence` as `why`  
- **Unaudited** pairs (during partial runs) → left in place until audit catches up  

UI (`clinicalWhy` in `researchPanel.tsx`) additionally hides strings that look like matcher meta even if they leak through.

**Recommended final ship:**

1. Finish all 637 batch result files.  
2. Run `apply_partial_audit.py` (optionally `--strict` once 100% audited to drop any leftover unaudited).  
3. `build_client_bundle.py` + deploy.  
4. Spot-check flip sides on 10 random 2009 / 2015 / 2025 items.

Backup of pre-audit full match set:  
`reference/research-articles/refs.pre_audit_backup.json` (created on first apply).

---

## Key paths

| Path | Role |
|---|---|
| `scripts/research-articles/match_articles.py` | Europe PMC matcher (parallel workers) |
| `scripts/research-articles/prep_audit_batches.py` | pairs.jsonl + batch_*.json + abstracts |
| `scripts/research-articles/apply_partial_audit.py` | merge verdicts → refs + client |
| `scripts/research-articles/build_client_bundle.py` | slim `public/data/research_refs.json` |
| `scripts/research-articles/audit_progress.py` | batch / rating summary |
| `scripts/research-articles/merge_audit.py` | alternate merge (full audited-only) |
| `.grok/workflows/audit-research-articles.rhai` | parallel LLM audit |
| `reference/research-articles/refs.json` | working full refs (mutated by apply) |
| `reference/research-articles/audit/batch_*.json` | audit inputs |
| `reference/research-articles/audit/results/batch_*.json` | durable audit outputs |
| `public/data/research_refs.json` | what the app loads |

---

## Do / don’t

**Do**

- Treat Europe PMC as a **candidate generator**, not the product.  
- Always run a **human-or-LLM relevance pass** before calling something “curated.”  
- Keep PMIDs real (API-only).  
- Prefer 1–2 papers with clear sentences over 3 weak keyword hits.  
- Chunk audits ≤ ~50–60 agents per workflow run; persist to **disk**, not scratch.  
- Rebuild + deploy `research_refs.json` after apply.

**Don’t**

- Don’t invent PMIDs or journal names.  
- Don’t trust self-rated “STRONG” without a second check (same lesson as Kaplan citations).  
- Don’t AND all distractor meds into the query.  
- Don’t use `sort=RELEVANCE` on Europe PMC without re-testing.  
- Don’t `write_scratch_file` once per batch in a 600-batch run.  
- Don’t show matcher scoring crumbs in the UI.

---

## Open issues / next improvements

1. **Finish remaining audit batches** if not already at 637/637; then optional `--strict` apply.  
2. **Coverage gaps:** after audit, some topics (pure biostats definitions, obscure forensics, pure image-interpretation) may have no paper — that’s OK; hide the section.  
3. **Better first-pass retrieval:** embed stem+answer vs paper titles/abstracts (still MEDLINE-filtered) *then* LLM re-rank — would reduce audit volume.  
4. **Topic-level landmark library:** for high-frequency tags (clozapine, lithium, NMS, SnNout) pin 1–2 known classics, then fill gaps with search.  
5. **Per-cloze Anki-style practice** and other UI work are separate; don’t conflate with paper quality.  
6. **Abstracts missing** for some PMIDs — fallback to PubMed EFetch if audit quality suffers on title-only items.  
7. **Cross-device queue / banner fixes** and AnKing cyber-tilt UI are orthogonal; see main `HANDOFF.md` / git history for those.

---

## One-paragraph summary for a future agent

We attached real MEDLINE papers to PRITE questions via Europe PMC, then learned that **automatic keyword matching is only ~1/3 educationally relevant**. A separate LLM audit that reads stem + answer + explanation + title/abstract, rates relevant/weak/irrelevant, and writes a one-sentence clinical rationale is non-negotiable for quality. Ship only audited keepers with sentences; suppress matcher meta in the UI; never invent PMIDs; parallelize search carefully with slim caches; never use workflow scratch for hundreds of batch files. Expect ~35% keep rate and many questions with zero further-reading cards — that is the correct product tradeoff for “don’t hallucinate, don’t spam residents with junk.”
