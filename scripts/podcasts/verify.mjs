// PHASE 3: verify candidates with an LLM judge and write the app-facing sidecar.
//
// Retrieval + the entity gate get to ~33% of the bank, but a gated candidate is
// only "plausibly on-topic" — it still pairs neuroleptic malignant syndrome with
// an antipsychotic-induced-dystonia episode, or an MAOI hypertensive crisis with
// a benzodiazepine episode. This pass asks a model, per question, whether any
// candidate actually TEACHES the tested concept, and rejects the near-misses.
// It also picks the matching chapter (for episodes that publish timestamps) and
// writes the one-line "why listen".
//
// Default judge: headless Grok CLI (`grok -p`), billed to the Grok subscription
// (cached OAuth in ~/.grok/auth.json, or XAI_API_KEY). Tools are disabled so
// each batch is a pure text completion.
//
// Optional backends:
//   node scripts/podcasts/verify.mjs --openai   # gpt-4o-mini via OPENAI_API_KEY
//   node scripts/podcasts/verify.mjs --claude   # Claude Code CLI / Haiku sub
//
//   node scripts/podcasts/verify.mjs --limit 50   # trial run
//   node scripts/podcasts/verify.mjs              # full pass, resumable (Grok)
//   node scripts/podcasts/verify.mjs --emit       # rebuild sidecar from cache
//
// Every verdict is cached in .cache/verdicts.json keyed by question+candidates,
// so re-runs are free and an interrupted run resumes where it stopped.
//
// Audio TTS is separate (Fish via scripts/audio/render-fish-audio.mjs) — this
// script is text-only judging.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const CACHE = join(__dirname, ".cache");
const VERDICTS = join(CACHE, "verdicts.json");
const SIDECAR = join(ROOT, "public/data/podcasts.json");

const flag = (n) => process.argv.includes(`--${n}`);
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };

const USE_OPENAI = flag("openai");
const USE_CLAUDE = flag("claude");
const BACKEND = USE_OPENAI ? "openai" : USE_CLAUDE ? "claude" : "grok";

const GROK_MODEL = arg("model", "grok-4.5") || "grok-4.5";
const CLAUDE_MODEL = "haiku";
const OPENAI_MODEL = "gpt-4o-mini";

/** Questions per invocation. Too large and a single malformed reply costs a whole batch. */
const BATCH = 20;
const CONCURRENCY = BACKEND === "openai" ? 6 : BACKEND === "grok" ? 3 : 4;
/** No single episode may be recommended on more than this many questions. */
const MAX_PER_EPISODE = 40;
const MAX_REFS_PER_QUESTION = 2;

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function questionBlock(rec, n) {
  const cands = rec.candidates.slice(0, 3).map((c, i) => {
    const ch = c.chapters.length
      ? `\n     chapters: ${c.chapters.map((x, j) => `[${j}] ${fmt(x.sec)} ${x.title}`).join(" | ").slice(0, 700)}`
      : "";
    return `   ${i}. "${c.title}" — ${c.channel} (${Math.round(c.durationSec / 60)} min)${ch}`;
  }).join("\n");
  return `### Q${n}
TESTED CONCEPT: ${rec.video_query}
CORRECT ANSWER: ${rec.answer_text || "(n/a)"}
CANDIDATES:
${cands}`;
}

function prompt(batch) {
  return `You are curating podcast recommendations for psychiatry residents doing board review. For each question below, decide whether any candidate episode would genuinely deepen the resident's understanding of the TESTED CONCEPT.

An episode qualifies only if it actually teaches that concept. Sharing a keyword, a drug class, or a symptom area is NOT enough — a question about neuroleptic malignant syndrome is not served by an episode on acute dystonia, and a question about MAOI hypertensive crisis is not served by an episode about benzodiazepines.

Rejecting is the expected outcome for most questions. A wrong recommendation wastes more of the resident's time than no recommendation, so reject unless a candidate clearly covers the concept.

${batch.map((r, i) => questionBlock(r, i + 1)).join("\n\n")}

Return ONLY a JSON array with one object per question, in order, no prose and no code fences:
[{"q": 1, "pick": <candidate index or null>, "chapter": <chapter index or null>, "why": "<max 12 words on why it helps, no preamble>", "confidence": "high"|"medium"}, ...]

Use "medium" when the episode covers the concept only as one segment of a broader discussion. Set "chapter" only when a listed chapter is squarely on the concept, otherwise null.`;
}

