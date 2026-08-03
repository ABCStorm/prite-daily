// STEP 3 -- blinded scoring of the A/B/C arms.
//
//   node scripts/illustrations/judge.mjs --sample 12
//   node scripts/illustrations/judge.mjs --sample 12 --model sonnet
//
// Every generated image is copied into a scratch dir under an anonymous name, so
// the judging model never sees which arm produced it (the arm lives only in a key
// file it is never shown). Scores land in enrichment/illustrations/scores.json and
// are aggregated per arm.
import { readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { loadScenarios, stripBottomLine, sample, pool, findImage, OUT } from './lib.mjs'

const exec = promisify(execFile)
const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : d }
const SAMPLE = parseInt(arg('--sample', '12'), 10)
const MODEL = arg('--model', 'sonnet')
const JOBS = parseInt(arg('--jobs', '4'), 10)
// Folders under images/ to compare. Defaults to the prompt A/B/C; a model
// bake-off passes its own labels, e.g. --dirs raw,raw-mini-med,raw-imagen4f
const ARMS = arg('--dirs', 'raw,lead,llm').split(',')
const OUT_FILE = arg('--out', 'scores.json')

const IMG_DIR = join(OUT, 'images')
const BLIND = join(OUT, 'blind')
const SCORES = join(OUT, OUT_FILE)

const SYSTEM = `You are grading illustrations for a psychiatry residency study app. A resident reads a
short clinical scenario, then sees one image meant to help them picture it and remember the teaching
point. You will be shown the scenario and one candidate image. Judge only what is actually in the
image.

Score each 1-5 (5 best):
- fidelity: does it show THIS scenario's setting, people, and action -- not merely a generic
  medical scene?
- plausibility: does it read as a real clinical moment (right room, right roles, sane equipment,
  right patient age)?
- craft: anatomy, hands, faces, composition. Deduct hard for garbled anatomy or any rendered text.
- usefulness: would this image actually help a resident recall this specific teaching point?

Also return "defects": zero or more of ["text_in_image","garbled_anatomy","wrong_setting",
"wrong_patient_age","generic_stock","too_busy","distressing","empty_or_abstract"].
And "note": at most 12 words.

Output NOTHING but one JSON object:
{"fidelity":n,"plausibility":n,"craft":n,"usefulness":n,"defects":[...],"note":"..."}`

async function judgeOne(item) {
  const user =
    `SCENARIO:\n${item.scenario}\n\n` +
    `Read the image at this path and grade it: ${item.blindPath}`
  try {
    const { stdout } = await exec(
      'claude',
      ['-p', user, '--model', MODEL, '--system-prompt', SYSTEM, '--max-turns', '3',
       '--allowedTools', 'Read', '--add-dir', BLIND],
      { maxBuffer: 8 * 1024 * 1024, timeout: 6 * 60 * 1000 }
    )
    const m = stdout.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('no JSON in judge output')
    return JSON.parse(m[0])
  } catch (e) {
    console.error(`  ! judge failed for ${item.blind}: ${e.message}`)
    return null
  }
}

async function main() {
  const rows = sample(await loadScenarios(), SAMPLE)
  await rm(BLIND, { recursive: true, force: true })
  await mkdir(BLIND, { recursive: true })

  // Build the blinded set. Shuffling the pairing means adjacent blind ids are not
  // the same arm, so even an accidental ordering cue carries no signal.
  const items = []
  for (const r of rows) {
    for (const arm of ARMS) {
      const found = findImage(join(IMG_DIR, arm), r.id)
      if (!found) continue
      items.push({ id: r.id, arm, src: found.path, ext: found.ext, scenario: stripBottomLine(r.scenario) })
    }
  }
  if (!items.length) {
    console.error(`no images found under ${IMG_DIR} -- run gen-images.mjs --arm all first`)
    process.exit(1)
  }
  const shuffled = sample(items, items.length, 7)
  for (let i = 0; i < shuffled.length; i++) {
    shuffled[i].blind = `img_${String(i + 1).padStart(4, '0')}.${shuffled[i].ext}`
    shuffled[i].blindPath = join(BLIND, shuffled[i].blind)
    await copyFile(shuffled[i].src, shuffled[i].blindPath)
  }
  console.log(`judging ${shuffled.length} images across ${new Set(shuffled.map(s => s.arm)).size} arms with ${MODEL}`)

  const results = await pool(shuffled, JOBS, async (it, i) => {
    const s = await judgeOne(it)
    process.stdout.write(`\r  ${i + 1}/${shuffled.length}   `)
    return s ? { id: it.id, arm: it.arm, blind: it.blind, ...s } : null
  })
  const scored = results.filter(Boolean)
  await writeFile(SCORES, JSON.stringify(scored, null, 1))
  console.log(`\n${scored.length} scored -> ${SCORES}\n`)

  const AXES = ['fidelity', 'plausibility', 'craft', 'usefulness']
  const table = []
  for (const arm of ARMS) {
    const rowsA = scored.filter((s) => s.arm === arm)
    if (!rowsA.length) continue
    const mean = (k) => rowsA.reduce((a, s) => a + (s[k] || 0), 0) / rowsA.length
    const overall = AXES.reduce((a, k) => a + mean(k), 0) / AXES.length
    const defects = rowsA.flatMap((s) => s.defects || [])
    const top = Object.entries(defects.reduce((a, d) => (a[d] = (a[d] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]).slice(0, 3)
    table.push({
      arm, n: rowsA.length,
      ...Object.fromEntries(AXES.map((k) => [k, +mean(k).toFixed(2)])),
      overall: +overall.toFixed(2),
      defects: top.map(([d, c]) => `${d}x${c}`).join(' ') || '-',
    })
  }
  console.table(table)

  // Per-scenario head-to-head: how often does each arm win outright?
  const wins = Object.fromEntries(ARMS.map((a) => [a, 0]))
  let ties = 0
  for (const r of rows) {
    const set = scored.filter((s) => s.id === r.id)
    if (set.length < 2) continue
    const tot = (s) => AXES.reduce((a, k) => a + (s[k] || 0), 0)
    const best = Math.max(...set.map(tot))
    const winners = set.filter((s) => tot(s) === best)
    if (winners.length > 1) ties++
    else wins[winners[0].arm]++
  }
  console.log(`head-to-head wins: ${Object.entries(wins).map(([a, n]) => `${a} ${n}`).join(' | ')} | ties ${ties}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
