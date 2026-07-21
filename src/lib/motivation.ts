/* Motivation rewards — Andrew's saved Instagram "Motivation" collection.
   One is shown at random (shuffle-bag, so no repeats until all have
   played) as a treat for finishing the daily set or an exam-mode set.
   Each entry is the path segment of the post; rendered via Instagram's
   official embed player at https://www.instagram.com/<path>/embed/.
   Curated 2026-07-17: full 77-post collection minus explicitly-religious
   reels and a handful Andrew asked to drop (salsa, Star Wars, piano,
   Manhattan, networking, loneliness-in-medicine, average-conversation). */

export const MOTIVATION_POSTS = [
  "p/Da0qH8LJwTU", "p/DavzhnhOFn4", "p/Dak50A7oEEe", "p/DYFQhTqRCL6",
  "p/DYaR2dFxUkR", "p/DX9qKi1xrvE", "p/DXhje0WEdpX", "p/DXDRmEuiC0o",
  "p/DXGFBXrCGsX", "p/DW9VUYdDQRL", "p/DWgUa2_jGql", "p/DV7T9tDjklQ",
  "p/DWKyF1fCe9A", "p/DWUg1OzDwDM", "p/DU9lEBalIwV", "p/DVYxtsTia1J",
  "p/DV9xBVQj0Sc", "p/DVeXO4fCX0U", "p/DV6z2AXkXLs", "p/DUrrVOSDOaJ",
  "p/DTZlVd2k8_4", "p/DSFnyOCDx3U", "p/DRNiG76kRSC", "p/DRnSpqPDxP4",
  "p/DRlrqqnjnf-", "p/DRRvLeLDk5m", "p/DRhkeitDaNb", "p/DPHFxL8jiSw",
  "p/DQzJXe7kTUj", "p/DKkHb46IoSw", "p/DQkCUS-Efim", "p/DPT9qu7DWun",
  "p/DRDdqcXgeXJ", "p/DQ6_iuTDp12", "p/DPNN7B8jyNP", "p/DJ5BK58TitF",
  "p/DM3vOecyYIe", "p/DQ_p9m1jr2G", "p/DO_n4xOjwzP", "p/DQkWjHpkiuh",
  "p/DNT6Jt5P4oD", "p/DPq4dWijITM", "p/DOlba26jdWC", "p/DOV84o4jD4F",
  "p/DHq78ZCpyfT", "p/DM0OtJjxoaI", "p/DGR6U4XRbf-", "p/DKZ2N01iLFN",
  "p/DIdtdynoPyT", "p/DLDdf30KdYV", "p/DGjhZ8cyw5A", "p/DLkcX6UqzPZ",
  "p/DKERbwsCh-T", "p/DJhH2SvK6BW", "p/DIJm2UnpD1H", "p/DIiMpw2uvsX",
];

/* Funny reels — the saved "Psychiatry" collection (54 posts, re-scraped
   2026-07-17 after the first pass under-counted: IG's saved grid pauses
   lazy-loading, then resumes — wait at the bottom until height stops
   growing across several seconds). */
export const FUNNY_POSTS = [
  "p/DW8qx6eNZ4y", "p/DS-r17riTSO", "p/DQDR_JogWaV", "p/DPmOrptiCkx",
  "p/DNidSBBROEI", "p/DO-SsUvjsQY", "p/DNOOEi4MKU4", "p/C3H6JBOO-SE",
  "p/DEIY6nkIUGz", "p/DLUUk8Ysx7x", "p/DI1u54koPvD", "p/DNVtOdnOyzS",
  "p/DNJSMfIvTD6", "p/DHwCLsIAhTt", "p/DLi6_1LP12X", "p/DHmnLXovxXc",
  "p/DInCY3uAkic", "p/DI05YWZRtQ-", "p/DMwizRtIHYd", "p/DHykklSxGrw",
  "p/DJSM4v2sIje", "p/DIoD1u6qx81", "p/DLuzbLFgqfw", "p/DMVcN2Os2PK",
  "p/DMdk-QkR8C9", "p/DG6PL-LMJfN", "p/DKCyEMxOEcu", "p/DGs-hdqs4cw",
  "p/DHv0zxLxGZG", "p/DMGf4u0TK6f", "p/DMAyoe2AZUm", "p/DHxQ8pyRzJa",
  "p/DIMQAw4J5AV", "p/DCAk-RjOwas", "p/DFTL1dAoj-6", "p/DF066RLx3RO",
  "p/DFyQLugNy1Y", "p/DKjpsiXutPS", "p/DFqLB-uubGu", "p/DGtIxwRob7Y",
  "p/DGzN0jxMzn_", "p/DK8SppfsLBh", "p/CgjezVFAHtc", "p/DKqT0kjspVR",
  "p/DMREwjOPX_1", "p/CupX36bp695", "p/DMDtOGLqRpw", "p/DI7RZCtSnks",
  "p/DJGc4zBR41k", "p/C4kwuEuO64O", "p/C4oCtBnu05a", "p/C6SlfdOMWq7",
  "p/C_xkm87OvGH", "p/DJ7zjv3RCew",
];

/* Trip ideas — the saved "Trip ideas" collection (scraped 2026-07-17). */
export const TRIP_POSTS = [
  "p/DXJR8g7oHap", "p/DZfFq52xYFR", "p/DZAhMhkhkH3", "p/DY6LhesCXlh",
  "p/DXImb7YAPkV", "p/DXCUdXwAL29", "p/DVWXsX9gUud", "p/DUWN-jjEZgH",
  "p/DWAcw5lDoMH", "p/DVORiIzjXiU", "p/DUzaVSODqtb", "p/DUohYV3ka-h",
];

/* Residency memes lifted from the "Graduation 2026" photo album pptx
   (2026-07-18) — meme images only, no personal photos. Served from
   public/memes/; the "meme:" prefix tells the reward sheet to render an
   <img> instead of an Instagram embed. */
export const FUNNY_MEMES = [
  1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, // 3 (Mahajan-note) retired — site no longer exists
].map((n) => `meme:/memes/meme-${String(n).padStart(2, "0")}.jpg`);

export type RewardKind = "motivation" | "funny" | "trip";

const POOLS: Record<RewardKind, { posts: string[]; key: string }> = {
  motivation: { posts: MOTIVATION_POSTS, key: "pd_motivation_bag" },
  funny: { posts: [...FUNNY_POSTS, ...FUNNY_MEMES], key: "pd_funny_bag" },
  trip: { posts: TRIP_POSTS, key: "pd_trip_bag" },
};

/** Draw the next post of a kind from its persisted shuffle-bag: every post
    plays once (in random order) before any repeats. */
export function nextRewardPost(kind: RewardKind): string {
  const { posts, key } = POOLS[kind];
  let bag: string[] = [];
  try { bag = JSON.parse(localStorage.getItem(key) || "[]"); } catch { /* refill below */ }
  // drop anything no longer in the collection (lists may be edited over time)
  bag = bag.filter((p) => posts.includes(p));
  if (bag.length === 0) {
    bag = [...posts];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  const post = bag.pop()!;
  try { localStorage.setItem(key, JSON.stringify(bag)); } catch { /* non-fatal */ }
  return post;
}
