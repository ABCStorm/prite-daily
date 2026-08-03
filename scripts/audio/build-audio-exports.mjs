#!/usr/bin/env node

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";

const ROOT = process.cwd();
const QUESTIONS = resolve(ROOT, "extraction/output/questions_all.json");
const SCRIPTS = resolve(ROOT, "extraction/output/audio_scripts.jsonl");
const CLIPS = resolve(ROOT, "extraction/output/audio_clips_v4_open_ended");
// The 5,100-question build gets an isolated source archive.  Keeping it apart
// from the earlier 3,600-question files prevents goodFile() from accepting a
// structurally valid but incomplete program while the expanded release builds.
const EXPORTS = resolve(ROOT, "extraction/output/audio_exports/v4-source-5100");
const STATE_PATH = resolve(ROOT, "extraction/output/audio_exports.v4-source-5100.state.json");
const MANIFEST_PATH = resolve(ROOT, "extraction/output/audio_exports.v4-source-5100.manifest.json");
const THINKING_SECONDS = 4;
const DOWNLOAD_RATES = [1, 1.25, 1.5, 2];
const CURRENT_STORAGE_OBJECT_LIMIT = 50 * 1024 ** 2;
const MULTIPART_CHUNK_BYTES = 45 * 1024 ** 2;

function parseArgs(argv) {
  const options = { concurrency: 6, betweenSeconds: 1, downloadOnly: false, buildOnly: false, skipUpload: false, forceUpload: false, scope: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => { if (!argv[i + 1]) throw new Error(`${arg} requires a value`); return argv[++i]; };
    if (arg === "--concurrency") options.concurrency = Number(next());
    else if (arg === "--scope") options.scope = next();
    else if (arg === "--between") options.betweenSeconds = Number(next());
    else if (arg === "--download-only") options.downloadOnly = true;
    else if (arg === "--build-only") options.buildOnly = true;
    else if (arg === "--skip-upload") options.skipUpload = true;
    else if (arg === "--force-upload") options.forceUpload = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Build and upload single-file PRITE audio programs.

Environment: SUPABASE_URL, SUPABASE_ANON_KEY, AUDIO_BATCH_SECRET

Options:
  --concurrency N   Parallel clip downloads, 1-10 (default 6)
  --scope KEY       Build only "all" or one topic slug
  --between N       Silence between questions: 1 or 2 seconds (default 1)
  --download-only   Download/resume source clips, then stop
  --build-only      Skip source downloads
  --skip-upload     Build local MP3s and manifest without uploading
  --force-upload    Upload even when state says the same bytes are stored`);
      process.exit(0);
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 10) throw new Error("--concurrency must be 1-10");
  if (![1, 2].includes(options.betweenSeconds)) throw new Error("--between must be 1 or 2");
  return options;
}

const qid = (q) => `${q.year}-${q.q_index}`;
const slug = (value) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const quoteConcat = (path) => `'${path.replaceAll("'", "'\\''")}'`;

async function json(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
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

async function readScriptMap() {
  const result = new Map();
  for (const line of (await readFile(SCRIPTS, "utf8")).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);
    result.set(row.question_id, row.script);
  }
  return result;
}

async function goodFile(path) {
  try { return (await stat(path)).size > 500; } catch { return false; }
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
  if (!response.ok || body.error || !body.signed_urls?.prompt || !body.signed_urls?.answer) throw new Error(body.error || `Could not sign ${qid(question)} (${response.status})`);
  return { urls: body.signed_urls, storage: body.storage ?? "supabase" };
}

async function download(url, path, headers) {
  const response = await fetch(url, headers ? { headers } : undefined);
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status})`);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.part-${process.pid}`;
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
  await rename(temporary, path);
}

async function downloadQuestion(question, scripts, env) {
  const id = qid(question);
  const promptPath = resolve(CLIPS, `${id}-prompt.mp3`);
  const answerPath = resolve(CLIPS, `${id}-answer.mp3`);
  if (await goodFile(promptPath) && await goodFile(answerPath)) return false;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const access = await signedClips(question, scripts.get(id), env);
      const headers = access.storage === "r2" ? { "x-audio-batch-secret": env.batchSecret } : undefined;
      await Promise.all([
        goodFile(promptPath).then((ok) => ok || download(access.urls.prompt, promptPath, headers)),
        goodFile(answerPath).then((ok) => ok || download(access.urls.answer, answerPath, headers)),
      ]);
      return true;
    } catch (error) {
      if (attempt === 5) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 700 * 2 ** (attempt - 1)));
    }
  }
}

async function downloadAll(questions, scripts, env, concurrency) {
  await mkdir(CLIPS, { recursive: true });
  let cursor = 0; let finished = 0; let fetched = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= questions.length) return;
      if (await downloadQuestion(questions[index], scripts, env)) fetched += 1;
      finished += 1;
      if (finished % 25 === 0 || finished === questions.length) console.log(`[clips] ${finished}/${questions.length} checked; ${fetched} downloaded`);
    }
  });
  await Promise.all(workers);
}

async function ensureSilence(seconds) {
  const path = resolve(EXPORTS, `silence-${seconds}s.mp3`);
  if (!(await goodFile(path))) {
    await mkdir(EXPORTS, { recursive: true });
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", String(seconds), "-ar", "44100", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "64k", "-y", path]);
  }
  return path;
}

function exportDefinitions(questions) {
  const byTopic = new Map();
  for (const question of questions) {
    for (const topic of question.tags?.topics ?? []) {
      if (!byTopic.has(topic)) byTopic.set(topic, []);
      byTopic.get(topic).push(question);
    }
  }
  return [
    { scope_key: "all", topic: "All topics", questions },
    ...[...byTopic].sort(([a], [b]) => a.localeCompare(b)).map(([topic, topicQuestions]) => ({ scope_key: topic, topic, questions: topicQuestions })),
  ].map((entry) => ({ ...entry, slug: entry.scope_key === "all" ? "all-questions" : slug(entry.topic) }));
}

async function audioDuration(path) {
  return Math.round(Number(await capture("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path])));
}

async function buildExport(definition, thinking, between, betweenSeconds) {
  const gapToken = betweenSeconds === 1 ? "" : `-gap-${betweenSeconds}s`;
  const filename = `prite-daily-${definition.slug}${gapToken}.mp3`;
  const path = resolve(EXPORTS, filename);
  if (!(await goodFile(path))) {
    const listPath = resolve(EXPORTS, `${definition.slug}${gapToken}.concat.txt`);
    const lines = [];
    for (const question of definition.questions) {
      const id = qid(question);
      lines.push(`file ${quoteConcat(resolve(CLIPS, `${id}-prompt.mp3`))}`);
      lines.push(`file ${quoteConcat(thinking)}`);
      lines.push(`file ${quoteConcat(resolve(CLIPS, `${id}-answer.mp3`))}`);
      lines.push(`file ${quoteConcat(between)}`);
    }
    await writeFile(listPath, `${lines.join("\n")}\n`);
    const temporary = `${path}.part.mp3`;
    console.log(`[build] ${definition.topic}: ${definition.questions.length} questions`);
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-map_metadata", "-1", "-metadata", `title=PRITE Daily — ${definition.topic}`, "-write_xing", "1", "-y", temporary]);
    await rename(temporary, path);
  }
  const file = await stat(path);
  return { scope_key: definition.scope_key, topic: definition.topic, path: `exports/v2/${filename}`, filename, question_count: definition.questions.length, bytes: file.size, duration_seconds: await audioDuration(path), between_question_seconds: betweenSeconds, local_path: path };
}

async function buildRateVariant(base, rate) {
  if (rate === 1) return { playback_rate: 1, between_question_seconds: base.between_question_seconds, path: base.path, filename: base.filename, bytes: base.bytes, duration_seconds: base.duration_seconds, local_path: base.local_path };
  const stem = base.filename.replace(/\.mp3$/i, "");
  // The signing function intentionally permits a narrow storage-path alphabet.
  // Keep the decimal rate in manifest metadata/UI, but use 1-25x on disk.
  const rateToken = String(rate).replace(".", "-");
  const filename = `${stem}-${rateToken}x.mp3`;
  const path = resolve(EXPORTS, filename);
  if (!(await goodFile(path))) {
    const temporary = `${path}.part.mp3`;
    console.log(`[speed] ${base.topic}: ${rate}x`);
    await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-i", base.local_path,
      "-filter:a", `atempo=${rate}`, "-ar", "44100", "-ac", "1",
      "-c:a", "libmp3lame", "-b:a", "64k", "-map_metadata", "-1",
      "-metadata", `title=PRITE Daily — ${base.topic} (${rate}x)`, "-y", temporary,
    ]);
    await rename(temporary, path);
  }
  const file = await stat(path);
  return { playback_rate: rate, between_question_seconds: base.between_question_seconds, path: `exports/v2/${filename}`, filename, bytes: file.size, duration_seconds: await audioDuration(path), local_path: path };
}

async function buildMultipartVariant(variant) {
  const stem = variant.filename.replace(/\.mp3$/i, "");
  const total = Math.ceil(variant.bytes / MULTIPART_CHUNK_BYTES);
  const parts = [];
  for (let index = 0; index < total; index += 1) {
    const start = index * MULTIPART_CHUNK_BYTES;
    const bytes = Math.min(MULTIPART_CHUNK_BYTES, variant.bytes - start);
    const filename = `${stem}-chunk-${String(index + 1).padStart(2, "0")}.mp3`;
    const localPath = resolve(EXPORTS, filename);
    let existingBytes = 0;
    try { existingBytes = (await stat(localPath)).size; } catch { /* Build below. */ }
    if (existingBytes !== bytes) {
      const temporary = `${localPath}.part-${process.pid}`;
      console.log(`[chunk] ${variant.filename}: ${index + 1}/${total}`);
      await pipeline(
        createReadStream(variant.local_path, { start, end: start + bytes - 1 }),
        createWriteStream(temporary),
      );
      await rename(temporary, localPath);
    }
    parts.push({
      path: `exports/v2/${filename}`,
      filename,
      bytes,
      local_path: localPath,
    });
  }
  return { ...variant, parts };
}

async function uploadToken(path, env) {
  const response = await fetch(`${env.url}/functions/v1/generate-audio-drill`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.anonKey}`, apikey: env.anonKey,
      "content-type": "application/json", "x-audio-batch-secret": env.batchSecret,
    },
    body: JSON.stringify({ action: "create_export_upload", path }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.token) throw new Error(body.error || `Could not create upload token (${response.status})`);
  return body.token;
}

