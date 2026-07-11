// Discrete (non-overlapping) 2-week "who did the most questions" contest
// periods, tiling backward every 14 days from a fixed cutoff — the same
// guessed-exam-date logic as reminderWindow.ts, 8 days earlier (Oct 7 in
// whichever year guessedExamDate() resolves its Oct 15 to). No periods run
// after that cutoff — the final stretch before the real exam is left as
// individual cram time, not a competition.
import { guessedExamDate } from "./reminderWindow.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIOD_DAYS = 14;

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

/** The last day any contest period can end — Oct 7 of the same year as the
    guessed Oct 15 exam date (so it tracks the same admissions cycle). */
function contestAnchorEnd(today: Date): string {
  const [y] = guessedExamDate(today).split("-").map(Number);
  return `${y}-10-07`;
}

export type Period = { start: string; end: string };

/** The 2-week period containing `today`, or null once the contest season is
    over (today is after the final cutoff). */
export function currentContestPeriod(today: Date = new Date()): Period | null {
  const anchorEnd = contestAnchorEnd(today);
  const diff = daysBetween(ymd(today), anchorEnd); // anchorEnd - today, in days
  if (diff < 0) return null;
  const k = Math.floor(diff / PERIOD_DAYS);
  const end = shiftDay(anchorEnd, -PERIOD_DAYS * k);
  return { start: shiftDay(end, -(PERIOD_DAYS - 1)), end };
}

/** The just-completed period, if `today` is exactly the day after a period
    boundary (so the winner announcement fires once, the morning after each
    period ends) — otherwise null. */
export function periodEndingYesterday(today: Date = new Date()): Period | null {
  const anchorEnd = contestAnchorEnd(today);
  const diff = daysBetween(ymd(today), shiftDay(anchorEnd, 1)); // (anchorEnd+1) - today
  if (diff < 0 || diff % PERIOD_DAYS !== 0) return null;
  const end = shiftDay(ymd(today), -1);
  return { start: shiftDay(end, -(PERIOD_DAYS - 1)), end };
}
