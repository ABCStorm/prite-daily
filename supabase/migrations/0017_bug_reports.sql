-- ============================================================================
-- In-app bug / issue reporting. Any approved member can file a report (usually
-- tied to a specific question — wrong answer, typo, missing/duplicate, etc.).
-- Admins read + triage all of them; reporters can see their own. Designed so a
-- daily AI checker can also read open reports and act on them.
-- ============================================================================
create table if not exists bug_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid references profiles (id) on delete set null,
  question_id text,                         -- null = general/app-wide report
  kind        text not null default 'other',-- wrong_answer | typo | missing | duplicate | other
  message     text not null,
  context     text,                         -- free text: study mode, year, etc.
  status      text not null default 'open', -- open | resolved | dismissed
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists bug_reports_status_idx on bug_reports (status, created_at desc);
create index if not exists bug_reports_question_idx on bug_reports (question_id);

alter table bug_reports enable row level security;

drop policy if exists bug_insert on bug_reports;
create policy bug_insert on bug_reports for insert
  with check (reporter_id = auth.uid() and is_approved());

drop policy if exists bug_read on bug_reports;
create policy bug_read on bug_reports for select
  using (reporter_id = auth.uid() or is_admin());

drop policy if exists bug_update on bug_reports;
create policy bug_update on bug_reports for update using (is_admin()) with check (is_admin());

drop policy if exists bug_delete on bug_reports;
create policy bug_delete on bug_reports for delete using (is_admin());
