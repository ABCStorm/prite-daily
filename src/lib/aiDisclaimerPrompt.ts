// Local, per-browser tracking of the "AI-generated explanations" caution
// notice. Shown twice within the first week of use — once on day 1, again
// around day 4 — then never again. Kept off the database like streaks.ts /
// reminderPrompt.ts: it's a UI notice, not graded data.

import { schedulePrefsPush } from "./prefsSync";

const key = (uid: string) => `pd_ai_disclaimer_stage_${uid || "anon"}`;

function shownStage(uid: string): number {
  try { return parseInt(localStorage.getItem(key(uid)) || "0", 10) || 0; } catch { return 0; }
}

export function markAiDisclaimerShown(uid: string, stage: number) {
  try { localStorage.setItem(key(uid), String(stage)); schedulePrefsPush(); } catch { /* no-op */ }
}

/** Which stage (1 or 2) is due right now, given total days used — or null if
    none is due yet, or both have already been shown. */
export function dueAiDisclaimerStage(uid: string, daysUsed: number): 1 | 2 | null {
  const shown = shownStage(uid);
  const target = daysUsed >= 4 ? 2 : daysUsed >= 1 ? 1 : 0;
  return target > shown && target > 0 ? (target as 1 | 2) : null;
}
