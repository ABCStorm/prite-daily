#!/usr/bin/env node

import { appendFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";

const DEFAULT_INPUT = "extraction/output/questions_all.json";
const DEFAULT_OUTPUT = "extraction/output/audio_scripts.jsonl";
const DEFAULT_STATE = "extraction/output/audio_scripts.state.json";

function usage() {
  console.log(`Usage:
  node generate-audio-scripts.mjs [options]

Options:
  --input PATH          Question bank JSON (default: ${DEFAULT_INPUT})
  --output PATH         Append-only script JSONL (default: ${DEFAULT_OUTPUT})
  --state PATH          Progress/error snapshot (default: ${DEFAULT_STATE})
  --kind KIND           teaching or prompt (default: teaching)
  --batch-size N        Questions per Codex request, 1-50 (default: 25)
  --sample N            Generate a representative sample instead of the full bank
  --max-batches N       Stop after N batches in this run
  --retries N           Attempts for missing/invalid records (default: 3)
  --model NAME          Optional Codex model override
  --reasoning-effort E  low, medium, high, or xhigh (default: local config)
  --shard I/N           Process source indexes where index modulo N equals I
  --codex PATH          Codex executable (default: codex)
  --verbose             Stream Codex diagnostics to stderr
  --help                Show this help

Run a representative pilot first:
  node generate-audio-scripts.mjs --sample 15

Then resume into the complete bank:
  node generate-audio-scripts.mjs`);
}

function parseArgs(argv) {
  const opts = {
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT,
    state: DEFAULT_STATE,
    batchSize: 25,
    sample: null,
    maxBatches: Infinity,
    retries: 3,
    model: null,
    reasoningEffort: null,
    shard: null,
    codex: "codex",
    verbose: false,
    kind: "teaching",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      if (!argv[i + 1]) throw new Error(`${arg} requires a value`);
      i += 1;
      return argv[i];
    };
    if (arg === "--input") opts.input = value();
    else if (arg === "--output") opts.output = value();
    else if (arg === "--state") opts.state = value();
    else if (arg === "--kind") opts.kind = value();
    else if (arg === "--batch-size") opts.batchSize = Number(value());
    else if (arg === "--sample") opts.sample = Number(value());
    else if (arg === "--max-batches") opts.maxBatches = Number(value());
    else if (arg === "--retries") opts.retries = Number(value());
    else if (arg === "--model") opts.model = value();
    else if (arg === "--reasoning-effort") opts.reasoningEffort = value();
    else if (arg === "--shard") {
      const match = value().match(/^(\d+)\/(\d+)$/);
      if (!match) throw new Error("--shard must use INDEX/TOTAL, for example 0/2");
      opts.shard = { index: Number(match[1]), total: Number(match[2]) };
    }
    else if (arg === "--codex") opts.codex = value();
    else if (arg === "--verbose") opts.verbose = true;
    else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!Number.isInteger(opts.batchSize) || opts.batchSize < 1 || opts.batchSize > 50) {
    throw new Error("--batch-size must be an integer from 1 to 50");
  }
  if (opts.sample !== null && (!Number.isInteger(opts.sample) || opts.sample < 1)) {
    throw new Error("--sample must be a positive integer");
  }
  if (opts.maxBatches !== Infinity && (!Number.isInteger(opts.maxBatches) || opts.maxBatches < 1)) {
    throw new Error("--max-batches must be a positive integer");
  }
  if (!Number.isInteger(opts.retries) || opts.retries < 1 || opts.retries > 8) {
    throw new Error("--retries must be an integer from 1 to 8");
  }
  if (opts.reasoningEffort && !["low", "medium", "high", "xhigh"].includes(opts.reasoningEffort)) {
    throw new Error("--reasoning-effort must be low, medium, high, or xhigh");
  }
  if (!["teaching", "prompt"].includes(opts.kind)) throw new Error("--kind must be teaching or prompt");
  if (
    opts.shard &&
    (!Number.isInteger(opts.shard.index) ||
      !Number.isInteger(opts.shard.total) ||
      opts.shard.total < 2 ||
      opts.shard.total > 16 ||
      opts.shard.index < 0 ||
      opts.shard.index >= opts.shard.total)
  ) throw new Error("--shard requires 0 <= INDEX < TOTAL and TOTAL from 2 to 16");
  return opts;
}

