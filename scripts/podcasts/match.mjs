// PHASE 2: match questions to podcast episodes.
//
// Retrieval is embedding-based (text-embedding-3-small, ~$0.05 one-time for the
// whole bank) and is then PRECISION-GATED on shared clinical entities. The gate
// is the important half: cosine similarity alone happily pairs "lithium
// toxicity" with a generic mood-disorders episode, which is exactly the kind of
// near-miss that makes a recommendation feel like noise. A candidate survives
// only if the question's own tags.medication / tags.diagnosis terms (or a
// distinctive answer_text term) actually appear in the episode title, chapter
// list, or description.
//
//   node scripts/podcasts/match.mjs --sample 30   # eyeball matches, no writes
//   node scripts/podcasts/match.mjs               # write candidates.json
//
// Output feeds phase 3 (Haiku verification) — see verify.mjs.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const CACHE = join(__dirname, ".cache");
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };

const MODEL = "text-embedding-3-small";
const TOP_K = 6;

async function openaiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const m = (await readFile(join(ROOT, ".env.local"), "utf8")).match(/OPENAI_API_KEY=(\S+)/);
  if (!m) throw new Error("OPENAI_API_KEY not found in .env.local");
  return m[1];
}

/** Synonym expansion for the entity gate. Tag slugs are terse ("major-depression")
    while episode titles use clinical prose ("treatment-resistant depression"), so
    each tag carries the surface forms a publisher would actually write. */
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

/** Neuroanatomy / neurotransmitter tags (tags.neuro). These were unused by the
    first version of the gate, which is why clinical neurology and neuroscience
    sat near 4% coverage — those questions carry no medication or diagnosis tag,
    so nothing could open the gate for them. */
const NEURO_SYNONYMS = {
  "prefrontal-cortex": ["prefrontal", "frontal lobe"],
  "basal-ganglia": ["basal ganglia", "striatum", "striatal"],
  "temporal-lobe": ["temporal lobe"],
  "occipital-lobe": ["occipital"],
  "parietal-lobe": ["parietal"],
  "nucleus-accumbens": ["nucleus accumbens", "reward circuit"],
  "HPA-axis": ["hpa axis", "cortisol", "stress axis"],
  "brainstem": ["brainstem", "brain stem", "medulla", "pons", "midbrain"],
  "acetylcholine": ["acetylcholine", "cholinergic"],
  "norepinephrine": ["norepinephrine", "noradrenaline", "noradrenergic"],
  "dopamine": ["dopamine", "dopaminergic"],
  "serotonin": ["serotonin", "serotonergic"],
  "glutamate": ["glutamate", "glutamatergic", "nmda"],
  "GABA": ["gaba", "gabaergic"],
};
/** Too generic to be evidence of anything — they appear in the title of nearly
    every psychopharmacology talk. */
const NEURO_STOP = new Set(["receptor", "neurotransmission"]);

/** Therapy-modality tags (tags.psychotherapy). */
const THERAPY_SYNONYMS = {
  psychodynamic: ["psychodynamic", "psychoanalytic", "transference"],
  CBT: ["cbt", "cognitive behavioral", "cognitive therapy"],
  DBT: ["dbt", "dialectical"],
  IPT: ["interpersonal therapy", "ipt"],
  motivational: ["motivational interviewing"],
  exposure: ["exposure therapy", "exposure and response"],
  family: ["family therapy"],
  group: ["group therapy"],
  supportive: ["supportive therapy"],
  behavioral: ["behavioral activation", "behavior therapy"],
  mindfulness: ["mindfulness", "acceptance and commitment"],
  "twelve-step": ["12-step", "twelve step", "alcoholics anonymous"],
};

const norm = (s) => (s || "").toLowerCase();

function questionEntities(q) {
  const out = new Set();
  for (const m of q.tags?.medication || []) out.add(norm(m));
  for (const d of q.tags?.diagnosis || []) {
    const k = norm(d);
    out.add(k.replace(/-/g, " "));
    for (const syn of SYNONYMS[k] || []) out.add(syn);
  }
  for (const n of q.tags?.neuro || []) {
    const k = norm(n);
    if (NEURO_STOP.has(k)) continue;
    if (NEURO_SYNONYMS[n] || NEURO_SYNONYMS[k]) for (const syn of NEURO_SYNONYMS[n] || NEURO_SYNONYMS[k]) out.add(syn);
    else out.add(k.replace(/-/g, " "));
  }
  for (const t of q.tags?.psychotherapy || []) {
    for (const syn of THERAPY_SYNONYMS[t] || [norm(t).replace(/-/g, " ")]) out.add(syn);
  }
  // Theorist names are unusually reliable title matches — an episode with
  // "Winnicott" or "Erikson" in the title is squarely about that theorist.
  for (const h of q.tags?.historical || []) out.add(norm(h));

  // A distinctive answer term (proper nouns, drug-ish endings) also counts —
  // it covers the ~1,300 questions carrying no medication/diagnosis tag.
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
  const chapters = e.chapters.map((c) => c.title).slice(0, 25).join("; ");
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
  n = Math.sqrt(n);
  return v.map((x) => x / n);
}

