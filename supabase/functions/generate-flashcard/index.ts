// Supabase Edge Function: generate-flashcard
//
// Turns a PRITE question into an Anki Cloze card, generate-once-and-cache:
//   - if a card already exists for the question_id, return it (no AI call)
//   - else call Anthropic (Haiku) to write ONE cloze sentence + an Extra field,
//     store it in the `flashcards` table, and return it.
//
// Secrets needed (Project Settings -> Edge Functions): ANTHROPIC_API_KEY.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const MODEL = "claude-opus-4-8";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { question_id, stem, options, answer_letter, answer_text, force } = await req.json();
    if (!question_id) return json({ error: "question_id required" }, 400);

    // 1. cache hit?
    if (!force) {
      const { data: cached } = await admin.from("flashcards").select("*").eq("question_id", question_id).maybeSingle();
      if (cached) return json({ ...cached, cached: true });
    }

    // 2. generate
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY not set" }, 500);

    const optText = (options ?? []).map((o: { letter: string; text: string }) => `${o.letter}. ${o.text}`).join("\n");
    const prompt =
`You are making an Anki Cloze flashcard from a psychiatry board (PRITE) question.

QUESTION:
${stem}

OPTIONS:
${optText}

CORRECT ANSWER: ${answer_letter} — ${answer_text}

Write ONE cloze-deletion sentence that captures the single highest-yield teaching point. Blank out the 1-2 key terms with {{c1::...}} (and {{c2::...}} only if a second distinct term is essential). Keep it a crisp, standalone fact — not a restatement of the vignette.

Then write an "extra" field: the correct answer and a 1-2 sentence explanation of why.

Respond with ONLY a JSON object, no markdown:
{"cloze_text": "...", "extra": "..."}`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 600, messages: [{ role: "user", content: prompt }] }),
    });
    if (!aiRes.ok) return json({ error: "anthropic " + aiRes.status, detail: await aiRes.text() }, 502);
    const ai = await aiRes.json();
    const raw = (ai.content?.[0]?.text ?? "").trim().replace(/^```json\s*|\s*```$/g, "");
    let card: { cloze_text: string; extra: string };
    try { card = JSON.parse(raw); } catch { return json({ error: "bad AI output", raw }, 502); }

    // 3. cache (service role bypasses RLS)
    const row = { question_id, cloze_text: card.cloze_text, extra: card.extra, updated_at: new Date().toISOString() };
    await admin.from("flashcards").upsert(row, { onConflict: "question_id" });
    return json({ ...row, cached: false });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