function questionId(question) {
  return `${question.year}-${question.q_index}`;
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function validateScript(text, question, kind = "teaching") {
  if (typeof text !== "string") return "script is not a string";
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length < 12) return "script is too short";
  const maximumWords = kind === "prompt" ? 65 : 45;
  if (clean.length > (kind === "prompt" ? 620 : 420)) return "script is too long";
  if (wordCount(clean) > maximumWords) return `script has ${wordCount(clean)} words (maximum ${maximumWords})`;
  if (/[\r\n]/.test(text)) return "script contains a newline";
  if (!/[.!?][”"']?$/.test(clean)) return "script does not end with sentence punctuation";
  if (/```|^\s*[\[{]/.test(clean)) return "script contains markup or JSON";
  if (/\b(as an ai|ai-generated|language model)\b/i.test(clean)) return "script mentions AI";
  if (kind === "prompt" && !/\?[”"']?$/.test(clean)) return "open-ended prompt does not end with a question mark";
  if (kind === "prompt" && /\b(which of the following|answer choices?|option [a-e]|choices?:)\b/i.test(clean)) return "prompt still refers to multiple-choice options";
  if (!question.answer_text?.trim()) return "source question has no answer_text";
  return null;
}

function representativeSample(questions, count) {
  if (count >= questions.length) return questions;
  const selected = new Map();
  const groups = new Map();
  for (const question of questions) {
    const key = question.prite_category || question.prite_label || "uncategorized";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(question);
  }
  const groupList = [...groups.values()].sort((a, b) => b.length - a.length);
  let round = 0;
  while (selected.size < count && groupList.some((group) => round < group.length)) {
    for (const group of groupList) {
      if (selected.size >= count) break;
      if (round >= group.length) continue;
      const index = Math.min(
        group.length - 1,
        Math.floor(((round + 0.5) / Math.max(1, Math.ceil(count / groupList.length))) * group.length),
      );
      const question = group[index];
      selected.set(questionId(question), question);
    }
    round += 1;
  }
  if (selected.size < count) {
    const remaining = questions.filter((q) => !selected.has(questionId(q)));
    for (let i = 0; selected.size < count && i < remaining.length; i += 1) {
      const index = Math.min(
        remaining.length - 1,
        Math.floor(((i + 0.5) / (count - selected.size)) * remaining.length),
      );
      const question = remaining[index];
      selected.set(questionId(question), question);
    }
  }
  return [...selected.values()].slice(0, count);
}

async function readCompleted(outputPath) {
  const completed = new Map();
  try {
    const contents = await readFile(outputPath, "utf8");
    for (const [index, line] of contents.split(/\r?\n/).entries()) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        if (row.question_id && (row.script || row.prompt)) completed.set(row.question_id, row);
      } catch (error) {
        throw new Error(`Invalid JSONL at ${outputPath}:${index + 1}: ${error.message}`);
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return completed;
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

function promptFor(questions, attempt, kind = "teaching") {
  const payload = questions.map((question) => ({
    question_id: questionId(question),
    stem: question.stem,
    options: question.options,
    correct_answer_letter: question.answer_letter,
    correct_answer_text: question.answer_text,
    explanation: question.explanation_text,
  }));
  if (kind === "prompt") return `Rewrite each supplied psychiatry board item as a concise, self-contained, open-ended spoken active-recall question.

Return only the JSON object required by the provided output schema. The "scripts" object must contain exactly one property for every supplied question_id, keyed by that exact ID.

For each value:
- Write exactly one natural spoken question of no more than 65 words, ending with a question mark.
- Preserve the clinical facts needed to identify the verified answer, but compress long vignettes to their distinguishing details.
- Remove all answer choices and never say "which of the following," "option," "choice," or an answer letter.
- Do not state or reveal the correct answer in the question. Use the supplied answer and explanation only to understand what the prompt must test.
- Prefer a direct question such as "What is the most likely diagnosis?", "What is the next best step?", or "Which brain circuit is implicated?" when appropriate.
- Prefer plain speech; expand symbols or abbreviations when speech would otherwise be unclear.
- Do not use markdown, headings, quotation marks around the question, or line breaks.

This is generation attempt ${attempt}. Check that no ID is missing before returning.

QUESTIONS:
${JSON.stringify(payload)}`;

  return `Create spoken active-recall teaching points for the supplied verified psychiatry board questions.

Return only the JSON object required by the provided output schema. The "scripts" object must contain exactly one property for every supplied question_id, keyed by that exact ID.

For each value:
- Write exactly one concise, standalone spoken sentence of no more than 45 words.
- State the correct answer and the single highest-yield fact that distinguishes it.
- Prefer plain speech; expand symbols or abbreviations when speech would otherwise be unclear.
- Treat the supplied correct answer and explanation as authoritative. Do not change the answer or add unsupported facts.
- Do not refer to option letters alone, the test, the prompt, JSON, or AI.
- Do not use markdown, headings, quotation marks around the sentence, or line breaks.

This is generation attempt ${attempt}. Check that no ID is missing before returning.

QUESTIONS:
${JSON.stringify(payload)}`;
}

async function runCodex({ codex, model, reasoningEffort, verbose, kind }, questions, attempt) {
  const tempBase = resolve(tmpdir(), `prite-audio-${process.pid}-${Date.now()}-${attempt}`);
  const tempPath = `${tempBase}.json`;
  const schemaPath = `${tempBase}.schema.json`;
  const ids = questions.map(questionId);
  const scriptProperties = Object.fromEntries(ids.map((id) => [id, {
    type: "string",
    minLength: 12,
    maxLength: kind === "prompt" ? 620 : 420,
  }]));
  await writeFile(schemaPath, `${JSON.stringify({
    type: "object",
    additionalProperties: false,
    required: ["scripts"],
    properties: {
      scripts: {
        type: "object",
        additionalProperties: false,
        required: ids,
        properties: scriptProperties,
      },
    },
  })}\n`);
  const args = [
    "exec",
    "--ephemeral",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--output-schema",
    schemaPath,
    "--output-last-message",
    tempPath,
  ];
  if (model) args.push("--model", model);
  if (reasoningEffort) args.push("--config", `model_reasoning_effort="${reasoningEffort}"`);
  args.push("-");

  let diagnostics = "";
  try {
    const exitCode = await new Promise((resolveExit, reject) => {
      const child = spawn(codex, args, { stdio: ["pipe", "pipe", "pipe"] });
      child.on("error", reject);
      child.stdout.on("data", (chunk) => {
        if (verbose) process.stderr.write(chunk);
      });
      child.stderr.on("data", (chunk) => {
        diagnostics = `${diagnostics}${chunk}`.slice(-12000);
        if (verbose) process.stderr.write(chunk);
      });
      child.on("close", resolveExit);
      child.stdin.end(promptFor(questions, attempt, kind));
    });
    if (exitCode !== 0) {
      throw new Error(`Codex exited with status ${exitCode}: ${diagnostics.slice(-3000)}`);
    }
    const raw = await readFile(tempPath, "utf8");
    return JSON.parse(raw);
  } finally {
    await Promise.allSettled([unlink(tempPath), unlink(schemaPath)]);
  }
}

async function generateBatch(opts, originalBatch, completed, errors, batchNumber) {
  let pending = originalBatch.filter((question) => !completed.has(questionId(question)));
  for (let attempt = 1; pending.length && attempt <= opts.retries; attempt += 1) {
    console.log(
      `[batch ${batchNumber}] attempt ${attempt}/${opts.retries}: requesting ${pending.length} ${opts.kind === "prompt" ? "open-ended prompt" : "teaching point"}(s)`,
    );
    try {
      const response = await runCodex(opts, pending, attempt);
      const scripts = response?.scripts;
      if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) {
        throw new Error('Codex response does not contain a "scripts" object');
      }
      const nextPending = [];
      for (const question of pending) {
        const id = questionId(question);
        const script = typeof scripts[id] === "string" ? scripts[id].replace(/\s+/g, " ").trim() : scripts[id];
        const validationError = validateScript(script, question, opts.kind);
        if (validationError) {
          errors[id] = { attempts: attempt, error: validationError, updated_at: new Date().toISOString() };
          nextPending.push(question);
          continue;
        }
        const row = {
          question_id: id,
          [opts.kind === "prompt" ? "prompt" : "script"]: script,
          generated_at: new Date().toISOString(),
          engine: "codex",
          kind: opts.kind,
        };
        await appendFile(opts.output, `${JSON.stringify(row)}\n`);
        completed.set(id, row);
        delete errors[id];
      }
      pending = nextPending;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const question of pending) {
        const id = questionId(question);
        errors[id] = { attempts: attempt, error: message, updated_at: new Date().toISOString() };
      }
      console.error(`[batch ${batchNumber}] ${message}`);
    }
    await atomicJson(opts.state, {
      source: opts.input,
      output: opts.output,
      total_source_questions: originalBatch.length,
      completed: completed.size,
      errors,
      updated_at: new Date().toISOString(),
    });
  }
  return pending;
}

async function main() {
  const rawOpts = parseArgs(process.argv.slice(2));
  const opts = {
    ...rawOpts,
    input: resolve(rawOpts.input),
    output: resolve(rawOpts.output),
    state: resolve(rawOpts.state),
  };
  await mkdir(dirname(opts.output), { recursive: true });
  await mkdir(dirname(opts.state), { recursive: true });

  const questions = JSON.parse(await readFile(opts.input, "utf8"));
  if (!Array.isArray(questions)) throw new Error("Question bank must be a JSON array");
  const ids = new Set();
  for (const question of questions) {
    const id = questionId(question);
    if (!question.year || !Number.isInteger(question.q_index) || id === "undefined-undefined") {
      throw new Error(`Question is missing a stable year/q_index ID: ${JSON.stringify(question).slice(0, 200)}`);
    }
    if (ids.has(id)) throw new Error(`Duplicate question ID: ${id}`);
    ids.add(id);
  }

  if (opts.sample && opts.shard) throw new Error("--sample and --shard cannot be combined");
  const selected = opts.sample
    ? representativeSample(questions, Math.min(opts.sample, questions.length))
    : opts.shard
      ? questions.filter((_, index) => index % opts.shard.total === opts.shard.index)
      : questions;
  const completed = await readCompleted(opts.output);
  const errors = {};
  const remaining = selected.filter((question) => !completed.has(questionId(question)));
  console.log(
    `Source ${questions.length}; selected ${selected.length}; already complete ${selected.length - remaining.length}; remaining ${remaining.length}`,
  );

  let failed = 0;
  let batchesRun = 0;
  for (let offset = 0; offset < remaining.length && batchesRun < opts.maxBatches; offset += opts.batchSize) {
    const batch = remaining.slice(offset, offset + opts.batchSize);
    batchesRun += 1;
    const pending = await generateBatch(opts, batch, completed, errors, batchesRun);
    failed += pending.length;
    console.log(
      `[batch ${batchesRun}] complete ${batch.length - pending.length}/${batch.length}; total output records ${completed.size}`,
    );
  }

  const selectedComplete = selected.filter((question) => completed.has(questionId(question))).length;
  await atomicJson(opts.state, {
    source: opts.input,
    output: opts.output,
    mode: opts.sample
      ? `sample:${selected.length}`
      : opts.shard
        ? `shard:${opts.shard.index}/${opts.shard.total}`
        : "full",
    total_source_questions: questions.length,
    selected_questions: selected.length,
    selected_complete: selectedComplete,
    output_records: completed.size,
    errors,
    batches_run: batchesRun,
    updated_at: new Date().toISOString(),
  });
  console.log(
    `Finished this run: ${selectedComplete}/${selected.length} selected questions complete; ${failed} failed in attempted batches.`,
  );
  if (failed) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
