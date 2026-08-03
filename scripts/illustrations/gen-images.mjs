// STEP 2 -- generate illustrations with OpenAI gpt-image-1-mini.
//
//   OPENAI_API_KEY=sk-... node scripts/illustrations/gen-images.mjs --arm llm --sample 12
//   OPENAI_API_KEY=sk-... node scripts/illustrations/gen-images.mjs --arm all --sample 12   # A/B/C
//   OPENAI_API_KEY=sk-... node scripts/illustrations/gen-images.mjs --arm llm               # full run
//   node scripts/illustrations/gen-images.mjs --arm all --sample 12 --dry-run               # no API calls
//
// Arms (see lib.mjs):
//   raw   the whole "In practice" paragraph, verbatim  -- the no-prompt-writing control
//   lead  its first sentence only, extracted with a regex -- the free baseline
//   llm   the Haiku-authored 25-45 word scene prompt from prompts.json
//
// Resumable: an existing output file for an id is skipped. Refusals and errors are
// appended to errors.jsonl so a moderation-blocked rate can be measured, not guessed.
import { readFile, writeFile, mkdir, appendFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadScenarios, ARMS, pool, sample, findImage, OUT, ROOT } from './lib.mjs'

// Pick up OPENAI_API_KEY from .env.local without pulling in dotenv.
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

const ARM = arg('--arm', 'llm')
// Output folder name. Defaults to the arm, but a model bake-off writes each model
// to its own folder (raw-mini-med, raw-imagen4f) so the arms stay comparable.
const LABEL = arg('--label', null)
const PROVIDER = (arg('--provider', process.env.IMAGE_PROVIDER || 'openai')).toLowerCase()
const SAMPLE = arg('--sample') ? parseInt(arg('--sample'), 10) : null
const LIMIT = arg('--limit') ? parseInt(arg('--limit'), 10) : null
const DRY = has('--dry-run')
const CONC = parseInt(arg('--jobs', process.env.IMAGE_CONCURRENCY || '6'), 10)
const MODEL_DEFAULT = { openai: 'gpt-image-1-mini', gemini: 'imagen-4.0-fast-generate-001', fal: 'fal-ai/flux/schnell' }
const MODEL = arg('--model', process.env.IMAGE_MODEL || MODEL_DEFAULT[PROVIDER] || 'gpt-image-1-mini')
const SIZE = arg('--size', process.env.IMAGE_SIZE || '1024x1024')
const QUALITY = arg('--quality', process.env.IMAGE_QUALITY || 'low')
const FORMAT = arg('--format', process.env.IMAGE_FORMAT || 'webp')
const COMPRESSION = parseInt(arg('--compression', process.env.IMAGE_COMPRESSION || '80'), 10)
// "low" is the correct setting for clinical material: the default filter treats
// ordinary psychiatric scenes (restraint, malnutrition, distress) as unsafe.
const MODERATION = arg('--moderation', process.env.IMAGE_MODERATION || 'low')
const KEY = { openai: process.env.OPENAI_API_KEY, gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY, fal: process.env.FAL_KEY }[PROVIDER]
const KEY_NAME = { openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY', fal: 'FAL_KEY' }[PROVIDER]
// Imagen's person policy. Clinical scenes are almost all adults; "allow_all"
// is required for the paediatric ones and must be requested for the account.
const PERSON_GEN = arg('--person-gen', process.env.IMAGE_PERSON_GEN || 'allow_adult')

const IMG_DIR = join(OUT, 'images')
const ERR_LOG = join(OUT, 'errors.jsonl')
const USAGE_LOG = join(OUT, 'usage.jsonl')

// Published list price, USD per image.
const PRICE = {
  openai: { low: 0.005, medium: 0.011, high: 0.036 },
  gemini: { low: 0.02, medium: 0.02, high: 0.02 },   // imagen-4 fast is flat-rate
  fal: { low: 0.003, medium: 0.003, high: 0.003 },   // default = flux schnell
}
// fal bills per model, not per quality tier, so the flat table above under-reports
// anything but schnell. Longest matching prefix wins.
const FAL_PRICE = { 'flux/schnell': 0.003, 'fast-sdxl': 0.005, 'flux/krea': 0.025, 'flux/dev': 0.025, 'hidream-i1-fast': 0.01, 'hidream-i1-dev': 0.02, 'hidream-i1-full': 0.03 }

// Imagen returns PNG regardless of what we ask for; the extension has to match
// the bytes or the judge's Read call and the contact sheet's data URI both break.
const EXT = PROVIDER === 'openai' ? FORMAT : 'png'

async function generateOpenAI(prompt) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL, prompt, n: 1, size: SIZE, quality: QUALITY,
      output_format: FORMAT, output_compression: COMPRESSION, moderation: MODERATION,
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body?.error?.message || `HTTP ${res.status}`)
    err.status = res.status
    err.code = body?.error?.code || body?.error?.type || String(res.status)
    throw err
  }
  return { b64: body.data[0].b64_json, usage: body.usage || null }
}

