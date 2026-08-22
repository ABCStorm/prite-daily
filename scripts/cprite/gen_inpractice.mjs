#!/usr/bin/env node
// Generate "In practice" stills for the CPRITE child bank.
//
//   node scripts/cprite/gen_inpractice.mjs --year 2023 --dry-run
//   node scripts/cprite/gen_inpractice.mjs --year 2023 --jobs 4 --quality medium
//
// Writes enrichment/illustrations/images/cprite-YYYY/cYYYY-NNNN.webp
// Keys match ScenarioIllustration (cYYYY-NNNN) so they never collide with PRITE.
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STYLE, ROOT, findImage, pool, stripBottomLine } from '../illustrations/lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const BANK = join(ROOT, 'public', 'data', 'cprite_questions.json')
const ERR_LOG = join(ROOT, 'enrichment', 'illustrations', 'errors-cprite.jsonl')

for (const f of ['.env.local', '.env']) {
  const p = join(ROOT, f)
  if (!existsSync(p)) continue
  for (const line of (await readFile(p, 'utf8')).split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : d }
const has = (f) => process.argv.includes(f)
const DRY = has('--dry-run')
const YEAR = arg('--year', '')
const CONC = parseInt(arg('--jobs', '4'), 10)
const QUALITY = arg('--quality', 'medium')
const KEY = process.env.OPENAI_API_KEY
const PRICE = { low: 0.005, medium: 0.011, high: 0.036 }

const SAFETY =
  'Depict a single calm clinical encounter. Center the resident and caregivers. ' +
  'If a child or adolescent is present they are fully clothed, not crying or injured, ' +
  'and not being physically examined. No self-harm, violence, or injection drug use. ' +
  'No readable text, labels, charts, or signage.\n\n'

function examYear(q) {
  const n = q.cprite?.exam_year || parseInt(String(q.year || '').replace(/\D/g, ''), 10)
  return Number.isFinite(n) ? n : null
}

function qid(q) {
  return `c${examYear(q)}-${String(q.q_index).padStart(4, '0')}`
}

function outDirFor(year) {
  return join(ROOT, 'enrichment', 'illustrations', 'images', `cprite-${year}`)
}

async function generate(prompt) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: 'gpt-image-1-mini',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: QUALITY,
      output_format: 'webp',
      output_compression: 80,
      moderation: 'low',
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body?.error?.message || `HTTP ${res.status}`)
    err.status = res.status
    err.code = body?.error?.code || body?.error?.type || String(res.status)
    throw err
  }
  return { b64: body.data[0].b64_json }
}

async function withRetry(prompt, id) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await generate(prompt)
    } catch (e) {
      const blocked = /moderation|safety|content policy|rejected/i.test(e.message) || e.code === 'moderation_blocked'
      const transport = e.status === undefined
      const retryable = !blocked && (transport || e.status === 429 || e.status >= 500)
      if (!retryable || attempt === 4) {
        await appendFile(ERR_LOG, JSON.stringify({ id, blocked, code: e.code, message: e.message, at: new Date().toISOString() }) + '\n')
        return { error: e.message, blocked }
      }
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt + Math.random() * 500))
    }
  }
}

const rows = JSON.parse(await readFile(BANK, 'utf8'))
const wantedYear = YEAR ? parseInt(YEAR, 10) : null
const jobs = []
const dirs = new Set()
for (const q of rows) {
  const year = examYear(q)
  if (!year) continue
  if (wantedYear && year !== wantedYear) continue
  const id = qid(q)
  const dir = outDirFor(year)
  if (findImage(dir, id)) continue
  const scenario = stripBottomLine(q.clinical_application || '')
  if (!scenario) continue
  dirs.add(dir)
  jobs.push({
    id,
    file: join(dir, `${id}.webp`),
    prompt: `${SAFETY}${scenario}\n\n${STYLE}`,
  })
}
for (const dir of dirs) await mkdir(dir, { recursive: true })

const unit = PRICE[QUALITY] ?? PRICE.medium
const label = wantedYear ? `cprite-${wantedYear}` : 'cprite'
console.log(`${label} | ${jobs.length} to make | ~$${(jobs.length * unit).toFixed(2)} at $${unit}/img ${QUALITY}`)
if (DRY) {
  for (const j of jobs.slice(0, 4)) console.log(`\n--- ${j.id} (${j.prompt.length} chars)\n${j.prompt.slice(0, 400)}`)
  console.log(`\nDRY RUN — ${jobs.length} images would be generated.`)
  process.exit(0)
}
if (!KEY) {
  console.error('OPENAI_API_KEY is not set')
  process.exit(1)
}

const t0 = Date.now()
let ok = 0, blocked = 0, failed = 0
await pool(jobs, CONC, async (j) => {
  const out = await withRetry(j.prompt, j.id)
  if (out?.b64) {
    await writeFile(j.file, Buffer.from(out.b64, 'base64'))
    ok++
    process.stdout.write(`ok ${j.id}\n`)
  } else if (out?.blocked) {
    blocked++
    process.stdout.write(`BLOCKED ${j.id} ${out.error}\n`)
  } else {
    failed++
    process.stdout.write(`FAIL ${j.id} ${out?.error}\n`)
  }
})
console.log(`done ${ok} ok / ${blocked} blocked / ${failed} fail in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
