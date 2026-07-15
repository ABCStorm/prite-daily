// Supabase Edge Function: generate-study-guide
//
// Turns a saved test into a prep page + ~10-minute audio overview for the
// class to read/listen to before the session, generate-once-and-cache:
//   - if a guide already exists for the saved_test_id, return it (no AI call)
//   - else call Anthropic (Opus) to write a background/context study guide +
//     narration script, render the narration to speech via ElevenLabs, store
//     the audio in the `study-audio` bucket and the text in `study_guides`,
//     and return it.
//
// Deliberately never sees each question's options, correct answer, or
// explanation — only stem + topic tags are sent to the model — so it is
// structurally unable to spoil the quiz, only to teach around it.
//
// Secrets needed (Project Settings -> Edge Functions): ANTHROPIC_API_KEY,
// ELEVENLABS_API_KEY (and optionally ELEVENLABS_VOICE_ID to override the
// default narration voice). SUPABASE_URL, SUPABASE_ANON_KEY, and
// SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const MODEL = "claude-opus-4-8";

// ElevenLabs' default "Rachel" voice — clear, warm, well-suited to narration.
// Override with the ELEVENLABS_VOICE_ID secret to use a different one.
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

type TopicInput = { stem: string; prite_category?: string; prite_label?: string; topics?: string[] };

