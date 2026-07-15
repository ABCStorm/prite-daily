import { supabase } from "./supabase";
import type { TeamStanding } from "./poll";
import { sm2Next, SRS_DEFAULT, type SrsGrade, type SrsState } from "./srs";

/* Typed data access over the Supabase tables + RPCs. Every function is a no-op
   (returns null / []) when Supabase isn't configured, so callers don't have to
   branch. RLS on the server enforces that users only touch their own rows. */

/** Load the question bank. When Supabase is configured it streams from a PRIVATE
    Storage bucket (`bank/questions.json.gz`) that only approved members can read,
    so the bank is never exposed to anonymous visitors. The object is gzipped to
    keep egress down; we inflate it in the browser. Falls back to the bundled
    static file only in local-only mode (no backend keys). */
export async function loadQuestionBank(): Promise<unknown[]> {
  if (supabase) {
    const { data, error } = await supabase.storage.from("bank").download("questions.json.gz");
    if (error || !data) throw new Error(error?.message ?? "Couldn’t load the question bank");
    const inflated = data.stream().pipeThrough(new DecompressionStream("gzip"));
    const text = await new Response(inflated).text();
    return JSON.parse(text);
  }
  const r = await fetch("/data/questions.json");
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: "resident" | "faculty" | "alumni" | "admin";
  status: "pending" | "approved" | "blocked";
  training_level: string | null;
};

export async function setTrainingLevel(level: string): Promise<void> {
  if (!supabase) return;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from("profiles").update({ training_level: level }).eq("id", u.user.id);
}

export type Settings = {
  user_id: string;
  regimen: 5 | 10 | 20;
  recycle_missed: boolean;
  recycle_after_days: number;
  review_per_day: number;
  exam_date: string | null;
  /** null = auto-managed (on in the 90 days before the exam date, off after);
      true/false = the user explicitly overrode it. */
  daily_reminder: boolean | null;
  reminder_every_days: number;
};

export type AnswerRow = {
  user_id: string;
  question_id: string;
  picked: string[];
  correct: boolean;
  first_correct: boolean;
  attempts: number;
  updated_at: string;
  cleared?: boolean; // dismissed from the "learning opportunities" list (history kept)
};

export type GroupNote = {
  id: string;
  question_id: string;
  author_id: string;
  text: string;
  created_at: string;
  author?: { full_name: string | null; email: string; role: string } | null;
};

export async function getMyProfile(): Promise<Profile | null> {
  if (!supabase) return null;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
  if (error) { console.warn("getMyProfile", error.message); return null; }
  return data as Profile | null;
}

export async function getMySettings(): Promise<Settings | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("settings").select("*").maybeSingle();
  return (data as Settings) ?? null;
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  if (!supabase) return;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from("settings").update(patch).eq("user_id", u.user.id);
}

/** All of my answers, as a map keyed by question_id (for fast lookup). */
export async function getMyAnswers(): Promise<Record<string, AnswerRow>> {
  if (!supabase) return {};
  const { data, error } = await supabase.from("answers").select("*");
  if (error) { console.warn("getMyAnswers", error.message); return {}; }
  const map: Record<string, AnswerRow> = {};
  for (const r of (data ?? []) as AnswerRow[]) map[r.question_id] = r;
  return map;
}

