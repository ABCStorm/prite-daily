-- ============================================================================
-- Per-user live-poll answer history. Live polls (lib/poll.ts) are otherwise
-- ephemeral — a Realtime broadcast channel with no database table — and
-- official_poll_results only snapshots team-level aggregates, not individual
-- votes. This table lets each resident see their own personal poll stats
-- (separate from their solo-practice `answers` history, which drives mastery
-- tracking / spaced repetition and shouldn't be mixed with poll performance).
--
-- One row per question a participant actually voted on once it was revealed;
-- unlike `answers` (one row per question, upserted), the same question can
-- recur across different poll sessions, so this is insert-only, no PK on
-- (user_id, question_id).
-- ============================================================================
create table if not exists poll_answers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (id) on delete cascade,
  question_id text not null,
  poll_code   text not null,
  team        text,
  choice      text not null,
  correct     bool not null,
  created_at  timestamptz not null default now()
);
create index if not exists poll_answers_user_idx on poll_answers (user_id);
create index if not exists poll_answers_poll_idx on poll_answers (poll_code);

alter table poll_answers enable row level security;

drop policy if exists poll_answers_own on poll_answers;
create policy poll_answers_own on poll_answers for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