// ElevenLabs caps request text length well under a ~10-minute script, so
// split on sentence boundaries into request-sized chunks and stitch the
// resulting MP3s together (simple byte concatenation — MP3 frames decode
// fine back-to-back; a few ms of imperfect join is a non-issue here).
async function synthesizeSpeech(text: string, apiKey: string, voiceId: string): Promise<Uint8Array> {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks: string[] = [];
  let cur = "";
  for (const sent of sentences) {
    if (cur && (cur.length + sent.length + 1) > 2200) { chunks.push(cur); cur = sent; }
    else cur = cur ? `${cur} ${sent}` : sent;
  }
  if (cur) chunks.push(cur);

  const buffers: Uint8Array[] = [];
  for (const chunk of chunks) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text: chunk, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });
    if (!res.ok) throw new Error(`elevenlabs ${res.status}: ${await res.text()}`);
    buffers.push(new Uint8Array(await res.arrayBuffer()));
  }
  const total = buffers.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) { out.set(b, offset); offset += b.length; }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { saved_test_id, test_name, topics, force } = await req.json() as {
      saved_test_id: string; test_name: string; topics: TopicInput[]; force?: boolean;
    };
    if (!saved_test_id) return json({ error: "saved_test_id required" }, 400);
    if (!Array.isArray(topics) || !topics.length) return json({ error: "topics required" }, 400);

    // 1. every caller must be a signed-in, approved member — checked here
    //    (not left to RLS) because the rest of this function uses the admin
    //    client, which bypasses RLS entirely.
    const authHeader = req.headers.get("Authorization") ?? "";
    const scoped = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes } = await scoped.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) return json({ error: "Sign in to continue." }, 401);
    const { data: me } = await admin.from("profiles").select("status").eq("id", uid).maybeSingle();
    if (me?.status !== "approved") return json({ error: "Your account isn't approved yet." }, 403);

    // 2. cache hit? A row already mid-generation ('generating') or already
    //    done ('ready') is returned as-is so the caller just polls it; only
    //    a missing row, a previous error, or an explicit force kicks off a
    //    fresh run.
    if (!force) {
      const { data: cached } = await admin.from("study_guides").select("*").eq("saved_test_id", saved_test_id).maybeSingle();
      if (cached && cached.status !== "error") return json({ ...cached, cached: true });
    }

    // 3. generating (or regenerating) is restricted to the saved test's owner
    //    (RLS on saved_tests scopes the caller's client to their own rows, so
    //    an empty result means "not yours").
    const { data: owned } = await scoped.from("saved_tests").select("id").eq("id", saved_test_id).maybeSingle();
    if (!owned) return json({ error: "You don't own this saved test." }, 403);

    const fail = async (message: string) => {
      await admin.from("study_guides")
        .update({ status: "error", stage: null, error_message: message })
        .eq("saved_test_id", saved_test_id);
      return json({ error: message }, 502);
    };

    // 4. write the placeholder immediately (upsert only touches these
    //    columns — any prior ready content stays in place and stays
    //    viewable/playable until this run finishes) so pollers see progress
    //    right away, from any tab — this row is also the whole response,
    //    returned before the slow part (Claude + ElevenLabs) even starts.
    const { data: placeholder, error: placeholderErr } = await admin
      .from("study_guides")
      .upsert(
        { saved_test_id, created_by: uid, title: test_name, status: "generating", stage: "writing", error_message: null },
        { onConflict: "saved_test_id" },
      )
      .select("*").single();
    if (placeholderErr) return json({ error: placeholderErr.message }, 500);

    // 5. the actual generation runs AFTER the response is sent (via
    //    EdgeRuntime.waitUntil, Supabase's background-task API) — the caller
    //    doesn't wait on this at all, just polls the row for progress.
    const work = (async () => {
      const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
      if (!apiKey) { await fail("ANTHROPIC_API_KEY not set"); return; }

      const topicLines = topics.map((t, i) => {
        const cat = [t.prite_label, ...(t.topics ?? [])].filter(Boolean).join(", ");
        return `${i + 1}. ${t.stem}${cat ? `\n   (topic area: ${cat})` : ""}`;
      }).join("\n\n");

      const prompt =
`A psychiatry residency is holding a class session next Tuesday covering the topics behind the quiz questions listed below. Write prep material residents can read (and listen to) BEFORE the session, to build background and context — not to give away the quiz.

You have deliberately NOT been given the answer choices or which one is correct for any question, because you don't need them and must not guess or state one. Do not resolve, hint at, or narrow down which option is correct for any listed item. Teach the surrounding concepts, definitions, mechanisms, history, and clinically useful context instead, so residents arrive Tuesday with real background — not spoilers.

TOPICS FOR THIS SESSION ("${test_name}"):
${topicLines}

Write:
1. A short, engaging title for the session (not just the test name).
2. A 2-3 sentence intro framing why this material matters clinically.
3. 4-7 sections, each with a heading and a 120-220 word body, grouping related topics together and teaching the underlying concepts with real clinical color — this should read like a good teaching article, not a dry list.
4. A short list (5-10) of key terms/concepts worth knowing cold.
5. A separate "audio_script": a single flowing, conversational narration script meant to be read aloud by a text-to-speech voice as a ~10-minute audio overview (roughly 1400-1600 words) — natural spoken style with verbal transitions, no headings or bullet punctuation, no markdown, covering the same ground as the sections above (still without resolving any quiz answer).

Respond with ONLY a JSON object, no markdown fencing:
{"title": "...", "intro": "...", "sections": [{"heading": "...", "body": "..."}], "key_terms": ["...", ...], "audio_script": "..."}`;

      let aiRes: Response;
      try {
        aiRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages: [{ role: "user", content: prompt }] }),
        });
      } catch (e) { await fail("anthropic request failed: " + String(e)); return; }
      if (!aiRes.ok) { await fail("anthropic " + aiRes.status + ": " + (await aiRes.text())); return; }
      const ai = await aiRes.json();
      const raw = (ai.content?.[0]?.text ?? "").trim().replace(/^```json\s*|\s*```$/g, "");
      let guide: { title: string; intro: string; sections: { heading: string; body: string }[]; key_terms: string[]; audio_script: string };
      try { guide = JSON.parse(raw); } catch { await fail("Claude returned unparseable output"); return; }

      // 6. render the narration to speech (ElevenLabs) and store the MP3
      const elevenKey = Deno.env.get("ELEVENLABS_API_KEY");
      if (!elevenKey) { await fail("ELEVENLABS_API_KEY not set"); return; }
      const voiceId = Deno.env.get("ELEVENLABS_VOICE_ID") || DEFAULT_VOICE_ID;
      const audioPath = `${saved_test_id}.mp3`;

      await admin.from("study_guides").update({ stage: "narrating" }).eq("saved_test_id", saved_test_id);
      try {
        const audioBytes = await synthesizeSpeech(guide.audio_script ?? "", elevenKey, voiceId);
        const { error: upErr } = await admin.storage.from("study-audio")
          .upload(audioPath, audioBytes, { contentType: "audio/mpeg", upsert: true });
        if (upErr) { await fail("storage upload failed: " + upErr.message); return; }
      } catch (e) { await fail("speech synthesis failed: " + String(e)); return; }

      // 7. done — fill in the real content (service role bypasses RLS)
      const row = {
        saved_test_id,
        created_by: uid,
        title: guide.title, intro: guide.intro,
        sections: guide.sections ?? [], key_terms: guide.key_terms ?? [],
        audio_script: guide.audio_script ?? "",
        audio_path: audioPath,
        status: "ready", stage: null, error_message: null,
      };
      await admin.from("study_guides").upsert(row, { onConflict: "saved_test_id" });
    })();

    // deno-lint-ignore no-explicit-any
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(work);
    else await work; // local `supabase functions serve` has no background-task API

    return json({ ...placeholder, cached: false, started: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
