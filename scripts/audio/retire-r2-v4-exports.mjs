#!/usr/bin/env node

import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const BUCKET = "prite-daily-audio";
const PREFIX = "exports/v4-16k-5100/";
const OLD_STATE = resolve(ROOT, "extraction/output/audio_r2_v4_16k_5100_upload.state.json");
const NEW_STATE = resolve(ROOT, "extraction/output/audio_r2_v6_16k_5100_topics_upload.state.json");
const MANIFEST = resolve(ROOT, "public/data/audio_exports.json");
const DELETE_STATE = resolve(ROOT, "extraction/output/audio_r2_v4_16k_5100_delete.state.json");

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function atomicJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

async function run(command, args, attempts = 10) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await new Promise((resolveRun, reject) => {
        const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
        let errorOutput = "";
        child.stderr.on("data", (chunk) => { errorOutput += chunk; });
        child.on("error", reject);
        child.on("exit", (code) => code === 0 ? resolveRun() : reject(new Error(`${command} exited ${code}: ${errorOutput.trim()}`)));
      });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.min(30_000, 1_000 * 2 ** (attempt - 1))));
    }
  }
  throw lastError;
}

async function mapConcurrent(items, concurrency, operation) {
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      await operation(items[index], index);
    }
  }));
}

async function verifyMissing(key, secret) {
  const url = `https://pritedaily.com/api/audio-admin/${key.split("/").map(encodeURIComponent).join("/")}?verify-delete=${Date.now()}-${Math.random()}`;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      const response = await fetch(url, { method: "HEAD", headers: { "x-audio-batch-secret": secret, "cache-control": "no-cache" } });
      if (response.status === 404) return;
      if (response.status === 429 || response.status >= 500) throw new Error(`Temporary HEAD ${response.status}`);
      throw new Error(`Expected deleted key to return 404, got ${response.status}: ${key}`);
    } catch (error) {
      if (attempt === 10) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, Math.min(30_000, 1_000 * 2 ** (attempt - 1))));
    }
  }
}

async function main() {
  const expectedArg = `--confirm-prefix=${PREFIX}`;
  if (!process.argv.slice(2).includes(expectedArg)) throw new Error(`Refusing cleanup without exact ${expectedArg}`);
  const secret = process.env.AUDIO_BATCH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUDIO_BATCH_SECRET is required");
  const [oldState, newState, manifest] = await Promise.all([json(OLD_STATE), json(NEW_STATE), json(MANIFEST)]);
  if (manifest.version !== "v6-r2-16k-5100-topic-complete") throw new Error("Production manifest is not the complete v6 topic archive");
  if (!newState.completed_at || Object.keys(newState.uploaded ?? {}).length !== 302 || Number(newState.bytes) !== 4_001_033_109) {
    throw new Error("The 302-object v6 verification gate is incomplete");
  }
  const rows = Object.entries(oldState.uploaded ?? {})
    .filter(([key]) => key.startsWith(PREFIX))
    .map(([key, value]) => ({ key, bytes: Number(value.bytes) }))
    .sort((a, b) => a.key.localeCompare(b.key));
  if (rows.length !== 300 || rows.some((row) => !/^exports\/v4-16k-5100\/[a-z0-9-]+\.mp3(?:\.part-\d{2,4})?$/.test(row.key) || !Number.isInteger(row.bytes) || row.bytes < 500)) {
    throw new Error(`Refusing unexpected v4 inventory (${rows.length} keys)`);
  }
  const bytes = rows.reduce((sum, row) => sum + row.bytes, 0);
  if (bytes !== 3_242_911_679 || bytes !== Number(oldState.bytes)) throw new Error(`Refusing unexpected v4 byte total (${bytes})`);
  console.log(`[guard] deleting exactly ${rows.length} ${PREFIX} objects (${(bytes / 1024 ** 3).toFixed(3)} GiB); source clips and v6 excluded`);
  let deleted = 0;
  await mapConcurrent(rows, 4, async ({ key }) => {
    await run(process.execPath, [
      "--dns-result-order=ipv4first", resolve(ROOT, "node_modules/wrangler/bin/wrangler.js"),
      "r2", "object", "delete", `${BUCKET}/${key}`, "--remote", "--force",
    ]);
    deleted += 1;
    if (deleted % 25 === 0 || deleted === rows.length) console.log(`[delete] ${deleted}/${rows.length}`);
  });
  let verified = 0;
  await mapConcurrent(rows, 8, async ({ key }) => {
    await verifyMissing(key, secret);
    verified += 1;
    if (verified % 50 === 0 || verified === rows.length) console.log(`[verify] ${verified}/${rows.length} missing`);
  });
  await atomicJson(DELETE_STATE, { version: 1, prefix: PREFIX, deleted: rows.length, bytes, verified_missing: verified, completed_at: new Date().toISOString() });
  console.log(`[done] retired ${rows.length} v4 R2 objects; ${(bytes / 1024 ** 3).toFixed(3)} GiB removed`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
