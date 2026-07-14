-- ----------------------------------------------------------------------------
-- study_guides — an on-demand, AI-written prep page + ~10-minute audio script
-- for a saved test, so a speaker can send residents something to read/listen
-- to before Tuesday's class session.
--
-- One guide per saved test (unique on saved_test_id; regenerating overwrites).
-- Generation only ever sees each question's stem + topic tags — never the
-- options, correct answer, or explanation — so the guide is structurally
-- incapable of spoiling the quiz; it can only teach background and context.
-- ----------------------------------------------------------------------------
create table if not exists study_guides (
  id            uuid primary key default gen_random_uuid(),
  saved_test_id uuid not null unique references saved_tests (id) on delete cascade,
  created_by    uuid references profiles (id) on delete set null,
  title         text not null,
  intro         text not null default '',
  sections      jsonb not null default '[]'::jsonb,   -- [{ heading, body }]
  key_terms     jsonb not null default '[]'::jsonb,   -- ["term", ...]
  audio_script  text not null default '',              -- ~10-min read-aloud narration
  created_at    timestamptz not null default now()
);

create index if not exists study_guides_test_idx on study_guides (saved_test_id);

alter table study_guides enable row level security;

-- readable by any approved member (whoever the speaker sends the link to)
drop policy if exists study_guides_read on study_guides;
create policy study_guides_read on study_guides for select using (is_approved());

-- only the saved test's owner may create/refresh/delete its guide directly;
-- in practice writes go through the generate-study-guide edge function
-- (service role), which checks ownership itself before writing.
drop policy if exists study_guides_write on study_guides;
create policy study_guides_write on study_guides for all
  using (exists (select 1 from saved_tests st where st.id = saved_test_id and st.user_id = auth.uid()))
  with check (exists (select 1 from saved_tests st where st.id = saved_test_id and st.user_id = auth.uid()));
