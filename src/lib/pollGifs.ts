/* A quick, fun gif shown for a couple seconds right as the host wraps up a
   live poll — a little "drumroll" beat before the standings reveal. Drawn
   from a persisted shuffle-bag (same idea as the motivation-reel rewards in
   motivation.ts, but standalone — this is a different trigger and a much
   smaller pool, not worth coupling to that unrelated feature).

   Notes on the pool:
   - Prefer clean media.giphy.com/media/<id>/giphy.gif URLs (stable, no auth
     query params that can go stale).
   - Keep files under ~1.2 MB. Multi‑MB originals often finish downloading
     after the drumroll window starts, so browsers only show the first frame
     (looks "frozen") — especially on classroom wifi.
   - Intrinsic pixel sizes here are small (200–500px); the host overlay CSS
     scales them up to fill the screen. */

export const POLL_DRUMROLL_GIFS = [
  // Crowd cheer / celebration
  "https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif",
  // Excited win reaction
  "https://media.giphy.com/media/26u4cqiYI30juCOGY/giphy.gif",
  // Enthusiastic applause
  "https://media.giphy.com/media/7rj2ZgttvgomY/giphy.gif",
  // Dance-y win vibes
  "https://media.giphy.com/media/Is1O1TWV0LEJi/giphy.gif",
  // Minimal celebration wave
  "https://media.giphy.com/media/TXrm00Yl03f68/giphy.gif",
  // Excited reaction
  "https://media.giphy.com/media/oJGqcAvg5stm8/giphy.gif",
  // Crowd go wild
  "https://media.giphy.com/media/p6CUpOGnfE8iQ/giphy.gif",
  // Victory fist / yes
  "https://media.giphy.com/media/YTbZzCkRQCEJa/giphy.gif",
  // Happy celebration
  "https://media.giphy.com/media/111ebonMs90YLu/giphy.gif",
  // Light applause / clap (very small file — always snappy)
  "https://media.giphy.com/media/xT5LMHxhOfscxPfIfm/giphy.gif",
];

const BAG_KEY = "pd_poll_drumroll_bag";

/** Draw the next gif from a persisted shuffle-bag: every gif plays once (in
    random order) before any repeats. */
export function nextPollDrumrollGif(): string {
  let bag: string[] = [];
  try { bag = JSON.parse(localStorage.getItem(BAG_KEY) || "[]"); } catch { /* refill below */ }
  bag = bag.filter((g) => POLL_DRUMROLL_GIFS.includes(g));
  if (bag.length === 0) {
    bag = [...POLL_DRUMROLL_GIFS];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  const gif = bag.pop()!;
  try { localStorage.setItem(BAG_KEY, JSON.stringify(bag)); } catch { /* non-fatal */ }
  return gif;
}

/** Warm the browser cache so the drumroll gif is already local when the host
    hits Finish. Safe to call once when the poll host screen mounts. */
export function prefetchPollDrumrollGifs(): void {
  if (typeof window === "undefined") return;
  for (const url of POLL_DRUMROLL_GIFS) {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  }
}
