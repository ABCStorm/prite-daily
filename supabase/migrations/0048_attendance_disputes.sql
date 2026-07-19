-- Residents can dispute a session marked as a miss; the dispute routes to the
-- attendance admin (Dhara Patel) and is tracked to resolution.
create table rec_attendance_disputes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references rec_attendance_sessions (id) on delete cascade,
  resident_id uuid not null references people (id) on delete cascade,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references people (id),
  unique (session_id, resident_id)
);

create index rec_attendance_disputes_resident_idx on rec_attendance_disputes (resident_id);
create index rec_attendance_disputes_status_idx on rec_attendance_disputes (status);

alter table rec_attendance_disputes enable row level security;
-- Residents see/create their own; admins manage all. (WrightRecord accesses
-- this table server-side with the service-role key, so these policies are a
-- backstop, consistent with the rest of the rec_* tables.)
create policy disputes_own on rec_attendance_disputes
  for select using (resident_id = current_person_id() or current_person_is_admin());
create policy disputes_insert_own on rec_attendance_disputes
  for insert with check (resident_id = current_person_id());
create policy disputes_admin on rec_attendance_disputes
  for all using (current_person_is_admin());
