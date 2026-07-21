-- Elective request workflow (WrightRecord): resident prepares the Appendix C
-- elective request, the site emails the faculty supervisor a token link, and
-- the supervisor approves/declines with one click — no sign-in.
create table if not exists rec_elective_requests (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references people(id) on delete cascade,
  elective_title text not null,
  supervisor_name text not null,
  supervisor_email text not null default '',
  start_date date not null,
  end_date date not null,
  hours_per_week text,
  notes text,
  -- draft | sent | approved | conditional | declined
  status text not null default 'draft',
  token uuid not null default gen_random_uuid(),
  -- Optional resident-uploaded copy of the filled form (Supabase Storage key,
  -- same bucket as requirement documents).
  form_storage_key text,
  form_filename text,
  decision_note text,
  sent_at timestamptz,
  last_reminded_at timestamptz,
  reminder_count int not null default 0,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rec_elective_requests_token_idx on rec_elective_requests (token);
create index if not exists rec_elective_requests_resident_idx on rec_elective_requests (resident_id);

alter table rec_elective_requests enable row level security;
-- Service-role only (same convention as the other rec_* tables): no policies,
-- authorization lives in the route handlers.
