// Blind relevance audit. The deterministic verifier proves a quote is REAL
// book text; it cannot prove the quote actually SUPPORTS the answer. That
// second property is where this pipeline has historically overstated itself:
// an early audit found self-rated STRONG was ~2x the true rate.
//
// Design choices that make this a real check rather than a rubber stamp:
//   * Auditors never see the pipeline's own STRONG/WEAK rating (blind).
//   * Auditors run on the DEFAULT (stronger) model, not the Haiku that wrote
//     the citations -- a judge no smarter than the author proves little.
//   * The rubric is explicitly skeptical and gives auditors an easy, blameless
//     way to say INSUFFICIENT, so the path of least resistance isn't approval.
//   * Sample is shuffled so rating can't be inferred from position.
//
// Usage: Workflow({scriptPath: ".../audit_relevance.workflow.js"})

export const meta = {
  name: 'ks-citation-relevance-audit',
  description: 'Blind independent audit of whether verified citations actually support their answers',
  phases: [{ title: 'Audit', detail: 'Skeptical blind judges rate citation sufficiency' }],
}

const BASE = '/Users/andrewcorrell/Claude/Projects/PRITE question practice website'
const N_BATCHES = 20

const SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          verdict: { type: 'string', enum: ['STRONG', 'WEAK', 'INSUFFICIENT', 'CONTRADICTS'] },
          reasoning: { type: 'string' },
        },
        required: ['id', 'verdict', 'reasoning'],
      },
    },
  },
  required: ['results'],
}

function prompt(batchFile) {
  return `You are an independent, skeptical auditor of textbook citations for a psychiatry board-prep question bank. You did NOT write these citations. Your job is to catch weak ones, not to approve them.

Read ${batchFile} — a JSON array. Each entry has a question (stem, options, correct answer) and one or more citations already confirmed to be genuine verbatim text from Kaplan & Sadock's Comprehensive Textbook of Psychiatry, 10th ed.

Authenticity is ALREADY PROVEN — do not re-check whether the quote is real. Judge ONLY this:

  **If a resident who did NOT know the answer read the question plus ONLY these quotes,
   would the quotes actually justify the keyed answer?**

Verdicts:
- "STRONG"       — the quote states the specific fact the question turns on, and would let the
                   reader pick the keyed answer over the specific distractors offered.
- "WEAK"         — genuinely on-topic and useful background, but does NOT by itself establish
                   why the keyed answer beats the alternatives. A definition of the right concept
                   that never connects it to the question's discriminator is WEAK, not STRONG.
- "INSUFFICIENT" — the quote is about a different question than the one asked, is too generic to
                   support anything, or supports the topic area but not this answer at all.
- "CONTRADICTS"  — the quote actually undercuts the keyed answer, or supports a different option.
                   (Rare, but flag it — this is the most important thing you could find.)

Be strict. Most citations that "feel related" are WEAK, not STRONG. Do not give STRONG credit for
a quote that merely mentions the right topic, names the right drug/disorder, or defines a term
without tying it to what the question actually asks. If you are hesitating between STRONG and
WEAK, the answer is WEAK. There is no penalty for harsh verdicts and no reward for generous ones.

Give a one-sentence reasoning for each. Return a verdict for EVERY id in the file via the
structured output tool.`
}

phase('Audit')
const files = Array.from({ length: N_BATCHES }, (_, i) => `${BASE}/reference/audit_batch_${String(i).padStart(3, '0')}.json`)

const raw = await pipeline(
  files,
  (f) => agent(prompt(f), { schema: SCHEMA, label: `audit-${f.split('_').pop()}` })
)

return raw.filter(Boolean).flatMap((r) => r.results)
