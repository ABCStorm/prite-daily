// Fallback for when the Supabase SQL Editor rejects the full 0014 file as "too
// large": split the upsert into smaller self-contained .sql files you can paste
// and Run one at a time. Requires 0013 (the table) to have run first.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const outDir = join(here, "sql_parts");
if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const data = JSON.parse(readFileSync(join(root, "extraction/output/question_context.json"), "utf8"));
const rows = Object.entries(data).sort((a, b) => a[0].localeCompare(b[0]));
const esc = (s) => s.replace(/'/g, "''");

const PER_FILE = 500; // ~220 KB per file, comfortably under the editor cap
let part = 0;
for (let i = 0; i < rows.length; i += PER_FILE) {
  const chunk = rows.slice(i, i + PER_FILE);
  let sql = `-- 0014 context data — part ${part + 1}. Paste into the SQL Editor and Run.\n`;
  sql += `insert into question_context (question_id, context) values\n`;
  sql += chunk.map(([id, ctx]) => `  ('${esc(id)}', '${esc(ctx)}')`).join(",\n");
  sql += `\non conflict (question_id) do update set context = excluded.context, updated_at = now();\n`;
  writeFileSync(join(outDir, `part_${String(part + 1).padStart(2, "0")}.sql`), sql);
  part++;
}
console.log(`wrote ${part} files (${PER_FILE} rows each) to ${outDir}`);
