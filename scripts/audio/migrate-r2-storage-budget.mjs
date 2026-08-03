#!/usr/bin/env node

// Transactional storage-budget migration for the 5,100-question audio release.
//
// 1. stage-gap1   — publish a temporary manifest that stops referencing the
//                   old two-second-gap variants (no R2 mutation).
// 2. delete-gap2  — after that manifest is live, remove only those exact old
//                   variant objects and verify every key returns 404.
// 3. delete-old   — after the complete v4-16k manifest is live and verified,
//                   remove the remaining superseded v3 archive objects.

import { readFile, rename, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const BUCKET = "prite-daily-audio";
const PUBLIC_MANIFEST = resolve(ROOT, "public/data/audio_exports.json");
const OLD_MANIFEST = resolve(ROOT, "extraction/output/audio_exports.v3-48k.pre-5100.json");
const OLD_UPLOAD_STATE = resolve(ROOT, "extraction/output/audio_r2_v3_48k_upload.state.json");
const NEW_UPLOAD_STATE = resolve(ROOT, "extraction/output/audio_r2_v4_16k_5100_upload.state.json");
const GAP2_DELETE_STATE = resolve(ROOT, "extraction/output/audio_r2_v3_gap2_delete.state.json");
const OLD_DELETE_STATE = resolve(ROOT, "extraction/output/audio_r2_v3_final_delete.state.json");
const PRODUCTION_MANIFEST = "https://pritedaily.com/data/audio_exports.json";
const OLD_PREFIX = "exports/v3-48k/";
const NEW_PREFIX = "exports/v4-16k-5100/";

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function atomicJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

async function productionManifest() {
  const response = await fetch(`${PRODUCTION_MANIFEST}?storage-migration=${Date.now()}`, {
    headers: { "cache-control": "no-cache" },
  });
  if (!response.ok) throw new Error(`Could not read production manifest (${response.status})`);
  return response.json();
}

function objectRows(manifest, predicate = () => true) {
  const rows = new Map();
  for (const entry of manifest.exports ?? []) {
    for (const variant of entry.variants ?? []) {
      if (!predicate(variant)) continue;
      const parts = variant.parts?.length ? variant.parts : [{ path: variant.path, bytes: variant.bytes }];
      for (const part of parts) {
        if (!part.path?.startsWith(OLD_PREFIX) || !Number.isInteger(part.bytes) || part.bytes < 500) {
          throw new Error(`Unexpected old archive object: ${JSON.stringify(part)}`);
        }
        const prior = rows.get(part.path);
        if (prior && prior.bytes !== part.bytes) throw new Error(`Conflicting byte count for ${part.path}`);
        rows.set(part.path, { key: part.path, bytes: part.bytes });
      }
    }
  }
  return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
}

async function run(command, args, attempts = 8) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await new Promise((resolveRun, reject) => {
        const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
        let stderr = "";
        child.stderr.on("data", (chunk) => { stderr += chunk; });
        child.on("error", reject);
        child.on("exit", (code) => code === 0 ? resolveRun() : reject(new Error(`${command} exited ${code}: ${stderr.trim()}`)));
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

async function remoteExists(key, secret) {
  const encoded = key.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`https://pritedaily.com/api/audio-admin/${encoded}?storage-check=${Date.now()}-${Math.random()}`, {
    method: "HEAD",
    headers: { "x-audio-batch-secret": secret, "cache-control": "no-cache" },
  });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`HEAD ${key} failed (${response.status})`);
  return true;
}

async function deleteAndVerify(rows, statePath, secret) {
  let deleted = 0;
  await mapConcurrent(rows, 4, async ({ key }) => {
    if (await remoteExists(key, secret)) {
      await run(process.execPath, [
        "--dns-result-order=ipv4first", resolve(ROOT, "node_modules/wrangler/bin/wrangler.js"),
        "r2", "object", "delete", `${BUCKET}/${key}`, "--remote", "--force",
      ]);
    }
    deleted += 1;
    if (deleted % 25 === 0 || deleted === rows.length) console.log(`[delete] ${deleted}/${rows.length}`);
  });
  let verified = 0;
  await mapConcurrent(rows, 8, async ({ key }) => {
    if (await remoteExists(key, secret)) throw new Error(`Deletion verification failed: ${key}`);
    verified += 1;
    if (verified % 50 === 0 || verified === rows.length) console.log(`[verify] ${verified}/${rows.length} absent`);
  });
  const bytes = rows.reduce((sum, row) => sum + row.bytes, 0);
  await atomicJson(statePath, { version: 1, objects: rows.length, bytes, verified_missing: verified, completed_at: new Date().toISOString() });
  console.log(`[done] ${rows.length} objects and ${(bytes / 1e9).toFixed(3)} GB retired`);
}

async function stageGap1() {
  const manifest = await json(PUBLIC_MANIFEST);
  const variants = (manifest.exports ?? []).flatMap((entry) => entry.variants ?? []);
  if (manifest.version !== "v4-r2-48k-complete" || manifest.exports?.length !== 33 || variants.length !== 264) {
    throw new Error("Refusing to stage from an unexpected production manifest");
  }
  if (await stat(OLD_MANIFEST).catch(() => null)) {
    const saved = await json(OLD_MANIFEST);
    if (saved.generated_at !== manifest.generated_at) throw new Error("Existing migration backup does not match the current manifest");
  } else {
    await atomicJson(OLD_MANIFEST, manifest);
  }
  const exports = manifest.exports.map((entry) => {
    const kept = entry.variants.filter((variant) => variant.between_question_seconds === 1);
    if (kept.length !== 4) throw new Error(`Unexpected gap-one inventory for ${entry.scope_key}`);
    const fallback = kept.find((variant) => variant.playback_rate === 1) ?? kept[0];
    return { ...entry, ...fallback, variants: kept };
  });
  await atomicJson(PUBLIC_MANIFEST, {
    ...manifest,
    version: "v4-r2-48k-gap1-migration",
    generated_at: new Date().toISOString(),
    between_question_seconds: 1,
    between_question_options: [1],
    exports,
  });
  console.log(`[done] staged gap-one-only manifest with ${exports.length} scopes and ${exports.reduce((n, entry) => n + entry.variants.length, 0)} variants`);
}

async function deleteGap2() {
  if (!process.argv.includes("--confirm-delete=gap2-v3-48k")) throw new Error("Refusing without --confirm-delete=gap2-v3-48k");
  const secret = process.env.AUDIO_BATCH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUDIO_BATCH_SECRET is required");
  const [live, oldManifest, oldState] = await Promise.all([productionManifest(), json(OLD_MANIFEST), json(OLD_UPLOAD_STATE)]);
  if (live.version !== "v4-r2-48k-gap1-migration" || live.between_question_options?.some((gap) => gap !== 1)) {
    throw new Error("Production has not switched to the gap-one migration manifest");
  }
  const rows = objectRows(oldManifest, (variant) => variant.between_question_seconds === 2);
  const expected = oldState.uploaded ?? {};
  if (rows.length < 132 || rows.some((row) => expected[row.key]?.bytes !== row.bytes)) throw new Error(`Unexpected gap-two deletion inventory (${rows.length})`);
  const variantBytes = oldManifest.exports.flatMap((entry) => entry.variants).filter((variant) => variant.between_question_seconds === 2).reduce((sum, variant) => sum + variant.bytes, 0);
  if (rows.reduce((sum, row) => sum + row.bytes, 0) !== variantBytes) throw new Error("Gap-two object bytes do not match manifest bytes");
  console.log(`[guard] production no longer references gap two; retiring exactly ${rows.length} objects`);
  await deleteAndVerify(rows, GAP2_DELETE_STATE, secret);
}

async function deleteOld() {
  if (!process.argv.includes("--confirm-delete=all-v3-48k")) throw new Error("Refusing without --confirm-delete=all-v3-48k");
  const secret = process.env.AUDIO_BATCH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUDIO_BATCH_SECRET is required");
  const [live, oldManifest, newState] = await Promise.all([productionManifest(), json(OLD_MANIFEST), json(NEW_UPLOAD_STATE)]);
  const liveVariants = (live.exports ?? []).flatMap((entry) => entry.variants ?? []);
  if (live.version !== "v5-r2-16k-5100-complete" || liveVariants.length !== 264 || liveVariants.some((variant) => !variant.path?.startsWith(NEW_PREFIX))) {
    throw new Error("Production is not fully switched to the verified v4 16 kbps archive");
  }
  if (!newState.completed_at || !Object.keys(newState.uploaded ?? {}).length) throw new Error("New archive upload verification is incomplete");
  const rows = objectRows(oldManifest);
  if (rows.length !== 392) throw new Error(`Unexpected full v3 deletion inventory (${rows.length})`);
  console.log(`[guard] production references only ${NEW_PREFIX}; retiring exactly ${rows.length} old objects`);
  await deleteAndVerify(rows, OLD_DELETE_STATE, secret);
}

const command = process.argv[2];
if (command === "stage-gap1") await stageGap1();
else if (command === "delete-gap2") await deleteGap2();
else if (command === "delete-old") await deleteOld();
else throw new Error("Usage: migrate-r2-storage-budget.mjs stage-gap1 | delete-gap2 --confirm-delete=gap2-v3-48k | delete-old --confirm-delete=all-v3-48k");
