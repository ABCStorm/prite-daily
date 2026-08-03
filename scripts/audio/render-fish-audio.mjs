#!/usr/bin/env node

import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { mkdir } from "node:fs/promises";

const DEFAULT_INPUT = "extraction/output/questions_all.json";
const DEFAULT_SCRIPTS = "extraction/output/audio_scripts.jsonl";
const DEFAULT_PROMPTS = "extraction/output/audio_prompts.jsonl";
const DEFAULT_STATE = "extraction/output/audio_render.state.json";
const RENDER_VERSION = "v4-open-ended";

function usage() {
  console.log(`Usage:
  node render-fish-audio.mjs [options]

Required environment:
  SUPABASE_URL
  SUPABASE_ANON_KEY
  AUDIO_BATCH_SECRET

Options:
  --input PATH          Question bank JSON (default: ${DEFAULT_INPUT})
  --scripts PATH        Generated teaching-point JSONL (default: ${DEFAULT_SCRIPTS})
  --prompts PATH        Generated open-ended prompt JSONL (default: ${DEFAULT_PROMPTS})
  --state PATH          Resumable render state (default: ${DEFAULT_STATE})
  --sample N            Render a representative pilot only
  --ids ID,ID           Render only these exact question IDs
  --concurrency N       Simultaneous Edge Function calls, 1-8 (default: 2)
  --retries N           Attempts per question, 1-8 (default: 5)
  --voice-style STYLE   calm, clear, or brisk (default: calm)
  --verify-dir PATH     Pilot-only: download clips through 2-minute signed URLs
  --force               Regenerate already-cached audio
  --help                Show this help

Pilot first:
  node scripts/audio/render-fish-audio.mjs --sample 3

Then resume the whole bank:
  node scripts/audio/render-fish-audio.mjs`);
}