async function signedStreamUpload(entry, env) {
  // R2 is the primary target. The Supabase signed-upload path remains as a
  // fallback for installations that have not configured R2 yet.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const token = env.r2AdminUrl ? null : await uploadToken(entry.path, env);
      const encoded = entry.path.split("/").map(encodeURIComponent).join("/");
      const url = env.r2AdminUrl
        ? `${env.r2AdminUrl}/${encoded}`
        : `${env.url}/storage/v1/object/upload/sign/audio-drills/${entry.path}?token=${encodeURIComponent(token)}`;
      console.log(`[upload] ${entry.filename}: ${(entry.bytes / 1024 ** 2).toFixed(1)} MB`);
      await new Promise((resolveUpload, rejectUpload) => {
        // Native curl is more dependable than Node/undici for long request
        // bodies on connections that occasionally close after accepting a PUT.
        const authHeaders = env.r2AdminUrl
          ? ["--header", `x-audio-batch-secret: ${env.batchSecret}`]
          : ["--header", `Authorization: Bearer ${env.anonKey}`, "--header", `apikey: ${env.anonKey}`, "--header", "x-upsert: true"];
        const child = spawn("curl", [
          "--http1.1", "--fail-with-body", "--silent", "--show-error", "--retry", "2", "--retry-all-errors", "--retry-delay", "2",
          "--connect-timeout", "20", "--speed-limit", "1024", "--speed-time", "120", "--max-time", "1200",
          "--request", "PUT", "--upload-file", entry.local_path,
          ...authHeaders,
          "--header", "content-type: audio/mpeg",
          "--header", `content-length: ${entry.bytes}`,
          "--header", "cache-control: max-age=3600",
          "--header", "Expect:", url,
        ], { stdio: ["ignore", "pipe", "pipe"] });
        let output = "";
        const heartbeat = setInterval(() => console.log(`[upload] ${entry.filename}: still transferring`), 60_000);
        child.stdout.on("data", (chunk) => { output += chunk; });
        child.stderr.on("data", (chunk) => { output += chunk; });
        child.on("error", (error) => { clearInterval(heartbeat); rejectUpload(error); });
        child.on("exit", (code) => {
          clearInterval(heartbeat);
          if (code === 0) resolveUpload(); else rejectUpload(new Error(output.trim() || `curl exited ${code}`));
        });
      });
      console.log(`[upload] ${entry.filename}: complete`);
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      console.warn(`[upload] retry ${attempt}/3 for ${entry.filename}: ${error.message}`);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_500 * attempt));
    }
  }
}