/** Upsert an answer; tracks attempts and first-attempt correctness. */
export async function saveAnswer(
  questionId: string,
  picked: string[],
  correct: boolean
): Promise<AnswerRow | null> {
  if (!supabase) return null;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const uid = u.user.id;
  const { data: existing } = await supabase
    .from("answers").select("attempts, first_correct")
    .eq("user_id", uid).eq("question_id", questionId).maybeSingle();
  const row = {
    user_id: uid,
    question_id: questionId,
    picked,
    correct,
    first_correct: existing ? existing.first_correct : correct,
    attempts: existing ? existing.attempts + 1 : 1,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("answers").upsert(row, { onConflict: "user_id,question_id" }).select().maybeSingle();
  if (error) { console.warn("saveAnswer", error.message); return null; }
  return data as AnswerRow;
}

/** Clear my "learning opportunities" — flag every missed answer (correct = false)
    as cleared so it drops off the review list. History/stats are kept; the rows
    stay, just marked `cleared`. Returns how many were flagged. */
export async function clearMissedAnswers(): Promise<number> {
  if (!supabase) return 0;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return 0;
  const { data, error } = await supabase
    .from("answers").update({ cleared: true })
    .eq("user_id", u.user.id).eq("correct", false).eq("cleared", false)
    .select("question_id");
  if (error) { console.warn("clearMissedAnswers", error.message); return 0; }
  return (data ?? []).length;
}

/* --- bug / issue reports --- */
export type BugReport = {
  id: string;
  reporter_id: string | null;
  question_id: string | null;
  kind: string;
  message: string;
  context: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  reporter?: { full_name: string | null; email: string } | null;
};

/** File a bug/issue report (as the current user). Returns true on success. */
export async function submitBugReport(r: {
  question_id?: string | null; kind: string; message: string; context?: string | null;
}): Promise<boolean> {
  if (!supabase) return false;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return false;
  const { error } = await supabase.from("bug_reports").insert({
    reporter_id: u.user.id,
    question_id: r.question_id ?? null,
    kind: r.kind,
    message: r.message,
    context: r.context ?? null,
  });
  if (error) { console.warn("submitBugReport", error.message); return false; }
  return true;
}

/** All reports, newest first (admins see everyone's; others see only their own). */
export async function listBugReports(): Promise<BugReport[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("bug_reports")
    .select("*, reporter:profiles(full_name, email)")
    .order("created_at", { ascending: false });
  if (error) { console.warn("listBugReports", error.message); return []; }
  return (data ?? []) as BugReport[];
}

/** Admin: change a report's status (open | resolved | dismissed). */
export async function updateBugReport(id: string, status: string): Promise<void> {
  if (!supabase) return;
  await supabase.from("bug_reports")
    .update({ status, resolved_at: status === "open" ? null : new Date().toISOString() })
    .eq("id", id);
}

/* --- stable (season-long) poll teams --- */

/** profile_id -> team name, for the fixed roster that stays the same across
    every poll session until an admin regenerates it (see lib/poll.ts). */
export async function getStableTeams(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data, error } = await supabase.from("stable_teams").select("profile_id, team_name");
  if (error) { console.warn("getStableTeams", error.message); return {}; }
  const out: Record<string, string> = {};
  for (const row of data ?? []) out[row.profile_id as string] = row.team_name as string;
  return out;
}

/** Admin: wipe and replace the whole stable-team roster in one transaction
    (via an RPC so a failure can't leave it half-deleted). */
export async function regenerateStableTeams(assignments: Record<string, string>): Promise<boolean> {
  if (!supabase) return false;
  const rows = Object.entries(assignments).map(([profile_id, team_name]) => ({ profile_id, team_name }));
  const { error } = await supabase.rpc("regenerate_stable_teams", { rows });
  if (error) { console.warn("regenerateStableTeams", error.message); return false; }
  return true;
}

/** Per-question vote breakdown, snapshotted when a presenter marks a live
    poll session as an official class review. */
export type QuestionStat = {
  qid: string; year: string; q_index: number; stem: string;
  correct: string[]; counts: Record<string, number>; totalVotes: number; wrongVotes: number;
};
export type OfficialPollResult = {
  id: string;
  submitted_by: string | null;
  submitted_at: string;
  poll_code: string;
  total_questions: number;
  total_participants: number;
  standings: TeamStanding[];
  question_stats: QuestionStat[];
  submitter?: { full_name: string | null; email: string } | null;
};

/** File a completed live-poll session as an official class review (as the current user). */
export async function submitOfficialPollResults(r: {
  poll_code: string; total_questions: number; total_participants: number;
  standings: TeamStanding[]; question_stats: QuestionStat[];
}): Promise<boolean> {
  if (!supabase) return false;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return false;
  const { error } = await supabase.from("official_poll_results").insert({
    submitted_by: u.user.id,
    poll_code: r.poll_code,
    total_questions: r.total_questions,
    total_participants: r.total_participants,
    standings: r.standings,
    question_stats: r.question_stats,
  });
  if (error) { console.warn("submitOfficialPollResults", error.message); return false; }
  return true;
}

