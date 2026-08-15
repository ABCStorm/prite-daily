// Per-question podcast/lecture match for Neuro + Therapy.
// Reuses the existing episode embedding cache, embeds only the new questions,
// then assigns the best unused episode that shares a real content word with
// the item (so 75 CBT questions do not all get the same DBT-vs-CBT lecture).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const POD = join(ROOT, "scripts/podcasts");
const CACHE = join(POD, ".cache");
const MODEL = "text-embedding-3-small";

async function openaiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const m = (await readFile(join(ROOT, ".env.local"), "utf8")).match(/OPENAI_API_KEY=(\S+)/);
  if (!m) throw new Error("OPENAI_API_KEY not found");
  return m[1];
}

const STOP = new Set("about after among because before being between during following patient patients resident therapist therapy treatment treatments clinical psychiatry psychiatric disorder disorders symptom symptoms diagnosis which their there these those would should could about using based most more than then with from that this have been will also into over under such only other after when what".split(" "));

function words(s) {
  return [...new Set((s || "").toLowerCase().match(/[a-z][a-z-]{4,}/g) || [])].filter((w) => !STOP.has(w));
}

function questionText(q) {
  const topic = q.quizapine?.topic || q.kaufman?.chapter || q.prite_label || "";
  const modality = q.quizapine?.modality || (q.tags?.neuro || []).join(" ");
  return [q.video_query, topic, modality, q.answer_text, (q.explanation_text || "").slice(0, 280)].filter(Boolean).join(" · ");
}

function episodeText(e) {
  const chapters = (e.chapters || []).map((c) => c.title).slice(0, 25).join("; ");
  return [`${e.channel}: ${e.title}`, chapters, (e.description || "").slice(0, 400)].filter(Boolean).join(" · ");
}

async function embedAll(texts, keyName) {
  const KEY = await openaiKey();
  await mkdir(CACHE, { recursive: true });
  const file = join(CACHE, `emb-${keyName}.json`);
  const cache = existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : {};
  const need = [];
  const hashes = texts.map((t) => createHash("sha1").update(t).digest("hex").slice(0, 16));
  hashes.forEach((h, i) => { if (!cache[h]) need.push(i); });
  for (let i = 0; i < need.length; i += 256) {
    const batch = need.slice(i, i + 256);
    const r = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: MODEL, input: batch.map((j) => texts[j].slice(0, 6000)) }),
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    j.data.forEach((d, k) => { cache[hashes[batch[k]]] = d.embedding; });
    await writeFile(file, JSON.stringify(cache));
    process.stderr.write(`  embedded ${Math.min(i + 256, need.length)}/${need.length}\r`);
  }
  if (need.length) process.stderr.write("\n");
  return hashes.map((h) => cache[h]);
}

function normalize(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

async function main() {
  const questions = JSON.parse(await readFile(join(ROOT, "reference/alt-bank/questions.json"), "utf8"));
  const episodes = JSON.parse(await readFile(join(POD, "episodes.json"), "utf8"));
  console.error(`embedding ${episodes.length} episodes + ${questions.length} alt-bank questions…`);
  const epVecs = (await embedAll(episodes.map(episodeText), "episodes")).map(normalize);
  const qVecs = (await embedAll(questions.map(questionText), "alt-questions")).map(normalize);

  const epHay = episodes.map((e) => `${e.title} ${(e.chapters || []).map((c) => c.title).join(" ")}`.toLowerCase());
  const dim = epVecs[0].length;
  const perQ = [];

  for (let qi = 0; qi < questions.length; qi++) {
    const q = questions[qi], qv = qVecs[qi];
    const qWords = words([q.quizapine?.topic, q.quizapine?.modality, q.kaufman?.chapter, q.prite_label, q.answer_text, q.video_query].filter(Boolean).join(" "));
    const scored = [];
    for (let ei = 0; ei < episodes.length; ei++) {
      const ev = epVecs[ei];
      let dot = 0;
      for (let d = 0; d < dim; d++) dot += qv[d] * ev[d];
      if (dot < 0.40) continue;
      const hits = qWords.filter((w) => epHay[ei].includes(w));
      if (!hits.length && dot < 0.56) continue;
      scored.push({ ei, sim: dot, hits });
    }
    scored.sort((a, b) => (b.hits.length - a.hits.length) || (b.sim - a.sim));
    perQ.push({
      qid: `${q.year}-${q.q_index}`,
      topic: q.quizapine?.topic || q.kaufman?.chapter || q.year,
      scored: scored.slice(0, 16),
    });
    if (qi % 200 === 0) process.stderr.write(`  scored ${qi}/${questions.length}\r`);
  }
  process.stderr.write("\n");

  perQ.sort((a, b) => (b.scored[0]?.sim || 0) - (a.scored[0]?.sim || 0));
  const used = new Set();
  const out = {};
  let unique = 0, reused = 0, none = 0;
  for (const row of perQ) {
    let pick = row.scored.find((s) => !used.has(episodes[s.ei].videoId));
    let reusedPick = false;
    if (!pick && row.scored[0]) { pick = row.scored[0]; reusedPick = true; }
    if (!pick) { none++; continue; }
    const e = episodes[pick.ei];
    if (!reusedPick) { used.add(e.videoId); unique++; }
    else reused++;
    const whyHits = pick.hits.slice(0, 4).join(", ");
    out[row.qid] = [{
      videoId: e.videoId,
      title: e.title,
      channel: e.channel,
      why: whyHits
        ? `Matched this item on ${whyHits} — ${row.topic}.`
        : `Closest episode in the library to “${row.topic}.”`,
      confidence: pick.hits.length && pick.sim >= 0.48 ? "high" : "medium",
      kind: e.kind || "podcast",
      tier: reusedPick ? "related" : (pick.hits.length ? "direct" : "related"),
      durationSec: e.durationSec,
      publishedAt: e.publishedAt,
    }];
  }

  const dest = join(ROOT, "reference/alt-bank/podcasts.json");
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, JSON.stringify(out));
  console.log(`wrote ${Object.keys(out).length} questions → ${dest}`);
  console.log(`unique episodes=${unique}  reused=${reused}  none=${none}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