// Google Imagen via the Gemini API :predict endpoint.
async function generateGemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:predict?key=${KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1, aspectRatio: '1:1', personGeneration: PERSON_GEN },
      }),
    }
  )
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body?.error?.message || `HTTP ${res.status}`)
    err.status = res.status
    err.code = body?.error?.status || String(res.status)
    throw err
  }
  const b64 = body?.predictions?.[0]?.bytesBase64Encoded
  if (!b64) {
    // Imagen returns 200 with no prediction when its safety filter trips.
    const err = new Error(`no image returned (safety filter): ${JSON.stringify(body).slice(0, 200)}`)
    err.code = 'moderation_blocked'
    throw err
  }
  return { b64, usage: null }
}

// fal.ai (FLUX) synchronous endpoint -> images[].url, which we then fetch.
async function generateFal(prompt) {
  const res = await fetch(`https://fal.run/${MODEL}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Key ${KEY}` },
    body: JSON.stringify({ prompt, image_size: 'square_hd', num_images: 1 }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(body?.detail || `HTTP ${res.status}`)
    err.status = res.status
    err.code = String(res.status)
    throw err
  }
  const url = body?.images?.[0]?.url
  if (!url) throw new Error('fal returned no image url')
  const img = await fetch(url)
  // fal models differ: FLUX hands back JPEG, SDXL PNG. The extension has to match
  // the bytes or the judge's Read and the contact sheet's data URI both misfire.
  const ct = img.headers.get('content-type') || ''
  const ext = /jpe?g/.test(ct) ? 'jpg' : /webp/.test(ct) ? 'webp' : 'png'
  return { b64: Buffer.from(await img.arrayBuffer()).toString('base64'), usage: null, ext }
}

const generate = { openai: generateOpenAI, gemini: generateGemini, fal: generateFal }[PROVIDER]

async function withRetry(prompt, id, arm) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await generate(prompt)
    } catch (e) {
      const blocked = /moderation|safety|content policy|rejected/i.test(e.message) || e.code === 'moderation_blocked'
      // A dropped connection surfaces as a bare TypeError "fetch failed" with no
      // .status and no .code, which an `e.status >= 500` test reads as permanent.
      // On the first full run that silently dropped 6 images in one second when the
      // network blipped -- all six workers at once. Anything without an HTTP status
      // is a transport failure and must be retried.
      const transport = e.status === undefined
      const retryable = !blocked && (transport || e.status === 429 || e.status >= 500)
      if (!retryable || attempt === 4) {
        await appendFile(ERR_LOG, JSON.stringify({ id, arm, blocked, code: e.code, message: e.message, at: new Date().toISOString() }) + '\n')
        return { error: e.message, blocked }
      }
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt + Math.random() * 500))
    }
  }
}