/** Admin: every submitted official session, newest first. */
export async function listOfficialPollResults(): Promise<OfficialPollResult[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("official_poll_results")
    .select("*, submitter:profiles(full_name, email)")
    .order("submitted_at", { ascending: false });
  if (error) { console.warn("listOfficialPollResults", error.message); return []; }
  return (data ?? []) as OfficialPollResult[];
}

/** Admin: permanently delete every submitted official session (e.g. once a
    year's PRITE review sessions are done and downloaded). */
export async function clearOfficialPollResults(): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from("official_poll_results")
    .delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) { console.warn("clearOfficialPollResults", error.message); return false; }
  return true;
}

/** Record one revealed live-poll question as answered (as the current user).
    Fire-and-forget from the participant's phone — no UI depends on the result. */
export async function recordPollAnswer(r: {
  question_id: string; poll_code: string; team?: string | null; choice: string; correct: boolean;
}): Promise<void> {
  if (!supabase) return;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  const { error } = await supabase.from("poll_answers").insert({
    user_id: u.user.id,
    question_id: r.question_id,
    poll_code: r.poll_code,
    team: r.team ?? null,
    choice: r.choice,
    correct: r.correct,
  });
  if (error) console.warn("recordPollAnswer", error.message);
}

/** One past live-poll session's personal score, grouped by poll_code. */
export type PollSessionStat = { poll_code: string; date: string; team: string | null; total: number; correct: number };
export type PollStats = { totalAnswers: number; correct: number; pctCorrect: number; sessions: PollSessionStat[] };

/** The current user's own live-poll history — separate from solo-practice
    `answers`, so it doesn't feed mastery tracking / spaced repetition. */
export async function getMyPollStats(): Promise<PollStats> {
  const empty: PollStats = { totalAnswers: 0, correct: 0, pctCorrect: 0, sessions: [] };
  if (!supabase) return empty;
  const { data, error } = await supabase
    .from("poll_answers")
    .select("poll_code, team, correct, created_at")
    .order("created_at", { ascending: false });
  if (error || !data) { console.warn("getMyPollStats", error?.message); return empty; }
  const byCode = new Map<string, PollSessionStat>();
  for (const row of data as { poll_code: string; team: string | null; correct: boolean; created_at: string }[]) {
    let g = byCode.get(row.poll_code);
    if (!g) { g = { poll_code: row.poll_code, date: row.created_at, team: row.team, total: 0, correct: 0 }; byCode.set(row.poll_code, g); }
    g.total++;
    if (row.correct) g.correct++;
  }
  const totalAnswers = data.length;
  const correct = data.filter((r) => r.correct).length;
  return {
    totalAnswers, correct,
    pctCorrect: totalAnswers ? Math.round((100 * correct) / totalAnswers) : 0,
    sessions: [...byCode.values()],
  };
}

export async function getMyNote(questionId: string): Promise<string> {
  if (!supabase) return "";
  const { data } = await supabase
    .from("individual_notes").select("text").eq("question_id", questionId).maybeSingle();
  return data?.text ?? "";
}

export async function saveMyNote(questionId: string, text: string): Promise<void> {
  if (!supabase) return;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  if (text.trim()) {
    await supabase.from("individual_notes").upsert(
      { user_id: u.user.id, question_id: questionId, text, updated_at: new Date().toISOString() },
      { onConflict: "user_id,question_id" }
    );
  } else {
    await supabase.from("individual_notes").delete().eq("user_id", u.user.id).eq("question_id", questionId);
  }
}

/* --- highlights (private, per user + question) --- */
export type HlRange = { field: string; start: number; end: number };

export async function getMyHighlights(questionId: string): Promise<HlRange[]> {
  if (!supabase) return [];
  const { data } = await supabase
    .from("highlights").select("ranges").eq("question_id", questionId).maybeSingle();
  return (data?.ranges as HlRange[]) ?? [];
}

