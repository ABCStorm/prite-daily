// Supabase Edge Function: sweep-stuck-guides
//
// Study-guide generation runs as a background task (EdgeRuntime.waitUntil) after
// the HTTP response is sent. Every in-code failure is caught and recorded as
// status='error', so a guide with status='generating' AND error_message=null is
// the signature of the isolate being killed outright — a wall-clock/CPU budget
// overrun, most likely while narrating a guide that also generated ~20 AI slide
// images. Nothing in the app recovers from that: the row sits at 'generating'
// forever and the page shows "recording appears here when ready" indefinitely.
// Three guides were stranded this way before this sweeper existed, one of them
// a link already sent to the residents.
//
// So: anything still 'generating' past STALE_MINUTES gets finished or failed.
//   - text_ready + audio_script present -> narrate it (cheap: no Claude call)
//   - otherwise                          -> mark 'error' so the UI stops lying
//
// Secrets: CRON_SECRET (caller sends x-cron-secret), AUDIO_BATCH_SECRET (used to
// call generate-study-guide's narrate_only action), SUPABASE_* injected.
//
// Deploy WITHOUT JWT verification (gated by CRON_SECRET instead):
//   supabase functions deploy sweep-stuck-guides --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Generous: a legitimate full run (Claude + ~20 images + narration) can take a
// few minutes, and sweeping a live run would kill work that was about to land.
const STALE_MINUTES = 12;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const expected = Deno.env.get("CRON_SECRET");
  const supplied = req.headers.get("x-cron-secret");
  if (!expected || !supplied || supplied !== expected) {
    return json({ error: "Scheduler authorization required." }, 403);
  }

  const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();
  const { data: stale, error } = await admin
    .from("study_guides")
    .select("id, saved_test_id, title, text_ready, audio_script, audio_path, generation_started_at")
    .eq("status", "generating")
    .lt("generation_started_at", cutoff);
  if (error) return json({ error: error.message }, 500);

  const batchSecret = Deno.env.get("AUDIO_BATCH_SECRET");
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const narrated: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  // Parallel: sequential TTS of two ~10-minute scripts regularly exceeded the
  // sweeper isolate's budget and left the second stranded guide untouched.
  await Promise.all((stale ?? []).map(async (g) => {
    if (g.audio_path) {
      await admin.from("study_guides").update({ status: "ready", stage: null, error_message: null }).eq("id", g.id);
      narrated.push(g.id);
      return;
    }
    if (g.text_ready && g.audio_script && batchSecret) {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate-study-guide`, {
        method: "POST",
        headers: {
          apikey: anon,
          Authorization: `Bearer ${anon}`,
          "content-type": "application/json",
          "x-study-guide-action": "narrate_only",
          "x-audio-batch-secret": batchSecret,
        },
        body: JSON.stringify({ saved_test_id: g.saved_test_id }),
      });
      if (res.ok) { narrated.push(g.id); return; }
      const reason = `narration retry failed: ${res.status} ${await res.text()}`.slice(0, 300);
      await admin.from("study_guides").update({ status: "error", stage: null, error_message: reason }).eq("id", g.id);
      failed.push({ id: g.id, reason });
      return;
    }
    const reason = "Generation stopped unexpectedly (the server run was cut short). Try generating again.";
    await admin.from("study_guides").update({ status: "error", stage: null, error_message: reason }).eq("id", g.id);
    failed.push({ id: g.id, reason });
  }));

  return json({ checked: stale?.length ?? 0, recovered: narrated.length, errored: failed.length, narrated, failed });
});
