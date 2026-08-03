#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

function parseEnv(contents) {
  const values = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

async function main() {
  const env = parseEnv(await readFile(".env.local", "utf8"));
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error(".env.local must configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");

  const secret = randomBytes(32).toString("hex");
  const child = spawn("supabase", ["secrets", "set", `AUDIO_BATCH_SECRET=${secret}`], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  if (exitCode !== 0) {
    throw new Error(`supabase secrets set failed: ${output.replaceAll(secret, "<redacted>").slice(-3000)}`);
  }

  await mkdir("supabase/.temp", { recursive: true });
  const path = "supabase/.temp/audio-batch.env";
  await writeFile(
    path,
    [
      `SUPABASE_URL=${url}`,
      `SUPABASE_ANON_KEY=${anonKey}`,
      `AUDIO_BATCH_SECRET=${secret}`,
      "",
    ].join("\n"),
    { mode: 0o600 },
  );
  await chmod(path, 0o600);
  console.log(`Configured AUDIO_BATCH_SECRET and saved the local runner environment to ${path}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
