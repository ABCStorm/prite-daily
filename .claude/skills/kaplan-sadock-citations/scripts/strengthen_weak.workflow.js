// Strengthen pass for WEAK (but quote-verified) citations.
// Goal: re-extract a discriminating STRONG primary quote when possible;
// keep an improved WEAK if still only weakly supportive; mark DROP when
// the prior cite is off-topic / misleading and nothing better exists.
//
// Input batches: reference/strengthen_weak_batches/batch_NNN.json
// Output:        reference/results/strengthen/batch_NNN.json
//
// Launch with args as batch indices (numbers) or the string "ALL".
// Abort on missing args (same fail-safe as the main pipeline).

export const meta = {
  name: 'ks-strengthen-weak',
  description: 'Re-extract stronger K&S citations for questions currently rated WEAK',
  phases: [
    { title: 'Strengthen', detail: 'Haiku re-extracts with a strict discrimination bar', model: 'haiku' },
  ],
}

const BASE = '/Users/andrewcorrell/Claude/Projects/PRITE question practice website'
const BATCH_DIR = `${BASE}/reference/strengthen_weak_batches`
const OUT_DIR = `${BASE}/reference/results/strengthen`
const MANIFEST = `${BATCH_DIR}/manifest.json`

const BREAKER_THRESHOLD = 10
let consecutiveFailures = 0
let breakerTripped = false

async function agentRetry(prompt, opts, attempts = 3) {
  if (breakerTripped) return null
  for (let i = 1; i <= attempts; i++) {
    const r = await agent(prompt, opts)
    if (r) {
      consecutiveFailures = 0
      return r
    }
    consecutiveFailures++
    if (consecutiveFailures >= BREAKER_THRESHOLD && !breakerTripped) {
      breakerTripped = true
      log(`CIRCUIT BREAKER: ${BREAKER_THRESHOLD} consecutive failures — halting.`)
      return null
    }
    if (i < attempts) log(`  retry ${i}/${attempts}: ${opts.label}`)
  }
  log(`  GAVE UP: ${opts.label}`)
  return null
}

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          section_num: { type: ['string', 'null'] },
          rating: { type: 'string', enum: ['STRONG', 'WEAK', 'NONE', 'DROP'] },
          disposition: {
            type: 'string',
            enum: ['upgraded', 'improved_weak', 'kept_prior', 'dropped'],
            description: 'What happened relative to the prior WEAK cite',
          },
          prior_problem: {
            type: 'string',
            description: 'One sentence: why the prior WEAK cite failed the STRICT bar (or empty if it was already fine)',
          },
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
        required: ['id', 'section_num', 'rating', 'disposition', 'prior_problem', 'citations'],
      },
    },
  },
  required: ['results'],
}

function strengthenPrompt(batchIdx) {
  const batchId = String(batchIdx).padStart(3, '0')
  const batchFile = `${BATCH_DIR}/batch_${batchId}.json`
  const outFile = `${OUT_DIR}/batch_${batchId}.json`
  return `You are improving WEAK Kaplan & Sadock textbook citations for a psychiatry PRITE question bank.

Read ${batchFile} — a JSON array. Each item has:
  id, stem, options, answer_letter, answer_text,
  candidates: up to 10 real book passages (BM25 top hits),
  prior_section, prior_citations: the CURRENT weak cite(s) already verified as real book text.

YOUR JOB for EACH question — strict, in this order:

1. DIAGNOSE the prior cite. Common failure modes (name the one that applies in prior_problem):
   - OFF_TOPIC: quote is about a related domain but not the tested fact
   - WRONG_CONCEPT: quote describes a different diagnosis/mechanism than the answer
   - BIBLIOGRAPHY: quote is a citation line / author list, not teaching content
   - NON_DISCRIMINATING: on-topic but a reader with only the quote still couldn't pick the answer over the distractors
   - PARTIAL: addresses part of the stem but misses the keyed discriminator
   - FINE: prior cite actually meets the STRICT bar (rare — re-rate STRONG if so)

2. SEARCH harder for a STRONG primary citation:
   - Read ALL candidate passages carefully.
   - Prefer a verbatim 1–3 sentence excerpt that, alone with the question, lets a reader CONFIRM the correct answer AND rule out the specific wrong options.
   - You MAY also Read ${BASE}/reference/section_index_full.json and then the matching line range of ${BASE}/reference/kaplan-sadock-10e.md for prior_section or any candidate's section_num if candidates look incomplete.
   - Quote must be EXACT character-for-character copy-paste from candidates or the md file — no paraphrase, no stitching non-adjacent sentences, no invented continuations.

3. RATE honestly:
   - STRONG: primary cite discriminates this answer from these distractors → disposition "upgraded" (or "kept_prior" if the prior was already fine)
   - WEAK: real on-topic helpful text still doesn't fully discriminate → disposition "improved_weak" if you found a better quote than prior, else "kept_prior"
   - DROP: prior is misleading/off-topic AND you found nothing better → rating DROP, disposition "dropped", empty citations
   - NONE: same as DROP (use DROP when prior should not ship; NONE only if you also find no replacement and prior was empty — here prior exists, so prefer DROP)

4. DISTRACTOR (encouraged): if text explains why a wrong option is wrong, add a second citation with supports "distractor:X".

5. section_num must be a real section number from a candidate or section_index (e.g. "27.14"), never invented.

TWO OUTPUTS, both required:
(a) Write the full results array to ${outFile} as JSON FIRST (survives interruption).
(b) Return the same results for EVERY question in the batch via the structured output tool.

Cover every question. Do not silently omit any.`
}

// ---- args fail-safe (same as main pipeline) ----
phase('Strengthen')

let batchIndices
if (typeof args === 'string' && args === 'ALL') {
  const man = await agent(
    `Read ${MANIFEST} and return {ids: the batch_ids array as strings}.`,
    { schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] }, label: 'load-manifest' }
  )
  batchIndices = man.ids.map((s) => parseInt(s, 10))
} else if (Array.isArray(args) && args.length > 0) {
  batchIndices = args.map((x) => parseInt(x, 10))
} else {
  throw new Error('ABORT: pass args as array of batch indices, e.g. [0,1,2], or the string "ALL". No permissive default.')
}

// Skip batches already on disk
const todo = []
for (const i of batchIndices) {
  const batchId = String(i).padStart(3, '0')
  const outFile = `${OUT_DIR}/batch_${batchId}.json`
  // cheap existence check via agent would be expensive; always re-run listed batches
  // (disk write is the durable copy; re-run is ok for small pilot ranges)
  todo.push(i)
}
log(`strengthen: ${todo.length} batches`)

const raw = await pipeline(
  todo,
  (idx) =>
    agentRetry(strengthenPrompt(idx), {
      schema: RESULT_SCHEMA,
      label: `strengthen-${String(idx).padStart(3, '0')}`,
      model: 'haiku',
    })
)

const ok = raw.filter(Boolean)
log(`strengthen done: ${ok.length}/${todo.length} batches returned`)
return {
  n_requested: todo.length,
  n_returned: ok.length,
  failed: todo.filter((_, i) => !raw[i]),
  results: ok.flatMap((r) => r.results || []),
}
