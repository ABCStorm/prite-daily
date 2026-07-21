-- ============================================================================
-- Who/when for the weekly mixer pairing (0045): a singleton row tracking the
-- last randomization, so the Host-poll modal can show "randomized <date> by
-- <name>" instead of just a bare count. Separate from weekly_teams itself so
-- it survives being read even if a future admin wants to clear the roster
-- without losing the attribution history (only the latest is kept, though).
-- ============================================================================
create table if not exists weekly_teams_meta (
  id           boolean primary key default true check (id),  -- singleton row
  generated_at timestamptz,
  generated_by uuid references profiles (id) on delete set null
);

alter table weekly_teams_meta enable row level security;

drop policy if exists weekly_teams_meta_read on weekly_teams_meta;
create policy weekly_teams_meta_read on weekly_teams_meta for select
  using (is_approved());

drop policy if exists weekly_teams_meta_write on weekly_teams_meta;
create policy weekly_teams_meta_write on weekly_teams_meta for all
  using (is_admin()) with check (is_admin());

-- Record who ran it and when, every time the pairing is regenerated.
create or replace function regenerate_weekly_teams(rows jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'admin only';
  end if;
  delete from weekly_teams where true;
  insert into weekly_teams (profile_id, team_name)
  select (r->>'profile_id')::uuid, r->>'team_name'
  from jsonb_array_elements(rows) as r;

  insert into weekly_teams_meta (id, generated_at, generated_by)
  values (true, now(), auth.uid())
  on conflict (id) do update set generated_at = excluded.generated_at, generated_by = excluded.generated_by;
end $$;

grant execute on function regenerate_weekly_teams(jsonb) to authenticated;
