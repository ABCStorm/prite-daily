-- WrightRecord port addition to the shared Wright backend (0002).
-- (Numbered 0039 — 0003/0004 were already taken by PRITE Daily migrations.)
--
-- The evaluation pairing generator needs each attending's service list
-- (previously served by Wrightleave's /api/wrighthub/attendings): pairings
-- for a date are residents' leave_schedule assignments matched against these
-- services. 0002 had no home for it, so it lives on the shared roster row.
alter table people add column if not exists services jsonb not null default '[]'::jsonb;

comment on column people.services is
  'For role=attending: rotation/service names this attending covers (e.g. ["MVH Inpt","CL"]). Matched against leave_schedule.assignment to build resident-attending evaluation pairings.';
