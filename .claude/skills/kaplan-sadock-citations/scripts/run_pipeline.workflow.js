// Main K&S citation pipeline. See SKILL.md for design rationale and the
// hard-won failure modes this script defends against.
//
// Launch with no args to process every batch that doesn't already have a
// result file on disk (true cross-session resume -- see prep_run.py):
//   Workflow({scriptPath: ".../run_pipeline.workflow.js"})
// Or pass an explicit array of batch indices to process a subset:
//   Workflow({scriptPath: "...", args: [0,1,2]})

export const meta = {
  name: 'ks-citation-full',
  description: 'Run the validated BM25+Haiku K&S citation pipeline over the PRITE question bank',
  phases: [
    { title: 'BM25 Extraction', detail: 'Haiku extracts citations from pre-fetched BM25 top-10 candidates', model: 'haiku' },
    { title: 'Fallback Triage', detail: 'Haiku assigns primary+backup sections for questions BM25 missed', model: 'haiku' },
    { title: 'Fallback Extraction', detail: 'Haiku re-checks primary/backup sections for fallback questions', model: 'haiku' },
  ],
}

const BASE = '/Users/andrewcorrell/Claude/Projects/PRITE question practice website'
const N_BATCHES = 360
const SLIM_FILE = `${BASE}/reference/all3600_slim.json`
const RESULTS_DIR = `${BASE}/reference/results`

// Transient safety-classifier / API errors killed 3 of 30 batches (10%) on the
// first 300-question attempt, and `filter(Boolean)` silently dropped them --
// 49 questions vanished and were only caught by manually diffing id sets.
// At 360 batches that would be ~36 lost batches. Always retry, never drop silently.
// CIRCUIT BREAKER (added after a real incident): retrying is right for a
// transient classifier blip, but WRONG for a systemic stop like hitting the
// account's session usage limit. On the first full run, the quota ran out at
// batch ~155 and this wrapper then ground through ~212 remaining batches x3
// attempts = 636 doomed calls before finishing. `agent()` only returns null --
// it doesn't expose the error text -- so we can't distinguish quota from
// transient directly. Instead: many consecutive failures means something
// systemic, so stop launching new work and let the operator resume later.
// Completed batches are already durable on disk, so halting early costs nothing.
const BREAKER_THRESHOLD = 10
let consecutiveFailures = 0
let breakerTripped = false

async function agentRetry(prompt, opts, attempts = 3) {
  if (breakerTripped) return null // fail fast, don't queue more doomed calls
  for (let i = 1; i <= attempts; i++) {
    const r = await agent(prompt, opts)
    if (r) {
      consecutiveFailures = 0
      return r
    }
    consecutiveFailures++
    if (consecutiveFailures >= BREAKER_THRESHOLD && !breakerTripped) {
      breakerTripped = true
      log(`CIRCUIT BREAKER TRIPPED: ${BREAKER_THRESHOLD} consecutive agent failures.`)
      log('  Most likely the account session/usage limit or a provider outage — not a bug.')
      log('  Halting new work. Everything finished is safe in reference/results/.')
      log('  Wait for the limit to reset, then rerun prep_run.py and relaunch to continue.')
      return null
    }
    if (i < attempts) log(`  retry ${i}/${attempts}: ${opts.label}`)
  }
  log(`  GAVE UP after ${attempts} attempts: ${opts.label}`)
  return null
}

const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          section_num: { type: ['string', 'null'] },
          used_backup: { type: 'boolean' },
          rating: { type: 'string', enum: ['STRONG', 'WEAK', 'NONE'] },
          citations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                quote: { type: 'string' },
                supports: { type: 'string' },
                note: { type: 'string' },
              },
              required: ['quote', 'supports', 'note'],
            },
          },
        },
        required: ['id', 'section_num', 'rating', 'citations'],
      },
    },
  },
  required: ['results'],
}

const TRIAGE_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          section_num: { type: ['string', 'null'] },
          backup_section_num: { type: ['string', 'null'] },
          likely_not_in_book: { type: 'boolean' },
        },
        required: ['id', 'section_num', 'backup_section_num', 'likely_not_in_book'],
      },
    },
  },
  required: ['results'],
}

