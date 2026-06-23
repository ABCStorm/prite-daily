// Lightweight, client-side streak tracking (localStorage, per user).
//
// We deliberately keep this off the database: it's a gamification reward, not
// graded data, and storing it locally avoids a schema migration. Streaks are
// per-browser as a result — a known, acceptable trade-off. Two independent
// streaks are tracked:
//   - "login":      calendar days the user opened the app
//   - "completion": calendar days the user hit their daily question target
//
// A streak is the number of consecutive calendar days (ending today, or
// yesterday if today isn't recorded yet) present in the stored set.

export type StreakKind = "login" | "completion";

export type StreakResult = {
  /** Current consecutive-day streak (>= 1 once today is recorded). */
  streak: number;
  /** Longest streak ever recorded for this kind. */
  longest: number;
  /** True if today had not been recorded before this call. */
  isNew: boolean;
};

const keyFor = (uid: string, kind: StreakKind) => `pd_${kind}_days_${uid || "anon"}`;

/** Local YYYY-MM-DD (matches isSameDay's local-time semantics in App.tsx). */
export function ymd(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function load(uid: string, kind: StreakKind): string[] {
  try {
    const raw = localStorage.getItem(keyFor(uid, kind));
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? (arr as string[]).filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function save(uid: string, kind: StreakKind, days: string[]) {
  try {
    // Keep the list bounded so it can't grow without limit.
    const trimmed = days.slice(-400);
    localStorage.setItem(keyFor(uid, kind), JSON.stringify(trimmed));
  } catch {
    /* storage full / unavailable — streaks are best-effort */
  }
}

function shiftDay(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return ymd(new Date(y, m - 1, d + delta));
}

/** Consecutive days ending today (or yesterday, if today isn't present). */
export function currentStreak(days: string[]): number {
  const set = new Set(days);
  let cursor = ymd();
  if (!set.has(cursor)) cursor = shiftDay(cursor, -1); // grace day: not lapsed yet
  let n = 0;
  while (set.has(cursor)) {
    n++;
    cursor = shiftDay(cursor, -1);
  }
  return n;
}

/** Longest run of consecutive days ever recorded. */
export function longestStreak(days: string[]): number {
  const sorted = Array.from(new Set(days)).sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of sorted) {
    run = prev && shiftDay(prev, 1) === day ? run + 1 : 1;
    if (run > best) best = run;
    prev = day;
  }
  return best;
}

/** Read current streak without recording anything. */
export function peekStreak(uid: string, kind: StreakKind): number {
  return currentStreak(load(uid, kind));
}

/** Record today for `kind` and return the resulting streak info. */
export function recordToday(uid: string, kind: StreakKind): StreakResult {
  const today = ymd();
  const days = load(uid, kind);
  const isNew = !days.includes(today);
  if (isNew) {
    days.push(today);
    save(uid, kind, days);
  }
  return { streak: currentStreak(days), longest: longestStreak(days), isNew };
}
