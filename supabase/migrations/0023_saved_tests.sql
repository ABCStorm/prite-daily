-- ----------------------------------------------------------------------------
-- saved_tests — named, hand-picked question sets for running a class session
-- (live poll), re-studying, or exporting to PowerPoint.
--
-- Previously these lived in per-device localStorage, on the assumption that
-- whoever builds a test is also the one who runs it on the same machine. That
-- broke in practice: a resident built a test at home, then it wasn't there
-- when they signed in on the presenting computer. Storing it under the
-- creating user's account (same private-per-user model as highlights /
-- individual_notes) makes it follow the account across devices instead.
-- ----------------------------------------------------------------------------
create table if not exists saved_tests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles (id) on delete cascade,
  name       text not null,
  qids       jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists saved_tests_user_id_idx on saved_tests (user_id, created_at desc);

alter table saved_tests enable row level security;

drop policy if exists saved_tests_own on saved_tests;
create policy saved_tests_own on saved_tests for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