// Shared citation-quality contract. The STRICT bar stops topically-related-but
// -useless quotes; the distractor clause is a REQUIREMENT, not a nicety --
// the 300-question run produced distractor coverage on only 5/300 questions
// when it was phrased as optional, which misses what this feature is for.
const QUALITY_RULES = `
CITATION QUALITY RULES:
1. PRIMARY citation (required if anything qualifies): a VERBATIM excerpt that meets the STRICT bar --
   if someone who did NOT know the answer read ONLY this quote plus the question, it would let them
   confirm the correct answer AND rule out the specific wrong options offered. A passage that is
   merely topically related, or that defines a concept without connecting it to why THIS answer beats
   the alternatives, does NOT meet the bar.
2. DISTRACTOR citation (include whenever the text supports one -- actively look for this, don't skip
   it): if the passages also address why a specific wrong option is wrong, or explain a concept a
   distractor confuses, add a second excerpt with supports set to "distractor:X" (X = that option's
   letter). Many questions have a distractor worth explaining; aim to include one wherever the
   candidate text genuinely allows it.
3. CONTEXT citation (optional): if a further short excerpt adds genuinely useful teaching context for
   the underlying concept, include it with supports set to "context".
4. Excerpts must be SHORT (1-3 sentences) and EXACT character-for-character copy-paste from the
   candidate text -- no paraphrasing, no fixing typos, no changing capitalization or punctuation, no
   stitching together non-adjacent sentences. A quote that is a real first half followed by an
   invented continuation is the single worst failure mode here and IS automatically detected and
   rejected downstream, so never do it.
5. Self-rate the question:
   - "STRONG" = the primary citation clearly discriminates the correct answer from the specific
     alternatives offered.
   - "WEAK" = a real, on-topic supporting passage exists, but it doesn't fully discriminate.
   - "NONE" = nothing in the candidates genuinely relates to what the question is testing.
   Do NOT inflate WEAK into STRONG. Equally, do NOT collapse WEAK into NONE: **WEAK is the correct
   rating for the uncertain middle.** Reserve NONE for the case where the candidate passages simply
   don't cover this topic at all. If you found a real passage that's on-topic and helpful but you're
   unsure it fully nails the discrimination, that is WEAK — return it with the quote, don't discard it.
6. Only include citations when rating is STRONG or WEAK. If NONE, return an empty citations array.
7. section_num must be copied exactly from the candidate's own "section_num" field (or, in the
   fallback stage, from section_titles_list.txt). Never invent or abbreviate one.`

function extractPrompt(batchIdx, batchFile) {
  const outFile = `${RESULTS_DIR}/stage1_${String(batchIdx).padStart(4, '0')}.json`
  return `Citation extraction for a psychiatry PRITE question bank, linking questions to Kaplan & Sadock's Comprehensive Textbook of Psychiatry, 10th ed.

Read ${batchFile} — a JSON array of questions, each with "candidates": up to 10 pre-retrieved candidate passages (real book text) that a keyword search ranked as most likely relevant.

For EACH question in the array, read all its candidate passages and apply the rules below.
${QUALITY_RULES}

TWO OUTPUTS, both required:
(a) Write your full results array to ${outFile} as JSON — an array of objects shaped
    {"id","section_num","used_backup","rating","citations":[{"quote","supports","note"}]}.
    Do this FIRST, so the work survives even if the run is interrupted later.
(b) Return the same results for EVERY question in the batch file via the structured output tool.

Cover every question in the batch file — do not silently omit any.`
}

function triagePrompt(ids) {
  return `You're doing section-matching for a psychiatry PRITE exam citation pipeline, linking questions to Kaplan & Sadock's Comprehensive Textbook of Psychiatry, 10th ed.

Read ${BASE}/reference/section_titles_list.txt — 283 lines, format "NUM TITLE".
Read ${SLIM_FILE} — a JSON array of questions (id, stem, options, answer_letter, answer_text). Find and process ONLY these ids: ${JSON.stringify(ids)}. Ignore all other ids in the file.

A keyword search already failed to surface a good citation for these questions. For each, think hard about which section_num most likely contains the specific fact needed — consider subsections whose titles don't obviously match the surface topic (e.g. a body-dysmorphic-disorder drug fact may live inside an anxiety-disorders treatment chapter's OCD-spectrum subsection). If you genuinely believe a question asks about something outside the scope of a psychiatry textbook (pure radiology image interpretation, a fact depending on an image not in the data, administrative trivia), set likely_not_in_book to true and both section fields to null.

Otherwise give a primary section_num and a genuinely different backup_section_num (not a throwaway).

CRITICAL: every section_num you output must be copied exactly from a line in section_titles_list.txt — it must be the "NUM" token at the start of a line (like "14.8" or "2.1"), never a line position, never a bare chapter number that isn't in that file. Return results for EVERY id listed above via the structured output tool.`
}

function fallbackExtractPrompt(groupIdx, sectionNum, idsWithBackup) {
  const outFile = `${RESULTS_DIR}/fallback_${String(groupIdx).padStart(4, '0')}.json`
  return `Citation extraction for a psychiatry PRITE question bank, linking questions to Kaplan & Sadock's Comprehensive Textbook of Psychiatry, 10th ed.

Read ${SLIM_FILE} — find and process ONLY these ids: ${JSON.stringify(idsWithBackup.map((x) => x.id))}. Each id's backup_section_num is: ${JSON.stringify(idsWithBackup)}.
Read ${BASE}/reference/section_index_full.json to get md_line_start/md_line_end for section_num "${sectionNum}" and for any backup_section_num above.
Read that primary section's line range from ${BASE}/reference/kaplan-sadock-10e.md (offset=md_line_start, limit=md_line_end-md_line_start+1).

For EACH id: check whether the primary section (${sectionNum}) supports the answer. If not, read that question's own backup_section_num's text too and check there. If still nothing, you may try ONE more section from your own judgment. Set used_backup true if the citation came from somewhere other than the primary, and set section_num to wherever the citation ACTUALLY came from.
${QUALITY_RULES}

TWO OUTPUTS, both required:
(a) Write your full results array to ${outFile} as JSON (same shape as above). Do this FIRST.
(b) Return the same results for EVERY id via the structured output tool.`
}

