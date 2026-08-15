#!/usr/bin/env node
/**
 * Merge hand-curated clinical exam / visualization YouTube clips into
 * public/data/podcasts.json for the Video tab.
 *
 * Design goals (from product intent):
 *  - Only attach when the clip is clearly relevant — near-misses cost time.
 *  - Prefer bedside demos of findings (intention tremor, AIMS, dystonia…) over
 *    generic topic lectures.
 *  - Deep-link to the most helpful startSec / chapter when known.
 *  - Keep the existing max of 2 videos per question; clinical clips win ties.
 *
 * Usage:
 *   node scripts/podcasts/merge-clinical-exam.mjs
 *   node scripts/podcasts/merge-clinical-exam.mjs --dry-run
 */
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "../..");
const CATALOG = join(__dir, "clinical-exam-videos.json");
const QUESTIONS = join(ROOT, "extraction/output/questions_all.json");
const PODCASTS = join(ROOT, "public/data/podcasts.json");
const MAX_PER_Q = 2;
const dry = process.argv.includes("--dry-run");

const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
const questions = JSON.parse(readFileSync(QUESTIONS, "utf8"));
const podcasts = JSON.parse(readFileSync(PODCASTS, "utf8"));

function fields(q) {
  return {
    stem: String(q.stem || ""),
    answer: String(q.answer_text || ""),
    vq: String(q.video_query || ""),
    expl: String(q.explanation_text || "").slice(0, 500),
  };
}

function blob(q) {
  const f = fields(q);
  return `${f.stem}\n${f.answer}\n${f.vq}\n${f.expl}`;
}

function matchesRule(q, rule) {
  const b = blob(q);
  const f = fields(q);
  const stemAns = `${f.stem}\n${f.answer}\n${f.vq}`;
  if (rule.exclude_regex?.some((p) => new RegExp(p, "i").test(b))) return false;

  const m = rule.match || {};
  // Prefer stem/answer/video_query so explanation asides don't attach unrelated clips.
  // stem_or_answer_regex (i) and stem_or_answer_regex_cs (case-sensitive) are OR'd
  // when both are present; either family alone is required when only one is set.
  const hasI = !!m.stem_or_answer_regex?.length;
  const hasCs = !!m.stem_or_answer_regex_cs?.length;
  if (hasI || hasCs) {
    const hitI = hasI && m.stem_or_answer_regex.some((p) => new RegExp(p, "i").test(stemAns));
    const hitCs = hasCs && m.stem_or_answer_regex_cs.some((p) => new RegExp(p).test(stemAns));
    if (!hitI && !hitCs) return false;
  }
  if (m.any_field_regex?.length) {
    if (!m.any_field_regex.some((p) => new RegExp(p, "i").test(b))) return false;
  }
  if (m.answer_regex?.length) {
    if (!m.answer_regex.some((p) => new RegExp(p, "i").test(f.answer))) return false;
  }
  if (m.stem_regex?.length) {
    if (!m.stem_regex.some((p) => new RegExp(p, "i").test(f.stem))) return false;
  }
  if (rule.require_answer_or_stem_regex?.length) {
    const both = `${f.answer}\n${f.stem}`;
    if (!rule.require_answer_or_stem_regex.some((p) => new RegExp(p, "i").test(both))) {
      return false;
    }
  }
  return true;
}

function toRef(videoKey) {
  const v = catalog.videos[videoKey];
  if (!v) throw new Error(`Unknown video key: ${videoKey}`);
  return {
    videoId: v.videoId,
    title: v.title,
    channel: v.channel,
    kind: v.kind || "lecture",
    why: v.why,
    confidence: v.confidence || "high",
    durationSec: v.durationSec,
    tier: "direct",
    ...(v.startSec != null ? { startSec: v.startSec, chapterTitle: v.chapterTitle } : {}),
    // marker so re-runs can replace prior clinical merges cleanly
    source: "clinical-exam",
  };
}

/** Prefer clinical-exam clips, then keep existing non-clinical, cap at MAX. */
function mergeRefs(existing, clinical) {
  const prior = (existing || []).filter((r) => r.source !== "clinical-exam");
  // Clinical first (they're the visualization), then prior podcasts/lectures.
  // Dedupe by videoId — keep first occurrence (clinical wins).
  const out = [];
  const seen = new Set();
  for (const r of [...clinical, ...prior]) {
    if (seen.has(r.videoId)) continue;
    seen.add(r.videoId);
    out.push(r);
    if (out.length >= MAX_PER_Q) break;
  }
  return out;
}

const byRule = Object.fromEntries(catalog.rules.map((r) => [r.id, []]));
let touched = 0;
let addedRefs = 0;
let stripped = 0;

for (const q of questions) {
  const qid = `${q.year}-${q.q_index}`;
  const clinical = [];
  const seenKeys = new Set();

  for (const rule of catalog.rules) {
    if (!matchesRule(q, rule)) continue;
    byRule[rule.id].push(qid);
    for (const key of rule.videos || []) {
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      clinical.push(toRef(key));
    }
  }

  const existing = podcasts[qid];
  const hadClinical = (existing || []).some((r) => r.source === "clinical-exam");

  // No current clinical match: strip any prior clinical-exam overlays so
  // a tightened catalog (or removed bad clips) does not leave stale links.
  if (!clinical.length) {
    if (hadClinical) {
      const cleaned = (existing || []).filter((r) => r.source !== "clinical-exam");
      if (cleaned.length) podcasts[qid] = cleaned;
      else delete podcasts[qid];
      touched++;
      stripped++;
    }
    continue;
  }

  const merged = mergeRefs(existing, clinical);
  const before = JSON.stringify(existing || []);
  const after = JSON.stringify(merged);
  if (before !== after) {
    podcasts[qid] = merged;
    touched++;
    addedRefs += clinical.length;
  }
}

// Strip source marker from shipped payload? Keep it — harmless to the UI and
// lets re-runs replace cleanly. Client only reads known PodcastRef fields.

console.log("Clinical-exam merge summary");
console.log("  questions updated:", touched);
console.log("  clinical refs offered:", addedRefs);
console.log("  stale clinical overlays stripped:", stripped);
for (const [id, qids] of Object.entries(byRule)) {
  if (!qids.length) continue;
  console.log(`  ${id}: ${qids.length} → ${qids.slice(0, 12).join(", ")}${qids.length > 12 ? "…" : ""}`);
}

if (dry) {
  console.log("\n(--dry-run: public/data/podcasts.json not written)");
  // Sample a few intended links
  for (const sample of ["2014-38", "2018-5", "2020-34", "2021-99", "2024-46", "2023-233"]) {
    console.log(sample, podcasts[sample]);
  }
} else {
  writeFileSync(PODCASTS, JSON.stringify(podcasts));
  console.log("\nWrote", PODCASTS);
}
