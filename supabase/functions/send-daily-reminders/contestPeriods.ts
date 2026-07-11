// Discrete (non-overlapping) 2-week "who did the most questions" contest
// periods, tiling backward every 14 days from a fixed Oct 7 cutoff — pinned
// to that calendar date on its own, independent of reminderWindow.ts's
// guessed exam date (they can diverge; nothing here assumes an ordering
// between the two). Periods pause for a fixed GAP_DAYS-day window right after
// each Oct 7 cutoff — individual exam-week cram time, not a competition —
// then resume for the next admissions cycle.

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS = 14;
const GAP_DAYS = 8;

function ymd(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Local-calendar-component arithmetic only (no epoch round-trips), so this is
// immune to the UTC/local mismatch that a `new Date(n * DAY_MS)` reconstruction
// would introduce — mirrors streaks.ts's shiftDay.
function shiftDay(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return ymd(new Date(y, m - 1, d + delta));
}

// Whole days from `fromYmd` to `toYmd` (positive if `toYmd` is later). Safe as
// a *duration* even with local-midnight Date objects (same technique already
// used by reminderWindow.ts's daysUntilExam).
function daysBetween(fromYmd: string, toYmd: string): number {
  const a = new Date(fromYmd + "T00:00:00");
  const b = new Date(toYmd + "T00:00:00");
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/** The Oct 7 cutoff that `d`'s current/upcoming season ends on — this year's
    if `d` is on or before it, else next year's. */
function nextCutoff(d: string): string {
  const [y] = d.split("-").map(Number);
  const oct7 = `${y}-10-07`;
  return d <= oct7 ? oct7 : `${y + 1}-10-07`;
}

/** The Oct 7 cutoff `d` most recently passed (or is on) — this year's if `d`
    is on or after it, else last year's. */
function prevCutoff(d: string): string {
  const [y] = d.split("-").map(Number);
  const oct7 = `${y}-10-07`;
  return d >= oct7 ? oct7 : `${y - 1}-10-07`;
}

/** Is `d` inside the post-cutoff blackout (the GAP_DAYS days right after an
    Oct 7 cutoff, before the next season's periods start)? */
function isInGap(d: string): boolean {
  const diff = daysBetween(prevCutoff(d), d);
  return diff >= 1 && diff <= GAP_DAYS;
}

export type Period = { start: string; end: string };

/** The 2-week period containing calendar date `d`, or null if `d` falls in
    the post-cutoff blackout. Always ends exactly on a season's Oct 7 cutoff,
    by construction. */
function periodForDate(d: string): Period | null {
  if (isInGap(d)) return null;
  const anchorEnd = nextCutoff(d);
  const diff = daysBetween(d, anchorEnd);
  const k = Math.floor(diff / PERIOD_DAYS);
  const end = shiftDay(anchorEnd, -PERIOD_DAYS * k);
  return { start: shiftDay(end, -(PERIOD_DAYS - 1)), end };
}

/** The 2-week period containing `today`, or null during the post-cutoff
    blackout (no contest running right now). */
export function currentContestPeriod(today: Date = new Date()): Period | null {
  return periodForDate(ymd(today));
}

/** The just-completed period, if `today` is exactly the day after a period
    boundary (so the winner announcement fires once, the morning after each
    period ends) — otherwise null. */
export function periodEndingYesterday(today: Date = new Date()): Period | null {
  const yesterday = shiftDay(ymd(today), -1);
  const p = periodForDate(yesterday);
  return p && p.end === yesterday ? p : null;
}
