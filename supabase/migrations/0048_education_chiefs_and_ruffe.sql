-- 0048: education-chief flag + untangle the three Samanthas.
--
-- 1) profiles.is_education_chief — togglable from the admin Approvals panel.
--    Education chiefs stay approved residents but are excluded from the
--    season/weekly team randomizers (they run the sessions, they don't play).
--
-- 2) Migration 0024 renamed roster_names Courtney→Peralta on the assumption
--    that Peralta was Samantha Courtney's married name. Wrong person:
--    "Samantha Peralta" is Samantha RUFFE's account name, and Samantha
--    Courtney is a distinct resident. Revert the roster entry to Courtney
--    (Ruffe already has her own roster row), rename the Peralta profile to
--    Samantha Ruffe, restore her R4 training level (it was nulled when the
--    account was thought to be a duplicate), and seat her in stable Team 5 —
--    the seat pre-announced for Ruffe, and the one team still missing an R4.

alter table profiles add column if not exists is_education_chief boolean not null default false;

update roster_names set last_name = 'Courtney'
  where first_name = 'Samantha' and last_name = 'Peralta';

update profiles set full_name = 'Samantha Ruffe', training_level = 'R4'
  where email = 'samanthaperalta.914@gmail.com';

update stable_teams set team_name = 'Team 5'
  where profile_id = (select id from profiles where email = 'samanthaperalta.914@gmail.com');
