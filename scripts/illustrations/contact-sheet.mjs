// STEP 4 -- a side-by-side HTML sheet so a human can settle the A/B/C question.
//
//   node scripts/illustrations/contact-sheet.mjs --sample 12 && open enrichment/illustrations/compare.html
//
// One row per scenario, one column per arm, scenario text and the exact prompt
// sent for each arm underneath. Images are inlined as data URIs so the file can be
// opened or emailed on its own.
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadScenarios, ARMS, stripBottomLine, sample, findImage, OUT } from './lib.mjs'

const arg = (f, d) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] : d }
const SAMPLE = parseInt(arg('--sample', '12'), 10)
const ARM_KEYS = arg('--dirs', 'raw,lead,llm').split(',')
const SCORE_FILE = arg('--scores', 'scores.json')
const OUT_HTML = arg('--out', 'compare.html')
// Folders that are a model bake-off reuse the "raw" prompt, so their label is the
// model, not the arm. Anything unlisted falls back to the folder name.
const ARM_LABEL = {
  raw: 'A · raw paragraph',
  lead: 'B · first sentence (free)',
  llm: 'C · authored prompt (Haiku)',
  'raw-mini-med': 'gpt-image-1-mini · medium',
  'raw-imagen4f': 'Imagen 4 Fast',
  'raw-flux-schnell': 'FLUX.1 schnell',
  'raw-flux-krea': 'FLUX.1 Krea dev',
  'raw-hidream': 'HiDream-I1',
  'raw-sdxl': 'SDXL (fast) — ignored the style',
  'photo-mini-med': 'gpt-image-1-mini medium · PHOTO',
  'photo-flux-schnell': 'FLUX schnell · PHOTO',
  'photo-flux-krea': 'FLUX Krea dev · PHOTO',
  'photo-hidream': 'HiDream-I1 · PHOTO',
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// Click any image to enlarge; arrow keys step through in DOM order, which is
// variant-by-variant across one scenario before moving to the next -- i.e. exactly
// the order you want when comparing arms. No template literals or backticks in
// here: this string is interpolated into one.
const LIGHTBOX = [
  "var imgs = [].slice.call(document.querySelectorAll('table img'));",
  "var lb = document.getElementById('lb'), big = lb.querySelector('img'), who = lb.querySelector('.who'), i = -1;",
  "function show(n){",
  "  if (n < 0 || n >= imgs.length) return;",
  "  i = n; var c = imgs[n]; big.src = c.src;",
  "  var td = c.closest('td'), arm = td.querySelector('.arm');",
  "  var head = td.closest('tr').previousElementSibling, qid = head ? head.querySelector('.qid') : null;",
  "  who.textContent = (qid ? qid.textContent + '  \\u2014  ' : '') + (arm ? arm.textContent : '');",
  "  lb.classList.add('on');",
  "}",
  "function hide(){ lb.classList.remove('on'); big.removeAttribute('src'); }",
  "imgs.forEach(function(c, n){ c.addEventListener('click', function(){ show(n); }); });",
  "lb.addEventListener('click', function(e){",
  "  if (e.target.classList.contains('prev')) show(i - 1);",
  "  else if (e.target.classList.contains('next')) show(i + 1);",
  "  else hide();",
  "});",
  "document.addEventListener('keydown', function(e){",
  "  if (!lb.classList.contains('on')) return;",
  "  if (e.key === 'Escape') hide();",
  "  else if (e.key === 'ArrowRight') show(i + 1);",
  "  else if (e.key === 'ArrowLeft') show(i - 1);",
  "});",
].join('\n')

async function main() {
  let rows = sample(await loadScenarios(), SAMPLE)
  const pf = join(OUT, 'prompts.json')
  const prompts = existsSync(pf) ? JSON.parse(await readFile(pf, 'utf8')) : {}
  rows = rows.map((r) => ({ ...r, llm_prompt: prompts[r.id]?.prompt }))

  const scoresFile = join(OUT, SCORE_FILE)
  const scores = existsSync(scoresFile) ? JSON.parse(await readFile(scoresFile, 'utf8')) : []

  const cells = []
  for (const r of rows) {
    const cols = []
    for (const arm of ARM_KEYS) {
      const found = findImage(join(OUT, 'images', arm), r.id)
      const img = found
        ? `<img src="data:image/${found.ext === 'jpg' ? 'jpeg' : found.ext};base64,${(await readFile(found.path)).toString('base64')}" alt="">`
        : `<div class="missing">not generated / blocked</div>`
      const s = scores.find((x) => x.id === r.id && x.arm === arm)
      const badge = s
        ? `<div class="score">fid ${s.fidelity} · plaus ${s.plausibility} · craft ${s.craft} · use ${s.usefulness}${s.note ? ` — ${esc(s.note)}` : ''}</div>`
        : ''
      // A bake-off folder ("raw-imagen4f") reuses the prompt of its base arm ("raw").
      const base = ARMS[arm] ? arm : (arm.split('-').find((t) => ARMS[t]) || 'raw')
      const sent = base === 'llm' && !r.llm_prompt ? '(no authored prompt)' : ARMS[base](r).split('\n\n')[0]
      cols.push(`<td><div class="arm">${ARM_LABEL[arm] || arm}</div>${img}${badge}<details><summary>prompt sent (${sent.length} chars)</summary><p class="prompt">${esc(sent)}</p></details></td>`)
    }
    cells.push(
      `<tr class="head"><td colspan="${ARM_KEYS.length}"><span class="qid">${r.id}</span> <span class="cat">${esc(r.label || r.category)}</span>` +
      `<p class="scen">${esc(stripBottomLine(r.scenario))}</p></td></tr>` +
      `<tr>${cols.join('')}</tr>`
    )
  }

  const html = `<!doctype html><meta charset="utf-8"><title>In-practice illustration A/B/C</title>
<style>
 :root{--cols:${ARM_KEYS.length}}
 body{font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:24px;background:#faf9f7;color:#1c1b19}
 h1{font-size:20px} .sub{color:#666;margin-bottom:24px}
 table{border-collapse:collapse;width:100%;max-width:1200px}
 td{vertical-align:top;padding:10px;width:calc(100% / var(--cols))}
 tr.head td{width:auto;background:#f0ede8;border-top:2px solid #d8d3cb;padding-top:16px}
 .qid{font-weight:700} .cat{color:#7a736a;font-size:13px}
 .scen{margin:6px 0 0;font-size:14px;color:#3a352f;max-width:900px}
 .arm{font-weight:600;font-size:13px;margin-bottom:6px;color:#2c6e6b}
 img{width:100%;border-radius:8px;display:block;background:#fff;cursor:zoom-in}
 #lb{position:fixed;inset:0;background:rgba(12,11,10,.92);display:none;place-items:center;z-index:99;padding:20px}
 #lb.on{display:grid}
 #lb figure{margin:0;display:grid;gap:10px;justify-items:center;max-height:100%}
 #lb img{max-width:min(1024px,94vw);max-height:82vh;width:auto;cursor:zoom-out;box-shadow:0 12px 48px rgba(0,0,0,.5)}
 #lb figcaption{color:#f2eee8;font-size:14px;text-align:center;max-width:min(1024px,94vw)}
 #lb .who{font-weight:600;color:#7fd4cf}
 #lb .hint{color:#9a938a;font-size:12px}
 #lb button{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.12);color:#fff;
   border:0;border-radius:50%;width:44px;height:44px;font-size:22px;cursor:pointer;line-height:1}
 #lb button:hover{background:rgba(255,255,255,.25)}
 #lb .prev{left:16px} #lb .next{right:16px}
 .missing{aspect-ratio:1;display:grid;place-items:center;background:#efece7;border-radius:8px;color:#a09890;font-size:13px}
 .score{font-size:12px;color:#555;margin-top:6px}
 summary{font-size:12px;color:#7a736a;cursor:pointer;margin-top:6px}
 .prompt{font-size:12px;color:#4a453e;background:#fff;padding:8px;border-radius:6px;white-space:pre-wrap}
</style>
<h1>"In practice" illustrations — A/B/C comparison</h1>
<p class="sub">${rows.length} scenarios · ${ARM_KEYS.length} variants · identical house style appended everywhere, so only the prompt body or the model differs.</p>
<table>${cells.join('')}</table>
<div id="lb" role="dialog" aria-modal="true" aria-label="Enlarged image">
  <button class="prev" aria-label="Previous image">&#8249;</button>
  <figure><img alt=""><figcaption><span class="who"></span><br><span class="hint">&larr; &rarr; to compare &middot; Esc or click to close</span></figcaption></figure>
  <button class="next" aria-label="Next image">&#8250;</button>
</div>
<script>${LIGHTBOX}<\/script>`

  const out = join(OUT, OUT_HTML)
  await writeFile(out, html)
  console.log(`wrote ${out} (${(html.length / 1024 / 1024).toFixed(1)} MB)`)
}

main().catch((e) => { console.error(e); process.exit(1) })
