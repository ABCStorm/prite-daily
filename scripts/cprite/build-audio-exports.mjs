#!/usr/bin/env node
// Build a Child-bank car file: all 200 CPRITE items, 1x and 1.5x, 1-sec gaps.
// Scope key is "cprite:all" so it never collides with the 5,100-question PRITE "all".
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";

const ROOT = process.cwd();
const QUESTIONS = resolve(ROOT, "public/data/cprite_questions.json");
const SCRIPTS = resolve(ROOT, "extraction/output/cprite_audio_scripts.jsonl");
const CLIPS = resolve(ROOT, "extraction/output/audio_clips_cprite");
const EXPORTS = resolve(ROOT, "extraction/output/audio_exports/v7-cprite-2024");
const PUBLIC_MANIFEST = resolve(ROOT, "public/data/audio_exports.json");
const PREFIX = "exports/v7-cprite-2024";
const THINKING = 4;
const BETWEEN = 1;
const RATES = [1, 1.5];

const qid = (q) => `${q.year}-${q.q_index}`;
const quote = (path) => `'${path.replaceAll("'", "'\\''")}'`;

async function json(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

async function goodFile(path) {
  try { return (await stat(path)).size > 500; } catch { return false; }
}

async function run(command, args) {
  await new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"] });
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

async function readScripts() {
  const result = new Map();
  for (const line of (await readFile(SCRIPTS, "utf8")).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    result.set(row.question_id, row.script);
  }
  return result;
}

async function download(url, path, headers) {
  const response = await fetch(url, headers ? { headers } : undefined);
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status})`);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.part-${process.pid}`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
  await rename(temporary, path);
}

