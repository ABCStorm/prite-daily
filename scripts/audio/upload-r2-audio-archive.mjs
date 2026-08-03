#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const MANIFEST_PATH = resolve(ROOT, "extraction/output/audio_exports.v6-16k-5100-topics.manifest.json");
const BUILD_STATE_PATH = resolve(ROOT, "extraction/output/audio_exports.v6-16k-5100-topics.state.json");
const UPLOAD_STATE_PATH = resolve(ROOT, "extraction/output/audio_r2_v6_16k_5100_topics_upload.state.json");
const PUBLIC_MANIFEST_PATH = resolve(ROOT, "public/data/audio_exports.json");
const EXPORTS = resolve(ROOT, "extraction/output/audio_exports/v6-16k-5100-topics");
const BULK_STAGING = resolve(ROOT, "extraction/output/audio_r2_v6_16k_5100_topics_staging");
const R2_BUCKET = "prite-daily-audio";
const BULK_BATCH_SIZE = 2;

function parseArgs(argv) {
  const options = { baseUrl: "https://pritedaily.com", concurrency: 2 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => { if (!argv[index + 1]) throw new Error(`${arg} requires a value`); return argv[++index]; };
    if (arg === "--base-url") options.baseUrl = next().replace(/\/$/, "");
    else if (arg === "--concurrency") options.concurrency = Number(next());
    else if (arg === "--help" || arg === "-h") {
      console.log(`Upload and publish the complete 16 kbps PRITE R2 archive.\n\nEnvironment: AUDIO_BATCH_SECRET\n\nOptions:\n  --base-url URL    Pages origin (default https://pritedaily.com)\n  --concurrency N   Parallel files, 1-8 (default 2)`);
      process.exit(0);
    } else throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 8) throw new Error("--concurrency must be 1-8");
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

function objectUrl(baseUrl, key, query = "") {
  return `${baseUrl}/api/audio-admin/${key.split("/").map(encodeURIComponent).join("/")}${query}`;
}

async function request(url, init, attempts = 5) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      return response;
    } catch (error) {
      if (attempt === attempts) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 800 * 2 ** (attempt - 1)));
    }
  }
}

function itemsFrom(manifest, buildState) {
  const objects = new Map();
  for (const entry of manifest.exports ?? []) {
    for (const variant of entry.variants ?? []) {
      const filename = basename(variant.path);
      const built = buildState.ready?.[filename];
      if (!built?.sha256 || built.bytes !== variant.bytes || built.sha256 !== variant.sha256) throw new Error(`Build-state mismatch for ${filename}`);
      const localPath = resolve(EXPORTS, filename);
      if (variant.parts?.length) {
        let offset = 0;
        for (const part of variant.parts) {
          objects.set(part.path, {
            key: part.path,
            filename: basename(part.path),
            localPath,
            sourceBytes: variant.bytes,
            offset,
            bytes: part.bytes,
          });
          offset += part.bytes;
        }
        if (offset !== variant.bytes) throw new Error(`Part byte mismatch for ${filename}`);
      } else {
        objects.set(variant.path, {
          key: variant.path,
          filename,
          localPath,
          sourceBytes: variant.bytes,
          offset: 0,
          bytes: variant.bytes,
        });
      }
    }
  }
  return [...objects.values()].sort((a, b) => a.bytes - b.bytes || a.key.localeCompare(b.key));
}

async function remoteHead(item, options, secret) {
  let response;
  let lastError;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      response = await fetch(objectUrl(options.baseUrl, item.key, `?verify=${Date.now()}-${Math.random()}`), {
        method: "HEAD",
        headers: { "x-audio-batch-secret": secret, "cache-control": "no-cache" },
      });
      if (response.status === 429 || response.status >= 500) throw new Error(`HEAD ${item.key} temporarily failed (${response.status})`);
      break;
    } catch (error) {
      lastError = error;
      if (attempt < 10) await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.min(30_000, 1_000 * 2 ** (attempt - 1))));
    }
  }
  if (!response) throw lastError;
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`HEAD ${item.key} failed (${response.status})`);
  return {
    bytes: Number(response.headers.get("content-length")),
    etag: (response.headers.get("etag") ?? "").replace(/^\"|\"$/g, ""),
  };
}

