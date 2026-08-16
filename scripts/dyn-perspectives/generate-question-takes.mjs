#!/usr/bin/env node
/**
 * Write a unique Dynamic Dawg take for every PRITE item via the Grok CLI
 * (subscription OAuth in ~/.grok). Resume-safe.
 *
 *   node scripts/dyn-perspectives/generate-question-takes.mjs --sample 8
 *   node scripts/dyn-perspectives/generate-question-takes.mjs
 *   node scripts/dyn-perspectives/generate-question-takes.mjs --force --only 2022-11
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { isDynPerspectiveEligible } from "./eligibility.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const BANK = join(ROOT, "extraction/output/questions_all.json");
const OUT = join(ROOT, "public/data/dyn_perspectives.json");
const STATE = join(ROOT, "extraction/output/dyn_gen_v2.state.json");
const CACHE = join(ROOT, "extraction/output/dyn_gen_tmp");
const MODEL = "grok-4.6";

// Rotate viewpoints so we do not default to object relations every time.
// Conference staples appear more often; APA-textbook lenses appear too.
const LENSES = [
  "drive conflict — a wish and a prohibition colliding in a symptom or repetition",
  "ego strength — affect tolerance, impulse control, reality testing, or coping with change",
  "superego — guilt, conscience, rigidity, or a sanctioned gap in morality",
  "defense — name one defense (denial, repression, splitting, undoing, acting out, reaction formation, humor, suppression) and how it works here",
  "Erikson stage — which psychosocial task this item sits on",
  "insight and psychological mindedness — can they see their own part, and use a trial comment",
  "object relations — how good and bad are held in a relationship; use only if this is the assigned lens",
  "self psychology — mirroring, idealizing, or competence / self-esteem",
  "attachment — proximity, secure base, separation protest, or using another person to regulate",
  "transference and countertransference — who you are being recruited to become, and what you feel",
  "enactment — a two-person repetition already happening in the room or the system",
  "meaning of the symptom — what the finding, drug, or behavior is doing for the person",
  "treatment frame and ethics — fee, time, confidentiality, reporting, or who holds the limit",
  "Kleinian — projective identification, paranoid-schizoid vs depressive concern, or the need to repair",
  "Bion — containing a raw feeling so it can become thinkable; nameless dread or evacuation",
  "relational / interpersonal — two people making the pattern together, not a one-person mind",
  "trauma and unrepresented states — what cannot be remembered is repeated in the body or the dyad",
  "dissociation — a vertical split; the person leaves without leaving the chair",
  "development / child analysis — a capacity that arrived, arrived late, or never quite arrived",
  "psychopharmacology as relationship — the pill as feed, poison, demand, or proof of need",
  "cultural third / identity — race, gender, sexuality, or class as a live third in the room, only if the item actually touches it",
  "termination and limits — ending, time, or a capacity that cannot be rushed",
  "prognosis and technique — how much uncovering vs support this mind can use",
];

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const SAMPLE = arg("sample") ? Number(arg("sample")) : 0;
const ONLY = new Set(
  args.filter((_, i) => args[i - 1] === "--only").flatMap((v) => v.split(",")).filter(Boolean),
);
const FORCE = flag("force");
const BATCH = Math.max(1, Number(arg("batch", "6")));
const CONCURRENCY = Math.max(1, Number(arg("concurrency", "6")));

const SCHEMA = JSON.stringify({
  type: "object",
  additionalProperties: false,
  required: ["takes"],
  properties: {
    takes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "take", "lens"],
        properties: {
          id: { type: "string" },
          take: { type: "string" },
          lens: { type: "string" },
        },
      },
    },
  },
});

function qidOf(q) {
  return `${q.year}-${q.q_index}`;
}

function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function lensFor(q) {
  return LENSES[hash32(qidOf(q)) % LENSES.length];
}

function clip(text, n = 420) {
  const s = (text || "").replace(/\s+/g, " ").trim();
  return s.length <= n ? s : `${s.slice(0, n).trim()}…`;
}

function itemBlock(q, i) {
  const options = Array.isArray(q.options)
    ? q.options.map((o) => `${o.letter}. ${o.text}`).join(" | ")
    : "";
  return [
    `ITEM ${i}  id=${qidOf(q)}  category=${q.prite_category || "unknown"}`,
    `ASSIGNED LENS: ${lensFor(q)}`,
    `STEM: ${q.stem || ""}`,
    options ? `CHOICES: ${options}` : "",
    `CORRECT ANSWER: ${q.answer_text || q.answer_letter || ""}`,
    q.clinical_application ? `CLINICAL NOTE: ${clip(q.clinical_application, 220)}` : "",
  ].filter(Boolean).join("\n");
}

function promptFor(batch) {
  return `You write Dynamic Dawg notes for PRITE Daily. The resident already read the question and the correct answer. Do not retell the case.

For EACH item write 2 short sentences. Teach one psychodynamic idea about THIS item.

How to sound:
- Talk like a good teacher at the whiteboard, not a journal article.
- Short sentences. One idea per sentence. Subject–verb–object when you can.
- If you use a technical word (projective identification, containment, superego, enactment), define it in plain words in the next clause. Example: "That is an enactment: the two of you are living the old pattern instead of talking about it."
- A little warmth or wry humor is welcome when it fits. Do not be cute on suicide, abuse, or psychosis-risk items.
- Do not start with "Dynamically," "Psychodynamically," or "From a dynamic angle."
- Do not recap the stem or restate the answer as your first sentence.

Viewpoint:
- Use the ASSIGNED LENS as the primary school of thought.
- If that lens would be forced, switch to the next-best from: ego defense, drive conflict, superego, attachment, self psychology, transference/CT, trauma/dissociation, development, meaning of the symptom, frame/ethics. Do not default to object relations unless assigned.
- The note must name the actual drug, nucleus, legal test, technique, or finding. If you could paste it on another PRITE item, it is a fail.

${batch.map((q, i) => itemBlock(q, i + 1)).join("\n\n")}

Return JSON: {"takes":[{"id":"<id>","lens":"<lens you actually used>","take":"<2 sentences>"}, ...]} same ids, same order.`;
}

function grokCLI(text) {
  return new Promise((resolve, reject) => {
    const tmp = join(CACHE, `p-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
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
          "-m", MODEL,
          "--output-format", "json",
          "--json-schema", SCHEMA,
          "--no-auto-update",
        ],
        {
          maxBuffer: 16 * 1024 * 1024,
          timeout: 6 * 60_000,
          env: { ...process.env, GROK_DISABLE_AUTOUPDATER: "1" },
          cwd: ROOT,
        },
        (err, stdout, stderr) => {
          unlink(tmp).catch(() => {});
          if (err && !stdout) {
            reject(new Error(`${err.message}${stderr ? ` :: ${String(stderr).slice(0, 400)}` : ""}`));
          } else {
            resolve(stdout || "");
          }
        },
      );
    }).catch(reject);
  });
}

function parseTakes(raw) {
  let text = (raw || "").trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  // grok --output-format json may wrap the payload
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("no JSON object in model output");
    data = JSON.parse(text.slice(start, end + 1));
  }
  if (data && Array.isArray(data.structuredOutput?.takes)) return data.structuredOutput.takes;
  if (data && Array.isArray(data.takes)) return data.takes;
  if (typeof data?.text === "string") {
    const inner = JSON.parse(data.text);
    if (Array.isArray(inner?.takes)) return inner.takes;
  }
  if (data && data.result && Array.isArray(data.result.takes)) return data.result.takes;
  if (Array.isArray(data)) return data;
  throw new Error("JSON missing takes[]");
}

function cleanTake(s) {
  return String(s || "").replace(/\s+/g, " ").trim().replace(/^["']|["']$/g, "");
}

async function loadJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function saveJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}

let stateWrite = Promise.resolve();
function saveState(state) {
  stateWrite = stateWrite.then(() => saveJson(STATE, state));
  return stateWrite;
}

async function gzipJson(src, dest) {
  const buf = await readFile(src);
  await pipeline(Readable.from(buf), createGzip({ level: 9 }), createWriteStream(dest));
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function mapPool(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

async function main() {
  await mkdir(CACHE, { recursive: true });
  const questions = JSON.parse(await readFile(BANK, "utf8"));
  const byId = new Map(questions.map((q) => [qidOf(q), q]));
  let ids = questions.filter(isDynPerspectiveEligible).map(qidOf);
  if (ONLY.size) ids = ids.filter((id) => ONLY.has(id));
  if (SAMPLE > 0) {
    // Keep the screenshot item in small samples so we can judge relevance.
    const prefer = ["2022-11", "2022-208"];
    const rest = ids.filter((id) => !prefer.includes(id));
    ids = [...prefer.filter((id) => ids.includes(id)), ...rest].slice(0, SAMPLE);
  }

  const state = FORCE && !ONLY.size ? {} : await loadJson(STATE, {});
  const pending = ids.filter((id) => FORCE || !state[id]?.take);
  console.log(`${pending.length} to write (${ids.length} selected) via ${MODEL}, batch ${BATCH}, concurrency ${CONCURRENCY}`);
  if (!pending.length) {
    await flush(state, byId);
    return;
  }

  const batches = chunk(pending.map((id) => byId.get(id)).filter(Boolean), BATCH);
  let done = ids.length - pending.length;
  let errors = 0;

  await mapPool(batches, CONCURRENCY, async (batch) => {
    try {
      const raw = await grokCLI(promptFor(batch));
      const takes = parseTakes(raw);
      const byTake = new Map(takes.map((t) => [String(t.id), t]));
      for (const q of batch) {
        const id = qidOf(q);
        const row = byTake.get(id);
        const take = cleanTake(row?.take);
        if (!take || take.length < 40) {
          errors += 1;
          console.warn(`  missing/short take for ${id}`);
          continue;
        }
        state[id] = {
          take,
          lens: String(row?.lens || lensFor(q)),
          model: MODEL,
          at: new Date().toISOString(),
        };
        done += 1;
      }
      await saveState(state);
      if (done % 25 < BATCH || done === ids.length) {
        console.log(`  ${Math.min(done, ids.length)}/${ids.length}  errors=${errors}`);
      }
    } catch (e) {
      errors += batch.length;
      console.warn(`  batch failed (${batch.map(qidOf).join(",")}): ${e.message}`);
    }
  });

  await flush(state, byId);
  console.log(`wrote ${Object.keys(state).length} takes → ${OUT}`);
}

async function flush(state, byId) {
  const existing = await loadJson(OUT, {});
  const out = Object.fromEntries(
    Object.entries(existing).filter(([id]) => {
      const question = byId.get(id);
      return question && isDynPerspectiveEligible(question);
    }),
  );
  for (const [id, row] of Object.entries(state)) {
    if (!row?.take) continue;
    const question = byId.get(id);
    if (!question || !isDynPerspectiveEligible(question)) continue;
    out[id] = {
      pearl_id: `gen-${id}`,
      sentence: row.take,
      audio_path: `dyn/${id}/v1.mp3`,
    };
  }
  await saveJson(OUT, out);
  await gzipJson(OUT, `${OUT}.gz`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
