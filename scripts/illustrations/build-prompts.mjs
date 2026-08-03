// STEP 1 -- author one short image prompt per "In practice" scenario.
//
// Engine is the `claude` CLI in headless mode (`claude -p --model haiku`), so this
// runs on the Claude subscription and costs no API money. Output is a single
// resumable file: enrichment/illustrations/prompts.json, keyed by question id.
//
//   node scripts/illustrations/build-prompts.mjs --limit 60          # pilot
//   node scripts/illustrations/build-prompts.mjs                     # all 5,096
//   node scripts/illustrations/build-prompts.mjs --sample 24         # deterministic subset
//   node scripts/illustrations/build-prompts.mjs --batch 20 --jobs 4
//
// Resumable: every completed batch is flushed to disk, and a re-run skips any id
// that already has a prompt. Safe to Ctrl-C.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { loadScenarios, stripBottomLine, extractJsonArray, pool, sample, OUT } from './lib.mjs'

const exec = promisify(execFile)
const arg = (flag, dflt) => {
  const i = process.argv.indexOf(flag)
  return i > -1 ? process.argv[i + 1] : dflt
}
const BATCH = parseInt(arg('--batch', '20'), 10)
const JOBS = parseInt(arg('--jobs', '4'), 10)
const LIMIT = arg('--limit') ? parseInt(arg('--limit'), 10) : null
const SAMPLE = arg('--sample') ? parseInt(arg('--sample'), 10) : null
const MODEL = arg('--model', 'haiku')
const IDS = arg('--ids', null)
const PROMPTS_FILE = join(OUT, 'prompts.json')

// Written as a system prompt so it is identical for every batch and cache-friendly.
const SYSTEM = `You are an art director for a psychiatry residency study app. Residents read a short
"In practice" clinical scenario after each exam question; you write the ONE image prompt that will
illustrate it, so the resident can picture the patient, the setting, and the moment the teaching
point lands.

For each scenario you receive, return an image prompt that:

1. DEPICTS A SINGLE CONCRETE MOMENT someone could photograph -- a specific room, specific people,
   specific posture and action. Never illustrate a diagnosis, a mechanism, a drug, or a statistic.
   If the scenario is abstract (research design, epidemiology, ethics doctrine), fall back to the
   human situation it would arise in: a clinician at a screen, a team around a table, a family
   in a waiting area.
2. IS SHORT: 25-45 words. One or two sentences. No lists.
3. NAMES THE SETTING FIRST (emergency department bay, inpatient dayroom, outpatient office, memory
   clinic, NICU, jail intake, group therapy room, family living room), then who is present and
   their approximate age and posture, then what is visibly happening.
4. SHOWS OBSERVABLE BEHAVIOUR, not internal states: not "a depressed patient" but "a man in his
   fifties sitting forward, hands loose between his knees, gaze on the floor."
5. IS SAFE TO RENDER. Never depict self-harm, a suicide attempt or its aftermath, violence,
   restraint or seclusion holds, injection drug use, nudity, or a distressed child being examined.
   When the scenario involves those, illustrate the CLINICAL ENCOUNTER around it instead -- the
   assessment interview, the safety conversation, the family meeting, the team huddle. This is both
   the appropriate image for a study app and what keeps the image model from refusing.
6. DE-IDENTIFIES. Generic people, no named or recognisable real person, no logos, no name badges.
   Vary age, gender and build across scenarios so the finished set does not look like one patient.
   Only state ethnicity/skin tone when the scenario's clinical point actually depends on it.
7. CONTAINS NO TEXT. Never ask for words, labels, charts with legible writing, signage or captions.
   Say "a clipboard", never "a chart reading BP 140/90".
8. OMITS ALL STYLE WORDS. No "illustration", "watercolour", "cinematic", "4k", "flat design",
   no palette or lighting instructions -- a house style is appended automatically downstream.
   Write only the content of the scene.

Also return "alt": a plain factual alt-text sentence (<= 20 words) describing the finished image
for a screen reader.

OUTPUT FORMAT -- output NOTHING but a JSON array, one object per input scenario, in the same order:
[{"id":"<the id given>","prompt":"...","alt":"..."}]
No prose, no markdown fences, no commentary.`

