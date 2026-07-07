// Deno copy of src/lib/reminderWindow.ts — keep both in sync if this changes.
// Auto mode (settings.daily_reminder = null) is on for the 90 days leading up
// to the exam date, off after — using a guessed Oct 15 if unset.

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 90;

function ymd(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function guessedExamDate(today: Date = new Date()): string {
  const oct15ThisYear = new Date(today.getFullYear(), 9, 15);
  const target = ymd(today) <= ymd(oct15ThisYear) ? oct15ThisYear : new Date(today.getFullYear() + 1, 9, 15);
  return ymd(target);
}

export function isAutoReminderActive(examDate: string | null, today: Date = new Date()): boolean {
  const exam = new Date((examDate || guessedExamDate(today)) + "T00:00:00");
  const start = new Date(exam.getTime() - WINDOW_DAYS * DAY_MS);
  const t = new Date(ymd(today) + "T00:00:00");
  return t >= start && t <= exam;
}
