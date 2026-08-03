#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

function parseArgs(argv) {
  const opts = {
    input: "extraction/output/questions_all.json",
    scripts: "extraction/output/audio_scripts.jsonl",
    report: null,
    kind: "teaching",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      if (!argv[index + 1]) throw new Error(`${arg} requires a value`);
      index += 1;
      return argv[index];
    };
    if (arg === "--input") opts.input = value();
    else if (arg === "--scripts") opts.scripts = value();
    else if (arg === "--report") opts.report = value();
    else if (arg === "--kind") opts.kind = value();
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!["teaching", "prompt"].includes(opts.kind)) throw new Error("--kind must be teaching or prompt");
  return opts;
}

function questionId(question) {
  return `${question.year}-${question.q_index}`;
}

function normalizedTokens(text) {
  const stop = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is",
    "it", "of", "on", "or", "the", "to", "with", "all", "above", "none",
  ]);
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !stop.has(token));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const questions = JSON.parse(await readFile(resolve(opts.input), "utf8"));
  const source = new Map(questions.map((question) => [questionId(question), question]));
  const lines = (await readFile(resolve(opts.scripts), "utf8")).split(/\r?\n/).filter(Boolean);
  const rows = [];
  const duplicates = [];
  const seen = new Set();
  for (const [index, line] of lines.entries()) {
    let row;
    try {
      row = JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSONL line ${index + 1}: ${error.message}`);
    }
    if (seen.has(row.question_id)) duplicates.push(row.question_id);
    seen.add(row.question_id);
    rows.push(row);
  }

  const hardErrors = [];
  const groundingWarnings = [];
  const wordCounts = [];
  for (const row of rows) {
    const question = source.get(row.question_id);
    if (!question) {
      hardErrors.push({ question_id: row.question_id, error: "orphan ID" });
      continue;
    }
    const script = opts.kind === "prompt"
      ? (typeof row.prompt === "string" ? row.prompt : "")
      : (typeof row.script === "string" ? row.script : "");
    const words = script.trim().split(/\s+/).filter(Boolean).length;
    wordCounts.push(words);
    if (!script) hardErrors.push({ question_id: row.question_id, error: "empty script" });
    if (words > (opts.kind === "prompt" ? 65 : 45)) hardErrors.push({ question_id: row.question_id, error: `${words} words` });
    if (/[\r\n]/.test(script)) hardErrors.push({ question_id: row.question_id, error: "newline" });
    if (!/[.!?][”"']?$/.test(script)) hardErrors.push({ question_id: row.question_id, error: "missing terminal punctuation" });
    if (/\b(as an ai|ai-generated|language model)\b/i.test(script)) {
      hardErrors.push({ question_id: row.question_id, error: "mentions AI" });
    }
    if (opts.kind === "prompt" && !/\?[”"']?$/.test(script)) hardErrors.push({ question_id: row.question_id, error: "prompt does not end with ?" });
    if (opts.kind === "prompt" && /\b(which of the following|answer choices?|option [a-e]|choices?:)\b/i.test(script)) {
      hardErrors.push({ question_id: row.question_id, error: "multiple-choice wording" });
    }
    const answerTokens = normalizedTokens(question.answer_text);
    const scriptTokens = new Set(normalizedTokens(script));
    if (opts.kind === "teaching" && answerTokens.length && !answerTokens.some((token) => scriptTokens.has(token))) {
      groundingWarnings.push({
        question_id: row.question_id,
        answer_text: question.answer_text,
        script,
      });
    }
  }
  for (const id of duplicates) hardErrors.push({ question_id: id, error: "duplicate output record" });

  const missing = [...source.keys()].filter((id) => !seen.has(id));
  const report = {
    source_questions: source.size,
    kind: opts.kind,
    output_records: rows.length,
    unique_output_ids: seen.size,
    missing_count: missing.length,
    missing_ids: missing.slice(0, 100),
    hard_error_count: hardErrors.length,
    hard_errors: hardErrors.slice(0, 100),
    grounding_warning_count: groundingWarnings.length,
    grounding_warnings: groundingWarnings.slice(0, 100),
    word_count: {
      minimum: wordCounts.length ? Math.min(...wordCounts) : null,
      maximum: wordCounts.length ? Math.max(...wordCounts) : null,
      average: wordCounts.length
        ? Number((wordCounts.reduce((sum, count) => sum + count, 0) / wordCounts.length).toFixed(2))
        : null,
    },
    audited_at: new Date().toISOString(),
  };
  if (opts.report) await writeFile(resolve(opts.report), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (hardErrors.length || (rows.length === source.size && missing.length)) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
