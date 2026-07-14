-- ----------------------------------------------------------------------------
-- spaced_repetition — private, one row per (user, question).
--
-- Scheduling state for the SM-2 flashcard review queue. A row is created the
-- first time a user misses a question (due immediately), then progresses only
-- through grading in the Review panel (Again/Hard/Good/Easy) — separate from
-- the regular quiz flow, same relationship the Missed-questions panel has to
-- `answers`. Card content itself (front/back) comes from the existing
-- `flashcards` table, keyed by the same question_id.
-- ----------------------------------------------------------------------------
create table if not exists spaced_repetition (
  user_id          uuid not null references profiles (id) on delete cascade,
  question_id      text not null,
  ease_factor      real not null default 2.5,
  interval_days    real not null default 0,
  repetitions      int not null default 0,
  due_at           timestamptz not null default now(),
  last_grade       text,
  reviewed_count   int not null default 0,
  last_reviewed_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  primary key (user_id, question_id)
);

alter table spaced_repetition enable row level security;

drop policy if exists spaced_repetition_own on spaced_repetition;
create policy spaced_repetition_own on spaced_repetition for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists spaced_repetition_due_idx on spaced_repetition (user_id, due_at);
