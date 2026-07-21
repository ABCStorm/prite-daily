import { supabase } from "./supabase";

/* Study guides: an on-demand, AI-written prep page + ~10-minute audio script
   generated from a saved test, so a speaker can hand the class something to
   read/listen to before the session. Shared via a plain ?study=<id> link
   (same pattern as the live-poll ?poll=CODE deep link) — no server routing
   needed since the SPA reads it off the URL on load. */

export type StudyGuideSection = { heading: string; body: string };
/* One designed slide. layout: "divider" (full-bleed section break),
   "bullets" (title + 3-5 large bullets, optional image), or "bigfact" (one
   giant teaching point). image_path points into the private "study-slides"
   bucket when the designer requested an AI illustration for the slide. */
export type StudyGuideSlide = {
  layout?: "divider" | "bullets" | "bigfact" | string;
  title?: string;
  bullets?: string[];
  big_text?: string;
  support?: string;
  notes?: string;
  image_path?: string | null;
};

export type StudyGuideStatus = "generating" | "ready" | "error";
export type StudyGuideStage = "writing" | "designing" | "narrating" | null;

export type StudyGuide = {
  id: string;
  saved_test_id: string;
  created_by: string | null;
  title: string;
  intro: string;
  sections: StudyGuideSection[];
  key_terms: string[];
  audio_script: string;
  slides: StudyGuideSlide[];  // teaching-deck outline; [] on guides generated before slides existed
  audio_path: string | null;  // path in the private "study-audio" bucket
  status: StudyGuideStatus;
  stage: StudyGuideStage;
  text_ready: boolean;        // the written guide is populated and viewable (audio may still be pending/failed)
  session_date: string | null; // date of the upcoming review session this is prep for (YYYY-MM-DD)
  error_message: string | null;
  generation_started_at: string | null;  // when THIS run began (survives refresh; anchors the progress bar)
  created_at: string;
};

const STUDY_PARAM = "study";

/** Whether the signed-in user may GENERATE study guides (admins + the
    study_guide_creators allowlist of education chiefs — generation costs
    money). Everyone approved can still view finished guides. The edge
    function re-checks this server-side; here it only drives button
    visibility. RLS lets a user read their own allowlist row. */
export async function canGenerateStudyGuides(): Promise<boolean> {
  if (!supabase) return false;
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return false;
  const [{ data: prof }, { data: row }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", uid).maybeSingle(),
    supabase.from("study_guide_creators").select("profile_id").eq("profile_id", uid).maybeSingle(),
  ]);
  return prof?.role === "admin" || Boolean(row);
}

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

/** Every study guide any speaker in the residency has generated whose TEXT is
    ready (audio may still be rendering or may have failed — the written guide
    is readable either way), newest first. The shared library so residents can
    find past sessions' prep material without needing the original share link.
    RLS already lets any approved member read study_guides and profiles. */
export async function listLibraryStudyGuides(): Promise<LibraryStudyGuide[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("study_guides").select("*").eq("text_ready", true).order("created_at", { ascending: false });
  if (error) { console.warn("listLibraryStudyGuides", error.message); return []; }
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

/* --- bring-your-own AI keys ---
   Stored ONLY in this browser's localStorage (never in the database) and sent
   with each generation request, where the edge function uses them in place of
   the program's project secrets. Lets future chiefs keep generation running on
   their own Anthropic/OpenAI accounts if the program keys lapse. */
const OWN_AI_KEYS_LS = "prite.ownAiKeys";
export type OwnAiKeys = { anthropic?: string; openai?: string };

export function getOwnAiKeys(): OwnAiKeys {
  try { return JSON.parse(localStorage.getItem(OWN_AI_KEYS_LS) || "{}") as OwnAiKeys; }
  catch { return {}; }
}

export function setOwnAiKeys(keys: OwnAiKeys): void {
  const clean: OwnAiKeys = {};
  if (keys.anthropic?.trim()) clean.anthropic = keys.anthropic.trim();
  if (keys.openai?.trim()) clean.openai = keys.openai.trim();
  try {
    if (Object.keys(clean).length) localStorage.setItem(OWN_AI_KEYS_LS, JSON.stringify(clean));
    else localStorage.removeItem(OWN_AI_KEYS_LS);
  } catch { /* private browsing — keys just won't persist */ }
}

/** Generate (or fetch cached) a study guide via the edge function. Only ever
    sends each question's stem + topic tags — never options/answer/explanation
    — so the result can't spoil the quiz. */
export async function generateStudyGuide(
  savedTestId: string,
  testName: string,
  topics: { stem: string; prite_category?: string; prite_label?: string; topics?: string[] }[],
  force = false,
  sessionDate: string | null = null,
  slidesOnly = false,   // write text + slide deck only, skip narration (the standalone "Prep slides" button)
): Promise<StudyGuide | { error: string }> {
  if (!supabase) return { error: "not configured" };
  const own = getOwnAiKeys();
  const { data, error } = await supabase.functions.invoke("generate-study-guide", {
    body: {
      saved_test_id: savedTestId, test_name: testName, topics, force, session_date: sessionDate, slides_only: slidesOnly,
      anthropic_key: own.anthropic ?? null, openai_key: own.openai ?? null,
    },
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
