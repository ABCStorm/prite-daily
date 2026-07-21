// Supabase Edge Function: generate-study-guide
//
// Turns a saved test into a prep page + ~10-minute audio overview for the
// class to read/listen to before the session, generate-once-and-cache:
//   - if a guide already exists for the saved_test_id, return it (no AI call)
//   - else call Anthropic (Opus) to write a background/context study guide +
//     narration script, render the narration to speech via OpenAI TTS, store
//     the audio in the `study-audio` bucket and the text in `study_guides`,
//     and return it.
//
// Deliberately never sees each question's options, correct answer, or
// explanation — only stem + topic tags are sent to the model — so it is
// structurally unable to spoil the quiz, only to teach around it.
//
// Secrets needed (Project Settings -> Edge Functions): ANTHROPIC_API_KEY,
// OPENAI_API_KEY (and optionally OPENAI_TTS_VOICE to override the default
// narration voice). SUPABASE_URL, SUPABASE_ANON_KEY, and
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

// OpenAI's cheapest TTS tier (vs. tts-1-hd) — plenty good for a study aid.
// Override the voice with the OPENAI_TTS_VOICE secret (one of alloy, echo,
// fable, onyx, nova, shimmer, ash, coral, sage).
const TTS_MODEL = "tts-1";
const DEFAULT_VOICE = "alloy";

type TopicInput = { stem: string; prite_category?: string; prite_label?: string; topics?: string[] };

