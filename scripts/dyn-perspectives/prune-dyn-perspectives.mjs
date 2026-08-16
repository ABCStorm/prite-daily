#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dynPerspectiveExclusionReason } from "./eligibility.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const BANK = join(ROOT, "extraction/output/questions_all.json");
const OUT = join(ROOT, "public/data/dyn_perspectives.json");

const questions = JSON.parse(await readFile(BANK, "utf8"));
const current = JSON.parse(await readFile(OUT, "utf8"));
const kept = {};
const reasons = new Map();

for (const question of questions) {
  const id = `${question.year}-${question.q_index}`;
  const reason = dynPerspectiveExclusionReason(question);
  if (!reason) {
    if (current[id]) kept[id] = current[id];
    continue;
  }
  reasons.set(reason, (reasons.get(reason) || 0) + 1);
}

await writeFile(OUT, JSON.stringify(kept));
await pipeline(
  Readable.from(await readFile(OUT)),
  createGzip({ level: 9 }),
  createWriteStream(`${OUT}.gz`),
);

console.log(`kept ${Object.keys(kept).length} Dynamic Dawg insights`);
console.log(`removed ${Object.keys(current).length - Object.keys(kept).length}`);
for (const [reason, count] of reasons) console.log(`  ${count}  ${reason}`);
