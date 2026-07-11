// Shared "auto" reminder-window logic (also duplicated, Deno-side, in
// supabase/functions/send-daily-reminders/reminderWindow.ts — keep both in
// sync if this changes). Auto mode is on for the 90 days leading up to the
// exam date, off after — using a guessed Oct 15 exam date if the user hasn't
// set a real one.

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 90;

function ymd(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The next Oct 15 on or after `today` (this year's, or next year's if it already passed).
    Compares calendar dates, not full timestamps — `today`'s time-of-day must
    not push it past Oct 15 on Oct 15 itself. */
export function guessedExamDate(today: Date = new Date()): string {
  const oct15ThisYear = new Date(today.getFullYear(), 9, 15);
  const target = ymd(today) <= ymd(oct15ThisYear) ? oct15ThisYear : new Date(today.getFullYear() + 1, 9, 15);
  return ymd(target);
}

/** Is today within [examDate - 90 days, examDate]? Falls back to a guessed
    Oct 15 if `examDate` is unset. */
export function isAutoReminderActive(examDate: string | null, today: Date = new Date()): boolean {
  const exam = new Date((examDate || guessedExamDate(today)) + "T00:00:00");
  const start = new Date(exam.getTime() - WINDOW_DAYS * DAY_MS);
  const t = new Date(ymd(today) + "T00:00:00");
  return t >= start && t <= exam;
}

/** The real exam date if set, else the guessed Oct 15. */
export function resolvedExamDate(examDate: string | null, today: Date = new Date()): string {
  return examDate || guessedExamDate(today);
}

/** Whole calendar days from today to the (real or guessed) exam date. Can be
    negative if the exam date has already passed. */
export function daysUntilExam(examDate: string | null, today: Date = new Date()): number {
  const exam = new Date(resolvedExamDate(examDate, today) + "T00:00:00");
  const t = new Date(ymd(today) + "T00:00:00");
  return Math.round((exam.getTime() - t.getTime()) / DAY_MS);
}
