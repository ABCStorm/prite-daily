-- ============================================================================
-- Shared Wright backend: one roster + leave (Wrightleave) + records (WrightRecord)
-- living alongside PRITE Daily in the same Supabase project, so all three apps
-- share Google login and the leave/attendance/duty-hours data flows freely.
--
-- Conventions:
--   * people           — the unified roster (residents, attendings, coordinators).
--   * leave_*          — Wrightleave tables.
--   * rec_*            — WrightRecord tables.
--   * Nested/workflow-y sub-shapes (approval chains, timelines, day entries,
--     rating score maps) stay JSONB so the app ports are mechanical; only
--     fields that get queried/joined/filtered are real columns.
--   * Browser clients use supabase-js under RLS. Token-link flows (attendings
--     approving by email, duty-hours magic links, NFC taps) have no login —
--     those requests go through the apps' Workers using the service-role key,
--     so RLS here only needs to model signed-in residents/admins.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Unified roster
-- ---------------------------------------------------------------------------
create table people (
  id uuid primary key default gen_random_uuid(),
  -- Linked lazily: on first Google sign-in, a trigger matches auth.users.email
  -- to people.email. Unmatched sign-ins land in leave_pending_logins for admin
  -- approval (Wrightleave's existing pattern).
  auth_user_id uuid unique references auth.users (id) on delete set null,
  name text not null,
  email text unique,
  phone text,
  role text not null check (role in ('resident', 'attending', 'coordinator')),
  pgy int check (pgy between 1 and 4),
  class_label text,
  site text check (site in ('inpatient', 'outpatient')),
  active boolean not null default true,
  is_admin boolean not null default false,
  -- Old ids from LeaveFlow roster / WrightRecord residents+attendings, kept so
  -- both apps' data imports can re-point their foreign keys deterministically.
  legacy_leave_id text unique,
  legacy_rec_id text unique,
  created_at timestamptz not null default now()
);

create index people_role_active_idx on people (role, active);

-- Auto-link a Google sign-in to its roster row by email.
create or replace function link_person_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update people
  set auth_user_id = new.id
  where auth_user_id is null
    and email is not null
    and lower(email) = lower(new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function link_person_on_signup();

-- Convenience for RLS policies.
create or replace function current_person_id()
returns uuid
language sql
stable
as $$
  select id from people where auth_user_id = auth.uid();
$$;

create or replace function current_person_is_admin()
returns boolean
language sql
stable
as $$
  select coalesce((select is_admin from people where auth_user_id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- Wrightleave (leave_*)
-- ---------------------------------------------------------------------------

-- Rotation/service schedule: one row per person per day (LeaveFlow `schedule`).
create table leave_schedule (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  person_id uuid not null references people (id) on delete cascade,
  assignment text,
  is_off boolean not null default false,
  unique (date, person_id)
);

create index leave_schedule_person_date_idx on leave_schedule (person_id, date);
create index leave_schedule_date_idx on leave_schedule (date);

-- Leave requests. The approval chain and event timeline keep their LeaveFlow
-- JSON shapes (workflow.js owns their semantics); the columns are what other
-- code filters on — including WrightRecord's duty-hours + attendance reads.
create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references people (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'cancelled', 'logged')),
  leave_type text not null,
  start_date date not null,
  end_date date not null,
  return_date date,
  reason text,
  exception_reason text,
  policy jsonb,
  services jsonb,             -- affected services/attendings snapshot
  covering_residents jsonb,
  already_off jsonb,
  psych jsonb,                -- psychRequired/psychCover/confirm token+status
  blocks jsonb,               -- startBlock/endBlock/crossesBlock
  approvals jsonb not null default '[]'::jsonb,
  timeline jsonb not null default '[]'::jsonb,
  cal_token text,             -- per-request .ics token
  needs_attention boolean not null default false,
  deny_reason text,
  resident_nudged_at timestamptz,
  coord_escalate_at timestamptz,
  decided_at timestamptz,
  cancelled_at timestamptz,
  cancel_note text,
  created_at timestamptz not null default now()
);

create index leave_requests_requester_idx on leave_requests (requester_id);
-- WrightRecord's hot path: "approved leave overlapping this date range?"
create index leave_requests_status_dates_idx on leave_requests (status, start_date, end_date);

create table leave_call_nights (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references people (id) on delete cascade,
  date date not null,
  type text not null
);

create index leave_call_nights_resident_idx on leave_call_nights (resident_id, date);
create index leave_call_nights_date_idx on leave_call_nights (date);

create table leave_weekend_coverage (
  id uuid primary key default gen_random_uuid(),
  sat_date date not null unique,
  slots jsonb not null default '{}'::jsonb  -- { mvhR1, mvhR2, mvhBackup, ketteringR2, clR2 }
);

create table leave_trades (
  id uuid primary key default gen_random_uuid(),
  call_night_id uuid references leave_call_nights (id) on delete set null,
  resident_id uuid not null references people (id) on delete cascade,
  date date,
  type text,
  label text,
  offer_kind text,
  offer_value text,
  note text,
  status text not null default 'open',
  accepted_by uuid references people (id),
  created_at timestamptz not null default now()
);

create table leave_feedback (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('bug', 'feature')),
  text text not null,
  page text,
  status text not null default 'open' check (status in ('open', 'resolved')),
  by_person uuid references people (id) on delete set null,
  by_name text,
  by_email text,
  user_agent text,
  created_at timestamptz not null default now()
);

create table leave_pending_logins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users (id) on delete cascade,
  email text not null,
  name text,
  created_at timestamptz not null default now()
);