// fetch with a hard timeout. Without this, a hung upstream connection (opens
// but never responds) would make `await fetch` block forever — never
// resolving and never throwing — so the whole generation silently sticks at
// its current stage with no error ever recorded. On timeout this aborts and
// throws, which the caller's try/catch turns into a visible status='error'.
async function fetchWithTimeout(url: string, opts: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new Error(`request to ${new URL(url).host} timed out after ${ms / 1000}s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// OpenAI's TTS endpoint caps input at 4096 characters, well under a
// ~10-minute script, so split on sentence boundaries into request-sized
// chunks, synthesize them CONCURRENTLY (Promise.all preserves order), and
// stitch the resulting MP3s together (simple byte concatenation — MP3 frames
// decode fine back-to-back; a few ms of imperfect join is a non-issue here).
// Concurrency keeps total wall-clock ≈ one chunk's time rather than the sum,
// which matters against the edge function's runtime budget.
async function synthesizeSpeech(text: string, apiKey: string, voice: string): Promise<Uint8Array> {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const chunks: string[] = [];
  let cur = "";
  for (const sent of sentences) {
    if (cur && (cur.length + sent.length + 1) > 3500) { chunks.push(cur); cur = sent; }
    else cur = cur ? `${cur} ${sent}` : sent;
  }
  if (cur) chunks.push(cur);

  const buffers = await Promise.all(chunks.map(async (chunk) => {
    const res = await fetchWithTimeout("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: TTS_MODEL, voice, input: chunk, response_format: "mp3" }),
    }, 90_000);
    if (!res.ok) throw new Error(`openai tts ${res.status}: ${await res.text()}`);
    return new Uint8Array(await res.arrayBuffer());
  }));

  const total = buffers.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) { out.set(b, offset); offset += b.length; }
  return out;
}

// One AI illustration for a slide, via OpenAI's image API (same key as TTS).
// Returns null on any failure — an image is always optional.
async function generateSlideImage(prompt: string, apiKey: string): Promise<Uint8Array | null> {
  try {
    const res = await fetchWithTimeout("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-1", prompt, n: 1, size: "1024x1024", quality: "medium" }),
    }, 120_000);
    if (!res.ok) { console.warn("image gen " + res.status + ": " + (await res.text())); return null; }
    const b64 = (await res.json())?.data?.[0]?.b64_json;
    if (!b64) return null;
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch (e) {
    console.warn("image gen failed:", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // slides_only: the standalone "Prep slides" button — write the guide text
    // + slide deck but skip TTS entirely (fast + no OpenAI cost). A later
    // full request on the same test backfills just the audio from the stored
    // audio_script without re-calling Claude.
    // anthropic_key / openai_key: optional bring-your-own keys from the
    // caller's browser (Settings → AI keys). Used for this request only in
    // place of the project secrets, never logged or stored.
    const { saved_test_id, test_name, topics, force, session_date, slides_only, anthropic_key, openai_key } = await req.json() as {
      saved_test_id: string; test_name: string; topics: TopicInput[]; force?: boolean; session_date?: string | null; slides_only?: boolean;
      anthropic_key?: string | null; openai_key?: string | null;
    };
    const ownAnthropicKey = (anthropic_key ?? "").trim();
    const ownOpenaiKey = (openai_key ?? "").trim();
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
    const { data: me } = await admin.from("profiles").select("status, role, is_admin").eq("id", uid).maybeSingle();
    if (me?.status !== "approved") return json({ error: "Your account isn't approved yet." }, 403);

    // generation costs real money (Claude + image gen + TTS), so it's limited
    // to admins and the study_guide_creators allowlist (the education chiefs).
    // Reading/listening to finished guides stays open to every approved member.
    // (0047 moved admin rights to the is_admin flag; role='admin' is legacy.)
    if (me.role !== "admin" && !me.is_admin) {
      const { data: allowed } = await admin.from("study_guide_creators").select("profile_id").eq("profile_id", uid).maybeSingle();
      if (!allowed) return json({ error: "Only the education chiefs can generate study guides — ask one of them to make it (everyone can still view finished guides)." }, 403);
    }

    // 2. cache hit? A row mid-generation is always returned as-is so the
    //    caller just polls it. A finished row is returned if it already has
    //    what this caller needs — slides for slides_only, audio otherwise.
    //    Otherwise fall through and fill in only the missing piece: ttsOnly
    //    narrates the already-written audio_script (no Claude call) when a
    //    slides-only guide is later upgraded to a full one; a ready row
    //    without slides (pre-slides guide) regenerates from scratch.
    let ttsOnly = false;
    let cachedTitle: string | null = null;
    if (!force) {
      const { data: cached } = await admin.from("study_guides").select("*").eq("saved_test_id", saved_test_id).maybeSingle();
      if (cached && cached.status !== "error") {
        const hasSlides = Array.isArray(cached.slides) && cached.slides.length > 0;
        if (cached.status === "generating") return json({ ...cached, cached: true });
        if (slides_only ? hasSlides : cached.audio_path) return json({ ...cached, cached: true });
        if (!slides_only && cached.text_ready && cached.audio_script) { ttsOnly = true; cachedTitle = cached.title; }
      }
    }

    // 3. the saved test just has to exist — any caller who cleared the
    //    chiefs/admins gate above may (re)generate for any test, so e.g. an
    //    admin can add missing audio to a guide another chief created.
    const { data: exists } = await admin.from("saved_tests").select("id").eq("id", saved_test_id).maybeSingle();
    if (!exists) return json({ error: "That saved test no longer exists." }, 404);

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
    //    returned before the slow part (Claude + OpenAI TTS) even starts.
    //    ttsOnly keeps the row's existing (Claude-written) title and jumps
    //    straight to the narrating stage.
    const { data: placeholder, error: placeholderErr } = await admin
      .from("study_guides")
      .upsert(
        {
          saved_test_id, created_by: uid,
          // title must always be present: Postgres checks NOT NULL on the
          // proposed insert row BEFORE resolving the on-conflict update, so
          // omitting it here 500s even though the row already exists.
          title: ttsOnly ? (cachedTitle ?? test_name) : test_name,
          status: "generating", stage: ttsOnly ? "narrating" : "writing",
          error_message: null, generation_started_at: new Date().toISOString(), session_date: session_date ?? null,
        },
        { onConflict: "saved_test_id" },
      )
      .select("*").single();
    if (placeholderErr) return json({ error: placeholderErr.message }, 500);

    // 5. the actual generation runs AFTER the response is sent (via
    //    EdgeRuntime.waitUntil, Supabase's background-task API) — the caller
    //    doesn't wait on this at all, just polls the row for progress.
    const work = (async () => {
      // Everything in here is wrapped in one try/catch — anything that
      // throws (even somewhere not individually guarded below) still lands
      // in fail(), so the row never gets stranded at status='generating'
      // with no error shown.
      try {
        let script = "";

        if (ttsOnly) {
          // Upgrading a slides-only guide to a full one: the text (and its
          // narration script) were already written — just narrate it.
          const { data: row } = await admin.from("study_guides").select("audio_script").eq("saved_test_id", saved_test_id).maybeSingle();
          script = row?.audio_script ?? "";
          if (!script) { await fail("no stored narration script to narrate"); return; }
        } else {
        const apiKey = ownAnthropicKey || Deno.env.get("ANTHROPIC_API_KEY");
        if (!apiKey) { await fail("No Anthropic API key — add your own under Settings → Your own AI keys, or set the ANTHROPIC_API_KEY secret"); return; }

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

        const aiRes = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify({ model: MODEL, max_tokens: 12000, messages: [{ role: "user", content: prompt }] }),
        }, 150_000);
        if (!aiRes.ok) { await fail("anthropic " + aiRes.status + ": " + (await aiRes.text())); return; }
        const ai = await aiRes.json();
        const raw = (ai.content?.[0]?.text ?? "").trim().replace(/^```json\s*|\s*```$/g, "");
        let guide: { title: string; intro: string; sections: { heading: string; body: string }[]; key_terms: string[]; audio_script: string };
        try { guide = JSON.parse(raw); } catch { await fail("Claude returned unparseable output"); return; }

        // 6. write the TEXT now — before slides/audio — and flip text_ready.
        //    The page and the library can show the material immediately; the
        //    deck and audio catch up (or, if they fail below, the text stays
        //    viewable regardless).
        const { error: textErr } = await admin.from("study_guides").update({
          title: guide.title, intro: guide.intro,
          sections: guide.sections ?? [], key_terms: guide.key_terms ?? [],
          audio_script: guide.audio_script ?? "",
          text_ready: true, stage: "designing",
        }).eq("saved_test_id", saved_test_id);
        if (textErr) { await fail("saving the guide text failed: " + textErr.message); return; }

        // 6b. dedicated slide-designer pass — a SECOND Claude call focused
        //     purely on slide craft (very little text per slide, large type,
        //     varied layouts), then AI illustration images for the most
        //     visual slides. Deliberately a separate paid call rather than
        //     bolting slides onto the prose prompt: the deck reads like a
        //     designed deck, not reformatted paragraphs.
        try {
          const slidePrompt =
`You are designing a teaching slide deck (PowerPoint) for psychiatry residents, sent as pre-reading before a class session. Below is the written study guide the deck must teach. The same no-spoiler rule applies: this material deliberately avoids resolving any quiz question — do not introduce anything that would.

STUDY GUIDE (JSON):
${JSON.stringify({ title: guide.title, intro: guide.intro, sections: guide.sections, key_terms: guide.key_terms })}

Design 12-18 slides. Every slide must be readable from the back of a lecture hall: VERY little text, large type. Use these layouts:
- {"layout": "divider", "title": "<theme name, max 5 words>", "support": "<subtitle, max 12 words>", "notes": "...", "image_prompt": "..."} — a full-bleed section break before each theme.
- {"layout": "bullets", "title": "<max 8 words>", "bullets": ["<max 8 words each>", ...3-5 total], "notes": "...", "image_prompt": "<optional>"} — the workhorse concept slide.
- {"layout": "bigfact", "big_text": "<ONE memorable teaching point, max 14 words>", "support": "<max 20 words of context>", "notes": "..."} — use for the highest-yield pearls.

Structure: a "bullets" roadmap slide first, a "divider" opening each theme, concept slides under it, and a final take-home slide. "notes" on every slide are real speaker notes — 2-4 spoken-style sentences carrying the teaching the sparse slide text can't.

"image_prompt": include on the 4-6 MOST visual slides only — a prompt for an AI image generator describing a clean, professional medical-education illustration in a flat modern style with a muted teal palette. The image must contain NO text, labels, letters, or numbers (generators render text badly).

Respond with ONLY a JSON object, no markdown fencing: {"slides": [ ... ]}`;

          const dRes = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
            body: JSON.stringify({ model: MODEL, max_tokens: 9000, messages: [{ role: "user", content: slidePrompt }] }),
          }, 150_000);
          if (!dRes.ok) throw new Error("anthropic (slides) " + dRes.status + ": " + (await dRes.text()));
          const dRaw = ((await dRes.json()).content?.[0]?.text ?? "").trim().replace(/^```json\s*|\s*```$/g, "");
          const slides = (JSON.parse(dRaw).slides ?? []) as {
            layout?: string; title?: string; bullets?: string[]; big_text?: string;
            support?: string; notes?: string; image_prompt?: string; image_path?: string | null;
          }[];
          if (!slides.length) throw new Error("slide designer returned no slides");

          // Illustrations: first 6 image_prompts, generated concurrently. A
          // single failed image just leaves that slide text-only — never
          // fails the deck.
          const imgKey = ownOpenaiKey || Deno.env.get("OPENAI_API_KEY");
          if (imgKey) {
            const wanted = slides.map((sl, i) => ({ sl, i })).filter((x) => x.sl.image_prompt).slice(0, 6);
            await Promise.all(wanted.map(async ({ sl, i }) => {
              const bytes = await generateSlideImage(sl.image_prompt!, imgKey);
              if (!bytes) return;
              const path = `${saved_test_id}/${i}.png`;
              const { error } = await admin.storage.from("study-slides").upload(path, bytes, { contentType: "image/png", upsert: true });
              if (!error) sl.image_path = path;
            }));
          }

          const { error: slidesErr } = await admin.from("study_guides")
            .update({ slides }).eq("saved_test_id", saved_test_id);
          if (slidesErr) throw new Error("saving the slides failed: " + slidesErr.message);
        } catch (e) {
          // slides_only has nothing else to deliver — surface the error. A
          // full run still has audio to make; log and move on deck-less.
          if (slides_only) { await fail(String(e)); return; }
          console.warn("slide design failed, continuing without deck:", e);
        }

        // slides_only: done here — no narration. (Any previously generated
        // audio_path is left in place, though a slides-only run normally has
        // none.)
        if (slides_only) {
          const { error: doneErr } = await admin.from("study_guides").update({
            status: "ready", stage: null, error_message: null,
          }).eq("saved_test_id", saved_test_id);
          if (doneErr) await fail("saving the finished guide failed: " + doneErr.message);
          return;
        }
        await admin.from("study_guides").update({ stage: "narrating" }).eq("saved_test_id", saved_test_id);
        script = guide.audio_script ?? "";
        } // end !ttsOnly

        // 7. render the narration to speech (OpenAI TTS) and store the MP3.
        //    A failure here leaves status='error' but text_ready stays true,
        //    so the written guide remains readable — only the audio is missing.
        const openaiKey = ownOpenaiKey || Deno.env.get("OPENAI_API_KEY");
        if (!openaiKey) { await fail("No OpenAI API key — add your own under Settings → Your own AI keys, or set the OPENAI_API_KEY secret"); return; }
        const voice = Deno.env.get("OPENAI_TTS_VOICE") || DEFAULT_VOICE;
        const audioPath = `${saved_test_id}.mp3`;

        const audioBytes = await synthesizeSpeech(script, openaiKey, voice);
        const { error: upErr } = await admin.storage.from("study-audio")
          .upload(audioPath, audioBytes, { contentType: "audio/mpeg", upsert: true });
        if (upErr) { await fail("storage upload failed: " + upErr.message); return; }

        // 8. done — mark audio ready
        const { error: finalErr } = await admin.from("study_guides").update({
          audio_path: audioPath, status: "ready", stage: null, error_message: null,
        }).eq("saved_test_id", saved_test_id);
        if (finalErr) await fail("saving the finished guide failed: " + finalErr.message);
      } catch (e) {
        await fail(String(e));
      }
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