export async function saveMyHighlights(questionId: string, ranges: HlRange[]): Promise<void> {
  if (!supabase) return;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  if (ranges.length) {
    await supabase.from("highlights").upsert(
      { user_id: u.user.id, question_id: questionId, ranges, updated_at: new Date().toISOString() },
      { onConflict: "user_id,question_id" }
    );
  } else {
    await supabase.from("highlights").delete().eq("user_id", u.user.id).eq("question_id", questionId);
  }
}

/* --- historical context (shared canonical cache, read-only for members) --- */
export async function getQuestionContext(questionId: string): Promise<string> {
  if (!supabase) return "";
  const { data } = await supabase
    .from("question_context").select("context").eq("question_id", questionId).maybeSingle();
  return data?.context ?? "";
}

/** Every individual note I've written, keyed by question_id (for export). */
export async function getAllMyNotes(): Promise<{ question_id: string; text: string }[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("individual_notes").select("question_id, text").order("question_id");
  if (error) { console.warn("getAllMyNotes", error.message); return []; }
  return (data ?? []) as { question_id: string; text: string }[];
}

/** Every group note across all questions (approved members can read), for export. */
export async function getAllGroupNotes(): Promise<GroupNote[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("group_notes")
    .select("*, author:profiles(full_name, email, role)")
    .order("question_id", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) { console.warn("getAllGroupNotes", error.message); return []; }
  return (data ?? []) as GroupNote[];
}

export async function getGroupNotes(questionId: string): Promise<GroupNote[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("group_notes")
    .select("*, author:profiles(full_name, email, role)")
    .eq("question_id", questionId)
    .order("created_at", { ascending: true });
  if (error) { console.warn("getGroupNotes", error.message); return []; }
  return (data ?? []) as GroupNote[];
}

export async function addGroupNote(questionId: string, text: string): Promise<void> {
  if (!supabase) return;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from("group_notes").insert({ question_id: questionId, author_id: u.user.id, text });
}

export async function deleteGroupNote(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from("group_notes").delete().eq("id", id);
}

/* --- admin --- */
export async function listProfiles(): Promise<Profile[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url, role, status, training_level")
    .order("status", { ascending: true })
    .order("email", { ascending: true });
  if (error) { console.warn("listProfiles", error.message); return []; }
  return (data ?? []) as Profile[];
}

export async function updateProfile(
  id: string,
  patch: Partial<Pick<Profile, "status" | "role">>
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  if (error) console.warn("updateProfile", error.message);
}

export type QuestionStats = { attempts: number; correct: number; pct_correct: number; distribution: Record<string, number> };

export async function getQuestionStats(questionId: string): Promise<QuestionStats | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("question_stats", { q_id: questionId });
  if (error) { console.warn("question_stats", error.message); return null; }
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

export type Flashcard = { question_id: string; cloze_text: string; extra: string; updated_at?: string };

/** Read the cached card for a question (null if none generated yet). */
export async function getFlashcard(questionId: string): Promise<Flashcard | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("flashcards").select("*").eq("question_id", questionId).maybeSingle();
  return (data as Flashcard) ?? null;
}

/** Generate (or fetch cached) a card via the edge function. */
export async function generateFlashcard(q: {
  question_id: string; stem: string;
  options: { letter: string; text: string }[];
  answer_letter: string | null; answer_text: string; force?: boolean;
}): Promise<(Flashcard & { cached: boolean }) | { error: string }> {
  if (!supabase) return { error: "not configured" };
  const { data, error } = await supabase.functions.invoke("generate-flashcard", { body: q });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return data as Flashcard & { cached: boolean };
}

/** Batch-fetch cloze text for many questions (for a filtered deck export). */
export async function getFlashcardsForIds(ids: string[]): Promise<Record<string, string>> {
  if (!supabase || !ids.length) return {};
  const out: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += 300) {
    const chunk = ids.slice(i, i + 300);
    const { data, error } = await supabase.from("flashcards").select("question_id, cloze_text").in("question_id", chunk);
    if (error) { console.warn("getFlashcardsForIds", error.message); continue; }
    for (const r of (data ?? []) as { question_id: string; cloze_text: string }[]) out[r.question_id] = r.cloze_text;
  }
  return out;
}

