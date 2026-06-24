// Split the full question bank into compact per-batch input files for the
// historical-context generation workflow. Each input record carries only what's
// needed to write a memory-aid blurb about the answer concept.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const BATCH = 30;

const all = JSON.parse(readFileSync(join(root, "extraction/output/questions_all.json"), "utf8"));

const inDir = join(here, "in");
const outDir = join(here, "out");
if (existsSync(inDir)) rmSync(inDir, { recursive: true });
mkdirSync(inDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const compact = all.map((q) => {
  const letters = (q.answer_letters && q.answer_letters.length ? q.answer_letters : (q.answer_letter ? [q.answer_letter] : []));
  return {
    id: `${q.year}-${q.q_index}`,
    stem: q.stem,
    options: (q.options || []).map((o) => `${o.letter}) ${o.text}`).join("\n"),
    answer: `${letters.join(", ")}${q.answer_text ? " — " + q.answer_text : ""}`,
  };
});

let n = 0;
for (let i = 0; i < compact.length; i += BATCH) {
  const slice = compact.slice(i, i + BATCH);
  const id = String(n).padStart(3, "0");
  writeFileSync(join(inDir, `batch_${id}.json`), JSON.stringify(slice));
  n++;
}
console.log(`wrote ${n} batches (${BATCH}/batch) covering ${compact.length} questions to ${inDir}`);
