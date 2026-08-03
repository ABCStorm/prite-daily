#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const QUESTIONS = resolve(ROOT, "extraction/output/questions_all.json");
const SOURCE = resolve(ROOT, "extraction/output/audio_exports/v4-source-5100");
const OUTPUT = resolve(ROOT, "extraction/output/audio_exports/v4-16k-5100");
const STATE_PATH = resolve(ROOT, "extraction/output/audio_exports.v4-16k-5100.state.json");
const MANIFEST_PATH = resolve(ROOT, "extraction/output/audio_exports.v4-16k-5100.manifest.json");
const R2_PREFIX = "exports/v4-16k-5100";
// Large downloadable programs use a speech-optimized bitrate so the expanded
// 5,100-question archive and the 64 kbps interactive clips remain inside the
// project's 10 GB R2 storage target.
const BITRATE_KBPS = 16;
const SAMPLE_RATE = 22050;
const THINKING_SECONDS = 4;
const DOWNLOAD_PART_BYTES = 40 * 1024 ** 2;
const RATES = [1, 1.25, 1.5, 2];
const GAPS = [1, 2];

function parseArgs(argv) {
  const options = { concurrency: 4 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => { if (!argv[index + 1]) throw new Error(`${arg} requires a value`); return argv[++index]; };
    if (arg === "--concurrency") options.concurrency = Number(next());
    else if (arg === "--help" || arg === "-h") {
      console.log(`Prepare the complete 16 kbps PRITE R2 export archive.\n\nOptions:\n  --concurrency N   Parallel ffmpeg jobs, 1-8 (default 4)`);
      process.exit(0);
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 8) throw new Error("--concurrency must be 1-8");
  return options;
}

const slug = (value) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const rateToken = (rate) => rate === 1 ? "" : `-${String(rate).replace(".", "-")}x`;
const gapToken = (gap) => gap === 1 ? "" : `-gap-${gap}s`;

async function json(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

let writeNumber = 0;
async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${writeNumber++}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

function definitions(questions) {
  const byTopic = new Map();
  for (const question of questions) {
    for (const topic of question.tags?.topics ?? []) {
      if (!byTopic.has(topic)) byTopic.set(topic, []);
      byTopic.get(topic).push(question);
    }
  }
  return [
    { scope_key: "all", topic: "All topics", question_count: questions.length, slug: "all-questions" },
    ...[...byTopic].sort(([a], [b]) => a.localeCompare(b)).map(([topic, rows]) => ({ scope_key: topic, topic, question_count: rows.length, slug: slug(topic) })),
  ];
}

function itemsFor(defs) {
  return defs.flatMap((definition) => GAPS.flatMap((gap) => RATES.map((rate) => {
    const filename = `prite-daily-${definition.slug}${gapToken(gap)}${rateToken(rate)}.mp3`;
    return {
      ...definition,
      gap,
      rate,
      filename,
      sourcePath: resolve(SOURCE, filename),
      outputPath: resolve(OUTPUT, filename),
      key: `${R2_PREFIX}/${filename}`,
    };
  })));
}

async function run(command, args) {
  await new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "inherit"] });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolveRun() : reject(new Error(`${command} exited ${code}`)));
  });
}

async function capture(command, args) {
  return await new Promise((resolveCapture, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "inherit"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolveCapture(output.trim()) : reject(new Error(`${command} exited ${code}`)));
  });
}

