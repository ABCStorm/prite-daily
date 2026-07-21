/* Cross-device sync for the handful of things that historically lived only in
   localStorage: streak day-lists, exam-mode/timer prefs, one-time-nag stages,
   seen-study-guide badges, the web-flashcards note dismissal, and the last
   self-picked poll team.

   Design: localStorage stays the source the UI reads synchronously (all the
   existing keys and formats are unchanged), and a single jsonb blob on the
   user's settings row (settings.client_prefs, migration 0035) mirrors it.
   On sign-in, `syncClientPrefs` merges the server blob into localStorage with
   loss-proof rules — day/seen lists union, nag stages take the max, booleans
   OR, scalars prefer the server copy — then pushes the merged result back if
   it differs. After that, every local write calls `schedulePrefsPush()`, which
   debounces a snapshot upload. Last-write-wins per blob is fine for prefs;
   the union/max merges are what protect streaks from ever going backwards. */

import { supabase } from "./supabase";

const PUSH_DEBOUNCE_MS = 1500;

// The signed-in user the blob belongs to; set by syncClientPrefs so later
// schedulePrefsPush() calls (from anywhere in the app) don't need the uid.
let activeUid: string | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

type Blob = {
  login_days: string[];
  completion_days: string[];
  reminder_prompt_stage: number;
  ai_disclaimer_stage: number;
  seen_study_guides: string[];
  webcards_note_dismissed: boolean;
  exam_mode?: boolean;
  timer_on?: boolean;
  timer_secs?: number;
  poll_team?: string;
  reward_shown_day?: string; // local YYYY-MM-DD the daily-completion reward was last shown (so revisits that day don't replay it)
};

/* --- localStorage accessors, matching each key's historical format --- */

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch { return fallback; }
}
function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* best-effort */ }
}
function readInt(key: string): number {
  try { return parseInt(localStorage.getItem(key) || "0", 10) || 0; } catch { return 0; }
}
function readStr(key: string): string {
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
}

/** Snapshot the current localStorage state as a sync blob. */
function snapshot(uid: string): Blob {
  return {
    login_days: strList(readJson(`pd_login_days_${uid}`, [])),
    completion_days: strList(readJson(`pd_completion_days_${uid}`, [])),
    reminder_prompt_stage: readInt(`pd_reminder_prompt_stage_${uid}`),
    ai_disclaimer_stage: readInt(`pd_ai_disclaimer_stage_${uid}`),
    seen_study_guides: strList(readJson("pd_seen_study_guides", [])),
    webcards_note_dismissed: readJson<boolean>("pd_webcards_note_dismissed", false) === true,
    exam_mode: readJson<boolean>("pd_exam_mode", false) === true,
    timer_on: readJson<boolean>("pd_timer_on", false) === true,
    timer_secs: Number(readJson("pd_timer_secs", 60)) || 60,
    poll_team: readStr("prite_poll_team"),
    reward_shown_day: readStr("pd_reward_shown_day"),
  };
}

const unionDays = (a: string[], b: string[]) => [...new Set([...a, ...b])].sort().slice(-400);

/** Merge the server blob into localStorage (loss-proof rules) and push the
    merged result back to the server if anything differs. Call once per
    sign-in, after the settings row loads. */
export function syncClientPrefs(uid: string, remoteRaw: Record<string, unknown> | null | undefined) {
  activeUid = uid;
  const r = (remoteRaw ?? {}) as Partial<Blob>;
  const l = snapshot(uid);

  const merged: Blob = {
    login_days: unionDays(l.login_days, strList(r.login_days)),
    completion_days: unionDays(l.completion_days, strList(r.completion_days)),
    reminder_prompt_stage: Math.max(l.reminder_prompt_stage, Number(r.reminder_prompt_stage) || 0),
    ai_disclaimer_stage: Math.max(l.ai_disclaimer_stage, Number(r.ai_disclaimer_stage) || 0),
    seen_study_guides: [...new Set([...l.seen_study_guides, ...strList(r.seen_study_guides)])].slice(-200),
    webcards_note_dismissed: l.webcards_note_dismissed || r.webcards_note_dismissed === true,
    exam_mode: typeof r.exam_mode === "boolean" ? r.exam_mode : l.exam_mode,
    timer_on: typeof r.timer_on === "boolean" ? r.timer_on : l.timer_on,
    timer_secs: typeof r.timer_secs === "number" && r.timer_secs > 0 ? r.timer_secs : l.timer_secs,
    poll_team: typeof r.poll_team === "string" && r.poll_team ? r.poll_team : l.poll_team,
    // ISO-style dates compare lexicographically — keep whichever device showed it later
    reward_shown_day: [l.reward_shown_day ?? "", typeof r.reward_shown_day === "string" ? r.reward_shown_day : ""].sort().pop() || "",
  };

  // write the merged state back into the exact keys/formats the UI reads
  writeJson(`pd_login_days_${uid}`, merged.login_days);
  writeJson(`pd_completion_days_${uid}`, merged.completion_days);
  try {
    if (merged.reminder_prompt_stage) localStorage.setItem(`pd_reminder_prompt_stage_${uid}`, String(merged.reminder_prompt_stage));
    if (merged.ai_disclaimer_stage) localStorage.setItem(`pd_ai_disclaimer_stage_${uid}`, String(merged.ai_disclaimer_stage));
    if (merged.poll_team) localStorage.setItem("prite_poll_team", merged.poll_team);
    if (merged.reward_shown_day) localStorage.setItem("pd_reward_shown_day", merged.reward_shown_day);
  } catch { /* best-effort */ }
  writeJson("pd_seen_study_guides", merged.seen_study_guides);
  writeJson("pd_webcards_note_dismissed", merged.webcards_note_dismissed);
  writeJson("pd_exam_mode", merged.exam_mode);
  writeJson("pd_timer_on", merged.timer_on);
  writeJson("pd_timer_secs", merged.timer_secs);

  // one small write per sign-in keeps the server copy honest (and covers the
  // first-ever sync, where the server blob is empty)
  void pushNow();
  return merged;
}

async function pushNow() {
  if (!supabase || !activeUid) return;
  const blob = snapshot(activeUid);
  const { error } = await supabase.from("settings").update({ client_prefs: blob }).eq("user_id", activeUid);
  if (error) console.warn("prefsSync push", error.message);
}

/** Debounced "mirror my localStorage prefs to the account" — call after any
    write to a synced key. No-op until syncClientPrefs has run this session. */
export function schedulePrefsPush() {
  if (!supabase || !activeUid) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = null; void pushNow(); }, PUSH_DEBOUNCE_MS);
}
