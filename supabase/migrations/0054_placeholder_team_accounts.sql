-- ============================================================================
-- Placeholder accounts for the 9 residents who hadn't signed into the app yet,
-- so they show up in the season/weekly team randomizer instead of only being a
-- suggested seat (PLANNED_TEAMS). Plus three data fixes that would otherwise be
-- done by hand in the admin Approvals panel.
--
-- WHY placeholders and not their real emails: profiles.id is a FK to
-- auth.users(id), so a randomizer-eligible profile needs an auth user. We give
-- each placeholder a synthetic, non-@wright.edu email so it can NEVER collide
-- with (or lock out) the resident's real Google sign-in. The placeholder simply
-- holds the team seat; once the real person signs in, an admin moves their real
-- account onto the seat and deletes the placeholder (see rollback note below).
--
-- Idempotent: re-running skips any placeholder whose email already exists.
--
-- ROLLBACK (removes all placeholders; cascades to profiles/stable_teams):
--   delete from auth.users where email like 'placeholder+%@quizapine.local';
-- ============================================================================

do $$
declare
  rec record;
  uid uuid;
begin
  for rec in
    select * from (values
      -- name,                level, team,      synthetic email
      ('Holland Arnold',      'R1', 'Team 1',  'placeholder+holland.arnold@quizapine.local'),
      ('Emily Murphy',        'R1', 'Team 2',  'placeholder+emily.murphy@quizapine.local'),
      ('James Pike',          'R1', 'Team 4',  'placeholder+james.pike@quizapine.local'),
      ('Joseph Griffin',      'R2', 'Team 9',  'placeholder+joseph.griffin@quizapine.local'),
      ('Logan Heckart',       'R2', 'Team 11', 'placeholder+logan.heckart@quizapine.local'),
      ('Adam Quinn',          'R2', 'Team 10', 'placeholder+adam.quinn@quizapine.local'),
      ('Geoffrey McLatchey',  'R3', 'Team 8',  'placeholder+geoffrey.mclatchey@quizapine.local'),
      ('Needa Toofanny',      'R3', 'Team 9',  'placeholder+needa.toofanny@quizapine.local'),
      ('Sierrah Hawkins',     'R3', 'Team 10', 'placeholder+sierrah.hawkins@quizapine.local'),
      ('Ryan Bernal',         'R4', 'Team 3',  'placeholder+ryan.bernal@quizapine.local')
    ) as t(full_name, level, team, email)
  loop
    -- idempotent: skip if this placeholder already exists
    if exists (select 1 from auth.users where email = rec.email) then
      continue;
    end if;
    -- don't duplicate a resident who already has a real account (they may have
    -- signed in since this was written); match on display name
    if exists (
      select 1 from profiles
      where full_name ilike rec.full_name and email not like 'placeholder+%'
    ) then
      continue;
    end if;

    uid := gen_random_uuid();

    -- Creating the auth user fires handle_new_user(), which inserts the profile
    -- (and a settings row) automatically.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin
    ) values (
      '00000000-0000-0000-0000-000000000000', uid,
      'authenticated', 'authenticated', rec.email, null,
      now(), now(), now(),
      '{"provider":"placeholder","providers":["placeholder"]}'::jsonb,
      jsonb_build_object('full_name', rec.full_name),
      false
    );

    -- Force approved/resident/level rather than relying on the roster
    -- name-match (the trigger may have left them pending).
    update profiles
       set status = 'approved'::user_status,
           role = 'resident',
           training_level = rec.level
     where id = uid;

    -- Seat them on their pre-announced team.
    insert into stable_teams (profile_id, team_name)
    values (uid, rec.team)
    on conflict (profile_id) do update set team_name = excluded.team_name;
  end loop;
end $$;

-- --- Admin-panel data fixes (the "option b" flag flips) ---------------------
-- Matched by display name; verify these hit exactly one row each before push.

-- Matthew Correll is a test account -> keep it out of the randomizer/editor.
update profiles set role = 'test'
where full_name ilike 'Matthew Correll';

-- Daniel Abramson is an alumnus -> drop out of the resident pool.
update profiles set role = 'alumni', training_level = null
where full_name ilike 'Daniel Abramson';

-- Bridget Daughton is an R2 (the team list had her as R1).
update profiles set training_level = 'R2'
where full_name ilike 'Bridget Daughton';
