#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = process.cwd();
const BASE_URL = (process.env.R2_AUDIO_INVENTORY_URL || "https://pritedaily.com/api/audio-admin-inventory").replace(/\/$/, "");
const OLD_STATE = resolve(ROOT, "extraction/output/audio_r2_migration.state.json");
const NEW_STATE = resolve(ROOT, "extraction/output/audio_r2_v3_48k_upload.state.json");

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function fetchPage(cursor, secret) {
  const url = new URL(BASE_URL);
  if (cursor) url.searchParams.set("cursor", cursor);
  const response = await fetch(url, {
    headers: {
      "x-audio-batch-secret": secret,
      "cache-control": "no-cache",
    },
  });
  if (!response.ok) throw new Error(`Inventory request failed (${response.status}): ${await response.text()}`);
  return response.json();
}

function summarize(rows) {
  const groups = new Map();
  for (const row of rows) {
    const prefix = row.key.startsWith("exports/")
      ? row.key.split("/").slice(0, 2).join("/") + "/"
      : row.key.split("/").slice(0, 2).join("/") + "/";
    const current = groups.get(prefix) ?? { objects: 0, bytes: 0 };
    current.objects += 1;
    current.bytes += row.size;
    groups.set(prefix, current);
  }
  return [...groups.entries()]
    .map(([prefix, value]) => ({ prefix, ...value }))
    .sort((a, b) => b.bytes - a.bytes || a.prefix.localeCompare(b.prefix));
}

async function main() {
  const secret = process.env.AUDIO_BATCH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUDIO_BATCH_SECRET is required");
  const [oldState, newState] = await Promise.all([json(OLD_STATE), json(NEW_STATE)]);
  const expected = new Set([
    ...Object.keys(oldState.uploaded ?? {}).filter((key) => !key.startsWith("exports/v2/")),
    ...Object.keys(newState.uploaded ?? {}),
  ]);

  const inventory = [];
  let cursor;
  do {
    const page = await fetchPage(cursor, secret);
    inventory.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
    if (page.truncated && !cursor) throw new Error("R2 returned a truncated page without a cursor");
  } while (cursor);

  const actual = new Set(inventory.map((row) => row.key));
  const extras = inventory.filter((row) => !expected.has(row.key));
  const missing = [...expected].filter((key) => !actual.has(key));
  const bytes = inventory.reduce((sum, row) => sum + row.size, 0);
  const extraBytes = extras.reduce((sum, row) => sum + row.size, 0);

  console.log(JSON.stringify({
    expectedObjects: expected.size,
    actualObjects: inventory.length,
    actualBytes: bytes,
    missingObjects: missing.length,
    extraObjects: extras.length,
    extraBytes,
    extraGroups: summarize(extras),
    missing: missing.slice(0, 25),
    extras: extras.slice(0, 250),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
