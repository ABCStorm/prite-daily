# Anki flashcards — setup

The app turns any question into an Anki Cloze card via AI, generated once and
cached in the `flashcards` table. The AI call runs in a Supabase Edge Function
so your API key never touches the browser.

No database migration is needed (the `flashcards` table already exists). Three
steps:

## 1. Get an Anthropic API key
1. Go to **https://console.anthropic.com** → sign in.
2. **Settings → API Keys → Create Key** → copy it (starts with `sk-ant-...`).
3. You'll need a little credit on the account (Settings → Billing). Cards use
   **Claude Haiku** — a fraction of a cent each, and only generated once per
   question ever, so the whole 3,590-question bank caps out around a dollar or
   two total.

## 2. Add the key as an Edge Function secret
1. Supabase → **Edge Functions** (left sidebar) → **Secrets** (or
   **Project Settings → Edge Functions → Add secret**).
2. Name: `ANTHROPIC_API_KEY`  ·  Value: your `sk-ant-...` key → Save.

## 3. Deploy the function
**Dashboard (no CLI):**
1. Supabase → **Edge Functions → Deploy a new function** (or "Create function").
2. Name it **exactly** `generate-flashcard`.
3. Paste the contents of `supabase/functions/generate-flashcard/index.ts`
   (it's on your clipboard) → **Deploy**.

**Or via CLI** (if you have it): `supabase functions deploy generate-flashcard`.

## Done
Open any question → **Flashcard** tab → **Generate flashcard**. First click
calls the AI and caches the card; everyone after gets it instantly. Admins can
**Refine** (edit the canonical card) or **Regenerate**. **Download for Anki**
gives a `.txt` that imports as a Cloze note (Text + Extra) — in Anki:
File → Import, or just double-click.
