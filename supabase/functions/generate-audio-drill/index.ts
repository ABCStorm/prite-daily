// Render and cache one prewritten active-recall audio drill. This function is
// deliberately single-item: the resumable batch runner can retry safely and
// failures do not strand an entire topic playlist. Interactive callers must
// be approved admins; the batch runner uses a separate high-entropy secret.
//
// Secrets: FISH_API_KEY, AUDIO_BATCH_SECRET, optionally FISH_VOICE_ID.
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

async function signClipPaths(promptPath: string, answerPath: string) {
  const [promptSigned, answerSigned] = await Promise.all([
    admin.storage.from("audio-drills").createSignedUrl(promptPath, 120),
    admin.storage.from("audio-drills").createSignedUrl(answerPath, 120),
  ]);
  if (promptSigned.error || answerSigned.error) {
    throw new Error(promptSigned.error?.message ?? answerSigned.error?.message);
  }
  return {
    prompt: promptSigned.data.signedUrl,
    answer: answerSigned.data.signedUrl,
  };
}

const encodedPath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

function r2AdminBase() {
  return Deno.env.get("R2_AUDIO_ADMIN_URL")?.replace(/\/$/, "") ?? null;
}

async function uploadAudio(path: string, bytes: Uint8Array) {
  const base = r2AdminBase();
  const batchSecret = Deno.env.get("AUDIO_BATCH_SECRET");
  if (base && batchSecret) {
    const response = await fetch(`${base}/${encodedPath(path)}`, {
      method: "PUT",
      headers: {
        "content-type": "audio/mpeg",
        "content-length": String(bytes.byteLength),
        "x-audio-batch-secret": batchSecret,
      },
      body: bytes,
    });
    if (!response.ok) throw new Error(`R2 upload failed (${response.status}): ${await response.text()}`);
    return "r2";
  }
  const upload = await admin.storage.from("audio-drills").upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
  if (upload.error) throw new Error(upload.error.message);
  return "supabase";
}

async function verificationAccess(promptPath: string, answerPath: string, enabled: boolean) {
  if (!enabled) return {};
  const base = r2AdminBase();
  if (base) {
    return {
      signed_urls: {
        prompt: `${base}/${encodedPath(promptPath)}`,
        answer: `${base}/${encodedPath(answerPath)}`,
      },
      storage: "r2",
    };
  }
  return { signed_urls: await signClipPaths(promptPath, answerPath), storage: "supabase" };
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
    // Large offline programs are assembled by the trusted local batch runner,
    // then streamed directly to Storage. Return only a short-lived
    // signed upload token—never the service-role credential itself.
    if (input.action === "create_export_upload") {
      if (!isBatchRunner) return json({ error: "Batch authorization required." }, 403);
      const path = String(input.path ?? "");
      if (!/^exports\/v2\/[a-z0-9-]+\.mp3$/.test(path)) return json({ error: "Invalid export path." }, 400);
      const { data, error } = await admin.storage.from("audio-drills").createSignedUploadUrl(path, { upsert: true });
      if (error || !data) throw new Error(error?.message ?? "Could not create export upload token");
      return json({ path, token: data.token });
    }
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
      const access = await verificationAccess(prompt_audio_path, answer_audio_path, include_signed_urls && isBatchRunner);
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
    const access = await verificationAccess(prompt_audio_path, answer_audio_path, include_signed_urls && isBatchRunner);
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