/** Admin refine: overwrite the canonical card. */
export async function saveFlashcard(questionId: string, cloze: string, extra: string): Promise<void> {
  if (!supabase) return;
  await supabase.from("flashcards").upsert(
    { question_id: questionId, cloze_text: cloze, extra, updated_at: new Date().toISOString() },
    { onConflict: "question_id" }
  );
}

/* --- spaced repetition (private, per user + question) — SM-2 review queue over
   missed questions. Card content (front/back) is the existing `flashcards`
   cloze card for the same question_id; this table only tracks scheduling. --- */
export type SrsRow = {
  user_id: string;
  question_id: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  due_at: string;
  last_grade: SrsGrade | null;
  reviewed_count: number;
  last_reviewed_at: string | null;
};

/** Start tracking a question for review (called when it's missed). No-op if
    already tracked — grading progress is never reset by re-missing a question
    in the regular quiz, only by grading "Again" in the Review panel itself. */
export async function ensureTrackedForReview(questionId: string): Promise<void> {
  if (!supabase) return;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  const { error } = await supabase.from("spaced_repetition").upsert(
    { user_id: u.user.id, question_id: questionId, due_at: new Date().toISOString() },
    { onConflict: "user_id,question_id", ignoreDuplicates: true }
  );
  if (error) console.warn("ensureTrackedForReview", error.message);
}

/** Every card due for review right now (due_at <= now), oldest-due first. */
export async function getDueReviewCards(): Promise<SrsRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("spaced_repetition").select("*")
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true });
  if (error) { console.warn("getDueReviewCards", error.message); return []; }
  return (data ?? []) as SrsRow[];
}

/** Apply a grade to a review card via SM-2 and reschedule it. Returns the new
    due date (ISO) so the caller can show a "next review in..." confirmation. */
export async function gradeReviewCard(questionId: string, grade: SrsGrade): Promise<string | null> {
  if (!supabase) return null;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const uid = u.user.id;
  const { data: existing } = await supabase
    .from("spaced_repetition").select("ease_factor, interval_days, repetitions, reviewed_count")
    .eq("user_id", uid).eq("question_id", questionId).maybeSingle();
  const prev: SrsState = existing
    ? { ease_factor: existing.ease_factor, interval_days: existing.interval_days, repetitions: existing.repetitions }
    : SRS_DEFAULT;
  const next = sm2Next(prev, grade);
  const now = new Date();
  const dueAt = new Date(now.getTime() + next.interval_days * 86400000).toISOString();
  const { error } = await supabase.from("spaced_repetition").upsert(
    {
      user_id: uid, question_id: questionId,
      ease_factor: next.ease_factor, interval_days: next.interval_days, repetitions: next.repetitions,
      due_at: dueAt, last_grade: grade,
      reviewed_count: (existing?.reviewed_count ?? 0) + 1, last_reviewed_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
    { onConflict: "user_id,question_id" }
  );
  if (error) { console.warn("gradeReviewCard", error.message); return null; }
  return dueAt;
}

export type TagMissRow = { tag: string; label: string; attempts: number; missed: number; miss_pct: number };

/** Rank a tag dimension by class miss-rate (hardest first), optionally for one
    training-level cohort. Visible to any approved member. */
export async function getTagMissStats(dimension: string, cohort?: string | null): Promise<TagMissRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("tag_miss_stats", { dim: dimension, cohort: cohort ?? null });
  if (error) { console.warn("tag_miss_stats", error.message); return []; }
  return (data ?? []) as TagMissRow[];
}

export type LeaderRow = { user_id: string; full_name: string; answered: number; correct: number; accuracy: number };

export async function getLeaderboard(): Promise<LeaderRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("leaderboard");
  if (error) { console.warn("leaderboard", error.message); return []; }
  return (data ?? []) as LeaderRow[];
}
