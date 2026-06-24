import { supabase } from "./supabase";

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
}): Promise<Flashcard | { error: string }> {
  if (!supabase) return { error: "not configured" };
  const { data, error } = await supabase.functions.invoke("generate-flashcard", { body: q });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return data as Flashcard;
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
