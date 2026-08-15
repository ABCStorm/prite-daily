/**
 * Podcast episode recommendations for the Video tab.
 *
 * The map is built offline (scripts/podcasts/*) and shipped as a public sidecar
 * rather than folded into the question bank: the bank lives in a Supabase
 * Storage bucket that refuses overwrites, so every refresh there is a
 * rename-then-upload dance. These are public YouTube links with nothing
 * gated about them, so a plain static file is both simpler and refreshable
 * on its own cadence.
 *
 * Fetched once, lazily, the first time someone opens a Video tab.
 */
export type PodcastRef = {
  videoId: string;
  title: string;
  channel: string;
  /** One-line reason this episode helps with the question's concept. */
  why: string;
  confidence: "high" | "medium";
  /** Podcast episodes and teaching lectures are both recommended; the label
      says which so a neuroanatomy lecture isn't called a podcast episode. */
  kind?: "podcast" | "lecture";
  /**
   * `direct` — episode teaches the tested concept (strict offline judge).
   * `related` — same clinical topic / board area, useful background only.
   * Omitted on older sidecars; treat as direct.
   */
  tier?: "direct" | "related";
  durationSec: number;
  publishedAt?: string;
  /** Present only when the episode publishes chapter timestamps and one of
      them lands squarely on the tested concept. */
  startSec?: number;
  chapterTitle?: string;
};

let cache: Promise<Record<string, PodcastRef[]>> | null = null;

function load() {
  if (!cache) {
    cache = fetch("/data/podcasts.json")
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return cache;
}

/** Refs for one question, or [] when nothing confidently matched — most of the
    bank has no match, and that is the intended outcome. Optional `extraKeys`
    (therapy:CBT, neuro:Epilepsy) fill Neuro/Therapy items from a smaller
    curated sidecar so those banks are not silent. */
export async function getPodcastRefs(
  year: string,
  qIndex: number,
  extraKeys: string[] = [],
): Promise<PodcastRef[]> {
  const all = await load();
  const direct = all[`${year}-${qIndex}`];
  if (direct?.length) return direct;
  if (!extraKeys.length) return [];
  const { loadBankPodcasts } = await import("./bankExtras");
  const bank = await loadBankPodcasts();
  for (const key of extraKeys) {
    const hit = bank[key];
    if (hit?.length) return hit;
  }
  return [];
}

/** Deep-links to the matching chapter when there is one. */
export function podcastUrl(ref: PodcastRef) {
  const base = `https://www.youtube.com/watch?v=${ref.videoId}`;
  return ref.startSec ? `${base}&t=${ref.startSec}s` : base;
}

export function formatTimestamp(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}