async function main() {
  const arms = ARM === 'all' ? ['raw', 'lead', 'llm'] : ARM.split(',')
  for (const a of arms) if (!ARMS[a]) throw new Error(`unknown arm "${a}" (raw|lead|llm|all)`)
  if (!generate) throw new Error(`unknown --provider "${PROVIDER}" (openai|gemini|fal)`)
  if (!DRY && !KEY) throw new Error(`${KEY_NAME} is not set. Add it to .env.local or export it; or pass --dry-run.`)
  if (LABEL && arms.length > 1) throw new Error('--label names one output folder, so pass a single --arm with it')

  let rows = await loadScenarios()
  if (SAMPLE) rows = sample(rows, SAMPLE)

  if (arms.includes('llm')) {
    const pf = join(OUT, 'prompts.json')
    if (!existsSync(pf)) throw new Error(`${pf} missing -- run build-prompts.mjs first`)
    const prompts = JSON.parse(await readFile(pf, 'utf8'))
    rows = rows.map((r) => ({ ...r, llm_prompt: prompts[r.id]?.prompt, alt: prompts[r.id]?.alt }))
    const missing = rows.filter((r) => !r.llm_prompt).length
    if (missing) {
      console.warn(`! ${missing} of ${rows.length} have no authored prompt yet -- skipping those in the llm arm`)
    }
  }

  const jobs = []
  for (const arm of arms) {
    const dir = LABEL || arm
    await mkdir(join(IMG_DIR, dir), { recursive: true })
    for (const r of rows) {
      if (arm === 'llm' && !r.llm_prompt) continue
      const file = join(IMG_DIR, dir, `${r.id}.${EXT}`)
      // Resume check must look for any container, since fal picks the format.
      if (findImage(join(IMG_DIR, dir), r.id)) continue
      jobs.push({ arm: dir, row: r, file, prompt: ARMS[arm](r) })
    }
  }
  const work = LIMIT ? jobs.slice(0, LIMIT) : jobs

  const falKey = Object.keys(FAL_PRICE).filter((k) => MODEL.includes(k)).sort((a, b) => b.length - a.length)[0]
  const unit = PROVIDER === 'fal' && falKey ? FAL_PRICE[falKey] : (PRICE[PROVIDER][QUALITY] ?? PRICE[PROVIDER].low)
  console.log(`${PROVIDER}/${MODEL} ${SIZE} ${QUALITY} ${EXT} | arms: ${arms.join(',')}${LABEL ? ` -> ${LABEL}/` : ''} | ${work.length} images to make`)
  console.log(`estimated cost: $${(work.length * unit).toFixed(2)} at $${unit}/image`)
  if (DRY) {
    for (const j of work.slice(0, 6)) console.log(`\n--- ${j.arm} ${j.row.id} (${j.prompt.length} chars)\n${j.prompt}`)
    console.log(`\nDRY RUN -- no API calls. ${work.length} images would be generated.`)
    return
  }

  const t0 = Date.now()
  let ok = 0, blocked = 0, failed = 0, bytes = 0
  await pool(work, CONC, async (j) => {
    const out = await withRetry(j.prompt, j.row.id, j.arm)
    if (out?.b64) {
      const buf = Buffer.from(out.b64, 'base64')
      await writeFile(out.ext ? j.file.replace(/\.[^.]+$/, `.${out.ext}`) : j.file, buf)
      bytes += buf.length
      ok++
      if (out.usage) await appendFile(USAGE_LOG, JSON.stringify({ id: j.row.id, arm: j.arm, ...out.usage }) + '\n')
    } else if (out?.blocked) blocked++
    else failed++
    const n = ok + blocked + failed
    process.stdout.write(`\r  ${n}/${work.length}  ok ${ok}  blocked ${blocked}  failed ${failed}  ${((Date.now() - t0) / 1000 / n).toFixed(1)}s/img   `)
  })
  console.log(
    `\ndone in ${((Date.now() - t0) / 60000).toFixed(1)} min | ` +
    `${ok} images, avg ${(bytes / Math.max(ok, 1) / 1024).toFixed(0)} KB | ` +
    `blocked ${blocked} (${(100 * blocked / Math.max(work.length, 1)).toFixed(1)}%) | failed ${failed}`
  )
  console.log(`spend: ~$${(ok * unit).toFixed(2)} | images in ${IMG_DIR}`)
  if (blocked) console.log(`blocked prompts logged to ${ERR_LOG}`)
}

main().catch((e) => { console.error(String(e.message || e)); process.exit(1) })
