// Retry pass for citations that failed verify_citations.py's QUOTE_NOT_FOUND
// check. Validated at 30-question pilot scale: recovered 6/7 failures cheaply
// (most were trivial -- a capitalization slip, an italics-markup mismatch, a
// wrong section attribution -- not real fabrications).
//
// Usage: after verify_citations.py runs, build a JSON array of failed items
// shaped like [{"id": "...", "section_num": "...", "quote": "...", "supports":
// "...", "note": "..."}] from every citation with status QUOTE_NOT_FOUND, save
// it to reference/retry_input.json, then just launch this script (no args
// needed -- it reads the file itself and only ever passes small id lists
// through the orchestration layer, never the bulky quote/note text, to avoid
// the token waste and truncation risk of loading a big JSON blob through an
// agent's own output).
//
// Merge the output back into your citation set (matching on id+original quote)
// and re-run verify_citations.py on the merged result.

export const meta = {
  name: 'ks-citation-retry',
  description: 'Re-attempt citations that failed exact-substring verification',
  phases: [{ title: 'Retry', detail: 'Haiku re-copies the exact passage for each failed quote', model: 'haiku' }],
}

const BASE = '/Users/andrewcorrell/Claude/Projects/PRITE question practice website'
const INPUT_FILE = `${BASE}/reference/retry_input.json`
const BATCH_SIZE = 10

const IDS_SCHEMA = { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } }, required: ['ids'] }

const RETRY_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          fixed_quote: { type: ['string', 'null'] },
          supports: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['id', 'fixed_quote', 'supports', 'note'],
      },
    },
  },
  required: ['results'],
}

function retryBatchPrompt(ids) {
  return `A previous citation-extraction pass for a psychiatry PRITE question bank produced quotes that FAILED exact-verbatim verification — each wasn't a real character-for-character substring of the source text (likely paraphrased, or a wrong-but-plausible continuation). Your job: find an ACTUAL exact substring that supports the same point, or confirm none exists.

Read ${INPUT_FILE} — a JSON array of failed items ({id, section_num, quote, supports, note}). Find and process ONLY these ids: ${JSON.stringify(ids)}. Ignore all other ids in the file.

For EACH id:
1. Read ${BASE}/reference/section_index_full.json, find its section_num, get md_line_start/md_line_end.
2. Read that line range from ${BASE}/reference/kaplan-sadock-10e.md (offset=md_line_start, limit=md_line_end-md_line_start+1).
3. Search that section text for the ACTUAL exact wording near the failed quote's topic. Copy-paste the real text verbatim — do not retype from memory, do not paraphrase even slightly (no changing word order, tense, capitalization, or punctuation).
4. If you genuinely cannot find any real passage supporting this point in this section, set fixed_quote to null.

Return results for EVERY id listed above via the structured output tool.`
}

phase('Retry')

// Cheap, small load: just the id list, not the bulky quote/note text.
const idsResult = await agent(
  `Read ${INPUT_FILE} — a JSON array of objects each with an "id" field. Output ONLY the list of "id" values (nothing else, no quotes/notes/section_nums) via the structured output tool.`,
  { schema: IDS_SCHEMA, label: 'load-retry-ids' }
)
const allIds = idsResult.ids
log(`${allIds.length} failed citations to retry`)

const batches = []
for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
  batches.push(allIds.slice(i, i + BATCH_SIZE))
}

const raw = await pipeline(
  batches,
  (ids) => agent(retryBatchPrompt(ids), { schema: RETRY_SCHEMA, label: `retry-batch-${ids.length}`, model: 'haiku' })
)

return raw.filter(Boolean).flatMap((r) => r.results)