-- Sent-mail log (LeaveFlow `outbox`) — the audit trail behind "did the
-- attending actually get the approval email?".
create table leave_outbox (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'email',
  to_addr text not null,
  to_name text,
  subject text,
  body text,
  kind text,
  attachments jsonb,
  created_at timestamptz not null default now()
);

create index leave_outbox_created_idx on leave_outbox (created_at desc);

-- ---------------------------------------------------------------------------
-- WrightRecord (rec_*)
-- ---------------------------------------------------------------------------

create table rec_reminders (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references people (id) on delete cascade,
  title text not null,
  description text,
  category text not null,
  recurring boolean not null default false,
  interval_months int,
  due_date date not null,
  last_completed_date date,
  notify_days_before text not null default '',
  active boolean not null default true,
  requires_document boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index rec_reminders_resident_idx on rec_reminders (resident_id, active);

-- File bytes stay OUT of Postgres: they live in Supabase Storage (bucket
-- "requirement-documents"), this row is the metadata + storage path.
create table rec_reminder_documents (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references rec_reminders (id) on delete cascade,
  resident_id uuid not null references people (id) on delete cascade,
  filename text not null,
  mime_type text not null,
  size int not null,
  storage_key text not null,
  uploaded_at timestamptz not null default now()
);

create table rec_notification_log (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references rec_reminders (id) on delete cascade,
  channel text not null check (channel in ('EMAIL', 'PUSH', 'SMS')),
  offset_days int not null,
  due_date_snapshot date not null,
  sent_at timestamptz not null default now()
);

create table rec_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references people (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create table rec_nfc_tags (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  uid text not null unique,
  meta_key_hex text not null,
  file_read_key_hex text not null,
  last_counter bigint not null default -1,
  active boolean not null default true,
  allow_unverified boolean not null default false,
  created_at timestamptz not null default now()
);

create table rec_attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date date not null,
  start_time text not null,          -- "13:00" local, matches existing logic
  check_in_window_minutes int not null default 30,
  tag_id uuid references rec_nfc_tags (id) on delete set null,
  created_at timestamptz not null default now()
);

create index rec_attendance_sessions_date_idx on rec_attendance_sessions (date);

create table rec_attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references rec_attendance_sessions (id) on delete cascade,
  resident_id uuid not null references people (id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  method text not null check (method in ('nfc', 'manual')),
  tag_counter bigint,
  ip text,
  user_agent text,
  device_id text,
  unique (session_id, resident_id)
);

create index rec_attendance_records_resident_idx on rec_attendance_records (resident_id);

create table rec_duty_hours_reports (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references people (id) on delete cascade,
  month text not null,               -- YYYY-MM
  entries jsonb not null default '[]'::jsonb,  -- DutyHourEntry[]
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  source_snapshot_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (resident_id, month)
);

create table rec_duty_hours_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  resident_id uuid not null references people (id) on delete cascade,
  month text not null,
  expires_at timestamptz not null,
  last_emailed_at timestamptz,
  email_sent_count int not null default 0,
  sms_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table rec_evaluation_requests (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,        -- the emailed link token
  kind text not null check (kind in ('teaching', 'competency')),
  resident_id uuid not null references people (id) on delete cascade,
  attending_id uuid not null references people (id) on delete cascade,
  service text,
  created_at timestamptz not null default now(),
  emailed_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null
);

-- Ratings are anonymous to the rated party: the rater stays on the row for
-- de-dup/audit but is NEVER exposed through the apps' report queries.
create table rec_teaching_ratings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references rec_evaluation_requests (id) on delete cascade,
  attending_id uuid not null references people (id) on delete cascade,  -- rated
  resident_id uuid not null references people (id) on delete cascade,  -- rater
  score int not null check (score between 1 and 5),
  created_at timestamptz not null default now()
);