async function main() {
  const sample = +arg("sample", 0);
  const questions = JSON.parse(await readFile(join(ROOT, "extraction/output/questions_all.json"), "utf8"));
  const episodes = JSON.parse(await readFile(join(__dirname, "episodes.json"), "utf8"));

  const qs = questions.filter((q) => q.video_query);
  console.error(`embedding ${episodes.length} episodes + ${qs.length} questions…`);
  const epVecs = (await embedAll(episodes.map(episodeText), "episodes")).map(normalize);
  const qVecs = (await embedAll(qs.map(questionText), "questions")).map(normalize);

  // Two haystacks, deliberately. An entity found in the TITLE or CHAPTER list
  // means the episode is *about* that thing; the same word buried in a
  // description usually means it was mentioned in passing (a show-notes drug
  // list, a sponsor blurb, a "previously on" recap). Gating on description hits
  // was what paired "venlafaxine dosing" with a mood-stabilizer episode and
  // "regression analysis" with a depression episode, so only strong hits open
  // the gate; weak hits ride along as context for the verifier.
  const strongHay = episodes.map((e) => norm(`${e.title} ${e.chapters.map((c) => c.title).join(" ")}`));
  const weakHay = episodes.map((e) => norm((e.description || "").slice(0, 600)));
  const SIM_FLOOR = { core: 0.45, adjacent: 0.5 };

  const dim = epVecs[0].length;
  const out = [];
  for (let qi = 0; qi < qs.length; qi++) {
    const q = qs[qi], qv = qVecs[qi];
    const ents = questionEntities(q);
    const scored = [];
    for (let ei = 0; ei < episodes.length; ei++) {
      const ev = epVecs[ei];
      let dot = 0;
      for (let d = 0; d < dim; d++) dot += qv[d] * ev[d];
      if (dot < SIM_FLOOR[episodes[ei].tier]) continue;
      const strong = ents.filter((t) => t.length > 3 && strongHay[ei].includes(t));
      if (!strong.length) continue;
      const weak = ents.filter((t) => t.length > 3 && !strong.includes(t) && weakHay[ei].includes(t));
      scored.push({ ei, sim: dot, hits: strong, weakHits: weak });
    }
    scored.sort((a, b) => b.sim - a.sim);
    const top = scored.slice(0, TOP_K);
    if (!top.length) continue;
    out.push({
      qid: `${q.year}-${q.q_index}`, year: q.year, q_index: q.q_index,
      video_query: q.video_query, answer_text: q.answer_text,
      candidates: top.map((s) => ({
        videoId: episodes[s.ei].videoId, channel: episodes[s.ei].channel, tier: episodes[s.ei].tier,
        kind: episodes[s.ei].kind || "podcast",
        title: episodes[s.ei].title, sim: +s.sim.toFixed(3), entityHits: s.hits,
        chapters: episodes[s.ei].chapters, durationSec: episodes[s.ei].durationSec,
        publishedAt: episodes[s.ei].publishedAt,
      })),
    });
    if (qi % 250 === 0) process.stderr.write(`  matched ${qi}/${qs.length}\r`);
  }
  process.stderr.write("\n");

  console.log(`${out.length}/${qs.length} questions (${Math.round((out.length / qs.length) * 100)}%) have >=1 gated candidate`);

  if (sample) {
    const pick = out.filter((_, i) => i % Math.max(1, Math.floor(out.length / sample)) === 0).slice(0, sample);
    for (const r of pick) {
      console.log(`\n[${r.qid}] ${r.video_query}\n     answer: ${(r.answer_text || "").slice(0, 80)}`);
      for (const c of r.candidates.slice(0, 3)) {
        console.log(`   ${c.sim}  ${(c.channel + " ·").padEnd(34)} ${c.title.slice(0, 76)}`);
        console.log(`          entity: ${c.entityHits.join(", ")}`);
      }
    }
    return;
  }

  await writeFile(join(__dirname, "candidates.json"), JSON.stringify(out));
  console.log(`→ scripts/podcasts/candidates.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
