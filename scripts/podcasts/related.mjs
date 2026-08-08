// PHASE 4: related-topic tier (Tier B).
//
// Tier A (verify.mjs) only keeps episodes that teach the *exact* tested concept.
// That correctly leaves most of the bank empty. Tier B fills some of those gaps
// with episodes that are still on the same clinical topic (same disorder, drug
// class, or board category) without claiming a precise concept match.
//
// UI labels Tier B as "Related teaching" so residents don't confuse it with a
// direct hit. Cap is deliberately lower (1 related ref/question) and confidence
// is forced to "medium".
//
//   node scripts/podcasts/related.mjs              # build + judge + merge
//   node scripts/podcasts/related.mjs --match-only  # only write related-candidates.json
//   node scripts/podcasts/related.mjs --emit        # merge from cache, no re-judge
//   node scripts/podcasts/related.mjs --limit 40    # trial
//
// Judging uses the Grok subscription (`grok -p`), same policy as verify.mjs.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const CACHE = join(__dirname, ".cache");
const SIDECAR = join(ROOT, "public/data/podcasts.json");
const RELATED_CANDS = join(__dirname, "related-candidates.json");
const RELATED_VERDICTS = join(CACHE, "verdicts-related.json");

const flag = (n) => process.argv.includes(`--${n}`);
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };

const BATCH = 18;
const CONCURRENCY = 3;
const TOP_K = 5;
const MAX_RELATED_PER_Q = 1;
const MAX_PER_EPISODE_RELATED = 50;
const GROK_MODEL = arg("model", "grok-4.5");

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const norm = (s) => (s || "").toLowerCase();

const key = (rec) => createHash("sha1")
  .update("related|" + rec.qid + rec.candidates.slice(0, 3).map((c) => c.videoId).join(","))
  .digest("hex").slice(0, 16);

// ── soft entity helpers (mirrors match.mjs, intentionally looser) ─────────
const SYNONYMS = {
  "major-depression": ["depression", "depressive", "mdd", "treatment-resistant"],
  "bipolar": ["bipolar", "mania", "manic", "mood stabilizer"],
  "schizophrenia": ["schizophrenia", "schizophrenic", "psychosis", "antipsychotic"],
  "psychosis": ["psychosis", "psychotic", "antipsychotic", "schizophrenia"],
  "adhd": ["adhd", "attention deficit", "stimulant", "hyperactivity"],
  "autism": ["autism", "autistic", "asd", "neurodevelopmental"],
  "personality-disorder": ["personality disorder", "borderline", "bpd", "narcissis"],
  "ocd": ["ocd", "obsessive", "compulsive"],
  "ptsd": ["ptsd", "trauma", "post-traumatic", "posttraumatic"],
  "dementia": ["dementia", "alzheimer", "cognitive decline", "neurocognitive"],
  "delirium": ["delirium", "encephalopathy", "altered mental status"],
  "substance-use": ["substance use", "addiction", "opioid", "alcohol", "withdrawal"],
  "insomnia": ["insomnia", "sleep", "hypnotic"],
  "anxiety": ["anxiety", "anxious", "panic", "gad"],
  "eating-disorder": ["eating disorder", "anorexia", "bulimia", "binge"],
  "tic": ["tic", "tourette"],
  "phobia": ["phobia", "phobic", "social anxiety"],
  "catatonia": ["catatonia", "catatonic", "ect"],
};

function questionEntities(q) {
  const out = new Set();
  for (const m of q.tags?.medication || []) out.add(norm(m));
  for (const d of q.tags?.diagnosis || []) {
    const k = norm(d);
    out.add(k.replace(/-/g, " "));
    for (const syn of SYNONYMS[k] || []) out.add(syn);
  }
  for (const t of q.tags?.topics || []) {
    const k = norm(t).replace(/-/g, " ");
    if (k.length >= 5) out.add(k);
  }
  // Category words help soft-match when no med/dx tags exist.
  for (const lab of [q.prite_label, q.prite_category]) {
    if (!lab) continue;
    for (const w of norm(lab).split(/[^a-z0-9]+/)) {
      if (w.length >= 6 && !["clinical", "sciences", "behavioral", "disorders"].includes(w)) out.add(w);
    }
  }
  for (const w of (q.answer_text || "").split(/[^A-Za-z-]+/)) {
    const lw = norm(w);
    if (lw.length >= 7 && /(?:ine|ole|one|pam|azine|tidine|ipine|statin|opathy|itis|emia|osis|phrenia|plegia)$/.test(lw)) out.add(lw);
  }
  return [...out].filter(Boolean);
}

function questionText(q) {
  const topics = (q.tags?.topics || []).join(", ");
  return [q.video_query, q.answer_text, topics, q.prite_label || q.prite_category].filter(Boolean).join(" · ");
}

