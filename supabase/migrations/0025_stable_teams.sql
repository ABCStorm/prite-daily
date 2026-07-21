-- ============================================================================
-- Stable (season-long) poll teams: an admin-generated roster of one R1, one
-- R2, one R3, and one R4-or-fellow per team, which stays the same across
-- every "Host poll" session (unlike the per-session self-pick or auto-assign
-- modes) until an admin regenerates it — typically once a year, right after
-- the PRITE, for the new cohort. See lib/poll.ts (stableTeamLevel,
-- assignBalancedTeams) for how the roster is computed client-side; this table
-- just persists the result.
-- ============================================================================
create table if not exists stable_teams (
  profile_id uuid primary key references profiles (id) on delete cascade,
  team_name  text not null,
  created_at timestamptz not null default now()
);

alter table stable_teams enable row level security;

-- Any approved member can see the whole roster (team names + pairings aren't
-- sensitive, and a participant needs to look up their own team).
drop policy if exists stable_teams_read on stable_teams;
create policy stable_teams_read on stable_teams for select
  using (is_approved());

-- Direct table writes are admin-only; in practice everything goes through the
-- regenerate_stable_teams() RPC below so a regen can't leave the table half
-- wiped, but these policies still gate any other write path.
drop policy if exists stable_teams_write on stable_teams;
create policy stable_teams_write on stable_teams for all
  using (is_admin()) with check (is_admin());

-- Replace the entire roster atomically. `rows` is a jsonb array of
-- {"profile_id": "...", "team_name": "..."} objects computed client-side.
create or replace function regenerate_stable_teams(rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;
  -- explicit WHERE: the pg-safeupdate guard rejects bare DELETEs (see 0045)
  delete from stable_teams where true;
  insert into stable_teams (profile_id, team_name)
  select (r->>'profile_id')::uuid, r->>'team_name'
  from jsonb_array_elements(rows) as r;
end $$;

grant execute on function regenerate_stable_teams(jsonb) to authenticated;
