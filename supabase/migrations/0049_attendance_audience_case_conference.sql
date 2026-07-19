-- Per-resident attendance targeting + case-conference groups + session rooms/topics.
-- (The one-time data enrichment — audience/room/topic UPDATEs, Board Review inserts,
-- and case-conference assignment from the residency's case-conference list — was
-- applied directly to the live DB; this migration is the schema portion of record.)

-- Which case-conference group a resident belongs to (group names match the session
-- titles: 'Baker/Harper','Close/Cuenot','Correll/Peirson','Sanders/Nasr', plus the
-- CAP fellows' 'Harper/Myers').
alter table people add column if not exists case_conference text;

-- Who a session is for, so a resident only sees/gets-counted-for their own sessions:
--   'everyone' | 'R1'|'R2'|'R3'|'R4' | 'fellows' | 'cc:<Group>'
alter table rec_attendance_sessions add column if not exists audience text;

-- Room (best guess from the weekly rundown; room_tentative=true until an admin
-- confirms it) and the didactic topic (from the annual didactics curriculum).
alter table rec_attendance_sessions add column if not exists room text;
alter table rec_attendance_sessions add column if not exists room_tentative boolean not null default false;
alter table rec_attendance_sessions add column if not exists topic text;