create table rec_competency_ratings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references rec_evaluation_requests (id) on delete cascade,
  resident_id uuid not null references people (id) on delete cascade,   -- rated
  attending_id uuid not null references people (id) on delete cascade,  -- rater
  scores jsonb not null,             -- { competencyArea: 1-5, ... }
  created_at timestamptz not null default now()
);

create table rec_ip_geo_cache (
  ip text primary key,
  ok boolean not null,
  city text,
  region text,
  country text,
  lat double precision,
  lon double precision,
  fetched_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Per-app singleton settings + misc small state (pace reminders, reminder
-- prefs, ics tokens, clock offsets...). One JSONB row per app keeps every
-- "settings" shape working unchanged.
-- ---------------------------------------------------------------------------
create table app_state (
  app text not null check (app in ('leave', 'rec')),
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (app, key)
);

-- ---------------------------------------------------------------------------
-- Row-level security
--   Model: signed-in residents see the roster and their own rows; admins see
--   everything. All token-link/cron/NFC writes go through the apps' server
--   code with the service-role key (bypasses RLS by design). Browser writes
--   are limited to what residents legitimately self-serve.
-- ---------------------------------------------------------------------------
alter table people enable row level security;
alter table leave_schedule enable row level security;
alter table leave_requests enable row level security;
alter table leave_call_nights enable row level security;
alter table leave_weekend_coverage enable row level security;
alter table leave_trades enable row level security;
alter table leave_feedback enable row level security;
alter table leave_pending_logins enable row level security;
alter table leave_outbox enable row level security;
alter table rec_reminders enable row level security;
alter table rec_reminder_documents enable row level security;
alter table rec_notification_log enable row level security;
alter table rec_push_subscriptions enable row level security;
alter table rec_nfc_tags enable row level security;
alter table rec_attendance_sessions enable row level security;
alter table rec_attendance_records enable row level security;
alter table rec_duty_hours_reports enable row level security;
alter table rec_duty_hours_tokens enable row level security;
alter table rec_evaluation_requests enable row level security;
alter table rec_teaching_ratings enable row level security;
alter table rec_competency_ratings enable row level security;
alter table rec_ip_geo_cache enable row level security;
alter table app_state enable row level security;

-- Roster: any signed-in person can read it (both apps show names/schedules
-- program-wide); only admins change it.
create policy people_read on people
  for select using (auth.uid() is not null);
create policy people_admin_write on people
  for all using (current_person_is_admin());

-- Program-wide readable, admin-writable (visible boards/schedules).
create policy leave_schedule_read on leave_schedule
  for select using (auth.uid() is not null);
create policy leave_schedule_admin on leave_schedule
  for all using (current_person_is_admin());
create policy weekend_coverage_read on leave_weekend_coverage
  for select using (auth.uid() is not null);
create policy weekend_coverage_admin on leave_weekend_coverage
  for all using (current_person_is_admin());
create policy call_nights_read on leave_call_nights
  for select using (auth.uid() is not null);
create policy call_nights_admin on leave_call_nights
  for all using (current_person_is_admin());
create policy attendance_sessions_read on rec_attendance_sessions
  for select using (auth.uid() is not null);
create policy attendance_sessions_admin on rec_attendance_sessions
  for all using (current_person_is_admin());

-- Leave requests: the program-wide calendar means everyone signed-in can read;
-- residents create their own and can cancel (update) their own; admins all.
create policy leave_requests_read on leave_requests
  for select using (auth.uid() is not null);
create policy leave_requests_insert_own on leave_requests
  for insert with check (requester_id = current_person_id());
create policy leave_requests_update_own on leave_requests
  for update using (requester_id = current_person_id() or current_person_is_admin());
create policy leave_requests_admin_delete on leave_requests
  for delete using (current_person_is_admin());

-- Trades: visible to all, created by owner, accepted by anyone signed-in.
create policy trades_read on leave_trades
  for select using (auth.uid() is not null);
create policy trades_insert_own on leave_trades
  for insert with check (resident_id = current_person_id());
create policy trades_update on leave_trades
  for update using (auth.uid() is not null);
create policy trades_admin_delete on leave_trades
  for delete using (current_person_is_admin());

-- Feedback: anyone signed-in can file; admins manage.
create policy feedback_insert on leave_feedback
  for insert with check (auth.uid() is not null);
create policy feedback_admin on leave_feedback
  for all using (current_person_is_admin());

-- Own-rows-only tables.
create policy reminders_own on rec_reminders
  for all using (resident_id = current_person_id() or current_person_is_admin());
create policy reminder_docs_own on rec_reminder_documents
  for all using (resident_id = current_person_id() or current_person_is_admin());
create policy duty_hours_own on rec_duty_hours_reports
  for all using (resident_id = current_person_id() or current_person_is_admin());
create policy push_subs_own on rec_push_subscriptions
  for all using (person_id = current_person_id() or current_person_is_admin());
create policy attendance_records_own_read on rec_attendance_records
  for select using (resident_id = current_person_id() or current_person_is_admin());

-- Admin-only tables (everything else is service-role/server-side only):
create policy outbox_admin on leave_outbox
  for select using (current_person_is_admin());
create policy pending_logins_admin on leave_pending_logins
  for all using (current_person_is_admin());
create policy nfc_tags_admin on rec_nfc_tags
  for all using (current_person_is_admin());
create policy attendance_records_admin on rec_attendance_records
  for all using (current_person_is_admin());
create policy notification_log_admin on rec_notification_log
  for select using (current_person_is_admin());
create policy eval_requests_admin on rec_evaluation_requests
  for all using (current_person_is_admin());
create policy app_state_admin on app_state
  for all using (current_person_is_admin());
-- rec_teaching_ratings / rec_competency_ratings / rec_duty_hours_tokens /
-- rec_ip_geo_cache: no policies on purpose — service-role only, so rater
-- identities and token secrets are unreachable from any browser session.

-- ---------------------------------------------------------------------------
-- Storage bucket for requirement documents (private; served via signed URLs
-- generated server-side after an ownership check).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('requirement-documents', 'requirement-documents', false)
on conflict (id) do nothing;
