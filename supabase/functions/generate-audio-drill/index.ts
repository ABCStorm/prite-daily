// Render and cache one prewritten active-recall audio drill. This function is
// deliberately single-item: the resumable batch runner can retry safely and
// failures do not strand an entire topic playlist. Interactive callers must
// be approved admins; the batch runner uses a separate high-entropy secret.
//
// Clips are written to R2 through the batch-secret-guarded /api/audio-admin
// endpoint, which is the only store /api/audio serves from.
//
// Secrets: FISH_API_KEY, AUDIO_BATCH_SECRET, optionally FISH_VOICE_ID and
// R2_AUDIO_ADMIN_URL.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-audio-batch-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});
const url = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const renderVersion = "v4-open-ended";
const answerRenderVersion = "v3";

function cleanSpeech(text: string) {
  return text
    .replace(/\{\{c\d+::([^}]+)\}\}/g, "$1")
    .replace(/[*_#`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isMp3(audio: Uint8Array) {
  if (audio.length < 4) return false;
  const hasId3 = audio[0] === 0x49 && audio[1] === 0x44 && audio[2] === 0x33;
  const hasFrameSync = audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0;
  return hasId3 || hasFrameSync;
}

const encodedPath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

// R2 is the only clip store. The Supabase `audio-drills` bucket was emptied on
// 2026-08-08 after the 2026-08-01 migration, and nothing reads from it, so a
// fallback would silently write clips that later 404 on playback. The default
// matches scripts/audio/build-audio-exports.mjs.
function r2AdminBase() {
  return (Deno.env.get("R2_AUDIO_ADMIN_URL") || "https://pritedaily.com/api/audio-admin").replace(/\/$/, "");
}

function batchSecret() {
  const secret = Deno.env.get("AUDIO_BATCH_SECRET");
  if (!secret) throw new Error("AUDIO_BATCH_SECRET must be configured to write audio to R2");
  return secret;
}

async function uploadAudio(path: string, bytes: Uint8Array) {
  const response = await fetch(`${r2AdminBase()}/${encodedPath(path)}`, {
    method: "PUT",
    headers: {
      "content-type": "audio/mpeg",
      "content-length": String(bytes.byteLength),
      "x-audio-batch-secret": batchSecret(),
    },
    body: bytes,
  });
  if (!response.ok) throw new Error(`R2 upload failed (${response.status}): ${await response.text()}`);
  return "r2";
}

function verificationAccess(promptPath: string, answerPath: string, enabled: boolean) {
  if (!enabled) return {};
  const base = r2AdminBase();
  return {
    signed_urls: {
      prompt: `${base}/${encodedPath(promptPath)}`,
      answer: `${base}/${encodedPath(answerPath)}`,
    },
    storage: "r2",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let activeQuestionId: string | null = null;
  try {
    const input = await req.json();
    const suppliedBatchSecret = req.headers.get("x-audio-batch-secret");
    const expectedBatchSecret = Deno.env.get("AUDIO_BATCH_SECRET");
    const isBatchRunner = Boolean(
      expectedBatchSecret &&
      suppliedBatchSecret &&
      expectedBatchSecret.length >= 32 &&
      suppliedBatchSecret === expectedBatchSecret
    );
    const {
      question_id,
      stem,
      options = [],
      script: rawScript,
      prompt_script: rawPromptScript,
      prompt_only = false,
      voice_style = "calm",
      force = false,
      include_signed_urls = false,
    } = input;
    if (!question_id || !stem) return json({ error: "question_id and stem required" }, 400);
    activeQuestionId = question_id;
    if (!isBatchRunner) {
      const auth = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      });
      const { data: user } = await auth.auth.getUser();
      if (!user.user) return json({ error: "Sign in to generate audio." }, 401);
      const { data: profile } = await admin.from("profiles").select("status,is_admin,role").eq("id", user.user.id).maybeSingle();
      if (profile?.status !== "approved" || (!profile.is_admin && profile.role !== "admin")) return json({ error: "Only an administrator can generate shared audio." }, 403);
    }

    const { data: cached } = await admin.from("audio_drills").select("*").eq("question_id", question_id).maybeSingle();
    const prompt_audio_path = `${question_id}/${renderVersion}/prompt.mp3`;
    const answer_audio_path = cached?.answer_audio_path ?? `${question_id}/${answerRenderVersion}/answer.mp3`;
    if (
      !force &&
      cached?.status === "ready" &&
      cached.prompt_audio_path === prompt_audio_path &&
      cached.answer_audio_path === answer_audio_path
    ) {
      const access = verificationAccess(prompt_audio_path, answer_audio_path, include_signed_urls && isBatchRunner);
      return json({ ...cached, render_version: renderVersion, ...access, cached: true });
    }
    const script = cleanSpeech(rawScript ?? cached?.script ?? "");
    const spokenPrompt = cleanSpeech(rawPromptScript ?? stem);
    if (!script) return json({ error: "A prewritten script is required for first-time rendering." }, 400);
    if (script.length > 420) return json({ error: "script exceeds 420 characters" }, 400);
    if (!spokenPrompt) return json({ error: "An open-ended prompt is required." }, 400);
    if (spokenPrompt.length > 620) return json({ error: "prompt_script exceeds 620 characters" }, 400);
    if (prompt_only && !cached?.answer_audio_path) return json({ error: "Prompt-only rendering requires an existing answer clip." }, 400);
    await admin.from("audio_drills").upsert({ question_id, script, status: "generating", error_message: null, updated_at: new Date().toISOString() });

    const fishKey = Deno.env.get("FISH_API_KEY");
    if (!fishKey) throw new Error("FISH_API_KEY must be configured");

    const style = voice_style === "brisk" ? { speed: 1.12, volume: 0 } : voice_style === "clear" ? { speed: 1, volume: 1 } : { speed: 0.9, volume: 0 };
    const speak = async (text: string) => {
      const res = await fetch("https://api.fish.audio/v1/tts", {
        method: "POST",
        headers: { Authorization: `Bearer ${fishKey}`, "content-type": "application/json", model: Deno.env.get("FISH_TTS_MODEL") || "s2.1-pro-free" },
        // Fish's free S2.1 endpoint currently ignores opus_bitrate and returns
        // ~270 kbps Ogg Opus. 64 kbps MP3 is honored, remains clear for spoken
        // study material, and is more broadly compatible with phone browsers.
        body: JSON.stringify({ text, reference_id: Deno.env.get("FISH_VOICE_ID") || undefined, prosody: { ...style, normalize_loudness: true }, format: "mp3", sample_rate: 44100, mp3_bitrate: 64, normalize: true }),
      });
      if (!res.ok) throw new Error(`Fish Audio returned ${res.status}: ${await res.text()}`);
      return new Uint8Array(await res.arrayBuffer());
    };
    const [promptAudio, answerAudio] = await Promise.all([
      speak(spokenPrompt),
      prompt_only ? Promise.resolve<Uint8Array | null>(null) : speak(script),
    ]);
    if (!isMp3(promptAudio) || (answerAudio && !isMp3(answerAudio))) {
      throw new Error("Fish Audio did not return a valid MP3 stream");
    }
    const storageTargets = await Promise.all([
      uploadAudio(prompt_audio_path, promptAudio),
      answerAudio ? uploadAudio(answer_audio_path, answerAudio) : Promise.resolve("existing"),
    ]);
    const row = { question_id, script, prompt_audio_path, answer_audio_path, status: "ready", error_message: null, generated_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    await admin.from("audio_drills").upsert(row);
    const access = verificationAccess(prompt_audio_path, answer_audio_path, include_signed_urls && isBatchRunner);
    return json({
      ...row,
      render_version: renderVersion,
      audio_format: "mp3",
      prompt_bytes: promptAudio.byteLength,
      answer_bytes: answerAudio?.byteLength ?? null,
      storage: storageTargets[0],
      ...access,
    });
  } catch (e) {
    const message = String(e);
    if (activeQuestionId) {
      await admin.from("audio_drills").upsert({ question_id: activeQuestionId, status: "error", error_message: message, updated_at: new Date().toISOString() });
    }
    return json({ error: message }, 500);
  }
});