function episodeText(e) {
  const chapters = (e.chapters || []).map((c) => c.title).slice(0, 25).join("; ");
  return [`${e.channel}: ${e.title}`, chapters, (e.description || "").slice(0, 400)].filter(Boolean).join(" · ");
}

async function loadEmbCache(keyName) {
  const file = join(CACHE, `emb-${keyName}.json`);
  return existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : {};
}

function normalize(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

async function embedMissing(texts, keyName) {
  // Reuse the OpenAI embedding cache from match.mjs; only embed novel strings.
  const KEY = process.env.OPENAI_API_KEY
    || (await readFile(join(ROOT, ".env.local"), "utf8")).match(/OPENAI_API_KEY=(\S+)/)?.[1];
  if (!KEY) throw new Error("OPENAI_API_KEY required for soft retrieval");
  await mkdir(CACHE, { recursive: true });
  const file = join(CACHE, `emb-${keyName}.json`);
  const cache = await loadEmbCache(keyName);
  const hashes = texts.map((t) => createHash("sha1").update(t).digest("hex").slice(0, 16));
  const need = [];
  hashes.forEach((h, i) => { if (!cache[h]) need.push(i); });
  for (let i = 0; i < need.length; i += 256) {
    const batch = need.slice(i, i + 256);
    const r = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: "text-embedding-3-small", input: batch.map((j) => texts[j].slice(0, 6000)) }),
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    j.data.forEach((d, k) => { cache[hashes[batch[k]]] = d.embedding; });
    await writeFile(file, JSON.stringify(cache));
    process.stderr.write(`  embedded ${Math.min(i + 256, need.length)}/${need.length}\r`);
  }
  if (need.length) process.stderr.write("\n");
  return hashes.map((h) => normalize(cache[h]));
}

// ── build related candidate pool ──────────────────────────────────────────
async function buildRelatedCandidates() {
  const questions = JSON.parse(await readFile(join(ROOT, "extraction/output/questions_all.json"), "utf8"));
  const episodes = JSON.parse(await readFile(join(__dirname, "episodes.json"), "utf8"));
  const direct = existsSync(SIDECAR) ? JSON.parse(await readFile(SIDECAR, "utf8")) : {};
  const strictCands = existsSync(join(__dirname, "candidates.json"))
    ? JSON.parse(await readFile(join(__dirname, "candidates.json"), "utf8"))
    : [];
  const strictByQid = Object.fromEntries(strictCands.map((r) => [r.qid, r]));

  const need = questions.filter((q) => q.video_query && !direct[`${q.year}-${q.q_index}`]);
  console.log(`building related candidates for ${need.length} questions without a direct pick…`);

  // Soft retrieval only for questions that never got a strict candidate.
  const softQs = need.filter((q) => !strictByQid[`${q.year}-${q.q_index}`]);
  console.log(`  ${need.length - softQs.length} reuse rejected strict candidates`);
  console.log(`  ${softQs.length} need soft retrieval`);

  let epVecs = null, softVecs = null;
  if (softQs.length) {
    console.error("embedding soft pool…");
    epVecs = await embedMissing(episodes.map(episodeText), "episodes");
    softVecs = await embedMissing(softQs.map(questionText), "questions");
  }

  const hay = episodes.map((e) =>
    norm(`${e.title} ${(e.chapters || []).map((c) => c.title).join(" ")} ${(e.description || "").slice(0, 500)}`));

  const out = [];
  let softHits = 0;

  for (const q of need) {
    const qid = `${q.year}-${q.q_index}`;
    const existing = strictByQid[qid];
    if (existing?.candidates?.length) {
      out.push({
        qid, year: q.year, q_index: q.q_index,
        video_query: q.video_query, answer_text: q.answer_text,
        prite_label: q.prite_label || q.prite_category || "",
        source: "strict-reject",
        candidates: existing.candidates.slice(0, TOP_K),
      });
      continue;
    }

    if (!softVecs) continue;
    const qi = softQs.indexOf(q);
    if (qi < 0) continue;
    const qv = softVecs[qi];
    const ents = questionEntities(q);
    const scored = [];
    for (let ei = 0; ei < episodes.length; ei++) {
      const e = episodes[ei];
      const ev = epVecs[ei];
      let dot = 0;
      for (let d = 0; d < qv.length; d++) dot += qv[d] * ev[d];
      // Soft floors: a bit higher than strict match floors because the gate is looser.
      const floor = e.tier === "adjacent" ? 0.53 : 0.48;
      if (dot < floor) continue;
      const hits = ents.filter((t) => t.length > 3 && hay[ei].includes(t));
      // Accept if entity appears somewhere OR similarity is clearly high on a core episode.
      const ok = hits.length > 0 || (e.tier === "core" && dot >= 0.55) || (e.tier === "adjacent" && dot >= 0.58);
      if (!ok) continue;
      scored.push({ ei, sim: dot, hits });
    }
    scored.sort((a, b) => b.sim - a.sim || b.hits.length - a.hits.length);
    const top = scored.slice(0, TOP_K);
    if (!top.length) continue;
    softHits++;
    out.push({
      qid, year: q.year, q_index: q.q_index,
      video_query: q.video_query, answer_text: q.answer_text,
      prite_label: q.prite_label || q.prite_category || "",
      source: "soft",
      candidates: top.map((s) => ({
        videoId: episodes[s.ei].videoId,
        channel: episodes[s.ei].channel,
        tier: episodes[s.ei].tier,
        kind: episodes[s.ei].kind || "podcast",
        title: episodes[s.ei].title,
        sim: +s.sim.toFixed(3),
        entityHits: s.hits,
        chapters: episodes[s.ei].chapters || [],
        durationSec: episodes[s.ei].durationSec,
        publishedAt: episodes[s.ei].publishedAt,
      })),
    });
  }

  await writeFile(RELATED_CANDS, JSON.stringify(out));
  console.log(`${out.length} related candidate rows (${softHits} from soft retrieval)`);
  console.log(`→ ${RELATED_CANDS}`);
  return out;
}

