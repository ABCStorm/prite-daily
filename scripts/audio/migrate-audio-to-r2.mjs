#!/usr/bin/env node

import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

const ROOT = process.cwd();
const MANIFEST_PATH = resolve(ROOT, "public/data/audio_exports.json");
const RENDER_STATE_PATH = resolve(ROOT, "extraction/output/audio_render.state.json");
const EXPORTS = resolve(ROOT, "extraction/output/audio_exports/v2");
const CLIPS = resolve(ROOT, "extraction/output/audio_clips_v4_open_ended");
const STATE_PATH = resolve(ROOT, "extraction/output/audio_r2_migration.state.json");

function parseArgs(argv) {
  const options = { baseUrl: "https://pritedaily.com", kind: "all", clipConcurrency: 16, exportConcurrency: 4 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => { if (!argv[index + 1]) throw new Error(`${arg} requires a value`); return argv[++index]; };
    if (arg === "--base-url") options.baseUrl = next().replace(/\/$/, "");
    else if (arg === "--kind") options.kind = next();
    else if (arg === "--clip-concurrency") options.clipConcurrency = Number(next());
    else if (arg === "--export-concurrency") options.exportConcurrency = Number(next());
    else if (arg === "--help" || arg === "-h") {
      console.log(`Migrate the canonical PRITE audio cache to the private R2 bucket.

Environment: AUDIO_BATCH_SECRET

Options:
  --base-url URL          Deployed Pages origin (default https://pritedaily.com)
  --kind all|exports|clips
  --clip-concurrency N    Parallel small-file uploads (default 16)
  --export-concurrency N  Parallel program/chunk uploads (default 4)`);
      process.exit(0);
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (!["all", "exports", "clips"].includes(options.kind)) throw new Error("--kind must be all, exports, or clips");
  if (!Number.isInteger(options.clipConcurrency) || options.clipConcurrency < 1 || options.clipConcurrency > 32) throw new Error("--clip-concurrency must be 1-32");
  if (!Number.isInteger(options.exportConcurrency) || options.exportConcurrency < 1 || options.exportConcurrency > 8) throw new Error("--export-concurrency must be 1-8");
  return options;
}

async function json(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

let writeNumber = 0;
async function atomicJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${writeNumber++}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

function objectUrl(baseUrl, key) {
  return `${baseUrl}/api/audio-admin/${key.split("/").map(encodeURIComponent).join("/")}`;
}

async function exportItems() {
  const manifest = await json(MANIFEST_PATH, { exports: [] });
  const objects = new Map();
  for (const entry of manifest.exports ?? []) {
    for (const variant of entry.variants ?? []) {
      const storedObjects = variant.parts?.length ? variant.parts : [variant];
      for (const object of storedObjects) {
        objects.set(object.path, { kind: "export", key: object.path, localPath: resolve(EXPORTS, basename(object.path)), expectedBytes: object.bytes });
      }
    }
  }
  return [...objects.values()];
}

async function clipItems() {
  const renderState = await json(RENDER_STATE_PATH, { ready: {} });
  const objects = [];
  for (const [id, row] of Object.entries(renderState.ready ?? {})) {
    if (!row.prompt_audio_path || !row.answer_audio_path) throw new Error(`Missing stored paths for ${id}`);
    objects.push({ kind: "clip", key: row.prompt_audio_path, localPath: resolve(CLIPS, `${id}-prompt.mp3`), expectedBytes: row.prompt_bytes ?? null });
    objects.push({ kind: "clip", key: row.answer_audio_path, localPath: resolve(CLIPS, `${id}-answer.mp3`), expectedBytes: row.answer_bytes ?? null });
  }
  return objects;
}

async function validateItems(items) {
  let bytes = 0;
  for (const item of items) {
    const file = await stat(item.localPath);
    if (file.size < 500) throw new Error(`Missing or invalid local audio: ${item.localPath}`);
    if (item.expectedBytes && file.size !== item.expectedBytes) throw new Error(`Byte mismatch for ${item.key}: ${file.size} != ${item.expectedBytes}`);
    item.bytes = file.size;
    bytes += file.size;
  }
  return bytes;
}

async function upload(item, options, secret) {
  const data = await readFile(item.localPath);
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(objectUrl(options.baseUrl, item.key), {
        method: "PUT",
        headers: {
          "x-audio-batch-secret": secret,
          "content-type": "audio/mpeg",
          "content-length": String(data.byteLength),
        },
        body: data,
      });
      const body = await response.json().catch(async () => ({ error: await response.text().catch(() => "") }));
      if (!response.ok || body.bytes !== data.byteLength) throw new Error(body.error || `HTTP ${response.status}`);
      return body;
    } catch (error) {
      if (attempt === 5) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 750 * 2 ** (attempt - 1)));
    }
  }
}

async function uploadGroup(label, items, concurrency, context) {
  const pending = items.filter((item) => context.state.uploaded[item.key]?.bytes !== item.bytes);
  console.log(`[${label}] ${items.length} objects; ${pending.length} pending; ${(items.reduce((sum, item) => sum + item.bytes, 0) / 1024 ** 3).toFixed(2)} GiB`);
  let cursor = 0;
  let finished = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(pending.length, 1)) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= pending.length) return;
      const item = pending[index];
      const result = await upload(item, context.options, context.secret);
      context.state.uploaded[item.key] = { bytes: item.bytes, etag: result.etag, uploaded_at: new Date().toISOString() };
      finished += 1;
      if (finished % 25 === 0 || finished === pending.length) {
        await atomicJson(STATE_PATH, context.state);
        console.log(`[${label}] ${finished}/${pending.length} uploaded`);
      }
    }
  });
  await Promise.all(workers);
  await atomicJson(STATE_PATH, context.state);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const secret = process.env.AUDIO_BATCH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUDIO_BATCH_SECRET is required");
  const state = await json(STATE_PATH, { version: 1, uploaded: {} });
  const [exports, clips] = await Promise.all([
    options.kind === "clips" ? [] : exportItems(),
    options.kind === "exports" ? [] : clipItems(),
  ]);
  const [exportBytes, clipBytes] = await Promise.all([validateItems(exports), validateItems(clips)]);
  console.log(`[source] ${exports.length} export objects (${(exportBytes / 1024 ** 3).toFixed(2)} GiB); ${clips.length} clip objects (${(clipBytes / 1024 ** 3).toFixed(2)} GiB)`);
  const context = { options, secret, state };
  if (exports.length) await uploadGroup("exports", exports, options.exportConcurrency, context);
  if (clips.length) await uploadGroup("clips", clips, options.clipConcurrency, context);
  state.completed_at = new Date().toISOString();
  await atomicJson(STATE_PATH, state);
  console.log(`[done] ${Object.keys(state.uploaded).length} R2 objects verified by upload response`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
