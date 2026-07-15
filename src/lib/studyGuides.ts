import { supabase } from "./supabase";

/* Study guides: an on-demand, AI-written prep page + ~10-minute audio script
   generated from a saved test, so a speaker can hand the class something to
   read/listen to before the session. Shared via a plain ?study=<id> link
   (same pattern as the live-poll ?poll=CODE deep link) — no server routing
   needed since the SPA reads it off the URL on load. */

export type StudyGuideSection = { heading: string; body: string };

export type StudyGuideStatus = "generating" | "ready" | "error";
export type StudyGuideStage = "writing" | "narrating" | null;

export type StudyGuide = {
  id: string;
  saved_test_id: string;
  created_by: string | null;
  title: string;
  intro: string;
  sections: StudyGuideSection[];
  key_terms: string[];
  audio_script: string;
  audio_path: string | null;  // path in the private "study-audio" bucket
  status: StudyGuideStatus;
  stage: StudyGuideStage;
  error_message: string | null;
  created_at: string;
};

const STUDY_PARAM = "study";

/** Build the shareable link for a generated guide. */
export function studyGuideUrl(id: string): string {
  const u = new URL(window.location.origin);
  u.searchParams.set(STUDY_PARAM, id);
  return u.toString();
}

/** Read a study guide id from the current URL (?study=<uuid>), if any. */
export function studyGuideIdFromUrl(): string | null {
  try {
    return new URLSearchParams(window.location.search).get(STUDY_PARAM);
  } catch {
    return null;
  }
}

/** Remove ?study=… from the address bar without reloading. */
export function clearStudyParam() {
  try {
    const u = new URL(window.location.href);
    u.searchParams.delete(STUDY_PARAM);
    window.history.replaceState({}, "", u.toString());
  } catch {
    // ignore
  }
}

/** Fetch a guide by its own id (for opening a shared link). */
export async function getStudyGuide(id: string): Promise<StudyGuide | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("study_guides").select("*").eq("id", id).maybeSingle();
  return (data as StudyGuide) ?? null;
}

/** Fetch every generated/in-progress guide for a set of saved tests in one
    round trip, keyed by saved_test_id — used to poll progress for all of a
    speaker's tests at once (so the Tests button can badge "done" even if
    the panel that kicked off generation isn't open anymore). */
export async function listStudyGuidesForTests(savedTestIds: string[]): Promise<Record<string, StudyGuide>> {
  if (!supabase || !savedTestIds.length) return {};
  const { data, error } = await supabase.from("study_guides").select("*").in("saved_test_id", savedTestIds);
  if (error) { console.warn("listStudyGuidesForTests", error.message); return {}; }
  const out: Record<string, StudyGuide> = {};
  for (const row of (data as StudyGuide[] | null) ?? []) out[row.saved_test_id] = row;
  return out;
}

export type LibraryStudyGuide = StudyGuide & { creator_name: string | null };

/** Every finished study guide any speaker in the residency has generated,
    newest first — the shared library so residents can find past sessions'
    prep material without needing the original share link. RLS already lets
    any approved member read study_guides and profiles, so this is a plain
    read for whoever calls it. */
export async function listAllReadyStudyGuides(): Promise<LibraryStudyGuide[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("study_guides").select("*").eq("status", "ready").order("created_at", { ascending: false });
  if (error) { console.warn("listAllReadyStudyGuides", error.message); return []; }
  const guides = (data as StudyGuide[]) ?? [];
  const creatorIds = [...new Set(guides.map((g) => g.created_by).filter((id): id is string => Boolean(id)))];
  let names: Record<string, string> = {};
  if (creatorIds.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", creatorIds);
    names = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name || p.email || "Someone"]));
  }
  return guides.map((g) => ({ ...g, creator_name: g.created_by ? (names[g.created_by] ?? null) : null }));
}

/** Download the generated narration audio and return a blob: URL for an
    <audio> element. Caller is responsible for revoking it when done. */
export async function getStudyGuideAudioUrl(audioPath: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from("study-audio").download(audioPath);
  if (error || !data) { console.warn("getStudyGuideAudioUrl", error?.message); return null; }
  return URL.createObjectURL(data);
}

/** Generate (or fetch cached) a study guide via the edge function. Only ever
    sends each question's stem + topic tags — never options/answer/explanation
    — so the result can't spoil the quiz. */
export async function generateStudyGuide(
  savedTestId: string,
  testName: string,
  topics: { stem: string; prite_category?: string; prite_label?: string; topics?: string[] }[],
  force = false,
): Promise<StudyGuide | { error: string }> {
  if (!supabase) return { error: "not configured" };
  const { data, error } = await supabase.functions.invoke("generate-study-guide", {
    body: { saved_test_id: savedTestId, test_name: testName, topics, force },
  });
  if (error) {
    // FunctionsHttpError's own .message is just "Edge Function returned a
    // non-2xx status code" — the actual reason is in the response body.
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    return { error: body?.error ?? error.message };
  }
  if (data?.error) return { error: data.error };
  return data as StudyGuide;
}
