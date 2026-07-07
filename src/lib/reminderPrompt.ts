// Local, per-browser tracking of the "turn on daily reminders" nudge.
// Three total nudges — on the 2nd day of use, again at 2 weeks, again at
// 4 weeks — then never again, regardless of whether the user opted in.
// Kept off the database like streaks.ts: it's a UI nag, not graded data.

const key = (uid: string) => `pd_reminder_prompt_stage_${uid || "anon"}`;

function shownStage(uid: string): number {
  try { return parseInt(localStorage.getItem(key(uid)) || "0", 10) || 0; } catch { return 0; }
}

export function markReminderPromptShown(uid: string, stage: number) {
  try { localStorage.setItem(key(uid), String(stage)); } catch { /* no-op */ }
}

/** Which stage (1, 2, or 3) is due right now, given total days used — or null
    if none is due yet, or the highest stage has already been shown. */
export function dueReminderPromptStage(uid: string, daysUsed: number): 1 | 2 | 3 | null {
  const shown = shownStage(uid);
  const target = daysUsed >= 28 ? 3 : daysUsed >= 14 ? 2 : daysUsed >= 2 ? 1 : 0;
  return target > shown && target > 0 ? (target as 1 | 2 | 3) : null;
}
