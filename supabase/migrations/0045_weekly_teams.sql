-- ============================================================================
-- Weekly mixer teams: an admin-randomized pairing of residents (balanced one
-- R1 / R2 / R3 / R4-or-fellow per team, same balancing as stable_teams) that
-- persists for the upcoming week's Tuesday didactics until an admin
-- re-randomizes it. Meant to mix people up so residents work with folks they
-- don't usually team with; admins copy the pairing list into the didactics
-- email ahead of time. Same table/RPC shape as stable_teams (0025).
-- ============================================================================
create table if not exists weekly_teams (
  profile_id uuid primary key references profiles (id) on delete cascade,
  team_name  text not null,
  created_at timestamptz not null default now()
);

alter table weekly_teams enable row level security;

-- Everyone approved can read the pairings (they need to find their own team,
-- and the list goes out by email anyway).
drop policy if exists weekly_teams_read on weekly_teams;
create policy weekly_teams_read on weekly_teams for select
  using (is_approved());

-- Writes are admin-only; regeneration goes through the atomic RPC below.
drop policy if exists weekly_teams_write on weekly_teams;
create policy weekly_teams_write on weekly_teams for all
  using (is_admin()) with check (is_admin());

-- Replace the whole week's pairing atomically. `rows` is a jsonb array of
-- {"profile_id": "...", "team_name": "..."} computed client-side.
create or replace function regenerate_weekly_teams(rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;
  -- explicit WHERE: the pg-safeupdate guard on this project rejects bare
  -- DELETEs ("DELETE requires a WHERE clause") even inside functions
  delete from weekly_teams where true;
  insert into weekly_teams (profile_id, team_name)
  select (r->>'profile_id')::uuid, r->>'team_name'
  from jsonb_array_elements(rows) as r;
end $$;

grant execute on function regenerate_weekly_teams(jsonb) to authenticated;
