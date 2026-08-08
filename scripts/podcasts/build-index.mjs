// PHASE 1 of the podcast-recommendation pipeline: build the episode index.
//
// Enumerates each curated channel's uploads playlist (1 quota unit per 50
// videos — NOT search.list, which costs 100 per call), hydrates durations and
// view counts, parses chapter timestamps out of descriptions, and writes a
// deduped episode index to scripts/podcasts/episodes.json.
//
//   node scripts/podcasts/build-index.mjs              # full build
//   node scripts/podcasts/build-index.mjs --incremental # only new uploads
//   node scripts/podcasts/build-index.mjs --only "NEI Psychopharm"
//
// Raw API pages are cached in .cache/raw/<uploads>.json so re-runs are free.
// Needs YOUTUBE_API_KEY (falls back to the AcademicChallengeWiki .env, which is
// where the key already lives).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHANNELS } from "./channels.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE = join(__dirname, ".cache");
const RAW = join(CACHE, "raw");
const OUT = join(__dirname, "episodes.json");

const flag = (n) => process.argv.includes(`--${n}`);
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };

async function apiKey() {
  if (process.env.YOUTUBE_API_KEY) return process.env.YOUTUBE_API_KEY;
  for (const p of [join(__dirname, "../../.env.local"),
                   "/Users/andrewcorrell/Claude/Projects/AcademicChallengeWiki/.env"]) {
    if (!existsSync(p)) continue;
    const m = (await readFile(p, "utf8")).match(/YOUTUBE_API_KEY=(\S+)/);
    if (m) return m[1];
  }
  throw new Error("YOUTUBE_API_KEY not found (env, .env.local, or AcademicChallengeWiki/.env)");
}

let quota = 0;
async function yt(KEY, path, params) {
  const url = `https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams({ ...params, key: KEY })}`;
  const r = await fetch(url);
  const j = await r.json();
  if (j.error) throw new Error(`${path}: ${j.error.message}`);
  quota += path === "search" ? 100 : 1;
  return j;
}

/** ISO-8601 duration → seconds. */
function durationSeconds(iso) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || "");
  if (!m) return 0;
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
}

/** Pull "12:02 Negative Transference" style chapter markers out of a
    description. Several of the core channels (Puder, NEI) publish full chapter
    lists, which is what lets a recommendation deep-link to the exact segment
    instead of the top of a 90-minute episode. */
function parseChapters(desc) {
  const out = [];
  for (const line of (desc || "").split(/\r?\n/)) {
    // Timestamps sometimes run inline with no space before the label.
    const re = /(?:^|\s)(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–—:]?\s*([^\n]{3,90})/g;
    let m;
    while ((m = re.exec(line))) {
      const parts = m[1].split(":").map(Number);
      const sec = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
      const title = m[2].replace(/\s*\d{1,2}:\d{2}(?::\d{2})?.*$/, "").trim();
      if (title && !/^https?:/i.test(title)) out.push({ sec, title });
    }
  }
  // Chapter lists are monotonically increasing; anything else is a stray
  // timestamp in prose (e.g. "see 4:20 of the previous episode").
  const sorted = out.filter((c, i, a) => i === 0 || c.sec > a[i - 1].sec);
  return sorted.length >= 3 ? sorted : [];
}

const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

async function listUploads(KEY, ch, known) {
  const cacheFile = join(RAW, `${ch.uploads}.json`);
  let cached = [];
  if (existsSync(cacheFile)) cached = JSON.parse(await readFile(cacheFile, "utf8"));
  const cachedIds = new Set(cached.map((e) => e.videoId));

  const fresh = [];
  let page = "";
  for (;;) {
    const j = await yt(KEY, "playlistItems", {
      part: "snippet,contentDetails", maxResults: 50, playlistId: ch.uploads, ...(page ? { pageToken: page } : {}),
    });
    let hitKnown = false;
    for (const it of j.items || []) {
      const videoId = it.contentDetails.videoId;
      if (cachedIds.has(videoId)) { hitKnown = true; continue; }
      fresh.push({
        videoId,
        title: it.snippet.title,
        description: it.snippet.description || "",
        publishedAt: it.contentDetails.videoPublishedAt || it.snippet.publishedAt,
      });
    }
    // Uploads playlists are newest-first, so in incremental mode the first page
    // that is entirely already-known means we've caught up.
    if (known && hitKnown && !fresh.length) break;
    page = j.nextPageToken;
    if (!page) break;
  }

  const all = [...fresh, ...cached];
  await writeFile(cacheFile, JSON.stringify(all));
  return { all, freshCount: fresh.length };
}

async function hydrate(KEY, eps) {
  const need = eps.filter((e) => e.durationSec == null);
  for (let i = 0; i < need.length; i += 50) {
    const batch = need.slice(i, i + 50);
    const j = await yt(KEY, "videos", { part: "contentDetails,statistics,liveStreamingDetails", id: batch.map((e) => e.videoId).join(",") });
    const by = Object.fromEntries((j.items || []).map((v) => [v.id, v]));
    for (const e of batch) {
      const v = by[e.videoId];
      if (!v) { e.durationSec = 0; continue; }
      e.durationSec = durationSeconds(v.contentDetails?.duration);
      e.views = +(v.statistics?.viewCount || 0);
      e.upcoming = !!v.liveStreamingDetails && !v.liveStreamingDetails.actualEndTime;
    }
  }
}

const MIN_SECONDS = 8 * 60; // drops Shorts, trailers, and promo clips

async function main() {
  const KEY = await apiKey();
  await mkdir(RAW, { recursive: true });
  const only = arg("only");
  const incremental = flag("incremental");

  const episodes = [];
  for (const ch of CHANNELS) {
    if (only && ch.name !== only) continue;
    const { all, freshCount } = await listUploads(KEY, ch, incremental);
    await hydrate(KEY, all);
    await writeFile(join(RAW, `${ch.uploads}.json`), JSON.stringify(all));

    // Several channels double-post the same episode (Carlat and NEI both do).
    // Keep the longest cut of each normalized title, tie-broken by views.
    const best = new Map();
    for (const e of all) {
      if (e.upcoming || (e.durationSec || 0) < MIN_SECONDS) continue;
      const k = norm(e.title).replace(/\b(part|pt|vertical edit|audio|full episode)\b/g, "").trim();
      const prev = best.get(k);
      if (!prev || e.durationSec > prev.durationSec || (e.durationSec === prev.durationSec && (e.views || 0) > (prev.views || 0))) {
        best.set(k, e);
      }
    }
    for (const e of best.values()) {
      episodes.push({
        channel: ch.name, tier: ch.tier, kind: ch.kind || "podcast", videoId: e.videoId, title: e.title,
        description: (e.description || "").slice(0, 1200),
        chapters: parseChapters(e.description), publishedAt: e.publishedAt,
        durationSec: e.durationSec, views: e.views || 0,
      });
    }
    console.log(`${ch.name.padEnd(38)} raw ${String(all.length).padStart(4)}  new ${String(freshCount).padStart(4)}  kept ${String(best.size).padStart(4)}`);
  }

  episodes.sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
  await writeFile(OUT, JSON.stringify(episodes, null, 1));
  const withCh = episodes.filter((e) => e.chapters.length).length;
  console.log(`\n${episodes.length} episodes → ${OUT}`);
  console.log(`${withCh} (${Math.round((withCh / episodes.length) * 100)}%) have chapter timestamps for deep-linking`);
  console.log(`quota used this run: ~${quota} units`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
