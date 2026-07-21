-- Attendance check-in window can now open BEFORE the session start time, not
-- just run forward from it. Window = [start - opens_before, start + window].
-- Default 0 preserves existing "opens exactly at start" behavior.
alter table rec_attendance_sessions
  add column if not exists check_in_opens_before_minutes int not null default 0;
