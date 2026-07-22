/* A quick, fun gif shown for a couple seconds right as the host wraps up a
   live poll — a little "drumroll" beat before the standings reveal. Drawn
   from a persisted shuffle-bag (same idea as the motivation-reel rewards in
   motivation.ts, but standalone — this is a different trigger and a much
   smaller pool, not worth coupling to that unrelated feature). */

export const POLL_DRUMROLL_GIFS = [
  "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExOGJ0OGRrYXJhbjNtZ2RreGRxbnVtYmJuZXo3bGlid214OXY5N2lyYSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/13hxeOYjoTWtK8/giphy.gif",
  "https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExNGN6aTVuNHhiNWZvbnEwNDByZ2dzbDNmOTV5ZTA2OXYzMno0eDdxMCZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/p6CUpOGnfE8iQ/giphy.gif",
  "https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExNWJmbzJ4b2hydHJvbTdqd280cjZ4Z3o1ZmViZzhpeHJoYmZsZGJtbSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/TXrm00Yl03f68/giphy.gif",
  "https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3YTFwdzdrZG9hNG05aWRtdHZsNTlnZWxyNGU3NDVvY3d4bWI4NHkxZCZlcD12MV9naWZzX3JlbGF0ZWQmY3Q9Zw/l4FAZbzUPwnUBJsEU/giphy.gif",
  "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExOTZkY2xxbXg5bmZ3a283MGgycWJ3bGI1dDZsbGEzZXhqdTFheDkxcyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/oJGqcAvg5stm8/giphy.gif",
  // A few more people-celebrating gifs (each verified to load as image/gif):
  "https://media.giphy.com/media/g9582DNuQppxC/giphy.gif",      // DiCaprio raising a glass / cheers
  "https://media.giphy.com/media/7rj2ZgttvgomY/giphy.gif",      // enthusiastic applause
  "https://media.giphy.com/media/l3q2XhfQ8oCkm1Ts4/giphy.gif",  // standing ovation
  "https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif", // confetti + cheering crowd
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
