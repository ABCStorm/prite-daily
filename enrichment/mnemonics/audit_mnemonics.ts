import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { mnemonicCatalog, mnemonicsForQuestion } from "../../src/lib/mnemonics";

const root = resolve(process.cwd());
const bankPath = resolve(root, "extraction/output/questions_all.json");
const outPath = resolve(root, "enrichment/mnemonics/coverage-audit.json");
const bank = JSON.parse(readFileSync(bankPath, "utf8"));
if (!Array.isArray(bank) || bank.length !== 5100) throw new Error(`Expected 5100 questions; found ${bank?.length}`);

const counts: Record<string, number> = Object.fromEntries(mnemonicCatalog.map((m) => [m.id, 0]));
const byYear: Record<string, number> = {};
const samples: Record<string, string[]> = {};
let covered = 0;
let assignments = 0;

for (const q of bank) {
  const found = mnemonicsForQuestion(q);
  if (found.length > 2) throw new Error(`${q.year}-${q.q_index} received more than two mnemonics`);
  if (!found.length) continue;
  covered += 1;
  assignments += found.length;
  byYear[q.year] = (byYear[q.year] || 0) + 1;
  for (const item of found) {
    counts[item.id] += 1;
    (samples[item.id] ||= []);
    if (samples[item.id].length < 5) samples[item.id].push(`${q.year}-${q.q_index}: ${q.answer_text || q.stem}`);
  }
}

for (const mnemonic of mnemonicCatalog) {
  if (!mnemonic.sources.length || mnemonic.sources.some((s) => !/^https:\/\//.test(s.url))) {
    throw new Error(`${mnemonic.id} has a missing or invalid source URL`);
  }
  if (!mnemonic.breakdown.length || !mnemonic.memoryAid.trim()) throw new Error(`${mnemonic.id} is incomplete`);
}

const uniqueSources = [...new Map(mnemonicCatalog.flatMap((m) => m.sources).map((s) => [s.url, s])).values()];
const sourceChecks = await Promise.all(uniqueSources.map(async (source) => {
  try {
    const response = await fetch(source.url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(15_000) });
    return { ...source, ok: response.ok, status: response.status, final_url: response.url };
  } catch (error) {
    return { ...source, ok: false, status: null, error: error instanceof Error ? error.message : String(error) };
  }
}));
const brokenSources = sourceChecks.filter((s) => !s.ok);
if (brokenSources.length) throw new Error(`Source verification failed: ${JSON.stringify(brokenSources)}`);

const audit = {
  generated_at: new Date().toISOString(),
  bank_sha256: createHash("sha256").update(readFileSync(bankPath)).digest("hex"),
  question_count: bank.length,
  catalog_entries: mnemonicCatalog.length,
  questions_with_mnemonics: covered,
  coverage_percent: Math.round((covered / bank.length) * 1000) / 10,
  mnemonic_assignments: assignments,
  maximum_per_question: 2,
  by_year: byYear,
  by_mnemonic: Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])),
  review_samples: samples,
  source_checks: sourceChecks,
  safeguards: [
    "Matching uses structured tags plus the stem and keyed answer text; distractor options are excluded.",
    "Each question receives no more than two mnemonics.",
    "Every mnemonic has at least one external source and an independently phrased expansion.",
    "Question IDs and question-bank content are not modified; matching occurs at display/export time.",
  ],
};
writeFileSync(outPath, JSON.stringify(audit, null, 2) + "\n");
console.log(JSON.stringify(audit, null, 2));