async function probe(path) {
  const output = await capture("ffprobe", [
    "-v", "error", "-select_streams", "a:0",
    "-show_entries", "stream=codec_name,bit_rate,channels,sample_rate:format=duration",
    "-of", "json", path,
  ]);
  const parsed = JSON.parse(output);
  const stream = parsed.streams?.[0] ?? {};
  return {
    codec: stream.codec_name,
    bitRate: Number(stream.bit_rate),
    channels: Number(stream.channels),
    sampleRate: Number(stream.sample_rate),
    duration: Number(parsed.format?.duration),
  };
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function prepare(item, state) {
  const source = await stat(item.sourcePath);
  const cached = state.ready[item.filename];
  if (cached?.source_bytes === source.size) {
    const output = await stat(item.outputPath).catch(() => null);
    if (output?.size === cached.bytes && cached.sha256) return cached;
  }
  await mkdir(OUTPUT, { recursive: true });
  const temporary = `${item.outputPath}.part-${process.pid}`;
  await run("ffmpeg", [
    "-nostdin", "-hide_banner", "-loglevel", "error", "-i", item.sourcePath,
    "-ar", String(SAMPLE_RATE), "-ac", "1", "-c:a", "libmp3lame", "-b:a", `${BITRATE_KBPS}k`,
    "-map_metadata", "-1", "-write_xing", "1", "-f", "mp3", "-y", temporary,
  ]);
  await rename(temporary, item.outputPath);
  const [output, sourceProbe, outputProbe, digest] = await Promise.all([
    stat(item.outputPath), probe(item.sourcePath), probe(item.outputPath), sha256(item.outputPath),
  ]);
  if (output.size < 500 || outputProbe.codec !== "mp3" || outputProbe.channels !== 1 || outputProbe.sampleRate !== SAMPLE_RATE) throw new Error(`Invalid output: ${item.filename}`);
  if (Math.abs(outputProbe.bitRate - BITRATE_KBPS * 1000) > 1500) throw new Error(`Unexpected bitrate for ${item.filename}: ${outputProbe.bitRate}`);
  if (Math.abs(outputProbe.duration - sourceProbe.duration) > 1.1) throw new Error(`Duration drift for ${item.filename}`);
  return {
    source_bytes: source.size,
    bytes: output.size,
    sha256: digest,
    duration_seconds: Math.round(outputProbe.duration),
    completed_at: new Date().toISOString(),
  };
}

function rangeParts(item, row) {
  if (row.bytes <= DOWNLOAD_PART_BYTES) return undefined;
  const parts = [];
  for (let offset = 0, index = 1; offset < row.bytes; offset += DOWNLOAD_PART_BYTES, index += 1) {
    parts.push({
      path: `${item.key}.part-${String(index).padStart(2, "0")}`,
      filename: `${item.filename}.part-${String(index).padStart(2, "0")}`,
      bytes: Math.min(DOWNLOAD_PART_BYTES, row.bytes - offset),
    });
  }
  return parts;
}

function buildManifest(defs, items, state) {
  const exports = defs.map((definition) => {
    const variants = items.filter((item) => item.scope_key === definition.scope_key).map((item) => {
      const row = state.ready[item.filename];
      const parts = rangeParts(item, row);
      return {
        playback_rate: item.rate,
        between_question_seconds: item.gap,
        path: item.key,
        filename: item.filename,
        bytes: row.bytes,
        duration_seconds: row.duration_seconds,
        sha256: row.sha256,
        ...(parts ? { parts } : {}),
      };
    }).sort((a, b) => a.between_question_seconds - b.between_question_seconds || a.playback_rate - b.playback_rate);
    const fallback = variants.find((variant) => variant.between_question_seconds === 1 && variant.playback_rate === 1) ?? variants[0];
    return { ...definition, path: fallback.path, filename: fallback.filename, bytes: fallback.bytes, duration_seconds: fallback.duration_seconds, between_question_seconds: fallback.between_question_seconds, variants };
  }).sort((a, b) => a.topic.localeCompare(b.topic));
  return {
    version: "v5-r2-16k-5100-complete",
    generated_at: new Date().toISOString(),
    audio_bitrate_kbps: BITRATE_KBPS,
    audio_sample_rate_hz: SAMPLE_RATE,
    thinking_pause_seconds: THINKING_SECONDS,
    between_question_seconds: 1,
    between_question_options: GAPS,
    exports,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const questions = await json(QUESTIONS, []);
  const defs = definitions(questions);
  const items = itemsFor(defs);
  if (questions.length !== 5100 || defs.length !== 33 || items.length !== 264) throw new Error(`Unexpected inventory: ${questions.length} questions, ${defs.length} scopes, ${items.length} variants`);
  const state = await json(STATE_PATH, { version: 1, bitrate_kbps: BITRATE_KBPS, ready: {} });
  let cursor = 0;
  let finished = 0;
  let writeQueue = Promise.resolve();
  const workers = Array.from({ length: options.concurrency }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index];
      const row = await prepare(item, state);
      state.ready[item.filename] = row;
      finished += 1;
      writeQueue = writeQueue.then(() => atomicJson(STATE_PATH, state));
      await writeQueue;
      if (finished % 5 === 0 || finished === items.length) {
        const bytes = Object.values(state.ready).reduce((sum, entry) => sum + entry.bytes, 0);
        console.log(`[encode] ${finished}/${items.length}; ${(bytes / 1024 ** 3).toFixed(2)} GiB ready`);
      }
    }
  });
  await Promise.all(workers);
  await writeQueue;
  const manifest = buildManifest(defs, items, state);
  const bytes = Object.values(state.ready).reduce((sum, entry) => sum + entry.bytes, 0);
  state.completed_at = new Date().toISOString();
  state.bytes = bytes;
  await Promise.all([atomicJson(STATE_PATH, state), atomicJson(MANIFEST_PATH, manifest)]);
  console.log(`[done] ${items.length} variants; ${(bytes / 1024 ** 3).toFixed(3)} GiB; staged manifest ${MANIFEST_PATH}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
