// Detect PRITE questions reused across multiple years' exams, tag each with
// how many times it recurs and which years, so the app can filter/sort by it.
//
// Matching: exact-normalized-stem groups (zero false-positive risk) unioned
// with near-duplicate pairs that pass BOTH a token-Jaccard and a character
// edit-distance threshold — Jaccard alone false-positives on shared clinical
// vignette templates ("A psychiatry consultation is requested regarding a
// patient with...") that otherwise describe different questions; requiring
// high edit-distance similarity too filters those out. Thresholds were
// calibrated by hand against this bank — see the session notes / PR that
// introduced this file for the pairs used to pick them.
//
// Run: node extraction/detect_repeats.mjs
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const bankPath = join(root, "extraction/output/questions_all.json");

const JACCARD_MIN = 0.85;
const LEV_RATIO_MIN = 0.85;

function norm(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
function tokenSet(s) {
  return new Set(norm(s).split(" ").filter((w) => w.length > 2));
}
function jaccard(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
function levDistance(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
function levRatio(a, b) {
  return 1 - levDistance(a, b) / Math.max(a.length, b.length, 1);
}

const qs = JSON.parse(readFileSync(bankPath, "utf8"));

const parent = qs.map((_, i) => i);
function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
function union(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }

// 1) exact normalized-stem matches
const byNorm = new Map();
qs.forEach((q, i) => {
  const k = norm(q.stem);
  if (!byNorm.has(k)) byNorm.set(k, []);
  byNorm.get(k).push(i);
});
for (const idxs of byNorm.values()) for (let i = 1; i < idxs.length; i++) union(idxs[0], idxs[i]);

// 2) near-duplicate matches, bucketed by opening words to keep comparisons cheap
const buckets = new Map();
qs.forEach((q, i) => {
  const key = norm(q.stem).split(" ").slice(0, 4).join(" ");
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(i);
});
let nearUnions = 0;
for (const idxs of buckets.values()) {
  if (idxs.length < 2) continue;
  for (let a = 0; a < idxs.length; a++) {
    for (let b = a + 1; b < idxs.length; b++) {
      const ia = idxs[a], ib = idxs[b];
      const na = norm(qs[ia].stem), nb = norm(qs[ib].stem);
      if (na === nb) continue; // already unioned above
      if (jaccard(tokenSet(qs[ia].stem), tokenSet(qs[ib].stem)) < JACCARD_MIN) continue;
      if (levRatio(na, nb) < LEV_RATIO_MIN) continue;
      union(ia, ib);
      nearUnions++;
    }
  }
}

// 3) group, keep only groups that recur across more than one distinct year
const groups = new Map();
qs.forEach((q, i) => {
  const r = find(i);
  if (!groups.has(r)) groups.set(r, []);
  groups.get(r).push(i);
});
const repeatGroups = [...groups.values()]
  .filter((idxs) => idxs.length > 1)
  .filter((idxs) => new Set(idxs.map((i) => qs[i].year)).size > 1);

// reset any stale tags from a prior run, then tag current groups
qs.forEach((q) => { delete q.repeat_count; delete q.repeat_years; });
for (const idxs of repeatGroups) {
  const years = [...new Set(idxs.map((i) => qs[i].year))].sort();
  for (const i of idxs) {
    qs[i].repeat_count = idxs.length;
    qs[i].repeat_years = years;
  }
}

copyFileSync(bankPath, bankPath.replace(/\.json$/, ".json.bak-prerepeats"));
writeFileSync(bankPath, JSON.stringify(qs));

const totalTagged = repeatGroups.reduce((a, g) => a + g.length, 0);
const sizeDist = {};
repeatGroups.forEach((g) => { sizeDist[g.length] = (sizeDist[g.length] || 0) + 1; });
console.log(`near-duplicate unions applied: ${nearUnions}`);
console.log(`repeat groups: ${repeatGroups.length}  ·  questions tagged: ${totalTagged} / ${qs.length}`);
console.log(`group-size distribution:`, sizeDist);
console.log(`wrote ${bankPath} (backup at ${bankPath.replace(/\.json$/, ".json.bak-prerepeats")})`);
