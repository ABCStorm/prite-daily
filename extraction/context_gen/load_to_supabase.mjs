// One-shot loader: upsert question_context.json into Supabase via the PostgREST
// REST API (plain fetch — no supabase-js, so it works on Node 18 without the
// WebSocket/realtime dependency). The service-role key bypasses RLS.
//
// Run (key stays in your shell, NOT in any file):
//   SUPABASE_SERVICE_ROLE_KEY="paste-service-role-key" node extraction/context_gen/load_to_supabase.mjs
//
// Get the key from: Supabase Dashboard -> Project Settings -> API -> service_role.
// Requires 0013_question_context.sql (the table) to have run already.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const env = readFileSync(join(root, ".env.local"), "utf8");
const url = (env.match(/VITE_SUPABASE_URL=(.+)/) || [])[1]?.trim().replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url) { console.error("Could not read VITE_SUPABASE_URL from .env.local"); process.exit(1); }
if (!key) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY, e.g.:\n  SUPABASE_SERVICE_ROLE_KEY="..." node extraction/context_gen/load_to_supabase.mjs');
  process.exit(1);
}

const data = JSON.parse(readFileSync(join(root, "extraction/output/question_context.json"), "utf8"));
const rows = Object.entries(data).map(([question_id, context]) => ({ question_id, context }));
console.log(`loading ${rows.length} context rows into ${url}`);

const endpoint = `${url}/rest/v1/question_context`;
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  // upsert on the primary key (question_id); don't return the rows
  Prefer: "resolution=merge-duplicates,return=minimal",
};

const CHUNK = 500;
let done = 0;
for (let i = 0; i < rows.length; i += CHUNK) {
  const chunk = rows.slice(i, i + CHUNK);
  const res = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(chunk) });
  if (!res.ok) { console.error(`chunk @${i} failed: ${res.status} ${await res.text()}`); process.exit(1); }
  done += chunk.length;
  console.log(`  upserted ${done}/${rows.length}`);
}

// count check via the Content-Range header
const cres = await fetch(`${endpoint}?select=question_id`, {
  method: "HEAD",
  headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" },
});
const total = (cres.headers.get("content-range") || "").split("/")[1];
console.log(total ? `DONE — question_context now has ${total} rows.` : "DONE — load complete.");
