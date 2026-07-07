-- official_poll_results: presenter-submitted snapshots of a completed live-poll
-- group review session, kept for admin record-keeping. Not created
-- automatically — only when the presenter explicitly marks a session as an
-- official class review ("Mark as official" on the final-standings screen).
create table if not exists official_poll_results (
  id                 uuid primary key default gen_random_uuid(),
  submitted_by       uuid references profiles (id) on delete set null,
  submitted_at       timestamptz not null default now(),
  poll_code          text not null,
  total_questions    int not null,
  total_participants int not null,
  standings          jsonb not null,  -- TeamStanding[] snapshot
  question_stats     jsonb not null   -- per-question vote-breakdown snapshot
);
create index if not exists official_poll_results_submitted_at_idx on official_poll_results (submitted_at desc);

alter table official_poll_results enable row level security;

-- Any approved member can submit their own session as official.
drop policy if exists official_poll_results_insert on official_poll_results;
create policy official_poll_results_insert on official_poll_results for insert
  with check (submitted_by = auth.uid() and is_approved());

-- Only admins can read or clear the archive (download-all / clear-all).
drop policy if exists official_poll_results_read on official_poll_results;
create policy official_poll_results_read on official_poll_results for select
  using (is_admin());

drop policy if exists official_poll_results_delete on official_poll_results;
create policy official_poll_results_delete on official_poll_results for delete
  using (is_admin());