async function md5(item) {
  const hash = createHash("md5");
  const stream = createReadStream(item.localPath, { start: item.offset, end: item.offset + item.bytes - 1 });
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest("hex");
}

async function run(command, args, attempts = 10, timeoutMs = 180_000) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await new Promise((resolveRun, reject) => {
        const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
        let errorOutput = "";
        let settled = false;
        const finish = (callback) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          callback();
        };
        const timeout = setTimeout(() => {
          child.kill("SIGTERM");
          finish(() => reject(new Error(`${command} timed out after ${Math.round(timeoutMs / 1000)} seconds`)));
        }, timeoutMs);
        child.stderr.on("data", (chunk) => { errorOutput += chunk; });
        child.on("error", (error) => finish(() => reject(error)));
        child.on("exit", (code) => finish(() => code === 0 ? resolveRun() : reject(new Error(`${command} exited ${code}: ${errorOutput.trim()}`))));
      });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.min(30_000, 1_000 * 2 ** (attempt - 1))));
    }
  }
  throw lastError;
}

async function materialize(item) {
  if (item.offset === 0 && item.bytes === item.sourceBytes) return item.localPath;
  const outputPath = resolve(BULK_STAGING, item.key);
  const existing = await stat(outputPath).catch(() => null);
  if (existing?.size === item.bytes) return outputPath;
  await mkdir(dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.part-${process.pid}`;
  await pipeline(
    createReadStream(item.localPath, { start: item.offset, end: item.offset + item.bytes - 1 }),
    createWriteStream(temporary),
  );
  if ((await stat(temporary)).size !== item.bytes) throw new Error(`Staged part byte mismatch for ${item.filename}`);
  await rename(temporary, outputPath);
  return outputPath;
}

async function mapConcurrent(items, concurrency, operation) {
  let cursor = 0;
  const results = new Array(items.length);
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await operation(items[index], index);
    }
  }));
  return results;
}

async function bulkUpload(items, context) {
  let examined = 0;
  const prepared = await mapConcurrent(items, 4, async (item) => {
    const file = await stat(item.localPath);
    if (file.size !== item.sourceBytes) throw new Error(`Local source byte mismatch for ${item.filename}`);
    item.md5 = context.state.uploaded[item.key]?.md5 ?? await md5(item);
    const remote = await remoteHead(item, context.options, context.secret);
    examined += 1;
    if (examined % 25 === 0 || examined === items.length) console.log(`[scan] ${examined}/${items.length}`);
    if (remote?.bytes === item.bytes && remote.etag === item.md5) {
      context.state.uploaded[item.key] = { bytes: item.bytes, md5: item.md5, verified_at: new Date().toISOString() };
      return null;
    }
    return item;
  });
  await context.writeState();
  const pending = prepared.filter(Boolean);
  console.log(`[bulk] ${pending.length} objects remain after remote MD5 scan`);
  let uploaded = 0;
  for (let start = 0; start < pending.length; start += BULK_BATCH_SIZE) {
    const batch = pending.slice(start, start + BULK_BATCH_SIZE);
    const uploadPaths = await mapConcurrent(batch, 4, materialize);
    const manifestPath = resolve(BULK_STAGING, `batch-${String(start / BULK_BATCH_SIZE + 1).padStart(3, "0")}.json`);
    await mkdir(dirname(manifestPath), { recursive: true });
    await atomicJson(manifestPath, batch.map((item, index) => ({ key: item.key, file: uploadPaths[index] })));
    await run(process.execPath, [
      "--dns-result-order=ipv4first", resolve(ROOT, "node_modules/wrangler/bin/wrangler.js"),
      "r2", "bulk", "put", R2_BUCKET, `--filename=${manifestPath}`, "--concurrency=2",
      "--content-type=audio/mpeg", "--remote", "--force",
    ], 10, 900_000);
    await mapConcurrent(batch, 4, async (item) => {
      const remote = await remoteHead(item, context.options, context.secret);
      if (remote?.bytes !== item.bytes || remote.etag !== item.md5) throw new Error(`Remote byte/hash verification failed for ${item.filename}`);
      context.state.uploaded[item.key] = { bytes: item.bytes, md5: item.md5, verified_at: new Date().toISOString() };
    });
    // Large programs are uploaded as 40 MiB staged slices. Remove each batch's
    // verified slices immediately so an expanded archive cannot consume a
    // second full archive's worth of local disk while later batches upload.
    await Promise.all(uploadPaths.map((path) => path.startsWith(BULK_STAGING) ? rm(path, { force: true }) : Promise.resolve()));
    uploaded += batch.length;
    await context.writeState();
    console.log(`[bulk] ${uploaded}/${pending.length} new; ${Object.keys(context.state.uploaded).length}/${items.length} verified`);
  }
  return pending.length;
}

async function directUpload(item) {
  let uploadPath = item.localPath;
  let temporaryDirectory = null;
  try {
    if (item.offset !== 0 || item.bytes !== item.sourceBytes) {
      temporaryDirectory = await mkdtemp(join(tmpdir(), "prite-r2-part-"));
      uploadPath = join(temporaryDirectory, item.filename);
      await pipeline(
        createReadStream(item.localPath, { start: item.offset, end: item.offset + item.bytes - 1 }),
        createWriteStream(uploadPath),
      );
      if ((await stat(uploadPath)).size !== item.bytes) throw new Error(`Temporary part byte mismatch for ${item.filename}`);
    }
    await run(process.execPath, [
      "--dns-result-order=ipv4first", resolve(ROOT, "node_modules/wrangler/bin/wrangler.js"),
      "r2", "object", "put", `${R2_BUCKET}/${item.key}`,
      `--file=${uploadPath}`, "--content-type=audio/mpeg", "--remote",
    ]);
  } finally {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function upload(item, context) {
  const file = await stat(item.localPath);
  if (file.size !== item.sourceBytes) throw new Error(`Local source byte mismatch for ${item.filename}`);
  const digest = await md5(item);
  item.md5 = digest;
  const existing = await remoteHead(item, context.options, context.secret);
  if (existing?.bytes === item.bytes && existing.etag === digest) return "existing";
  await directUpload(item);
  const remote = await remoteHead(item, context.options, context.secret);
  if (remote?.bytes !== item.bytes || remote.etag !== digest) throw new Error(`Remote byte/hash verification failed for ${item.filename}`);
  return "uploaded";
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const secret = process.env.AUDIO_BATCH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUDIO_BATCH_SECRET is required");
  const [manifest, buildState, state] = await Promise.all([
    json(MANIFEST_PATH, null),
    json(BUILD_STATE_PATH, null),
    json(UPLOAD_STATE_PATH, { version: 1, uploaded: {}, multipart: {} }),
  ]);
  if (!manifest || !buildState?.completed_at || manifest.version !== "v6-r2-16k-5100-topic-complete") throw new Error("The completed 5,100-question topic-complete 16 kbps build and staged manifest are required");
  const items = itemsFrom(manifest, buildState);
  const variants = (manifest.exports ?? []).reduce((sum, entry) => sum + (entry.variants?.length ?? 0), 0);
  if (variants !== 264 || items.length < variants) throw new Error(`Unexpected archive inventory: ${variants} variants, ${items.length} R2 objects`);
  let stateWrite = Promise.resolve();
  const writeState = () => {
    stateWrite = stateWrite.then(() => atomicJson(UPLOAD_STATE_PATH, state));
    return stateWrite;
  };
  const context = { options, secret, state, writeState };
  await bulkUpload(items, context);
  await stateWrite;
  state.completed_at = new Date().toISOString();
  state.bytes = items.reduce((sum, item) => sum + item.bytes, 0);
  await writeState();
  const temporary = `${PUBLIC_MANIFEST_PATH}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(temporary, PUBLIC_MANIFEST_PATH);
  await rm(BULK_STAGING, { recursive: true, force: true });
  console.log(`[done] ${items.length} verified direct-R2 objects; ${(state.bytes / 1024 ** 3).toFixed(3)} GiB; production manifest promoted`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