/** Headless Grok CLI — uses the Grok subscription (OAuth in ~/.grok). */
function grokCLI(text) {
  return new Promise((resolve, reject) => {
    // Write prompt to a temp file — prompts are long and argv has limits.
    const tmp = join(CACHE, `prompt-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
    writeFile(tmp, text).then(() => {
      const child = execFile(
        "grok",
        [
          "--prompt-file", tmp,
          "--verbatim",
          "--no-memory",
          "--no-plan",
          "--no-subagents",
          "--max-turns", "1",
          "--tools", "",
          "--disallowed-tools", "Agent",
          "--effort", "low",
          "-m", GROK_MODEL,
          "--output-format", "plain",
          "--no-auto-update",
        ],
        {
          maxBuffer: 16 * 1024 * 1024,
          timeout: 6 * 60_000,
          env: { ...process.env, GROK_DISABLE_AUTOUPDATER: "1" },
        },
        (err, stdout, stderr) => {
          // best-effort cleanup
          import("node:fs/promises").then((fs) => fs.unlink(tmp).catch(() => {}));
          if (err && !stdout) {
            reject(new Error(`${err.message}${stderr ? ` :: ${stderr.slice(0, 300)}` : ""}`));
          } else {
            resolve(stdout || "");
          }
        },
      );
    }).catch(reject);
  });
}

/** Headless Claude Code CLI — subscription; strip API key so it can't fall back. */
function claudeCLI(text) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    const child = execFile("claude",
      ["-p", "--model", CLAUDE_MODEL],
      { env, maxBuffer: 16 * 1024 * 1024, timeout: 5 * 60_000 },
      (err, stdout) => (err && !stdout ? reject(err) : resolve(stdout)));
    child.stdin.end(text);
  });
}

async function openaiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const m = (await readFile(join(ROOT, ".env.local"), "utf8")).match(/OPENAI_API_KEY=(\S+)/);
  if (!m) throw new Error("OPENAI_API_KEY not found in .env.local");
  return m[1];
}

/** OpenAI Chat Completions — keep for audio-adjacent work or emergency text. */
async function openaiChat(text, apiKey) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: "Return only a JSON array. No prose, no markdown fences." },
        { role: "user", content: text },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

function normalizeVerdict(v) {
  let pick = v.pick;
  if (pick === "null" || pick === -1 || pick === "") pick = null;
  if (typeof pick === "string" && pick !== null && /^\d+$/.test(pick)) pick = +pick;
  let chapter = v.chapter;
  if (chapter === "null" || chapter === -1 || chapter === "") chapter = null;
  if (typeof chapter === "string" && chapter !== null && /^\d+$/.test(chapter)) chapter = +chapter;
  return { pick, chapter, why: v.why, confidence: v.confidence };
}

let _openaiKey;
async function judgeBatch(batch) {
  let out;
  try {
    if (BACKEND === "openai") {
      if (!_openaiKey) _openaiKey = await openaiKey();
      out = await openaiChat(prompt(batch), _openaiKey);
    } else if (BACKEND === "claude") {
      out = await claudeCLI(prompt(batch));
    } else {
      out = await grokCLI(prompt(batch));
    }
  } catch (e) {
    console.error(`\n  batch failed: ${e.message}`);
    return {};
  }
  const m = out.match(/\[[\s\S]*\]/);
  if (!m) {
    console.error(`\n  no JSON in reply: ${JSON.stringify(out.slice(0, 300))}`);
    return {};
  }
  let parsed;
  try { parsed = JSON.parse(m[0]); }
  catch (e) {
    console.error(`\n  bad JSON: ${e.message} :: ${m[0].slice(0, 200)}`);
    return {};
  }
  const verdicts = {};
  for (const v of parsed) {
    const rec = batch[(v.q || 0) - 1];
    if (!rec) continue;
    verdicts[key(rec)] = normalizeVerdict(v);
  }
  return verdicts;
}

const key = (rec) => createHash("sha1")
  .update(rec.qid + rec.candidates.slice(0, 3).map((c) => c.videoId).join(","))
  .digest("hex").slice(0, 16);

async function main() {
  await mkdir(CACHE, { recursive: true });
  const records = JSON.parse(await readFile(join(__dirname, "candidates.json"), "utf8"));
  const verdicts = existsSync(VERDICTS) ? JSON.parse(await readFile(VERDICTS, "utf8")) : {};

  if (!flag("emit")) {
    const limit = +arg("limit", 0);
    const todo = records.filter((r) => !verdicts[key(r)]).slice(0, limit || undefined);
    const batches = [];
    for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
    const cached = records.filter((r) => verdicts[key(r)]).length;
    const label = BACKEND === "openai" ? `OpenAI ${OPENAI_MODEL}`
      : BACKEND === "claude" ? `Claude CLI ${CLAUDE_MODEL}`
      : `Grok CLI ${GROK_MODEL} (subscription)`;
    console.log(`judging ${todo.length} questions in ${batches.length} calls via ${label} (${cached} already cached)`);

    let done = 0, kept = 0;
    for (let i = 0; i < batches.length; i += CONCURRENCY) {
      const wave = batches.slice(i, i + CONCURRENCY);
      const results = await Promise.all(wave.map(judgeBatch));
      for (const r of results) {
        for (const [k, v] of Object.entries(r)) {
          verdicts[k] = v;
          if (v.pick != null) kept++;
        }
        done += Object.keys(r).length;
      }
      await writeFile(VERDICTS, JSON.stringify(verdicts));
      process.stderr.write(`  ${done}/${todo.length} judged · ${kept} accepted\r`);
    }
    process.stderr.write("\n");
  }

  // Emit the sidecar: qid → refs, applying per-episode fairness caps.
  const HEDGE = /\b(likely|probably|may |might |possibly|presumably|could )/i;
  const accepted = [];
  let hedged = 0;
  for (const rec of records) {
    const v = verdicts[key(rec)];
    if (!v || v.pick == null) continue;
    const c = rec.candidates[v.pick];
    if (!c) continue;
    if (HEDGE.test(v.why || "")) { hedged++; continue; }
    accepted.push({ rec, c, v });
  }
  accepted.sort((a, b) =>
    (b.v.confidence === "high") - (a.v.confidence === "high") || b.c.sim - a.c.sim);

  const useCount = {};
  const out = {};
  for (const { rec, c, v } of accepted) {
    useCount[c.videoId] = (useCount[c.videoId] || 0) + 1;
    if (useCount[c.videoId] > MAX_PER_EPISODE) continue;
    const list = (out[rec.qid] ||= []);
    if (list.length >= MAX_REFS_PER_QUESTION) continue;
    const chapter = v.chapter != null ? c.chapters[v.chapter] : null;
    list.push({
      videoId: c.videoId, title: c.title, channel: c.channel, kind: c.kind || "podcast",
      tier: "direct",
      why: v.why || "", confidence: v.confidence || "medium",
      durationSec: c.durationSec, publishedAt: c.publishedAt,
      ...(chapter ? { startSec: chapter.sec, chapterTitle: chapter.title } : {}),
    });
  }

  await writeFile(SIDECAR, JSON.stringify(out));
  const qn = Object.keys(out).length;
  const eps = new Set(Object.values(out).flat().map((r) => r.videoId)).size;
  const chaptered = Object.values(out).flat().filter((r) => r.startSec != null).length;
  const high = Object.values(out).flat().filter((r) => r.confidence === "high").length;
  console.log(`${qn} questions (${Math.round((qn / 5096) * 100)}% of bank) → ${eps} distinct episodes`);
  console.log(`${high} high-confidence · ${Object.values(out).flat().length - high} medium · ${hedged} dropped as hedged`);
  console.log(`${chaptered} refs deep-link to a specific chapter`);

  // Per-channel yield: how often a channel's gated candidates actually survive
  // the judge. A channel that is offered often but accepted rarely is earning
  // its slot in the roster poorly and is a prune candidate.
  if (flag("by-channel")) {
    const offered = {}, kept = {};
    for (const rec of records) {
      for (const c of rec.candidates.slice(0, 3)) offered[c.channel] = (offered[c.channel] || 0) + 1;
    }
    for (const r of Object.values(out).flat()) kept[r.channel] = (kept[r.channel] || 0) + 1;
    console.log("\nchannel                                    kept / offered");
    for (const [ch, n] of Object.entries(kept).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${ch.slice(0, 40).padEnd(41)} ${String(n).padStart(4)} / ${String(offered[ch] || 0).padEnd(5)} ${Math.round((n / (offered[ch] || 1)) * 100)}%`);
    }
    for (const ch of Object.keys(offered)) if (!kept[ch]) console.log(`  ${ch.slice(0, 40).padEnd(41)}    0 / ${String(offered[ch]).padEnd(5)} 0%`);
  }
  console.log(`→ public/data/podcasts.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