function batchInput(rows) {
  return rows
    .map(
      (r) =>
        `--- id: ${r.id} | topic: ${r.label || r.category}\n` +
        `SCENARIO: ${stripBottomLine(r.scenario)}`
    )
    .join('\n\n')
}

async function runBatch(rows, attempt = 1) {
  const user = `Write one image prompt for each of the ${rows.length} scenarios below.\n\n${batchInput(rows)}`
  try {
    const { stdout } = await exec(
      'claude',
      ['-p', user, '--model', MODEL, '--system-prompt', SYSTEM, '--max-turns', '1', '--disallowedTools', 'Bash,Edit,Write,Read'],
      { maxBuffer: 32 * 1024 * 1024, timeout: 10 * 60 * 1000 }
    )
    const parsed = extractJsonArray(stdout)
    const byId = new Map(parsed.filter((p) => p && p.id && p.prompt).map((p) => [String(p.id), p]))
    const got = rows.filter((r) => byId.has(r.id))
    if (got.length < rows.length * 0.8) throw new Error(`only ${got.length}/${rows.length} returned`)
    return got.map((r) => {
      const p = byId.get(r.id)
      return { id: r.id, prompt: String(p.prompt).trim(), alt: String(p.alt || '').trim(), model: MODEL }
    })
  } catch (e) {
    // Transient CLI/classifier blips are common at this volume; a systemic stop
    // (usage limit) is handled by the circuit breaker in main().
    if (attempt < 3) return runBatch(rows, attempt + 1)
    console.error(`  ! batch ${rows[0].id}..${rows[rows.length - 1].id} failed: ${e.message}`)
    return []
  }
}

async function main() {
  await mkdir(OUT, { recursive: true })
  let done = existsSync(PROMPTS_FILE) ? JSON.parse(await readFile(PROMPTS_FILE, 'utf8')) : {}

  let rows = await loadScenarios()
  if (SAMPLE) rows = sample(rows, SAMPLE)
  // --ids is the refusal-recovery path: author prompts for just the handful of
  // scenarios the image model refused, instead of the whole bank.
  if (IDS) {
    const want = new Set(IDS.split(',').map((s) => s.trim()).filter(Boolean))
    rows = rows.filter((r) => want.has(r.id))
    console.log(`--ids: ${rows.length} of ${want.size} requested ids matched`)
  }
  const todo = rows.filter((r) => !done[r.id])
  const work = LIMIT ? todo.slice(0, LIMIT) : todo
  console.log(`${rows.length} scenarios | ${Object.keys(done).length} already written | doing ${work.length}`)
  if (!work.length) return

  const batches = []
  for (let i = 0; i < work.length; i += BATCH) batches.push(work.slice(i, i + BATCH))

  const t0 = Date.now()
  let finished = 0, consecutiveEmpty = 0
  await pool(batches, JOBS, async (b) => {
    if (consecutiveEmpty >= 5) return // circuit breaker: quota exhausted, stop burning calls
    const out = await runBatch(b)
    consecutiveEmpty = out.length ? 0 : consecutiveEmpty + 1
    for (const o of out) done[o.id] = o
    await writeFile(PROMPTS_FILE, JSON.stringify(done, null, 1)) // flush every batch
    finished += b.length
    const rate = finished / ((Date.now() - t0) / 1000)
    process.stdout.write(
      `\r  ${finished}/${work.length} scenarios  ${rate.toFixed(1)}/s  ` +
        `eta ${(((work.length - finished) / rate) / 60).toFixed(1)} min   `
    )
  })
  console.log(`\ndone: ${Object.keys(done).length} prompts in ${PROMPTS_FILE}`)
  if (consecutiveEmpty >= 5) console.error('CIRCUIT BREAKER TRIPPED -- 5 empty batches in a row. Re-run to resume.')

  const lens = Object.values(done).map((p) => p.prompt.split(/\s+/).length).sort((a, b) => a - b)
  console.log(`prompt words p10/p50/p90: ${lens[(lens.length * 0.1) | 0]}/${lens[(lens.length * 0.5) | 0]}/${lens[(lens.length * 0.9) | 0]}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
