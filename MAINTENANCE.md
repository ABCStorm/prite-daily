# PRITE Daily — keeping it running without a programmer

This guide is for whoever inherits the site (an education chief, a program
coordinator — no coding required). The technical companion for developers/AI
tools is `HANDOFF.md`; you should never need it for normal years.

## The 60-second mental model

- The site lives at **pritedaily.com**, hosted on **Cloudflare Pages** (free).
- All data (accounts, answers, teams, rosters) lives in **Supabase** (free tier).
- People sign in with Google. If their Google name matches the **auto-approval
  roster**, they're approved instantly; otherwise they wait in the admin
  Approvals queue.
- Everything below is done **inside the app** — sign in as an admin and open
  **Approvals** in the top bar.

## Every June/July (the only required maintenance)

1. **Add the incoming intern class.** Approvals → **Roster** tab → type each
   intern's first + last name, pick "Class of 20XX (incoming R1)", press Add.
   Use the name as it appears on their **Google account** (nicknames like
   "Bobby" won't match "Robert" — but a matching first initial + last name is
   enough, so most are fine). If someone still lands in the Pending queue,
   just press Approve there.
2. **Press "Sync PGY levels".** Same tab. This bumps every matched resident to
   the right R-level for the new academic year and turns the graduated class
   into alumni. It's safe to press more than once.
3. **Re-generate season teams** for the new year: top bar → Polls & Teams →
   regenerate/edit rosters (this reshuffles, so do it once at the start of the
   year, then hand-edit).
4. **Pass the torch.** In Approvals → People, toggle **Admin** on for the new
   chiefs, **Ed chief** for those who should sit out team randomization, and
   **Guides** for non-admins allowed to generate AI study guides (those cost
   real money — see below). Remove/retire your own flags when you leave.

Removing a roster name only affects *future* sign-ups; existing accounts are
managed on the People tab (Block if needed).

## Accounts someone must own (transfer these before you leave)

| What | Where | Cost |
|---|---|---|
| Hosting + the pritedaily.com domain | Cloudflare account | free hosting; domain ≈ $10–12/yr auto-renew |
| Database, sign-in, file storage | Supabase account (project `prite-daily`) | free tier |
| "Sign in with Google" | Google Cloud Console project (OAuth credentials) | free |
| Code backup | GitHub repo `ABCStorm/prite-daily` | free |
| AI study-guide generation | Anthropic + OpenAI API keys (stored inside Supabase) | pay-per-use, a few $ per guide |

Each of these supports adding a second owner/member — do that rather than
sharing passwords. **If the domain lapses**, the site still works at
`prite-daily.pages.dev`. **If the program's AI keys run out of money**, only
study-guide generation stops — and anyone allowed to generate can keep going by
pasting their **own** Anthropic/OpenAI keys into the app under **Settings →
"Your own AI keys"** (keys stay in their browser and bill their account, so a
future chief never needs access to the original key accounts at all).

## Things that DO need a programmer (or an AI coding assistant)

- Adding a new PRITE year's questions to the bank (a PDF-extraction pipeline —
  see `HANDOFF.md`).
- Changing features, fixing bugs, redeploying the site.

Any capable AI coding tool pointed at this folder (or the GitHub repo) with
`HANDOFF.md` can do these; that's how the site was built.

## If something breaks

- **Site down / won't load:** check status.cloudflare.com and
  status.supabase.com first — outages there fix themselves.
- **Someone can't sign in / stuck pending:** approve them manually in
  Approvals; add them to the Roster tab so it doesn't recur.
- **Supabase pauses the project** (free projects pause after ~a week of zero
  traffic): log into supabase.com and press Restore. Nothing is lost.