function parseArgs(argv) {
  const opts = {
    input: DEFAULT_INPUT,
    scripts: DEFAULT_SCRIPTS,
    prompts: DEFAULT_PROMPTS,
    state: DEFAULT_STATE,
    sample: null,
    ids: null,
    concurrency: 2,
    retries: 5,
    voiceStyle: "calm",
    verifyDir: null,
    force: false,
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
    else if (arg === "--prompts") opts.prompts = value();
    else if (arg === "--state") opts.state = value();
    else if (arg === "--sample") opts.sample = Number(value());
    else if (arg === "--ids") opts.ids = value().split(",").map((id) => id.trim()).filter(Boolean);
    else if (arg === "--concurrency") opts.concurrency = Number(value());
    else if (arg === "--retries") opts.retries = Number(value());
    else if (arg === "--voice-style") opts.voiceStyle = value();
    else if (arg === "--verify-dir") opts.verifyDir = value();
    else if (arg === "--force") opts.force = true;
    else if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (opts.sample !== null && (!Number.isInteger(opts.sample) || opts.sample < 1)) {
    throw new Error("--sample must be a positive integer");
  }
  if (!Number.isInteger(opts.concurrency) || opts.concurrency < 1 || opts.concurrency > 8) {
    throw new Error("--concurrency must be an integer from 1 to 8");
  }
  if (!Number.isInteger(opts.retries) || opts.retries < 1 || opts.retries > 8) {
    throw new Error("--retries must be an integer from 1 to 8");
  }
  if (!["calm", "clear", "brisk"].includes(opts.voiceStyle)) {
    throw new Error("--voice-style must be calm, clear, or brisk");
  }
  return opts;
}

function questionId(question) {
  return `${question.year}-${question.q_index}`;
}

function representativeSample(questions, count) {
  if (count >= questions.length) return questions;
  const groups = new Map();
  for (const question of questions) {
    const key = question.prite_category || question.prite_label || "uncategorized";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(question);
  }
  const selected = [];
  const used = new Set();
  for (const group of [...groups.values()].sort((a, b) => b.length - a.length)) {
    if (selected.length >= count) break;
    const question = group[Math.floor(group.length / 2)];
    selected.push(question);
    used.add(questionId(question));
  }
  for (let index = 0; selected.length < count && index < questions.length; index += 1) {
    const sourceIndex = Math.min(
      questions.length - 1,
      Math.floor(((index + 0.5) / (count - selected.length)) * questions.length),
    );
    const question = questions[sourceIndex];
    if (!used.has(questionId(question))) {
      selected.push(question);
      used.add(questionId(question));
    }
  }
  return selected.slice(0, count);
}

async function readScripts(path) {
  const scripts = new Map();
  const contents = await readFile(path, "utf8");
  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSONL at ${path}:${index + 1}: ${error.message}`);
    }
    if (!row.question_id || !row.script) {
      throw new Error(`Missing question_id or script at ${path}:${index + 1}`);
    }
    scripts.set(row.question_id, row.script);
  }
  return scripts;
}

async function readPrompts(path) {
  const prompts = new Map();
  const contents = await readFile(path, "utf8");
  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); }
    catch (error) { throw new Error(`Invalid JSONL at ${path}:${index + 1}: ${error.message}`); }
    const prompt = row.prompt ?? row.script;
    if (!row.question_id || !prompt) throw new Error(`Missing question_id or prompt at ${path}:${index + 1}`);
    prompts.set(row.question_id, prompt);
  }
  return prompts;
}

async function readState(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { ready: {}, errors: {} };
    throw error;
  }
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function invoke({ url, anonKey, batchSecret, question, script, prompt, opts }) {
  const response = await fetch(`${url.replace(/\/$/, "")}/functions/v1/generate-audio-drill`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
      "content-type": "application/json",
      "x-audio-batch-secret": batchSecret,
    },
    body: JSON.stringify({
      question_id: questionId(question),
      stem: question.stem,
      script,
      prompt_script: prompt,
      // New question years have neither clip yet, so first-time rendering must
      // create both the open-ended prompt and the teaching-point answer. The
      // Edge Function returns fully cached v4 rows before reaching synthesis,
      // making this safe for the already-complete 2014–2025 inventory.
      prompt_only: false,
      voice_style: opts.voiceStyle,
      force: opts.force,
      include_signed_urls: Boolean(opts.verifyDir),
    }),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { error: text || `HTTP ${response.status}` };
  }
  if (!response.ok || body.error) {
    const error = new Error(body.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  if (body.status !== "ready" || !body.prompt_audio_path || !body.answer_audio_path) {
    throw new Error(`Unexpected response for ${questionId(question)}: ${text.slice(0, 400)}`);
  }
  return body;
}

async function renderOne(context, question) {
  const id = questionId(question);
  const script = context.scripts.get(id);
  const prompt = context.prompts.get(id);
  for (let attempt = 1; attempt <= context.opts.retries; attempt += 1) {
    try {
      const row = await invoke({ ...context, question, script, prompt });
      if (context.opts.verifyDir) {
        const promptUrl = row.signed_urls?.prompt;
        const answerUrl = row.signed_urls?.answer;
        if (!promptUrl || !answerUrl) throw new Error("Verification download URLs were not returned");
        const downloadOptions = row.storage === "r2"
          ? { headers: { "x-audio-batch-secret": context.batchSecret } }
          : undefined;
        const [promptResponse, answerResponse] = await Promise.all([
          fetch(promptUrl, downloadOptions),
          fetch(answerUrl, downloadOptions),
        ]);
        if (!promptResponse.ok || !answerResponse.ok) {
          throw new Error(`Verification download failed: ${promptResponse.status}/${answerResponse.status}`);
        }
        const [promptBytes, answerBytes] = await Promise.all([
          promptResponse.arrayBuffer(),
          answerResponse.arrayBuffer(),
        ]);
        await mkdir(context.opts.verifyDir, { recursive: true });
        await Promise.all([
          writeFile(resolve(context.opts.verifyDir, `${id}-prompt.mp3`), Buffer.from(promptBytes)),
          writeFile(resolve(context.opts.verifyDir, `${id}-answer.mp3`), Buffer.from(answerBytes)),
        ]);
      }
      context.state.ready[id] = {
        prompt_audio_path: row.prompt_audio_path,
        answer_audio_path: row.answer_audio_path,
        audio_format: row.audio_format ?? null,
        render_version: row.render_version ?? null,
        prompt_bytes: row.prompt_bytes ?? null,
        answer_bytes: row.answer_bytes ?? null,
        cached: Boolean(row.cached),
        completed_at: new Date().toISOString(),
      };
      delete context.state.errors[id];
      console.log(`[ready] ${id}${row.cached ? " (cached)" : ""}`);
      await context.persist();
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      context.state.errors[id] = {
        attempts: attempt,
        error: message,
        updated_at: new Date().toISOString(),
      };
      await context.persist();
      if (attempt >= context.opts.retries) {
        console.error(`[error] ${id}: ${message}`);
        return;
      }
      const retryable = !error.status || error.status === 408 || error.status === 429 || error.status >= 500;
      if (!retryable) {
        console.error(`[error] ${id}: ${message}`);
        return;
      }
      const backoff = Math.min(30000, 1000 * (2 ** (attempt - 1))) + Math.floor(Math.random() * 500);
      console.warn(`[retry ${attempt}/${context.opts.retries}] ${id} in ${backoff}ms: ${message}`);
      await delay(backoff);
    }
  }
}

async function main() {
  const rawOpts = parseArgs(process.argv.slice(2));
  const opts = {
    ...rawOpts,
    input: resolve(rawOpts.input),
    scripts: resolve(rawOpts.scripts),
    prompts: resolve(rawOpts.prompts),
    state: resolve(rawOpts.state),
    verifyDir: rawOpts.verifyDir ? resolve(rawOpts.verifyDir) : null,
  };
  if (opts.verifyDir && !opts.sample && !opts.ids) throw new Error("--verify-dir requires --sample or --ids");
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const batchSecret = process.env.AUDIO_BATCH_SECRET;
  if (!url || !anonKey || !batchSecret) {
    throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY, and AUDIO_BATCH_SECRET are required");
  }
  if (batchSecret.length < 32) throw new Error("AUDIO_BATCH_SECRET must be at least 32 characters");

  const questions = JSON.parse(await readFile(opts.input, "utf8"));
  if (!Array.isArray(questions)) throw new Error("Question bank must be a JSON array");
  const [scripts, prompts] = await Promise.all([readScripts(opts.scripts), readPrompts(opts.prompts)]);
  const eligible = questions.filter((question) => scripts.has(questionId(question)) && prompts.has(questionId(question)));
  const byId = new Map(eligible.map((question) => [questionId(question), question]));
  const selected = opts.ids
    ? opts.ids.map((id) => {
        const question = byId.get(id);
        if (!question) throw new Error(`No source question and script found for --ids entry ${id}`);
        return question;
      })
    : opts.sample
      ? representativeSample(eligible, Math.min(opts.sample, eligible.length))
      : eligible;
  const state = await readState(opts.state);
  state.ready ??= {};
  state.errors ??= {};
  const pending = selected.filter(
    (question) => opts.force || state.ready[questionId(question)]?.render_version !== RENDER_VERSION,
  );

  let persistChain = Promise.resolve();
  const persist = () => {
    persistChain = persistChain.then(() => atomicJson(opts.state, {
      ...state,
      source: opts.input,
      scripts: opts.scripts,
      mode: opts.ids ? `ids:${opts.ids.join(",")}` : opts.sample ? `sample:${selected.length}` : "full",
      available_scripts: scripts.size,
      selected_questions: selected.length,
      ready_count: Object.keys(state.ready).length,
      error_count: Object.keys(state.errors).length,
      updated_at: new Date().toISOString(),
    }));
    return persistChain;
  };
  console.log(
    `Scripts ${scripts.size}; selected ${selected.length}; already ready ${selected.length - pending.length}; pending ${pending.length}`,
  );

  const context = { url, anonKey, batchSecret, opts, scripts, prompts, state, persist };
  let cursor = 0;
  const workers = Array.from({ length: Math.min(opts.concurrency, pending.length) }, async () => {
    while (cursor < pending.length) {
      const question = pending[cursor];
      cursor += 1;
      await renderOne(context, question);
    }
  });
  await Promise.all(workers);
  await persist();

  const selectedReady = selected.filter((question) => state.ready[questionId(question)]).length;
  const selectedErrors = selected.filter((question) => state.errors[questionId(question)]).length;
  console.log(`Finished: ${selectedReady}/${selected.length} ready; ${selectedErrors} currently errored.`);
  if (selectedErrors) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