async function publishManifest(entries) {
  const existing = await json(MANIFEST_PATH, { exports: [] });
  const previousEntries = Array.isArray(existing.exports)
    ? existing.exports.filter((entry) => entry.path?.startsWith("exports/v2/"))
    : [];
  const merged = new Map(previousEntries.map((entry) => [entry.scope_key, entry]));
  for (const entry of entries) {
    const previous = merged.get(entry.scope_key);
    if (!previous) {
      merged.set(entry.scope_key, entry);
      continue;
    }
    const previousVariants = previous.variants?.length
      ? previous.variants
      : [{ playback_rate: 1, path: previous.path, filename: previous.filename, bytes: previous.bytes, duration_seconds: previous.duration_seconds }];
    const variants = new Map();
    for (const variant of [...previousVariants, ...(entry.variants ?? [])]) {
      const normalized = { ...variant, between_question_seconds: variant.between_question_seconds ?? previous.between_question_seconds ?? 1 };
      variants.set(`${normalized.between_question_seconds}:${normalized.playback_rate}`, normalized);
    }
    const combined = [...variants.values()].sort((a, b) => a.between_question_seconds - b.between_question_seconds || a.playback_rate - b.playback_rate);
    const fallback = combined.find((variant) => variant.between_question_seconds === 1 && variant.playback_rate === 1) ?? combined[0];
    merged.set(entry.scope_key, {
      scope_key: entry.scope_key,
      topic: entry.topic,
      question_count: entry.question_count,
      path: fallback.path,
      filename: fallback.filename,
      bytes: fallback.bytes,
      duration_seconds: fallback.duration_seconds,
      between_question_seconds: fallback.between_question_seconds,
      variants: combined,
    });
  }
  const exports = [...merged.values()].sort((a, b) => a.topic.localeCompare(b.topic));
  const betweenQuestionOptions = [...new Set(exports.flatMap((entry) => (entry.variants ?? []).map((variant) => variant.between_question_seconds ?? entry.between_question_seconds ?? 1)))].sort();
  await atomicJson(MANIFEST_PATH, { version: "v3-open-ended-pause-options", generated_at: new Date().toISOString(), thinking_pause_seconds: THINKING_SECONDS, between_question_seconds: 1, between_question_options: betweenQuestionOptions, exports });
  return merged.size;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const env = {
    url: process.env.SUPABASE_URL?.replace(/\/$/, ""),
    anonKey: process.env.SUPABASE_ANON_KEY,
    batchSecret: process.env.AUDIO_BATCH_SECRET,
    r2AdminUrl: (process.env.R2_AUDIO_ADMIN_URL || "https://pritedaily.com/api/audio-admin").replace(/\/$/, ""),
  };
  if (!env.url || !env.anonKey || !env.batchSecret) throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY, and AUDIO_BATCH_SECRET are required");
  const [questions, scripts] = await Promise.all([json(QUESTIONS, []), readScriptMap()]);
  console.log(`[source] ${questions.length} questions; ${scripts.size} teaching points`);
  let definitions = exportDefinitions(questions);
  if (options.scope) definitions = definitions.filter((definition) => definition.scope_key === options.scope || definition.slug === options.scope);
  if (!definitions.length) throw new Error(`No export matches --scope ${options.scope}`);
  const neededQuestions = options.scope
    ? [...new Map(definitions.flatMap((definition) => definition.questions).map((question) => [qid(question), question])).values()]
    : questions;
  if (!options.buildOnly) await downloadAll(neededQuestions, scripts, env, options.concurrency);
  if (options.downloadOnly) return;
  const [thinking, between] = await Promise.all([ensureSilence(THINKING_SECONDS), ensureSilence(options.betweenSeconds)]);
  const state = await json(STATE_PATH, { uploaded: {} });
  const entries = [];
  for (const definition of definitions.sort((a, b) => a.questions.length - b.questions.length)) {
    const base = await buildExport(definition, thinking, between, options.betweenSeconds);
    const variants = [];
    const publicEntry = () => {
      const { local_path: _localPath, ...fallback } = base;
      return {
        ...fallback,
        variants: variants.map(({ local_path: _variantLocalPath, parts, ...variant }) => ({
          ...variant,
          ...(parts ? { parts: parts.map(({ local_path: _partLocalPath, ...part }) => part) } : {}),
        })),
      };
    };
    for (const rate of DOWNLOAD_RATES) {
      let variant = await buildRateVariant(base, rate);
      const gapStateKey = options.betweenSeconds === 1 ? base.scope_key : `${base.scope_key}@gap-${options.betweenSeconds}`;
      const stateKey = rate === 1 ? gapStateKey : `${gapStateKey}@${rate}`;
      const already = state.uploaded[stateKey];
      let available = options.skipUpload || already?.bytes === variant.bytes;
      if (!options.skipUpload && (options.forceUpload || already?.bytes !== variant.bytes)) {
        if (variant.bytes > CURRENT_STORAGE_OBJECT_LIMIT) {
          if (base.scope_key === "all" && rate === 2) {
            variant = await buildMultipartVariant(variant);
            let allPartsAvailable = true;
            for (let index = 0; index < variant.parts.length; index += 1) {
              const part = variant.parts[index];
              const partStateKey = `${stateKey}:chunk-${index + 1}`;
              const uploadedPart = state.uploaded[partStateKey];
              if (!options.forceUpload && uploadedPart?.bytes === part.bytes) continue;
              try {
                await signedStreamUpload(part, env);
                state.uploaded[partStateKey] = { bytes: part.bytes, path: part.path, uploaded_at: new Date().toISOString() };
                await atomicJson(STATE_PATH, state);
              } catch (error) {
                allPartsAvailable = false;
                console.warn(`[skip] ${part.filename}: ${error.message}`);
                break;
              }
            }
            if (allPartsAvailable) available = true;
            if (!available) continue;
          } else {
            console.warn(`[skip] ${variant.filename}: ${(variant.bytes / 1024 ** 2).toFixed(1)} MB exceeds the current 50 MB storage-object limit`);
            continue;
          }
        } else try {
          await signedStreamUpload(variant, env);
          state.uploaded[stateKey] = { bytes: variant.bytes, path: variant.path, uploaded_at: new Date().toISOString() };
          await atomicJson(STATE_PATH, state);
          available = true;
        } catch (error) {
          // Supabase's current 50 MB object cap rejects some long programs.
          // Keep processing: a retimed variant may fit, and every other topic
          // should still become available even when one object cannot upload.
          console.warn(`[skip] ${variant.filename}: ${error.message}`);
        }
      }
      if (!available) continue;
      variants.push(variant);
      const index = entries.findIndex((entry) => entry.scope_key === base.scope_key);
      if (index === -1) entries.push(publicEntry()); else entries[index] = publicEntry();
      // Publish after every fixed-speed file. A later failed upload never hides
      // the rates that are already available for this topic.
      await publishManifest(entries);
    }
  }
  const manifestSize = await publishManifest(entries);
  console.log(`[done] ${entries.length} exports built; manifest has ${manifestSize}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
