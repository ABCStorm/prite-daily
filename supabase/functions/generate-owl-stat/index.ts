// Render one prewritten wise-owl statistic through Fish Audio's free
// S2.1 Pro model, always in the same elderly-statesman voice, and store
// the MP3 on R2 at owl/{question_id}/v1.mp3.
//
// Secrets: FISH_API_KEY, AUDIO_BATCH_SECRET, optionally FISH_OWL_VOICE_ID
// (defaults to the Fish library "senior us" educational elder) and
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

const RENDER_VERSION = "v1";
// Fish library voice: Male / Old / Educational — calm measured statesman.
const DEFAULT_OWL_VOICE = "ec09398bbbb94b2ea46e83391ad7f49d";

function cleanSpeech(text: string) {
  return text.replace(/[*_#`]/g, "").replace(/\s+/g, " ").trim();
}

function isMp3(audio: Uint8Array) {
  if (audio.length < 4) return false;
  const hasId3 = audio[0] === 0x49 && audio[1] === 0x44 && audio[2] === 0x33;
  const hasFrameSync = audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0;
  return hasId3 || hasFrameSync;
}

const encodedPath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

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
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const input = await req.json();
    const suppliedBatchSecret = req.headers.get("x-audio-batch-secret");
    const expectedBatchSecret = Deno.env.get("AUDIO_BATCH_SECRET");
    const isBatchRunner = Boolean(
      expectedBatchSecret &&
      suppliedBatchSecret &&
      expectedBatchSecret.length >= 32 &&
      suppliedBatchSecret === expectedBatchSecret,
    );
    const { question_id, script: rawScript, force = false } = input;
    if (!question_id) return json({ error: "question_id required" }, 400);
    if (!isBatchRunner) {
      const url = Deno.env.get("SUPABASE_URL")!;
      const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const auth = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      });
      const { data: user } = await auth.auth.getUser();
      if (!user.user) return json({ error: "Sign in to generate owl audio." }, 401);
      const { data: profile } = await admin.from("profiles").select("status,is_admin,role").eq("id", user.user.id).maybeSingle();
      if (profile?.status !== "approved" || (!profile.is_admin && profile.role !== "admin")) {
        return json({ error: "Only an administrator can generate shared audio." }, 403);
      }
    }

    const script = cleanSpeech(rawScript ?? "");
    if (!script) return json({ error: "script required" }, 400);
    if (script.length > 520) return json({ error: "script exceeds 520 characters" }, 400);

    const audio_path = `owl/${question_id}/${RENDER_VERSION}.mp3`;
    if (!force) {
      const head = await fetch(`${r2AdminBase()}/${encodedPath(audio_path)}`, {
        method: "HEAD",
        headers: { "x-audio-batch-secret": batchSecret() },
      });
      if (head.ok) return json({ question_id, audio_path, cached: true, render_version: RENDER_VERSION });
    }

    const fishKey = Deno.env.get("FISH_API_KEY");
    if (!fishKey) throw new Error("FISH_API_KEY must be configured");
    const voiceId = Deno.env.get("FISH_OWL_VOICE_ID") || DEFAULT_OWL_VOICE;
    const res = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${fishKey}`,
        "content-type": "application/json",
        model: Deno.env.get("FISH_TTS_MODEL") || "s2.1-pro-free",
      },
      body: JSON.stringify({
        text: script,
        reference_id: voiceId,
        // A shade slower than the drill voice — elderly statesman, not a quiz timer.
        prosody: { speed: 0.86, volume: 0, normalize_loudness: true },
        format: "mp3",
        sample_rate: 44100,
        mp3_bitrate: 64,
        normalize: true,
      }),
    });
    if (!res.ok) throw new Error(`Fish Audio returned ${res.status}: ${await res.text()}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!isMp3(bytes)) throw new Error("Fish Audio did not return a valid MP3 stream");
    await uploadAudio(audio_path, bytes);
    return json({
      question_id,
      audio_path,
      render_version: RENDER_VERSION,
      voice_id: voiceId,
      bytes: bytes.byteLength,
      cached: false,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