async function signedClips(question, script, env) {
  const response = await fetch(`${env.url}/functions/v1/generate-audio-drill`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.anonKey}`, apikey: env.anonKey,
      "content-type": "application/json", "x-audio-batch-secret": env.batchSecret,
    },
    body: JSON.stringify({ question_id: qid(question), ...question, script, include_signed_urls: true }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error || !body.signed_urls?.prompt || !body.signed_urls?.answer) {
    throw new Error(body.error || `Could not sign ${qid(question)} (${response.status})`);
  }
  return body.signed_urls;
}

async function downloadAll(questions, scripts, env) {
  await mkdir(CLIPS, { recursive: true });
  let fetched = 0;
  for (let i = 0; i < questions.length; i += 1) {
    const question = questions[i];
    const id = qid(question);
    const promptPath = resolve(CLIPS, `${id}-prompt.mp3`);
    const answerPath = resolve(CLIPS, `${id}-answer.mp3`);
    if (await goodFile(promptPath) && await goodFile(answerPath)) {
      if ((i + 1) % 25 === 0 || i + 1 === questions.length) console.log(`[clips] ${i + 1}/${questions.length} checked; ${fetched} downloaded`);
      continue;
    }
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        const urls = await signedClips(question, scripts.get(id), env);
        const headers = { "x-audio-batch-secret": env.batchSecret };
        await Promise.all([
          goodFile(promptPath).then((ok) => ok || download(urls.prompt, promptPath, headers)),
          goodFile(answerPath).then((ok) => ok || download(urls.answer, answerPath, headers)),
        ]);
        fetched += 1;
        break;
      } catch (error) {
        if (attempt === 5) throw error;
        await new Promise((r) => setTimeout(r, 700 * 2 ** (attempt - 1)));
      }
    }
    if ((i + 1) % 25 === 0 || i + 1 === questions.length) console.log(`[clips] ${i + 1}/${questions.length} checked; ${fetched} downloaded`);
  }
}

async function silence(seconds) {
  const path = resolve(EXPORTS, `silence-${seconds}s.mp3`);
  if (!(await goodFile(path))) {
    await mkdir(EXPORTS, { recursive: true });
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", String(seconds), "-ar", "44100", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "64k", "-y", path]);
  }
  return path;
}

async function duration(path) {
  return Math.round(Number(await capture("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path])));
}

async function buildBase(questions, thinking, between) {
  const filename = "prite-daily-cprite-all.mp3";
  const path = resolve(EXPORTS, filename);
  if (!(await goodFile(path))) {
    await mkdir(EXPORTS, { recursive: true });
    const listPath = resolve(EXPORTS, "cprite-all.concat.txt");
    const lines = [];
    for (const question of questions) {
      const id = qid(question);
      lines.push(`file ${quote(resolve(CLIPS, `${id}-prompt.mp3`))}`);
      lines.push(`file ${quote(thinking)}`);
      lines.push(`file ${quote(resolve(CLIPS, `${id}-answer.mp3`))}`);
      lines.push(`file ${quote(between)}`);
    }
    await writeFile(listPath, `${lines.join("\n")}\n`);
    const temporary = `${path}.part.mp3`;
    console.log(`[build] Child library: ${questions.length} questions`);
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-map_metadata", "-1", "-metadata", "title=PRITE Daily — Child CPRITE 2024", "-write_xing", "1", "-y", temporary]);
    await rename(temporary, path);
  }
  const file = await stat(path);
  return { filename, local_path: path, bytes: file.size, duration_seconds: await duration(path) };
}

async function buildRate(base, rate) {
  if (rate === 1) {
    return { playback_rate: 1, between_question_seconds: BETWEEN, path: `${PREFIX}/${base.filename}`, filename: base.filename, bytes: base.bytes, duration_seconds: base.duration_seconds, local_path: base.local_path };
  }
  const filename = `prite-daily-cprite-all-${String(rate).replace(".", "-")}x.mp3`;
  const path = resolve(EXPORTS, filename);
  if (!(await goodFile(path))) {
    const temporary = `${path}.part.mp3`;
    console.log(`[speed] Child library: ${rate}x`);
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", base.local_path, "-filter:a", `atempo=${rate}`, "-ar", "44100", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "64k", "-map_metadata", "-1", "-metadata", `title=PRITE Daily — Child CPRITE 2024 (${rate}x)`, "-y", temporary]);
    await rename(temporary, path);
  }
  const file = await stat(path);
  return { playback_rate: rate, between_question_seconds: BETWEEN, path: `${PREFIX}/${filename}`, filename, bytes: file.size, duration_seconds: await duration(path), local_path: path };
}

async function upload(entry, env) {
  const encoded = entry.path.split("/").map(encodeURIComponent).join("/");
  const url = `${env.r2AdminUrl}/${encoded}`;
  console.log(`[upload] ${entry.filename}: ${(entry.bytes / 1024 ** 2).toFixed(1)} MB`);
  await new Promise((resolveUpload, rejectUpload) => {
    const child = spawn("curl", [
      "--http1.1", "--fail-with-body", "--silent", "--show-error", "--retry", "2", "--retry-all-errors", "--retry-delay", "2",
      "--connect-timeout", "20", "--max-time", "1200",
      "--request", "PUT", "--upload-file", entry.local_path,
      "--header", `x-audio-batch-secret: ${env.batchSecret}`,
      "--header", "content-type: audio/mpeg",
      "--header", `content-length: ${entry.bytes}`,
      "--header", "cache-control: max-age=3600",
      "--header", "Expect:", url,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", rejectUpload);
    child.on("exit", (code) => { if (code === 0) resolveUpload(); else rejectUpload(new Error(output.trim() || `curl exited ${code}`)); });
  });
  console.log(`[upload] ${entry.filename}: complete`);
}

async function mergeManifest(entry) {
  const manifest = await json(PUBLIC_MANIFEST, { exports: [] });
  const exports = Array.isArray(manifest.exports) ? [...manifest.exports] : [];
  const index = exports.findIndex((row) => row.scope_key === entry.scope_key);
  if (index === -1) exports.push(entry); else exports[index] = entry;
  manifest.exports = exports;
  manifest.generated_at = new Date().toISOString();
  await writeFile(PUBLIC_MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  const env = {
    url: process.env.SUPABASE_URL?.replace(/\/$/, ""),
    anonKey: process.env.SUPABASE_ANON_KEY,
    batchSecret: process.env.AUDIO_BATCH_SECRET,
    r2AdminUrl: (process.env.R2_AUDIO_ADMIN_URL || "https://pritedaily.com/api/audio-admin").replace(/\/$/, ""),
  };
  if (!env.url || !env.anonKey || !env.batchSecret) throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY, and AUDIO_BATCH_SECRET are required");
  const questions = await json(QUESTIONS, []);
  const scripts = await readScripts();
  if (questions.length !== 200) throw new Error(`Expected 200 CPRITE questions, got ${questions.length}`);
  console.log(`[source] ${questions.length} child questions`);
  await downloadAll(questions, scripts, env);
  const [thinking, between] = await Promise.all([silence(THINKING), silence(BETWEEN)]);
  const base = await buildBase(questions, thinking, between);
  const variants = [];
  for (const rate of RATES) {
    const variant = await buildRate(base, rate);
    await upload(variant, env);
    const { local_path: _local, ...publicVariant } = variant;
    variants.push(publicVariant);
  }
  const fallback = variants.find((v) => v.playback_rate === 1) ?? variants[0];
  const entry = {
    scope_key: "cprite:all",
    topic: "Child · CPRITE 2024",
    question_count: questions.length,
    path: fallback.path,
    filename: fallback.filename,
    bytes: fallback.bytes,
    duration_seconds: fallback.duration_seconds,
    between_question_seconds: BETWEEN,
    variants,
  };
  await mergeManifest(entry);
  console.log(`[done] ${entry.filename} · ${entry.question_count} questions · ${(entry.bytes / 1024 ** 2).toFixed(1)} MB · ${Math.round(entry.duration_seconds / 60)} min`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