// ---------------------------------------------------------------------------

phase('BM25 Extraction')

// FAIL-SAFE ARG HANDLING -- do not "helpfully" default to a full run.
// `args` does NOT reliably arrive as a real JS array (a large array once came
// through as a JSON-encoded string and crashed pipeline(); here an array of
// [0,1] failed Array.isArray and the old code's "default to all 360" fallback
// silently launched the entire multi-hour paid run). A malformed/absent arg
// must therefore ABORT, never escalate into the most expensive possible action.
// To run everything, say so explicitly: args: "ALL".
function resolveTodo(a) {
  if (Array.isArray(a) && a.length) return a.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < N_BATCHES)
  if (typeof a === 'string') {
    const s = a.trim()
    if (s === 'ALL') return Array.from({ length: N_BATCHES }, (_, i) => i)
    try {
      const parsed = JSON.parse(s)
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < N_BATCHES)
      }
    } catch (e) { /* fall through to abort */ }
  }
  return null
}

const todo = resolveTodo(args)
if (!todo || !todo.length) {
  log('ABORT: no valid batch list supplied.')
  log('  Pass an array of batch indices (from prep_run.py), or the literal string "ALL"')
  log('  to process every batch. Refusing to assume a full run — that is hours of paid compute.')
  return { aborted: true, reason: 'no valid batch list in args', received_type: typeof args }
}
log(`Stage 1: ${todo.length} batches to process (of ${N_BATCHES} total)`)

const stage1Raw = await pipeline(
  todo,
  (i) => agentRetry(
    extractPrompt(i, `${BASE}/reference/full_batch_${String(i).padStart(4, '0')}.json`),
    { schema: EXTRACT_SCHEMA, label: `batch_${String(i).padStart(4, '0')}`, model: 'haiku' }
  )
)

const failedBatches = todo.filter((_, idx) => !stage1Raw[idx])
const stage1 = stage1Raw.filter(Boolean).flatMap((r) => r.results)
log(`Stage 1: ${stage1.length} questions returned, ${stage1.filter((r) => r.rating !== 'NONE').length} got a citation`)
if (failedBatches.length) {
  log(`WARNING: ${failedBatches.length} batches failed all retries: ${JSON.stringify(failedBatches)} — rerun to pick them up`)
}

const needFallback = stage1.filter((r) => r.rating === 'NONE')
log(`${needFallback.length} questions need fallback triage`)

phase('Fallback Triage')
const TRIAGE_BATCH = 25
const needFallbackIds = needFallback.map((r) => r.id)
const triageBatches = []
for (let i = 0; i < needFallbackIds.length; i += TRIAGE_BATCH) {
  triageBatches.push(needFallbackIds.slice(i, i + TRIAGE_BATCH))
}

const triageRaw = await pipeline(
  triageBatches,
  (ids) => agentRetry(triagePrompt(ids), { schema: TRIAGE_SCHEMA, label: `triage-${ids.length}`, model: 'haiku' })
)
const triage = triageRaw.filter(Boolean).flatMap((r) => r.results)
log(`Triage: ${triage.length}/${needFallbackIds.length} results, ${triage.filter((t) => t.likely_not_in_book).length} flagged as likely not in book`)

phase('Fallback Extraction')
const toSearch = triage.filter((t) => !t.likely_not_in_book && t.section_num)
const bySection = {}
for (const t of toSearch) {
  if (!bySection[t.section_num]) bySection[t.section_num] = []
  bySection[t.section_num].push({ id: t.id, backup_section_num: t.backup_section_num })
}
const sectionGroups = Object.entries(bySection)
log(`Fallback extraction: ${sectionGroups.length} section groups covering ${toSearch.length} questions`)

const fallbackRaw = await pipeline(
  sectionGroups,
  ([sectionNum, items], _orig, idx) => agentRetry(
    fallbackExtractPrompt(idx, sectionNum, items),
    { schema: EXTRACT_SCHEMA, label: `fallback-${sectionNum}`, model: 'haiku' }
  )
)
const fallback = fallbackRaw.filter(Boolean).flatMap((r) => r.results)

const notInBook = triage.filter((t) => t.likely_not_in_book).map((t) => ({
  id: t.id, section_num: null, rating: 'NONE', citations: [],
  reason: 'triage flagged as likely outside psychiatry textbook scope',
}))

log(`DONE. stage1_direct=${stage1.filter((r) => r.rating !== 'NONE').length} fallback=${fallback.length} not_in_book=${notInBook.length} failed_batches=${failedBatches.length}`)

return {
  stage1_direct: stage1.filter((r) => r.rating !== 'NONE'),
  stage1_none_ids: needFallback.map((r) => r.id),
  triage,
  fallback,
  not_in_book: notInBook,
  failed_batches: failedBatches,
}
