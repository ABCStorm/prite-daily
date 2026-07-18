-- Roster includes fellows/chiefs at PGY-5/6; the 1-4 check in 0039 was wrong.
alter table people drop constraint people_pgy_check;
alter table people add constraint people_pgy_check check (pgy between 1 and 8);
