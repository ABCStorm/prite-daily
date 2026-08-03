import { supabase, questionId } from "./supabase";

export type AudioDrill = {
  question_id: string;
  script: string;
  prompt_audio_path: string | null;
  answer_audio_path: string | null;
  status: "pending" | "generating" | "ready" | "error";
  error_message: string | null;
};

export type AudioReviewProgress = {
  user_id: string;
  scope_key: string;
  topic: string;
  question_ids: string[];
  current_index: number;
  recall_seconds: number;
  transition_seconds: number;
  playback_rate: number;
  order_mode: "shuffle" | "bank";
  completed: boolean;
  updated_at: string;
};

/** Read the ready clips for a selected topic.  Storage remains private; the
 * browser receives blob URLs only after Supabase has applied its RLS policy. */
export async function getAudioDrills(ids: string[]): Promise<Record<string, AudioDrill>> {
  if (!supabase || !ids.length) return {};
  // A full-topic queue can contain hundreds (and the full bank thousands) of
  // IDs. Keep each PostgREST URL comfortably below browser/proxy limits.
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 150) chunks.push(ids.slice(i, i + 150));
  const responses = await Promise.all(chunks.map((chunk) =>
    supabase!.from("audio_drills").select("*").in("question_id", chunk).eq("status", "ready")
  ));
  const ready: AudioDrill[] = [];
  for (const { data, error } of responses) {
    if (error) console.warn("getAudioDrills", error.message);
    else ready.push(...((data ?? []) as AudioDrill[]));
  }
  return Object.fromEntries(ready.map((d) => [d.question_id, d]));
}

export async function getAudioClipUrl(path: string): Promise<string | null> {
  const data = await getPrivateAudioBlob(path);
  return data ? URL.createObjectURL(data) : null;
}

export async function listAudioReviewProgress(): Promise<AudioReviewProgress[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("audio_review_progress")
    .select("*")
    .eq("completed", false)
    .order("updated_at", { ascending: false });
  if (error) { console.warn("listAudioReviewProgress", error.message); return []; }
  return (data ?? []) as AudioReviewProgress[];
}

export async function saveAudioReviewProgress(input: Omit<AudioReviewProgress, "user_id" | "updated_at">): Promise<void> {
  if (!supabase) return;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  const { error } = await supabase.from("audio_review_progress").upsert({
    ...input,
    user_id: auth.user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,scope_key" });
  if (error) console.warn("saveAudioReviewProgress", error.message);
}

async function getPrivateAudioBlob(path: string, range?: { offset: number; bytes: number }): Promise<Blob | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (range) headers.Range = `bytes=${range.offset}-${range.offset + range.bytes - 1}`;
  const response = await fetch(`/api/audio/${encodedPath}`, { headers });
  if (!response.ok) { console.warn("getPrivateAudioBlob", response.status, path); return null; }
  return response.blob();
}

export async function getAudioExportBlob(path: string, range?: { offset: number; bytes: number }): Promise<Blob | null> {
  return getPrivateAudioBlob(path, range);
}

/** Admin-only. Generates once and caches the teaching sentence plus both clips. */
export async function generateAudioDrill(q: {
  year: string; q_index: number; stem: string; options: { letter: string; text: string }[];
  answer_letter: string | null; answer_text: string; explanation_text: string;
}, voiceStyle: "calm" | "clear" | "brisk" = "calm", force = false): Promise<AudioDrill | { error: string }> {
  if (!supabase) return { error: "not configured" };
  const { data, error } = await supabase.functions.invoke("generate-audio-drill", {
    body: { question_id: questionId(q.year, q.q_index), ...q, voice_style: voiceStyle, force },
  });
  if (error) return { error: error.message };
  if (data?.error) return { error: data.error };
  return data as AudioDrill;
}