// ── Grok judge ────────────────────────────────────────────────────────────
function questionBlock(rec, n) {
  const cands = rec.candidates.slice(0, 3).map((c, i) => {
    const ch = (c.chapters || []).length
      ? `\n     chapters: ${c.chapters.map((x, j) => `[${j}] ${fmt(x.sec)} ${x.title}`).join(" | ").slice(0, 500)}`
      : "";
    return `   ${i}. "${c.title}" — ${c.channel} (${Math.round(c.durationSec / 60)} min)${ch}`;
  }).join("\n");
  return `### Q${n}
TESTED CONCEPT: ${rec.video_query}
CORRECT ANSWER: ${rec.answer_text || "(n/a)"}
BOARD CATEGORY: ${rec.prite_label || "(n/a)"}
CANDIDATES:
${cands}`;
}

function relatedPrompt(batch) {
  return `You are curating RELATED-TOPIC teaching recommendations for psychiatry residents (PRITE board review).

These questions already failed a STRICT match (no episode teaches the exact tested concept). Your job is softer: pick an episode that is still useful background on the SAME clinical topic — same disorder, drug class, therapy modality, or board category — even if it does not cover the precise fact being tested.

ACCEPT when the episode would help a resident who just missed this question learn the surrounding topic (e.g. a lithium-toxicity question → a solid lithium / bipolar meds episode; an NMS question → a neuroleptic-side-effects episode; a CBT technique question → a CBT overview).

REJECT when the episode is only loosely psychiatric, wrong subfield, or would waste time (e.g. depression talk for a statistics question; dystonia talk for pure psychotherapy theory; general wellness content).

Rejecting is still fine and common. Prefer null over a stretch.

${batch.map((r, i) => questionBlock(r, i + 1)).join("\n\n")}

Return ONLY a JSON array, no prose, no fences:
[{"q": 1, "pick": <candidate index or null>, "chapter": <chapter index or null>, "why": "<max 12 words, start with Related: >", "confidence": "medium"}, ...]

Always use confidence "medium" for related-tier picks. Set chapter only when a listed chapter is clearly on the topic.`;
}

