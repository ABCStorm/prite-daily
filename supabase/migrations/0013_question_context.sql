-- ----------------------------------------------------------------------------
-- question_context — one shared "historical / interesting context" blurb per
-- question, meant as a memory aid (the story/origin/etymology/landmark-study
-- behind the answer). Same canonical-cache model as flashcards: every approved
-- member reads the same row; only admins (and the loader, via the service role)
-- write it. The blurbs are bulk-generated up front and loaded by 0014.
-- ----------------------------------------------------------------------------
create table if not exists question_context (
  question_id text primary key,
  context     text not null,
  updated_at  timestamptz not null default now()
);

alter table question_context enable row level security;

drop policy if exists qctx_read on question_context;
create policy qctx_read on question_context for select using (is_approved() or is_admin());

drop policy if exists qctx_write on question_context;
create policy qctx_write on question_context for all using (is_admin()) with check (is_admin());
