// Shared helpers for the "In practice" illustration pipeline.
//
// Source of truth for question data is extraction/output/questions_all.json
// (the 16 MB file in git). public/data/questions.json is a deliberate 2-byte []
// stub -- see HANDOFF.md "Question access control". Never read the stub here and
// never write the real bank into public/.
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const BANK = join(ROOT, 'extraction', 'output', 'questions_all.json')
export const OUT = join(ROOT, 'enrichment', 'illustrations')

// One house style for every image so 5,000 illustrations read as a single set.
// Applied IDENTICALLY to all three arms, so an A/B test isolates the prompt body.
export const STYLES = {
  // The default house style: unmistakably a drawing, so no one mistakes a
  // generated patient for a real clinical photograph.
  illustration:
    'Warm editorial medical illustration, soft flat shapes with clean linework, ' +
    'muted palette of teal, warm sand and slate, gentle even lighting, realistic ' +
    'human proportions, calm and respectful tone. No lettering, no captions, no ' +
    'watermarks, no signage, no readable text anywhere in the image.',
  // Photojournalistic alternative. Asking a model for photorealism while the style
  // string says "flat shapes" is self-contradictory -- every model obeys the style
  // words and returns vector art, which is exactly what happened on the first fal
  // round. A photoreal comparison MUST swap this in.
  photo:
    'Documentary photograph, natural available light, shallow depth of field, 50mm lens, ' +
    'candid unposed moment, realistic skin texture and fabric, muted colour grade, ' +
    'photojournalistic composition. No lettering, no captions, no watermarks, no ' +
    'signage, no readable text anywhere in the image.',
}
export const STYLE_NAME = process.env.IMAGE_STYLE || 'illustration'
export const STYLE = STYLES[STYLE_NAME] || STYLES.illustration

/** Stable per-question id: decks repeat q_index across years. */
export const qid = (q) => `${q.year}-${String(q.q_index).padStart(4, '0')}`

export async function loadBank() {
  const arr = JSON.parse(await readFile(BANK, 'utf8'))
  if (!Array.isArray(arr) || arr.length < 100) {
    throw new Error(`Bank at ${BANK} looks wrong (${arr.length} rows). Expected ~5,100.`)
  }
  return arr
}

export async function loadScenarios() {
  return (await loadBank())
    .filter((q) => q.clinical_application && q.clinical_application.trim())
    .map((q) => ({
      id: qid(q),
      year: q.year,
      q_index: q.q_index,
      category: q.prite_category || 'uncategorized',
      label: q.prite_label || '',
      stem: (q.stem || '').trim(),
      answer: (q.answer_text || '').trim(),
      scenario: q.clinical_application.trim(),
    }))
}

/**
 * A deterministic, zero-cost prompt: the scenario's opening sentence, which in
 * this bank is almost always the scene-setting one ("A resident evaluates a
 * fourth-grade student who..."). This is arm B -- the baseline the LLM writer
 * has to beat to justify its existence.
 */
export function leadSentence(scenario) {
  const trimmed = scenario.replace(/\s+/g, ' ').trim()
  // Don't split on abbreviations/initials that end in a period.
  const guarded = trimmed.replace(/\b(Dr|Mr|Mrs|Ms|Prof|vs|e\.g|i\.e|approx)\./gi, (m) => m.replace('.', ''))
  const m = guarded.match(/^[\s\S]*?[.!?](?=\s|$)/)
  const first = (m ? m[0] : guarded.slice(0, 220)).replace(//g, '.')
  // Some openers are one short clause; pull a second sentence if the first is thin.
  if (first.length < 80) {
    const two = guarded.match(/^[\s\S]*?[.!?](?=\s)[\s\S]*?[.!?](?=\s|$)/)
    if (two) return two[0].replace(//g, '.').trim()
  }
  return first.trim()
}

/** The scenario ends with a "Bottom line:" teaching sentence -- never illustratable. */
export function stripBottomLine(scenario) {
  return scenario.replace(/\s*Bottom line:[\s\S]*$/i, '').trim()
}

export const ARMS = {
  // A: whole scenario, verbatim. What you'd send if you skipped prompt-writing.
  raw: (s) => `${stripBottomLine(s.scenario)}\n\n${STYLE}`,
  // B: deterministic first-sentence extraction. Zero LLM cost.
  lead: (s) => `${leadSentence(stripBottomLine(s.scenario))}\n\n${STYLE}`,
  // C: Haiku-authored scene prompt (from prompts.json).
  llm: (s) => `${s.llm_prompt}\n\n${STYLE}`,
}

/** Pull the first JSON array out of model stdout, tolerating fences/preamble. */
export function extractJsonArray(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('[')
  if (start === -1) throw new Error('no JSON array in output')
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < body.length; i++) {
    const c = body[i]
    if (esc) { esc = false; continue }
    if (c === '\\') { esc = true; continue }
    if (c === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (c === '[') depth++
    else if (c === ']' && --depth === 0) return JSON.parse(body.slice(start, i + 1))
  }
  throw new Error('unterminated JSON array')
}

/**
 * Locate a generated image for (folder, id). Providers hand back different
 * container formats -- OpenAI honours output_format=webp, Imagen and fal return
 * PNG/JPEG -- so a bake-off folder can hold any of them.
 */
export function findImage(dir, id) {
  for (const ext of ['webp', 'png', 'jpg', 'jpeg']) {
    const p = join(dir, `${id}.${ext}`)
    if (existsSync(p)) return { path: p, ext }
  }
  return null
}

export async function pool(items, concurrency, worker) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const i = next++
        if (i >= items.length) return
        results[i] = await worker(items[i], i)
      }
    })
  )
  return results
}

/** Deterministic sample so every arm and every re-run sees the same questions. */
export function sample(rows, n, seed = 42) {
  let s = seed
  const rand = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const copy = rows.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy.slice(0, n)
}
