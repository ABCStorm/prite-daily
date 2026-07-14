/** Classic SM-2 (SuperMemo-2) spaced-repetition scheduling — the algorithm
    behind Anki's core scheduler. Pure functions only; Supabase I/O lives in db.ts. */

export type SrsGrade = "again" | "hard" | "good" | "easy";

export const SRS_GRADES: { grade: SrsGrade; label: string }[] = [
  { grade: "again", label: "Again" },
  { grade: "hard", label: "Hard" },
  { grade: "good", label: "Good" },
  { grade: "easy", label: "Easy" },
];

// SM-2's quality scale is 0-5; "again" is a fail (resets the card), the other
// three are passing grades of increasing confidence.
const GRADE_QUALITY: Record<SrsGrade, number> = { again: 0, hard: 3, good: 4, easy: 5 };

export type SrsState = { ease_factor: number; interval_days: number; repetitions: number };

export const SRS_DEFAULT: SrsState = { ease_factor: 2.5, interval_days: 0, repetitions: 0 };

// Per-grade interval multipliers once a card is past its first successful
// review — plain SM-2 ignores the grade here (day 1 → 1, day 2 → 6 for every
// passing grade, ease factor only kicks in from rep 3 on), which makes Hard/
// Good/Easy look identical for a while. Weighting growth by grade instead
// keeps the three passing grades visibly different at every step, not just
// eventually.
const GROWTH_MULT: Record<"hard" | "good" | "easy", (ease: number) => number> = {
  hard: () => 1.2,
  good: (ease) => ease,
  easy: (ease) => ease * 1.3,
};

/** Given the card's current scheduling state and a grade, return its next
    state (new ease factor, interval in days, repetition count). Interval is
    rounded to a whole day; minimum ease factor is clamped at 1.3 per SM-2. */
export function sm2Next(prev: SrsState, grade: SrsGrade): SrsState {
  const q = GRADE_QUALITY[grade];
  let ease = prev.ease_factor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ease < 1.3) ease = 1.3;

  if (grade === "again") {
    // Failed: reset the learning streak, resurface tomorrow.
    return { ease_factor: ease, interval_days: 1, repetitions: 0 };
  }

  const repetitions = prev.repetitions + 1;
  let interval: number;
  if (prev.repetitions === 0) {
    // First time this card graduates out of "new" — fixed starter intervals
    // so the three passing grades feel meaningfully different immediately.
    interval = grade === "hard" ? 3 : grade === "good" ? 5 : 10; // easy
  } else {
    interval = Math.max(prev.interval_days + 1, Math.round(prev.interval_days * GROWTH_MULT[grade](ease)));
  }
  return { ease_factor: ease, interval_days: interval, repetitions };
}

/** Human-friendly "next review in ~Xd" label for a grade button preview. */
export function intervalLabel(days: number): string {
  if (days < 1) return "<1d";
  if (days === 1) return "1d";
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}
