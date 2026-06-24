-- ----------------------------------------------------------------------------
-- highlights — private, one row per (user, question).
--
-- `ranges` is a JSON array of { field, start, end } character offsets into a
-- question's text fields (currently only the stem, "field":"stem"). Storing
-- offsets (not marked-up HTML) keeps it robust: the question text is static, so
-- the offsets stay valid, and a user's highlights persist + sync across devices
-- — same private-per-user model as individual_notes.
-- ----------------------------------------------------------------------------
create table if not exists highlights (
  user_id     uuid not null references profiles (id) on delete cascade,
  question_id text not null,
  ranges      jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (user_id, question_id)
);

alter table highlights enable row level security;

drop policy if exists highlights_own on highlights;
create policy highlights_own on highlights for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