function grokCLI(text) {
  return new Promise((resolve, reject) => {
    const tmp = join(CACHE, `related-prompt-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
    writeFile(tmp, text).then(() => {
      execFile(
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
          import("node:fs/promises").then((fs) => fs.unlink(tmp).catch(() => {}));
          if (err && !stdout) reject(new Error(`${err.message}${stderr ? ` :: ${String(stderr).slice(0, 300)}` : ""}`));
          else resolve(stdout || "");
        },
      );
    }).catch(reject);
  });
}

function normalizeVerdict(v) {
  let pick = v.pick;
  if (pick === "null" || pick === -1 || pick === "") pick = null;
  if (typeof pick === "string" && pick !== null && /^\d+$/.test(pick)) pick = +pick;
  let chapter = v.chapter;
  if (chapter === "null" || chapter === -1 || chapter === "") chapter = null;
  if (typeof chapter === "string" && chapter !== null && /^\d+$/.test(chapter)) chapter = +chapter;
  let why = v.why || "";
  if (why && !/^related:/i.test(why)) why = `Related: ${why}`;
  return { pick, chapter, why, confidence: "medium" };
}

async function judgeBatch(batch) {
  let out;
  try { out = await grokCLI(relatedPrompt(batch)); }
  catch (e) {
    console.error(`\n  batch failed: ${e.message}`);
    return {};
  }
  const m = out.match(/\[[\s\S]*\]/);
  if (!m) {
    console.error(`\n  no JSON in reply: ${JSON.stringify(out.slice(0, 280))}`);
    return {};
  }
  let parsed;
  try { parsed = JSON.parse(m[0]); }
  catch (e) {
    console.error(`\n  bad JSON: ${e.message}`);
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

async function judgeAll(records) {
  await mkdir(CACHE, { recursive: true });
  const verdicts = existsSync(RELATED_VERDICTS)
    ? JSON.parse(await readFile(RELATED_VERDICTS, "utf8"))
    : {};
  const limit = +arg("limit", 0);
  const todo = records.filter((r) => !verdicts[key(r)]).slice(0, limit || undefined);
  const batches = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  console.log(`judging ${todo.length} related candidates in ${batches.length} Grok calls (${records.length - todo.length} cached)`);

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
    await writeFile(RELATED_VERDICTS, JSON.stringify(verdicts));
    process.stderr.write(`  ${done}/${todo.length} judged · ${kept} related accepted\r`);
  }
  process.stderr.write("\n");
  return verdicts;
}

// ── merge emit ────────────────────────────────────────────────────────────
async function emit(records, relatedVerdicts) {
  const direct = existsSync(SIDECAR) ? JSON.parse(await readFile(SIDECAR, "utf8")) : {};
  // Ensure existing direct refs are marked tier:direct (back-compat).
  for (const [qid, list] of Object.entries(direct)) {
    for (const r of list) {
      if (!r.tier) r.tier = "direct";
    }
  }

  const HEDGE = /\b(likely|probably|may |might |possibly|presumably|could )/i;
  const useCount = {};
  // Count existing direct usage first so related doesn't pile onto the same ep.
  for (const list of Object.values(direct)) {
    for (const r of list) useCount[r.videoId] = (useCount[r.videoId] || 0) + 1;
  }

  const accepted = [];
  let hedged = 0;
  for (const rec of records) {
    if (direct[rec.qid]?.length) continue; // never stack related on top of direct
    const v = relatedVerdicts[key(rec)];
    if (!v || v.pick == null) continue;
    const c = rec.candidates[v.pick];
    if (!c) continue;
    if (HEDGE.test(v.why || "")) { hedged++; continue; }
    accepted.push({ rec, c, v });
  }
  accepted.sort((a, b) => (b.c.sim || 0) - (a.c.sim || 0));

  let added = 0;
  for (const { rec, c, v } of accepted) {
    useCount[c.videoId] = (useCount[c.videoId] || 0) + 1;
    if (useCount[c.videoId] > MAX_PER_EPISODE_RELATED) continue;
    const list = (direct[rec.qid] ||= []);
    if (list.length >= MAX_RELATED_PER_Q) continue;
    if (list.some((r) => r.videoId === c.videoId)) continue;
    const chapter = v.chapter != null ? (c.chapters || [])[v.chapter] : null;
    list.push({
      videoId: c.videoId,
      title: c.title,
      channel: c.channel,
      kind: c.kind || "podcast",
      tier: "related",
      why: v.why || "Related topic teaching",
      confidence: "medium",
      durationSec: c.durationSec,
      publishedAt: c.publishedAt,
      ...(chapter ? { startSec: chapter.sec, chapterTitle: chapter.title } : {}),
    });
    added++;
  }

  await writeFile(SIDECAR, JSON.stringify(direct));
  const qn = Object.keys(direct).length;
  const relatedQs = Object.values(direct).filter((lst) => lst.some((r) => r.tier === "related")).length;
  const directQs = Object.values(direct).filter((lst) => lst.some((r) => r.tier !== "related")).length;
  console.log(`merged +${added} related picks`);
  console.log(`${qn} questions total (${Math.round((qn / 5096) * 100)}% of bank)`);
  console.log(`  direct: ${directQs} · related-only: ${relatedQs} · hedged dropped: ${hedged}`);
  console.log(`→ ${SIDECAR}`);
}

async function main() {
  await mkdir(CACHE, { recursive: true });

  let records;
  if (flag("emit") && existsSync(RELATED_CANDS)) {
    records = JSON.parse(await readFile(RELATED_CANDS, "utf8"));
  } else {
    records = await buildRelatedCandidates();
  }

  if (flag("match-only")) return;

  let verdicts;
  if (flag("emit")) {
    verdicts = existsSync(RELATED_VERDICTS)
      ? JSON.parse(await readFile(RELATED_VERDICTS, "utf8"))
      : {};
  } else {
    verdicts = await judgeAll(records);
  }

  // Retry incomplete once if a few batches failed.
  const missing = records.filter((r) => !verdicts[key(r)]);
  if (missing.length && !flag("emit") && missing.length <= 80) {
    console.log(`retrying ${missing.length} incomplete…`);
    const more = await judgeAll(records);
    verdicts = more;
  }

  await emit(records, verdicts);
}

main().catch((e) => { console.error(e); process.exit(1); });
