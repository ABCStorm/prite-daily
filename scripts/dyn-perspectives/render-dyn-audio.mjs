#!/usr/bin/env node
/**
 * Render psychodynamic pearls through generate-dyn-stat (Fish s2.1-pro-free).
 *
 *   node --env-file=supabase/.temp/audio-batch.env \
 *     scripts/dyn-perspectives/render-dyn-audio.mjs --sample 3
 */
import { readFile, rename, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DEFAULT_STATS = "public/data/dyn_perspectives.json";
const DEFAULT_STATE = "extraction/output/dyn_render.state.json";

function parseArgs(argv) {
  const opts = {
    stats: DEFAULT_STATS,
    state: DEFAULT_STATE,
    sample: null,
    ids: null,
    concurrency: 2,
    retries: 5,
    force: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      if (!argv[i + 1]) throw new Error(`${arg} requires a value`);
      i += 1;
      return argv[i];
    };
    if (arg === "--stats") opts.stats = value();
    else if (arg === "--state") opts.state = value();
    else if (arg === "--sample") opts.sample = Number(value());
    else if (arg === "--ids") opts.ids = value().split(",").map((id) => id.trim()).filter(Boolean);
    else if (arg === "--concurrency") opts.concurrency = Number(value());
    else if (arg === "--retries") opts.retries = Number(value());
    else if (arg === "--force") opts.force = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("node scripts/dyn-perspectives/render-dyn-audio.mjs [--sample N] [--ids ID,ID]");
      process.exit(0);
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return opts;
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const secret = process.env.AUDIO_BATCH_SECRET;
  if (!url || !anon || !secret) throw new Error("SUPABASE_URL, SUPABASE_ANON_KEY, and AUDIO_BATCH_SECRET are required");

  const stats = JSON.parse(await readFile(resolve(opts.stats), "utf8"));
  let ids = Object.keys(stats);
  if (opts.ids) ids = opts.ids.filter((id) => stats[id]);
  else if (opts.sample) {
    const step = Math.max(1, Math.floor(ids.length / opts.sample));
    ids = ids.filter((_, i) => i % step === 0).slice(0, opts.sample);
  }

  let state = { ready: {}, error: {} };
  try {
    state = JSON.parse(await readFile(resolve(opts.state), "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const pending = ids.filter((id) => opts.force || !state.ready?.[id]);
  console.log(`${pending.length} dyn clips to render (${ids.length} selected)`);

  const endpoint = `${url.replace(/\/$/, "")}/functions/v1/generate-dyn-stat`;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(opts.concurrency, pending.length || 1) }, async () => {
    while (cursor < pending.length) {
      const index = cursor;
      cursor += 1;
      const id = pending[index];
      const row = stats[id];
      let lastError = "unknown";
      for (let attempt = 1; attempt <= opts.retries; attempt += 1) {
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: {
              authorization: `Bearer ${anon}`,
              apikey: anon,
              "content-type": "application/json",
              "x-audio-batch-secret": secret,
            },
            body: JSON.stringify({ question_id: id, script: row.sentence, force: opts.force }),
          });
          const body = await res.json();
          if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
          state.ready[id] = { audio_path: body.audio_path, cached: Boolean(body.cached), at: new Date().toISOString() };
          delete state.error[id];
          lastError = null;
          break;
        } catch (error) {
          lastError = error.message;
          await sleep(Math.min(8000, 400 * 2 ** (attempt - 1)));
        }
      }
      if (lastError) state.error[id] = lastError;
      if ((index + 1) % 25 === 0 || index === pending.length - 1) {
        await atomicJson(resolve(opts.state), state);
        console.log(`  ${index + 1}/${pending.length}  ready=${Object.keys(state.ready).length}  errors=${Object.keys(state.error).length}`);
      }
    }
  });
  await Promise.all(workers);
  await atomicJson(resolve(opts.state), state);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
